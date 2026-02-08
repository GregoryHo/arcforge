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
context: <brief context of when this was learned>
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
context: Working on API client with generic response types
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
