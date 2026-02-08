---
name: arc-brainstorming
description: Use when exploring ideas before implementation or when user says "let's build X"
---

# arc-brainstorming

## Iron Law

**NO DESIGN WITHOUT EXPLORATION FIRST**

Never skip to design just because "requirements seem clear" or time is tight. Exploration validates assumptions and uncovers edge cases.

## The Process

### Phase 1: Understanding

**Start with context:**

- Check current project state (files, docs, recent commits)
- Understand the domain and constraints

**Ask questions one at a time:**

- Only one question per message - if a topic needs exploration, break it into multiple questions
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

### Phase 3: Presenting

**Present design in 200-300 word sections:**

- Ask after each section whether it looks right
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify
- If a section exceeds 300 words, split it
- If a section is under 200 words, merge with an adjacent section

**Sectioning template (200–300 words each):**

- **Architecture:** system boundaries, major modules, key decisions
- **Components:** responsibilities, interfaces, dependencies
- **Data Flow:** request/response paths, state transitions, storage
- **Error Handling:** failure modes, retries, user-visible errors
- **Testing:** unit/integration scope, key scenarios

**Confirmation line (required per section):**
End each section with: "Does this look right?"

**Include REFINER_INPUT section:**

- Structured requirements for downstream consumption
- Use template below

## After the Design (Mandatory)

**1) Write the design doc to** `docs/plans/YYYY-MM-DD-<topic>-design.md`

**2) Commit the design doc**

```
git add docs/plans/YYYY-MM-DD-<topic>-design.md
git commit -m "docs: add <topic> design"
```

**3) Decide next flow (implementation handoff)**

Route to **refiner** (specs required) if ANY of these are true:

- 3+ subsystems/domains (ex: auth + API + UI)
- 8+ requirements
- Cross-module dependencies or 2+ dependency chains
- Missing acceptance criteria for any requirement
- Ambiguous terms like "should", "usually", "maybe" without quantification
- Scope boundaries unclear (no explicit out-of-scope)

**Large/unclear flow:**
`/arc-refining` → `/arc-planning` → `/arc-coordinating`

**Small/clear flow:**
`/arc-writing-tasks` → `/arc-executing-tasks`

**If isolation is needed:** insert `/arc-using-worktrees` before writing tasks.

## Design Document Template

```markdown
# [Topic] Design

## Vision

[High-level concept]

## Architecture Decision

[Key technical choices]

---

<!-- REFINER_INPUT_START -->

## Requirements for Refiner

### Functional Requirements

- REQ-F001: [description]

### Non-Functional Requirements

- REQ-N001: [description]

### Constraints

- [constraint description]
<!-- REFINER_INPUT_END -->
```

## Red Flags

Stop immediately if you catch yourself thinking:

1. "Requirements are clear, can skip questions"
2. "Time pressure, need to move fast"
3. "These extra features would be good"
4. "User will want this eventually"
5. "Ask all questions at once for efficiency"
6. "This is obvious, no need to explore"
7. "Just one more feature won't hurt"

## Common Rationalizations

| Excuse                           | Reality                         |
| -------------------------------- | ------------------------------- |
| "User explained clearly"         | Assumptions hide in "clarity"   |
| "Time pressure"                  | Rushing causes rework           |
| "Professional solution"          | YAGNI violation                 |
| "Future-proof"                   | Premature optimization          |
| "Batch questions for efficiency" | Overwhelms user, misses context |
| "Requirements are obvious"       | Edge cases lurk in obviousness  |
| "Better to have it"              | Scope creep starts here         |

## Key Principles

- One question at a time - Don't overwhelm with multiple questions
- Multiple choice preferred - Easier to answer than open-ended when possible
- YAGNI ruthlessly - Remove unnecessary features from all designs
- Explore alternatives - Always propose 2-3 approaches before settling
- Incremental validation - Present design in sections, validate each
- Be flexible - Go back and clarify when something doesn't make sense

## Stage Completion Format

```
─────────────────────────────────────────────────
✅ Brainstorm complete → `docs/plans/YYYY-MM-DD-<topic>-design.md` (committed)

Next:
- Large/unclear design → `/arc-refining` → `/arc-planning` → `/arc-coordinating`
- Small/clear design → `/arc-using-worktrees` → `/arc-writing-tasks`
─────────────────────────────────────────────────
```

## Blocked Format

```
─────────────────────────────────────────────────
⚠️ Brainstorm blocked

Issue: Insufficient information to proceed
Location: [specific area]

To resolve:
1. Gather more context about [topic]
2. Clarify requirements with user

Then retry: `/arc-brainstorming`
─────────────────────────────────────────────────
```
