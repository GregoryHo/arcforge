# Backlog — arcforge

The **wishing pool**: candidate ideas not yet committed to a version. A line here is
a *wish*, not a spec. When picked, it graduates via the *Promote a backlog item*
playbook in [`product/AGENTS.md`](AGENTS.md).

## Harness

- **codex-harness** — wrap Codex as a second harness alongside Claude Code
  (packaging + spike verification of skill discovery and invocation) · needs: D-002.

## Learning

- **dashboard-rejections** — surface curator-rejected proposals
  (`rejections.jsonl`) in the review dashboard, so a user can see what the curator
  declined and why.
- ~~**gate-session-capture-depth**~~ — graduated into 6.1.0 (D-010).
- ~~**gate-diary-enricher**~~ — graduated into 6.1.0 (D-009).
- **unify-candidate-queues** — point the `learn` transition commands at the
  canonical Layer-5 candidate queue, so the CLI and the dashboard manage the
  same candidates instead of two disjoint queues · issue: [#148](https://github.com/GregoryHo/arcforge/issues/148).
