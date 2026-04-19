# Spawn Prompt Template (Full)

This is the authoritative spawn prompt template for `arc-dispatching-teammates`.
SKILL.md references this file — do not duplicate the template there.

## Why the Authority section exists

A terse spawn prompt (`"cd to X, invoke /arc-implementing, SendMessage on
completion"`) was the original pattern. It caused a real failure mode in
the qmd 2026-04-10 session: `worker-epic-history` stopped after Phase 0
waiting for the lead to dispatch Phase 1, because the prompt never
explicitly granted autonomous end-to-end execution authority.

In a teammate context, the Claude session's default behavior is **more
cautious than an interactive session**. An interactive session has zero
cost to ask "should I proceed?" — the user responds immediately. A
dispatched teammate asking the same question incurs a SendMessage
round-trip to the lead (seconds to minutes), AND worse, the cautious
teammate in the qmd incident did not even send the question — it just
stopped.

The Authority section makes the grant **explicit**. It is the written
form of what a mode-1 user says verbally when they open a session: "just
run it, don't ask me."

## Variables to substitute

Per teammate, the lead fills in:

- `<spec-id>` — the spec identifier (the parent directory under `specs/`)
- `<epic-id>` — the epic identifier from `specs/<spec-id>/dag.yaml`
- `<absolute-worktree-path>` — read from `arcforge status --json` after expand

## Template (verbatim — copy/paste and substitute)

```
You are teammate worker-<epic-id> implementing epic <epic-id> from spec <spec-id>
(i.e., the DAG at `specs/<spec-id>/dag.yaml` and the spec artifacts at
`specs/<spec-id>/epics/<epic-id>/`).

## Your Authority

You are the sole implementer of epic <epic-id>. You have full authority
to execute all phases of this epic autonomously (from Phase 0 through
finishing) without per-phase approval from the lead. Run the appropriate
arcforge workflow end-to-end — default to `/arc-implementing`, use
`/arc-agent-driven` only if the epic spec explicitly requires task-list
execution. Work through TDD red/green/refactor cycles, verify, and
finish the epic yourself.

You do NOT need the lead to dispatch individual features or phases, and
you should NOT wait for acknowledgment between phases. Run straight
through. The lead will verify your final result — they cannot help you
faster by micromanaging intermediate steps.

Report to the lead via SendMessage ONLY for:

- **Genuine blockers you cannot resolve yourself** — something preventing
  progress that is outside the epic's scope or outside your authority.
  Design preferences, test-write ordering, and implementation detail
  choices are NOT blockers; resolve them yourself.
- **Merge conflicts at finishing time** — follow arc-finishing-epic's
  Merge Conflict (Multi-Teammate) blocked format.
- **Epic completion** — success (ready for lead review) or give-up (you
  tried and cannot proceed). Include a short summary of what was done.

Progress updates between phases are not required and not expected. The
lead does not need or want them.

## Your Workspace

1. cd to <absolute-worktree-path>
2. Invoke `/arc-implementing` to execute epic <epic-id> end-to-end. (If
   the epic's `epic.md` explicitly specifies `arc-agent-driven` as the
   execution pattern, invoke `/arc-agent-driven` instead.)

## Coordination

Your plain-text output is NOT visible to the lead. SendMessage is the
only channel the lead sees. Any blocker, question, or completion notice
must go through SendMessage — do not rely on your final text output
being read.

Marking a task as completed in TaskList is ALSO not visible to the
lead as a conversation-turn event — the lead would only see the task
status change if they happen to re-read the task list. On completion,
SendMessage the lead directly with a short summary. Do not assume
TaskUpdate is a notification channel.

Do not attempt to work on epics other than <epic-id>.
```

## Retry spawns — prepend a feedback section

When the lead is dispatching a retry teammate (Step 7 of SKILL.md),
prepend a `## Previous Attempt Feedback` section **above** the standard
template, between the first line and `## Your Authority`. The retry
spawn prompt looks like this:

```
You are teammate worker-<epic-id>-retry<N> implementing epic <epic-id>.

## Previous Attempt Feedback

The previous attempt(s) at this epic were rejected by the lead for the
following reasons. You are expected to address every item listed here.

<retry 1 feedback verbatim — quoted spec text + what current impl does
+ what it should do>

<retry 2 feedback verbatim (if this is retry 3)>

The current dev branch already contains the previous attempts' commits
as a result of fix-forward expansion. You may: (a) build on top of the
existing work to address the feedback, or (b) revert the previous
attempt's commits and start fresh — your choice based on which is less
work. If you revert, use `git revert` or `git reset` inside this
worktree — the lead has already decided the previous attempt was not
acceptable, so you do not need to preserve it.

## Your Authority

[... rest of standard template unchanged ...]
```

Include ALL prior feedback cumulatively — retry 2 gets retry 1's
feedback, retry 3 gets retry 1 and retry 2's feedback. The retry
teammate has no memory of prior attempts beyond what you put in this
section.

Feedback quality is load-bearing. Feedback like "not quite right, please
fix" produces worse retries than no feedback at all, because it encodes
the lead's uncertainty into the teammate's prompt. Feedback must name
the specific acceptance criterion, quote the spec text, describe the
current behavior, and describe the expected behavior. See SKILL.md
Step 7 for the formulation requirement.

## Customization notes

**Keep the headers verbatim.** The three section names (`Your Authority`,
`Your Workspace`, `Coordination`) are structural anchors that tell the
teammate what kind of content to expect. Renaming them breaks the
teammate's ability to navigate the prompt mentally.

**Do not add ownership, file-level constraints, or contract language.**
The dev-branch mental model intentionally excludes static conflict
prediction. If the lead starts adding "here are the files you should
not touch" sections, they are drifting into over-engineering territory
that the skill deliberately avoids. Cross-epic file conflicts, when
they occur, are handled at finishing time via the arc-finishing-epic
Merge Conflict (Multi-Teammate) escalation path — not via pre-dispatch
constraint lists.

**Pick `/arc-implementing` or `/arc-agent-driven` based on the epic's
own spec.** Most epics use `/arc-implementing`. Some epics that have
been pre-decomposed into a task list and stored in `docs/tasks/` may
prefer `/arc-agent-driven`. The epic's `epic.md` should state this; if
it doesn't, default to `/arc-implementing`.
