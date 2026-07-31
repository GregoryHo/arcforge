---
name: writing-skills
description: Author an arcforge skill that actually changes agent behavior — invocation, description, form, evidence.
disable-model-invocation: true
---

# Writing Skills

A skill exists to squeeze predictability out of a stochastic system. Judge every
sentence by one question: does an agent behave more predictably with this text than
without it? Text that does not move behavior is cost, not content.

## Invocation

Each skill is exactly one kind, decided by `disable-model-invocation`.

| | model-invoked (default) | user-invoked (`disable-model-invocation: true`) |
|---|---|---|
| Trigger | the model decides, from the description alone | the user typing the slash command |
| Failure when wrong | loads when irrelevant | never loads when it would have helped |

Decide with one question: **should the agent reach for this on its own?** Reuse is not
the criterion — a skill used daily is still user-invoked if autonomous loading would
derail unrelated work. Authoring methodology and anything a person starts deliberately
are user-invoked; anything that must fire the moment its condition appears mid-task is
model-invoked. **Context load** is what a skill costs once loaded; **cognitive load** is
what it costs the agent to decide whether to load it — charged on every unrelated turn,
even when nothing loads.

## Writing the description

The description is the only part always in context. It is a trigger index, not a
summary.

| Rule | Why |
|---|---|
| Front-load the leading word | The first word carries retrieval weight; lead with identity, never a hedge |
| One trigger phrase per branch | Three real situations mean three named triggers; one abstract phrase loses all three |
| Synonyms are duplication | "review, critique, assess" is one trigger written three times — it dilutes, it does not widen |
| Never summarize the workflow | A description listing the steps becomes a shortcut the agent takes *instead of* reading the body |
| User-invoked strips the triggers | The user already decided; state plainly what the skill is |

## Information hierarchy

A skill body is one of two shapes. Pick before writing; mixing them yields prose nobody
can execute.

- **Steps** — an ordered procedure where every step carries a completion criterion the
  agent can check off. "Read the diff" is not a step; "read the full diff before writing
  any comment" is.
- **Reference** — a lookup surface: tables and lists, entries scannable without reading
  their neighbors.

Disclosed material goes in `references/`, **one level deep only**, reached by a
one-sentence pointer saying when to open it. A reference the body never points at is
unreachable; a pointer without a condition gets opened always or never.

## Self-containment

A skill directory is a closed unit.

- Reach another skill only by naming its slash invocation in prose — that is the entire
  cross-skill vocabulary. Never link into another skill's internals; wanting their files
  means you want their skill, so invoke it.
- Executable files stay inside the skill directory and load nothing outside it.
- Engine functionality is reached one way: run the `arcforge` CLI as a subprocess. The
  plugin's `bin/` is on PATH, so the bare command works — a skill never encodes where
  the engine lives on disk.

## Baseline first

**If you did not observe the failure, do not write the guidance.** Run the task without
the guidance, in the context the guidance would live in. No failure in the control means
nothing to fix: text against a failure that does not occur adds tokens and risk and buys
nothing. When the control does fail, capture the agent's exact words — those
rationalizations are the specification.

Shipping is a measurement question, not an authoring one. Where A/B eval tooling exists
(`arcforge eval ab`), it decides whether a version ships. Without it, a wording
micro-test plus one pressure scenario is the floor — never zero evidence. Both
protocols: `references/wording-tests.md`.

## Match the form to the failure

Classify the baseline failure first. The form that fixes one failure type measurably
backfires on another — a correctness choice, not a style one.

| Baseline failure | Right form | Wrong form |
|---|---|---|
| Knows the rule, skips it under pressure | Prohibition + rationalization table + red flags | Soft guidance ("prefer", "consider") |
| Right action, wrong shape (bloated, buried, restated) | Positive recipe: what the output IS, its parts in order | Prohibition list ("don't restate", "never narrate") |
| Omits an element it already produces | A required slot in the template it fills in | Prose reminder near the template |
| Behavior should vary by condition | Conditional on an observable predicate | Unconditional rule plus exemption clauses |

**Measured, and counterintuitive:** a prohibition aimed at a *shaping* failure produces
more of the unwanted output than no guidance at all. The agent negotiates with each
"don't"; a recipe leaves nothing to negotiate against.

Two rules hold whichever form you picked. **No nuance clauses** — "don't X unless it
matters" reopens the negotiation, so express a real exception as its own conditional on
an observable predicate. **An exemption cannot narrow scope** — "this limit does not
apply to code blocks" still suppresses code blocks, because the broad rule already
landed; restructure so the rule cannot reach the exempt part.

## When to split

Split by **invocation** when two halves fire in different situations — one skill cannot
have two descriptions. Split by **sequence** when a later stage is only reachable after
an earlier one completes and its detail is dead weight until then. Length alone is not a
reason to split; it is a reason to prune. Before committing to a shape, check it against
the designs eval has already ruled out: `references/design-anti-patterns.md`.

## Pruning

| Rule | Failure it prevents |
|---|---|
| Single source of truth | A fact stated twice diverges, and the agent follows whichever copy it read last |
| Hunt no-ops sentence by sentence | Ask what an agent does differently because of this sentence; no answer means delete |
| Delete whole sentences, not words | Trimming adjectives keeps the structure at higher density; removing the claim reclaims budget |

## Leading words

The first word of a step is the instruction. Agents skim, and a step that opens with
context ("Once the audit is complete, delete the branch") buries the verb behind a
clause. Start with the verb; put the condition after it. Headings and table cells too:
lead with what it is, not how you got there.

## Failure modes

Match the symptom, then apply the section named.

| Symptom | Name | Fix |
|---|---|---|
| Declares done before the criteria are met | Premature completion | Per-step completion criteria (Information hierarchy) |
| Two sections state one rule differently | Duplication | Single source of truth (Pruning) |
| Old guidance survives every edit, unread | Sediment | Delete whole sentences (Pruning) |
| A section accretes per incident | Sprawl | Split by invocation or sequence (When to split) |
| A rule the agent would follow anyway | No-op | Baseline first — the control never failed |
| The guidance made behavior worse | Negation | Wrong form for a shaping failure (Match the form) |

## Maintaining the router

Every skill has exactly one row in the Skill Map of `/using`, added in the change that
creates the skill and deleted in the change that removes it. The table is a bijection
with the shipped set and CI enforces both directions. A router that lies is worse than
no router: a missing row hides a skill nobody will find, and a stale row sends the agent
somewhere that no longer exists.
