# spec-driven-refine v2 — Refiner R3 Enforcement & Conflict Handoff

## Context

`spec-driven-refine` v1 (2026-04-16, active) defined the Spec-Driven Development pipeline as a three-stage flow — Stage 1 brainstorming → Stage 2 refiner → Stage 3 planner — governed by three foundational rules:

- **R1 Human Consent** — upstream (raw source) changes require human initiation; physical implementation: design docs are immutable per iteration, new iteration = new dated file under `docs/plans/<spec-id>/<YYYY-MM-DD>/`.
- **R2 Unidirectional Flow** — downstream cannot modify upstream; refiner MUST NOT write design.md, planner MUST NOT read design.md.
- **R3 Block on Contradictions** — downstream blocks rather than carrying broken artifacts forward; refiner Iron Law: NEVER WRITE ON BLOCK (zero filesystem state).

User clarification on 2026-04-25 calibrated R2's spirit:
> 人為授權能接受 — 所有工作都是 LLM 協助的,差別只在有沒有人為監督

R2 is not "LLM cannot author upstream artifacts"; it is "no upstream change without human authorization." LLM-drafted-then-human-approved is legitimate. This calibration is what makes the new conflict-handoff flow possible without breaking R2.

### Why this iteration

An eval pass on the v1 refiner (`skills/arc-refining-workspace/iteration-1/`, 14 fixtures × 2 variants) surfaced 17 HIGH + 31 MED audit findings. Investigation identified four patterns, all of which are R3 enforcement failures:

| Pattern | Mechanism | Currently caught by | Currently MISSED by |
|---|---|---|---|
| 1a — User deferred ("use defaults" / "covered."), refiner committed concrete MUSTs | Refiner treats deferral signals as license to author from training-data inference instead of as a contradiction (deferred axis ≠ authorized criterion) | nothing | refiner has no rule against authoring from inference |
| 1b — User answered, refiner overrode (windowSec → windowMs, max=32 → default=32+flag) | Design said one thing, user Q&A said another; refiner silently picked one without surfacing the conflict | nothing | `fr-rf-001` checks design ↔ design only, not design ↔ Q&A |
| 2 — `<trace>` cites a source where the cited content is absent or line-range-drifted (3 HIGH across 7/14 runs) | Refiner output unverifiable provenance — no mechanical check that cited content actually exists at the cited location | nothing | output validation in `fr-rf-010` checks structural well-formedness, not trace authenticity |
| 3 — Internal contradictions inside the produced spec (description scope ≠ AC scope, RFC-2119 verb mismatches; 4/14 runs) | Refiner did not contradiction-check its own draft | partial — `fr-rf-008` covers some merge-time cases | doesn't cover description ↔ AC scope mismatches inside a single requirement |

A cross-cutting observation: in 14/14 runs, when the user answers a Q&A, the answer stays in `decision-log.md` only and `design.md` is never updated. v1's refiner has no path to route a design ↔ Q&A conflict back through the upstream `design.md` for human-authorized resolution. The pipeline already has an authorized-write path (arc-brainstorming's iterate branch produces a new dated design.md after explicit user confirmation, satisfying R1) — refiner just doesn't route conflicts back through it.

A cheap experiment within the eval (`http-retry-helper / skip` 0 HIGH vs `answers` 2 HIGH on the same design and fixture) showed two refiner instances reaching opposite stances on the same deferral signal. The skip-variant decision-log explicitly stated *"Per the Iron Law... refiner MUST NOT invent concrete numbers"* and produced 0 HIGH. The answers-variant stated *"'covered.' was taken as license to pick a sensible default"* and produced 2 HIGH. The skip-variant refiner derived an "R3 instinct" organically from the v1 Iron Law; the answers-variant did not. Codifying R3 explicitly is plausibly the smallest change that brings all refiner instances to the safe stance.

### What is and is not changing

This iteration tightens refiner R3 enforcement and introduces a structured conflict-handoff artifact (`_pending-conflict.md`) shared between refiner (producer) and arc-brainstorming (consumer). It does not change R1 or R2's physical implementation — design files remain immutable, new iteration still equals new file. It does not modify Stage 3 planner, arc-implementing, or arc-auditing-spec.

## Change Intent

The change is one principle expressed at multiple layers:

> **Every spec criterion must trace to human authorization. Refiner must not invent. Conflicts must surface, not be silently resolved.**

This iteration realizes that principle in two layers — refiner-discipline rules (Stage 1 of the proposal, prompt-only) and structural mechanisms with a handoff artifact (Stage 2 of the proposal). Both layers are in scope for this v2 spec; the optional cross-model audit pass (Stage 3) is deferred to a future iteration.

### Layer A — Refiner discipline (Stage 1)

**A.1 — Iron Law revision.** The current Iron Law's first clause is `SPEC IS THE WIKI — PRESERVE EVERY PRIOR DELTA. NEVER WRITE ON BLOCK.` The first clause is architectural metaphor (spec corresponds to the wiki layer in the Karpathy three-layer model), not actionable invariant — it does not tell a refiner what to do. The new Iron Law replaces clause 1 with `NO INVENTION WITHOUT AUTHORIZATION.` The other two clauses are kept (delta preservation = R1's wiki-layer accumulation; never-write-on-block = R3 zero-state). The result is `NO INVENTION WITHOUT AUTHORIZATION. PRESERVE EVERY PRIOR DELTA. NEVER WRITE ON BLOCK.`

**A.2 — Three-axis contradiction check at Phase 4.** The refiner's Phase 4 currently checks one axis: contradictions internal to design.md. It must check three:

| Axis | What is checked | v1 status | v2 status |
|---|---|---|---|
| 1 | design.md internal contradictions | implemented | unchanged |
| 2 | design.md ↔ user Q&A answers — if design says X and user Q&A says ¬X, R3 fires | not checked | new |
| 3 | spec-draft coverage — every produced criterion must trace to a (design phrase ∪ Q&A row) source; criteria with no such source are invention, R3 fires | not checked | new |

When any axis fires, R3 demands BLOCK + zero filesystem state.

**A.3 — Phase 5 no-invention constraint.** Refiner MUST NOT author criteria from training-data inference. Under deferral, the legitimate refiner moves are exactly three: (a) preserve design's qualitative phrasing as SHOULD/MAY (this is authorized — the source phrase is in design.md), (b) leave the axis unbound (no criterion at all), (c) BLOCK with conflict file. Inventing a concrete MUST from training-data common practice is not on the list.

**A.4 — Phase 5.5 spec self-contradiction sub-pass.** Before Phase 6 output validation, refiner re-reads each requirement's description against each acceptance criterion and flags scope mismatches and RFC-2119 verb mismatches (e.g., description says "the system handles X" but ACs only test the success path). This was eval Pattern 3; promoted to its own pre-validation step rather than relying on Phase 4 to catch it.

### Layer B — Conflict handoff (Stage 2)

**B.1 — Structured decision-log format.** The brainstorming Q&A output (currently free-form `decision-log.md`) becomes machine-parseable. Each Q&A row carries required fields: `q_id` (stable identifier), `question` (verbatim), `user_answer_verbatim` (verbatim), and `deferral_signal` (boolean — true when the answer matches "use defaults", "covered.", "skip", "you decide", and similar deferral phrases). The format is structured enough that Phase 6's mechanical authorization check can iterate over rows by `q_id`. Format choice (YAML vs strict markdown table) is a refining-stage decision; the design.md commits to "machine-parseable with the four required fields above".

**B.2 — `_pending-conflict.md` handoff artifact.** When refiner blocks on axes 1, 2, or 3, it writes a single structured handoff file at `specs/<spec-id>/_pending-conflict.md` (underscore prefix marks it as ephemeral hand-off, not versioned spec content) and exits non-zero with no spec.xml or details/ written. The file carries: which axis fired, the conflict description (specific design line ranges and Q&A row q_ids involved), 1–3 candidate resolutions, and a user-action prompt directing the user to `/arc-brainstorming iterate <spec-id>`.

**B.3 — arc-brainstorming Phase 0 pending-conflict detection.** Phase 0's existing scan-and-route logic gains one more check: if `specs/<spec-id>/_pending-conflict.md` exists, brainstorming automatically enters its iterate branch with the conflict body as Change Intent seed (the user does not need to retell the conflict). The user picks a resolution candidate (or describes their own); brainstorming writes a new dated `docs/plans/<spec-id>/<NEW-DATE>/design.md` with the resolution baked in; the pending file is deleted on successful design write. R1 holds (human authorized the new design via brainstorming's user-confirmation gate); R2 holds (refiner never wrote design.md; brainstorming did, after user picked); R3 holds (refiner blocked, zero filesystem state, only the BLOCK marker existed transiently and is now removed).

**B.4 — Phase 6 mechanical authorization check (axis 3 enforcement at validator level).** Phase 6 validator iterates over every `<trace>` element in the in-memory spec. For traces citing design line ranges, it checks the cited content appears at those lines. For traces citing Q&A rows by `q_id`, it checks the cited content appears in that row of the structured decision-log. Any mismatch is ERROR; refiner blocks per A.1's Iron Law (zero filesystem state). This is the mechanical implementation of axis 3 — it does not rely on the LLM self-checking its own output.

### Why route conflicts through brainstorming instead of letting refiner write a design diff

A simpler-looking alternative would be: refiner drafts a design.md change, user approves inline, refiner writes upstream. This was rejected because it breaks R1's physical implementation. R1 in arcforge is enforced by "raw source = immutable file; new iteration = new file." The simpler alternative degrades that to "LLM writes upstream after user approves," collapsing the file-system-level guarantee into a runtime-protocol guarantee. Once the physical constraint is gone, audit-trail integrity becomes contingent on every approval gate working correctly. Routing through arc-brainstorming preserves the constraint — every design change goes through brainstorming's iterate branch which already has the user-confirmation gate built in (Phase 0 scan-and-route).

The "weight" cost of switching tools (refiner blocks → user runs `/arc-brainstorming iterate`) is mitigated by `_pending-conflict.md` being a first-class hand-off artifact. The user does not retell the conflict; brainstorming reads it as Change Intent seed, and the user's interaction reduces to one message: "pick (a)/(b)/(c)/other".

## Architecture Impact

- **`details/refiner.xml`** — `fr-rf-001` modified to cover three axes (currently axis 1 only). New requirement for the no-invention discipline (Layer A.3). New requirement for the spec self-contradiction sub-pass (Layer A.4). `fr-rf-010` modified to add the mechanical authorization check at Phase 6 (Layer B.4). New requirement for the `_pending-conflict.md` write-on-block contract (Layer B.2 from refiner's side).
- **`details/brainstorming.xml`** — new requirement for Phase 0 pending-conflict detection and iterate-branch entry with conflict seed (Layer B.3). New requirement for the structured decision-log output format (Layer B.1).
- **`details/cross-cutting.xml`** — new interface contract `fr-cc-if-003` for the `_pending-conflict.md` schema (mirroring how `fr-cc-if-001` defines the design doc contract and `fr-cc-if-002` defines the Spec Identity Header). New interface contract for the structured decision-log format.
- **`details/sdd-schemas.xml`** — schema entries for `_pending-conflict.md` and the structured decision-log to make them validator-addressable.
- **`details/planner.xml`** — unchanged. The fix is strictly upstream of planning.
- **Iron Law surface** — the refiner's SKILL.md Iron Law text is part of the SKILL.md prompt and is implementation surface, not spec content. The spec captures the requirement (no invention without authorization); the implementation realizes it via prompt + validator.

The v1 spec's existing requirements that are NOT touched by this iteration (`fr-rf-003` Spec Identity Header, `fr-rf-004` Per-Spec Directory Isolation, `fr-rf-005` Formalize Spec From Design Doc, `fr-rf-007` Spec Version Increment, `fr-rf-009` Input Validation, `fr-rf-011` Delta Metadata Output, `fr-rf-012` DAG Completion Gate) remain unchanged in the v2 output spec.

## Out of Scope

- **Stage 3 cross-model audit pass** — proposal's optional defense-in-depth (a different-model judge re-reads in-memory spec inside Phase 5.5). Deferred. If Stage 2's same-model-bias check on synthetic fixtures shows >1 finding divergence between Sonnet auditor and Opus refiner, this gets revisited as a future iteration.
- **Re-running the existing 14-fixture eval suite** — that is implementation-stage validation, not part of this design's scope. The implementation will re-run as a ratification gate per the proposal's stopping criteria (authorization coverage 100% mechanical, R3 firing on conflict fixtures, no internal contradictions).
- **Changes to arc-planning, arc-implementing, arc-auditing-spec** — the v1 audit and downstream stages are not the failure point. The fix lives at the upstream (refining + brainstorming).
- **v2+ iteration behavior on previously-shipped specs unrelated to conflicts** — Layer B.3 only handles the iteration-branch entry triggered by `_pending-conflict.md`. Other iteration cases use brainstorming's existing iterate branch unchanged.
- **Provenance attribute on `<criterion>` elements** — was considered (v1 of the next-session-proposal called this Patch A) and rejected. Authorization is enforced by `<trace>` mechanically pointing to a real source (Layer B.4); attribute labeling is redundant once the mechanical check exists. If the trace points to a real source, the criterion is authorized; if it does not, the criterion does not belong in the spec.
- **Standalone `design-coverage.md` output file** — was considered (v1 Patch C) and rejected for the same reason. Coverage is achievable mechanically by the validator (axis 3); a separate output is unnecessary.
- **HIGH audit-finding count as a stopping metric** — the v1 proposal framing made HIGH count the headline metric. v2 reframes audit as the last line of defense, not a daily metric. The spec must stand on its own; relying on audit to validate it is precisely what failed. The implementation's stopping criteria are authorization-coverage 100%, R3 firing on synthetic conflict fixtures, and zero internal contradictions — measured mechanically, not via audit grading.
