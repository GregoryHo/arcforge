# spec-driven-refine — Iteration 2026-04-16-v2

## Context (from spec v1)

Spec v1 formalized the SDD pipeline: three stages (brainstorming → refiner → planner),
three rules (R1 Human Consent, R2 Unidirectional Flow, R3 Block on Contradictions),
artifact layout, and spec identity header. It was refined from the initial design doc
but diverged during the refine session — removing REFINER_INPUT, simplifying the planner
to a sprint model, and adding interface contracts not present in the original design.

Reference: specs/spec-driven-refine/spec.xml v1

## Change Intent

This iteration aligns the spec with decisions made during the v1 refine session and
a subsequent design review. The changes fall into three categories: confirming refine
session decisions that the design doc didn't capture, adding new mechanisms discovered
during review, and removing over-engineered concepts.

### 1. Remove REFINER_INPUT — Refiner Consumes Complete Design Doc

**What changes:** Brainstorming no longer produces a structured REFINER_INPUT
section. The refiner reads the design doc directly and extracts requirements
itself — like wiki ingest reading a raw source.

**Why:** REFINER_INPUT was a redundant summary of the design doc's content. The
design doc itself IS the structured output (Vision, Architecture, Components,
etc., when no prior spec exists; Context + Change Intent when a prior spec
exists). Removing the summary eliminates duplication and lets the refiner use
the full context.

When a prior spec exists, the user describes changes in natural language in the
design doc's `## Change Intent` section. The refiner compares the design doc
against the existing `spec.xml` and derives the `<delta>` itself — the LLM does
the diff, not the user. This avoids human-authored delta sections that drift
from what the prose actually says.

### 2. One Refiner Behavior — No Modes

**What changes:** Remove the entire notion of "modes" (initial, iteration, replace,
Path A, Path B, gamma mode, γ mode). Refiner has one behavior: read the design
doc, read the existing spec if one exists, write the new spec.

- If no prior spec → new spec has `spec_version=1`, no `<supersedes>`, no
  `<delta>`.
- If prior spec exists → new spec has `spec_version=prior+1`, `<supersedes>`
  pointing to prior version, and a new `<delta>` element recording what changed.

**Why:** In real software development, iteration is the norm, not the exception.
Treating "initial" as a special mode creates artificial specialness and makes the
pipeline look like it has branching logic when it has only conditional fields. The
refiner doesn't switch modes — it runs the same process and fills in
version-dependent fields based on filesystem state.

Design doc structure follows the same logic: `## Context` and `## Change Intent`
sections become meaningful only when a prior spec exists (something to be in
context of, something to change). When no prior spec exists, those sections
are naturally absent — not "disabled", just not meaningful. The design doc
schema does not prescribe separate "Path A" and "Path B" templates.

This also eliminates "replace mode". A complete rewrite is just an aggressive
iteration where the Change Intent replaces everything — the refiner handles it
with the same code path.

### 3. Planner: Sprint Model — Pure Function, Ephemeral DAG

**What changes:** Planner is a pure function `(spec + delta) → (dag.yaml + epics/)`.
It reads the current spec, plans the epics for the current iteration's scope, and
**overwrites** any existing `dag.yaml` and `epics/` directory. No state preservation,
no rework epics, no `source_spec_version` tracking, no archive of the old DAG, no
completion gate.

When a new sprint starts, the old `dag.yaml` is simply overwritten. The old
content is not preserved in a file — it exists in git history if needed, but
arcforge does not treat git as part of the spec contract. DAG is a truly
disposable artifact: it exists to drive the current sprint's execution, and
when the sprint ends the file's purpose ends.

**Why:** DAG is a derived view (like Karpathy's index.md), not a living contract.
"Rebuild = RAG" applies to the Spec layer (which is delta-integrated), not to the
DAG layer. Delta processing for the DAG (the delta × epic state matrix from v1
design) was over-engineered — the scenarios it handled (MODIFIED + in_progress
epic) rarely occur because the pipeline is sequential.

Historical traceability is owned by the spec (wiki layer) and the design doc
iteration folders (raw source layer), not by the DAG. If a reader wants to know
"what was planned in sprint v2", they consult `specs/<spec-id>/spec.xml`'s delta
history and the matching `docs/plans/<spec-id>/<date>/design.md` — not an
archived DAG.

### 4. Spec Accumulates Delta Metadata (Wiki-Style)

**What changes:** When the refiner writes a new spec version, it **appends** a new
`<delta>` element to `<overview>` — it does not overwrite prior deltas. The spec
accumulates the full iteration history inside itself. `<overview>` can contain
zero (v1), one (v2), or many (v3+) `<delta>` children, ordered by `version`
ascending.

```xml
<overview>
  <spec_id>auth-system</spec_id>
  <spec_version>3</spec_version>
  <status>active</status>
  <supersedes>auth-system:v2</supersedes>
  <source>
    <design_path>docs/plans/auth-system/2026-06-01/design.md</design_path>
    <design_iteration>2026-06-01</design_iteration>
  </source>
  <title>...</title>
  <description>...</description>
  <scope>...</scope>

  <delta version="2" iteration="2026-05-10">
    <added ref="fr-as-007" />
    <modified ref="fr-as-002" />
  </delta>
  <delta version="3" iteration="2026-06-01">
    <added ref="fr-as-009" />
    <removed ref="fr-as-001">
      <reason>...</reason>
    </removed>
  </delta>
</overview>
```

**Why:** Spec is a wiki (Karpathy three-layer model — the mutable delta-integrated
layer). A wiki grows over time; it does not discard history when updated. If the
spec discards prior deltas on each iteration, reading the spec no longer tells you
"what happened" — it only tells you "what changed most recently". The full
history becomes inaccessible without `git log`, which violates "spec is source
of truth".

Accumulating deltas inside `<overview>` makes the spec self-contained: a reader
can open `spec.xml` and see the complete iteration history of this spec. No
external tooling required.

**Planner's rule:** The planner scopes its sprint by reading the `<delta>` whose
`version` equals the current `<spec_version>`. All other delta elements are
historical context for human readers — the planner ignores them. The planner must
not read the design doc (R2: derived layer does not access raw source layer), so
the delta metadata inside the spec is the only legal scope signal for the current
sprint.

For v1 (no `<delta>` elements present), the planner plans all requirements
currently in the detail files.

**Every delta child generates an epic.** The four delta children all represent
version-change operations that require implementation work — the planner emits
one epic per entry:

| Delta child | Epic semantics | Epic reference |
|---|---|---|
| `<added ref="X">` | Implement new requirement X | points at X in current detail files |
| `<modified ref="X">` | Update existing implementation of X to match changed behavior | points at X in current detail files |
| `<removed ref="X"><reason>...</reason></removed>` | Teardown — remove code tied to X. Implementer LLM greps codebase for X and removes; `<reason>` and optional `<migration>` inform teardown thoroughness (e.g., security reasons → strict, deprecation with consumers → transition code first) | references X, which no longer exists in detail files |
| `<renamed ref_old="X" ref_new="Y">` | Mechanical code-side refactor — grep + replace refs from X to Y. **Body unchanged; id only**. Semantic changes must be expressed as `<removed>` + `<added>`, not as a renamed with modification. | points at Y in current detail files |

arcforge does not inspect the *shape* of a delta — a delta with only `<removed>`
entries is a legal sprint (deprecation, compliance teardown, legacy cleanup). The
planner generates a sprint's worth of teardown epics and the downstream pipeline
treats them like any other work.

### 5. Refiner Gates New Iterations (Not Planner)

**What changes:** The refiner — not the planner — is responsible for gating new
iterations. Before producing a new spec version (one that would add a `<delta>`
and increment `spec_version`), the refiner checks the current `specs/<spec-id>/dag.yaml`:

- No prior spec → no gate (this is v1; there is nothing to be mid-sprint on).
- Prior spec exists + no `dag.yaml` → proceed. Planner has not yet run for the
  current spec version. This is a legal state (user refined but hasn't planned
  yet).
- Prior spec exists + `dag.yaml` with all epics `completed` → proceed. The
  current sprint is done; the new iteration is allowed.
- Prior spec exists + `dag.yaml` with any non-completed epic → **BLOCK**:
  > Complete current sprint before iterating. N of M epics still incomplete.

The refiner reports the incomplete epics and aborts. No spec file is written,
no `<delta>` is added, nothing changes on disk. The user finishes the current
sprint (or explicitly aborts it by some other means) before re-running the
refiner.

**Why this belongs in the refiner, not the planner:**

The gate question is "is the project ready to move to the next iteration?". That
is an upstream concern — it applies before we generate the next iteration's
contract (the new spec). If we let the refiner write v(N+1) and then have the
planner refuse to build a DAG, we've already created an inconsistent state:
`spec_version` says (N+1) but the prior sprint's DAG is still alive. The two
layers are out of sync and the user is stuck cleaning up.

Moving the gate upstream — into the refiner — means the inconsistency never
happens. If the prior sprint is not done, nothing downstream moves. Spec stays
at v(N), DAG stays at v(N)'s execution state, user completes the work, refiner
runs cleanly next time.

**Why this is consistent with "DAG is disposable":**

Gating on DAG completion is not the same as treating the DAG as authoritative.
The DAG is still disposable — it is used only as a **signal** of "is the current
sprint done?". The refiner reads the DAG's completion counts to make a go/no-go
decision; it does not use the DAG for anything else. After the refiner allows
the iteration, the planner overwrites the DAG without hesitation. The gate and
the overwrite are not in tension — they operate on the same artifact at
different times for different purposes.

**Block behavior (R3):** When the refiner blocks — whether on the DAG gate
or on a contradiction between design doc and prior spec — it prints the error
to terminal and exits non-zero. **No `refiner-report.md` or any other artifact
is written anywhere.** Nothing persists across the blocked invocation. The user
sees the message in the moment, fixes the design doc (or finishes the sprint,
depending on the block reason), and re-runs the refiner. This keeps retry
semantics clean — there is no stale report file to clean up, no half-written
spec, no sticky state across invocations.

**No escape hatch.** When the refiner blocks on the DAG gate, the user has
exactly two paths forward: (a) complete the remaining epics in the current
sprint, or (b) abandon the entire spec by deleting `specs/<spec-id>/` and
starting a new one. There is no `--force` flag, no `abandoned` status value
for epics, no partial-abandonment mechanism. Partial abandonment would
pollute `dag.yaml`'s status semantics from "actual execution state" to "what
the user wishes were the state" — a distinction that corrupts every
downstream tool that reads DAG status. Full-spec abandonment is a human
filesystem action (delete the directory), not an arcforge primitive —
arcforge does not need to support it, because the filesystem does.

### 6. sdd-utils.js = Validation Tools, Not Merge Engine

**What changes:** Clarify sdd-utils.js as a validation and information toolkit. The
LLM (refiner skill) directly manages spec content. sdd-utils.js provides deterministic
checks before and after LLM writes.

**Why:** OpenSpec uses a programmatic merge engine (LLM writes delta → code merges
into full spec). arcforge's spec is nested XML across multiple files — programmatic
merge would require an XML parser (violating zero-dependency) and complex multi-file
logic. Instead, the LLM manages the spec directly (like maintaining a wiki page),
and sdd-utils.js acts as audit LINT — validating structure, not authoring content.

Validation API:
- `validateSpecHeader(xml)` — identity header completeness
- `validateDesignDoc(path)` — design doc structure
- `validateRequirements(xml)` — AC and trace completeness
- `validateDagIntegrity(yaml)` — no cycles, valid references

Information API:
- `parseSpecHeader(xml)` — extract version, scope, delta
- `listSpecIds()` — scan specs/ directory
- `checkDagStatus(yaml)` — completion counts for gate check

### 7. Remove Stale Lint Skill

**What changes:** Remove standalone stale-lint skill (was stale-lint.xml in v1 spec).
Per-stage input/output validation replaces it.

**Why:** Each stage validates its own inputs and outputs. A separate lint skill that
scans for drift is redundant when the pipeline stages themselves enforce correctness
at execution time. Stale lint was an external audit; per-stage validation is inline
enforcement.

### 8. Interface Contracts Are Implementation Detail

**What changes:** The following v1 spec features are confirmed as implementation-level
detail that the refiner was authorized to add during formalization:
- Design Doc Contract (fr-cc-if-001)
- Spec Identity Header Contract (fr-cc-if-002)
- SDD Schemas guidance layer (fr-cc-if-003)
- SDD Utils enforcement layer (fr-cc-if-004)
- Skill Access Pattern (fr-cc-if-005)
- Two-Pass Write Pattern (fr-cc-val-001)
- Validation Report with Remediation (fr-cc-val-002)
- Per-stage validation with three-tier severity (cc-003)

**Why:** These don't change the pipeline's design intent (three-layer model, R1/R2/R3).
They specify how quality is ensured — analogous to OpenSpec's Zod schemas, which exist
in code but not in the proposal document.

## Architecture Impact

### Three-Layer Model Preserved

```
Raw Source (design doc) → Wiki (spec) → Derived (DAG)
         R1: human consent   R2: unidirectional   planner only reads spec
```

Change #4 (accumulating delta metadata) keeps the spec self-contained — a reader
never needs to cross into the raw source layer or dig through git to reconstruct
iteration history. Change #5 (refiner gate) keeps the wiki layer internally
consistent — we never produce a spec version that conflicts with an
unfinished sprint.

### Pipeline Flow Simplified

Before (v1 design):
```
Brainstorm → design doc (with REFINER_INPUT)
  → Refiner (initial/iteration/replace modes, reads REFINER_INPUT)
  → Planner (delta processing matrix, rework epics)
```

After (v2):
```
Brainstorm → design doc (single uniform structure)
  → Refiner (check dag.yaml completion → read design doc + existing spec if any
             → append new <delta>, bump spec_version, write spec)
  → Planner (read spec + delta matching current spec_version
             → overwrite dag.yaml + epics/ from scratch)
```

### Spec as Sprint Backlog

Each spec version produces one DAG (sprint). When the sprint is complete, the
refiner gate unblocks and the spec can iterate. Every `<delta>` ever written
stays in the spec, so the spec itself records the full iteration history.

```
spec v1 → dag v1 → execute → complete
spec v2 (adds <delta version=2>: +email) → dag v2 (email only) → execute → complete
spec v3 (adds <delta version=3>: ~phone→SSO) → dag v3 (SSO only) → execute → complete
```

At each arrow from "complete" to the next spec version, the refiner's DAG-completion
gate confirms the prior sprint actually finished. At each arrow from "dag vN" to
"execute", the old dag.yaml is overwritten by planner; there is no archive file.
The per-sprint history lives in the spec's accumulated `<delta>` elements and in
the per-iteration design doc folders.

## Considered and Rejected

| Scenario | Decision | Rationale |
|---|---|---|
| Planner reads design doc for scope | Rejected | Violates three-layer model (derived reading raw source) |
| Programmatic spec merge (OpenSpec style) | Rejected | XML multi-file merge requires parser, violates zero-dependency |
| Separate mode for "replace" | Rejected | Replace is just aggressive iteration; refiner determines from intent |
| Completion tracking in spec per-requirement | Rejected | Delta metadata + DAG gate are sufficient; per-requirement status adds complexity |
| Same-day iteration collision | Noted | v1 design uses date as folder name; same-day iterations need disambiguator (e.g., -v2 suffix) — minor gap to address |
| Archive old `dag.yaml` on iteration (e.g., `dag.yaml.archive.YYYY-MM-DD`) | Rejected | DAG is disposable. Historical traceability lives in the spec's accumulated `<delta>` elements and the design doc iteration folders, not in DAG archives. Overwrite is the clean semantic. |
| DAG completion gate lives in planner | Rejected | Moving the gate to refiner prevents the inconsistent state "spec at v(N+1) but DAG still at v(N) incomplete". Refiner is the sprint entry point; if it blocks, nothing downstream moves. |
| Initial / Iteration / Replace modes in refiner | Rejected | One refiner behavior, with conditional fields based on whether a prior spec exists. No mode labels, no Path A/B/γ terminology. Iteration is the norm, not a special case. |
| Overwrite prior `<delta>` each iteration (single delta in spec) | Rejected | Spec is wiki — it accumulates. Discarding prior deltas means history is only recoverable via git log, violating "spec is source of truth". Every `<delta>` ever written stays in `<overview>`. |
| `<modified>` reserved for AC wording, not behavior changes | Rejected | Every delta child represents version-change work. `<modified>` means "existing requirement's behavior changed and needs updating". Distinguishing wording-only from behavior-changing modifications is a distinction arcforge does not enforce — if the refiner writes `<modified>`, the planner emits an epic, and the implementer LLM decides scope from the requirement text. |
| `--force` flag or `abandoned` epic status to bypass refiner gate | Rejected | Any escape hatch pollutes `dag.yaml` status semantics (from "actual execution state" to "user wishes"). The two legitimate paths — complete the sprint, or delete `specs/<spec-id>/` — are enforced by the gate and the filesystem respectively. No tooling addition needed. |
| `refiner-report.md` or any persistent artifact on R3 block | Rejected | Refiner block is transient: terminal print + non-zero exit, no files written. Clean retry semantics, zero cross-call state. A sticky report file creates stale-file problems (when is it safe to delete?) for no upside. |
| Disallow pure-teardown sprints (deltas with only `<removed>`) | Rejected | A sprint whose delta contains only `<removed>` entries is a legitimate iteration (deprecation, compliance-driven takedown, legacy cleanup). arcforge inspects per-entry correctness of a delta, never its shape. |
