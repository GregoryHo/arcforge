# ArcForge Minimal Toolkit + Living SDD Design

## Goal

Return ArcForge to a minimal, composable toolkit while preserving its core differentiator: an eval-backed, LLM-maintained SDD system that lets future agents reconstruct most of a product from persistent artifacts.

ArcForge should not become a mandatory workflow OS. It should be a small set of skills, optional workflows, and harness-verified behavior.

## Agreed Decisions

1. **Three-layer split** — ArcForge will be organized as:
   - Core toolkit: small promoted skill surface.
   - Optional workflows: recipes for SDD, bugfix, skill authoring, multi-agent work.
   - Harness/eval layer: validates both activation and non-activation behavior.
2. **`arc-writing-skills` is project-level meta** — It is not a general user-facing promoted skill. It exists to maintain ArcForge's own skills and meta-skill system.
3. **SessionStart bootstrap becomes minimal** — Keep synchronous first-turn context, but inject only availability, precedence, smallest-useful-workflow guidance, and `ARCFORGE_ROOT`; do not inject full `arc-using`.
4. **`arc-using` becomes a gentle router** — It should guide skill selection only when clearly helpful, not force a 1% / before-any-action global policy.
5. **SDD remains important** — But the human effort model changes: humans provide ideas and key decisions; LLMs maintain the spec artifacts.
6. **Living SDD target** — If code is deleted, the maintained spec should allow other AI agents to reconstruct roughly 80–90% of product behavior, contracts, and architecture.
7. **Reconstruction score** — Judge reconstruction by behavior, contracts, tests, and architecture similarity; not source-code similarity.

## Product Philosophy

ArcForge is a composable skill toolkit for AI coding agents.

It provides lightweight guidance by default and stronger workflows only when the task justifies them.

- Skills are tools, not laws.
- Artifacts are used when chat is not enough.
- Harnesses verify behavior, including when skills should not activate.
- Humans own intent and key decisions.
- LLMs own documentation bookkeeping, spec synchronization, and artifact maintenance.
- Prefer the smallest useful workflow.

## Reference Synthesis

### Superpowers

Useful for disciplined TDD/debugging/planning workflows, but too strong as a default model for ArcForge. ArcForge should avoid mandatory global routing pressure.

### Matt Pocock Skills

Adopt the small, open, composable toolkit surface: few promoted skills, easy adaptation, and skills as optional tools.

### OpenSpec

Adopt lightweight change artifacts and fluid workflows: iterative, brownfield-friendly, easy before complex.

### Karpathy LLM Wiki

Adopt the core maintenance model:

- Raw sources / conversations / diffs are inputs.
- LLM maintains persistent wiki-like artifacts.
- Humans guide, review, and decide.
- The knowledge base compounds instead of being rediscovered each session.

## Layer 1 — Core Toolkit

### Promoted Core Skills

Core skills should be the default visible surface:

- `arc-using` — gentle router / skill index.
- `arc-brainstorming` — clarify vague ideas and extract intent.
- `arc-refining` — turn intent into Living SDD artifacts when SDD is appropriate.
- `arc-planning` — derive tasks from accepted spec artifacts.
- `arc-tdd` — behavior-change feedback loop.
- `arc-debugging` — reproduce, diagnose, fix, regression-test.
- `arc-verifying` — evidence before completion claims.
- `arc-evaluating` — harness/eval gate for skills, workflows, and behavior claims.

### Project-Level Meta Skill

- `arc-writing-skills` — maintained as an ArcForge-internal meta skill for changing ArcForge skills. It should not be presented as a general user workflow skill.

### Advanced / Optional Skills

These can remain, but should not dominate the default mental model:

- worktree coordination
- teammate dispatch
- looping
- finishing branches/epics
- observing / learning / reflecting / recalling
- session management
- Obsidian/diagramming domain-specific skills

## Layer 2 — Optional Workflows

Workflows are recipes, not global laws.

Recommended workflow recipes:

1. **Simple change**
   - clarify if needed → TDD → verify
2. **Bugfix**
   - debug → regression test → fix → verify
3. **Living SDD change**
   - brainstorm → refine spec artifacts → plan → implement → sync spec → verify/evaluate
4. **Skill authoring / ArcForge meta work**
   - writing-skills → eval → verify
5. **Multi-agent / large initiative**
   - only when scope justifies worktrees, DAGs, or teammates

## Layer 3 — Harness / Eval Layer

Harness tests should validate both positive and negative behavior.

Required eval categories:

1. **Positive activation**
   - Skill activates when task clearly matches.
2. **Negative activation**
   - Skill does not activate for read-only analysis, eval grading, baseline runs, or explicit opt-out.
3. **Spec sync**
   - Given a diff/tests/conversation, LLM updates the correct spec artifacts without inventing decisions.
4. **Spec drift**
   - Detect code/spec mismatch.
5. **Reconstruction**
   - Given only spec artifacts, a future agent rebuilds behavior and contracts to a target score.
6. **Instruction-strength regression**
   - Startup hook and router wording should not reintroduce global mandatory pressure.

## SessionStart Bootstrap Redesign

### Current Problem

The current hook injects the full `arc-using` skill body with high-priority language. This creates global routing pressure and can contaminate harnesses, subagents, and unrelated skills.

### Target Behavior

Keep a synchronous SessionStart hook, but inject a small bootstrap only:

```text
<arcforge_context>
ArcForge skills are available as a composable toolkit.
Use the smallest skill or workflow that clearly helps the current task.
Do not force ArcForge workflows onto read-only analysis, eval grading, harness baselines, simple factual questions, explicit opt-out requests, or tasks already governed by another loaded skill.
If routing is genuinely needed, load arc-using with the Skill tool.
ARCFORGE_ROOT=...
</arcforge_context>
```

No `EXTREMELY_IMPORTANT`. No full `arc-using` body. No 1% rule.

## `arc-using` Redesign

`arc-using` becomes a router/index with bounded guidance.

Target principles:

- Use when routing is genuinely needed.
- Prefer the smallest useful workflow.
- Respect system/developer/harness/user constraints.
- Do not route read-only or eval/grading tasks into workflows.
- Do not override a currently active skill's local procedure.
- Distinguish hard gates from soft guidance.

Replace strong language like:

- `BEFORE any response or action`
- `1% chance`
- `YOU MUST`
- `Questions are tasks`

with bounded language:

- `before substantive project-changing work`
- `when a skill clearly applies`
- `prefer`
- `consider`
- `ask only for key decisions`

## Living SDD Model

### Core Idea

ArcForge SDD becomes a Living Spec Wiki: a low-human-effort, LLM-maintained spec system that captures product intent, behavior, architecture, contracts, and decisions so future agents can maintain or reconstruct the system.

### Human / LLM Responsibility Split

Humans provide:

- initial ideas
- product intent
- priority and tradeoff decisions
- key constraints
- approval/correction of LLM summaries

LLMs maintain:

- spec pages
- behavior scenarios
- architecture notes
- contracts
- decision log
- open questions
- verification guidance
- drift detection
- sync from code/tests/diffs

### Required Artifacts

Default Living SDD layout:

```text
specs/<spec-id>/
  index.md
  intent.md
  behavior.md
  architecture.md
  contracts.md
  decisions.md
  verification.md
  open-questions.md
```

Optional advanced artifacts:

```text
specs/<spec-id>/
  tasks.md
  changelog.md
  dag.yaml
  epics/
  audits/
  evals/
  wiki/
    concepts/
    flows/
    entities/
    modules/
    scenarios/
```

### Artifact Responsibilities

#### `index.md`

Entry point for agents.

Includes:

- goal
- current status
- artifact map
- important links
- reconstruction instructions
- most recent meaningful changes

#### `intent.md`

Captures why the product/feature exists.

Includes:

- problem
- target users
- goals
- non-goals
- product principles
- constraints
- success criteria

#### `behavior.md`

Primary behavior source of truth.

Includes:

- user workflows
- scenarios
- examples
- acceptance criteria
- edge cases
- failure modes

#### `architecture.md`

Explains the system shape.

Includes:

- modules
- responsibilities
- boundaries
- dependencies
- invariants
- rationale

#### `contracts.md`

Machine-usable interface contracts.

Includes:

- CLI commands
- APIs
- config schemas
- file formats
- hook contracts
- event inputs/outputs

#### `decisions.md`

LLM-maintained decision log.

Entries should include:

- decision
- reason
- alternatives considered
- consequences
- whether human approved it

#### `verification.md`

Defines how future agents know they rebuilt or changed the system correctly.

Includes:

- test commands
- smoke checks
- golden scenarios
- eval commands
- reconstruction scoring notes

#### `open-questions.md`

The only place unresolved human decisions should accumulate.

LLM should not invent answers for these. It should ask concise questions or propose options.

## SDD Lite vs Full SDD

### SDD Lite

Lite means low human effort, not necessarily low artifact value.

Default behavior:

- LLM extracts and updates artifacts.
- Human reviews summaries and answers key decisions.
- No mandatory DAG/worktree/audit.
- Best for ordinary feature work.

### Full SDD

Use only when justified by scale/risk:

- multi-epic work
- parallel agents
- long-lived project changes
- high-risk contracts
- skill/harness changes needing eval evidence

Adds:

- DAG
- epics
- worktrees
- audit reports
- eval matrices
- coordination metadata

## Spec Sync Loop

Introduce or reshape a skill around spec synchronization.

Candidate skill: `arc-syncing-spec`.

Trigger when:

- implementation completed
- product decision made
- eval result changes expected behavior
- before claiming completion for SDD-backed work
- code/spec drift is suspected

Inputs:

- current spec artifacts
- recent conversation summary
- git diff / changed files
- test/eval outputs
- user decisions

Outputs:

- updated spec artifacts
- concise sync summary
- open questions for human decision
- drift warnings

Example summary:

```md
## Spec sync summary

Updated:
- behavior.md: added scenario for minimal bootstrap on SessionStart
- contracts.md: changed hook payload contract
- decisions.md: recorded decision to demote arc-writing-skills to project-level meta

Needs human decision:
- Should reconstruction eval target be 80% or 90% for v1?

Potential drift:
- tests still assert that arc-using must contain `1%` wording.
```

## Reconstruction Eval

ArcForge should add a reconstruction eval to verify Living SDD quality.

### Eval Shape

1. Create temp repo.
2. Provide only spec artifacts and minimal project metadata.
3. Ask an agent to rebuild.
4. Run verification tests/evals.
5. Score behavior and contract similarity.

### Scoring Proposal

```text
40% behavior scenarios pass
25% contracts/API/CLI compatibility
20% tests/evals pass
10% architecture/module responsibility similarity
5% spec/docs consistency
```

Source-code similarity is not a scoring target.

## Implementation Workstreams

### Workstream A — Reduce Global Pressure

- Replace full SessionStart injection with minimal bootstrap.
- Rewrite `arc-using` as gentle router.
- Update tests that currently require `MUST`, `IMPORTANT`, or `1%` wording.
- Add negative evals for over-triggering.

### Workstream B — Reorganize Skill Surface

- Define promoted core list.
- Demote advanced/experimental skills in docs and router.
- Mark `arc-writing-skills` as ArcForge project-level meta.
- Update README and skill reference docs.

### Workstream C — Living SDD Artifacts

- Define templates for required artifact pages.
- Update `arc-refining` to produce Living SDD pages.
- Add `arc-syncing-spec` or equivalent sync behavior.
- Ensure unresolved decisions go to `open-questions.md`.

### Workstream D — Harness / Eval Expansion

- Add positive and negative routing evals.
- Add spec sync evals.
- Add drift evals.
- Add reconstruction eval scaffold.
- Add instruction-strength lint or snapshot checks.

## Success Criteria

- Default ArcForge startup no longer injects full `arc-using` or strong global routing language.
- `arc-using` acts as an index/router, not a mandatory policy engine.
- README presents a small core toolkit surface.
- Advanced orchestration remains available but opt-in.
- Living SDD artifacts can be maintained mostly by LLMs.
- Human interaction focuses on ideas and key decisions.
- Spec sync can update artifacts from code diffs/tests/evals.
- Reconstruction eval exists and measures behavior/contract recovery from spec artifacts.

## Open Questions / Current Lean

1. **Artifact format** — Keep XML / structured schema where it helps Claude and parser validation, especially for contracts, requirements, traces, and deltas. Markdown remains useful for narrative pages (`intent.md`, `architecture.md`, `decisions.md`), but machine-checked sections should stay structured.
2. **`arc-refining` positioning** — Needs discussion. Current `arc-refining` is a formal design-to-`spec.xml` transformer with strict no-invention and validation gates. In the Living SDD model, it may become either the initial formalization skill, while ongoing sync moves elsewhere, or be renamed/split for clarity.
3. **`arc-verifying` positioning** — Confirmed from current skill: `arc-verifying` is a completion-claim verification/meta discipline skill. It verifies implementation claims with fresh evidence; it is not the right home for spec syncing, though spec/implementation drift checks may call verification as evidence.
4. **First reconstruction target** — Use ArcForge itself, not a toy fixture, so the reconstruction eval tests the real product and its own meta-system.
5. **Template strictness** — Lean strict parser validation. Flexible prose can exist around the edges, but source-of-truth artifacts should be parseable, validated, and fail closed when contracts/traces are malformed.
