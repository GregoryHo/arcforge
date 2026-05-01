---
name: arc-brainstorming
description: Use when exploring ideas before implementation or when user wants to design a new feature or iterate on an existing spec
---

# arc-brainstorming

## Iron Law

**NO DESIGN WITHOUT EXPLORATION FIRST**

Never skip to design just because "requirements seem clear" or time is tight. Exploration validates assumptions and uncovers edge cases.

**REQUIRED BACKGROUND:** Read `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/design.md` before producing any design doc — it carries the canonical schema (required/forbidden sections, heading regexes, enforcement authority), auto-generated from `${ARCFORGE_ROOT}/scripts/lib/sdd-utils.js`'s rule constants. The CLI alternative `node "${ARCFORGE_ROOT}/scripts/lib/print-schema.js" design` produces equivalent content. The same schema covers both branches (prose when no prior spec; Context + Change Intent when prior spec exists); filesystem state decides which conditional fields apply — this is not a "mode" switch.

## When NOT to Use

- Requirements are already clear and documented
- Scope is a single function or small fix
- User says "just do it" or equivalent

## Phase 0: Scan and Route

**Before any elicitation, scan `specs/` for existing spec_ids.**

### Step 0a: Pending-Conflict Detection (fr-bs-008)

**Check for `specs/<spec-id>/_pending-conflict.md` FIRST, before the new-vs-iterate confirmation gate.**

If `specs/<spec-id>/_pending-conflict.md` exists at the start of Phase 0, brainstorming MUST automatically enter the iterate branch — DO NOT ask "new spec or iteration?". This is the explicit exception carved out in `fr-bs-002-ac3`: the iterate-branch target is determined by filesystem state per `fr-bs-008-ac1`, and the user-consent gate is satisfied by the resolution-pick prompt in `fr-bs-008-ac2` — no separate "new spec or iteration?" confirmation is asked.

**Loading the conflict (fr-bs-008-ac1):**

Use `parseConflictMarker(filePath)` to load the file. It returns `{ axis_fired, conflict_description, candidate_resolutions, user_action_prompt }`. Treat the conflict body (`conflict_description` + cited design line ranges / Q&A `q_ids`) as the Change Intent seed. The canonical file path is `specs/<spec-id>/_pending-conflict.md` (from `PENDING_CONFLICT_RULES.canonical_path`).

**Presenting resolutions (fr-bs-008-ac2):**

Present `candidate_resolutions` to the user VERBATIM from the pending file — do not paraphrase. Prompt:

> "pick (a), (b), (c), or describe your own"

The user does not retell the conflict; brainstorming does not re-derive the conflict from scratch.

**Read-only constraint (fr-bs-008-ac4):**

Phase 0's conflict-detection branch MUST NOT modify or rewrite `_pending-conflict.md` content — the file is read-only from brainstorming's perspective. Any framing changes happen in the new `design.md`, not by editing the handoff file.

**Deletion on success (fr-bs-008-ac3):**

After the user picks (or describes) a resolution AND brainstorming successfully writes the new `design.md` to `docs/plans/<spec-id>/<NEW-DATE>/design.md`, brainstorming MUST delete `specs/<spec-id>/_pending-conflict.md`. Cleanup is gated on successful write — if the design write fails, the pending file persists for retry and MUST NOT be deleted.

---

### Step 0b: Standard New-vs-Iterate Confirmation

If no `_pending-conflict.md` exists, proceed with the standard confirmation gate:

1. List all directories under `specs/` that contain a `spec.xml`
2. If any exist, present them to the user: `Found existing specs: auth, payments, ...`
3. Ask the user to confirm the target — do NOT auto-detect:
   - If an existing spec matches: `"Iterating on <spec-id> (v<N> active)?"`
   - If this is a new topic: `"New topic — proposed spec-id: <suggestion>. OK?"`

**The user's explicit confirmation determines whether the design doc carries new-topic prose or iteration-context content. Never infer it.**

The downstream refiner detects context from the filesystem (presence or absence of `specs/<spec-id>/spec.xml`). Brainstorming has one behavior with context-sensitive output — it does not invoke a separate code path or "mode".

---

## When No Prior Spec Exists — New Spec

This branch fires when the user confirms a new topic and no `specs/<spec-id>/spec.xml` exists for the chosen spec-id.

### Phase 1: Understanding

**Start with context:**

- Check current project state (files, docs, recent commits)
- Understand the domain and constraints

**Ask questions one at a time:**

- Only one question per message — if a topic needs exploration, break it into multiple questions
- Prefer multiple choice when possible, but open-ended is fine
- Focus on: purpose, constraints, success criteria

### Phase 2: Exploring

**Propose 2-3 approaches with trade-offs:**

- Present options conversationally with your recommendation
- Lead with recommended option and explain why
- Use 2-Action Rule: Save findings to `docs/research/<topic>.md` after every 2 search operations

**Apply YAGNI ruthlessly:**

- Build only what user explicitly requested
- Remove features beyond stated requirements
- Say no to "nice to have" additions

**Derive spec-id at end of Phase 2** (when scope is clear — not before):

- Propose a kebab-case spec-id based on the topic
- Ask user to confirm or modify: `"Proposed spec-id: <suggestion>. OK?"`
- The spec-id MUST NOT be finalized before Phase 2 completes

### Phase 3: Presenting

**Present design in 200-300 word sections:**

- Ask after each section whether it looks right
- Cover: problem, solution, requirements, scope, architecture, error handling
- Be ready to go back and clarify

**The design doc must contain all four elements:**

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

**If the `docs/plans/<spec-id>/<YYYY-MM-DD>/` folder already exists**, offer the user a suffix to disambiguate (see Same-Day Iteration UX below).

Write to: `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`

---

## When Prior Spec Exists — Iterating on a Spec

This branch fires when the user confirms iteration on an existing spec-id and `specs/<spec-id>/spec.xml` already exists.

### Phase 1: Load Existing State

Before asking the user anything:

1. Read `specs/<spec-id>/spec.xml` — understand the current spec version and scope
2. Read all previous design iterations under `docs/plans/<spec-id>/*/design.md` — understand the evolution history
3. Summarize the current state briefly to the user so they have shared context

### Phase 2: Elicit the Change Intent

Ask the user what is changing and why — one question at a time.

Use 2-Action Rule: Save research findings to `docs/research/<topic>.md` after every 2 search operations.

Apply YAGNI ruthlessly: only capture what the user explicitly states is changing.

#### Phase 2 Decision-Log Output (fr-bs-009)

Brainstorming MUST emit the Q&A history as a structured decision-log in YAML format. The v1 free-form `decision-log.md` is **replaced** by this structured format — the refiner now mechanically parses the decision-log via `parseDecisionLog`, so brainstorming MUST NOT emit the old free-form prose.

**Output path:** `<brainstorming-output-dir>/decision-log.yml`

That is: `docs/plans/<spec-id>/<YYYY-MM-DD>[-suffix]/decision-log.yml`

**Wire format — YAML sequence, one mapping per Q&A row:**

```yaml
- q_id: q1
  question: "Verbatim text of the question asked"
  user_answer_verbatim: "Verbatim text of the user's answer, not paraphrased"
  deferral_signal: false

- q_id: q2
  question: "Next question asked"
  user_answer_verbatim: "use defaults"
  deferral_signal: true
```

**Four required fields per row** (from `DECISION_LOG_RULES.required_fields_per_row` in `${ARCFORGE_ROOT}/scripts/lib/sdd-rules.js` — single source of truth):

| Field | Type | Rule |
|---|---|---|
| `q_id` | string | Stable identifier, unique within the session. See q_id stability rule below. |
| `question` | string | Verbatim text of the question asked during elicitation. |
| `user_answer_verbatim` | string | Verbatim text of the user's answer — MUST NOT be paraphrased or summarized. |
| `deferral_signal` | boolean | `true` when answer matches a canonical deferral phrase; `false` otherwise. |

Missing any field is ERROR per the schema. See `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/decision-log.md` for full schema documentation.

**q_id stability rule (fr-bs-009-ac3):**

`q_id` values MUST be stable across the brainstorming session. Assign q_ids sequentially (`q1`, `q2`, `q3`, ...) and persist them across iteration revisions. Once a question receives `q1`, that q_id MUST NOT be reassigned to a different question within the same session. If a row is added or a question is revised, new rows get the next sequential q_id; existing q_ids stay fixed.

**Deferral-signal detection rule (fr-bs-009-ac4):**

Brainstorming MUST set `deferral_signal: true` when `user_answer_verbatim` matches any of the canonical phrases in `DECISION_LOG_RULES.deferral_signal_canonical_phrases` (case-insensitive, trimmed). The minimum required set is:

- `use defaults`
- `covered.`
- `skip`
- `you decide`

Implementations MAY extend this list with additional deferral phrases. Any extensions MUST be documented alongside the decision-log output. The canonical list in `DECISION_LOG_RULES` is the authoritative source — when the list changes there, the detection rule changes automatically.

**Write the decision-log after each elicitation exchange.** Do not defer writing to the end of Phase 2 — write incrementally so a session interruption does not lose Q&A history.

### Phase 3 Output

The design doc carries a Context summary plus a natural-language Change Intent. The downstream refiner reads this alongside `specs/<spec-id>/spec.xml` and **derives the structured `<delta>` itself** — the design doc carries human-authored narrative, never a pre-authored ADDED/MODIFIED/REMOVED list.

**Get the current schema (required reading before writing):**

Read `${ARCFORGE_ROOT}/scripts/lib/sdd-schemas/design.md` directly (primary form), or invoke the equivalent CLI:

```bash
node "${ARCFORGE_ROOT}/scripts/lib/print-schema.js" design
```

Either form yields the canonical design-doc schema — required sections, forbidden sections, heading regexes, and enforcement authority. This is the single source of truth; do NOT reconstruct the schema from memory, and do NOT copy schema content into this skill. The rules live in `${ARCFORGE_ROOT}/scripts/lib/sdd-utils.js` (`DESIGN_DOC_RULES`) and the validator (`validateDesignDoc`) enforces them. If this skill and the validator ever disagree, the validator wins.

**Validate before writing to disk:**

- Context section present (matching the regex printed by `print-schema.js`)
- Change Intent section present
- No pre-authored structured delta section (Added/Modified/Removed/Renamed/Delta)

**ERROR on any missing required section — do not write until resolved.**

**If the `docs/plans/<spec-id>/<YYYY-MM-DD>/` folder already exists**, offer the user a suffix to disambiguate (see Same-Day Iteration UX below).

Write to: `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`

---

## Same-Day Iteration UX

When the target folder (`docs/plans/<spec-id>/<YYYY-MM-DD>/`) already exists before writing:

Present the user with options:

- **Numeric disambiguator:** `<YYYY-MM-DD>-v2` (sequential same-day iterations)
- **Descriptive suffix:** `<YYYY-MM-DD>-rework`, `<YYYY-MM-DD>-post-review`, `<YYYY-MM-DD>-oauth-pivot` (intent-tagged iterations)

The user picks. The chosen identifier becomes both the folder name and the `design_iteration` written by the refiner later.

The schema accepts any `YYYY-MM-DD(-.+)?` — the suffix is human convention, not a schema constraint.

---

## After the Design (Mandatory)

**1) Write the validated design doc to the confirmed path**

**2) Commit the design doc**

```
git add docs/plans/<spec-id>/<YYYY-MM-DD>/design.md
git commit -m "docs: add <spec-id> design"
```

**3) Hand off to refiner**

Always route to `/arc-refining` next:

`/arc-refining` → `/arc-planning` → `/arc-coordinating`

The refiner reads the complete design doc — no structured summary section is needed. The refiner also runs the DAG completion gate before producing a new iteration spec, so if a prior sprint is incomplete it will block.

---

## Red Flags

Stop immediately if you catch yourself thinking:

1. "Requirements are clear, can skip questions"
2. "Time pressure, need to move fast"
3. "These extra features would be good"
4. "User will want this eventually"
5. "Ask all questions at once for efficiency"
6. "This is obvious, no need to explore"
7. "Just one more feature won't hurt"
8. "I can tell from context whether this is new or iteration" — always ask
9. "I'll write a quick ADDED/MODIFIED list to make it easier for the refiner" — forbidden; refiner derives the delta

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

## Key Principles

- One question at a time — Don't overwhelm with multiple questions
- Multiple choice preferred — Easier to answer than open-ended when possible
- YAGNI ruthlessly — Remove unnecessary features from all designs
- Explore alternatives — Always propose 2-3 approaches before settling
- Incremental validation — Present design in sections, validate each
- Be flexible — Go back and clarify when something doesn't make sense
- Explicit routing — Always confirm new-topic vs iteration with the user

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
