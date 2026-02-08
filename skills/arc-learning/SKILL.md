---
name: arc-learning
description: Use when user explicitly requests to extract reusable patterns from the current session, when session-evaluator suggests pattern extraction is available, or when user says /learn
---

# Learning Pattern Extraction

## Overview

Extract reusable patterns from the current session into learned skills that persist across sessions.

**Core principle:** Not everything learned is worth persisting. Filter aggressively for patterns that transfer across projects.

**Storage locations:**
- **Global patterns** → `~/.claude/skills/learned/global/` - Cross-project techniques
- **Project-specific patterns** → `~/.claude/skills/learned/{project}/` - Project-specific workarounds

## When to Use

- User explicitly requests pattern extraction (`/learn`)
- Session evaluator suggests patterns are available
- After solving a non-trivial, reusable problem
- User asks "what did we learn?" or "save this for next time"

## When NOT to Use

**Session too short:**
- Less than 10 tool calls
- No compactions occurred
- Quick Q&A session

**Only trivial fixes present:**
- Typo corrections
- Simple syntax errors
- Copy-paste mistakes

**One-time external issues:**
- API outages or rate limits
- Network connectivity problems
- Environment-specific configs

**Project-specific conventions:**
- Use CLAUDE.md instead
- File naming conventions
- Team coding standards

## Extractable vs Non-Extractable

### Extractable Patterns (DO save)

| Category | Example |
|----------|---------|
| Error resolution | "TypeScript generic constraint workaround" |
| Debugging techniques | "Binary search for flaky test isolation" |
| Library workarounds | "React 18 concurrent mode edge case" |
| Cross-project patterns | "Rate limit retry with exponential backoff" |
| Tool usage discoveries | "git rebase --onto for complex merges" |

### Non-Extractable (DO NOT save)

| Category | Why |
|----------|-----|
| Typos and syntax | Too trivial, no learning value |
| One-time API issues | External, won't recur the same way |
| Project-specific configs | Belongs in CLAUDE.md |
| Framework defaults | Already documented elsewhere |
| Simple lookups | "What's the flag for X?" - use docs |

## Process

### 1. Scan Session

Review the session for problem-solution pairs:
- What errors occurred?
- What workarounds were discovered?
- What techniques were applied?

### 2. Filter Against Noise Categories

For each potential pattern, ask:
- Would this help in a **different** project?
- Is this more than a simple lookup?
- Did solving this require multiple attempts?

**If NO to all three → skip it.**

### 3. Draft Learned Skill

Use this format:

```markdown
---
name: <descriptive-name-with-hyphens>
extracted: <YYYY-MM-DD>
confidence: 0.50
scope: global|project
project: <project-name>
context: <brief context of when this was learned>
last_confirmed: <YYYY-MM-DD>
confirmations: 0
contradictions: 0
---

# <Descriptive Title>

## Problem
<What went wrong or what was needed>

## Solution
<The technique or workaround>

## Example
<Code or commands showing the pattern>

## When to Use
<Triggering conditions>
```

### 4. Present to User for Confirmation

**NEVER save without explicit user approval.**

Present the draft and ask which location to use:
> "Here's the pattern I extracted. Where should I save it?"
> - **Global** (`~/.claude/skills/learned/global/<name>.md`) - Use for cross-project techniques
> - **Project** (`~/.claude/skills/learned/{project}/<name>.md`) - Use for project-specific workarounds

**Decision guide:**
| Pattern applies to... | Save to |
|-----------------------|---------|
| Any project | Global |
| This project's stack/conventions | Project |
| Specific library combo | Global (name includes combo) |

### 5. Save Only After Approval

If approved:
1. Ensure target directory exists (`global/` or `{project}/`)
2. Write the markdown file
3. Confirm save location with full path

## Confidence Metadata

Every learned skill carries a confidence score (0.0–1.0) in its YAML frontmatter. This score determines loading behavior and lifecycle state.

| Field | Description |
|-------|-------------|
| `confidence` | Current score (0.0–1.0), starts at 0.50 |
| `last_confirmed` | Date of last confirmation/contradiction |
| `confirmations` | Total confirmation count |
| `contradictions` | Total contradiction count |

**Adjustments:**
- `confirm <name>` → +0.05 (capped at 0.90)
- `contradict <name>` → -0.10 (floored at 0.10)
- Weekly decay: -0.02 per week since `last_confirmed` (applied at session start)

**CLI commands:**
```
node skills/arc-learning/scripts/learn.js save --name X --content "..." [--confidence 0.5] [--scope global|project]
node skills/arc-learning/scripts/learn.js list [--min-confidence 0.3]
node skills/arc-learning/scripts/learn.js confirm <name> [--project X]
node skills/arc-learning/scripts/learn.js contradict <name> [--project X]
node skills/arc-learning/scripts/learn.js check-duplicate <name>
```

## Lifecycle States

Learned skills progress through four states based on confidence:

```
draft (0.50) → active (≥0.70) → decaying (0.30–0.69) → archived (<0.15)
```

| State | Confidence | Behavior |
|-------|-----------|----------|
| **Draft** | 0.50 (initial) | Listed but not auto-loaded |
| **Active** | ≥ 0.70 | Auto-loaded at session start |
| **Decaying** | 0.30–0.69 | Listed, needs confirmation to stay active |
| **Archived** | < 0.15 | Moved to `archived/` directory |

**Promotion path:** A draft skill becomes active after 4+ confirmations without contradictions (0.50 + 4×0.05 = 0.70).

**Archive path:** A skill at 0.50 with 4 contradictions drops below archive threshold (0.50 - 4×0.10 = 0.10 < 0.15).

Archived skills are moved to `~/.claude/skills/learned/{project}/archived/` (or `global/archived/`). They can be manually restored by moving them back and adjusting confidence.

## Transferability Test

Before saving a pattern, apply this test — if it fails, the pattern is likely noise:

1. **Different project test:** Would this help in a project with a different tech stack?
2. **Different person test:** Would another developer find this useful?
3. **Recurrence test:** Has this pattern appeared (or would it appear) more than once?

**Scoring:**
- Passes all 3 → confidence 0.65 (strong candidate)
- Passes 2 of 3 → confidence 0.50 (default, needs confirmation)
- Passes 1 or 0 → do not save (too project-specific; use CLAUDE.md instead)

## Pattern Quality Filter

Patterns must be **specific**, **actionable**, and **evidence-backed**.

| Quality | Bad Example | Good Example |
|---------|-------------|--------------|
| Specific | "Debug TypeScript" | "Fix TS2322 with Partial<T> generic constraints" |
| Actionable | "Tests are important" | "Run jest --detectOpenHandles for async leak detection" |
| Evidence-backed | "I think X works" | "After 3 sessions, confirmed X resolves flaky hydration" |

**Reject patterns that are:**
- Opinions without evidence
- Generic best practices (already in docs)
- Applicable to only one file or function
- Duplicates of existing patterns (use `check-duplicate` first)

## Bubble-up to Global

When a project-scoped pattern appears in 2+ projects, it's automatically promoted to global scope:

1. The learn CLI appends entries to `~/.claude/skills/learned/global-index.jsonl`
2. On `confirm`, cross-project matches are checked
3. If found in 2+ projects → copied to `~/.claude/skills/learned/global/`

This happens automatically. The user is notified at session start when new global promotions occur.

## Common Mistakes

### Extracting Noise
**Wrong:** Saving "fixed typo in import statement"
**Right:** This is noise, skip it

### Not Asking for Confirmation
**Wrong:** Automatically saving patterns
**Right:** Always present draft and wait for approval

### Project-Specific Patterns
**Wrong:** Saving "use tabs in this project"
**Right:** Put in CLAUDE.md, not learned skills

### Overly Broad Patterns
**Wrong:** "How to debug TypeScript"
**Right:** "Fix TS2322 with generic constraints when using Partial<T>"

### Missing Trigger Conditions
**Wrong:** Pattern without "When to Use"
**Right:** Always include triggering conditions

## Red Flags - DO NOT Extract

- Pattern was "just look up the docs"
- Only needed once in this project
- Already well-documented in official sources
- Specific to this codebase's architecture
- User just wanted a quick answer, not a pattern

## Quick Reference

| Session has... | Action |
|----------------|--------|
| Typo fixes only | "No extractable patterns in this session" |
| API timeouts | "External issues aren't worth extracting" |
| Complex debugging | Candidate for extraction |
| New technique used | Candidate for extraction |
| Project-specific decision | "This belongs in CLAUDE.md" |

## Output Location

```
~/.claude/skills/learned/
├── global/                              # Cross-project patterns
│   ├── fix-typescript-generics.md
│   ├── react-suspense-error-boundary.md
│   └── git-rebase-onto-technique.md
└── {project}/                           # Project-specific workarounds
    └── handle-prisma-migration.md
```

**The user controls these directories.** Respect their organization choices.

**Loading behavior:** Skills from both `global/` and `{project}/` are announced at session start.

## Example Learned Skill

```markdown
---
name: fix-typescript-generic-constraint
extracted: 2025-01-24
confidence: 0.65
scope: global
project: api-client
context: Working on API client with generic response types
last_confirmed: 2025-01-24
confirmations: 0
contradictions: 0
---

# Fix TypeScript Generic Constraint Error

## Problem
TypeScript reports "Type 'X' is not assignable to type 'Y'" when using generic
functions with constrained types, even when the types seem compatible.

## Solution
Use explicit type assertion at the call site, or adjust the constraint to use
`extends` with a more permissive base type.

## Example
\`\`\`typescript
// Before (error TS2322)
function fetch<T extends Response>(url: string): Promise<T> {
  return fetch(url).then(r => r.json());
}

// After (fixed with assertion)
function fetchData<T>(url: string): Promise<T> {
  return fetch(url).then(r => r.json() as T);
}
\`\`\`

## When to Use
- Generic functions with complex constraints
- API response typing where actual shape varies
- When compiler can't infer the specific subtype
```
