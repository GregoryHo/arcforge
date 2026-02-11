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
 *   expand [--verify] [--verify-cmd "..."]  Create worktrees for ready epics
 *   merge [epic_ids...] [--base branch]     Merge epics to base
 *   cleanup [epic_ids...]           Remove worktrees for completed epics
 *   sync [--direction from-base|to-base|both|scan]  Sync state
 *   reboot                          Get context for new session
 *   schema [--json] [--example]     Show dag.yaml schema
 */

const _path = require('node:path');
const { Coordinator } = require('./lib/coordinator');
const { schemaToYaml, exampleToYaml, example, schema } = require('./lib/dag-schema');

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
arcforge CLI - DAG management for skill-based agent pipelines

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

  expand [--verify] [--verify-cmd "..."]
      Create git worktrees for ready epics.
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
          verify: args.flags.verify,
          verifyCommand: verifyCmd ? verifyCmd.split(' ') : undefined,
        });
        output(
          {
            created: created.length,
            epics: created.map((e) => ({
              id: e.id,
              worktree: e.worktree,
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
