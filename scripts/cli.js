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
 *   worktree add|list|remove        Generic (non-epic) worktree management
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
 *
 * Command handlers live in scripts/cli/ (dag-commands, eval-command,
 * learn-command, obsidian-command, ratify-command, help); this file owns
 * argument parsing and dispatch only.
 */

const path = require('node:path');
const { schemaToYaml, exampleToYaml, example, schema } = require('./lib/dag-schema');
const { output } = require('./cli/shared');
const { runDagCommand } = require('./cli/dag-commands');
const { runEvalCommand } = require('./cli/eval-command');
const { printHelp } = require('./cli/help');
const { runLearnCommand } = require('./cli/learn-command');
const { runObsidianCommand } = require('./cli/obsidian-command');
const { runRatifyCommand } = require('./cli/ratify-command');
const { runSddGateCommand } = require('./cli/sdd-gate-command');

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
      case 'status':
      case 'next':
      case 'complete':
      case 'block':
      case 'parallel':
      case 'expand':
      case 'merge':
      case 'cleanup':
      case 'sync':
      case 'reboot':
      case 'loop': {
        runDagCommand(args, { projectRoot, asJson });
        break;
      }

      case 'worktree': {
        // Generic (non-epic) worktree management. Engine + dispatch live in
        // scripts/lib/worktree-generic.js; epic worktrees stay with
        // expand/cleanup (remove redirects marker'd trees there).
        const { runWorktreeCommand } = require('./lib/worktree-generic');
        output(runWorktreeCommand(args, projectRoot), asJson);
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

      case 'ratify': {
        // arcforge ratify <spec-id> <D-id>
        // Engine B1 gate + interactive informed confirm. See scripts/cli/ratify-command.js.
        await runRatifyCommand(args.positional, projectRoot);
        break;
      }

      case 'sdd-gate': {
        // arcforge sdd-gate <dag|design|context|header|authorize|conflict> ...
        // Deterministic SDD gates lifting refiner/planner inline node -e recipes.
        // Stable JSON + exit 0/1/2; header/authorize read draft spec.xml from
        // stdin. See scripts/cli/sdd-gate-command.js.
        runSddGateCommand(args, projectRoot);
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
