# spec-driven-refine v2 — Refiner R3 Enforcement & Conflict Handoff

## Context

`spec-driven-refine` v1 (2026-04-16, active) defined the SDD pipeline as Stage 1 brainstorming → Stage 2 refiner → Stage 3 planner, governed by R1 Human Consent / R2 Unidirectional Flow / R3 Block on Contradictions.

This iteration is the second design pass for v2. The first pass (2026-04-25) was authored to address eval evidence — 17 HIGH / 31 MED audit findings across 14 fixtures, attributable to four R3-enforcement-failure patterns:

- 1a — User deferred ("use defaults"), refiner committed concrete MUSTs from training-data inference.
- 1b — User answered, refiner overrode (e.g., windowSec → windowMs).
- 2 — Trace cited a source where the cited content was absent or line-range-drifted.
- 3 — Internal contradictions inside the produced spec (description scope ≠ AC scope, RFC-2119 verb mismatches).

Cross-cutting observation: in 14/14 runs, when the user answered a Q&A, the answer stayed in `decision-log.md` only and `design.md` was never updated. v1's refiner had no path to route a design ↔ Q&A conflict back through the upstream `design.md` for human-authorized resolution.

The 2026-04-25 design proposed the fix in two layers — Layer A (refiner-discipline rules, prompt-only) and Layer B (structured handoff with `_pending-conflict.md`). The Stage-1-patched refiner Phase 4 blocked on that design, surfacing 2 axis-1 contradictions + 4 ambiguities that this 2026-04-27 iteration resolves. The change-intent substance is preserved; the resolutions tighten language and reassign IDs to land on a clean spec.

R2 calibration (2026-04-25): 人為授權能接受 — 所有工作都是 LLM 協助的,差別只在有沒有人為監督. LLM-drafted-then-human-approved is legitimate; refiner remains forbidden from writing `docs/plans/`. The handoff to brainstorming preserves R1.

## Change Intent

The change is one principle expressed at multiple layers:

> **Every spec criterion must trace to human authorization. Refiner must not invent. Conflicts must surface, not be silently resolved.**

This iteration realizes the principle in two layers — refiner-discipline rules (Layer A, prompt + validator) and structural handoff (Layer B with `_pending-conflict.md`). Both layers ship in v2; the optional cross-model audit pass (Stage 3 in the prior proposal) is deferred.

### Layer A — Refiner discipline

**A.1 — Iron Law revision.** The current Iron Law's first clause is `SPEC IS THE WIKI — PRESERVE EVERY PRIOR DELTA. NEVER WRITE ON BLOCK.` Clause 1 is architectural metaphor, not actionable invariant. The new Iron Law replaces clause 1 with `NO INVENTION WITHOUT AUTHORIZATION`. Clause 3 is narrowed from `NEVER WRITE ON BLOCK` to `NEVER WRITE AUTHORITATIVE STATE ON BLOCK` — `_pending-conflict.md` is an explicit ephemeral handoff exception (non-versioned, non-authoritative, consumed-and-deleted by brainstorming). The full Iron Law becomes `NO INVENTION WITHOUT AUTHORIZATION. PRESERVE EVERY PRIOR DELTA. NEVER WRITE AUTHORITATIVE STATE ON BLOCK.` The refiner's SKILL.md is implementation surface; the spec captures the requirement (no invention; ephemeral handoff carved out at Iron Law level).

**A.2 — Three-axis contradiction check, phase-split.** v1's Phase 4 checks one axis (design.md internal). v2 expands to three axes, with phasing tuned to what each axis can verify:

| Axis | What is checked | Phase | Mechanism |
|---|---|---|---|
| 1 | design.md internal contradictions | Phase 4 (pre-draft) | LLM judgment |
| 2 | design.md ↔ user Q&A — design says X, Q&A says ¬X → R3 fires | Phase 4 (pre-draft) | LLM judgment |
| 3 | Spec-draft coverage — every produced criterion must trace to a (design phrase ∪ Q&A row) source | Phase 5.5 (post-draft, pre-validation) + Phase 6 (mechanical validator over `<trace>` elements) | LLM judgment + mechanical |

When any axis fires, R3 demands BLOCK with no authoritative state written; `_pending-conflict.md` is the only permitted artifact (per A.1's narrowed clause 3). Axes 1 and 2 fire pre-draft because they need only the inputs; axis 3 requires the draft to exist, so it lives at Phase 5.5 (LLM judgment) and Phase 6 (mechanical authorization check — see B.4).

**A.3 — Phase 5 no-invention constraint.** Refiner MUST NOT author criteria from training-data inference. Under deferral, the legitimate refiner moves are exactly three: (a) preserve design's qualitative phrasing as SHOULD/MAY (this is authorized — the source phrase is in design.md), (b) leave the axis unbound (no criterion at all), (c) BLOCK with conflict file. Inventing a concrete MUST from training-data common practice is not on the list.

**A.4 — Phase 5.5 self-contradiction sub-pass.** Before Phase 6 output validation, refiner re-reads each requirement's description against each acceptance criterion and detects scope mismatches and RFC-2119 verb mismatches (e.g., description says "the system handles X" but ACs only test the success path; description says "MUST validate" but AC uses "SHOULD"). When such mismatches are detected, refiner BLOCKs (per the Iron Law's R3 framing — internal contradiction is an R3 enforcement failure, same severity as Patterns 1a/1b/2; not a WARN). Phase 5.5 also hosts axis 3's LLM judgment pass per A.2.

### Layer B — Conflict handoff

**B.1 — Structured decision-log format.** The brainstorming Q&A output (currently free-form `decision-log.md`) becomes machine-parseable. Each Q&A row carries four required fields: `q_id` (stable identifier), `question` (verbatim), `user_answer_verbatim` (verbatim), and `deferral_signal` (boolean — true when the answer matches deferral phrases like "use defaults", "covered.", "skip", "you decide"). The contract the spec captures is: the decision-log MUST be machine-parseable and rows MUST be addressable by `q_id` so Phase 6's mechanical authorization check can iterate over them. The wire format (YAML, strict markdown table, etc.) is an implementation choice and is deliberately not pinned in the spec — the contract is the load-bearing invariant; the format is a swappable detail.

**B.2 — `_pending-conflict.md` handoff artifact.** When refiner blocks on axes 1, 2, or 3, it writes a single structured handoff file at `specs/<spec-id>/_pending-conflict.md` and exits non-zero with no `spec.xml` or `details/` written. Per A.1's narrowed Iron Law, this is the carved-out ephemeral exception — `_pending-conflict.md` is non-versioned, non-authoritative, and is deleted by brainstorming on successful new-design write. The file carries: which axis fired, the conflict description (specific design line ranges and Q&A row q_ids involved), 1–3 candidate resolutions, and a user-action prompt directing the user to `/arc-brainstorming iterate <spec-id>`.

**B.3 — arc-brainstorming Phase 0 pending-conflict detection.** Phase 0's existing scan-and-route logic gains one more check: if `specs/<spec-id>/_pending-conflict.md` exists, brainstorming automatically enters its iterate branch with the conflict body as Change Intent seed (the user does not retell the conflict). The user picks a resolution candidate (or describes their own); brainstorming writes a new dated `docs/plans/<spec-id>/<NEW-DATE>/design.md` with the resolution baked in; the pending file is deleted on successful design write. R1 holds (human authorized via brainstorming's user-confirmation gate); R2 holds (refiner never wrote design.md; brainstorming did, after user picked); R3 holds (no authoritative state was written by refiner; the ephemeral marker existed transiently and is now removed).

**B.4 — Phase 6 mechanical authorization check (axis 3 enforcement at validator level).** Phase 6 validator iterates over every `<trace>` element in the in-memory spec. For traces citing design line ranges, it checks the cited content appears at those lines. For traces citing Q&A rows by `q_id`, it checks the cited content appears in that row of the structured decision-log. Any mismatch is ERROR; refiner blocks per A.1's Iron Law (no authoritative state written; `_pending-conflict.md` is the only artifact written). This is the mechanical layer of axis 3 enforcement; the LLM-judgment layer fires earlier at Phase 5.5.

### Why route conflicts through brainstorming instead of letting refiner write a design diff

A simpler-looking alternative — refiner drafts a design.md change, user approves inline, refiner writes upstream — was rejected because it breaks R1's physical implementation. R1 in arcforge is enforced by "raw source = immutable file; new iteration = new file." The simpler alternative degrades that to "LLM writes upstream after user approves," collapsing the file-system-level guarantee into a runtime-protocol guarantee. Once the physical constraint is gone, audit-trail integrity becomes contingent on every approval gate working correctly. Routing through arc-brainstorming preserves the constraint — every design change goes through brainstorming's iterate branch which already has the user-confirmation gate built in.

The "weight" cost of switching tools (refiner blocks → user runs `/arc-brainstorming iterate`) is mitigated by `_pending-conflict.md` being a first-class hand-off artifact. The user does not retell the conflict; brainstorming reads it as Change Intent seed, and the user's interaction reduces to one message: "pick (a)/(b)/(c)/other".

## Architecture Impact

- **`details/refiner.xml`** — `fr-rf-001` modified to cover all three axes (currently axis 1 only) with the phase-split per A.2. `fr-rf-010` modified to add the mechanical authorization check at Phase 6 (Layer B.4). New `fr-rf-013` for the Phase 5 no-invention discipline (Layer A.3). New `fr-rf-014` for the Phase 5.5 self-contradiction sub-pass with BLOCK behavior (Layer A.4); `fr-rf-014` also covers the axis 3 LLM-judgment pass per A.2 phasing. New `fr-rf-015` for the `_pending-conflict.md` write-on-block contract (Layer B.2). `fr-rf-008` (Merged Spec Validation) is unchanged — its scope (inter-requirement merge contradictions) is distinct from `fr-rf-014`'s scope (intra-requirement self-contradiction + criterion coverage).
- **`details/brainstorming.xml`** — new `fr-bs-008` for Phase 0 pending-conflict detection and iterate-branch entry with conflict seed (Layer B.3). New `fr-bs-009` for the structured decision-log output format (Layer B.1).
- **`details/cross-cutting.xml`** — new interface contract `fr-cc-if-007` for the `_pending-conflict.md` schema (mirroring how `fr-cc-if-001` defines the design-doc contract and `fr-cc-if-002` defines the Spec Identity Header). New interface contract `fr-cc-if-008` for the structured decision-log format. The existing `fr-cc-if-003` (SDD Schemas Guidance Layer) remains unchanged — it defines a still-valid file-existence requirement, deprecated as SoT but live as artifact location per `fr-sd-011-ac3`.
- **`details/sdd-schemas.xml`** — new schema requirements for `_pending-conflict.md` (location, required fields, parse rules) and the structured decision-log (4 fields, q_id-indexed) so both are validator-addressable. New requirement for the corresponding parser/validator API in `sdd-utils.js` (`parseConflictMarker`, `parseDecisionLog`, `validateDecisionLog`, plus a Phase 6 mechanical authorization helper).
- **`details/planner.xml`** — unchanged. The fix is strictly upstream of planning.
- **Iron Law surface** — refiner's SKILL.md Iron Law text is implementation, not spec content. The spec captures the requirements (no invention; ephemeral handoff exception); the implementation realizes them via prompt + validator.

The v1 spec's existing requirements that are NOT touched by this iteration (`fr-rf-003` Spec Identity Header, `fr-rf-004` Per-Spec Directory Isolation, `fr-rf-005` Formalize Spec From Design Doc, `fr-rf-007` Spec Version Increment, `fr-rf-008` Merged Spec Validation, `fr-rf-009` Input Validation, `fr-rf-011` Delta Metadata Output, `fr-rf-012` DAG Completion Gate) remain unchanged in the v2 output spec.

## Out of Scope

- **Stage 3 cross-model audit pass** — proposal's optional defense-in-depth (a different-model judge re-reads in-memory spec inside Phase 5.5). Deferred. If Stage 2's same-model-bias check on synthetic fixtures shows >1 finding divergence between Sonnet auditor and Opus refiner, this gets revisited as a future iteration.
- **Re-running the existing 14-fixture eval suite** — implementation-stage validation, not part of this design's scope. Implementation will re-run as a ratification gate per the proposal's stopping criteria (authorization coverage 100% mechanical, R3 firing on conflict fixtures, no internal contradictions).
- **Changes to arc-planning, arc-implementing, arc-auditing-spec** — v1 audit and downstream stages are not the failure point. The fix lives at the upstream (refining + brainstorming).
- **v2+ iteration behavior on previously-shipped specs unrelated to conflicts** — Layer B.3 only handles the iterate-branch entry triggered by `_pending-conflict.md`. Other iteration cases use brainstorming's existing iterate branch unchanged.
- **Provenance attribute on `<criterion>` elements** — was considered (prior proposal's Patch A) and rejected. Authorization is enforced by `<trace>` mechanically pointing to a real source (Layer B.4); attribute labeling is redundant once the mechanical check exists.
- **Standalone `design-coverage.md` output file** — was considered (prior proposal's Patch C) and rejected. Coverage is achievable mechanically by the validator (axis 3); a separate output is unnecessary.
- **HIGH audit-finding count as a stopping metric** — audit is the last line of defense, not a daily metric. The implementation's stopping criteria are authorization-coverage 100%, R3 firing on synthetic conflict fixtures, and zero internal contradictions — measured mechanically, not via audit grading.
- **Cleanup of deprecated `fr-cc-if-003`** — the existing `fr-cc-if-003` (SDD Schemas Guidance Layer) requires `scripts/lib/sdd-schemas/design.md` and `spec.md` to exist. Per `fr-sd-011-ac3`, these files are deprecated as SoT (CLI + RULES constants are the SoT) but remain as artifacts. Removing `fr-cc-if-003` would also require removing those files; that scope-creep does not belong in this R3-enforcement iteration.
