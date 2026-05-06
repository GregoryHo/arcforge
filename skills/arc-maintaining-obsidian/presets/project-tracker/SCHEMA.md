---
type: schema
created: <YYYY-MM-DD>
scope: type definitions for <Vault Name>
preset: project-tracker
---

# <Vault Name> — Domain Schema (Project Tracker)

Five typed notes for project tracking: Task, Milestone, Decision,
Sprint, Project. AGENTS.md governs runtime behavior including status
state machines; this file declares the data shapes.

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
tags: []                   # area / type-of-work tags from AGENTS.md
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
