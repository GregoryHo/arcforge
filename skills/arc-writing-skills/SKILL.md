---
name: arc-writing-skills
description: Create, edit, or verify ArcForge's own skills and skill tests before deployment.
category: meta
status: promoted
disable-model-invocation: true
---

# Writing ArcForge Skills

## Overview

This is a **project-level meta skill** for maintaining ArcForge's own composable skill system — not a general product-facing core skill for ordinary product work.

**Writing skills IS Test-Driven Development applied to process documentation.** You write test cases (pressure scenarios with subagents), watch them fail (baseline behavior), write the skill, watch tests pass (agents comply), and refactor (close loopholes). The full TDD-concept mapping is in `references/skill-types-and-structure.md`.

**Core principle:** If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing.

**REQUIRED BACKGROUND:** You MUST understand arc-tdd before using this skill. That skill defines the fundamental RED-GREEN-REFACTOR cycle; this skill adapts TDD to documentation.

## Scope

Use this skill for ArcForge maintainer work: changing `skills/`, skill tests, pressure fixtures, evals, and skill distribution behavior. Do not use it as a default workflow for non-ArcForge product implementation — route to the smallest useful product-facing skill instead.

## When to Create an ArcForge Skill

**Create when:** the technique wasn't intuitively obvious, ArcForge users or maintainers would reference it again, and the pattern applies broadly across supported workflows. **Don't create for:** one-off solutions, standard practices documented elsewhere, product-specific conventions (put those in the project's instructions), or mechanical constraints enforceable with regex/validation (automate those instead).

## Skill Types

Two orthogonal axes — **composition** (how it's triggered) and **content** (what it teaches). Pick deliberately on each.

| Composition | Trigger | Composition mechanism | Example |
|------|---------|-------------|---------|
| **Workflow** | Handoff from previous step | "After This Skill" section defines next step | `arc-brainstorming` → `arc-writing-tasks` |
| **Discipline** | Conditional — fires during ANY workflow when its condition is met | Listed in `arc-using` routing table | `arc-tdd`, `arc-verifying` |
| **Meta** | Independent — user, maintainer, or project task invokes directly | No routing needed | `arc-writing-skills`, `arc-using` |

When creating a new skill:

1. **Workflow skills** MUST have an "After This Skill" section with explicit next-step guidance — workflow without handoff dead-ends in autonomous mode.
2. **Discipline skills** MUST be added to `arc-using`'s "Discipline Skills — Conditional Triggers" table, with a concrete routing condition (no global "always invoke" language; preserve harness/eval isolation).
3. **Meta skills** need no routing — invoked directly when needed.

By content: **Technique** (concrete method), **Pattern** (way of thinking), **Reference** (API/syntax docs). Content-axis detail and eval-discovered design anti-patterns are in `references/skill-types-and-structure.md`.

## Path Resolution (Plugin Distribution Awareness)

arcforge ships as a plugin. At runtime the LLM works in a user's project — cwd is the user's project, NOT the plugin install. Any reference to plugin internal files from skill prose must be absolute, derived from `${CLAUDE_PLUGIN_ROOT}` — never bare cwd-relative.

`${CLAUDE_PLUGIN_ROOT}` is set by the host harness and points at the plugin install root.

### Which prefix to use

| Reference target | Prefix | Example |
|---|---|---|
| Plugin CLI | `${CLAUDE_PLUGIN_ROOT}/` | `arcforge` |
| Skill's own files (`skills/<name>/scripts/`, `references/`) | `${SKILL_ROOT}/` | `${SKILL_ROOT}/scripts/planner.js` |
| User's project files (not plugin) | (none — bare is correct) | `specs/<spec-id>/spec.xml` |

`${SKILL_ROOT}` is set via the skill loader header. Use this idiom at the top of any Bash block that needs it:

```bash
: "${SKILL_ROOT:=${CLAUDE_PLUGIN_ROOT}/skills/<your-skill-name>}"
```

### Anti-patterns

```bash
# WRONG — cwd-relative require breaks when cwd ≠ plugin root
node -e "require('./scripts/cli.js')"

# WRONG — bare prose path; LLM follows literally and fails in user's cwd
"Run cli.js loop to start the loop."

# CORRECT — Bash invocation with prefix
arcforge worktree list --json
```

## SKILL.md Structure

**Required frontmatter:** `name` (letters, numbers, and hyphens only) and `description` (third-person, describes ONLY when to use — start with "Use when...", include specific symptoms/contexts, and NEVER summarize the skill's process or workflow). Combined `name` + `description` must stay under 1024 characters.

Optional frontmatter fields (`argument-hint`, `allowed-tools`, `disable-model-invocation`, `user-invocable`) and the section template live in `references/skill-types-and-structure.md`. Avoid `model`/`context`/`agent`/`hooks` unless you have a concrete reason.

## Claude Search Optimization

Future Claude must FIND your skill. **Description = when to use, NOT what the skill does** — a description that summarizes workflow creates a shortcut Claude takes instead of reading the skill body. Use keywords Claude would search for (errors, symptoms, tools, commands). Good/bad description examples, the naming convention, the 3-level token-loading model, and flowchart usage are in `references/cso-and-naming.md`.

### Cross-Referencing Other Skills

Use explicit requirement markers:

```markdown
**REQUIRED SUB-SKILL:** Use arc-debugging when encountering failures
**REQUIRED BACKGROUND:** You MUST understand arc-using first
```

**Never use at-sign file syntax** — it force-loads files immediately, consuming context before needed.

## RED-GREEN-REFACTOR for Skills

Observe the failure first, then write the fix. Writing the skill before testing means writing against imagined failures — the skill ends up heavy where it doesn't matter and thin where it does.

- **RED — Baseline:** Run pressure scenarios with a subagent WITHOUT the skill. Document verbatim: what choices they made, what rationalizations they used (the exact words), which pressures triggered violations. Those observed rationalizations are your spec — the skill exists to counter them.
- **GREEN — Minimal skill:** Write the skill addressing those specific rationalizations — no extra content for hypothetical cases. Re-run the same scenarios WITH the skill; agents should now comply.
- **REFACTOR — Close loopholes:** Agent found a new rationalization? Add an explicit counter. Re-test until bulletproof.

Whether the skill actually changed behavior — and, for an edit, whether a re-run is even needed — is a measurement question owned by **arc-evaluating** (which exempts changes with no behavioral footprint, like a typo or metadata tweak). This skill produces a good skill; arc-evaluating decides whether it ships. When you're creating several skills, finish and verify each before starting the next — deferring all testing to the end is how untested skills slip through.

### Micro-Test Wording Before Full Scenarios

For behavior-shaping guidance, iterate on the *wording* with cheap micro-tests before spending a full pressure-scenario run — an authoring-time loop, not the ship gate. Each sample runs in the realistic context the guidance lives in (the full skill/template) against a task that tempts the failure. Core rules: a **mandatory no-guidance control** (if it doesn't exhibit the failure, don't write the guidance); **5+ reps per variant** (single samples lie); **read every flagged match by hand** (template echo masquerades as a hit); and treat rep-to-rep variance as a sign the wording didn't bind — tighten the form before adding words.

See `guidance-form-and-wording-tests.md` for the full protocol and `testing-skills-with-subagents.md` for the pressure-scenario method. Structured grading, rationalization extraction, blind comparison, and the A/B ship gate (`arc eval ab`, k ≥ 5) belong to **arc-evaluating**.

## Common Rationalizations for Skipping the Baseline

These come up when deciding whether to run the baseline. Each has a measured answer:

| Rationalization | Why the baseline still helps |
|-----------------|------------------------------|
| "The skill is obviously clear" | Clear to the author isn't the same as clear to another agent; the baseline shows the gap. |
| "It's just a reference" | Reference skills can have retrieval gaps a baseline surfaces. |
| "I'll test if problems emerge" | By then the cost is a confused agent mid-task, not a quick check up front. |
| "I'm confident it's good" | The baseline is cheap — it either confirms the confidence or corrects it. |
| "No time to test" | A skill that doesn't land costs more downstream than the baseline does now. |

## Match the Form to the Failure

Before writing guidance, classify the baseline failure. The form that bulletproofs one failure
type backfires on another — this is a correctness choice, not a style one.

| Baseline failure | Right form | Wrong form |
|---|---|---|
| Knows the rule, skips it under pressure | Prohibition + rationalization table + red flags (Bulletproofing, below) | Soft guidance ("prefer...", "consider...") |
| Right action, wrong shape (bloated prompt, buried verdict, restated spec) | Positive recipe/contract: state what the output IS — its parts, in order | Prohibition list ("don't restate", "never narrate") |
| Omits a required element it already produces | Structural REQUIRED slot in the template it fills in | Prose reminder near the template |
| Behavior should vary by condition | Conditional keyed to an observable predicate ("if the brief exists, reference it") | Unconditional rule + exemption clauses |

**Empirical warning:** a prohibition aimed at a *shaping* failure produces MORE of the unwanted
output than giving no guidance at all — the agent negotiates with each "don't". A recipe leaves
nothing to negotiate.

**Two form rules:**
- **No nuance clauses.** "Don't X unless it matters" reopens the negotiation. Express a real
  exception as its own conditional on an observable predicate.
- **An exemption clause can't narrow scope.** "This limit doesn't apply to code blocks" still
  suppresses code blocks. If part of the output must be exempt, restructure so the rule can't
  reach it.

See `guidance-form-and-wording-tests.md` for worked examples and the wording-test evidence.

## Bulletproofing a Discipline Skill Against Rationalization

This toolbox is for exactly one row of the table above: the agent *knows* the rule and skips it
under pressure. For wrong-shaped output or a missing element, a prohibition backfires — use the
matching form instead. The examples below are intentionally firm because that firmness belongs
in the discipline skill you're authoring (this is how `arc-tdd`, say, talks); it's the subject
being taught, not the tone of this guide. Technique, pattern, and reference skills don't need it.

### Close Every Loophole Explicitly

Don't just state the rule — forbid specific workarounds:

```markdown
# BAD
Write code before test? Delete it.

# GOOD
Write code before test? Delete it. Start over.

**No exceptions:**
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Delete means delete
```

### Address "Spirit vs Letter" Arguments

```markdown
**Violating the letter of the rules is violating the spirit of the rules.**
```

This cuts off entire class of "I'm following the spirit" rationalizations.

### Build Rationalization Table

Every excuse agents make goes in the table with counter.

### Create Red Flags List

```markdown
## Red Flags - STOP and Start Over

- Code before test
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "This is different because..."

**All of these mean: Delete. Start over.**
```

## Skill Creation Checklist

Track these as you go (a task list helps when you're working through a multi-skill batch).

**RED Phase - Write Failing Test:**
- [ ] Create pressure scenarios (3+ combined pressures for discipline skills)
- [ ] Run scenarios WITHOUT skill - document baseline behavior verbatim
- [ ] Identify patterns in rationalizations/failures

**GREEN Phase - Write Minimal Skill:**
- [ ] Name uses only letters, numbers, hyphens
- [ ] YAML frontmatter has required `name` + `description` (combined under 1024 chars); any optional fields used per the Frontmatter section
- [ ] Description starts with "Use when..." (triggers only, no workflow)
- [ ] Description written in third person
- [ ] Keywords throughout for search (errors, symptoms, tools)
- [ ] Address specific baseline failures identified in RED
- [ ] Guidance form matches the failure type (see Match the Form to the Failure)
- [ ] Behavior-shaping wording micro-tested against a no-guidance control before the full eval (see Micro-Test Wording) — N/A for pure reference skills
- [ ] Run scenarios WITH skill - verify agents now comply

**REFACTOR Phase - Close Loopholes:**
- [ ] Identify NEW rationalizations from testing
- [ ] Add explicit counters (if discipline skill)
- [ ] Build rationalization table from all test iterations
- [ ] Create red flags list
- [ ] Re-test until bulletproof

**Deployment:**
- [ ] Run pytest validation
- [ ] Commit skill to git

## Supporting Files

- `testing-skills-with-subagents.md` — complete pressure-scenario testing methodology
- `guidance-form-and-wording-tests.md` — failure-to-form taxonomy and the wording micro-test protocol
- `anthropic-best-practices.md` — official skill authoring guidance
- `persuasion-principles.md` — persuasion techniques for skill design
- `graphviz-conventions.dot` — graphviz flowchart style guide; `render-graphs.js` renders SKILL.md flowcharts to SVG
- `examples/CLAUDE_MD_TESTING.md` — testing documentation variants with pressure scenarios
- `references/skill-types-and-structure.md`, `references/cso-and-naming.md` — offloaded type/structure/CSO/naming detail
- Grading, blind comparison, and behavior-change measurement live in **arc-evaluating** (`skills/arc-evaluating/`), not here.
