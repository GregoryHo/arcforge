---
name: arc-using
description: Route an ArcForge task to the smallest useful skill or workflow. Use when unsure which skill applies or the user asks where to start — a bounded router and skill index, not an always-on policy engine.
category: meta
status: promoted
---

# arc-using

## Purpose

`arc-using` is a bounded router for ArcForge skills. It helps choose the smallest useful workflow for the current task. It is guidance, not a global law.

Use it when:

- The user asks to use ArcForge or an ArcForge skill.
- The task is an ArcForge workflow task: brainstorming, dispatching work, verifying, evaluating, or maintaining ArcForge skills.
- You are unsure which ArcForge skill should handle the next step.

Respect higher-priority instructions, explicit user constraints, and the host harness. Skills are tools, not laws — prefer the smallest useful workflow, and if one would add more friction than value, do not force it. Strong workflows are opt-in by task fit, not always-on behavior.

## How to Access Skills

**In Claude Code:** Use the `Skill` tool. When you invoke a skill, its content is loaded and presented to you — follow it directly. Never use the Read tool on skill files.

**In other environments:** Use the platform's skill-loading mechanism, or read the relevant skill documentation when no tool exists.

## Worktree Rule

ArcForge worktrees live at `~/.arcforge/worktrees/<project>-<hash>-<slug>/`, computed at runtime by the CLI. Worktrees carrying an `.arcforge-epic` marker belong to another lifecycle; **generic worktrees** (experiments, hotfixes, review checkouts) carry no marker.

When touching worktrees:

- Don't hardcode paths in output. Use abstract language like "the worktree" or fill paths from CLI output.
- Don't create worktrees manually — delegate to `arc-using-worktrees` so path derivation stays valid.
- Locating a worktree: read its `path` from `arcforge worktree list --json` — do not reconstruct paths from memory.
- Direct file-editing belongs in a worktree; base sessions coordinate, worktree sessions implement.

For derivation rules, marker schema, and cleanup semantics, see `docs/guide/worktree-workflow.md`.

## Skill Priority

When multiple skills could apply, choose the smallest useful one:

1. **Clarify intent** — `arc-brainstorming` when requirements or decisions are unclear.
2. **Write down the work** — `arc-writing-tasks` when the change is clear enough to break into tasks.
3. **Execute work** — `arc-executing-tasks`, `arc-agent-driven`, `arc-dispatching-teammates`, or `arc-looping` based on task-list/worktree context.
4. **Cross-cutting quality** — use discipline skills only when their trigger is actually present.

Examples:

- "Let's build X" → `arc-brainstorming` if design is unclear; `arc-writing-tasks` if it is already clear.
- "Fix this bug" → `/debugging` if cause is unknown; `/tdd` if cause and expected behavior are clear.

## Execution & Finishing Choosers

When two skills cover the same step, pick by the concrete condition:

| Decision | Pick |
|----------|------|
| Run a prepared task list | `arc-executing-tasks` (human checkpoints per batch) vs `arc-agent-driven` (fresh subagent per task + single task-reviewer, both verdicts) |
| Dispatch parallel work | `arc-dispatching-parallel` (independent features, one worktree) vs `arc-dispatching-teammates` (multi-worktree, lead present) |
| Set up an isolated workspace | `arc-using-worktrees` for a generic worktree (experiment, hotfix, review checkout — any repo) |
| Finish work | `/finishing` (4-option gate on the current worktree) |

Full skill catalog: README "What's Inside" or `docs/guide/skills-reference.md`.

## Discipline Skills — Conditional Triggers

These skills activate during a workflow when the condition is present. They are not mandatory pipeline steps for every message.

| Condition | Skill | Gate |
|-----------|-------|------|
| About to write implementation code | `/tdd` | Failing test before production code |
| Test fails or unexpected behavior appears | `/debugging` | Root cause before fixes |
| Task or feature complete, or review feedback received | `/code-review` | Two-axis review of the change, then answer the feedback on evidence |
| User asks about vault health, missing links, or orphan notes | `/maintaining-obsidian` audit mode | Propose changes, never auto-modify without approval |
| About to ship, merge, or mark complete a skill, agent, or workflow | `/evaluating` | Eval evidence whose confidence interval actually supports the claim |

## Instinct & Learning Routes

The diary/instinct system is one skill, and it is user-invoked — the user types
it, nothing routes into it:

| User intent | Skill |
|-------------|-------|
| Capture this session's reflections as a diary entry, extract recurring patterns from accumulated diaries, save one insight as an instinct, or review the learning-candidate queue | `learning` (user-invoked) |

## When Not to Route

Do not force an ArcForge workflow when the task is a simple factual answer, read-only inspection, harness/eval/grading execution that must preserve isolation, a single-skill eval where `arc-using` would contaminate the behavior under test, explicitly constrained by the user to avoid workflow overhead, or outside ArcForge's domain. Proceed directly, and only mention ArcForge skills if they materially help.

## Platform Adaptation

Skills describe actions in vendor-neutral terms ("dispatch a subagent", "search the web"). If your harness is not Claude Code, read its reference for the real tool names — Codex: `references/codex-tools.md`.

## User Instructions

User instructions say what outcome matters. ArcForge skills can help decide how to get there, but they do not override user intent, harness constraints, or higher-priority system instructions.
