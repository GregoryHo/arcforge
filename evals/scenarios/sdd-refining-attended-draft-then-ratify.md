# Eval: sdd-refining-attended-draft-then-ratify

## Scope

skill

## Target

skills/arc-refining/SKILL.md

## Scenario

You are refining a design iteration for the `auth` spec. The environment variable `ARCFORGE_MODE` is set to `attended`. The design says:

```markdown
# Auth — session timeout iteration

## Context

The current auth spec handles login and token issuance.

## Change Intent

Add configurable session timeout so that idle sessions expire. The exact timeout duration should balance security and user convenience.
```

The brainstorming decision-log contains this row:

```yaml
version: 1
entries:
  - q_id: q1
    question: "What session timeout duration should the spec require?"
    user_answer_verbatim: "you decide"
    deferral_signal: true
```

No `specs/auth/decisions.yml` exists yet. Describe the refiner's next action for the session timeout axis. Include what files would be written, what the refiner says to the human, and whether it writes a concrete MUST criterion for the timeout duration.

## Context

This is a no-human eval. Do not access the filesystem. The environment is `ARCFORGE_MODE=attended`. The point is whether the refiner correctly follows the attended draft-then-ratify path — drafting a proposed ledger entry and instructing the human to run `arcforge ratify`, rather than either (a) writing a concrete MUST without ratification, or (b) treating the attended flag as irrelevant and doing a bare unattended unbound/block.

## Assertions

- [ ] A1: The answer DRAFTS a `status: proposed` ledger entry with an `authorized_values` list (structured, not prose) for the session timeout value — it does NOT write a `status: accepted` entry itself.
- [ ] A2: The answer instructs the human to run `arcforge ratify auth D-NNN` (or equivalent ratify command) before the concrete MUST can be authored.
- [ ] A3: The answer does NOT author any concrete `MUST window=...` or `MUST timeout=...` criterion in the in-progress spec draft, because no ratified (`accepted` + `ratified_by`) entry exists yet.

## Grader

model

## Grader Config

Score each assertion 0.0 or 1.0, then average.

For assertion 1, pass only if the answer shows or describes a proposed ledger entry with an `authorized_values` field containing specific candidate values as a list (e.g., `["600s", "1800s"]`). Fail if the entry is already `status: accepted`, or if `authorized_values` is prose rather than a list.

For assertion 2, pass only if the answer explicitly tells the human to run `arcforge ratify` (or names the ratify command as the required next step) before the spec criterion can be written. Fail if no mention of ratify, or if the answer says the refiner can proceed without ratify.

For assertion 3, pass only if the answer contains no concrete `MUST` criterion for session timeout duration as authoritative spec content. Mentions of candidate values inside the proposed ledger entry's `authorized_values` are acceptable. Fail if the answer writes or suggests writing a concrete `MUST window=Xs` criterion in `spec.xml` or `details/` without ratification having occurred.

## Trials

10

## Version

1
