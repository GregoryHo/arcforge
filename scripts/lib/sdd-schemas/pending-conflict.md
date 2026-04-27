# _pending-conflict.md Schema

Canonical path: `specs/<spec-id>/_pending-conflict.md`

The underscore prefix marks the file as ephemeral hand-off, not versioned spec content.
The file MUST NOT live under `details/` or any path that would be parsed as a spec detail file.

## Lifecycle

**State**: ephemeral — non-versioned, non-authoritative.

- **Written by**: refiner on R3 axis-1/2/3 block (per `fr-rf-015`). When any axis fires,
  the refiner writes this file and exits non-zero with no `spec.xml` or `details/` written.
- **Read by**: brainstorming Phase 0 iterate-branch auto-entry (per `fr-bs-008`). If this
  file exists, brainstorming automatically enters its iterate branch using the conflict body
  as Change Intent seed. The user picks a resolution; brainstorming writes a new dated
  `docs/plans/<spec-id>/<NEW-DATE>/design.md`.
- **Deleted by**: brainstorming on successful new-design write.

Per A.1's narrowed Iron Law, this is the explicit ephemeral exception to "no authoritative
state on block". Validators MUST treat persistence across a completed conflict cycle as
ERROR: `"a prior conflict cycle did not complete cleanly"`.

## Required Fields

All four fields MUST be present. Missing any one field is an ERROR.

| Field | Type | Description |
|---|---|---|
| `axis_fired` | enum (`"1"`, `"2"`, `"3"`) | Which R3 contradiction axis triggered the block: 1 = design.md internal contradictions, 2 = design.md ↔ Q&A contradiction, 3 = spec-draft criterion cannot be traced to a design phrase or Q&A row. |
| `conflict_description` | string | Specific design line ranges and Q&A row `q_id`s involved. Must cite exact sources so brainstorming Phase 0 can mechanically address them without LLM re-interpretation. |
| `candidate_resolutions` | list, length 1–3 | Each entry is a concrete action the user can pick. At least one resolution MUST be present (zero = ERROR). At most three (more than three degrades usability). |
| `user_action_prompt` | string | Directs the user to run `/arc-brainstorming iterate <spec-id>` to resolve the conflict. Must be present so the user knows the next step after reading the conflict file. |

## Enforcement Authority

`scripts/lib/sdd-utils.js` — `PENDING_CONFLICT_RULES` is the sole source of truth.
Validators (built in `fr-sd-014`) read from that constant. If this document disagrees
with the constant, the constant wins and this document is wrong (file a bug).

## Examples

### Valid Example (axis 1 fired, 2 candidate resolutions, user-action prompt present)

```yaml
axis_fired: "1"
conflict_description: >
  design.md lines 32–35 state the rate-limit window as "per 60 seconds", but
  lines 78–81 reference "a 5-minute sliding window". These are internally
  contradictory — the refiner cannot produce a MUST without inventor's choice
  between them. Q&A row q_rateLimitWindow is the relevant decision log entry
  (user answered "use defaults", deferral_signal: true — not actionable here
  because both values are explicit in the design).
candidate_resolutions:
  - "(a) Adopt the 60-second window (lines 32–35) as authoritative; update lines 78–81 to match."
  - "(b) Adopt the 5-minute window (lines 78–81) as authoritative; update lines 32–35 to match."
user_action_prompt: >
  A contradiction was detected in your design doc (axis 1 — internal contradiction).
  Run `/arc-brainstorming iterate spec-driven-refine` and pick resolution (a) or (b),
  or describe your own. Brainstorming will write a new design.md with your choice baked in.
```

### Invalid Example (no candidate resolutions — ERROR)

```yaml
axis_fired: "2"
conflict_description: >
  design.md line 44 states windowMs = 60000, but Q&A row q_windowSec records the
  user answering "60 seconds" (i.e., windowSec = 60, not windowMs = 60000).
candidate_resolutions: []
user_action_prompt: >
  Run /arc-brainstorming iterate <spec-id> to resolve.
```

**Error**: `_pending-conflict.md MUST contain at least one candidate resolution`

An empty `candidate_resolutions` list gives the user nothing to act on. The refiner
MUST produce at least one concrete resolution option — even if the options are symmetric
("keep design" vs. "keep Q&A answer") — before writing the conflict file.
