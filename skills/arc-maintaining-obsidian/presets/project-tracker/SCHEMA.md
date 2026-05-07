---
type: schema
created: <YYYY-MM-DD>
scope: type definitions for <Vault Name>
preset: project-tracker
---

# <Vault Name> — Domain Schema (Project Tracker)

Five typed notes for project tracking: Task, Milestone, Decision,
Sprint, Project. AGENTS.md governs the thin runtime contract; this file declares domain schema and policy: data shapes, status state machines, tag taxonomy, audit thresholds, and validation rules.

## Universal Frontmatter

```yaml
---
type: task | milestone | decision | sprint | project
created: YYYY-MM-DD
tags: []
aliases: []
---
```

This vault is single-language (per AGENTS.md `## Language Policy`).
Frontmatter values stay canonical English regardless.

## Task

```yaml
---
type: task
created: YYYY-MM-DD
status: todo | in-progress | blocked | done | cancelled
priority: p0 | p1 | p2 | p3
assignee: ""               # github handle / email / "unassigned"
sprint: ""                 # wikilink-resolvable Sprint name (or "")
milestone: ""              # wikilink-resolvable Milestone name (or "")
project: ""                # wikilink-resolvable Project name (or "")
due_date: null             # YYYY-MM-DD or null
estimate: ""               # xs | s | m | l | xl, or hour count
blockers: []               # plain text list of blocker descriptions
tags: []                   # area / type-of-work tags from SCHEMA.md
aliases: []
---
```

```markdown
# Task Title

## Description
[What needs to be done. Be concrete enough that someone else could pick it up.]

## Acceptance Criteria
- [ ] [Concrete check #1]
- [ ] [Concrete check #2]

## Context
[Why this task exists. Link to [[Decision]] if it traces back to one,
or [[Project]] for charter alignment.]

## Updates
- YYYY-MM-DD — [progress note]
- YYYY-MM-DD — [progress note]

## Blockers
[Detail any active blockers; link to [[Task]] or [[Decision]] dependencies.]
```

### Visual Guidance — Task

- **Embed:** Screenshots of UI mockups, error logs, design refs.
- **Mermaid:** Rare. Only for tasks with multi-step flows.
- **Canvas/Excalidraw:** No.

## Milestone

```yaml
---
type: milestone
created: YYYY-MM-DD
status: planned | active | done | missed
target_date: YYYY-MM-DD
project: ""                # wikilink to Project
tasks: []                  # wikilinks to Task notes rolled up under this
tags: [milestone]
aliases: []
---
```

```markdown
# Milestone Title

## Goal
[What achieving this milestone unlocks. Be outcome-focused, not output.]

## Success Criteria
- [Concrete signal that this milestone is done.]

## Tasks Rolled Up
- [[Task A]] — status, owner
- [[Task B]] — status, owner
[Auto-updated by audit lint based on `milestone: <Milestone Name>` in Task frontmatter.]

## Risks
[Known risks to hitting `target_date`. Link to [[Decision]] for mitigations.]

## Status Updates
- YYYY-MM-DD — [progress note]
```

### Visual Guidance — Milestone

- **Mermaid (gantt):** Useful when 5+ tasks with overlapping dates.
- **Canvas:** Suggest when milestone has 8+ tasks across multiple areas.

## Decision

```yaml
---
type: decision
created: YYYY-MM-DD
status: proposed | accepted | rejected | superseded
project: ""                # wikilink to Project (or "" for cross-project)
supersedes: ""             # wikilink to prior Decision if this replaces one
superseded_by: ""          # wikilink set when this is later replaced
tags: [decision]
aliases: []
---
```

```markdown
# Decision Title

## Context
[Why this decision is needed — what prompted it, what the constraints are.]

## Options

### Option A: [Name]
**Pros:** ...
**Cons:** ...

### Option B: [Name]
**Pros:** ...
**Cons:** ...

## Decision
[What was chosen. Date stamped if status was changed from `proposed` later.]

## Rationale
[Why — the reasoning that tipped the scale. Cite [[Task]] or [[Milestone]]
that this decision affects.]

## Consequences
[What this decision commits the project to. Open questions for future review.]
```

### Visual Guidance — Decision

- **Mermaid (when 3+ options):** Comparison flowchart.
- **Embed:** Benchmark charts, mockup comparisons, cost tables.
- **Excalidraw:** Rarely needed; only for architectural decisions.

## Sprint

```yaml
---
type: sprint
created: YYYY-MM-DD
status: planned | active | completed | cancelled
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
goals: []                  # short list of sprint goals
tasks: []                  # wikilinks to Task notes assigned to this sprint
project: ""                # wikilink to Project
tags: [sprint]
aliases: []
---
```

```markdown
# Sprint Title (e.g., "2026-W19 — Auth refactor")

## Goals
- [Goal 1: outcome the sprint is committing to.]
- [Goal 2: ...]

## Tasks
- [[Task A]] — status, owner
- [[Task B]] — status, owner
[Auto-updated by audit lint based on `sprint: <Sprint Name>` in Task frontmatter.]

## Capacity
[Team capacity notes — who's on, who's out, expected throughput.]

## Daily Notes
- YYYY-MM-DD — [standup highlights, blockers raised]

## Retrospective (filled at end_date)

### What went well
### What didn't
### Action items for next sprint
```

### Visual Guidance — Sprint

- **Mermaid (gantt):** Sprint timeline with task placement.
- **Canvas:** Optional — sprint board layout.
- **Embed:** Burndown chart at retrospective time.

## Project

```yaml
---
type: project
created: YYYY-MM-DD
status: active | paused | completed | cancelled
charter_url: ""            # external charter doc, if any
milestones: []             # wikilinks to Milestone notes
tags: [project]
aliases: []
---
```

```markdown
# Project Title

## Charter
[1-paragraph statement of what this project is and why it exists.
Link to external charter doc if there is one.]

## Goals
- [Top-level outcome 1]
- [Top-level outcome 2]

## Milestones
- [[Milestone 1]] — target date, status
- [[Milestone 2]] — target date, status

## Decisions
[Cross-project decisions live here as wikilinks.]
- [[Decision A]]
- [[Decision B]]

## Stakeholders
- [Role: name] — [interest / accountability]

## Risks & Open Questions
[Anything that could derail; anything unresolved.]
```

### Visual Guidance — Project

- **Mermaid (timeline):** High-level milestone gantt or roadmap.
- **Canvas (suggest for complex projects):** When milestones, decisions,
  and stakeholder relationships warrant spatial mapping.
- **Embed:** Project banner / org chart if relevant.

## Tag Taxonomy

Top-level tags:

- `project` — Project notes and cross-project views
- `task` — Task notes
- `milestone` — Milestone notes
- `sprint` — Sprint notes
- `decision` — Decision records
- `area` — product or technical area (`area/frontend`, `area/infra`, ...)
- `work` — type of work (`work/bug`, `work/feature`, `work/docs`, ...)
- `priority` — priority class (`priority/p0`, `priority/p1`, ...)
- `risk` — delivery or dependency risk
- `blocked` — active blocker tracking

Sub-tag convention: `<top-level>/<specific>`.

LINT checks:
- Unknown top-level tags → flag.
- Task missing a work/area tag when the project has a declared taxonomy → flag.
- Priority tag inconsistent with `priority:` frontmatter → flag.
- Type tag inconsistent with `type:` frontmatter → flag.

## Status State Machines

Task:
- `todo` → `in-progress` → `done`
- `todo` → `cancelled`
- `in-progress` → `blocked` → `in-progress`
- `blocked` → `cancelled`
- Reopening `done` requires explicit user confirmation.

Milestone:
- `planned` → `active` → `done`
- `planned` / `active` → `missed`
- A missed milestone should keep its original `target_date` and add a status update explaining the miss.

Decision:
- `proposed` → `accepted` | `rejected`
- `accepted` → `superseded` only when `superseded_by` is set.
- Do not mutate proposed/accepted/rejected without user confirmation.

Sprint:
- `planned` → `active` → `completed`
- `planned` / `active` → `cancelled`
- Sprints past `end_date` with open tasks require audit attention before `completed`.

Project:
- `active` → `paused` | `completed` | `cancelled`
- `paused` → `active` | `cancelled`
- Completing a project requires all non-cancelled milestones to be `done` or explicitly excluded.

## Validation Rules

- Every Task with `status: blocked` must have at least one blocker in `blockers:` or `## Blockers`.
- Every Task with `status: done` should have all Acceptance Criteria checked or an update explaining why not.
- Every Task assigned to a Sprint should also link to a Project unless the Sprint itself links to the Project.
- Every Milestone should have a `project:` and at least one success criterion.
- Every Sprint should have `start_date`, `end_date`, and at least one goal.
- Every Decision with `status: superseded` must set `superseded_by`.
- Every Project should list active Milestones or explicitly state that no milestones are defined yet.

## Audit Thresholds

- `in-progress` Task with no update for 7 days → stale task.
- `blocked` Task with no update for 3 days → unattended blocker.
- Task with past `due_date` and status not `done`/`cancelled` → overdue.
- Decision with `status: proposed` for more than 14 days → limbo.
- Sprint past `end_date` and status not `completed`/`cancelled` → sprint closure needed.
- Milestone past `target_date` and status not `done`/`missed` → milestone slippage.
- Project with 10+ Tasks and no Milestone → suggest milestone planning.
- `log.md` > 200 entries or > 200 KB → suggest log rotation.

## GROW Rules

- 5+ Tasks referencing the same blocker text → suggest a Decision or Milestone risk note.
- 5+ Tasks under one Project without Sprint/Milestone grouping → suggest creating Sprint or Milestone notes.
- 3+ Decisions affecting the same Project area → suggest a Project section update or MOC-style summary.
- Repeated stale tasks in one area → suggest a risk review rather than silently editing statuses.

## Audit Report

Saved as `_audits/audit-YYYY-MM-DD-<scope>.md`:

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---
```

Standard sections per `references/audit-checks.md`. Project-tracker
findings to highlight:
- Stale `in-progress` tasks
- Overdue tasks (due_date past, status != done)
- Blocked tasks unattended
- Sprints past `end_date` without retrospectives
- Milestone slippage (target_date past, low task completion)
- Decisions in limbo (`proposed` > 14 days)
