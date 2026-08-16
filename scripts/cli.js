#!/usr/bin/env node
/**
 * cli.js - CLI entry point for arcforge
 *
 * Commands:
 *   worktree add|list|remove        Generic (non-epic) worktree management
 *   loop --tasks <file> [--max-runs N] [--max-cost N]  Run autonomous loop over a task list
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
 *   obsidian register|unregister|set-default|list-vaults  Manage the vault registry
 *
 * Command handlers live in scripts/cli/ (eval-command, learn-command,
 * loop-command, obsidian-command, help); this file owns argument parsing and
 * dispatch only.
 */

const { output } = require('./cli/shared');
const { runEvalCommand } = require('./cli/eval-command');
const { printHelp } = require('./cli/help');
const { runLearnCommand } = require('./cli/learn-command');
const { runLoopCommand } = require('./cli/loop-command');
const { runObsidianCommand } = require('./cli/obsidian-command');

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
      case 'loop': {
        runLoopCommand(args, { projectRoot });
        break;
      }

      case 'worktree': {
        // Generic (non-epic) worktree management. Engine + dispatch live in
        // scripts/lib/worktree-generic.js; marker-bearing trees are refused.
        const { runWorktreeCommand } = require('./lib/worktree-generic');
        output(runWorktreeCommand(args, projectRoot), asJson);
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

      case 'obsidian': {
        runObsidianCommand(args, { asJson });
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
