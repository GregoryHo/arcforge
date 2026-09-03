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
- **stale-draft-floor-overlapping-opt-in** — `learningEnabledSince`
  (scripts/lib/learning.js) derives the floor only from scopes that are
  enabled *now*, and `setLearningEnabled` keeps one `updated_at` per scope, so
  disabling the scope that opted in first advances the floor even though
  any-scope authorization was continuous; genuine enricher failures in the
  window between the two opt-ins stop being reported. Fix direction: persist the
  enable stamp across a disable and take the start of the continuous effective
  any-scope opt-in. Recorded as the accepted cost in D-009 for 6.1.0.
- **learn-enable-erases-config** — `setLearningEnabled`
  (scripts/lib/learning.js) writes a fresh `{ scope, enabled, updated_at }`
  object, so every other key on the learning config is dropped. The only such
  key today is `inject_activated_instincts`, which
  `isInjectActivatedInstinctsEnabled` reads from the global config and which has
  no CLI setter — a user who hand-wrote `inject_activated_instincts: false` and
  later ran `arcforge learn enable --global` on an already-enabled scope gets
  default-ON injection back with no notice, from a command they expect to change
  nothing. Fix direction: merge over the previous config instead of replacing it
  (it is already in hand as `previous`). Pre-existing — the same full-replacement
  object predates the #146/#147 branch; surfaced during its review.
- **unify-candidate-queues** — point the `learn` transition commands at the
  canonical Layer-5 candidate queue, so the CLI and the dashboard manage the
  same candidates instead of two disjoint queues · issue: [#148](https://github.com/GregoryHo/arcforge/issues/148).
- ~~**unify-candidate-queues**~~ — graduated into 6.1.0 (D-012).
- **bound-transcript-parse** — `parseTranscript` reads and splits the whole
  session transcript on every above-threshold Stop and PreCompact even though
  every output it returns is a capped tail (about 5 ms per MB on real transcripts);
  bound the read, and correct the hooks spec's B-7 cost enumeration, which already
  omits this parse and the diary subprocess · issue: [#172](https://github.com/GregoryHo/arcforge/issues/172).
- **stale-probe-window-vs-rendered-paths** — the draft renders every modified
  path above its enrichment markers while the stale-draft probe reads only the
  first 2 KB, so thirty long paths push the marker past the window and a stale
  draft reads as enriched; bound the rendered block so the markers sit inside
  the probe window by construction · issue: [#177](https://github.com/GregoryHo/arcforge/issues/177).
