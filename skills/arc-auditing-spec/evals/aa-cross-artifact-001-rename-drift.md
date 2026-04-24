# Eval: aa-cross-artifact-001 — Cross-Artifact Alignment (Rename Drift)

Behavioral eval scenario for the `cross-artifact-alignment` axis agent
(`arc-auditing-spec-cross-artifact-alignment`). Exercises fr-aa-001 through
fr-aa-004 for axis 1. Derived from patterns documented in the audit-agents
RED baseline (`docs/plans/arc-auditing-spec/2026-04-24/audit-agents-RED.md`).

---

## Synthetic Spec Family

This eval uses synthetic fixture content. Create the following files in a
temporary directory or use the fixture strings inline when running the eval
harness.

### `design.md` (synthetic)

```markdown
# my-feature-spec — Design

## Fan-Out

Three epics:
- `data-ingestion`: reads input files and normalizes them
- `data-transform`: applies business rules to normalized data
- `data-export`: writes results to output format
```

### `spec.xml` (synthetic)

```xml
<spec id="my-feature-spec">
  <epics>
    <epic id="data-ingestion">...</epic>
    <epic id="data-transformation">...</epic>
    <epic id="data-export">...</epic>
  </epics>
</spec>
```

*(Note the deliberate drift: `design.md` says `data-transform`, `spec.xml`
says `data-transformation`. This is the injected cross-artifact rename drift.)*

### `dag.yaml` (synthetic)

```yaml
epics:
  - id: data-ingestion
    status: pending
  - id: data-transformation
    status: pending
  - id: data-export
    status: pending
```

---

## Scenario Setup

1. Place the synthetic files so the agent can be invoked with:
   - `design.md` path: points to the synthetic design above
   - `spec.xml` path: points to the synthetic spec above
   - `dag.yaml` path: points to the synthetic dag above
   - `details/*.xml`: `(absent — directory does not exist)`

2. Spawn the `arc-auditing-spec-cross-artifact-alignment` agent with the
   Phase 1 prompt template from `skills/arc-auditing-spec/SKILL.md`.

---

## PASS Criteria

1. The agent emits at least one finding with:
   - `id` matching `A1-\d{3}` (e.g., `A1-001`)
   - `severity` ∈ {HIGH, MED, LOW} (not INFO — this is a real misalignment)
   - `title` or `observed` that identifies the `data-transform` /
     `data-transformation` name divergence
   - `affected_files` referencing at least two of the three artifacts
     (design.md, spec.xml, dag.yaml)
2. No finding ID uses a non-A1 prefix (e.g., A2-*, A3-*).
3. The agent emits NO finding about purely internal issues (single-artifact
   contradictions) — those would be false-axis findings.
4. If `spec.xml` were marked absent, the agent would emit exactly one INFO
   finding and no axis-bleeding findings — but in this scenario spec.xml IS
   present, so no graceful-degradation branch fires.

## FAIL Signals

- Agent emits the rename-drift finding under axis A2 or A3 prefix (axis bleed).
- Agent emits nothing — misses the injected drift.
- Agent emits multiple INFO findings instead of a real severity finding.
- Agent rationalizes "I noticed this while reading spec.xml so I'll file it
  under A2" — this is the specific rationalization the agent body closes.

---

## Automation Note

**Harness-executable (scoring-script-driven)**: The PASS criteria #1 and #2
can be verified by a scoring script that:
- Checks for the presence of an `A1-\d{3}` finding in the agent's output
- Checks that the finding's `observed` or `title` text contains both
  "data-transform" and "data-transformation" (or equivalently, references
  the design↔spec divergence)
- Checks that no `A2-` or `A3-` prefixed findings appear in output

**Manual/behavioral review**: Criteria #3 (absence of false-axis findings)
and the rationalization-closing in #4 are best verified by a human reviewer
reading the agent's output.
