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
 *   eval report [name] [--model <name>]       Show eval benchmark report
 *   eval ab <name> [--skill-file <path>] [--k N] [--model <name>] [--interleave] [--plugin-dir <path>] [--max-turns N]
 *   eval compare <name> [--model <name>]      Compare A/B results
 *   eval history                     List benchmark snapshots
 *   eval dashboard [--port N]        Start live eval dashboard (default: 3333)
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
const { schemaToYaml, exampleToYaml, example, schema, objectToYaml } = require('./lib/dag-schema');
const { getWorktreePath } = require('./lib/worktree-paths');
const { parseDagYaml } = require('./lib/yaml-parser');

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
 * `specs/*\/dag.yaml` exactly once. Callers that need the lookup in a
 * loop (e.g. backfillMarkers iterating worktrees) use this; a one-shot
 * single-epic lookup uses findSpecsByEpic.
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
  if (positionalEpics && positionalEpics.length > 0) {
    const allMatches = new Set();
    for (const epicId of positionalEpics) {
      for (const s of findSpecsByEpic(projectRoot, epicId)) allMatches.add(s);
    }
    if (allMatches.size === 1) return [...allMatches][0];
    if (allMatches.size === 0) {
      console.error(
        `Error: Epic(s) ${positionalEpics.join(', ')} not found in any spec. Pass --spec-id to be explicit.`,
      );
      process.exit(1);
    }
    console.error(
      `Error: Epic(s) ${positionalEpics.join(', ')} span multiple specs (${[...allMatches].join(', ')}). Pass --spec-id to disambiguate.`,
    );
    process.exit(1);
  }
  console.error(
    `Error: Multiple specs found (${spec.candidates.join(', ')}). Rerun ${commandName} with --spec-id <id> or pass epic ids as positional args.`,
  );
  process.exit(1);
}

/**
 * Migration command: stamp `spec_id` onto legacy .arcforge-epic markers
 * that predate the per-spec schema. Scans git worktree list and for each
 * marker missing spec_id, reverse-looks-up the epic's containing spec.
 *
 * UX: default is dry-run; --apply writes. Ambiguous (epic appears in
 * multiple specs) is a hard error by default; --spec-id forces ambiguous
 * markers into the given spec.
 *
 * @param {string} projectRoot
 * @param {{ apply: boolean, explicitSpecId?: string }} options
 * @returns {{ scanned: number, updated: string[], skipped: string[], errors: Array<{path:string, reason:string}>, dryRun: boolean }}
 */
function backfillMarkers(projectRoot, { apply, explicitSpecId } = {}) {
  const { execFileSync } = require('node:child_process');
  const result = {
    scanned: 0,
    updated: [],
    skipped: [],
    errors: [],
    dryRun: !apply,
  };

  let worktreeList;
  try {
    worktreeList = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    console.error(`Error: failed to list git worktrees: ${err.message}`);
    process.exit(1);
  }

  const paths = [];
  for (const line of worktreeList.split('\n')) {
    if (line.startsWith('worktree ')) paths.push(line.slice(9));
  }

  // Build { epicId: [specId, ...] } once up front so per-worktree lookups
  // are O(1) instead of O(specs) × O(worktrees).
  const epicToSpecs = buildEpicSpecIndex(projectRoot);

  for (const wt of paths) {
    const markerPath = path.join(wt, '.arcforge-epic');
    if (!fs.existsSync(markerPath)) continue;
    result.scanned++;

    let marker;
    try {
      marker = parseDagYaml(fs.readFileSync(markerPath, 'utf8'));
    } catch (err) {
      result.errors.push({ path: markerPath, reason: `unreadable: ${err.message}` });
      continue;
    }

    if (marker.spec_id) {
      result.skipped.push(markerPath);
      continue;
    }
    if (!marker.epic) {
      result.errors.push({ path: markerPath, reason: 'no epic field' });
      continue;
    }

    let targetSpec = explicitSpecId;
    if (!targetSpec) {
      const matches = epicToSpecs.get(marker.epic) || [];
      if (matches.length === 1) {
        targetSpec = matches[0];
      } else if (matches.length === 0) {
        result.errors.push({
          path: markerPath,
          reason: `epic "${marker.epic}" not found in any spec`,
        });
        continue;
      } else {
        result.errors.push({
          path: markerPath,
          reason: `epic "${marker.epic}" exists in ${matches.length} specs: ${matches.join(', ')}. Rerun with --spec-id <id> to force.`,
        });
        continue;
      }
    }

    if (apply) {
      marker.spec_id = targetSpec;
      // objectToYaml matches the serializer used by coordinator.expandWorktrees
      // when the marker is first written — stringifyDagYaml would crash here,
      // it expects the { epics: [...] } DAG shape.
      fs.writeFileSync(markerPath, objectToYaml(marker));
    }
    result.updated.push(`${markerPath} → spec_id: ${targetSpec}`);
  }

  if (result.errors.length > 0) {
    process.exitCode = 2;
  }
  return result;
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

// Format output based on --json flag
function output(data, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (typeof data === 'string') {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
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

  backfill-markers [--apply] [--spec-id <id>]
      Stamp spec_id onto legacy .arcforge-epic markers that predate the
      per-spec schema. Defaults to dry-run; --apply writes.

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
  eval ab <name> [--skill-file path] A/B skill/workflow eval
      --plugin-dir   Plugin directory for treatment trials
      --max-turns    Max turns for treatment trials (overrides scenario)
  eval compare <name>                Compare A/B results
  eval report [name]                 Benchmark report
  eval history                       List benchmark snapshots
  eval dashboard [--port N]          Live web dashboard (default: 3333)

  research dashboard [--results path] [--config path] [--port N]
                                     Live research experiment dashboard (default port: 3000)

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

      case 'backfill-markers': {
        output(
          backfillMarkers(projectRoot, {
            apply: !!args.flags.apply,
            explicitSpecId: specFlag,
          }),
          asJson,
        );
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
        const eval_ = require('./lib/eval');
        const { generateRunId } = require('./lib/utils');
        const subcommand = args.positional[0];
        const model = args.options.model;
        const runId = generateRunId();
        const parseK = (scenario, isAb = false) =>
          args.options.k ? parseInt(args.options.k, 10) : eval_.defaultK(scenario || {}, isAb);
        const formatStatus = (g) => {
          if (g.gradeError) {
            return `GRADE ERROR (${g.errorType || 'unknown'}${g.error ? `: ${g.error}` : ''})`;
          }
          if (g.infraError) {
            return `INFRA ERROR (${g.errorType || 'unknown'}${g.error ? `: ${g.error}` : ''})`;
          }
          const base = g.passed ? `PASS (${g.score})` : `FAIL (${g.score})`;
          if (!g.passed && g.assertionScores) {
            const tags = g.assertionScores.map((s, i) => `A${i + 1}:${s === 1 ? '✓' : '✗'}`);
            return `${base} [${tags.join(' ')}]`;
          }
          return base;
        };

        const requireScenario = (name, cmd) => {
          if (!name) {
            console.error(`Error: eval ${cmd} requires a scenario name`);
            process.exit(1);
          }
          const scenario = eval_.findScenario(name, projectRoot);
          if (!scenario) {
            console.error(`Error: scenario "${name}" not found`);
            process.exit(1);
          }
          return scenario;
        };

        const printAbSummary = (label, opts) => {
          const { baseline, treatment, delta, deltaCi, verdict } = opts;
          const bStats = opts.bStats ?? eval_.statsFromResults(baseline);
          const tStats = opts.tStats ?? eval_.statsFromResults(treatment);
          const showCI = bStats.count >= 5 && tStats.count >= 5;
          const fmtStats = (s) => {
            const base = `${s.count} trials, avg ${s.avg.toFixed(2)}`;
            const ci = showCI ? ` [${s.ci95.lower}, ${s.ci95.upper}]` : '';
            return `${base}${ci}, pass ${(s.passRate * 100).toFixed(0)}%`;
          };
          console.log(`${label}Baseline:  ${fmtStats(bStats)}`);
          console.log(`${label}Treatment: ${fmtStats(tStats)}`);
          const ciStr = deltaCi && showCI ? ` CI[${deltaCi.lower}, ${deltaCi.upper}]` : '';
          console.log(`${label}Delta:     ${delta > 0 ? '+' : ''}${delta.toFixed(2)}${ciStr}`);
          console.log(`${label}Verdict:   ${verdict}`);
          const warning = eval_.confidenceWarning(baseline) || eval_.confidenceWarning(treatment);
          if (warning) console.log(`${label}${warning}`);
        };

        if (subcommand === 'list') {
          const scenarios = eval_.listScenarios(projectRoot);
          if (scenarios.length === 0) {
            console.log('No scenarios found in evals/scenarios/');
          } else {
            for (const file of scenarios) {
              const s = eval_.parseScenario(file);
              const isAb = s.scope === 'skill' || s.scope === 'workflow';
              const resultsName = isAb ? `${s.name}-treatment` : s.name;
              let results = eval_.loadResults(resultsName, projectRoot, { version: s.version });
              if (results.length === 0 && isAb) {
                results = eval_.loadResults(s.name, projectRoot, { version: s.version });
              }
              const verdict = results.length > 0 ? eval_.getVerdict(results) : 'NO RUNS';
              console.log(`  ${s.name} (${s.scope}, ${s.grader}) — ${verdict}`);
            }
          }
        } else if (subcommand === 'run') {
          const scenario = requireScenario(args.positional[1], 'run');
          const k = parseK(scenario, false);
          const isolated = !args.flags['no-isolate'];
          const pluginDir = args.options['plugin-dir'];
          const maxTurns = args.options['max-turns']
            ? parseInt(args.options['max-turns'], 10)
            : undefined;
          const modelLabel = model ? ` [model: ${model}]` : '';
          console.log(`Running ${scenario.name} (k=${k})${modelLabel}...`);

          let rl;
          try {
            if (scenario.grader === 'human') {
              const readline = require('node:readline');
              rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            }

            for (let t = 1; t <= k; t++) {
              process.stdout.write(`  Trial ${t}/${k}: `);
              const result = eval_.runTrial(scenario, t, k, {
                projectRoot,
                model,
                runId,
                isolated,
                pluginDir,
                maxTurns,
              });
              let graded = eval_.gradeTrialResult(result, scenario, projectRoot, result.actions);

              if (graded.grader === 'human-pending') {
                console.log('HUMAN REVIEW');
                console.log('\n--- Trial Output ---');
                const outputText = result.output || result.error || '(no output)';
                console.log(outputText.split('\n').slice(0, 200).join('\n'));
                console.log('--- End Output ---\n');
                graded = await eval_.gradeWithHuman(graded, rl);
              }

              const versioned = scenario.version
                ? { ...graded, version: scenario.version }
                : graded;
              eval_.appendResult(versioned, projectRoot);
              console.log(formatStatus(graded));
            }
          } finally {
            if (rl) rl.close();
          }

          const results = eval_
            .loadResults(scenario.name, projectRoot, {
              version: scenario.version,
              since: args.options.since,
            })
            .slice(-k);
          const verdictOpts = scenario.grader === 'model' ? { useCi: true } : {};
          console.log(`Verdict: ${eval_.getVerdict(results, verdictOpts)}`);
        } else if (subcommand === 'ab') {
          const scenario = requireScenario(args.positional[1], 'ab');
          const k = parseK(scenario, true);
          const interleave = !!args.flags.interleave;
          const pluginDir = args.options['plugin-dir'];
          const maxTurns = args.options['max-turns']
            ? parseInt(args.options['max-turns'], 10)
            : undefined;
          const onTrialComplete = (label, t, graded) => {
            console.log(`  [${label}] Trial ${t}/${k}: ${formatStatus(graded)}`);
          };

          let result;
          if (scenario.scope === 'workflow') {
            console.log(
              `A/B eval (workflow): ${scenario.name} (k=${k})${interleave ? ' [interleaved]' : ''}`,
            );
            console.log('Baseline: isolated (no plugins/MCP) | Treatment: full toolkit\n');
            result = eval_.runWorkflowEval(scenario, k, {
              projectRoot,
              interleave,
              onTrialComplete,
              model,
              runId,
              pluginDir,
              maxTurns,
            });
          } else {
            const skillFile = args.options['skill-file'] || scenario.target;
            if (!skillFile) {
              console.error(
                'Error: eval ab for skill scope requires --skill-file <path> or ## Target in scenario',
              );
              process.exit(1);
            }
            const resolvedSkillFile = path.resolve(projectRoot, skillFile);
            if (!fs.existsSync(resolvedSkillFile)) {
              console.error(`Error: skill file not found: ${skillFile}`);
              process.exit(1);
            }
            const skillInstruction = fs.readFileSync(resolvedSkillFile, 'utf8');
            console.log(
              `A/B eval (skill): ${scenario.name} (k=${k})${interleave ? ' [interleaved]' : ''}`,
            );
            console.log(`Skill: ${skillFile}\n`);
            result = eval_.runSkillEval(scenario, k, {
              projectRoot,
              skillInstruction,
              interleave,
              onTrialComplete,
              model,
              runId,
              pluginDir,
              maxTurns,
            });
          }

          printAbSummary('\n', {
            baseline: result.baseline,
            treatment: result.treatment,
            delta: result.delta,
            deltaCi: eval_.ciForDelta(result.baseline, result.treatment),
            verdict: eval_.verdictFromDeltaCI(result.baseline, result.treatment),
          });
        } else if (subcommand === 'compare') {
          const name = args.positional[1];
          if (!name) {
            console.error('Error: eval compare requires a scenario name');
            process.exit(1);
          }

          const scenario = eval_.findScenario(name, projectRoot);
          const filterOpts = {
            version: scenario?.version,
            since: args.options.since,
            ...(model ? { model } : {}),
          };
          const baseline = eval_.loadResults(`${name}-baseline`, projectRoot, filterOpts);
          const treatment = eval_.loadResults(`${name}-treatment`, projectRoot, filterOpts);

          if (baseline.length === 0 || treatment.length === 0) {
            console.error(
              'Error: need both baseline and treatment results. Run: arc eval ab <name>',
            );
            process.exit(1);
          }

          console.log(`A/B Comparison: ${name}`);
          if (scenario && scenario.grader !== 'code') {
            console.log('(Using eval-comparator agent for qualitative analysis...)\n');
          }
          const comparison = eval_.compareResults(
            scenario || { grader: 'code' },
            baseline,
            treatment,
            projectRoot,
          );
          printAbSummary('  ', {
            baseline,
            treatment,
            delta: comparison.delta,
            deltaCi: comparison.deltaCi,
            verdict: comparison.verdict,
            bStats: comparison.baseline,
            tStats: comparison.treatment,
          });
          if (comparison.baselineWarning) console.log(`  ${comparison.baselineWarning}`);
          if (comparison.modelAnalysis) {
            console.log(`\n  Analysis: ${comparison.modelAnalysis.analysis || ''}`);
            console.log(`  Recommendation: ${comparison.modelAnalysis.recommendation || ''}`);
          }
        } else if (subcommand === 'report') {
          const benchmark = eval_.generateBenchmark(projectRoot);
          const name = args.positional[1];

          if (name && benchmark.evals[name]) {
            const data = benchmark.evals[name];
            if (model && data.by_model && data.by_model[model]) {
              output(data.by_model[model], asJson);
            } else {
              output(data, asJson);
            }
          } else {
            if (Object.keys(benchmark.evals).length === 0) {
              console.log('No eval results yet. Run: arc eval run <scenario>');
            } else {
              for (const [evalName, data] of Object.entries(benchmark.evals)) {
                const displayData = model && data.by_model?.[model] ? data.by_model[model] : data;
                let verdict;
                if (data.grader === 'model' && displayData.trials >= 5) {
                  const scenarioFile = eval_.findScenario(evalName, projectRoot);
                  const results = eval_.loadResults(evalName, projectRoot, {
                    version: scenarioFile?.version,
                    ...(model ? { model } : {}),
                  });
                  verdict =
                    results.length >= 5
                      ? eval_.verdictFromCI(results)
                      : eval_.verdictFromRate(displayData.pass_rate);
                } else {
                  verdict = eval_.verdictFromRate(displayData.pass_rate);
                }
                console.log(
                  `  ${evalName}: ${(displayData.pass_rate * 100).toFixed(0)}% (${displayData.trials} trials) — ${verdict}`,
                );
                if (!model && data.by_model) {
                  const parts = Object.entries(data.by_model).map(
                    ([m, ms]) => `${m}: ${(ms.pass_rate * 100).toFixed(0)}% (${ms.trials})`,
                  );
                  console.log(`    ${parts.join(' | ')}`);
                }
              }
            }
          }
        } else if (subcommand === 'history') {
          const benchmarkPath = path.join(projectRoot, eval_.BENCHMARKS_DIR);
          if (!fs.existsSync(benchmarkPath)) {
            console.log('No benchmarks yet. Run: arc eval report');
          } else {
            const snapshots = fs
              .readdirSync(benchmarkPath)
              .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
              .sort();
            if (snapshots.length === 0) {
              console.log('No history snapshots yet. Run: arc eval report');
            } else {
              for (const file of snapshots) {
                const data = JSON.parse(fs.readFileSync(path.join(benchmarkPath, file), 'utf8'));
                const evalCount = Object.keys(data.evals).length;
                console.log(`  ${file.replace('.json', '')} — ${evalCount} evals`);
              }
            }
          }
        } else if (subcommand === 'dashboard') {
          const { startServer } = require('./eval-dashboard');
          const port = args.options.port ? parseInt(args.options.port, 10) : 3333;
          startServer(projectRoot, { port });
        } else {
          console.error('Usage: arc eval [list|run|ab|compare|report|history|dashboard]');
          process.exit(1);
        }
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
