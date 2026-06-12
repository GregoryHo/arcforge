/**
 * help.js - Usage help text for the arcforge CLI.
 */

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

module.exports = { printHelp };
