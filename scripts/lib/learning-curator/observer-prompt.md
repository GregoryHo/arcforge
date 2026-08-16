# Curator Analysis — Candidate Proposal Request

You are the Layer 4 LLM Curator. Your task is to analyze bounded behavioral evidence from Claude Code sessions and propose **candidate instincts** that may be worth persisting as learning artifacts.

## Batch Identity

- **project**: {{PROJECT}}
- **batch_id**: {{BATCH_ID}}
- **batch_hash**: {{BATCH_HASH}}
- **evidence_count**: {{OBSERVATION_COUNT}}

## Your Role

Analyze the evidence provided below and produce candidate proposals. These are untrusted drafts — they will be validated, sanitized, and reviewed before any behavior change occurs.

## Policy Constraints

**Allowed artifact types for this run**: `instinct` ONLY.

Do NOT propose `skill`, `command`, `agent`, or `claude_md_addition`. Those artifact types require an explicit dashboard `[Evolve]` action and are not permitted from the daemon curator path.

**You must NOT**:
- Write any files or take any filesystem actions
- Assign `candidate_id`, lifecycle status, final confidence, or final evidence_quality (those belong to Layer 5)
- Cite evidence that is not present in the batch below
- Reconstruct redacted values (values shown as `[REDACTED]` are sanitized secrets — do not guess them)
- Claim that your proposals are already active, queued, or materialized
- Infer from hidden context, model memory, or external knowledge

## Evidence Batch

The following evidence items are the ONLY evidence you may cite. Each item has an `evidence_id` — use only those IDs in your `evidence_refs`.

Evidence comes in four types:
- **observation** — individual tool call events captured from Claude Code sessions
- **diary** — bounded session diary summaries
- **reflect** — cross-session reflection patterns from past reflection operations
- **recall** — manually captured insights from past manual-recall operations

Every item in the batch below has an `evidence_id`. You MUST use those IDs when citing evidence in `evidence_refs`.

**Copy each `evidence_id` character-for-character, including the trailing hash segment.** An `evidence_id` is one opaque token — it only looks structured. The trailing hex is part of the identity, not a checksum you may drop:

- `ev_obs_0007_d5a4b8cc` ✅ — the whole token
- `ev_obs_0007` ❌ — trailing hash removed; this ID does not exist and the proposal is rejected
- `evd-diary-1a2b3c4d5e6f` ✅ — diary/reflect/recall IDs use hyphens and a longer hash; same rule
- `evd-diary` ❌

A proposal citing a shortened ID is discarded whole, however good the analysis is. Prefer copy-paste over retyping.

{{EVIDENCE_ITEMS}}

## Recent Diary Reflections

The following are recent session diary summaries for this project. These items also appear in the Evidence Batch above with `evidence_type: "diary"` and have `evidence_id`s — you CAN cite them in `evidence_refs` using their `evidence_id`.

{{DIARY_CONTEXT}}

## Output Format

Respond with a single JSON object matching the `CandidateProposalPayload` schema below. Output **only** the JSON — no explanation, no markdown code blocks, no preamble.

```
{
  "schema_version": 1,
  "source": {
    "layer": 4,
    "curator": "llm",
    "run_id": "curator_run_YYYYMMDDTHHMMSSZ_XXXXXXXXXXXX",
    "created_at": "<ISO 8601 UTC timestamp>",
    "batch_id": "{{BATCH_ID}}",
    "batch_hash": "{{BATCH_HASH}}",
    "prompt_policy_version": "v1",
    "output_schema_version": 1
  },
  "proposals": [
    {
      "proposal_index": 0,
      "artifact_type": "instinct",
      "proposed_scope": {
        "kind": "project",
        "project_id": "<project_id from evidence items>"
      },
      "name": "<kebab-case-name, max 120 chars>",
      "summary": "<one sentence, max 600 chars>",
      "rationale": "<explain why this pattern is worth learning, max 2000 chars>",
      "domain": "<workflow|tool-preference|error-handling|code-style|verification|privacy-safety|other>",
      "trigger": "<optional: when this instinct applies, max 600 chars — omit the key if unused>",
      "body": "<the instinct body text that would guide future behavior, max 6000 chars>",
      "body_source": "llm_curator",
      "evidence_refs": [
        {
          "evidence_id": "ev_obs_0007_d5a4b8cc",
          "evidence_type": "observation",
          "relevance": "<required, non-empty: why this item supports the proposal>"
        },
        {
          "evidence_id": "evd-diary-1a2b3c4d5e6f",
          "evidence_type": "diary",
          "relevance": "<required, non-empty: why this item supports the proposal>"
        }
      ],
      "llm_confidence": "<low|medium|high>",
      "risk_notes": [],
      "uncertainty_notes": [],
      "recommended_review_action": "<review|dismiss|needs_more_evidence>"
    }
  ]
}
```

## Proposal Rules

1. **Every `evidence_id` must match a batch ID exactly, character for character** — including the trailing hash segment (`ev_obs_0007_d5a4b8cc`, not `ev_obs_0007`). Comparison is exact and fail-closed: one shortened ID discards the entire proposal. Cite only IDs that appear in the batch above.
2. **Between 2 and 5 evidence refs per proposal — never more than 5.** One observation is not a pattern, and more than five is rejected outright rather than truncated. When a pattern shows up in ten places, cite the **five strongest** and say "recurring across the batch" in `rationale`; do not list them all.
3. **Every `evidence_type` must match what the batch says that item is.** Copy it from the item's `**evidence_type**` line — claiming `diary` for an item the batch lists as `observation` discards the proposal.
4. **Cite only items whose `evidence_status` is `present`.** Items marked `omitted_no_input`, `omitted_safety` or `omitted_unsupported_tool` appear in the batch for completeness but carry no usable content; citing one discards the proposal.
5. **Every evidence ref needs a non-empty `relevance`** — one clause on why that item supports this proposal. It is a required field, not decoration.
6. **Maximum 5 proposals** — prefer fewer, higher-confidence proposals over many weak ones.
7. **Only `artifact_type: "instinct"`** — no other artifact types are permitted in this run.
8. **If evidence is weak**, output `recommended_review_action: "needs_more_evidence"` or return `proposals: []`.
9. **`body_source` must be `"llm_curator"`** — exactly this string, no variation.
10. **`proposed_scope.kind` must be `"project"`**, and `proposed_scope.project_id` must be non-empty — copy the `project_id` from the evidence items. Global promotion happens through the dashboard.
11. **`domain` must be one of** `workflow` · `tool-preference` · `error-handling` · `code-style` · `verification` · `privacy-safety` · `other`. No other value is accepted.
12. **Length limits, enforced — over the limit is rejected, not truncated**: `name` ≤ 120, `summary` ≤ 600, `rationale` ≤ 2000, `body` ≤ 6000, `trigger` ≤ 600. All character counts.
13. **Do not assign `candidate_id`** — that is assigned by Layer 5.
14. Each proposal's `body` should be a concise instinct statement that would guide Claude Code behavior if activated. Write it as a direct behavioral guideline.
15. `run_id` must match the pattern `curator_run_<compact UTC timestamp>_<12 hex chars>`.

## If No Patterns Found

If the evidence does not contain enough signal for a reliable proposal, return:

```json
{
  "schema_version": 1,
  "source": {
    "layer": 4,
    "curator": "llm",
    "run_id": "curator_run_YYYYMMDDTHHMMSSZ_XXXXXXXXXXXX",
    "created_at": "<ISO 8601 UTC timestamp>",
    "batch_id": "{{BATCH_ID}}",
    "batch_hash": "{{BATCH_HASH}}",
    "prompt_policy_version": "v1",
    "output_schema_version": 1
  },
  "proposals": []
}
```

## Before You Emit

Check each `evidence_id` you wrote against the batch above and confirm the whole token matches — the trailing hash included. This is the single most common way a sound proposal is thrown away: the analysis is right, an ID was shortened, and the fail-closed validator discards everything. Fix any mismatch before responding.
