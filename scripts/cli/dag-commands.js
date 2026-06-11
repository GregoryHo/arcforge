/**
 * dag-commands.js - Handlers for the DAG/coordinator CLI commands:
 * status, next, complete, block, parallel, expand, merge, cleanup,
 * sync, reboot, loop.
 *
 * Each handler preserves the exact output shape and exit behavior of the
 * original cli.js case blocks. Errors propagate to cli.js's catch.
 */

const { Coordinator, syncAllSpecs, rebootAllSpecs } = require('../lib/coordinator');
const { getWorktreePath } = require('../lib/worktree-paths');
const { output } = require('./shared');
const {
  resolveSpecId,
  isAmbiguousSpec,
  requireSpecId,
  resolveMergeOrCleanupSpec,
} = require('./spec-resolution');

function runStatus(args, { projectRoot, asJson, specFlag }) {
  const spec = resolveSpecId(projectRoot, specFlag);
  // Multi-spec base with no flag → aggregate. Single spec / worktree /
  // explicit flag → flat single-spec output (backwards compatible).
  if (isAmbiguousSpec(spec)) {
    const out = { specs: {} };
    for (const specId of spec.candidates) {
      const c = new Coordinator(projectRoot, specId);
      out.specs[specId] = c.status({ blockedOnly: args.flags.blocked });
    }
    output(out, asJson);
    return;
  }
  const resolved = requireSpecId(spec, 'status');
  const coord = new Coordinator(projectRoot, resolved);
  output(coord.status({ blockedOnly: args.flags.blocked }), asJson);
}

function runNext(_args, { projectRoot, asJson, specFlag }) {
  const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'next');
  const coord = new Coordinator(projectRoot, resolved);
  const task = coord.nextTask();
  if (task) {
    output(
      {
        id: task.id,
        name: task.name,
        type: task.features ? 'epic' : 'feature',
      },
      asJson,
    );
  } else {
    output({ message: 'No tasks available' }, asJson);
  }
}

function runComplete(args, { projectRoot, asJson, specFlag }) {
  if (args.positional.length < 1) {
    console.error('Error: task_id required');
    process.exit(1);
  }
  const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'complete');
  const coord = new Coordinator(projectRoot, resolved);
  coord.completeTask(args.positional[0]);
  output({ success: true, task_id: args.positional[0] }, asJson);
}

function runBlock(args, { projectRoot, asJson, specFlag }) {
  if (args.positional.length < 2) {
    console.error('Error: task_id and reason required');
    process.exit(1);
  }
  const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'block');
  const coord = new Coordinator(projectRoot, resolved);
  coord.blockTask(args.positional[0], args.positional[1]);
  output({ success: true, task_id: args.positional[0] }, asJson);
}

function runParallel(_args, { projectRoot, asJson, specFlag }) {
  const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'parallel');
  const coord = new Coordinator(projectRoot, resolved);
  const tasks = coord.parallelTasks();
  output(
    {
      count: tasks.length,
      epics: tasks.map((e) => ({ id: e.id, name: e.name })),
    },
    asJson,
  );
}

function runExpand(args, { projectRoot, asJson, specFlag }) {
  const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'expand');
  const coord = new Coordinator(projectRoot, resolved);
  const verifyCmd = args.options['verify-cmd'];
  const created = coord.expandWorktrees({
    epicId: args.options.epic,
    verify: args.flags.verify,
    verifyCommand: verifyCmd ? verifyCmd.split(' ') : undefined,
    projectSetup: args.flags['project-setup'] || false,
  });
  output(
    {
      created: created.length,
      epics: created.map((e) => ({
        id: e.id,
        worktree: e.worktree,
        path: getWorktreePath(projectRoot, coord.specId, e.id),
      })),
    },
    asJson,
  );
}

function runMerge(args, { projectRoot, asJson, specFlag }) {
  const resolved = resolveMergeOrCleanupSpec(projectRoot, specFlag, args.positional, 'merge');
  const coord = new Coordinator(projectRoot, resolved);
  const merged = coord.mergeEpics({
    baseBranch: args.options.base,
    epicIds: args.positional.length > 0 ? args.positional : undefined,
  });
  output(
    {
      merged: merged.length,
      epics: merged.map((e) => e.id),
    },
    asJson,
  );
}

function runCleanup(args, { projectRoot, asJson, specFlag }) {
  const resolved = resolveMergeOrCleanupSpec(projectRoot, specFlag, args.positional, 'cleanup');
  const coord = new Coordinator(projectRoot, resolved);
  const removed = coord.cleanupWorktrees({
    epicIds: args.positional.length > 0 ? args.positional : undefined,
  });
  output(
    {
      removed: removed.length,
      paths: removed,
    },
    asJson,
  );
}

function runSync(args, { projectRoot, asJson, specFlag }) {
  const spec = resolveSpecId(projectRoot, specFlag);
  // Reject data-moving --direction values in multi-spec aggregate mode.
  // `scan` is the valid base-mode direction (coord.sync auto-detects
  // it in base checkouts) and the multi-spec aggregate is effectively
  // a cross-spec scan, so let it through as a no-op. Only
  // from-base/to-base/both need a single-spec context to resolve.
  if (isAmbiguousSpec(spec) && args.options.direction && args.options.direction !== 'scan') {
    console.error(
      `Error: --direction ${args.options.direction} is not valid when syncing all specs. Pass --spec-id <id> to target one spec, or use --direction scan (or omit) for a multi-spec scan.`,
    );
    process.exit(1);
  }
  // Ambiguous base → aggregate across specs via syncAllSpecs.
  if (isAmbiguousSpec(spec)) {
    output(syncAllSpecs(projectRoot), asJson);
    return;
  }
  const resolved = requireSpecId(spec, 'sync');
  const coord = new Coordinator(projectRoot, resolved);
  let direction = args.options.direction;
  if (direction) direction = direction.replace(/-/g, '_');
  const result = coord.sync({ direction });
  output(result.toObject ? result.toObject() : result, asJson);
}

function runReboot(_args, { projectRoot, asJson, specFlag }) {
  const spec = resolveSpecId(projectRoot, specFlag);
  if (isAmbiguousSpec(spec)) {
    output(rebootAllSpecs(projectRoot), asJson);
    return;
  }
  const resolved = requireSpecId(spec, 'reboot');
  const coord = new Coordinator(projectRoot, resolved);
  output(coord.rebootContext(), asJson);
}

function runLoop(args, { projectRoot, specFlag }) {
  const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'loop');
  const { runSequential, runDag } = require('../loop');
  const pattern = args.options.pattern || 'sequential';
  const maxRuns = args.options['max-runs'] ? parseInt(args.options['max-runs'], 10) : 50;
  const maxCost = args.options['max-cost'] ? parseFloat(args.options['max-cost']) : null;

  if (!['sequential', 'dag'].includes(pattern)) {
    console.error(`Error: Invalid pattern "${pattern}". Use "sequential" or "dag".`);
    process.exit(1);
  }

  const epic = args.options.epic || null;
  const loopOptions = { pattern, maxRuns, maxCost, epic, projectRoot, specId: resolved };
  if (pattern === 'dag') {
    runDag(loopOptions);
  } else {
    runSequential(loopOptions);
  }
}

const DAG_COMMANDS = {
  status: runStatus,
  next: runNext,
  complete: runComplete,
  block: runBlock,
  parallel: runParallel,
  expand: runExpand,
  merge: runMerge,
  cleanup: runCleanup,
  sync: runSync,
  reboot: runReboot,
  loop: runLoop,
};

/** Dispatch a DAG/coordinator command. cli.js routes only known commands here. */
function runDagCommand(args, { projectRoot, asJson }) {
  const specFlag = args.options['spec-id'];
  DAG_COMMANDS[args.command](args, { projectRoot, asJson, specFlag });
}

module.exports = { runDagCommand };
