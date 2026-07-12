---
name: arc-brainstorming
description: Use when exploring ideas before implementation or when user wants to design a new feature or iterate on an existing spec
argument-hint: "[topic or feature to explore]"
---

# arc-brainstorming

## Iron Law

**NO DESIGN WITHOUT EXPLORATION FIRST**

Never skip to design just because "requirements seem clear" or time is tight. Exploration validates assumptions and uncovers edge cases.

**REQUIRED BACKGROUND:** Read `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/design.md` before producing any design doc — it carries the canonical schema (required/forbidden sections, heading regexes, enforcement authority). The CLI alternative `node "${ARCFORGE_ROOT}/scripts/lib/print-schema.js" design` produces equivalent content. One schema covers both branches (prose when no prior spec; Context + Change Intent when prior spec exists); filesystem state decides which conditional fields apply.

## When NOT to Use

- Requirements are already clear and documented
- Scope is a single function or small fix
- User says "just do it" or equivalent

## Phase 0: Scan and Route

**Before any elicitation, scan `specs/` for existing spec_ids.**

### Step 0a: Pending-Conflict Detection

**Check for `specs/<spec-id>/_pending-conflict.md` FIRST, before the new-vs-iterate confirmation gate.**

If it exists at the start of Phase 0, brainstorming MUST automatically enter the iterate branch — DO NOT ask "new spec or iteration?". The iterate target is determined by filesystem state; the user-consent gate is satisfied by the resolution-pick prompt below.

Use `parseConflictMarker(filePath)` to load the file. It returns `{ axis_fired, conflict_description, candidate_resolutions, user_action_prompt }`. Treat the conflict body (`conflict_description` + cited design line ranges / Q&A `q_ids`) as the Change Intent seed. The canonical path is `specs/<spec-id>/_pending-conflict.md`.

Present `candidate_resolutions` to the user VERBATIM from the pending file — do not paraphrase. Prompt:

> "pick (a), (b), (c), or describe your own"

Phase 0's conflict-detection branch MUST NOT modify or rewrite `_pending-conflict.md` — it is read-only from brainstorming's perspective.

After the user picks (or describes) a resolution AND brainstorming successfully writes the new `design.md` to `docs/plans/<spec-id>/<NEW-DATE>/design.md`, brainstorming MUST delete `specs/<spec-id>/_pending-conflict.md`. Cleanup is gated on successful write — if the design write fails, the pending file persists for retry and MUST NOT be deleted.

### Step 0b: Standard New-vs-Iterate Confirmation

If no `_pending-conflict.md` exists, proceed with the standard confirmation gate:

1. List all directories under `specs/` that contain a `spec.xml`
2. If any exist, present them: `Found existing specs: auth, payments, ...`
3. Ask the user to confirm the target — do NOT auto-detect:
   - If an existing spec matches: `"Iterating on <spec-id> (v<N> active)?"`
   - If this is a new topic: `"New topic — proposed spec-id: <suggestion>. OK?"`

**The user's explicit confirmation determines whether the design doc carries new-topic prose or iteration-context content. Never infer it.**

---

## When No Prior Spec Exists — New Spec

Fires when the user confirms a new topic and no `specs/<spec-id>/spec.xml` exists.

### Phase 1: Understanding

- Check current project state (files, docs, recent commits)
- If `product/vision.md` exists, read it as context (read-only) — its `P-n` principles state long-horizon intent
- Understand the domain and constraints

**Ask questions one at a time** — one question per message; prefer multiple choice; focus on purpose, constraints, success criteria.

**Begin buffering the decision-log from your first question** — these Phase 1 answers are authorization-bearing Q&A the refiner traces against. Assign stable q_ids and hold rows in session memory; the spec-id is not yet known, so you cannot write to disk yet (see Decision-Log Output for the ordering).

### Phase 2: Exploring

**Propose 2-3 approaches with trade-offs** — present options conversationally, lead with your recommendation and explain why. Apply YAGNI: build only what the user explicitly requested. Use the 2-Action Rule: save findings to `docs/research/<topic>.md` after every 2 search operations.

**Derive spec-id at end of Phase 2** (when scope is clear — not before):

- Propose a kebab-case spec-id, ask user to confirm: `"Proposed spec-id: <suggestion>. OK?"`
- The spec-id MUST NOT be finalized before Phase 2 completes

**Flush the buffered decision-log once the spec-id is confirmed** (see Decision-Log Output). Required on this branch too — the refiner's mechanical authorization check runs on new-spec Q&A, not just iterations. Also append `status: proposed` decision-ledger entries per the Phase 2 Decision-Ledger Output below (it applies to both branches).

### Phase 3: Presenting

**Present design in 200-300 word sections, validating each with the user. The design doc must contain all four elements:**

1. **Problem description / motivation** — what problem this solves and why
2. **Proposed solution / architecture** — key design decisions
3. **Identifiable requirements** — things the system must do, in prose (not stubs)
4. **Scope declaration** — what is included and what is explicitly excluded

### Phase 3 Output

Validate before writing to disk:

- File path follows `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`
- Design doc has substantive content (not empty or stub)
- Identifiable requirements present in prose
- Scope declared (includes and excludes)

**ERROR on any missing element — do not write until resolved.**

**If the `docs/plans/<spec-id>/<YYYY-MM-DD>/` folder already exists**, offer a suffix to disambiguate (see Same-Day Iteration UX).

Write to: `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`

---

## When Prior Spec Exists — Iterating on a Spec

Fires when the user confirms iteration and `specs/<spec-id>/spec.xml` already exists.

### Phase 1: Load Existing State

Before asking the user anything:

1. Read `specs/<spec-id>/spec.xml` — current spec version and scope
2. Read all previous iterations under `docs/plans/<spec-id>/*/design.md` — the evolution history
3. If `specs/<spec-id>/vision.md` exists, read it as context (read-only). Do NOT write to it.
4. If `specs/<spec-id>/decisions.yml` exists, read it as context (read-only) — shows already-recorded decisions and their status.
5. Summarize the current state briefly to the user

### Phase 2: Elicit the Change Intent

Ask what is changing and why — one question at a time. Use the 2-Action Rule (save research to `docs/research/<topic>.md` after every 2 searches). Apply YAGNI: only capture what the user explicitly states is changing.

**Emit the structured decision-log for every Q&A exchange** (see Decision-Log Output). The spec-id is already known on this branch, so write the decision-log incrementally from the first exchange.

#### Phase 2 Decision-Ledger Output (D6)

After the change intent and key rationale are clear, append a `status: proposed` entry to `specs/<spec-id>/decisions.yml` for each significant decision. Follow the `DECISION_LEDGER_RULES` field shape exported from `${ARCFORGE_ROOT}/scripts/lib/sdd-utils.js`:

```yaml
- D-id: D-NNN          # monotonically increasing, e.g. D-001, D-002
  date: YYYY-MM-DD
  spec_version: N      # current spec version number
  status: proposed
  decision: "<one-sentence statement of the decision>"
  why: "<rationale — what problem it solves and why this choice>"
  authorized_values: "<the specific value or range authorized, or 'any'>"
```

**Append-only:** never edit existing entries. The B2 immutability hook denies any write that modifies a frozen entry's `decision` or `why`. If a decision changes, record a new superseding entry (`supersedes: D-NNN`). Applies to both new-spec and iteration sessions. Create the file as a YAML sequence if absent.

### Phase 3 Output

The design doc carries a Context summary plus a natural-language Change Intent. The refiner reads this alongside `specs/<spec-id>/spec.xml` and **derives the structured `<delta>` itself** — the design doc carries human-authored narrative, never a pre-authored ADDED/MODIFIED/REMOVED list.

Follow the canonical schema (REQUIRED BACKGROUND above); `validateDesignDoc` enforces it and wins on any disagreement.

**Validate before writing to disk:**

- Context section present (matching the regex printed by `print-schema.js`)
- Change Intent section present
- No pre-authored structured delta section (Added/Modified/Removed/Renamed/Delta)

**ERROR on any missing required section — do not write until resolved.**

**If the `docs/plans/<spec-id>/<YYYY-MM-DD>/` folder already exists**, offer a suffix (see Same-Day Iteration UX).

Write to: `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`

---

## Decision-Log Output

Applies to **both branches**. Every session that elicits Q&A MUST emit the Q&A history as a structured decision-log in YAML at `docs/plans/<spec-id>/<YYYY-MM-DD>[-suffix]/decision-log.yml` — the refiner parses it mechanically via `parseDecisionLog` (its Phase 6 authorization check iterates rows by `q_id`), so brainstorming MUST NOT emit free-form prose.

**Schema source of truth:** Before writing or validating `decision-log.yml`, direct-read `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/decision-log.md` and follow the `DECISION_LOG_RULES` contract exported via `${ARCFORGE_ROOT}/scripts/lib/sdd-utils.js`. Do not copy a template into this skill; the generated schema is authoritative for required fields (`q_id`, `question`, `user_answer_verbatim`, `deferral_signal`), valid/invalid examples, canonical path, and the deferral-signal phrases used to set `deferral_signal: true` (currently `use defaults`, `covered.`, `skip`, `you decide`).

**q_id stability:** Assign q_ids sequentially (`q1`, `q2`, ...). Once a question receives `q1`, that q_id MUST NOT be reassigned to a different question within the same session; added or revised rows get the next sequential q_id.

**Write incrementally after each elicitation exchange** — do not defer to the end of Phase 2, so an interruption does not lose Q&A history.

**When the spec-id is not yet determined (new-spec branch):** the output path depends on `<spec-id>`, confirmed only at the end of Phase 2. Buffer rows in memory with stable q_ids from the first exchange, flush them to the path above the moment the user confirms the spec-id, then append incrementally afterward (exactly as the iterate branch does from the start).

---

## Same-Day Iteration UX

When the target folder (`docs/plans/<spec-id>/<YYYY-MM-DD>/`) already exists, present the user with options:

- **Numeric disambiguator:** `<YYYY-MM-DD>-v2` (sequential same-day iterations)
- **Descriptive suffix:** `<YYYY-MM-DD>-rework`, `<YYYY-MM-DD>-post-review`, `<YYYY-MM-DD>-oauth-pivot`

The user picks; the chosen identifier becomes both the folder name and the `design_iteration` the refiner writes. The schema accepts any `YYYY-MM-DD(-.+)?` — the suffix is human convention.

---

## After the Design (Mandatory)

**1) Write the validated design doc to the confirmed path.**

**2) Commit the brainstorming artifacts** (the dated plans directory plus the decision ledger):

```
git add docs/plans/<spec-id>/<YYYY-MM-DD>/
git add specs/<spec-id>/decisions.yml
git commit -m "docs: add <spec-id> design and decision artifacts"
```

If no ledger entries were appended this session and `specs/<spec-id>/decisions.yml` does not exist, skip its `git add` line.

**3) Hand off to refiner** — always route to `/arc-refining` next:

`/arc-refining` → `/arc-planning` → `/arc-coordinating`

The refiner reads the complete design doc and runs the DAG completion gate before a new iteration spec, so an incomplete prior sprint will block.

## Common Rationalizations

| Excuse | Reality |
| -------------------------------- | ------------------------------- |
| "User explained clearly" | Assumptions hide in "clarity" |
| "Time pressure" | Rushing causes rework |
| "Professional solution" | YAGNI violation |
| "Future-proof" | Premature optimization |
| "Batch questions for efficiency" | Overwhelms user, misses context |
| "Requirements are obvious" | Edge cases lurk in obviousness |
| "Better to have it" | Scope creep starts here |
| "Looks like an iteration from context" | Must confirm explicitly with user |
| "I'll pre-author the delta to save the refiner work" | Forbidden — refiner is the diff authority |

## Stage Completion Format

```
─────────────────────────────────────────────────
✅ Brainstorm complete → docs/plans/<spec-id>/<YYYY-MM-DD>/design.md (committed)

Next: /arc-refining → /arc-planning → /arc-coordinating
─────────────────────────────────────────────────
```

## Blocked Format

```
─────────────────────────────────────────────────
⚠️ Brainstorm blocked

Issue: [specific missing element]
Location: [design doc section or path]

To resolve:
1. [Specific action]
2. [Specific action]

Then retry: /arc-brainstorming
─────────────────────────────────────────────────
```
