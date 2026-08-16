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
- **gate-session-capture-depth** — decide how much of the always-on session
  record belongs behind the learning opt-in; today the diary threshold also
  stores recent user-message text, with learning never enabled.
- **gate-diary-enricher** — the diary enricher is a background model run seeded
  with a session summary and fired regardless of the learning opt-in; decide
  whether it should be opt-in, opt-out, or announced.
- **unify-candidate-queues** — point the `learn` transition commands at the
  canonical Layer-5 candidate queue, so the CLI and the dashboard manage the
  same candidates instead of two disjoint queues.
