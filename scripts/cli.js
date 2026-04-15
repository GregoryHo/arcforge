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
const { Coordinator } = require('./lib/coordinator');
const { schemaToYaml, exampleToYaml, example, schema } = require('./lib/dag-schema');
const { getWorktreePath } = require('./lib/worktree-paths');

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

COMMANDS:
  status [--blocked] [--json]
      Show status of all epics and blocked items.
      --blocked    Show only blocked items
      --json       Output as JSON

  next
      Get the next task to work on.

  complete <task_id>
      Mark a task as completed.

  block <task_id> <reason>
      Mark a task as blocked with a reason.

  parallel
      List all epics that can be worked on in parallel.

  expand [--epic <id>] [--project-setup] [--verify] [--verify-cmd "..."]
      Create git worktrees for ready epics at ~/.arcforge/worktrees/.
      --epic           Expand only the named epic (single-epic mode)
      --project-setup  Auto-detect and run installer (npm/pip/cargo/go)
      --verify         Run tests after creation
      --verify-cmd     Custom test command (default: auto-detect)

  merge [epic_ids...] [--base branch]
      Merge completed epics to base branch.
      --base           Target branch (default: current)

  cleanup [epic_ids...]
      Remove worktrees for completed epics.

  sync [--direction from-base|to-base|both|scan]
      Synchronize state between worktree and base DAG.
      --direction      Sync direction (auto-detected if omitted)

  reboot
      Get context summary for starting a new session.

  schema [--json] [--example]
      Show dag.yaml schema.
      --json       Output schema as JSON
      --example    Show complete example

  loop [--pattern sequential|dag] [--max-runs N] [--max-cost N] [--epic <id>]
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
    switch (args.command) {
      case 'status': {
        const coord = new Coordinator(projectRoot);
        const status = coord.status({ blockedOnly: args.flags.blocked });
        output(status, asJson);
        break;
      }

      case 'next': {
        const coord = new Coordinator(projectRoot);
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
        const coord = new Coordinator(projectRoot);
        coord.completeTask(args.positional[0]);
        output({ success: true, task_id: args.positional[0] }, asJson);
        break;
      }

      case 'block': {
        if (args.positional.length < 2) {
          console.error('Error: task_id and reason required');
          process.exit(1);
        }
        const coord = new Coordinator(projectRoot);
        coord.blockTask(args.positional[0], args.positional[1]);
        output({ success: true, task_id: args.positional[0] }, asJson);
        break;
      }

      case 'parallel': {
        const coord = new Coordinator(projectRoot);
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
        const coord = new Coordinator(projectRoot);
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
              path: getWorktreePath(projectRoot, e.id),
            })),
          },
          asJson,
        );
        break;
      }

      case 'merge': {
        const coord = new Coordinator(projectRoot);
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
        const coord = new Coordinator(projectRoot);
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
        const coord = new Coordinator(projectRoot);
        // Convert direction format (from-base -> from_base)
        let direction = args.options.direction;
        if (direction) {
          direction = direction.replace(/-/g, '_');
        }
        const result = coord.sync({ direction });
        output(result.toObject ? result.toObject() : result, asJson);
        break;
      }

      case 'reboot': {
        const coord = new Coordinator(projectRoot);
        const context = coord.rebootContext();
        output(context, asJson);
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
        const { runSequential, runDag } = require('./loop');
        const pattern = args.options.pattern || 'sequential';
        const maxRuns = args.options['max-runs'] ? parseInt(args.options['max-runs'], 10) : 50;
        const maxCost = args.options['max-cost'] ? parseFloat(args.options['max-cost']) : null;

        if (!['sequential', 'dag'].includes(pattern)) {
          console.error(`Error: Invalid pattern "${pattern}". Use "sequential" or "dag".`);
          process.exit(1);
        }

        const epic = args.options.epic || null;
        const loopOptions = { pattern, maxRuns, maxCost, epic, projectRoot };
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
