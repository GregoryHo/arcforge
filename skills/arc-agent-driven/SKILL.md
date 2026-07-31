---
name: arc-agent-driven
description: Execute a task list with one fresh subagent per task plus a single task-reviewer each. Use when tasks need isolated contexts to avoid cross-task pollution; for in-session human-checkpoint execution use arc-executing-tasks.
category: orchestration
status: promoted
---

# arc-agent-driven

Execute a plan by dispatching a fresh subagent per task, with one task-reviewer after each that returns both verdicts in a single pass: spec compliance and task quality.

**Core principle:** Fresh subagent per task + one task-reviewer returning both verdicts (spec compliance + task quality) = high quality, fast iteration.

## When to Use

- You have a task list (from arc-writing-tasks) whose tasks are mostly independent.
- You want automated execution without a human checkpoint between tasks.

**vs. arc-executing-tasks** (human-checkpoint mode): fresh subagent per task (no context pollution), one task-reviewer after each, faster iteration.

## The Process

1. Read tasks, create a task list.
2. Per task: dispatch an implementer subagent (answer its questions before and during work); it implements, tests, commits, self-reviews.
3. Dispatch one task-reviewer that returns both verdicts (spec compliance + task quality) from a single read of the change.
4. If issues: one fix pass addresses spec gaps and quality findings together, then re-review covers both verdicts. Fan out to `arc-dispatching-parallel` only when findings are genuinely independent; otherwise a single batch-fix dispatch is the default.
5. Both verdicts clean → mark the task complete; move to the next.
6. After all tasks: dispatch a final whole-branch code reviewer, then run the completion pipeline — arc-verifying (confirm requirements met and tests pass), then arc-finishing (Step 0 discriminates on `.arcforge-epic`).

**Max review cycles: 3 per task.** If not converging, escalate to a human with a summary of unresolved issues.

### Per-Task File Handoff

Hand each subagent a file, not a wall of pasted text. The brief and the review
package live in the self-ignoring `.arcforge/sdd/` workspace:

1. **Before dispatching the implementer**, record the current commit as the task
   BASE: `git rev-parse HEAD`. Optionally assemble the brief with
   `node "${CLAUDE_PLUGIN_ROOT}/skills/arc-agent-driven/scripts/task-brief.js" --task "<text>" --acceptance "<criteria>" --base <BASE>`
   (it prints the brief path).
2. **After the implementer commits**, build the review package for the whole task
   range — never just the last commit — with
   `node "${CLAUDE_PLUGIN_ROOT}/skills/arc-agent-driven/scripts/review-package.js" <BASE> HEAD`.
   It writes the commit list plus `git diff --stat` and `git diff -U10` for
   `<BASE>..HEAD` into one file and prints that file's path.
3. **Hand the task-reviewer that path** as `{DIFF_FILE}`. The reviewer reads the
   package once; it does not re-run git or crawl the codebase.

Record BASE from *before* the implementer ran so a multi-commit task stays whole.
`HEAD~1` as the base would truncate the package to the final commit.

### Durable Progress Ledger

Session todos and terminal narration don't survive a fresh session or a mid-run
compaction, and neither carries a git-verifiable commit range — so you can
re-dispatch an already-completed task (the most expensive failure). Persist
per-task completion to a ledger file.

- **Ledger:** `.arcforge/sdd/progress.md` — the same self-ignoring workspace the
  brief and review packages use; a runtime recovery artifact, not tracked.
- **At skill start**, `cat .arcforge/sdd/progress.md`. If it exists, trust it plus
  `git log` and resume AFTER the last task marked complete — do not re-dispatch
  tasks it lists.
- **After each clean review**, append `Task N: complete (commits <base7>..<head7>,
  review clean)` in the same message as your other bookkeeping. Those commits
  exist in git even when your context no longer remembers creating them.
- `git clean -fdx` destroys the ledger; reconstruct progress from `git log`.

### Model Selection

**Name a model on every dispatch — never rely on inherit.** An omitted model
inherits your session's tier, often the most expensive one. The Task/subagent
`model` parameter overrides the agent's frontmatter default; the `sonnet` values
below are the mid-tier floor, not a ceiling.

- **Transcription implementer → `haiku`.** A well-formed arc-writing-tasks task
  carries "Exact code — Complete code", so it is transcription plus testing — as
  are single-file mechanical fixes.
- **Prose-plan implementer and the task-reviewer → `sonnet` floor.** Cheaper
  models take 2-3× the turns on multi-step judgment, costing more overall. Scale
  the reviewer above the floor only for a large or subtle diff.
- **Final whole-branch review → `opus`** — the one architecture-level judgment
  here.

**Headless caveat (arc-looping):** the loop path spawns agents through headless
`claude -p`, which strips agent frontmatter and does NOT honor a `model:` pin
(`scripts/lib/loop-verifier.js`) — under arc-looping, pass
`--model` explicitly on the dispatch, or the intended tier is ignored.

## Agents & Templates

Two ways to dispatch each role, depending on platform support.

**Pre-built agents** (when your platform supplies named subagents) bundle tool
isolation and methodology:

| Agent | Role | Model | Access |
|-------|------|-------|--------|
| **implementer** | TDD implementation | sonnet | Read, Write, Edit, Bash, Grep |
| **task-reviewer** | Per-task gate: spec compliance + task quality in one pass | sonnet | Read, Grep, Glob, Bash |

**Templates** (cross-platform fallback — custom prompts, or when named agents
aren't available; they carry the full role prompt):
- `./implementer-prompt.md`
- `./task-reviewer-prompt.md`

The workflow — fresh implementer per task, then one task-review returning both
verdicts — is identical however the subagent is launched (Codex or Claude Code).

## Red Flags

**Never:**

- Mark a task complete before both verdicts (spec compliance AND task quality) are clean, or move to the next task while the task-reviewer has open issues on either verdict
- Start implementation on main/master without explicit user consent
- Dispatch multiple implementation subagents in parallel (conflicts)
- Make a subagent read the task file — provide the full text instead
- **Coach the reviewer** — never tell the task-reviewer to ignore specific issues, and never pre-assign a severity; it categorizes findings by their actual severity, independently
- **Let the plan grade its own work** — a defect the plan explicitly mandated (a test that asserts nothing, verbatim duplication) is still a finding: reported Important and labeled **plan-mandated** for the human to decide, never silently accepted
- Hand a reviewer a bare diff and let it re-run git or crawl the codebase — build the review package and give it the file path instead
- Use `HEAD~1` as the review base — it truncates a multi-commit task to its last commit; record the pre-implementer BASE and package `BASE..HEAD`
- **Re-dispatch a task the ledger marks complete** — reconcile the ledger against `git log` before dispatching anything

## Integration

**Required workflow skills:**

- **arc-using-worktrees** — REQUIRED: set up an isolated workspace before starting
- **arc-writing-tasks** — creates the task list this skill executes
- **arc-reviewing** — code-review template for reviewer subagents
- **arc-finishing** (Step 0 discriminates on `.arcforge-epic`) — complete development after all tasks

**Subagents should use arc-tdd** for TDD on each task.

**Alternative:** arc-executing-tasks — human-checkpoint mode instead of automated.
