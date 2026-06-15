/**
 * loop-dag.js - Worktree-isolated round execution for the DAG loop pattern.
 *
 * scripts/loop.js keeps the loop orchestration (round budget, stop
 * conditions, finalize); this module owns one round of the isolated-worktree
 * dag pattern: pick the ready/resumable epics, expand each to its own
 * worktree, spawn a session in that worktree's cwd, and merge the successful
 * ones back to base (aborting + blocking on conflict).
 *
 * `buildTaskPrompt` is injected by the caller rather than imported here — it
 * lives in loop.js and is shared with the sequential pattern, so injecting it
 * keeps the loop.js → loop-dag.js dependency one-directional.
 */

const { spawnSessionAsync } = require('./loop-session');
const { saveLoopState, recordError } = require('./loop-state');
const { getTimestamp } = require('./utils');

/**
 * Warn when the loop runs directly on main/master. Merge-back lands epic
 * branches into the current branch, so an unattended dag loop on main pushes
 * integrate commits straight onto the trunk — worth flagging once at start.
 * @param {Coordinator} coord - Coordinator (provides _runGit at projectRoot)
 */
function warnIfBaseBranch(coord) {
  const result = coord._runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = result.exitCode === 0 ? result.stdout.trim() : '';
  if (branch === 'main' || branch === 'master') {
    console.log(
      `[loop] WARNING: running dag loop on "${branch}" — epic merge-back commits will land ` +
        'directly on this branch. Consider running from a feature/integration branch.',
    );
  }
}

/**
 * Select the epics to run as isolated worktree sessions this round.
 * Resumable IN_PROGRESS epics that already have a worktree come first
 * (interrupted overnight runs would otherwise be invisible — parallelTasks
 * only returns PENDING), then ready PENDING epics fill the batch up to the
 * concurrency cap.
 * @param {Coordinator} coord - Coordinator instance
 * @param {string|null} epicScope - Optional single-epic scope
 * @param {number} maxParallel - Concurrency cap for the round
 * @returns {{ epic: Object, resume: boolean }[]} Batch entries
 */
function selectRoundEpics(coord, epicScope, maxParallel) {
  const inScope = (e) => epicScope === null || e.id === epicScope;
  const resumable = coord.dag.epics
    .filter((e) => e.status === 'in_progress' && e.worktree && inScope(e))
    .map((epic) => ({ epic, resume: true }));
  const ready = coord.parallelTasks(epicScope).map((epic) => ({ epic, resume: false }));
  return [...resumable, ...ready].slice(0, maxParallel);
}

/**
 * Expand a PENDING epic to its isolated worktree (with optional project
 * setup). On any expand/setup failure the epic is blocked rather than
 * aborting the whole loop, and the worktree (if created) is retained for
 * inspection. Resumable epics already have a worktree — their path is just
 * resolved.
 * @param {Coordinator} coord - Coordinator instance
 * @param {{ epic: Object, resume: boolean }} entry - Batch entry
 * @param {Object} state - Loop state (for error recording)
 * @param {boolean} projectSetup - Run the per-worktree installer
 * @returns {string|null} Absolute worktree path, or null when blocked
 */
function prepareEpicWorktree(coord, entry, state, projectSetup) {
  const { epic, resume } = entry;
  if (resume) {
    console.log(`[loop] Resuming in-progress epic ${epic.id} in existing worktree`);
    return coord._resolveWorktreePath(epic.worktree);
  }
  try {
    coord.expandWorktrees({ epicId: epic.id, projectSetup });
    return coord._resolveWorktreePath(epic.id);
  } catch (err) {
    console.error(`[loop] Epic ${epic.id} worktree setup failed: ${err.message}`);
    recordError(state, epic.id, err.message, 1);
    state.failed_tasks.push(epic.id);
    try {
      coord.blockTask(epic.id, `Loop: worktree setup failed — ${err.message}`);
    } catch (blockErr) {
      console.error(`[loop] Warning: could not block task ${epic.id}: ${blockErr.message}`);
    }
    return null;
  }
}

/**
 * Integrate a successful epic session: merge its branch back to base,
 * mark it complete, and clean up the worktree. A merge conflict triggers
 * a WT-5 base abort (so the base never sits half-merged overnight) and
 * blocks the epic; its worktree is retained for the human to resolve.
 * @param {Coordinator} coord - Coordinator instance
 * @param {Object} epic - Epic that completed
 * @param {Object} state - Loop state
 * @returns {boolean} Whether the epic was integrated successfully
 */
function integrateEpic(coord, epic, state) {
  try {
    coord.mergeEpics({ epicIds: [epic.id] });
  } catch (mergeErr) {
    console.error(`[loop] Merge conflict integrating ${epic.id}: ${mergeErr.message}`);
    try {
      coord.abortMerge();
    } catch (abortErr) {
      console.error(`[loop] Warning: merge --abort failed for ${epic.id}: ${abortErr.message}`);
    }
    recordError(state, epic.id, mergeErr.message, 1);
    state.failed_tasks.push(epic.id);
    try {
      coord.blockTask(epic.id, `Loop: merge conflict — ${mergeErr.message}`);
    } catch (blockErr) {
      console.error(`[loop] Warning: could not block task ${epic.id}: ${blockErr.message}`);
    }
    return false;
  }

  try {
    coord.completeTask(epic.id);
    coord.cleanupWorktrees({ epicIds: [epic.id] });
    state.completed_tasks.push(epic.id);
    state.last_progress_at = getTimestamp();
    console.log(`[loop] Epic ${epic.id} integrated and completed`);
    return true;
  } catch (err) {
    console.error(`[loop] Warning: post-merge DAG update failed for ${epic.id}: ${err.message}`);
    return false;
  }
}

/**
 * Run one isolated-worktree round: expand each batch epic, spawn a session
 * in its worktree, and integrate the successful ones. Returns whether any
 * epic made progress.
 * @param {Coordinator} coord - Coordinator instance
 * @param {{ epic: Object, resume: boolean }[]} batch - Round batch
 * @param {Object} state - Loop state
 * @param {Object} options - Loop options (projectRoot, projectSetup, spawn flags)
 * @param {Function} buildTaskPrompt - (task, coord, projectRoot, workspaceRoot)=>string
 * @returns {Promise<boolean>} Whether any epic was integrated this round
 */
async function runDagRound(coord, batch, state, options, buildTaskPrompt) {
  const { projectRoot, projectSetup } = options;

  // Phase 1: prepare worktrees (sequential — expand mutates the DAG under a
  // lock and can't safely overlap). Blocked epics drop out of the spawn set.
  const live = [];
  for (const entry of batch) {
    const worktreePath = prepareEpicWorktree(coord, entry, state, projectSetup);
    if (worktreePath) live.push({ epic: entry.epic, worktreePath });
  }
  if (live.length === 0) {
    saveLoopState(state, projectRoot);
    return false;
  }

  // Phase 2: spawn each session in ITS OWN worktree cwd, concurrently. The
  // prompt's Project Root points at the worktree so the headless session
  // works there — never the base.
  const spawnResults = await Promise.all(
    live.map(({ epic, worktreePath }) =>
      spawnSessionAsync(
        buildTaskPrompt(epic, coord, projectRoot, worktreePath),
        worktreePath,
        options,
      ),
    ),
  );

  // Phase 3: integrate sequentially (DAG + git updates are not concurrent-safe).
  let anySuccess = false;
  for (let i = 0; i < live.length; i++) {
    const { epic } = live[i];
    const result = spawnResults[i];
    state.total_cost += result.costUsd;

    if (result.exitCode !== 0) {
      console.log(`[loop] Epic ${epic.id} session failed`);
      recordError(state, epic.id, result.stderr, 1);
      state.failed_tasks.push(epic.id);
      try {
        coord.blockTask(epic.id, 'Loop: session failed in worktree batch');
      } catch (err) {
        console.error(`[loop] Warning: could not block task ${epic.id}: ${err.message}`);
      }
      continue;
    }
    if (integrateEpic(coord, epic, state)) anySuccess = true;
  }

  saveLoopState(state, projectRoot);
  return anySuccess;
}

module.exports = {
  warnIfBaseBranch,
  selectRoundEpics,
  prepareEpicWorktree,
  integrateEpic,
  runDagRound,
};
