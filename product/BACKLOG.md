# Backlog — arcforge

The **wishing pool**: candidate ideas not yet committed to a version. A line here is
a *wish*, not a spec. When picked, it graduates via the *Promote a backlog item*
playbook in [`product/AGENTS.md`](AGENTS.md).

## Harness

- ~~**codex-harness**~~ — graduated into 6.1.0 (D-004).
- **codex-cli-on-path** — get the bare `arcforge` CLI onto Codex's PATH, so the
  seven CLI-backed skills stop reporting `command not found` there · needs: D-004.
- **codex-hooks-adapter** — a Codex-shaped registry for the hooks worth porting,
  so observation and injection are not Claude Code's alone · needs: D-004.
- **harness-neutral-model-runner** — replace the `claude`-spawning runner the
  learning, eval and loop subsystems share, so they can run on a second host ·
  needs: D-004.

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
- **dashboard-activation-ack** — the learning dashboard's Activate and Deactivate
  buttons are refused by their own gate: the page posts the action with no
  `safety_ack`, and shows neither the behavior-change warning nor the active
  target path it would be acknowledging, so the CLI is the only surface that can
  activate today · issue: [#173](https://github.com/GregoryHo/arcforge/issues/173).
- **cli-draft-path-redaction** — Layer 5 stores a candidate's `name` unredacted
  while every card renders it through the redactor, so a keyword-shaped name
  reaches four artifacts: the queue, the draft filename, the draft body and the
  activated instinct the runtime loads — and `draft_paths` prints the filename
  while the dashboard's detail wire redacts the same path. Reject at ingestion or
  normalize at the Layer-5 write is the product call D-012 leaves open; either
  moves `candidate_record_hash` · issue: [#175](https://github.com/GregoryHo/arcforge/issues/175).