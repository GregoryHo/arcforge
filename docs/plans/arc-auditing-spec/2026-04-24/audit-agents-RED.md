# audit-agents epic — RED Baseline Notes

Date: 2026-04-24
Epic: audit-agents (second of three)

Captured before GREEN pass. Each section is one feature: what a baseline
agent would do WRONG without the skill content this epic adds.

---

## Feature aa-001 — Parallel fan-out mechanics

**What a baseline agent does wrong:**

A stock agent executing Phase 1 defaults to sequential Task tool dispatch
because issuing three Task calls in a single message feels "safer" and
"easier to track". Rationalizations observed: "I'll spawn them one at a
time so I can feed the result from each into the next" (even though the
axes are independent), or "parallel dispatch could create race conditions"
(not true for read-only agents). Without an explicit unambiguous
SINGLE-MESSAGE / CONCURRENT instruction, agents reliably serialize.

Additionally, without a concrete prompt template, the inputs each sub-agent
receives are ad-hoc. The agent improvises a prompt on the spot, sometimes
omitting the absolute paths, sometimes omitting the spec-id, sometimes
providing a relative path that becomes ambiguous inside a fresh sub-agent
context window.

---

## Feature aa-002 — Structured finding schema

**What a baseline agent does wrong:**

Without a shared schema, each axis agent invents its own finding format.
Common failures:
- ID format inconsistency: one agent uses "FINDING-1", another "Axis1-001",
  another just "1."
- Severity downgrades: an agent sees a misalignment that clearly matters and
  marks it INFO "because I'm not certain" — treating INFO as a low-confidence
  bucket rather than a structurally reserved graceful-degradation signal.
- Missing recommended prefix: when the agent has a clear preferred fix it
  omits "(Recommended)" because no format mandated it; conversely, it marks
  ALL resolutions "(Recommended)" because "they're all good options."
- Resolution preview omitted even when the resolution corresponds to an
  editable artifact change, because no contract required it.
- No cut-off criteria specified: agents use "gut feel" to assign HIGH vs MED
  vs LOW, leading to arbitrary severity inflation or compression.

---

## Feature aa-003 — Axis-scope separation

**What a baseline agent does wrong:**

Without explicit pattern examples and counter-examples, agents leak findings
across axis boundaries. Observed failure modes:
- Cross-artifact agent emits a finding about an AC contradicting itself
  within spec.xml — purely internal, should be axis 2.
- Internal-consistency agent notices design.md and dag.yaml use different
  epic IDs and files it as an internal-consistency finding — should be axis 1.
- State-transition agent, missing dag.yaml, decides to scan design.md for
  state-related prose and emits findings about design choices — wrong: its
  only job with no dag is to emit the single INFO finding.
- Agents rationalize ambiguous cases by filing under whichever axis they
  happened to notice the issue, not which axis OWNS that class of issue.

---

## Feature aa-004 — Graceful degradation

**What a baseline agent does wrong:**

Without explicit branch instructions:
- Cross-artifact agent, when spec.xml is absent, skips spec-alignment checks
  silently (emits nothing) rather than emitting the required INFO finding.
  OR it pivots to design↔dag checks only without noting the skip — INFO
  finding contract is violated either way.
- State-transition agent, when dag.yaml is absent, still tries to scan
  design.md or spec.xml for state-related information and emits multiple
  findings — violates the EXACTLY ONE finding contract.
- No agent has a documented partial-failure contract. On token-limit or
  tool-error, agents either crash silently (returning nothing) or suppress
  the error and return a partial set without an error_flag — leaving the
  main session unable to distinguish "no findings" from "agent failed
  mid-audit."

---

## Axis-scope rationalization vectors (pre-REFACTOR notes)

Specific rationalizations to close during REFACTOR:
1. "This finding touches spec.xml AND dag.yaml — I noticed it while reading
   spec.xml for internal-consistency, so I'll file it under axis 2." WRONG.
   Cross-artifact issues belong to axis 1 always. The axis is defined by the
   SCOPE of evidence, not where you noticed it first.
2. "No dag.yaml but I can still do useful state checks on design.md —
   I'll emit design-state findings plus one INFO about the missing dag."
   WRONG: fr-aa-004-ac2 says EXACTLY ONE finding for state-transition when
   dag is missing. No other checks run.
3. "The user said 'check drift', so git log -1 is fine since it's read-only
   inspection." WRONG: Bash is not in the tool grant. Git-history drift is
   out of scope. The comment in the agent body must re-state this explicitly.
