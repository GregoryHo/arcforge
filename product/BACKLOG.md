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
- **stale-draft floor loses an overlapping opt-in** — `learningEnabledSince`
  (scripts/lib/learning.js:150) derives the floor only from scopes that are
  enabled *now*, and `setLearningEnabled` keeps one `updated_at` per scope, so
  disabling the scope that opted in first advances the floor even though
  any-scope authorization was continuous; genuine enricher failures in the
  window between the two opt-ins stop being reported. Fix direction: persist the
  enable stamp across a disable and take the start of the continuous effective
  any-scope opt-in. Recorded as the accepted cost in D-009 for 6.1.0.
- **unify-candidate-queues** — point the `learn` transition commands at the
  canonical Layer-5 candidate queue, so the CLI and the dashboard manage the
  same candidates instead of two disjoint queues · issue: [#148](https://github.com/GregoryHo/arcforge/issues/148).
- **bound-transcript-parse** — `parseTranscript` reads and splits the whole
  session transcript on every above-threshold Stop and PreCompact even though
  every output it returns is a capped tail (about 5 ms per MB on real transcripts);
  bound the read, and correct the hooks spec's B-7 cost enumeration, which already
  omits this parse and the diary subprocess · issue: [#172](https://github.com/GregoryHo/arcforge/issues/172).
