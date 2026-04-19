---
name: arc-using
description: Use when starting any arcforge task - establishes routing discipline and checks routing table before ANY action
---

<EXTREMELY-IMPORTANT>
When a skill matches your context, invoke it before acting. Skills provide tested workflows
that prevent common mistakes — skipping them means losing that protection.

If a skill turns out not to fit after reading it, you can set it aside.
If no skill fits, proceed directly.
</EXTREMELY-IMPORTANT>

## How to Access Skills

**In Claude Code:** Use the `Skill` tool. When you invoke a skill, its content is loaded and presented to you—follow it directly. Never use the Read tool on skill files.

**In other environments:** Check your platform's documentation for how skills are loaded.

## Core Philosophy

**File artifacts = truth** (SDD pipeline v2 — per-spec layout)
- `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md` → Design documents
- `specs/<spec-id>/spec.xml` + `specs/<spec-id>/details/*.xml` → Refined specifications
- `specs/<spec-id>/dag.yaml` + `specs/<spec-id>/epics/` → Implementation plans
- Isolated feature work → see Worktree Rule below

**Session context = current workflow only**
- Don't rely on memory of past sessions
- Resume from file artifacts, not conversation history

## Worktree Rule

ArcForge worktrees live at `~/.arcforge/worktrees/<project>-<hash>-<epic>/`,
computed at runtime by `scripts/lib/worktree-paths.js` and managed by
`coordinator.js`. Because the path is derived, not literal, four norms
apply whenever you touch worktrees:

- **Don't hardcode paths in output.** Use abstract language ("the worktree",
  "the epic's checkout") in messages and completion formats, or fill from
  CLI output. Hardcoded paths become stale the moment the rule evolves —
  and the rule has evolved before.
- **Don't create worktrees manually.** Delegate to `arc-coordinating expand`
  (batch) or `arc-using-worktrees` (single). Raw `git worktree add` bypasses
  the `.arcforge-epic` marker schema that DAG sync depends on, producing
  silently broken state.
- **Enter worktrees via `arcforge status --json`.** It returns the absolute
  path. Don't reconstruct it from pattern knowledge — you'll get the hash
  wrong.
- **Use file-editing tools only where `.arcforge-epic` lives.** A session
  "owns" the side whose cwd contains the `.arcforge-epic` marker — worktree
  sessions have it, base sessions don't (they have `dag.yaml` without the
  marker). Limit direct file-editing tools (Read/Edit/Write in Claude Code,
  or your platform's equivalent) to the owning session; to modify worktree
  code from base, start a fresh agent session in the worktree path rather
  than reaching across. This keeps coordination (`expand`/`status`/`sync`/
  `merge`) architecturally separate from implementation and sidesteps
  out-of-cwd permission issues that most agent platforms enforce. Shell
  subprocess calls (`arcforge sync`, `git status`, `grep`, etc.) are not
  restricted — the norm is scoped to direct file-editing tools only.

For the full derivation rules (hash function, marker schema, cleanup
semantics), see `docs/guide/worktree-workflow.md`.

## The Rule

**Invoke relevant or requested skills BEFORE any response or action.** Even a 1% chance a skill might apply means that you should invoke the skill to check. If an invoked skill turns out to be wrong for the situation, you don't need to use it.

```dot
digraph skill_flow {
    "User message received" [shape=doublecircle];
    "Might any skill apply?" [shape=diamond];
    "Invoke Skill tool" [shape=box];
    "Announce: 'Using [skill] to [purpose]'" [shape=box];
    "Has checklist?" [shape=diamond];
    "Create TodoWrite todo per item" [shape=box];
    "Follow skill exactly" [shape=box];
    "Respond (including clarifications)" [shape=doublecircle];

    "User message received" -> "Might any skill apply?";
    "Might any skill apply?" -> "Invoke Skill tool" [label="yes, even 1%"];
    "Might any skill apply?" -> "Respond (including clarifications)" [label="definitely not"];
    "Invoke Skill tool" -> "Announce: 'Using [skill] to [purpose]'";
    "Announce: 'Using [skill] to [purpose]'" -> "Has checklist?";
    "Has checklist?" -> "Create TodoWrite todo per item" [label="yes"];
    "Has checklist?" -> "Follow skill exactly" [label="no"];
    "Create TodoWrite todo per item" -> "Follow skill exactly";
}
```

## Skill Priority

When multiple skills could apply:

1. **Process skills first** (brainstorm, debug, refiner, planner, writing-tasks, writing-skills) - determine approach, requirements, and task breakdown
2. **Workflow skills second** (coordinator, implementer, executing-tasks) - orchestrate and execute

Examples:
- "Let's build X" → arc-brainstorming (if design is unclear) or arc-writing-tasks (if requirements are known)
- "Fix this bug" → arc-debugging (if cause unknown) or arc-tdd (if cause is clear)
- "Implement epic" → arc-planning (if no dag.yaml), arc-coordinating (if dag.yaml exists, single epic), arc-dispatching-teammates (if 2+ ready epics and lead staying present), arc-looping (if 2+ ready epics and lead walking away), arc-implementing (if in worktree)
- "Save this to my vault", "create a note", "what do I know about X", "audit my vault" → arc-maintaining-obsidian (ingest/query/audit modes)

## Discipline Skills — Conditional Triggers

These skills activate **during any workflow** when the condition is met. They are not pipeline steps — they fire cross-cutting based on what you are about to do.

| Condition | Skill | Iron Law |
|-----------|-------|----------|
| About to write implementation code | `arc-tdd` | No production code without a failing test first |
| Test fails or unexpected behavior | `arc-debugging` | No fixes without root cause investigation first |
| About to claim work is complete | `arc-verifying` | No completion claims without fresh verification evidence |
| Task or feature complete | `arc-requesting-review` | Review before proceeding to next task |
| Received code review feedback | `arc-receiving-review` | Technical rigor, not performative agreement |
| User asks about vault health, missing links, or orphan notes | `arc-maintaining-obsidian` (audit mode) | Propose changes, never auto-modify without approval |
| About to ship, merge, or mark complete a skill, agent, or workflow | `arc-evaluating` | No shipping claim without an eval run that does not return INSUFFICIENT_DATA |

**The 1% rule applies here too.** If there is even a 1% chance a discipline skill should activate, invoke it. These are quality gates — skipping them is how bugs, false completions, and unreviewed code slip through.

## Red Flags

These patterns often lead to skipping useful skills. When you notice them, pause and
check — but if after checking no skill genuinely fits, proceed directly.

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "Let me gather information first" | Skills tell you HOW to gather information. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for skills. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |

## User Instructions

Instructions say WHAT, not HOW. "Add X" or "Fix Y" doesn't mean skip workflows.
