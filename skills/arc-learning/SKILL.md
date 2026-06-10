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

**Primary surface — dashboard-driven**:

| Task | Command |
|---|---|
| Check config | `arcforge learn status [--json]` |
| Enable project learning | `arcforge learn enable --project` |
| Disable project learning | `arcforge learn disable --project` |
| Open review dashboard | `arcforge learn dashboard [--port N]` |

Once the daemon is running and learning is enabled, the **dashboard** is where all candidate review and lifecycle actions happen (Approve, Dismiss, Materialize, Activate, Deactivate, Promote, Evolve). The dashboard reads from `~/.arcforge/learning/candidates/queue.jsonl` (the canonical Layer 5 queue produced by the LLM curator). See `docs/guide/learning-dashboard.md` for the full operational guide.

### Retired / Deprecated CLI commands

The following `arcforge learn ...` subcommands remain in the CLI but do not read or write the candidate queue. Use the dashboard for new workflows.

- `arcforge learn analyze --project` — the command exits with a deprecation notice; candidate curation is handled by the LLM curator (observer daemon Layer 3+4).
- `arcforge learn review --project` — legacy CLI summary; use dashboard instead.
- `arcforge learn inbox --project` — legacy pending list; use dashboard.
- `arcforge learn approve <candidate-id> --project` / `arcforge learn reject <candidate-id> --project` — legacy approval/rejection; use dashboard `[Approve]` / `[Dismiss]`.
- `arcforge learn materialize <candidate-id> --project` — legacy materialization (writes project-relative `.draft` siblings); current drafts live in `~/.arcforge/learning/drafts/<cid>/<mid>/instincts/<name>.md` via dashboard `[Materialize]`.
- `arcforge learn activate <candidate-id> --project` — legacy activation; use dashboard `[Activate]` (Layer 8 activate.js).
- `arcforge learn inspect <candidate-id> --project` / `arcforge learn drafts --project` — legacy inspection; use dashboard candidate card.

Use `--json` on any command when another tool or test needs machine-readable output.

## Workflow

1. **Confirm enablement.** Run `arcforge learn status [--json]`. Learning is disabled by default for both project and global scopes.
2. **Enable only when requested.** Run `arcforge learn enable --project` for project-local learning. After enablement, the observer daemon assembles evidence batches, calls the LLM curator, and automatically queues **pending candidates** in the candidate queue.
3. **Automatic candidate queueing.** Once enabled, the daemon's LLM curator converts batched observations into pending candidates. The automatic trigger only appends candidate records; it does not approve, materialize, activate, tag, push, publish, or change runtime behavior.
4. **Review via dashboard.** Run `arcforge learn dashboard` to open the browser control plane at `http://localhost:3334`. The dashboard is the canonical review surface.
5. **Approve or dismiss.** Use the dashboard `[Approve]` or `[Dismiss]` action. Approval is required before any artifact is written.
6. **Materialize as inactive drafts.** Use the dashboard `[Materialize]` action. Draft artifacts are written to `~/.arcforge/learning/drafts/<candidate-id>/<materialization-id>/instincts/<name>.md` — these are inactive review files; they are not loaded into Claude context.
7. **Inspect before activation.** Open the candidate card on the dashboard; preview the draft body before activating.
8. **Explicit activation.** Use the dashboard `[Activate]` action only after reviewing the draft. Activation copies the draft to `~/.arcforge/instincts/<project>/<candidate-id>.md` (project scope) or `~/.arcforge/instincts/global/<candidate-id>.md` (global scope), with `supersede_with_backup` if an active artifact already exists at that path. SessionStart never auto-loads activated instinct bodies — surfacing is via dashboard / `arc-recalling` only.

## Candidate Lifecycle Statuses

The full set of statuses a candidate moves through:

| Status | Meaning |
|---|---|
| `pending_review` | Queued by LLM curator, awaiting human review |
| `needs_more_evidence` | Flagged for more evidence before approval |
| `approved` | Human-approved, ready to materialize |
| `materialized` | Inactive draft artifact(s) written under `~/.arcforge/learning/drafts/<cid>/<mid>/`, ready to activate |
| `activated` | Draft promoted to active instinct file under `~/.arcforge/instincts/<scope>/<cid>.md` |
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

The supported surface is the `arcforge learn ...` lifecycle above. Do not use the legacy `skills/arc-learning/scripts/learn.js` to bypass candidate approval, inactive draft materialization, or explicit activation gates.
