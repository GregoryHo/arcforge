# Design Anti-Patterns

Five skill designs that eval has already ruled out. Each failed in measurement, not in
review, so re-litigating one costs a full eval cycle to arrive back here. Open this when
you are choosing a skill's shape, especially when a design feels clever.

## Mindset skills

A skill whose instruction is "keep this in mind for everything you do" does not land.
Agents do not internalize a stance across turns; the text has to be present at the moment
the decision happens. A mindset skill degrades into copy-pasted reminders scattered through
other skills, which then drift apart.

**Instead:** name the observable condition that should trigger the behavior and route on
it. A condition an agent can check beats a stance it is asked to hold.

## Self-contradicting invocation

A skill that says "do not invoke me directly" while being listed as invocable teaches two
opposite things at once, and the prohibition wins — the agent obeys the sentence inside the
skill over the table that pointed at it. The result is a skill nothing ever uses.

**Instead:** if it should not be reached that way, remove the entry point. If it should,
delete the sentence. Never ship both.

## Narrative examples

"In the session on 2026-03-14 we discovered that the parser..." — an example anchored to a
specific past incident is unusable for anything but that incident. Agents pattern-match on
surface detail, so a narrative example teaches the details rather than the pattern.

**Instead:** write the example at the level you want it applied. Keep the shape, drop the
date, the branch name, and the person.

## Multi-language dilution

Shipping the same example in four languages produces four mediocre examples and four
maintenance obligations. Each drifts on its own schedule, and the agent reads the one that
matches its current file, which is the one nobody checked.

**Instead:** one example in the language the skill is actually used in. If the skill spans
languages, teach the decision, not the syntax.

## Generic labels

`helper1`, `step3`, `processData`, `handleThing` — labels with no semantic content force
the reader to reconstruct meaning from surrounding context, and an agent reconstructing
meaning guesses. This applies to section headings and table columns as much as to code.

**Instead:** name the thing by what it decides or produces. A label that survives being
read out of context is the test.
