# Eval: aa-internal-001 — Internal Consistency (AC Contradiction)

Behavioral eval scenario for the `internal-consistency` axis agent
(`arc-auditing-spec-internal-consistency`). Exercises fr-aa-001 through
fr-aa-004 for axis 2. Derived from patterns documented in the audit-agents
RED baseline (`docs/plans/arc-auditing-spec/2026-04-24/audit-agents-RED.md`).

---

## Synthetic Spec Family

This eval uses synthetic fixture content for a single `details/*.xml` file.

### `details/my-feature.xml` (synthetic, with injected contradiction)

```xml
<feature id="fr-mf-001">
  <description>
    The system processes all records in a single sequential pass.
    Each record is handled one at a time, in order.
  </description>
  <acceptance_criteria>
    <ac id="fr-mf-001-ac1">
      All records MUST be processed concurrently using parallel workers.
      Sequential processing is NOT acceptable for performance reasons.
    </ac>
    <ac id="fr-mf-001-ac2">
      Processing completes within 500ms for up to 1000 records.
    </ac>
  </acceptance_criteria>
</feature>
```

*(Note the deliberate contradiction: `<description>` says "sequential pass",
`<ac id="fr-mf-001-ac1">` requires "concurrent parallel workers". Both are
within the same detail XML file — a pure internal contradiction.)*

### Other artifacts

- `design.md`: present but has no mention of sequential vs concurrent (not
  relevant to this scenario)
- `spec.xml`: present but does not contradict the detail XML's description
  or ACs (not relevant to this scenario)
- `dag.yaml`: present, no state drift

---

## Scenario Setup

1. Place the synthetic `details/my-feature.xml` at the expected path.
2. Spawn the `arc-auditing-spec-internal-consistency` agent with the Phase 1
   prompt template from `skills/arc-auditing-spec/SKILL.md`.

---

## PASS Criteria

1. The agent emits at least one finding with:
   - `id` matching `A2-\d{3}` (e.g., `A2-001`)
   - `severity` ∈ {HIGH, MED, LOW} (not INFO — this is a real contradiction)
   - `title` or `observed` that identifies the contradiction between
     "sequential pass" in the description and "concurrent parallel workers"
     in the acceptance criterion
   - `affected_files` pointing to the `details/my-feature.xml` file (and
     possibly specific line refs)
2. No finding ID uses a non-A2 prefix (e.g., A1-*, A3-*).
3. The agent does NOT emit a cross-artifact finding (the contradiction is
   purely within one file).

## FAIL Signals

- Agent emits the finding under A1 or A3 prefix (axis bleed).
- Agent emits nothing — misses the injected contradiction.
- Agent emits INFO severity for this real contradiction instead of HIGH/MED/LOW.
- Agent rationalizes "this might also be a design↔spec issue so I'll file it
  under A1" — the agent body closes this with explicit counter-examples.
- Agent scans across artifacts for related issues and emits cross-artifact
  findings — wrong axis, wrong scope.

---

## Automation Note

**Harness-executable (scoring-script-driven)**: The PASS criteria #1 and #2
can be verified by a scoring script that:
- Checks for the presence of an `A2-\d{3}` finding in the agent's output
- Checks that the finding's `observed` or `title` references the
  sequential/concurrent contradiction
- Checks that no `A1-` or `A3-` prefixed findings appear for this issue

**Manual/behavioral review**: Criteria #3 (no cross-axis bleed) and the
rationalization-closing are best verified by a human reviewer reading the
agent's full output.
