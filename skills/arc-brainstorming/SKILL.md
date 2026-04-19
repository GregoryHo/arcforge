---
name: arc-brainstorming
description: Use when exploring ideas before implementation or when user wants to design a new feature or iterate on an existing spec
---

# arc-brainstorming

## Iron Law

**NO DESIGN WITHOUT EXPLORATION FIRST**

Never skip to design just because "requirements seem clear" or time is tight. Exploration validates assumptions and uncovers edge cases.

## When NOT to Use

- Requirements are already clear and documented
- Scope is a single function or small fix
- User says "just do it" or equivalent

## Phase 0: Scan and Route

**Before any elicitation, scan `specs/` for existing spec_ids.**

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

**REQUIRED BACKGROUND:** Read `scripts/lib/sdd-schemas/design.md` before producing the design doc to ensure the output conforms to the contract for "no prior spec" docs.

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

### Phase 3 Output

The design doc carries a Context summary plus a natural-language Change Intent. The downstream refiner reads this alongside `specs/<spec-id>/spec.xml` and **derives the structured `<delta>` itself** — the design doc carries human-authored narrative, never a pre-authored ADDED/MODIFIED/REMOVED list.

**Required sections (ERROR if missing):**

**Context** — 2-3 sentences summarizing the current spec scope, plus a reference to the spec version:
```
## Context (from spec v<N>)

<2-3 sentence summary of what the spec currently covers>

Reference: specs/<spec-id>/spec.xml v<N>
```

**Change Intent** — what is changing and why (primary input for the refiner):
```
## Change Intent

<What is changing and why. Natural prose. The refiner derives the delta from this.>
```

**Recommended section (optional for simple changes):**

**Architecture Impact** — how the changes interact with existing design:
```
## Architecture Impact

<How changes interact with existing design. Omit for simple isolated changes.>
```

**Forbidden:** No pre-authored structured delta section. Do not write a `## Added / Modified / Removed` list — the refiner derives the delta itself per the realigned pipeline (per `[[arcforge-decision-sdd-v2-pipeline-realignment]]` D3).

**REQUIRED BACKGROUND:** Read `scripts/lib/sdd-schemas/design.md` before producing the design doc to ensure the output conforms to the contract for "prior spec exists" docs.

Validate before writing to disk:

- Context section present (with spec version reference)
- Change Intent section present
- No pre-authored structured delta section

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
