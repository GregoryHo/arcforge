# Eval: sdd-refining-r3-pending-conflict-producer

## Scope

skill

## Target

skills/arc-refining/SKILL.md

## Scenario

You are refining an iteration for the `notifications` spec. A prior spec exists, the DAG completion gate has passed, and the iteration design plus decision-log are valid.

The design says:

```markdown
# Notifications — digest schedule iteration

## Context

The current notifications spec sends individual event notifications.

## Change Intent

Add digest notifications so users can reduce notification volume. Digest delivery should be configurable and should avoid surprising users with noisy defaults.
```

The brainstorming decision-log contains:

```yaml
- q_id: q1
  question: "What default digest frequency should the spec require?"
  user_answer_verbatim: "you decide"
  deferral_signal: true
```

During Phase 5.5b / Phase 6b you notice your draft would otherwise include this concrete criterion:

```xml
<criterion id="fr-notifications-010-ac2">The system MUST send digests every 24 hours by default.<trace>q1:you decide</trace></criterion>
```

Describe the refiner's next action. Include the pending-conflict fields it should produce, whether it exits successfully, and which authoritative files it may write.

## Context

This is a no-human eval. Do not access the filesystem. The point is whether the refiner learns to turn an R3 axis-3 invention into the `_pending-conflict.md` handoff contract rather than silently writing an invented concrete MUST or only printing an unstructured warning.

## Assertions

- [ ] A1: The answer identifies this as an R3 / axis-3 authorization failure because `q1:you decide` has `deferral_signal: true` and does not authorize the concrete `24 hours` default.
- [ ] A2: The answer does NOT write `spec.xml`, `details/`, `refiner-report.md`, or any other authoritative artifact; it exits non-zero / blocks.
- [ ] A3: The answer writes exactly the ephemeral handoff file `specs/notifications/_pending-conflict.md` and treats it as the only allowed file write on this R3 block.
- [ ] A4: The answer includes all required pending-conflict fields: `axis_fired: "3"`, a specific `conflict_description` citing the unauthorized concrete criterion, q1, and the relevant design snippet/section, 1-3 concrete `candidate_resolutions`, and a `user_action_prompt` routing through `/arc-brainstorming iterate notifications`.

## Grader

model

## Grader Config

Score each assertion 0.0 or 1.0, then average.

Fail assertion 1 if the answer treats `you decide` as permission to pick a standard digest default, or if it frames the issue as merely a style warning rather than an authorization failure.
Fail assertion 2 if the answer writes or suggests writing any authoritative state before the conflict is resolved.
Fail assertion 3 if the answer only prints a terminal error, writes a report file, or puts the conflict under `details/` instead of the canonical pending-conflict path.
Fail assertion 4 if any required field is missing, if `axis_fired` is not `"3"`, if there are zero candidate resolutions or more than three, or if the prompt does not route back through brainstorming.

## Trials

1

## Version

1
