---
name: arc-learning
description: Use when optional learning is enabled and observations should become reviewable candidates, inactive drafts, and explicitly activated artifacts.
---

# Optional Learning Candidate Lifecycle

## Overview

`arc-learning` turns repeated project observations into reviewable learning candidates. Learning is **disabled by default**, **automatic once enabled**, and conservative at every behavior-change boundary.

**Position:** `observations → candidate queue → dashboard review → inactive drafts → explicit activation → active artifacts`

The primary interface for reviewing and acting on candidates is the **dashboard** (`arcforge learn dashboard`). Candidates are queued automatically by the observer daemon's LLM curator; the dashboard is where the human reviewer approves, dismisses, materializes, activates, promotes, or deactivates them.

The default scope is project-local. Promotion to global scope is an explicit dashboard action; silent auto-promotion to global remains unsupported — the dashboard's Promote action is the only path, and it requires explicit user authorization.

## Quick Reference

| Task | Command |
|---|---|
| Check config | `arcforge learn status [--json]` |
| Enable project learning | `arcforge learn enable --project` |
| Disable project learning | `arcforge learn disable --project` |
| Open review dashboard | `arcforge learn dashboard [--port N]` |
| Review queued candidates (CLI) | `arcforge learn review --project` |
| Check pending inbox | `arcforge learn inbox --project` |
| Approve a candidate | `arcforge learn approve <candidate-id> --project` |
| Reject a candidate | `arcforge learn reject <candidate-id> --project` |
| Write inactive draft artifacts | `arcforge learn materialize <candidate-id> --project` |
| Inspect candidate and artifact state | `arcforge learn inspect <candidate-id> --project` |
| List materialized drafts | `arcforge learn drafts --project` |
| Promote reviewed drafts to active | `arcforge learn activate <candidate-id> --project` |

Use `--json` on any command when another tool or test needs machine-readable output.

### Retired / Deprecated

- `arcforge learn analyze --project` — the statistical analyzer has been retired in v3.1. The statistical pipeline is replaced by the LLM curator (observer daemon Layer 3+4). Run `arcforge learn dashboard` instead.

## Workflow

1. **Confirm enablement.** Run `arcforge learn status [--json]`. Learning is disabled by default for both project and global scopes.
2. **Enable only when requested.** Run `arcforge learn enable --project` for project-local learning. After enablement, the observer daemon assembles evidence batches, calls the LLM curator, and automatically queues **pending candidates** in the candidate queue.
3. **Automatic candidate queueing.** Once enabled, the daemon's LLM curator converts batched observations into pending candidates. The automatic trigger only appends candidate records; it does not approve, materialize, activate, tag, push, publish, or change runtime behavior.
4. **Review via dashboard.** Run `arcforge learn dashboard` to open the browser control plane at `localhost:3334`. Alternatively, run `arcforge learn review --project` for a CLI summary of pending candidates.
5. **Approve or dismiss.** Use the dashboard Approve or Dismiss action, or run `arcforge learn approve <candidate-id> --project` / `arcforge learn reject <candidate-id> --project`. Approval is required before any artifact is written.
6. **Materialize as inactive drafts.** Use the dashboard Materialize action, or run `arcforge learn materialize <candidate-id> --project`. This writes `.draft` files only — for example `skills/arc-releasing/SKILL.md.draft` — which are readable but not active.
7. **Inspect before activation.** Run `arcforge learn inspect <candidate-id> --project` or `arcforge learn drafts --project`. Inspection is read-only and review-safe.
8. **Explicit activation.** Use the dashboard Activate action, or run `arcforge learn activate <candidate-id> --project` only after reviewing the draft artifacts. Activation promotes drafts to active artifacts and fails closed if drafts are missing or active files already exist.

## Candidate Lifecycle Statuses

The full set of statuses a candidate moves through:

| Status | Meaning |
|---|---|
| `pending_review` | Queued by LLM curator, awaiting human review |
| `needs_more_evidence` | Flagged for more evidence before approval |
| `approved` | Human-approved, ready to materialize |
| `materialized` | `.draft` artifacts written, ready to activate |
| `activated` | Draft artifacts promoted to active |
| `deactivated` | Previously activated, now deactivated |
| `dismissed` | Rejected; no artifacts written |
| `superseded` | Replaced by an evolved candidate |

## Key Principles

- **No active behavior change without explicit activation.** Pending candidates and inactive drafts do not affect runtime behavior.
- **Project scope first.** Project learning writes project-local config, queues, and drafts. Promotion to global scope is an explicit dashboard action; silent auto-promotion to global remains unsupported.
- **Human authorization at gates.** The LLM curator proposes; users approve/reject, materialize, and activate via dashboard or CLI.
- **Redacted durable evidence.** Observations are sanitized before persistence; candidate evidence stores review-safe summaries, not raw tool payloads.
- **Fail closed for artifact writes.** Materialization requires approval; activation requires materialized drafts and refuses to overwrite existing active artifacts.
- **Duplicate suppression.** The curator should not append semantic duplicate candidates for the same learned behavior.

## When to Use

- The user explicitly asks to enable project learning.
- Repeated observations suggest a reusable project workflow, especially a release/preflight/checklist skill.
- You need to review, approve, reject, inspect, materialize, or activate a learning candidate.
- You want a conservative self-improvement path that preserves human review before behavior changes.

## When NOT to Use

- Learning has not been explicitly enabled.
- The user wants to save a single known preference or fact; use the appropriate memory/skill workflow instead.
- The pattern is not supported by the current learning system; keep it as a manual plan or skill change.
- The action would perform a destructive release step such as tag, push, package publish, or GitHub release creation without explicit user approval.

## Legacy Compatibility

`skills/arc-learning/scripts/learn.js` remains in the tree for older instinct-clustering tests and compatibility, but the supported MVP surface is the `arcforge learn ...` lifecycle above. Do not use the legacy script to bypass candidate approval, inactive draft materialization, or explicit activation gates.
