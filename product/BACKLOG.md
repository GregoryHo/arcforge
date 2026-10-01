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
- ~~**website-install-symmetry**~~ — graduated into 6.1.2 (D-019).
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

- ~~**dashboard-rejections**~~ — graduated into 6.2.0 (D-020).
- ~~**gate-session-capture-depth**~~ — graduated into 6.1.0 (D-010).
- ~~**gate-diary-enricher**~~ — graduated into 6.1.0 (D-009).
- ~~**stale-draft-floor-overlapping-opt-in**~~ — graduated into 6.2.0 (D-020).
- ~~**learn-enable-erases-config**~~ — graduated into 6.1.1 (D-018).

- ~~**unify-candidate-queues**~~ — graduated into 6.1.0 (D-012).
- **bound-transcript-parse** — `parseTranscript` reads and splits the whole
  session transcript on every above-threshold Stop and PreCompact even though
  every output it returns is a capped tail (about 5 ms per MB on real transcripts);
  bound the read, and correct the hooks spec's B-7 cost enumeration, which already
  omits this parse and the diary subprocess · issue: [#172](https://github.com/GregoryHo/arcforge/issues/172).
- ~~**stale-probe-window-vs-rendered-paths**~~ — graduated into 6.1.2 (D-019).
- ~~**dashboard-activation-ack**~~ — graduated into 6.1.1 (D-018).
- ~~**cli-draft-path-redaction**~~ — graduated into 6.2.0 (D-035).
- **project-keyspace-collision** — two project roots whose basenames sanitize to
  the same slug share one observation store, one instincts tree and therefore one
  candidate set; `learn --project` keys on that slug (D-012) because filtering on
  `scope.project_id` would hide candidates (the id is taken from whichever
  observation wrote first, or a name hash). Separating them is a keyspace
  decision (ICL-3 territory), not a CLI filter.

- ~~**strand-free-candidate-names**~~ — graduated into 6.2.0 (D-035).
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
- ~~**eval-void-trial-detection**~~ — graduated into 6.1.1 (D-018).
- ~~**check-product-spec-sections**~~ — graduated into 6.1.2 (D-033).
- ~~**speccing-a5-floor-executes-nothing**~~ — graduated into 6.2.0 (D-043).
- ~~**supersede-v7-preflight**~~ — graduated into 6.2.0 (D-020).
- **eval-trial-sandbox** — trial isolation is advice in the prompt, not an
  enforced boundary, and a `--plugin-dir` trial does not get even the advice: in
  one diagramming rerun all five treatment trials left the trial directory and
  one edited a shipped file. Enforce the boundary rather than advise it.
- **plugin-eval-corpus-migration** — move more routing scenarios onto
  `claude plugin eval` once D-025's isolation check has run and the feature
  leaves `experimental` · needs: D-025.
- **redesign-executing-verify-decides-done** — redesign `eval-executing-verify-decides-done` for the clean instrument · needs: D-045.
- **redesign-router-skill-selection** — redesign `eval-router-skill-selection` for the clean instrument · needs: D-045.
- **redesign-maintaining-obsidian-audit-runs-lint-script** — redesign `eval-maintaining-obsidian-audit-runs-lint-script` for the clean instrument · needs: D-045.
- **redesign-maintaining-obsidian-link-rebuilds-index** — redesign `eval-maintaining-obsidian-link-rebuilds-index` for the clean instrument · needs: D-045.

## Hooks

- **secrets-guard-staged-scan** — scan the content a `git commit` stages, not
  only the command string, measuring what reading the index costs on the
  synchronous hook path first · needs: D-029.
- **session-continuity-injection** — have SessionStart carry over where the last
  session left off from the durable session record, the promise hooks B-8 made
  and no hook kept · needs: D-031.

## Obsidian

- **diagramming-headless-fallback** — give the diagramming references a headless
  fallback for when no renderer can run, the gap left open since 6.0.0 alongside
  the A4 hunting incentive; a skill edit, so it needs eval evidence.
