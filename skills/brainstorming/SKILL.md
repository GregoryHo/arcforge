---
name: brainstorming
description: Structured exploration before a design is settled. Use when a request is underspecified, when several designs are plausible and you are about to pick one without saying so, or when the user is thinking out loud rather than asking for code.
argument-hint: "[topic or feature to explore]"
---

# Brainstorming

## The law

```
NO DESIGN UNTIL THE ALTERNATIVES HAVE BEEN NAMED
```

The first workable idea is a candidate, not a decision. Picking it silently is
the failure this skill exists to stop: the user never sees what was traded away,
and the cost surfaces later as rework nobody budgeted.

"The requirements are clear" is not an exemption. Clarity is what an assumption
feels like from the inside.

## When this does not apply

- The request is already precise and the constraints are written down.
- It is a single function, a typo, or a fix whose shape is not in question.
- The user said to just do it, or has already chosen an approach and wants it built.
- You are answering a question, not building anything.

In those cases, skip straight to the work.

## 1. Understand before proposing

Read first. The repository, the recent commits, the docs, any decision records —
a question the repo already answers wastes the user's turn and signals you did
not look.

Then ask about what you genuinely cannot determine: purpose, constraints, what
"done" looks like, what must not break. **One question per message**, multiple
choice when the options are enumerable. A batch of six questions gets three
answered and three guessed.

*Done when* you can state, in the user's own terms, the problem, the hard
constraints, and how you would recognise success.

## 2. Name at least two real approaches

Every option must be one you could actually defend. A straw man exists to make
the other option look good and teaches the user nothing.

For each: what it costs, what it forecloses, and the situation where it is the
wrong choice. Then lead with a recommendation and say why — presenting three
options with no opinion pushes the decision back onto the person who came to you
because they did not have one.

*Done when* the options differ on a dimension the user actually cares about, not
just on naming or file layout.

Stay in prose and keep it conversational; do not open editors yet. Writing code
during exploration converts an option into a sunk cost.

## 3. Cut it down (YAGNI)

Build only what was asked for. Then look again and cut more.

| What you are about to add | Why it does not survive |
|---|---|
| A config knob nobody asked for | Two code paths, one of them untested forever |
| A plugin seam for one caller | An abstraction with a sample size of one |
| "Future-proofing" for a scale not reached | A guess about a future that will arrive differently |
| A layer that wraps a thing already wrapped | Indirection billed as architecture |
| Error handling for a case that cannot occur | Dead code that hides live bugs |

The measured scale of the problem in front of you beats the imagined one. If the
data is forty rows today, say so out loud before proposing an index.

## 4. Converge

A design is settled when four things are on the table:

1. **The problem** — what is broken or missing, and why it matters now.
2. **The approach** — the chosen option and the key decisions inside it.
3. **What it must do** — requirements in prose, specific enough to disagree with.
4. **Scope** — what is included, and explicitly what is not.

Present it in short sections and check each one as you go, rather than
delivering a wall of text and asking "look OK?". The user cannot review what
they have not read.

Where it lives is the user's call. If someone else will implement it, or it has
to survive this conversation, write it to a file they name. Otherwise the
conversation is enough — do not invent a directory convention to file it in.

## Handing off

| After convergence | Next |
|---|---|
| Several steps, or someone else runs it | `/executing` — turn the design into a task list |
| Small and settled | Build it; implementation code goes through `/tdd` |
| Still unsettled after exploring | Say so. Name the open question. Do not write a design that papers over it. |

## Rationalizations

| What you are about to say | What is actually true |
|---|---|
| "The user explained it clearly" | Assumptions hide inside clarity — that is what makes it feel clear. |
| "There's time pressure" | Exploration costs minutes; rework costs days. |
| "This is the professional solution" | It is the elaborate one. Name the simple one and compare. |
| "Let me batch these questions" | Batched questions get skimmed and half-answered. |
| "I'll build a quick prototype to decide" | Then the prototype decides, and it argues with sunk cost on its side. |
| "There's really only one way to do this" | Then naming the second one takes a sentence and confirms it. |
| "Better to have it and not need it" | That sentence is where scope creep starts. |
| "They asked for X, so the design is X" | They asked for an outcome. X was their first guess at how. |

## Red flags

Any of these means stop and go back to step 1 or 2:

- You have started editing implementation files and no option was ever compared.
- Your proposal has one approach in it.
- You inferred a constraint the user never stated and built on it.
- You are describing what you will build without having said what it costs.
- The scope has grown since the user last saw it.
