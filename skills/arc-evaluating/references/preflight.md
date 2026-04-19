# Preflight Reference

The preflight check runs before any scenario executes. It protects the eval corpus from inflated baselines, stale scenarios, and ceiling effects — ensuring results remain meaningful over time.

## Ceiling Threshold: 0.8

The preflight ceiling threshold is **0.8** (80%). If a scenario's baseline pass rate meets or exceeds 0.8, the scenario is no longer discriminative: both baseline and treatment will score high, delta will stay near zero, and the eval produces no signal. Preflight blocks the run rather than allowing you to invest in worthless trials.

This threshold is deliberate. An 80% baseline does not mean the skill is unnecessary — it means the scenario has become too easy. Redesign the scenario to add a harder trap: a bait that a non-skill agent predictably mishandles. Narrowing the scope, adding adversarial context, or removing answer leakage typically restores discrimination power.

## Scenario Hash Mechanics

Each scenario file is hashed using **SHA-256 of the raw file contents** (bytes, not normalized text). The hash is computed on the full file — name, scope, assertions, grader config, everything. The hash is stored alongside benchmark results to identify which version of a scenario produced which results.

When you bump the `Version` field in a scenario file (changing even one byte), the hash changes. This invalidates old results for that scenario when using `--since` filtering — you get a clean slate for the updated scenario without manually deleting history.

**Why SHA-256 of the raw file?** It ties result provenance to exact file contents. If two runs show divergent results, you can check whether the scenario changed between them by comparing hashes. It also prevents silent result drift: a subtle scenario change that affects discrimination power is immediately visible as a hash mismatch, rather than invisibly polluting the benchmark history.

Hash collisions are astronomically unlikely. Do not attempt to construct adversarial inputs to force a hash match — the system is not a security boundary, but raw-byte hashing is robust for provenance purposes.

## PASS / BLOCK Semantics

Preflight produces one of two outcomes:

**PASS** — The scenario passes all preflight checks:
- Baseline pass rate is below the 0.8 ceiling threshold
- The scenario file is syntactically valid (required sections present)
- At least one assertion is defined
- Grader type is one of `code`, `model`, or `human`

The eval proceeds to the trial run phase.

**BLOCK** — One or more preflight checks fail. The run is halted before any trials execute. The output message identifies which check failed and what remediation action to take:

| Check | Block Reason | Remediation |
|-------|-------------|-------------|
| Baseline ≥ 0.8 | Ceiling effect — no discriminative signal | Redesign scenario: add a harder trap, remove answer leakage, narrow scope |
| Missing required sections | Scenario file is malformed | Add the missing section (Scope, Scenario, Assertions, Grader) |
| No assertions | Nothing to grade | Define at least one specific, verifiable assertion |
| Invalid grader type | Harness cannot select a grader | Change Grader to `code`, `model`, or `human` |

When preflight blocks, respect the block. Do not bypass it by deleting history, lowering the threshold manually, or running trials with `--skip-preflight`. Each of those actions defeats the purpose of the gate and corrupts the benchmark signal.

## Preflight is Exempt from INSUFFICIENT_DATA (fr-vr-001)

The INSUFFICIENT_DATA verdict applies when k < 5 for statistical verdicts (IMPROVED, REGRESSED). Preflight is not a statistical verdict — it is a gate check using the existing baseline pass rate from the benchmark history. If no baseline history exists yet (new scenario), preflight skips the ceiling check and passes automatically. This means:

- A brand-new scenario always passes preflight on the first run (no history to check).
- INSUFFICIENT_DATA cannot block preflight — they operate at different phases.
- Preflight runs before the trial loop; INSUFFICIENT_DATA is evaluated after the trial loop finishes.

Do not conflate these two mechanisms. Preflight asks "is the scenario still discriminative?" before trials run. INSUFFICIENT_DATA asks "do we have enough trials for a statistically valid verdict?" after trials run. They are complementary, not redundant.

## Operational Notes

- Run `arc eval preflight <name>` to check a scenario without executing trials.
- Preflight also runs automatically at the start of `arc eval run` and `arc eval ab`.
- If you are iterating on scenario design, run preflight between redesigns to verify the ceiling check clears.
- The `arc eval lint <name>` subcommand checks structural validity only (sections, assertions, grader type) without checking the ceiling — use it for early structural validation before you have baseline history.
