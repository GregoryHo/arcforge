# Eval: eval-arc-writing-skills-match-form-to-failure

> **Preflight (2026-07-09): no verdict returned** (model-graded path) — treat as UNVALIDATED / preflight-pending, not a passing gate.

## Scope

skill

## Target

skills/arc-writing-skills/SKILL.md

## Scenario

You are maintaining the arcforge skill `arc-dispatching-parallel`. An eval turned up a
consistent failure in the subagent dispatch prompts the skill teaches agents to emit.

The failure is NOT about *which* work gets dispatched — that part is always right. The
dispatch prompts route the correct task to the correct subagent every time. The problem is
that the prompt itself is bloated. A typical emitted dispatch prompt runs 400+ words
and stuffs in things the subagent does not need spelled out, because it already runs inside
the epic's own worktree with the spec and the task file on disk. A representative bad output:

```
You are implementing task T-14 in the payments epic. Here is the full spec for context so
you have everything you need:

<pastes the entire 180-line spec.xml inline>

The repository is laid out as follows:
  src/
    payments/
      charge.js
      webhook.js
    lib/
  test/
  ...

Your acceptance criteria, restated for convenience: the charge path MUST validate the
amount is positive, MUST reject currencies not in the allowlist, MUST emit a
payment.attempted event before calling the gateway, and MUST ... (re-lists all seven
criteria already written in the task file). To get oriented, first read the spec, then
read charge.js, then look at how webhook.js is structured, then check the existing tests,
then ... (narrates orientation steps the subagent would take anyway).
```

Authors write these prompts this fat on purpose: they want each dispatch prompt to be fully
self-contained, so the subagent never has to go look anything up. The result is prompts that
are three times longer than they need to be and drown the actual instruction in restated
material the subagent already has access to.

Write the guidance you would add to `arc-dispatching-parallel`'s SKILL.md to fix this class
of failure. Output the guidance text itself — the words that would go in the skill — not a
description of what you might write.

## Context

This is an authoring task with no filesystem access — produce the guidance text directly
from the failure described above; do not go read other skills or inspect a repo. You are
deciding the FORM of the guidance that will most reliably stop this failure in future
dispatch prompts, and writing that guidance. The failure is a documented, repeatable one;
your job is to write the fix, not to re-diagnose whether the failure is real.

## Assertions

- [ ] A1: The authored guidance contains a positive recipe or output contract — it names the parts a good dispatch prompt IS made of (e.g., which task, a pointer/link to the spec and acceptance criteria rather than their inline text, the expected return/output), rather than only describing what to leave out.
- [ ] A2: The guidance does NOT rely on a prohibition list as its primary fixing mechanism — it is not dominated or led by "don't paste the spec / never restate the criteria / don't narrate orientation / avoid bloat / keep it short / remove X" instructions.
- [ ] A3: The author matched the form to a SHAPING failure: the dominant, load-bearing form of the fix is a positive recipe/contract (what the prompt IS), not a prohibition/removal list (what to cut).

## Grader

model

## Grader Config

Score each assertion 0.0 or 1.0, then average.

Ground truth (from `arc-writing-skills`, "Match the Form to the Failure"): a "right action,
wrong shape" failure — the dispatch prompt dispatches the correct work but comes out bloated —
must be fixed with a POSITIVE recipe/contract that states what the output IS (its parts, in
order). A prohibition list ("don't restate", "never narrate") is the WRONG form here; the
documented empirical result is that a prohibition aimed at a shaping failure produces MORE of
the unwanted output than no guidance at all, because the agent negotiates with each "don't".

For assertion A1, pass if the guidance includes a positive specification of a good dispatch
prompt — an enumerated set of parts, a fill-in template, or a contract stating what the prompt
must contain and return. Fail if the guidance offers no positive shape at all and consists only
of things to remove or avoid.

For assertion A2, pass only if prohibitions/negations are NOT the primary or leading mechanism.
Fail if the guidance is dominated by, or led by, a list of "don't/never/avoid/remove/cut/keep
it shorter" instructions — even if a positive fragment also appears. A single contrastive
clause inside an otherwise-positive recipe ("link the spec instead of pasting it") is NOT a
prohibition list and does not by itself fail A2.

For assertion A3, classify the dominant, load-bearing form of the fix. Pass ONLY if a positive
recipe/contract carries the fix — enumerated parts, or a fill-in template, stating what the
dispatch prompt IS (ideally in order). Fail if removals/negations are the primary or leading
mechanism, even when a positive element also appears. Treat a mirror-image "don't include each
of these bloated items" list as a prohibition list (fail), not a recipe. The lone contrastive
clause exception from A2 applies here too: one "instead of X, do Y" inside a recipe still counts
as recipe-dominant.

## Trials

5

## Version

1
