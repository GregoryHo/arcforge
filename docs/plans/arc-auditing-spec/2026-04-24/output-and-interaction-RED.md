# RED Baseline — output-and-interaction epic

Contributor artifact. Documents baseline failure modes observed when a stock
agent attempts to produce Phase 2-5 output WITHOUT the explicit constraints in
SKILL.md. These are the exact rationalizations the GREEN implementation must
foreclose.

---

## Phase 2 — Report Rendering

**Baseline failure**: A stock agent defaults to flowing prose. It writes
"Here are the findings from the audit..." followed by three paragraphs
describing each finding in natural language. It may omit INFO findings
entirely ("these are just informational, not actionable"). It uses bold labels
for resolution options ("**Option A:** rename the epic") rather than a
structured table. The "why it matters" paragraph is identical in format to the
"observed evidence" paragraph — no structural distinction. Findings from axes
that returned zero HIGH results may be silently collapsed into a summary note.
MED/LOW findings are described tersely without full detail blocks because "the
user probably wants to focus on HIGH".

---

## Phase 3 — Triage UX

**Baseline failure**: A stock agent puts MED findings into the AskUserQuestion
`options` array alongside HIGH findings, reasoning "this MED finding is clearly
important and the user should see it prominently." It may present all 7-8
findings in one giant AskUserQuestion call (no batching), or set
`multiSelect: false` for simplicity. It never mentions a batching loop because
it doesn't anticipate >4 HIGH findings. The Other free-text channel is
mentioned in passing but no parsing logic is described — agent treats it as a
comment field and never maps its content to the resolution queue.

---

## Phase 4 — Resolution UX

**Baseline failure**: A stock agent renders resolution options as a numbered
prose list inside the question text ("1. Rename the epic id. 2. Update the
design doc."). It omits the `preview` field for any resolution that "is
obvious enough." It may set `multiSelect: true` to let users pick multiple
resolutions at once "for efficiency." The `header` field uses the finding's
full title (can be >12 chars). When a recommended resolution exists, the agent
says "Option A (recommended by the auditor):" in prose rather than using the
structural `(Recommended)` prefix on the label. Other free-text is accepted but
silently discarded if it doesn't match a listed option.

---

## Phase 5 — Decisions Table

**Baseline failure**: A stock agent auto-applies the user's chosen resolutions
using Edit, reasoning "the user already decided — applying saves a round-trip."
It may skip the Decisions table entirely ("the decisions are self-evident from
the conversation"). When the user answered via Other free-text, the agent
paraphrases it into a brief note rather than storing it verbatim. After printing
the table, it suggests running `/arc-refining` to apply the changes, treating
the skill as the first step of a two-step apply pipeline.

---

## --save Flag

**Baseline failure**: A stock agent reimplements the project-hash computation
inline (e.g., `sha256(cwd).slice(0, 6)`) because "it's simpler than importing
a Node module." It also writes a review file even when `--save` was not
provided ("it's harmless to save, and the user will want this later"). If
`--save` IS provided, it may write to a project-tracked path (`docs/reviews/`
or `specs/<id>/audit-report.md`) because that feels more discoverable.
