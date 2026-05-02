---
name: arc-learning
description: Use when optional learning is enabled and observations should become reviewable candidates, inactive drafts, and explicitly activated artifacts.
---

# Optional Learning Candidate Lifecycle

## Overview

`arc-learning` turns repeated project observations into reviewable learning candidates. Learning is **disabled by default**, **automatic once enabled**, and conservative at every behavior-change boundary.

**Position:** `observations → automatic analyzer → candidate queue → human review → inactive drafts → explicit activation → active artifacts`

The default scope is project-local. Global materialization/activation is unsupported in this MVP; cross-project or global patterns should be proposed as promotion candidates, not silently promoted.

## Quick Reference

| Task | Command |
|---|---|
| Check config | `arcforge learn status --json` |
| Enable project learning | `arcforge learn enable --project` |
| Disable project learning | `arcforge learn disable --project` |
| Manually run analyzer | `arcforge learn analyze --project` |
| Review queued candidates | `arcforge learn review --project` |
| Approve a candidate | `arcforge learn approve <candidate-id> --project` |
| Reject a candidate | `arcforge learn reject <candidate-id> --project` |
| Write inactive draft artifacts | `arcforge learn materialize <candidate-id> --project` |
| Inspect candidate and artifact state | `arcforge learn inspect <candidate-id> --project` |
| List materialized drafts | `arcforge learn drafts --project` |
| Promote reviewed drafts | `arcforge learn activate <candidate-id> --project` |

Use `--json` on any command when another tool or test needs machine-readable output.

## Workflow

1. **Confirm enablement.** Run `arcforge learn status --json`. Learning is disabled by default for both project and global scopes.
2. **Enable only when requested.** Run `arcforge learn enable --project` for project-local learning. After enablement, the observe hook may automatically append sanitized observations and trigger the lightweight analyzer.
3. **Automatic candidate queueing.** Once enabled, repeated release-flow observations can be queued as a **pending candidate**. The automatic trigger only appends candidate records; it does not approve, materialize, activate, tag, push, publish, or change runtime behavior.
4. **Review.** Run `arcforge learn review --project` and inspect the summary, trigger, confidence, and redacted evidence.
5. **Approve or reject.** Run `arcforge learn approve <candidate-id> --project` or `arcforge learn reject <candidate-id> --project`. Approval is required before any artifact is written.
6. **Materialize as inactive drafts.** Run `arcforge learn materialize <candidate-id> --project`. This writes `.draft` files only, for example `skills/arc-releasing/SKILL.md.draft` and `tests/skills/test_skill_arc_releasing.py.draft`.
7. **Inspect before activation.** Run `arcforge learn inspect <candidate-id> --project` or `arcforge learn drafts --project`. Inspection is read-only and review-safe.
8. **Explicit activation.** Run `arcforge learn activate <candidate-id> --project` only after reviewing the draft artifacts. Activation promotes drafts to active artifacts and fails closed if drafts are missing or active files already exist.

## Key Principles

- **No active behavior change without explicit activation.** Pending candidates and inactive drafts do not affect runtime behavior.
- **Project scope first.** Project learning writes project-local config, queues, and drafts. Global materialization and activation are unsupported in this MVP.
- **Human authorization at gates.** Automatic analysis may propose; users approve/reject, materialize, and activate.
- **Redacted durable evidence.** Observations are sanitized before persistence; candidate evidence stores review-safe summaries, not raw tool payloads.
- **Fail closed for artifact writes.** Materialization requires approval; activation requires materialized drafts and refuses to overwrite existing active artifacts.
- **Duplicate suppression.** Analyzer reruns should not append semantic duplicate candidates for the same learned behavior.

## When to Use

- The user explicitly asks to enable project learning.
- Repeated observations suggest a reusable project workflow, especially a release/preflight/checklist skill.
- You need to review, approve, reject, inspect, materialize, or activate a learning candidate.
- You want a conservative self-improvement path that preserves human review before behavior changes.

## When NOT to Use

- Learning has not been explicitly enabled.
- The user wants to save a single known preference or fact; use the appropriate memory/skill workflow instead.
- The pattern is not supported by the current analyzer; keep it as a manual plan or skill change.
- The candidate would require global activation; global activation is unsupported in this MVP.
- The action would perform a destructive release step such as tag, push, package publish, or GitHub release creation without explicit user approval.

## Legacy Compatibility

`skills/arc-learning/scripts/learn.js` remains in the tree for older instinct-clustering tests and compatibility, but the supported MVP surface is the `arcforge learn ...` lifecycle above. Do not use the legacy script to bypass candidate approval, inactive draft materialization, or explicit activation gates.
