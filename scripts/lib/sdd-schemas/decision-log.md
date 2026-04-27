# decision-log Schema

Canonical path: `<brainstorming-output-dir>/decision-log.<ext>`

The file lives inside brainstorming's date-stamped output directory
(`docs/plans/<spec-id>/<YYYY-MM-DD>[-suffix]/`). The wire format (YAML, strict
markdown table, etc.) is a deliberately unspecified implementation choice — pinning
the format in the contract would over-constrain the implementation and freeze a
swappable detail. The contract is the field shape and machine-parseability.

## Required Fields per Row

All four fields MUST be present in every Q&A row. Missing any one field is an ERROR.

| Field | Type | Description |
|---|---|---|
| `q_id` | string | Stable identifier for this question, unique within the brainstorming session. Used as the lookup key for Phase 6 mechanical authorization. Duplicate `q_id` within a session is ERROR. |
| `question` | string | Verbatim text of the question asked by brainstorming during Phase 2 elicitation. |
| `user_answer_verbatim` | string | Verbatim text of the user's answer as given. Must not be paraphrased or summarized — the refiner verifies content against this field directly. |
| `deferral_signal` | boolean | `true` when `user_answer_verbatim` matches one of the canonical deferral phrases (see below). `deferral_signal=true` tells refiner that axis is unbound — refiner MUST NOT treat it as authorization for a concrete MUST. |

## q_id Uniqueness Rule

`q_id` MUST be unique within a single brainstorming session. Two rows with the same
`q_id` in one session is ERROR — it makes deterministic lookup ambiguous and breaks
refiner's Phase 6 trace verification.

## Row Addressability

Rows MUST be addressable by `q_id`. Lookup by `q_id` is a deterministic operation on
the parsed structure — no LLM re-interpretation is needed. Refiner's Phase 6 mechanical
authorization check iterates over every `<trace>` element citing a Q&A row by `q_id`
and verifies the cited content appears in that row's `user_answer_verbatim`.

## Deferral-Signal Canonical Phrases

When `user_answer_verbatim` matches any of the following phrases (case-insensitive,
trimmed), `deferral_signal` MUST be set to `true`:

- `use defaults`
- `covered.`
- `skip`
- `you decide`

Additional phrases MAY be recognized by implementations. The list above is the minimum
required set per `fr-cc-if-008-ac4`.

## Enforcement Authority

`scripts/lib/sdd-utils.js` — `DECISION_LOG_RULES` is the sole source of truth.
Validators (built in `fr-sd-014`) read from that constant. If this document disagrees
with the constant, the constant wins and this document is wrong (file a bug).

## Examples

### Valid Example (3 Q&A rows, distinct q_ids, mix of deferral_signal true and false)

```yaml
- q_id: q_rateLimitWindow
  question: "What rate-limit window should be used for API endpoints?"
  user_answer_verbatim: "use defaults"
  deferral_signal: true

- q_id: q_authTokenExpiry
  question: "How long should access tokens remain valid?"
  user_answer_verbatim: "15 minutes for access tokens, 7 days for refresh tokens"
  deferral_signal: false

- q_id: q_passwordMinLength
  question: "What is the minimum password length requirement?"
  user_answer_verbatim: "12 characters minimum"
  deferral_signal: false
```

### Invalid Example 1 (duplicate q_id within a session — ERROR)

```yaml
- q_id: q_authTokenExpiry
  question: "How long should access tokens remain valid?"
  user_answer_verbatim: "15 minutes"
  deferral_signal: false

- q_id: q_authTokenExpiry
  question: "Should refresh tokens expire?"
  user_answer_verbatim: "yes, after 7 days"
  deferral_signal: false
```

**Error**: `decision-log MUST NOT contain duplicate q_id within a session — q_authTokenExpiry appears more than once`

Duplicate `q_id` makes deterministic lookup ambiguous. Refiner's Phase 6 cannot
reliably verify cited content when two rows share the same identifier.

### Invalid Example 2 (missing deferral_signal field — ERROR)

```yaml
- q_id: q_rateLimitWindow
  question: "What rate-limit window should be used for API endpoints?"
  user_answer_verbatim: "use defaults"

- q_id: q_authTokenExpiry
  question: "How long should access tokens remain valid?"
  user_answer_verbatim: "15 minutes"
  deferral_signal: false
```

**Error**: `decision-log row q_rateLimitWindow is missing required field: deferral_signal`

All four required fields must be present. Missing `deferral_signal` prevents refiner
from determining whether the axis is deferred — it cannot distinguish "unbound design
choice" from "concrete user decision".

### Invalid Example 3 (missing user_answer_verbatim field — ERROR)

```yaml
- q_id: q_passwordMinLength
  question: "What is the minimum password length requirement?"
  deferral_signal: false

- q_id: q_authTokenExpiry
  question: "How long should access tokens remain valid?"
  user_answer_verbatim: "15 minutes"
  deferral_signal: false
```

**Error**: `decision-log row q_passwordMinLength is missing required field: user_answer_verbatim`

All four required fields must be present. Missing `user_answer_verbatim` breaks
refiner's Phase 6 trace verification — it cannot confirm that cited content appears
in the user's actual answer.
