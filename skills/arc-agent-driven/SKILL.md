---
name: arc-agent-driven
description: Use when executing task lists where each task requires isolated execution
---

# arc-agent-driven

Execute plan by dispatching fresh subagent per task, with one task-reviewer after each that returns both verdicts in a single pass: spec compliance and task quality.

**Core principle:** Fresh subagent per task + one task-reviewer returning both verdicts (spec compliance + task quality) = high quality, fast iteration

## When to Use

```dot
digraph when_to_use {
    "Have task list?" [shape=diamond];
    "Tasks mostly independent?" [shape=diamond];
    "Want automated execution?" [shape=diamond];
    "arc-agent-driven" [shape=box];
    "arc-executing-tasks" [shape=box];
    "Use writing-tasks first" [shape=box];

    "Have task list?" -> "Tasks mostly independent?" [label="yes"];
    "Have task list?" -> "Use writing-tasks first" [label="no"];
    "Tasks mostly independent?" -> "Want automated execution?" [label="yes"];
    "Tasks mostly independent?" -> "arc-executing-tasks" [label="no - need human checkpoints"];
    "Want automated execution?" -> "arc-agent-driven" [label="yes"];
    "Want automated execution?" -> "arc-executing-tasks" [label="no - want control"];
}
```

**vs. arc-executing-tasks:**

- Fresh subagent per task (no context pollution)
- One task-reviewer (both verdicts) after each task
- Faster iteration (no human-in-loop between tasks)

## The Process

```dot
digraph process {
    rankdir=TB;

    subgraph cluster_per_task {
        label="Per Task";
        "Dispatch implementer subagent" [shape=box];
        "Implementer asks questions?" [shape=diamond];
        "Answer questions" [shape=box];
        "Implementer implements, tests, commits, self-reviews" [shape=box];
        "Dispatch task-reviewer subagent" [shape=box];
        "Review clean? (both verdicts)" [shape=diamond];
        "Multiple independent issues?" [shape=diamond];
        "Use arc-dispatching-parallel for fixes" [shape=box];
        "Implementer fixes issues (single batch)" [shape=box];
        "Mark task complete" [shape=box];
    }

    "Read tasks, create task list" [shape=box];
    "More tasks?" [shape=diamond];
    "Dispatch final code reviewer" [shape=box];
    "Use arc-finishing" [shape=box style=filled fillcolor=lightgreen];

    "Read tasks, create task list" -> "Dispatch implementer subagent";
    "Dispatch implementer subagent" -> "Implementer asks questions?";
    "Implementer asks questions?" -> "Answer questions" [label="yes"];
    "Answer questions" -> "Dispatch implementer subagent";
    "Implementer asks questions?" -> "Implementer implements, tests, commits, self-reviews" [label="no"];
    "Implementer implements, tests, commits, self-reviews" -> "Dispatch task-reviewer subagent";
    "Dispatch task-reviewer subagent" -> "Review clean? (both verdicts)";
    "Review clean? (both verdicts)" -> "Multiple independent issues?" [label="no"];
    "Multiple independent issues?" -> "Use arc-dispatching-parallel for fixes" [label="yes - fan out"];
    "Multiple independent issues?" -> "Implementer fixes issues (single batch)" [label="no - one fix pass"];
    "Use arc-dispatching-parallel for fixes" -> "Dispatch task-reviewer subagent";
    "Implementer fixes issues (single batch)" -> "Dispatch task-reviewer subagent";
    "Review clean? (both verdicts)" -> "Mark task complete" [label="yes"];
    "Mark task complete" -> "More tasks?";
    "More tasks?" -> "Dispatch implementer subagent" [label="yes"];
    "More tasks?" -> "Dispatch final code reviewer" [label="no"];
    "Dispatch final code reviewer" -> "Use arc-finishing";
}
```

**Max review cycles: 3 per task.** If not converging, escalate to human with summary of unresolved issues.

The single task-reviewer returns both verdicts (spec compliance + task quality) from
one read of the change. When it finds issues, one fix pass addresses spec gaps and
quality findings together, then re-review covers both verdicts. Fan out to
`arc-dispatching-parallel` only when the findings are genuinely independent; otherwise
a single batch-fix dispatch is the default.

### Per-Task File Handoff

Hand each subagent a file, not a wall of pasted text. The brief and the review
package live in the self-ignoring `.arcforge/sdd/` workspace:

1. **Before dispatching the implementer**, record the current commit as the task
   BASE: `git rev-parse HEAD`. Optionally assemble the brief with
   `: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"; node "${ARCFORGE_ROOT}/skills/arc-agent-driven/scripts/task-brief.js" --task "<text>" --acceptance "<criteria>" --base <BASE>`
   (it prints the brief path).
2. **After the implementer commits**, build the review package for the whole task
   range — never just the last commit — with
   `: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"; node "${ARCFORGE_ROOT}/skills/arc-agent-driven/scripts/review-package.js" <BASE> HEAD`.
   It writes the commit list plus `git diff --stat` and `git diff -U10` for
   `<BASE>..HEAD` into one file and prints that file's path.
3. **Hand the task-reviewer that path** as `{DIFF_FILE}`. The reviewer reads the
   package once; it does not re-run git or crawl the codebase.

Record BASE from *before* the implementer ran so a multi-commit task stays whole.
`HEAD~1` as the base would truncate the package to the final commit.

### Durable Progress Ledger

TodoWrite and terminal narration track per-task progress only in your session —
a fresh session loses them, a mid-run auto-compaction drops the narration, and
neither carries a git-verifiable commit range to recover from. Either way you can
lose your place and re-dispatch an already-completed task (the single most
expensive failure). Persist per-task completion to a ledger file, not only to todos.

- **Ledger file:** `.arcforge/sdd/progress.md` — the same self-ignoring
  `.arcforge/sdd/` workspace the brief and review packages use. It is a runtime
  recovery artifact, not a tracked file. (Alternative for those who want it
  tracked: also tick the task's checkbox in `docs/tasks/<feature>-tasks.md`.)
- **At skill start**, check the ledger (`cat .arcforge/sdd/progress.md`). If it
  exists, trust it plus `git log` and resume AFTER the last task marked complete
  — do not re-dispatch tasks it already lists.
- **After each clean review** (both verdicts clean), append one line in the same
  message as your other bookkeeping:
  `Task N: complete (commits <base7>..<head7>, review clean)`. The commits it
  names exist in git even when your context no longer remembers creating them.
- `git clean -fdx` destroys the ledger (git-ignored scratch); if that happens,
  reconstruct progress from `git log`.

### Model Selection

**Name a model on every dispatch — never rely on inherit.** An omitted model
inherits your session's model, often the most expensive tier — one real run let
26 reviewers silently inherit the top tier that way. The Task/subagent `model`
parameter overrides an agent's frontmatter default, so you request the tier per
dispatch; the `sonnet` values in the Available Agents table below are the
mid-tier floor, not a ceiling.

Match each role to the cheapest tier that fits:

- **Transcription implementer → `haiku`.** arc-writing-tasks requires each task
  to carry "Exact code — Complete code", so a well-formed task is transcription
  plus testing — the cheapest tier handles it, as do single-file mechanical fixes.
- **Prose-plan implementer and the task-reviewer → `sonnet` floor.** Turn count
  beats token price: cheaper models routinely take 2-3× the turns on multi-step
  judgment work, costing more overall. Scale the reviewer above the floor only for
  a large or subtle diff.
- **Final whole-branch review → `opus`** — the strongest recognized tier, pinned
  in `agents/code-reviewer.md`. It is the one architecture-level judgment here;
  do not let it ride the session default.

**Headless caveat (arc-looping):** the loop path spawns agents through headless
`claude -p`, which strips agent frontmatter and does NOT honor a `model:` pin
(`${ARCFORGE_ROOT}/scripts/lib/loop-verifier.js`) — under arc-looping, pass `--model` explicitly
on the dispatch, or the intended tier is ignored.

## Agents & Templates

Two ways to dispatch each role, depending on what your platform supports:

**Pre-built agents (when your platform supports named subagents — e.g. Claude
Code's `agents/`):** they bundle tool isolation and methodology.
- `implementer` — TDD implementation with full write access
- `task-reviewer` — Single per-task gate: spec compliance + task quality in one pass (read-only + focused test)

**Templates (cross-platform fallback — for custom prompts or when named agents
aren't available):**
- `./implementer-prompt.md` - Implementer prompt with placeholders
- `./task-reviewer-prompt.md` - Per-task review prompt returning both verdicts (spec compliance + task quality)

## Cross-Platform Dispatch

This skill is platform-agnostic: it needs only the ability to run a fresh
subagent per task. The named agents above are a Claude Code convenience; on any
platform (Codex, Gemini CLI, OpenCode, or Claude Code) you can dispatch each
role from the templates instead, using whatever subagent mechanism your harness
provides. The templates carry the full role prompt, so the workflow — fresh
implementer per task, then a single task-review returning both verdicts (spec
compliance + task quality) — is identical regardless of how the subagent is launched.

## Example Workflow

```
You: I'm using arc-agent-driven to execute these tasks.

[Read task file: docs/tasks/sync-command-tasks.md]
[Create a task list with all 5 tasks]

Task 1: Add SyncResult dataclass

[Dispatch implementer subagent with full task text + context]

Implementer: "Before I begin - should SyncResult be in models.py or a new file?"

You: "In models.py with other dataclasses"

Implementer:
  - Implemented SyncResult dataclass
  - Added tests, 3/3 passing
  - Self-review: All good
  - Committed: abc1234 "feat(models): add SyncResult dataclass"

[Dispatch task-reviewer — returns both verdicts in one pass]
Task reviewer:
  Spec Compliance: ✅ Spec compliant - all fields present, nothing extra
  Task Quality: Strengths: Clean, typed. Issues: None. Approved.

[Mark Task 1 complete]

Task 2: Add sync CLI command
...

[After all tasks]
[Dispatch final code reviewer for entire implementation]
Final reviewer: All requirements met, architecture solid

Done! Completion pipeline:
1. Run arc-verifying — confirm all requirements met and tests pass
2. Use arc-finishing (Step 0 discriminates on .arcforge-epic) to decide merge/PR/keep/discard
```

## Available Agents

The full agent roster for arc-agent-driven workflows:

| Agent | Role | Model | Access |
|-------|------|-------|--------|
| **implementer** | TDD implementation | sonnet | Read, Write, Edit, Bash, Grep |
| **task-reviewer** | Per-task review: spec compliance + task quality | sonnet | Read, Grep, Glob, Bash |

## Subagents Should Use

- **arc-tdd** - Implementer follows TDD for each task

## Advantages

**vs. Manual execution:**

- Subagents follow TDD naturally
- Fresh context per task (no confusion)
- Subagent can ask questions (before AND during work)

**vs. arc-executing-tasks:**

- Same session (no handoff)
- Continuous progress (no waiting)
- Review checkpoints automatic

**Quality gates:**

- Self-review catches issues before handoff
- Single task-reviewer returns both verdicts: spec compliance and task quality
- Review loops ensure fixes actually work

## Red Flags

**Never:**

- Skip the task-reviewer gate — mark a task complete before both verdicts (spec compliance AND task quality) are clean
- Proceed with unfixed issues
- Start implementation on main/master branch without explicit user consent
- Dispatch multiple implementation subagents in parallel (conflicts)
- Make subagent read task file (provide full text instead)
- Skip scene-setting context
- Ignore subagent questions
- Accept "close enough" on spec compliance
- Skip review loops
- Let implementer self-review replace actual review
- **Coach the reviewer** — never tell the task-reviewer to ignore specific issues, and never pre-assign a severity; it categorizes findings by their actual severity, independently
- **Let the plan grade its own work** — a defect the plan explicitly mandated (a test that asserts nothing, verbatim duplication) is still a finding: reported Important and labeled **plan-mandated** for the human to decide, never silently accepted
- Move to next task while the task-reviewer has open issues on either verdict
- Hand a reviewer a bare diff and let it re-run git or crawl the codebase — build the review package and give it the file path instead
- Use `HEAD~1` as the review base — it truncates a multi-commit task to its last commit; record the pre-implementer BASE and package `BASE..HEAD`
- **Re-dispatch a task the ledger marks complete** — a ledger-complete task is DONE; on resume, reconcile the ledger against `git log` before dispatching anything

**If subagent asks questions:**

- Answer clearly and completely
- Provide additional context if needed
- Don't rush them into implementation

**If reviewer finds issues:**

- Implementer fixes them
- Reviewer reviews again
- Repeat until approved

## Integration

**Required workflow skills:**

- **arc-using-worktrees** — REQUIRED: Set up isolated workspace before starting
- **arc-writing-tasks** - Creates the task list this skill executes
- **arc-requesting-review** - Code review template for reviewer subagents
- **arc-finishing** (Step 0 discriminates on `.arcforge-epic`) - Complete development after all tasks

**Subagents should use:**

- **arc-tdd** - TDD for each task

**Alternative workflow:**

- **arc-executing-tasks** - Use for human checkpoint mode instead of automated
