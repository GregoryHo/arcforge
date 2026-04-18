/**
 * coordinator.js - Core coordinator for arcforge DAG
 *
 * Manages the DAG lifecycle: task scheduling, status tracking,
 * worktree management, and synchronization.
 *
 * Mirrors Python coordinator.py functionality.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DAG, Feature, BlockedItem, SyncResult, TaskStatus } = require('./models');
const { parseDagYaml, stringifyDagYaml } = require('./yaml-parser');
const { withLock } = require('./locking');
const { getDefaultTestCommand, getDefaultInstallCommand } = require('./package-manager');
const { objectToYaml, normalizeStatus } = require('./dag-schema');
const { getWorktreeRoot, getWorktreePath, parseWorktreePath } = require('./worktree-paths');

// Lock timeouts for DAG transactions that include slow git operations.
// Default withLock timeout is 5s; these accommodate heavier workloads.
const EXPAND_LOCK_TIMEOUT = 30000; // git worktree add + fs ops
const MERGE_LOCK_TIMEOUT = 60000; // git merge can be slow on large repos

/**
 * Read the `.arcforge-epic` marker from a directory, returning the parsed
 * object or null if the file is missing / unreadable. The marker schema
 * carries at least `{ epic, spec_id, base_worktree, base_branch, local }`
 * when authored by `expandWorktrees`.
 *
 * Shared by `Coordinator.dagPath`, `Coordinator._inferEpicIdFromWorktree`,
 * and `cli.resolveSpecId` — the worktree marker is the single source of
 * truth linking a checkout back to its spec-id, so all three callers
 * must stay in lockstep on how they parse it.
 *
 * @param {string} dir - Directory containing the marker (typically projectRoot).
 * @returns {Object|null} parsed marker or null
 */
function readArcforgeMarker(dir) {
  const markerPath = path.join(dir, '.arcforge-epic');
  if (!fs.existsSync(markerPath)) return null;
  try {
    return parseDagYaml(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Coordinator class - manages DAG operations for a single spec
 *
 * Each Coordinator instance is scoped to exactly one spec. The dag.yaml
 * path is lazy-resolved on first access via priority: explicit specId →
 * `.arcforge-epic` marker in cwd → throw with actionable message.
 *
 * Cross-spec aggregations (multi-spec sync / reboot) are module-level
 * functions (syncAllSpecs, rebootAllSpecs) rather than instance methods,
 * because they deliberately do not belong to a single-spec scope.
 */
class Coordinator {
  /**
   * @param {string} projectRoot - Project root directory
   * @param {string|null} [specId=null] - Spec id. When null, resolved lazily
   *   from `.arcforge-epic` marker on first dagPath/DAG access.
   */
  constructor(projectRoot, specId = null) {
    this.projectRoot = path.resolve(projectRoot);
    this.specId = specId;
    this._dagPath = null; // lazy — resolved on first access
    this._dag = null;
  }

  /**
   * Lazy dag.yaml path. Resolves on first access and caches the result.
   * Resolution priority:
   *   1. Explicit specId from constructor → `specs/<specId>/dag.yaml`
   *   2. `.arcforge-epic` marker in projectRoot → spec_id field (also
   *      populates this.specId as a side-effect so subsequent reads of
   *      `coord.specId` return the inferred value)
   *   3. Throw with migration guidance.
   *
   * Kept lazy so pure utilities (_findBaseWorktree, _isInWorktree,
   * multi-spec CLI probes) that never touch the DAG don't force a throw.
   */
  get dagPath() {
    if (this._dagPath !== null) return this._dagPath;
    if (!this.specId) {
      const marker = readArcforgeMarker(this.projectRoot);
      if (marker?.spec_id) this.specId = marker.spec_id;
    }
    if (!this.specId) {
      throw new Error(
        'Cannot resolve dag.yaml path: no specId provided and .arcforge-epic has no spec_id. ' +
          'Pass specId explicitly, run from a v2 worktree, or run `arcforge backfill-markers` on legacy worktrees.',
      );
    }
    this._dagPath = path.join(this.projectRoot, 'specs', this.specId, 'dag.yaml');
    return this._dagPath;
  }

  /**
   * Get the DAG, loading from file if needed
   * @returns {DAG} The DAG instance
   */
  get dag() {
    if (this._dag === null) {
      this._dag = this._loadDag();
    }
    return this._dag;
  }

  /**
   * Get status of all epics and blocked items
   * @param {Object} options - Status options
   * @param {boolean} [options.blockedOnly=false] - Only show blocked items
   * @returns {Object} Status object
   */
  status(options = {}) {
    const { blockedOnly = false } = options;

    const epics = [];
    for (const epic of this.dag.epics) {
      if (blockedOnly && epic.status !== TaskStatus.BLOCKED) {
        continue;
      }
      epics.push({
        id: epic.id,
        name: epic.name,
        status: epic.status,
        progress: epic.completionRatio(),
        worktree: epic.worktree,
        features: epic.features.map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
        })),
      });
    }

    return {
      epics,
      blocked: this.dag.blocked.map((b) => ({
        task_id: b.task_id,
        reason: b.reason,
      })),
    };
  }

  /**
   * Get the next task to work on
   * Priority: in-progress feature > ready feature > ready epic
   * @returns {Feature|Epic|null} The next task or null
   */
  nextTask(epicId = null) {
    const completedEpics = this.dag.getCompletedEpics();
    const epics = epicId ? this.dag.epics.filter((e) => e.id === epicId) : this.dag.epics;

    // First, check for in-progress features
    for (const epic of epics) {
      if (epic.status === TaskStatus.IN_PROGRESS) {
        for (const feature of epic.features) {
          if (feature.status === TaskStatus.IN_PROGRESS) {
            return feature;
          }
        }
      }
    }

    // Second, check for ready features in in-progress epics
    for (const epic of epics) {
      if (epic.status === TaskStatus.IN_PROGRESS) {
        const completedFeatures = this.dag.getCompletedFeatures(epic.id);
        for (const feature of epic.features) {
          if (feature.status === TaskStatus.PENDING && feature.isReady(completedFeatures)) {
            return feature;
          }
        }
      }
    }

    // Third, check for ready epics
    for (const epic of epics) {
      if (epic.status === TaskStatus.PENDING && epic.isReady(completedEpics)) {
        return epic;
      }
    }

    return null;
  }

  /**
   * Get all epics that can be worked on in parallel
   * @param {string|null} [epicId=null] - If set, only consider this epic
   * @returns {Epic[]} List of ready epics
   */
  parallelTasks(epicId = null) {
    const completedEpics = this.dag.getCompletedEpics();
    return this.dag.epics.filter(
      (epic) =>
        epic.status === TaskStatus.PENDING &&
        epic.isReady(completedEpics) &&
        (epicId === null || epic.id === epicId),
    );
  }

  /**
   * Mark a task as completed
   * @param {string} taskId - Task ID to complete
   */
  completeTask(taskId) {
    const task = this.dag.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = TaskStatus.COMPLETED;

    // If feature, update parent epic status
    if (task instanceof Feature) {
      for (const epic of this.dag.epics) {
        if (epic.features.some((f) => f.id === taskId)) {
          if (epic.features.every((f) => f.status === TaskStatus.COMPLETED)) {
            epic.status = TaskStatus.COMPLETED;
          } else if (epic.status === TaskStatus.PENDING) {
            epic.status = TaskStatus.IN_PROGRESS;
          }
          break;
        }
      }
    }

    this._saveDag();
  }

  /**
   * Mark a task as blocked
   * @param {string} taskId - Task ID to block
   * @param {string} reason - Reason for blocking
   */
  blockTask(taskId, reason) {
    const task = this.dag.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = TaskStatus.BLOCKED;
    this.dag.blocked.push(
      new BlockedItem({
        task_id: taskId,
        reason: reason,
        blocked_at: new Date(),
      }),
    );
    this._saveDag();
  }

  /**
   * Expand worktrees for ready epics, or a single epic when epicId is supplied.
   *
   * Worktrees are created at the canonical location computed by
   * worktree-paths.js (~/.arcforge/worktrees/<project>-<hash>-<epic>/).
   *
   * @param {Object} options - Expand options
   * @param {string} [options.epicId] - Single-epic mode: only expand this epic
   * @param {boolean} [options.verify=false] - Run tests after creation
   * @param {string[]} [options.verifyCommand] - Custom test command
   * @param {boolean} [options.projectSetup=false] - Auto-detect and run installer
   * @returns {Epic[]} List of epics with newly created worktrees
   */
  expandWorktrees(options = {}) {
    const { epicId, verify = false, verifyCommand, projectSetup = false } = options;

    // Ensure the .arcforge-epic marker can never enter git staging in
    // any worktree this project has or will have. Idempotent — no-op
    // if already excluded. Must happen before any worktree creates a
    // marker file, so teammate `git add -A` / `git add .` patterns
    // never pick it up.
    this._ensureArcforgeExcluded();

    // Phase 1: DAG mutation + worktree creation under a single lock.
    // Two concurrent expansions on different epics would otherwise race:
    // both load the dag, both set their own epic.worktree/epic.status,
    // and the second save clobbers the first.
    const { created, createdPaths } = this._dagTransaction(
      () => {
        const completedEpics = this.dag.getCompletedEpics();

        let readyEpics;
        if (epicId) {
          const epic = this.dag.getEpic(epicId);
          if (!epic) {
            throw new Error(`Epic not found: ${epicId}`);
          }
          if (epic.status !== TaskStatus.PENDING || !epic.isReady(completedEpics)) {
            const blocking = epic.depends_on.filter((depId) => !completedEpics.has(depId));
            const reason = blocking.length
              ? `waiting on ${blocking.join(', ')}`
              : `status is ${epic.status}`;
            throw new Error(`Epic ${epicId} is not ready to expand: ${reason}`);
          }
          readyEpics = [epic];
        } else {
          readyEpics = this.dag.epics.filter(
            (e) => e.status === TaskStatus.PENDING && e.isReady(completedEpics),
          );
        }

        const createdLocal = [];
        const createdPathsLocal = [];

        if (readyEpics.length === 0) {
          return { created: createdLocal, createdPaths: createdPathsLocal };
        }

        fs.mkdirSync(getWorktreeRoot(), { recursive: true });

        for (const epic of readyEpics) {
          if (epic.worktree) {
            continue;
          }

          const worktreePath = getWorktreePath(this.projectRoot, this.specId, epic.id);
          const result = this._runGit(['worktree', 'add', worktreePath, '-b', epic.id]);
          if (result.exitCode !== 0) {
            throw new Error(`Failed to create worktree for ${epic.id}: ${result.stderr.trim()}`);
          }

          // Create .arcforge-epic marker (spec_id lets sync/merge reconnect
          // the worktree to the correct per-spec dag.yaml at the base.)
          const epicData = {
            epic: epic.id,
            spec_id: this.specId,
            base_worktree: this.projectRoot,
            base_branch: this._currentBranch(),
            local: {
              status: TaskStatus.IN_PROGRESS,
              started_at: new Date().toISOString(),
            },
            synced: null,
          };
          fs.writeFileSync(path.join(worktreePath, '.arcforge-epic'), objectToYaml(epicData));

          epic.worktree = epic.id;
          epic.status = TaskStatus.IN_PROGRESS;
          createdLocal.push(epic);
          createdPathsLocal.push({ epic, worktreePath });
        }

        return { created: createdLocal, createdPaths: createdPathsLocal };
      },
      { timeout: EXPAND_LOCK_TIMEOUT },
    );

    // Phase 2: long-running project setup / test verification OUTSIDE
    // the lock. `npm install` and full test suites can take minutes;
    // holding the DAG lock across them would block every concurrent
    // dispatch operation (merge, sync, expand) for the full duration.
    if (projectSetup) {
      for (const { epic, worktreePath } of createdPaths) {
        const installCmd = getDefaultInstallCommand(worktreePath);
        if (!installCmd) continue;
        const setupResult = this._runSubprocess(worktreePath, installCmd);
        if (setupResult.exitCode !== 0) {
          throw new Error(
            `Project setup failed for ${epic.id} (see output above). Command: ${installCmd.join(' ')}`,
          );
        }
      }
    }

    // Verify with tests if requested
    if (verify) {
      const command = verifyCommand || getDefaultTestCommand(this.projectRoot);
      for (const { epic, worktreePath } of createdPaths) {
        const result = this._runSubprocess(worktreePath, command);
        if (result.exitCode !== 0) {
          throw new Error(
            `Baseline tests failed for ${epic.id} (see output above). Command: ${(Array.isArray(command) ? command : [command]).join(' ')}`,
          );
        }
      }
    }

    return created;
  }

  /**
   * Merge completed epics back to base branch
   * @param {Object} options - Merge options
   * @param {string} [options.baseBranch] - Target branch (default: current)
   * @param {string[]} [options.epicIds] - Specific epic IDs to merge
   * @returns {Epic[]} List of merged epics
   */
  mergeEpics(options = {}) {
    const { baseBranch, epicIds } = options;

    // Try to infer epic ID if in worktree
    let resolvedEpicIds = epicIds;
    const inferredEpic = this._inferEpicIdFromWorktree();
    if (!resolvedEpicIds && inferredEpic) {
      resolvedEpicIds = [inferredEpic];
    }

    // Find base worktree
    const basePath = this._findBaseWorktree();
    if (!basePath) {
      throw new Error('Base worktree not found via git worktree list');
    }

    // If not in base, delegate to base coordinator (inherit specId so
    // the base-side load targets the correct per-spec dag.yaml).
    if (basePath !== this.projectRoot) {
      const baseCoord = new Coordinator(basePath, this.specId);
      return baseCoord._mergeEpicsInBase(baseBranch, resolvedEpicIds);
    }

    return this._mergeEpicsInBase(baseBranch, resolvedEpicIds);
  }

  _mergeEpicsInBase(baseBranch, epicIds) {
    // Serialize the whole read-merge-write under one lock. Git ops can
    // take several seconds on large repos, so bump the lock timeout
    // beyond the 5s default — concurrent teammates will queue cleanly.
    return this._dagTransaction(
      () => {
        let epics;
        if (epicIds) {
          epics = this.dag.epics.filter((e) => epicIds.includes(e.id));
          const missing = epicIds.filter((id) => !epics.some((e) => e.id === id));
          if (missing.length > 0) {
            throw new Error(`Epic not found: ${missing.join(', ')}`);
          }
        } else {
          epics = this.dag.epics.filter((e) => e.status === TaskStatus.COMPLETED);
        }

        if (epics.length === 0) {
          return [];
        }

        const resolvedBranch = baseBranch || this._currentBranch();
        const checkout = this._runGit(['checkout', resolvedBranch]);
        if (checkout.exitCode !== 0) {
          throw new Error(`Failed to checkout ${resolvedBranch}: ${checkout.stderr.trim()}`);
        }

        const merged = [];
        for (const epic of epics) {
          const result = this._runGit([
            'merge',
            '--no-ff',
            epic.id,
            '-m',
            `feat: integrate ${epic.id} epic`,
          ]);
          if (result.exitCode !== 0) {
            throw new Error(`Failed to merge ${epic.id}: ${result.stderr.trim()}`);
          }
          epic.status = TaskStatus.COMPLETED;

          // Update the worktree's .arcforge-epic marker so that subsequent
          // sync propagates the correct status. Without this, the marker
          // retains the stale 'in_progress' from expand time, and sync
          // overwrites the DAG's correct 'completed' back to 'in_progress'.
          if (epic.worktree) {
            const wtPath = this._resolveWorktreePath(epic.worktree);
            const markerPath = path.join(wtPath, '.arcforge-epic');
            try {
              const marker = this._readAgenticEpic(markerPath);
              if (!marker.local) marker.local = {};
              marker.local.status = TaskStatus.COMPLETED;
              this._writeAgenticEpic(marker, markerPath);
            } catch {
              // Marker missing or unreadable — skip silently. The DAG
              // status is already correct; the marker is best-effort.
            }
          }

          merged.push(epic);
        }

        return merged;
      },
      { timeout: MERGE_LOCK_TIMEOUT },
    );
  }

  /**
   * Clean up worktrees for completed epics
   * @param {Object} options - Cleanup options
   * @param {string[]} [options.epicIds] - Specific epic IDs to clean
   * @returns {string[]} List of removed worktree paths
   */
  cleanupWorktrees(options = {}) {
    const { epicIds } = options;

    let epics;
    if (epicIds) {
      epics = this.dag.epics.filter((e) => epicIds.includes(e.id));
      const missing = epicIds.filter((id) => !epics.some((e) => e.id === id));
      if (missing.length > 0) {
        throw new Error(`Epic not found: ${missing.join(', ')}`);
      }
    } else {
      epics = this.dag.epics.filter((e) => e.status === TaskStatus.COMPLETED);
    }

    // Remove the directories directly, then prune git's registry once.
    // `git worktree remove` refuses on the untracked `.arcforge-epic` marker
    // we authored, and `--force` per-epic plus a fallback was fragile. A
    // filesystem remove + single `git worktree prune` is cheaper (O(1) git
    // invocations instead of N) and has the same net effect on git state.
    const removed = [];
    for (const epic of epics) {
      if (!epic.worktree) continue;
      const worktreePath = this._resolveWorktreePath(epic.worktree);
      fs.rmSync(worktreePath, { recursive: true, force: true });
      removed.push(worktreePath);
      epic.worktree = null;
    }

    if (removed.length > 0) {
      const pruneResult = this._runGit(['worktree', 'prune']);
      if (pruneResult.exitCode !== 0) {
        throw new Error(`git worktree prune failed: ${pruneResult.stderr.trim()}`);
      }
      this._saveDag();
    }

    return removed;
  }

  /**
   * Build a self-contained task context for spawned sessions (e.g., autonomous loops).
   * @param {string} taskId - Task ID to build context for
   * @returns {Object} Task context
   */
  taskContext(taskId) {
    const task = this.dag.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const context = {
      task_id: task.id,
      task_name: task.name,
      task_type: task instanceof Feature ? 'feature' : 'epic',
      status: task.status,
      project_root: this.projectRoot,
    };

    if (task.depends_on && task.depends_on.length > 0) {
      context.dependencies = task.depends_on.map((depId) => {
        const dep = this.dag.getTask(depId);
        return {
          id: depId,
          name: dep ? dep.name : depId,
          status: dep ? dep.status : TaskStatus.BLOCKED,
        };
      });
    }

    const parentEpic = this.dag.findEpicByFeature(taskId);
    if (parentEpic) {
      context.parent_epic = {
        id: parentEpic.id,
        name: parentEpic.name,
        progress: parentEpic.completionRatio(),
      };
      context.sibling_tasks = parentEpic.features.map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status,
      }));
    }

    return context;
  }

  /**
   * Reboot context - get summary for new session
   * @returns {Object} Context summary
   */
  rebootContext() {
    let completed = 0;
    let remaining = 0;

    for (const epic of this.dag.epics) {
      for (const feature of epic.features) {
        if (feature.status === TaskStatus.COMPLETED) {
          completed++;
        } else {
          remaining++;
        }
      }
    }

    return {
      current_task: null,
      remaining_count: remaining,
      completed_count: completed,
      blocked_count: this.dag.blocked.length,
      project_goal: 'Build a skill-based autonomous agent toolkit',
      research_files: [],
    };
  }

  /**
   * Synchronize state between worktree and base DAG
   * @param {Object} options - Sync options
   * @param {string} [options.direction] - 'from_base', 'to_base', 'both', 'scan'
   * @returns {SyncResult} Sync result
   */
  sync(options = {}) {
    let { direction } = options;

    // Auto-detect direction
    if (!direction) {
      direction = this._isInWorktree() ? 'both' : 'scan';
    }

    if (this._isInWorktree()) {
      if (direction === 'scan') {
        throw new Error(
          'Cannot use --direction scan in worktree. ' +
            'Use --direction from-base, to-base, or both (or omit for auto-detect).',
        );
      }
      return this._syncWorktree(direction);
    } else {
      if (['from_base', 'to_base', 'both'].includes(direction)) {
        throw new Error(
          'Cannot use --direction from-base/to-base/both in base project. ' +
            "Run 'arcforge sync' without --direction to scan all worktrees.",
        );
      }
      return this._syncBase();
    }
  }

  /**
   * Pull epic statuses from the base DAG into the local dag.yaml.
   * No-op when not in a worktree or when base is unreachable.
   * @returns {boolean} Whether any statuses were updated
   */
  syncEpicStatusesFromBase() {
    if (!this._isInWorktree()) return false;

    const basePath = this._findBaseWorktree();
    if (!basePath) return false;

    const baseCoord = new Coordinator(basePath, this.specId);

    return this._dagTransaction(() => {
      let updated = false;
      for (const localEpic of this.dag.epics) {
        const baseEpic = baseCoord.dag.getEpic(localEpic.id);
        if (baseEpic && baseEpic.status !== localEpic.status) {
          localEpic.status = baseEpic.status;
          updated = true;
        }
      }
      return updated;
    });
  }

  _syncWorktree(direction) {
    const epicFile = this._readAgenticEpic();
    const basePath = this._findBaseWorktree();
    if (!basePath) {
      throw new Error('Cannot find base worktree');
    }

    const result = new SyncResult({ epic_id: epicFile.epic });

    if (direction === 'from_base' || direction === 'both') {
      const baseCoord = new Coordinator(basePath, this.specId);
      const dagEpic = baseCoord.dag.getEpic(epicFile.epic);
      if (dagEpic) {
        epicFile.synced = {
          last_sync: new Date().toISOString(),
          dependencies: this._getDependencyStatuses(baseCoord.dag, dagEpic),
          dependents: this._getDependents(baseCoord.dag, dagEpic),
          blocked_by: this._getBlockedBy(baseCoord.dag, dagEpic),
          dag_status: dagEpic.status,
        };
        result.blocked_by = epicFile.synced.blocked_by;
        result.dependents = epicFile.synced.dependents;
        result.pulled = true;
      }
    }

    if (direction === 'to_base' || direction === 'both') {
      const baseCoord = new Coordinator(basePath, this.specId);
      const local = epicFile.local || {};
      if (local.status) {
        const validStatus = normalizeStatus(local.status);
        // Resolve the target epic inside the base's transaction so we
        // act on the fresh-loaded state, not the pre-transaction cache.
        const pushed = baseCoord._dagTransaction(() => {
          const dagEpic = baseCoord.dag.getEpic(epicFile.epic);
          if (dagEpic && validStatus !== dagEpic.status) {
            dagEpic.status = validStatus;
            return true;
          }
          return false;
        });
        if (pushed) result.pushed = true;
      }
    }

    this._writeAgenticEpic(epicFile);
    return result;
  }

  _syncBase() {
    return this._dagTransaction(() => {
      const result = new SyncResult({ scanned: 0, updates: [] });

      // Only scan worktrees that belong to this project, keyed by the path hash.
      for (const epic of this.dag.epics) {
        if (!epic.worktree) continue;

        const worktreePath = this._resolveWorktreePath(epic.worktree);
        const epicFilePath = path.join(worktreePath, '.arcforge-epic');
        if (!fs.existsSync(epicFilePath)) continue;

        const epicData = this._readAgenticEpic(epicFilePath);
        const local = epicData.local || {};

        if (local.status) {
          const validStatus = normalizeStatus(local.status);
          const oldStatus = epic.status;
          if (validStatus !== oldStatus) {
            epic.status = validStatus;
            result.updates.push({
              epic: epicData.epic,
              old_status: oldStatus,
              new_status: validStatus,
            });
          }
        }

        result.scanned++;
      }

      return result;
    });
  }

  _getDependencyStatuses(dag, epic) {
    const statuses = {};
    for (const depId of epic.depends_on) {
      const depEpic = dag.getEpic(depId);
      if (depEpic) {
        statuses[depId] = depEpic.status;
      }
    }
    return statuses;
  }

  _getBlockedBy(dag, epic) {
    return epic.depends_on.filter((depId) => {
      const depEpic = dag.getEpic(depId);
      return depEpic && depEpic.status !== TaskStatus.COMPLETED;
    });
  }

  _getDependents(dag, epic) {
    return dag.epics.filter((e) => e.depends_on.includes(epic.id)).map((e) => e.id);
  }

  // ==================== Private Methods ====================

  _runGit(args, cwd = null) {
    const workdir = cwd || this.projectRoot;
    try {
      const stdout = execFileSync('git', args, {
        cwd: workdir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.status || 1,
      };
    }
  }

  _runSubprocess(workdir, command) {
    // stdio: 'inherit' streams install/test output directly to the parent
    // terminal. This avoids execFileSync's default 1 MB maxBuffer, which
    // `npm install` / `cargo build` can exceed and incorrectly report as
    // ENOBUFS even on success. The user sees progress live; on failure the
    // output is already on their screen, so we don't need to capture it.
    try {
      const [cmd, ...args] = Array.isArray(command) ? command : command.split(' ');
      execFileSync(cmd, args, { cwd: workdir, stdio: 'inherit' });
      return { exitCode: 0 };
    } catch (err) {
      return { exitCode: err.status || 1, error: err };
    }
  }

  _resolveWorktreePath(worktreeValue) {
    if (!worktreeValue) return null;
    if (path.isAbsolute(worktreeValue)) {
      return worktreeValue;
    }
    // epic-id (no separators) → derive via helper. The hash now folds
    // specId in so same-epic-id across specs produces distinct paths.
    if (!worktreeValue.includes('/') && !worktreeValue.includes(path.sep)) {
      return getWorktreePath(this.projectRoot, this.specId, worktreeValue);
    }
    // Legacy relative path (pre-migration fixture) — resolve against project root.
    return path.join(this.projectRoot, worktreeValue);
  }

  _inferEpicIdFromWorktree() {
    const data = readArcforgeMarker(this.projectRoot);
    if (!data) return null;
    // Side-effect: cache spec_id so any subsequent dagPath access
    // doesn't re-read the marker file.
    if (data.spec_id && !this.specId) this.specId = data.spec_id;
    return data.epic || null;
  }

  _isInWorktree() {
    return fs.existsSync(path.join(this.projectRoot, '.arcforge-epic'));
  }

  _writeAgenticEpic(data, filePath = null) {
    const target = filePath || path.join(this.projectRoot, '.arcforge-epic');
    fs.writeFileSync(target, objectToYaml(data));
  }

  _readAgenticEpic(filePath = null) {
    const target = filePath || path.join(this.projectRoot, '.arcforge-epic');
    const content = fs.readFileSync(target, 'utf8');
    return parseDagYaml(content);
  }

  _findBaseWorktree() {
    const result = this._runGit(['worktree', 'list', '--porcelain']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list worktrees: ${result.stderr.trim()}`);
    }

    const paths = [];
    for (const line of result.stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        paths.push(line.slice(9));
      }
    }

    for (const p of paths) {
      if (parseWorktreePath(p) === null) {
        return p;
      }
    }
    return null;
  }

  /**
   * Add `.arcforge-epic` to the main repo's git info/exclude so the
   * worktree marker never gets staged by any teammate's `git add -A`
   * or `git add .` patterns.
   *
   * Linked worktrees share their exclude configuration with the main
   * repo via the `commondir` file — writing to a per-worktree
   * `info/exclude` path does NOT work (verified empirically). The only
   * path that git consults for all linked worktrees is the main repo's
   * common gitdir, which `git rev-parse --git-common-dir` resolves to
   * regardless of which worktree the command runs from.
   *
   * Idempotent: no-op if the marker rule is already present.
   */
  _ensureArcforgeExcluded() {
    const result = this._runGit(['rev-parse', '--git-common-dir']);
    if (result.exitCode !== 0) return;

    // git-common-dir can be relative to cwd (older git versions); resolve
    // against projectRoot so we always get an absolute path.
    const commonDir = path.resolve(this.projectRoot, result.stdout.trim());
    const infoDir = path.join(commonDir, 'info');
    const excludePath = path.join(infoDir, 'exclude');
    const marker = '.arcforge-epic';

    const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';

    // Match the exact line (not a substring) to avoid re-adding if the
    // rule already exists, while still tolerating comments and other
    // entries around it.
    if (current.split('\n').includes(marker)) return;

    fs.mkdirSync(infoDir, { recursive: true });
    const needsNewline = current.length > 0 && !current.endsWith('\n');
    const prefix = needsNewline ? '\n' : '';
    fs.appendFileSync(excludePath, `${prefix}# arcforge worktree marker (auto-added)\n${marker}\n`);
  }

  _currentBranch() {
    const result = this._runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to detect base branch: ${result.stderr.trim()}`);
    }
    const branch = result.stdout.trim();
    if (!branch || branch === 'HEAD') {
      throw new Error('Base branch could not be inferred from git');
    }
    return branch;
  }

  _loadDag() {
    if (!fs.existsSync(this.dagPath)) {
      throw new Error(`dag.yaml not found at ${this.dagPath}`);
    }
    const content = fs.readFileSync(this.dagPath, 'utf8');
    const data = parseDagYaml(content);
    return DAG.fromObject(data);
  }

  _saveDag() {
    withLock(this.projectRoot, () => {
      const content = stringifyDagYaml(this.dag.toObject());
      fs.writeFileSync(this.dagPath, content);
    });
  }

  /**
   * Run a DAG mutation under a single exclusive lock covering both read
   * and write. This closes the read-modify-write race where two Coordinator
   * instances load the dag concurrently, each mutate different epics, and
   * the second save overwrites the first.
   *
   * Usage: wrap any body that mutates `this.dag` and would have ended in
   * `this._saveDag()`. Do NOT call `_saveDag()` inside `fn` — it would
   * deadlock (withLock is not re-entrant).
   *
   * @param {Function} fn - Mutation body; return value is forwarded
   * @param {Object} [options] - withLock options (e.g. { timeout })
   * @returns {*} Return value of fn
   */
  _dagTransaction(fn, options = {}) {
    return withLock(
      this.projectRoot,
      () => {
        // Fresh read under lock — any previously-cached DAG state
        // is stale the moment a concurrent writer acquired the lock.
        const original = fs.readFileSync(this.dagPath, 'utf8');
        this._dag = DAG.fromObject(parseDagYaml(original));
        const result = fn();
        // Only write if the DAG actually changed — avoids unnecessary
        // disk I/O and reduces lock hold time on no-mutation paths.
        const content = stringifyDagYaml(this.dag.toObject());
        if (content !== original) {
          fs.writeFileSync(this.dagPath, content);
        }
        return result;
      },
      options,
    );
  }
}

// ==================== Cross-spec module-level operations ====================
// Module-level, not instance, because a Coordinator is scoped to one spec.
// A single project-level withLock covers the whole iteration.

/**
 * List every `specs/<id>/dag.yaml` that currently exists in the project.
 * @param {string} projectRoot
 * @returns {Array<{specId: string, dagPath: string}>}
 */
function listSpecDagPaths(projectRoot) {
  const specsRoot = path.join(projectRoot, 'specs');
  if (!fs.existsSync(specsRoot)) return [];
  const out = [];
  for (const entry of fs.readdirSync(specsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dagPath = path.join(specsRoot, entry.name, 'dag.yaml');
    if (fs.existsSync(dagPath)) {
      out.push({ specId: entry.name, dagPath });
    }
  }
  return out;
}

/**
 * Aggregate base-side sync across every spec in the project. Each member
 * spec's dag.yaml is scanned for epics whose worktree markers advertise a
 * newer status; matches are pulled into the dag.
 *
 * @param {string} projectRoot
 * @returns {{ specs: Object<string, SyncResult> }} Per-spec results keyed by spec id.
 */
function syncAllSpecs(projectRoot) {
  return withLock(projectRoot, () => {
    const specs = {};
    for (const { specId, dagPath } of listSpecDagPaths(projectRoot)) {
      try {
        specs[specId] = _syncSpecDagInline(projectRoot, specId, dagPath);
      } catch (err) {
        specs[specId] = { error: err.message };
      }
    }
    return { specs };
  });
}

// Inline single-spec sync — matches Coordinator.prototype._syncBase but
// without _dagTransaction's nested withLock. Reached only from
// syncAllSpecs, which already holds the project-level lock; calling the
// instance method here would deadlock (file-based locks are not
// re-entrant).
function _syncSpecDagInline(projectRoot, specId, dagPath) {
  const original = fs.readFileSync(dagPath, 'utf8');
  const dag = DAG.fromObject(parseDagYaml(original));
  const coord = new Coordinator(projectRoot, specId);
  const updates = [];
  let scanned = 0;

  for (const epic of dag.epics) {
    if (!epic.worktree) continue;
    const worktreePath = coord._resolveWorktreePath(epic.worktree);
    const markerPath = path.join(worktreePath, '.arcforge-epic');
    if (!fs.existsSync(markerPath)) continue;

    const epicData = parseDagYaml(fs.readFileSync(markerPath, 'utf8'));
    const local = epicData.local || {};
    if (local.status) {
      const validStatus = normalizeStatus(local.status);
      const oldStatus = epic.status;
      if (validStatus !== oldStatus) {
        epic.status = validStatus;
        updates.push({
          epic: epicData.epic,
          old_status: oldStatus,
          new_status: validStatus,
        });
      }
    }
    scanned++;
  }

  const newContent = stringifyDagYaml(dag.toObject());
  if (newContent !== original) {
    fs.writeFileSync(dagPath, newContent);
  }
  return { scanned, updates };
}

/**
 * Aggregate reboot context across every spec in the project.
 *
 * @param {string} projectRoot
 * @returns {{ specs: Object<string, Object>, totals: Object }}
 */
function rebootAllSpecs(projectRoot) {
  const specs = {};
  const totals = { completed_count: 0, remaining_count: 0, blocked_count: 0 };
  for (const { specId } of listSpecDagPaths(projectRoot)) {
    const coord = new Coordinator(projectRoot, specId);
    try {
      const ctx = coord.rebootContext();
      specs[specId] = ctx;
      totals.completed_count += ctx.completed_count;
      totals.remaining_count += ctx.remaining_count;
      totals.blocked_count += ctx.blocked_count;
    } catch (err) {
      specs[specId] = { error: err.message };
    }
  }
  return { specs, totals };
}

module.exports = {
  Coordinator,
  listSpecDagPaths,
  syncAllSpecs,
  rebootAllSpecs,
  readArcforgeMarker,
};
