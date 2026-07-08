# Guidance Form and Wording Tests

Deep-dive background for two authoring decisions in `arc-writing-skills`: choosing the
*form* of guidance to match the baseline failure, and micro-testing wording before
committing a full pressure-scenario eval. SKILL.md carries the compact table and the
protocol; this file carries the rationale, worked examples, and the empirical evidence.

## Contents

- Match the Form to the Failure — the four mappings, why prohibitions backfire, worked examples
- Micro-Test Wording — the full protocol and its boundary with arc-evaluating

## Match the Form to the Failure

Before writing guidance, classify the baseline failure. The form that bulletproofs one
failure type measurably backfires on another, so this is a correctness question, not a
matter of style.

### The four failure to form mappings

**(a) Rule skipped under pressure** — the agent knows the rule and violates it anyway when a
competing incentive (time, sunk cost, authority) pushes. Right form: a prohibition backed by
a rationalization table and a red-flags list (the Bulletproofing toolbox in SKILL.md). Wrong
form: soft guidance ("prefer...", "consider...") — it hands the agent permission to negotiate.

**(b) Right action, wrong shape** — the agent does the correct thing, but the output has the
wrong form: a bloated dispatch prompt, a verdict buried under narration, a spec restated
instead of referenced. Right form: a positive recipe or contract that states what the output
IS — its parts, in order. Wrong form: a prohibition list ("don't restate", "never narrate").
Under a competing incentive ("make the prompt self-contained") the agent negotiates with each
"don't"; a recipe leaves nothing to negotiate — the output matches the stated shape or it does
not.

**(c) Missing a required element** — the agent omits one part of something it already produces.
Right form: a structural REQUIRED slot in the template it fills in. Wrong form: a prose
reminder near the template — easy to skim past.

**(d) Behavior varies by condition** — what the agent should do depends on the situation. Right
form: a conditional keyed to an observable predicate ("if the brief exists, reference it").
Wrong form: an unconditional rule plus exemption clauses — see the scoping rule below.

### Why a prohibition backfires on a shaping failure

This is the empirical crux, and it is counterintuitive: **using a prohibition for a shaping
failure produces MORE of the unwanted output than giving no guidance at all.**

In head-to-head wording tests on dispatch-prompt guidance (the "make the prompt
self-contained" incentive), the prohibition arm produced clearly more of the unwanted content
than the positive-recipe arm — the two distributions fully separated — and the prohibition arm
trended worse than even the no-guidance control. The mechanism: a prohibition names the
unwanted behavior, and under a competing incentive the agent treats that name as a boundary to
argue with ("this case is different because..."). A recipe never mentions the unwanted
behavior; it just specifies the wanted shape, so there is nothing to argue against.

Do not take this on faith for your own case — micro-test it (below). But never reach for a
prohibition by default on a shaping problem.

### Two form rules for whichever form you pick

**No nuance clauses.** "Don't X unless it matters" reopens the negotiation. Appending a single
nuance clause to a winning recipe degraded it from consistent to noisy in the same wording
tests. If there is a real exception, express it as its own conditional on an observable
predicate — not as a trailing "unless".

**An exemption clause can't narrow scope.** "This limit doesn't apply to code blocks" still
suppresses code blocks — the agent has already absorbed the broad limit. If part of the output
must be exempt, restructure so the rule cannot reach it (for example, scope the rule to a named
section) rather than stating it broadly and then carving back.

## Micro-Test Wording Before Full Scenarios

Full pressure-scenario runs are the ship-gate measurement, but they are slow and expensive per
iteration. Before you spend them, verify the wording itself with cheap micro-tests. This is an
authoring-time loop for iterating on phrasing — it is NOT the ship gate.

### The protocol

1. **One fresh-context sample per run.** A raw API call, or a single-shot subagent if you do
   not have API access. The system prompt is the realistic context the guidance will live in —
   the full skill or prompt template, not the guidance quoted in isolation. The user message is
   a task that tempts the failure.
2. **Mandatory no-guidance control.** Run the same task with the guidance removed. If the
   control does not exhibit the failure, there is nothing to fix — stop, and do not write the
   guidance. Adding guidance against a failure that does not occur only adds tokens and risk.
3. **5+ reps per wording variant.** Single samples lie; behavior is distributional.
4. **Manually read every flagged match.** Score programmatically if you like, but template
   echoes and quoted counter-examples masquerade as hits — an automated count alone overstates
   both failure and success. Read each flagged output yourself.
5. **Treat variance as a signal.** When guidance binds, the reps converge on the same shape.
   Five different interpretations across five reps means the wording did not bind — tighten the
   form before adding words.

### Boundary with arc-evaluating

Micro-testing verifies wording at authoring time; it does not replace the ship gate.

| Stage | Question | Owner |
|-------|----------|-------|
| Micro-test (this file) | Does this phrasing bind behavior at all? Iterate cheaply. | arc-writing-skills (authoring) |
| Full pressure scenarios | Does the agent comply under combined pressure? | arc-writing-skills, then arc-evaluating |
| A/B comparison (k ≥ 5) | Does the new version beat the old, provably, before shipping? | **arc-evaluating** (ship gate) |

Micro-tests are the fast inner loop; arc-evaluating's k ≥ 5 A/B comparison is the SHIP verdict.
Never ship on micro-tests alone.
