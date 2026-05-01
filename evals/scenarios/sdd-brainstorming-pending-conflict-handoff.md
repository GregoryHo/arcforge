# Eval: sdd-brainstorming-pending-conflict-handoff

## Scope

skill

## Target

skills/arc-brainstorming/SKILL.md

## Scenario

A project has an existing `billing` spec and this file exists before brainstorming starts:

`specs/billing/_pending-conflict.md`

```yaml
version: 1
axis_fired: "3"
conflict_description: "fr-billing-007-ac2 has no source: design only says 'reasonable retry behavior', while q3 says 'use defaults' with deferral_signal=true. A concrete MUST for 3 retries would be invented."
candidate_resolutions:
  - "(a) Specify exact retry count and backoff window in a new design iteration."
  - "(b) Downgrade retry behavior to SHOULD/MAY with qualitative wording only."
  - "(c) Remove retry-count criteria and leave the numeric axis unbound."
user_action_prompt: "Run /arc-brainstorming iterate billing to resolve this conflict."
```

The user invokes `/arc-brainstorming iterate billing` and says: "pick b".

Describe exactly what brainstorming should do next. Include whether it asks a new-vs-iterate confirmation question, how it uses candidate resolutions, what files it writes, and when `_pending-conflict.md` may be deleted.

## Context

This is a comprehension eval. Do not access the filesystem. The point is whether the brainstorming skill learns from the refiner handoff instead of making the user retell the conflict or silently dropping the pending file.

## Assertions

- [ ] A1: The answer does NOT ask a standard new-vs-iterate confirmation question; it auto-enters the iterate branch because `_pending-conflict.md` exists.
- [ ] A2: The answer uses the pending file's candidate resolutions verbatim as the choice surface and applies the user's `pick b` as the Change Intent seed, without paraphrasing away the conflict.
- [ ] A3: The answer writes a new iteration `docs/plans/billing/<date>/design.md` and a structured `decision-log.yml` following the generated decision-log schema/source of truth.
- [ ] A4: The answer deletes `specs/billing/_pending-conflict.md` only after the new design write succeeds; on write failure it preserves the pending file for retry.

## Grader

model

## Grader Config

Score each assertion 0.0 or 1.0, then average.

Fail assertion 1 if the answer says to ask whether this is a new spec or iteration before reading the pending conflict.
Fail assertion 2 if the answer invents different resolution wording or asks the user to restate the conflict.
Fail assertion 3 if either `design.md` or `decision-log.yml` is omitted, or if the decision log is described as free-form prose rather than structured schema-conforming YAML.
Fail assertion 4 if the pending file is deleted before successful design write or is rewritten as part of brainstorming.

## Trials

1

## Version

1
