/**
 * help.js - Usage help text for the arcforge CLI.
 */

// Print usage help
function printHelp() {
  console.log(`
arcforge CLI - engine surface for the arcforge skill toolkit

USAGE:
  node scripts/cli.js <command> [options]

COMMANDS:
  worktree add <name> [--branch <b>] [--from <ref>] [--setup]
      Create a generic (non-epic) worktree at ~/.arcforge/worktrees/.
      --branch         Branch to check out (default: <name>; created if missing)
      --from           Base ref when creating a new branch (default: HEAD)
      --setup          Auto-detect and run installer (npm/pip/cargo/go)

  worktree list [--json]
      List all worktrees annotated by kind: base|epic|generic|external.

  worktree remove <name> [--force]
      Remove a generic worktree and prune git metadata. Worktrees carrying an
      .arcforge-epic marker are refused.
      --force          Remove even with uncommitted changes

  loop --tasks <file> [--max-runs N] [--max-cost N] [--task-timeout N] [--model <tier>]
       [--permission-mode <mode>] [--allowed-tools <tools>] [--verify-cmd "..."]
       [--verifier] [--max-retries N] [--reset]
      Run autonomous cross-session execution loop over a markdown task list.
      --tasks            Task list to work through (required); the loop's only task state
      --max-runs         Maximum iterations (default: 50)
      --max-cost         Maximum cost in dollars (default: unlimited)
      --task-timeout     Per-session timeout in seconds (default: 600)
      --model            Pass --model through to spawned claude sessions
      --permission-mode  Pass --permission-mode through to spawned claude sessions
      --allowed-tools    Pass --allowed-tools through to spawned claude sessions
      --verify-cmd       Fallback acceptance floor for tasks with no own verify: line
      --verifier         After the floor passes, spawn an independent verifier agent;
                         FAIL → retry with feedback, exhausted/unparseable → block (opt-in)
      --max-retries      Verifier feedback retries before blocking (default: 2)
      --reset            Archive prior state to .arcforge-loop.archive/ and start fresh

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

  The workflow subgroups below take the entity id POSITIONALLY; everything else
  is a flag. --project defaults to the current project directory name, --date to
  today, and --session to $CLAUDE_SESSION_ID.

  learn diary path [--draft] [--project P] [--date D] [--session S]
                                     Print the diary path (or its draft path) for that session.
  learn diary save --content "..." [--project P] [--date D] [--session S]
                                     Write a diary entry.
  learn diary finalize [--project P] [--date D] [--session S]
                                     Promote an auto-generated draft to the final diary (rename,
                                     not a merge — edit the draft first).
  learn reflect scan [--project P] [--json]
                                     Pick the reflection strategy and list the diaries it covers.
  learn reflect record <reflect-id> [--diaries "a,b"] [--reflection FILE] [--summary "..."]
                                     Mark those diaries processed AND write the curator's
                                     reflection evidence record. Id must start with 'reflect-'.
  learn instinct status [--project P] [--json]
                                     Show instincts with confidence bars, grouped by domain.
  learn instinct check <id> [--project P]
                                     Report whether that instinct id already exists.
  learn instinct save <id> --trigger "..." --action "..." [--source manual|reflection]
                       [--domain D] [--evidence "..."] [--evidence-count N]
                                     Write an instinct. --source selects the confidence cap.
  learn instinct confirm|contradict <id> [--project P] [--json]
                                     Record agreement/disagreement with a detected pattern;
                                     a contradiction below the archive threshold archives it.
  learn recall record <recall-id> [--query "..."] [--instinct-ids "a,b"] [--summary "..."]
                                     Write the curator's evidence record for a manual recall.
                                     Id must start with 'recall-'.

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
  node scripts/cli.js worktree list --json
  node scripts/cli.js loop --tasks TASKS.md --max-runs 10
  node scripts/cli.js eval list
`);
}

module.exports = { printHelp };
