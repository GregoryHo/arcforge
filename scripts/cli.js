#!/usr/bin/env node
/**
 * cli.js - CLI entry point for arcforge
 *
 * Commands:
 *   status [--blocked] [--json]     Show DAG status
 *   next                            Get next task
 *   complete <task_id>              Mark task as completed
 *   block <task_id> <reason>        Mark task as blocked
 *   parallel                        Get parallelizable epics
 *   expand [--epic <id>] [--project-setup] [--verify] [--verify-cmd "..."]  Create worktrees
 *   merge [epic_ids...] [--base branch]     Merge epics to base
 *   cleanup [epic_ids...]           Remove worktrees for completed epics
 *   sync [--direction from-base|to-base|both|scan]  Sync state
 *   reboot                          Get context for new session
 *   schema [--json] [--example]     Show dag.yaml schema
 *   loop [--pattern sequential|dag] [--max-runs N] [--max-cost $N]  Run autonomous loop
 *   eval list                        List eval scenarios
 *   eval run <name> [--k N] [--model <name>] [--no-isolate] [--plugin-dir <path>] [--max-turns N]
 *   eval preflight <name>            Run baseline trials to check scenario discriminability
 *   eval lint <name>                 Validate scenario file structure
 *   eval report [name] [--model <name>] [--since ISO] Show eval benchmark report
 *   eval ab <name> [--skill-file <path>] [--k N] [--model <name>] [--interleave] [--plugin-dir <path>] [--max-turns N]
 *   eval compare <name> [--model <name>]      Compare A/B results
 *   eval history                     List benchmark snapshots
 *   eval audit [--top N]             Audit grading history for promotion/retirement candidates
 *   eval dashboard [--port N]        Start live eval dashboard (default: 3333)
 *   learn status|enable|disable|inbox|review|drafts|inspect|approve|reject|accept|materialize|activate  Manage optional learning subsystem
 *   (learn analyze is DEPRECATED — use the dashboard for candidate review)
 *   learn dashboard [--port N]       Start localhost learning review dashboard (default: 3334)
 *   research dashboard [--results path] [--config path] [--port N]  Start live research dashboard
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  Coordinator,
  listSpecDagPaths,
  syncAllSpecs,
  rebootAllSpecs,
  readArcforgeMarker,
} = require('./lib/coordinator');
const { schemaToYaml, exampleToYaml, example, schema } = require('./lib/dag-schema');
const { getWorktreePath } = require('./lib/worktree-paths');
const { parseDagYaml } = require('./lib/yaml-parser');
const { output } = require('./cli/shared');
const { runEvalCommand } = require('./cli/eval-command');
const { runLearnCommand } = require('./cli/learn-command');
const { runObsidianCommand } = require('./cli/obsidian-command');

/**
 * Resolve the spec id for a CLI invocation.
 *
 * Priority:
 *   1. Explicit --spec-id flag.
 *   2. `.arcforge-epic` marker in cwd (worktree wins — always scopes to
 *      the marker's spec_id).
 *   3. Single spec in `specs/*\/dag.yaml` → that spec.
 *   4. Multiple specs → return ambiguity signal; caller decides whether
 *      to aggregate or error-require-flag.
 *
 * @param {string} projectRoot
 * @param {string|undefined} explicitFlag - value of --spec-id
 * @returns {string|null|{ambiguous: true, candidates: string[]}}
 */
function resolveSpecId(projectRoot, explicitFlag) {
  if (explicitFlag) return explicitFlag;

  const marker = readArcforgeMarker(projectRoot);
  if (marker?.spec_id) return marker.spec_id;

  const candidates = listSpecDagPaths(projectRoot).map((s) => s.specId);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return { ambiguous: true, candidates };
}

/** Discriminator for the ambiguous-spec result from resolveSpecId. */
function isAmbiguousSpec(spec) {
  return typeof spec === 'object' && spec !== null && spec.ambiguous === true;
}

/**
 * Error out with a clear message when --spec-id is required. Used by
 * commands that cannot aggregate (next, parallel, expand, loop) and by
 * the error branches of merge / cleanup when no --epic was provided.
 */
function requireSpecId(spec, commandName) {
  if (typeof spec === 'string') return spec;
  if (spec === null) {
    console.error(
      `Error: No spec found. ${commandName} needs either a --spec-id flag or a populated specs/*/dag.yaml.`,
    );
    process.exit(1);
  }
  // ambiguous
  console.error(
    `Error: Multiple specs found (${spec.candidates.join(', ')}). Rerun ${commandName} with --spec-id <id>.`,
  );
  process.exit(1);
}

/**
 * Build a reverse index { epicId → [specId...] } by reading each
 * `specs/*\/dag.yaml` exactly once. One-shot single-epic lookup uses
 * findSpecsByEpic; callers that need the index directly can call this.
 * @returns {Map<string, string[]>}
 */
function buildEpicSpecIndex(projectRoot) {
  const index = new Map();
  for (const { specId, dagPath } of listSpecDagPaths(projectRoot)) {
    let dag;
    try {
      dag = parseDagYaml(fs.readFileSync(dagPath, 'utf8'));
    } catch {
      continue;
    }
    for (const epic of dag.epics || []) {
      const bucket = index.get(epic.id) || [];
      bucket.push(specId);
      index.set(epic.id, bucket);
    }
  }
  return index;
}

/**
 * Reverse-lookup: find which specs contain a given epic id. One-shot
 * variant; reuses buildEpicSpecIndex internally so the two call sites
 * agree on semantics.
 * @returns {string[]} spec ids that contain the epic
 */
function findSpecsByEpic(projectRoot, epicId) {
  return buildEpicSpecIndex(projectRoot).get(epicId) || [];
}

/**
 * Resolve spec for merge / cleanup. These commands accept --spec-id OR
 * positional epic ids — an epic id uniquely identifies its parent spec
 * in most deployments, so we can reverse-look-up rather than forcing
 * the flag.
 */
function resolveMergeOrCleanupSpec(projectRoot, explicitFlag, positionalEpics, commandName) {
  const spec = resolveSpecId(projectRoot, explicitFlag);
  if (typeof spec === 'string') return spec;
  if (spec === null) {
    console.error(
      `Error: No spec found. ${commandName} needs either a --spec-id flag or a populated specs/*/dag.yaml.`,
    );
    process.exit(1);
  }
  // Ambiguous — try to narrow via positional epic ids.
  // Must INTERSECT: a valid parent spec contains ALL positional epics, not any.
  // Union would report false ambiguity when a unique epic id pins the spec and
  // a shared epic id happens to also live elsewhere.
  if (positionalEpics && positionalEpics.length > 0) {
    const perEpicMatches = positionalEpics.map((id) => new Set(findSpecsByEpic(projectRoot, id)));
    const missing = positionalEpics.filter((_id, i) => perEpicMatches[i].size === 0);
    if (missing.length > 0) {
      console.error(
        `Error: Epic(s) ${missing.join(', ')} not found in any spec. Pass --spec-id to be explicit.`,
      );
      process.exit(1);
    }
    const intersection = perEpicMatches.reduce((acc, s) => {
      const next = new Set();
      for (const x of acc) if (s.has(x)) next.add(x);
      return next;
    });
    if (intersection.size === 1) return [...intersection][0];
    if (intersection.size === 0) {
      console.error(
        `Error: Epic(s) ${positionalEpics.join(', ')} do not share a single spec. Pass --spec-id to disambiguate.`,
      );
      process.exit(1);
    }
    console.error(
      `Error: Epic(s) ${positionalEpics.join(', ')} span multiple specs (${[...intersection].join(', ')}). Pass --spec-id to disambiguate.`,
    );
    process.exit(1);
  }
  console.error(
    `Error: Multiple specs found (${spec.candidates.join(', ')}). Rerun ${commandName} with --spec-id <id> or pass epic ids as positional args.`,
  );
  process.exit(1);
}

// Parse command line arguments
function parseArgs(args) {
  const result = {
    command: null,
    positional: [],
    flags: {},
    options: {},
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if next arg is a value (not another flag)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.options[key] = args[i + 1];
        i += 2;
      } else {
        result.flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      result.flags[key] = true;
      i++;
    } else if (!result.command) {
      result.command = arg;
      i++;
    } else {
      result.positional.push(arg);
      i++;
    }
  }

  return result;
}

// Print usage help
function printHelp() {
  console.log(`
arcforge CLI - DAG management for skill-based agent workflows

USAGE:
  node scripts/cli.js <command> [options]

SPEC RESOLUTION:
  Most commands operate on one spec's dag.yaml. The spec id is resolved in order:
    1. --spec-id <id>
    2. .arcforge-epic marker in cwd (inside a worktree)
    3. The only spec in specs/*/dag.yaml
  With 2+ specs and no flag, commands either aggregate (status, sync, reboot)
  or require --spec-id (next, parallel, expand, loop). Merge/cleanup also
  accept positional epic ids and reverse-look-up the owning spec.

COMMANDS:
  status [--blocked] [--json] [--spec-id <id>]
      Show status of all epics and blocked items.
      --blocked    Show only blocked items
      --json       Output as JSON
      Multi-spec (no flag) → aggregated { specs: { <id>: {...} } }.

  next [--spec-id <id>]
      Get the next task to work on.

  complete <task_id> [--spec-id <id>]
      Mark a task as completed.

  block <task_id> <reason> [--spec-id <id>]
      Mark a task as blocked with a reason.

  parallel [--spec-id <id>]
      List all epics that can be worked on in parallel.

  expand [--epic <id>] [--spec-id <id>] [--project-setup] [--verify] [--verify-cmd "..."]
      Create git worktrees for ready epics at ~/.arcforge/worktrees/.
      --epic           Expand only the named epic (single-epic mode)
      --project-setup  Auto-detect and run installer (npm/pip/cargo/go)
      --verify         Run tests after creation
      --verify-cmd     Custom test command (default: auto-detect)

  merge [epic_ids...] [--base branch] [--spec-id <id>]
      Merge completed epics to base branch. Without --spec-id, positional
      epic ids are reverse-looked-up across specs.
      --base           Target branch (default: current)

  cleanup [epic_ids...] [--spec-id <id>]
      Remove worktrees for completed epics.

  sync [--direction from-base|to-base|both|scan] [--spec-id <id>]
      Synchronize state between worktree and base DAG.
      --direction      Sync direction (auto-detected if omitted)
      Multi-spec (no flag) → aggregated { specs: { <id>: {...} } }.

  reboot [--spec-id <id>]
      Get context summary for starting a new session.
      Multi-spec (no flag) → aggregated { specs, totals }.

  schema [--json] [--example]
      Show dag.yaml schema.
      --json       Output schema as JSON
      --example    Show complete example

  loop [--pattern sequential|dag] [--max-runs N] [--max-cost N] [--epic <id>] [--spec-id <id>]
      Run autonomous cross-session execution loop.
      --pattern    Execution pattern: sequential (default) or dag
      --epic       Scope loop to a single epic (auto-detected in worktrees)
      --max-runs   Maximum iterations (default: 50)
      --max-cost   Maximum cost in dollars (default: unlimited)

  eval list                          List eval scenarios
  eval run <name> [--k N] [--model]  Run eval trials
      --no-isolate   Run without isolation (default: isolated)
      --plugin-dir   Plugin directory for semi-isolated mode
      --max-turns    Max turns for Claude CLI (overrides scenario)
  eval preflight <name>              Run baseline trials to check scenario discriminability
  eval lint <name>                   Validate scenario file (sections, assertion shape)
  eval ab <name> [--skill-file path] A/B skill/workflow eval (requires prior PASS preflight)
      --plugin-dir   Plugin directory for treatment trials
      --max-turns    Max turns for treatment trials (overrides scenario)
  eval compare <name>                Compare A/B results
  eval report [name] [--since ISO]   Benchmark report, optionally bounded to recent result rows
  eval history                       List benchmark snapshots
  eval audit [--top N]               Audit grading history for promotion/retirement candidates
  eval dashboard [--port N]          Live web dashboard (default: 3333)

  learn status [--json]
                                     Show optional learning enablement state.
  learn enable --project|--global [--json]
                                     Explicitly enable learning for project or global scope.
  learn disable --project|--global [--json]
                                     Disable new learning observations/analyzer runs for a scope.
  learn analyze                      DEPRECATED — the statistical analyzer was retired;
                                     use 'learn dashboard' for candidate review.
  learn inbox --project|--global [--json]
                                     Compact grouped review queue with next commands.
  learn review --project|--global [--json]
                                     List queued learning candidates for review.
  learn drafts --project|--global [--json]
                                     List candidates with materialized drafts awaiting activation.
  learn inspect <candidate-id> --project|--global [--json]
                                     Read-only review summary for a candidate (paths and next actions).
  learn approve|reject <candidate-id> --project|--global [--json]
                                     Record user authorization decision for a candidate.
  learn accept <candidate-id> --project [--json]
                                     Approve and materialize drafts in one step; never activates.
  learn materialize <candidate-id> --project|--global [--json]
                                     Write approved candidate drafts without activating behavior.
  learn activate <candidate-id> --project|--global [--json]
                                     Promote materialized drafts to active artifacts (project scope only).
  learn dashboard [--port N]
                                     Start a localhost review dashboard for learning suggestions
                                     (default port: 3334). User-friendly alternative to the
                                     inbox/inspect/accept/activate CLI flow.

  research dashboard [--results path] [--config path] [--port N]
                                     Live research experiment dashboard (default port: 3000)

  obsidian register --path <p> --name <n> [--default] [--preset <p>] [--scope "..."]
                          [--search-preferred filesystem|qmd|obsidian-cli] [--qmd-collection <name>]
                                     Add a vault to the registry at ~/.arcforge/obsidian-vaults.json.
                                     First-registered vault becomes default automatically.
                                     --qmd-collection implies --search-preferred=qmd.
  obsidian unregister <name>         Remove the named vault entry (vault files untouched).
  obsidian set-default <name>        Set the default vault.
  obsidian list-vaults [--json]      List registered vaults.

ENVIRONMENT:
  CLAUDE_PROJECT_DIR    Project root directory (default: cwd)

EXAMPLES:
  node scripts/cli.js status --json
  node scripts/cli.js complete feat-001-02
  node scripts/cli.js expand --verify
  node scripts/cli.js schema --example
`);
}

// Main CLI handler
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.help || args.flags.h) {
    printHelp();
    process.exit(0);
  }

  if (!args.command) {
    printHelp();
    process.exit(1);
  }

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const asJson = args.flags.json || false;

  try {
    const specFlag = args.options['spec-id'];

    switch (args.command) {
      case 'status': {
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
          break;
        }
        const resolved = requireSpecId(spec, 'status');
        const coord = new Coordinator(projectRoot, resolved);
        output(coord.status({ blockedOnly: args.flags.blocked }), asJson);
        break;
      }

      case 'next': {
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
        break;
      }

      case 'complete': {
        if (args.positional.length < 1) {
          console.error('Error: task_id required');
          process.exit(1);
        }
        const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'complete');
        const coord = new Coordinator(projectRoot, resolved);
        coord.completeTask(args.positional[0]);
        output({ success: true, task_id: args.positional[0] }, asJson);
        break;
      }

      case 'block': {
        if (args.positional.length < 2) {
          console.error('Error: task_id and reason required');
          process.exit(1);
        }
        const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'block');
        const coord = new Coordinator(projectRoot, resolved);
        coord.blockTask(args.positional[0], args.positional[1]);
        output({ success: true, task_id: args.positional[0] }, asJson);
        break;
      }

      case 'parallel': {
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
        break;
      }

      case 'expand': {
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
        break;
      }

      case 'merge': {
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
        break;
      }

      case 'cleanup': {
        const resolved = resolveMergeOrCleanupSpec(
          projectRoot,
          specFlag,
          args.positional,
          'cleanup',
        );
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
        break;
      }

      case 'sync': {
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
          break;
        }
        const resolved = requireSpecId(spec, 'sync');
        const coord = new Coordinator(projectRoot, resolved);
        let direction = args.options.direction;
        if (direction) direction = direction.replace(/-/g, '_');
        const result = coord.sync({ direction });
        output(result.toObject ? result.toObject() : result, asJson);
        break;
      }

      case 'reboot': {
        const spec = resolveSpecId(projectRoot, specFlag);
        if (isAmbiguousSpec(spec)) {
          output(rebootAllSpecs(projectRoot), asJson);
          break;
        }
        const resolved = requireSpecId(spec, 'reboot');
        const coord = new Coordinator(projectRoot, resolved);
        output(coord.rebootContext(), asJson);
        break;
      }

      case 'schema': {
        if (args.flags.example) {
          if (asJson) {
            output(example, true);
          } else {
            console.log(exampleToYaml());
          }
        } else {
          if (asJson) {
            output(schema, true);
          } else {
            console.log(schemaToYaml());
          }
        }
        break;
      }

      case 'eval': {
        await runEvalCommand(args, { projectRoot, asJson });
        break;
      }

      case 'learn': {
        runLearnCommand(args, { projectRoot, asJson });
        break;
      }

      case 'research': {
        const subcommand = args.positional[0];

        if (subcommand === 'dashboard') {
          const { startServer } = require('./lib/research-dashboard');
          const port = args.options.port ? parseInt(args.options.port, 10) : 3000;
          const resultsPath = path.resolve(projectRoot, args.options.results || 'results.tsv');
          const configPath = args.options.config
            ? path.resolve(projectRoot, args.options.config)
            : path.resolve(projectRoot, 'research-config.md');
          startServer({ resultsPath, configPath, port });
        } else {
          console.error(
            'Usage: arc research dashboard [--results path] [--config path] [--port N]',
          );
          process.exit(1);
        }
        break;
      }

      case 'obsidian': {
        runObsidianCommand(args, { asJson });
        break;
      }

      case 'loop': {
        const resolved = requireSpecId(resolveSpecId(projectRoot, specFlag), 'loop');
        const { runSequential, runDag } = require('./loop');
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
        break;
      }

      default:
        console.error(`Unknown command: ${args.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    if (asJson) {
      output({ error: err.message }, true);
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
