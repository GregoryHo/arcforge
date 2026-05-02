# Learning Subsystem MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after this contract is accepted.

**Goal:** Turn ArcForge learning from manual instinct clustering into an optional subsystem that automatically proposes learning candidates after explicit enablement, while requiring user approval before behavior changes.

**Architecture:** Keep learning optional and file-backed. `arc-observing` captures sanitized signals when enabled, `arc-learning` owns the candidate lifecycle and authorization gate, and `arc-reflecting` remains a secondary evidence source rather than the main path. Materialization is conservative: approved candidates produce drafts or pass through an explicit activation gate before they become active behavior.

**Tech Stack:** Node.js CLI/hooks, bash daemon where already present, JSONL queue files, pytest skill-contract tests, existing ArcForge eval framework for behavioral checks.

---

## Product Contract

Learning remains optional to enable, automatic once enabled, and conservative at the point of behavior change.

- Disabled by default for fresh installs and fresh projects.
- Project learning requires explicit enablement for that project.
- Global learning requires separate explicit enablement.
- Observation and candidate analysis may run automatically only after enablement.
- Approval required before materialization; a separate explicit activation is required before active behavior changes.
- Normal coding work must fail open if the learning subsystem errors.

This is not a core always-on feature. It is an optional subsystem whose enabled state should feel automatic, not manual.

## Responsibility Boundaries

### `arc-observing`: signal capture sensor

`arc-observing` is the low-level sensor layer.

Responsibilities:

- Capture tool/session signals only when learning/observation is enabled by config.
- Scrub secrets before writing observations.
- Fail open: hook or daemon failures must not block user work.
- Store normalized observation records.
- Avoid feeding analyzer/materializer sessions back into ordinary observations.

Non-responsibilities:

- Do not make behavior changes.
- Do not materialize skills.
- Do not auto-promote global behavior.
- Do not present candidate lifecycle UI.

### `arc-learning`: candidate lifecycle owner

`arc-learning` owns the candidate lifecycle.

Responsibilities:

- Read observations and optional instinct/reflection evidence.
- Analyze patterns into candidate records.
- Append candidates to the candidate queue.
- Present pending candidates for lightweight review.
- Record approve/reject decisions.
- Materialize approved candidates as inactive `.draft` artifacts.
- Present materialized drafts for read-only, review-safe inspection.
- Activate reviewed drafts only after an explicit behavior-change command.
- Track provenance and deduplicate repeated candidates.

This skill becomes the product surface for learning status, review, approval, rejection, and materialization.

### `arc-reflecting`: secondary evidence source

`arc-reflecting` remains useful, but it is not the MVP main path.

Responsibilities:

- Analyze diaries/reflections when explicitly requested or when a later automatic reflection worker exists.
- Produce secondary evidence for candidates.
- Enrich candidate summaries with higher-level lessons.

Non-responsibilities:

- Do not block MVP-1.
- Do not require users to run `/reflect` for automatic learning to work.

## MVP Phases

## MVP-1: Enablement + Candidate Queue

MVP-1 ships the minimum safe automatic learning loop: explicit enablement, automatic signal collection, candidate queueing, and user review state.

### Scope

- Add project/global learning config.
- Make observe hooks and daemon obey config.
- Define candidate queue schema.
- Add candidate review/approve/reject lifecycle.
- Add tests proving disabled-by-default and approval-required behavior.

### Enablement rules

- Learning is disabled by default.
- Project enablement is explicit enable, e.g. `arcforge learn enable --project` or equivalent skill-backed command.
- Global enablement is separate explicit enable, e.g. `arcforge learn enable --global`.
- Observe must obey config before writing learning observations.
- Disabling learning stops new observations and analyzer runs but leaves existing queue records intact.
- Fail open on all hook/daemon/config read errors.

### Candidate queue storage

Project queue:

```text
.arcforge/learning/candidates/queue.jsonl
```

Global queue:

```text
~/.arcforge/learning/candidates/queue.jsonl
```

### Candidate queue schema

Every candidate record must include these fields:

```json
{
  "id": "arc-releasing-20260501-001",
  "scope": "project",
  "artifact_type": "skill",
  "name": "arc-releasing",
  "summary": "Project-specific release flow observed across multiple sessions.",
  "trigger": "when the user asks to cut, ship, bump, or prepare a release",
  "evidence": [
    {
      "session_id": "session-abc",
      "source": "observation",
      "reason": "version bump, changelog update, tests, tag, push sequence"
    }
  ],
  "confidence": 0.72,
  "status": "pending",
  "created_at": "2026-05-01T00:00:00Z",
  "updated_at": "2026-05-01T00:00:00Z"
}
```

Required statuses:

- `pending` — proposed, waiting for review.
- `approved` — user approved materialization.
- `rejected` — user rejected; suppress duplicate resurfacing for a cooldown.
- `materialized` — inactive `.draft` artifacts were produced.
- `activated` — reviewed drafts were explicitly promoted to active files.

### Authorization gate

Approval required before materialization.

- Analyzer may propose candidates automatically.
- Candidate queue may accumulate automatically.
- Review may be shown at session start or via `arc-learning` commands.
- No candidate becomes an active skill, command, agent, or hook without explicit approval.
- Rejected candidates are not deleted; they remain evidence for future cooldown/dedup decisions.

### Tests

Add tests for:

- disabled by default config behavior.
- observe hook/daemon obey config before writing learning observations.
- candidate records validate required schema fields.
- approve/reject transitions preserve provenance.
- materialize rejects non-approved candidates.

## MVP-2: Conservative Materializer, Review, and Activation Skeleton

MVP-2 adds artifact creation after approval, keeps the result inactive by default, exposes read-only draft review, and requires explicit activation before any behavior change.

### Scope

- Materializer accepts only `approved` candidates.
- Materializer produces project-scope draft artifacts first.
- Global materialization and activation fail closed in MVP.
- Draft artifacts are not active behavior.
- `learn inspect` and `learn drafts` provide read-only review-safe summaries.
- A separate explicit activation step promotes a reviewed draft to active files.

### Draft output convention

For project skills, materializer writes:

```text
skills/arc-releasing/SKILL.md.draft
tests/skills/test_skill_arc_releasing.py.draft
```

The `.draft` suffix is the activation gate: normal skill discovery and pytest collection should not treat these as active artifacts.

### Activation rule

Activation requires explicit approval after draft review.

Allowed activation paths:

- user says to activate the draft after review;
- or `arcforge learn activate <candidate-id> --project` performs the rename after validation.

Activation validates the candidate schema and scope, requires recorded
draft paths to match expected materialized artifacts, requires drafts to
exist, and refuses to overwrite existing active files. Global activation
is unsupported in MVP and fails closed.

Not allowed:

- analyzer directly writes active `SKILL.md`;
- materializer silently activates a skill;
- learning changes future behavior during the same session without explicit activation.

### Read-only draft review

Materialized drafts can be reviewed before activation with:

```bash
arcforge learn inspect <candidate-id> --project|--global [--json]
arcforge learn drafts --project|--global [--json]
```

These commands must be read-only. They summarize allowlisted candidate
metadata, safe evidence fields, next actions, and project-scope artifact
existence. They do not embed draft contents, raw observation payloads,
unexpected candidate fields, or stored path fields from the queue. Global
review does not probe project-local artifact paths.

### Tests

Add tests for:

- materializer creates `.draft` outputs for approved candidates.
- `.draft` outputs are not active skills.
- inspect/drafts are read-only and do not leak raw candidate, evidence, or stored path payloads.
- global inspect/drafts do not probe project-local artifact paths.
- activation requires explicit approval.
- queue entry records draft paths and later active paths.

## MVP-3: Release Flow Golden Path

MVP-3 proves the subsystem end-to-end with release flow.

### Fixture observations

Create fixture observations representing 2+ release sessions in the same project. Each fixture should include the repeated shape:

- version bump;
- changelog or release notes update;
- full tests/lint/preflight checks;
- commit;
- tag or PR preparation;
- push or handoff.

These fixture observations should be deterministic and scrubbed of secrets.

### Expected analyzer output

Analyzer emits a project-scoped candidate:

```text
name: arc-releasing
artifact_type: skill
scope: project
trigger: natural language release requests
```

Natural language trigger examples:

- "ship vX.Y.Z"
- "cut a release"
- "bump version"
- "ready to release"
- "prepare release"
- "準備發版"

### Expected materialized draft

The draft skill is project-specific and includes:

- natural language trigger coverage;
- preflight checklist;
- full test/lint requirement;
- version consistency checks;
- changelog/release-note check;
- tag/PR/push safety gates.

### Eval plan

Add a lightweight eval scenario after MVP-2 exists:

- Input: fixture observations for repeated release sessions.
- Expected: analyzer proposes `arc-releasing` candidate.
- Expected: approval produces `.draft` skill and `.draft` tests.
- Expected: natural language release prompt activates only after explicit activation.
- Expected: release skill includes preflight checks and does not skip tests.

## Project vs Global Scope

Default to project.

Rules:

- New candidates start as project-scoped unless the user explicitly asks for global or cross-project evidence exists.
- A pattern seen in 2+ projects may become a promotion candidate.
- Promotion candidate means "propose global scope for review," not automatic promotion.
- Global materialization and activation are not in MVP and fail closed.
- Project-to-global promotion must preserve provenance from all contributing projects.

## CLI / Skill Surface Proposal

The exact command names can change, but MVP implementation should support this lifecycle:

```bash
arcforge learn status --project
arcforge learn enable --project
arcforge learn disable --project
arcforge learn analyze --project
arcforge learn review --project
arcforge learn approve <candidate-id> --project
arcforge learn reject <candidate-id> --project
arcforge learn materialize <candidate-id> --project
arcforge learn inspect <candidate-id> --project
arcforge learn drafts --project
arcforge learn activate <candidate-id> --project
```

Skill behavior should mirror the same lifecycle for natural-language use:

- "turn on learning for this project"
- "show pending learnings"
- "approve this release-flow skill candidate"
- "reject that candidate"
- "materialize this as a draft"
- "show me the materialized drafts"
- "inspect this draft before activation"
- "activate the reviewed draft"

## Implementation Task Breakdown

### Task 1: Config contract

Files:

- Modify or create a learning config helper under `scripts/lib/`.
- Add tests under `tests/scripts/`.

Acceptance:

- Fresh project reports learning disabled.
- Project enable writes explicit config.
- Global enable is separate.
- Config read failures fail open as disabled.

### Task 2: Observation enablement gate

Files:

- Modify `hooks/observe/main.js`.
- Modify `hooks/session-tracker/start.js` or daemon startup path if needed.
- Add hook tests.

Acceptance:

- Disabled learning prevents learning observation writes.
- Enabled learning writes sanitized observations.
- Hook errors never block tool execution.
- Enabled project learning triggers lightweight candidate analysis automatically after observation writes; this may append pending candidates only and must not materialize or activate artifacts.

### Task 3: Candidate queue library

Files:

- Create `scripts/lib/learning-candidates.js`.
- Add tests under `tests/scripts/`.

Acceptance:

- Append candidate.
- Validate schema.
- List pending candidates.
- Approve/reject transitions preserve evidence.
- Duplicate candidate detection is deterministic.

### Task 4: Analyzer MVP

Files:

- Implement analyzer in `scripts/lib/learning.js` and expose it through `arcforge learn analyze --project` plus the observe-hook automatic trigger.
- Add fixture observations.
- Add tests.

Acceptance:

- Fixture release observations emit exactly one project-scoped `arc-releasing` candidate.
- Analyzer does not emit when confidence/evidence threshold is unmet.
- Analyzer marks cross-project repeats as promotion candidates, not automatic global artifacts.

### Task 5: Materializer, draft review, and activation skeleton

Files:

- Add materializer/review/activation helpers under `scripts/lib/` or `skills/arc-learning/scripts/`.
- Add tests.

Acceptance:

- Non-approved candidate cannot materialize.
- Approved project candidate creates `.draft` skill/test outputs.
- Draft paths are recorded on the queue entry.
- Inspect/drafts are read-only, review-safe, and scope-isolated.
- Activation validates candidate schema/scope/draft paths and refuses overwrite.
- No active skill file is created before explicit activation.

### Task 6: Release-flow eval

Files:

- Add eval scenario under `evals/scenarios/`.
- Add scenario format/contract tests.

Acceptance:

- Lint passes.
- Scenario uses fixture observations.
- Treatment demonstrates candidate proposal + draft materialization gate.

## Non-Goals for MVP

- Import/export of learned skills.
- Cross-user aggregation.
- Automatic editing of existing skills.
- Silent activation of generated skills.
- Web UI for learning review.
- Making learning core/default-on.

## Open Tuning Decisions

These should not block MVP-1:

- Rejected candidate cooldown duration.
- Exact confidence threshold for analyzer emission.
- Whether review appears inline at session start or only via command/skill.
- Retention period for raw observations.
- Whether materializer uses Claude Code, deterministic templates, or a hybrid for draft generation.
