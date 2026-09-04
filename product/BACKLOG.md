# Backlog — arcforge

The **wishing pool**: candidate ideas not yet committed to a version. A line here is
a *wish*, not a spec. When picked, it graduates via the *Promote a backlog item*
playbook in [`product/AGENTS.md`](AGENTS.md).

## Harness

- ~~**codex-harness**~~ — graduated into 6.1.0 (D-013).
- **codex-cli-on-path** — give the seven CLI-backed skills a working engine call
  on Codex, which does not put a plugin's `bin/` on `PATH`. Two mechanisms were
  observed working in the spike, and they are not equally cheap: a **skill-relative
  path** from Codex's skills-roots table up to the bundled `bin/arcforge` (proven,
  but a skill naming its way to the engine is exactly what D1/D9 forbid, so it
  needs a decision), or a **SessionStart hook** injecting the absolute path as
  `additionalContext` (proven, but it needs a hook file Codex can discover — i.e.
  the `hooks/hooks.json` that D-013 deliberately keeps empty, so taking this route <!-- doc-ref-lint: ignore R1 names the path that must NOT exist; its absence is the guard (check:hooks) -->
  means re-opening that guard). Skill-relative is the cheaper candidate · needs:
  D-013.
- **codex-hooks-adapter** — decide whether the six hooks earn a Codex-native
  implementation. The payload shape is closer than expected (snake_case keys,
  `hookSpecificOutput.additionalContext` honoured, `${CLAUDE_PLUGIN_ROOT}` and an
  unprefixed `PLUGIN_ROOT` both exported), so the blocker is ownership and trust,
  not protocol translation · needs: D-013.
- **harness-neutral-model-runner** — the learning enricher, the eval harness and
  the unattended loop all spawn `claude` directly. A runner seam would let them
  target whichever CLI is hosting the session, and is the prerequisite for those
  three subsystems reaching any second harness · needs: D-013.
- **website-install-symmetry** — the website's Platforms cards and Install recipe are
  Claude-Code-shaped: give the Claude Code card its two-command form and add a
  Codex CLI skills-only block to the install section, so the site carries both
  install paths the README already documents.
- **host-neutral-skill-handoffs** — every cross-skill handoff is written in the
  slash form (`/<skill>`), which is Claude Code's spelling; Codex resolves the same skill as
  `arcforge:name` from the `$` picker and has no slash commands. Today one
  sentence in `using` maps the two, and whether an agent follows that mapping
  mid-workflow on Codex is unmeasured. A notation that reads correctly on both
  hosts without per-host branching (codex-harness B-7) would need
  `docs/decisions/skill-schema.md` §4.1/§5 reopened and both cross-reference
  parsers taught the new shape — a maintainer decision about a frozen contract,
  not a cleanup · needs: harness-neutral-model-runner.

## Learning

- **dashboard-rejections** — surface curator-rejected proposals
  (`rejections.jsonl`) in the review dashboard, so a user can see what the curator
  declined and why.
- ~~**gate-session-capture-depth**~~ — graduated into 6.1.0 (D-010).
- ~~**gate-diary-enricher**~~ — graduated into 6.1.0 (D-009).
- **stale-draft-floor-overlapping-opt-in** — `learningEnabledSince`
  (scripts/lib/learning.js) derives the floor only from scopes that are
- **stale-draft-floor-overlapping-opt-in** — `learningEnabledSince`
  (scripts/lib/learning.js:150) derives the floor only from scopes that are
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
  any-scope opt-in. Recorded as the accepted cost in D-009 for 6.1.0 · issue: [#164](https://github.com/GregoryHo/arcforge/issues/164).
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
- **cli-draft-path-redaction** — `learn drafts` and `learn inspect` print
  `draft_paths` verbatim while the dashboard's detail wire redacts the same
  path; draft files are named for the candidate, so a keyword-shaped name reaches
  the terminal through the path. B-9 says commands print the absolute path of
  anything they write, so this is a product call between the two promises, not
  a review fix.
- **project-keyspace-collision** — two project roots whose basenames sanitize to
  the same slug share one observation store, one instincts tree and therefore one
  candidate set; `learn --project` keys on that slug (D-012) because filtering on
  `scope.project_id` would hide candidates (the id is taken from whichever
  observation wrote first, or a name hash). Separating them is a keyspace
  decision (ICL-3 territory), not a CLI filter.

- **strand-free-candidate-names** — Layer 5 admits a candidate `name` that
  Layer 7 can never render (`schema.js` checks presence, type and length only;
  `materialize.js` refuses it with `path_policy_rejected`); decide
  reject-at-ingestion vs normalize-at-materialization, then close the
  `approve` + `materialize` stranding that the `accept` guard does not cover
  (D-012 residual).
## Product method
- **product-cli** — an `arcforge product check` command that verifies a
  project's own product state: dense monotonic decision ids, every
  `Supersedes:` paired with its status flip, spec headers agreeing with their
  roadmap rows, exactly one `← we are here` · needs: D-016.
- **speccing-spec-in-sync-eval** — a third `speccing` scenario for the
  mid-build case: a behavior item diverges while the code is being written, and
  the measured question is whether the spec moves in the same change or is left
  for later. Held back from 6.1.0 on ceiling risk — the two shipped scenarios
  spent the redesign budget — so it needs its own trap designed from a fresh
  baseline observation. The 6.1.0 pools say where to aim it: the baseline knows
  ADR discipline cold, and only bends when a user tells it to defer the ledger.
- **speccing-router-adjacency-eval** — the scenario that would actually measure
  D-014's accepted cost: one turn genuinely ambiguous between settling a design
  and recording a settled one, put in front of the router, scored on which of
  `brainstorming` / `speccing` it picks. 6.1.0 ships the adjacency unmeasured —
  `eval-router-skill-selection` asks a `tdd` vs `finishing` question and says
  nothing about this pair · needs: D-014.
- **eval-void-trial-detection** — the trial runner scores a provider refusal
  (`You've hit your session limit`, 0 tokens, a 72-byte transcript) as a real
  trial. The fixture's own files satisfy some assertions with no agent action,
  so an exhausted quota reads as a behavioral regression rather than an error
  trial excluded from the denominator, which the coverage rules already require.
  Cost one false REGRESSED verdict during 6.1.0.
- **check-product-spec-sections** — extend `check:product` with a rule asserting
  every `product/specs/*.md` carries the template's section headings (`Purpose`,
  `Scope`, `Behavior`, `Data / domain model`, `Decisions`), so the spec shape is
  a gate rather than a habit · needs: a decision refining D-006 (its recorded
  text enumerates seven rules).
- **speccing-a5-floor-executes-nothing** — `eval-speccing-spec-before-code`'s A5
  floor greps `src/exporter.js` for a quoted `csv` token instead of exercising
  the CSV branch, so a trial can pass the floor without the feature working; the
  repair is a grader-owned `node -e` probe of `formatFor('csv', run)` and must
  ride the next `## Version` bump + k=10 rerun of the scenario · issue: [#156](https://github.com/GregoryHo/arcforge/issues/156).
- **supersede-v6-preflight** — `eval-speccing-supersede-not-overwrite` ships at
  `## Version` 6 with no preflight ever scored under its current grader (the
  recorded BLOCK is the k=3 Version-3 sample); run one k=3 preflight under the
  Version-6 text so the ceiling claim rests on the shipped instrument · cost:
  three baseline trials.
