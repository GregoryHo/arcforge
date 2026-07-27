# arcforge v5.0.0 Redesign — Decision Record & Roadmap

Date: 2026-07-12
Status: decisions ratified by maintainer interview; implementation not started.
Source: multi-agent audit (10 agents: 2 reference-repo philosophy extractions,
4 skill-group audits covering all 32 skills, 1 hooks-enforcement audit,
1 coupling/blast-radius audit, 2 synthesis passes) + 8-question maintainer
interview. Raw findings archived in the session scratchpad
(proposal.json, hooks-audit.json, audit-table.txt, coupling.json, grill.json,
matt.json, ecc.json).

Reference repos studied: mattpocock/skills (lean pole: 22 promoted skills,
avg ~66 lines, max 140) and affaan-m/ECC (heavy pole: 700–950-line skills,
full hooks/rules/workflows stack).

Note: current release is v4.0.1, so this breaking change ships as **5.0.0**.

---

## Ratified decisions

### D1 — Audience: N=1

arcforge is a personal toolkit with public source. Consequences:

- **Hard break.** No shim/tombstone skills, no compatibility window, no
  deprecation ceremony. CHANGELOG carries an old→new name mapping table.
- Delete compat work that only protects hypothetical users.
- Sealed marketplace plugin distribution stays (it is the maintainer's own
  install path), but release ceremony is simplified where it only served
  external users.

### D2 — Identity: single plugin, SDD as a promoted category

Not "an SDD framework with utility skills", not a two-module split.
One plugin; the SDD pipeline is one promoted category that activates when
`specs/<id>/` exists (matching the existing self-gating hook doctrine).
This licenses a **two-speed line budget**: SDD/orchestration skills carry
legitimate engine contract (200–430 lines); catalog skills race toward
90–150.

### D3 — Platforms: Claude Code + Codex tier-1; Gemini/OpenCode removed

- Claude Code: first-class.
- Codex: **tier-1, spike-verified** (see Spike outcomes below): native
  recursive discovery via `~/.agents/skills/`, 5/5 headless invocation
  reliability, and `codex debug prompt-input` provides a deterministic,
  LLM-free way for CI to verify all skills are model-visible. Automation
  docs must pin `-m <model>` (a config default written by a newer Codex
  app makes bare `codex exec` fail with a 400 on older CLIs — observed).
- **Gemini and OpenCode: removed in v5.** Delete `.gemini/` and
  `.opencode/` (recoverable from git history if demand appears). Version
  sync shrinks from 10 files to ~6. Gemini's confirmed flat-only layout
  no longer vetoes physical category directories.

### D4 — Learning subsystem: keep, default-off, prove it ourselves

The learning/memory cluster (daemon, curator, dashboard, instincts) is the
project's one novel bet and is **not deleted**. Changes:

- Off by default (non-default module; explicit opt-in).
- Fix the mechanical costs regardless: `observe` fast-path exit before any
  requires when learning is disabled (currently 2 wasted node spawns per
  tool call); `session-tracker/end.js` moves `parseTranscript` behind the
  diary-threshold check so routine Stops are O(1).
- **Self-eval commitment**: design and run an A/B eval (sessions with vs
  without activated instincts) using the existing arc-evaluating
  infrastructure. We prove the subsystem's value ourselves rather than
  deferring the question. Scheduled as a v5.x follow-up with a written
  eval design.

### D5 — v5 success criterion: sample-based eval gate

Iron Law applies to v5 in sampled form:

- **Re-baseline the discipline skills** (the ~8 where prose provably
  changes behavior: arc-tdd, arc-debugging, arc-verifying, the merged
  arc-reviewing, arc-evaluating, arc-researching, arc-writing-skills)
  plus **both merged skills** (arc-reviewing, arc-learning), before tag.
- Workflow/glue skills are declared eval-exempt structural changes.
- **Honest exemption criterion** (required, or the exemption swallows
  everything): a change is eval-exempt only if every deleted line fails
  the no-op test (restatement, rationale essay, digraph duplicating
  prose, contributor-facing text) and no gate, iron rule, rationalization
  table, or exact command was reworded. Anything touching those re-runs
  its eval.
- `evals/benchmarks/latest.json` regenerates as the v5 baseline epoch for
  everything else.

### D6 — Skill pytest layer: structure-only

Replace the 32 literal-prose assertion files with structure checks:
frontmatter validity, `name` == dirname, required sections exist,
cross-references resolve (REQUIRED SUB-SKILL / BACKGROUND targets),
line budget enforcement (see D7). **No literal sentence assertions.**
Behavioral protection is the eval layer's job (per D5).
`scripts/lib/learning.js`'s test-file materializer updates to emit the
structure-only form.

### D7 — Line budget and content rules

- Soft cap **150** / hard cap **250** lines per SKILL.md, enforced by the
  structure-check pytest with a two-entry allowlist:
  arc-refining (300; CLI gate recipes are hard engine dependencies) and
  arc-finishing (430; worktree-safety git mechanics — tracked to shrink
  below 300 by extracting option mechanics into `scripts/finish-epic.js`).
- Every line above the soft cap must pass the **no-op test** ("does it
  change behavior versus the default?"); failing sentences are deleted
  whole.
- Depth goes to `references/*.md` behind worded context pointers
  (in-repo models: arc-dispatching-teammates, arc-evaluating,
  arc-maintaining-obsidian).
- Content classes cut repo-wide: rationale/"Why" essays (→ docs/guide
  pages), dot digraphs that restate adjacent prose, full-size inline
  examples where a template exists, contributor-facing text in shipped
  surface (→ `.claude/rules/` or `docs/plans/`).
- Survives every diet: ARCFORGE_ROOT fallback line (once per skill, in
  bash blocks — needed while any non-Claude platform lacks SessionStart),
  REQUIRED SUB-SKILL/BACKGROUND markers, exact CLI invocations, state
  formats parsed downstream, rationalization tables, phase gates.
- Catalog target: ~8,134 → ~5,200 lines across 30 skills (avg ~170).

### D8 — Description grammar: two registers

- **Model-invoked** (always in context): `<identity clause>. Use when
  <trigger branches>` — leading word front-loaded, one trigger per
  genuinely distinct branch, sibling-discriminator clause for confusable
  pairs, explicit reach clause when another skill invokes it.
  150–280 chars hard max.
- **User-invoked** (`disable-model-invocation: true`, zero per-turn
  context load): plain one-liner ≤120 chars, no trigger lists.
  Spike-verified semantics: description fully removed from model context
  AND the Skill tool hard-rejects model invocation ("cannot be used with
  Skill tool due to disable-model-invocation") even when hook-injected
  text directs it; slash invocation unaffected.
  **Rule: never flag a skill referenced by model-channel hook text.**
  v5 flags: arc-auditing-spec, arc-recalling, arc-writing-skills.
  arc-reflecting is DEFERRED — inject-context.js:252 emits "Run
  /arcforge:arc-reflecting" as a pending action; flag it only after that
  message is rerouted to the user channel (systemMessage). arc-journaling
  and arc-compacting stay model-invocable (hooks route the model to them
  by name). During the name sweep, reword arc-remind's Iron-Law nudges
  (main.js:173, :258) to direct action at running evals rather than at
  the arc-writing-skills skill name, so autopilot mode never dead-ends
  on a blocked invocation.
- The anti-pattern being eliminated: paying always-loaded description
  tokens to say "never auto-invoke me" (arc-auditing-spec's current
  254-char description).

---

## Catalog plan

### Taxonomy (frontmatter `category:` + README/docs organization; physical directories UNBLOCKED by the spike — see Spike outcomes)

| Category | Skills | Notes |
|---|---|---|
| sdd | arc-brainstorming, arc-refining, arc-planning, arc-writing-tasks, arc-executing-tasks, arc-implementing, arc-finishing, arc-auditing-spec | produces/consumes `specs/<id>` artifacts; sequential handoff |
| orchestration | arc-agent-driven, arc-coordinating, arc-dispatching-parallel, arc-dispatching-teammates, arc-looping, arc-using-worktrees | dispatches subagents / manages worktree+loop state; higher line floor |
| discipline | arc-tdd, arc-debugging, arc-verifying, **arc-reviewing** (merged), arc-researching | condition-triggered quality gates |
| memory | arc-journaling, arc-reflecting, **arc-learning** (absorbs arc-observing), arc-recalling, arc-managing-sessions, arc-compacting | session continuity + learning; default-off module per D4 |
| knowledge | arc-maintaining-obsidian, arc-diagramming-obsidian | most tech-stack-shaped corner; first demotion candidate |
| meta | arc-using, arc-writing-skills, arc-evaluating | operates on the catalog itself; arc-using carries the router-lies invariant (re-sync on every add/rename/remove) |

Lifecycle: promoted / incubating / deprecated. Non-promoted skills are
excluded from `package.json` `files[]` and do not ship.

### Merges (2)

1. `arc-requesting-review + arc-receiving-review → arc-reviewing`
   (167 → ~140 lines; one request→receive loop).
2. `arc-observing → arc-learning` (265 → ~170 lines; one subsystem, one
   door). Runtime couplings to update in the same PR:
   `skills/arc-observing/scripts/{observer-daemon.sh,observer-prompt.md}`
   relocate; `hooks/session-tracker/start.js:83`,
   `hooks/observe/main.js:364`,
   `scripts/lib/learning-curator/batch-assembler.js:358`,
   `package.json` `test:observer-daemon`, inject-context's
   `/arcforge:arc-observing` literal. Hooks silent-catch: these break
   silently if missed — grep-verify every `../../skills/` path.

Rejected merges (audited, kept separate): arc-implementing↛arc-coordinating
(legitimate seam), arc-compacting↛arc-managing-sessions (hooks reference it
by name; already at benchmark size).

### Per-skill diet targets

From the audit (verdicts: 6 lean / 14 acceptable / 12 bloated; no outright
cuts — every skill's core value held up):

360→220 arc-brainstorming · 454→300 arc-refining · 260→200 arc-planning ·
151→115 arc-writing-tasks · 196→140 arc-executing-tasks ·
144→85 arc-implementing · 618→430 arc-finishing · 337→260 arc-auditing-spec ·
306→160 arc-agent-driven · 118→90 arc-coordinating ·
338→140 arc-dispatching-parallel · 301→185 arc-looping ·
161→120 arc-using-worktrees · 160→115 arc-using · 413→180 arc-tdd ·
296→220 arc-debugging · 172→110 arc-verifying · 186→160 arc-evaluating ·
202→185 arc-researching · 675→310 arc-writing-skills ·
312→150 arc-journaling · 416→180 arc-reflecting ·
241→150 arc-managing-sessions · 320→220 arc-diagramming-obsidian.
Keep as-is: arc-dispatching-teammates (141), arc-compacting (89),
arc-recalling (82, the group's model), arc-maintaining-obsidian (168).
Untouchable content flagged per skill in the audit (e.g. all of
arc-finishing's worktree-safety git mechanics; arc-tdd's Iron Law +
rationalization table).

---

## Hooks plan ("fewer processes, selective denies")

**Maintainer clarification (2026-07-12): hard limits are not a goal in
themselves.** Prompt/skill prose is ICL and remains the primary steering
layer. A hook graduates to a hard deny only where all three hold:
(a) the invariant is mechanically decidable by static inspection of the
command/content, (b) violation is costly or hard to reverse, and
(c) false-positive risk is near zero inside the self-gated context.
dag-guard, secrets-guard, and the bypass closures meet this bar; the
autopilot-only promotions meet it because an unattended loop has no reader
for advisory text. Anything below the bar stays advisory or unshipped —
"fewer processes" is unconditional, "more denies" is selective.

Audit verdict: the hard-limit thesis is ~25% true today. The three existing
hard guards (arc-guard, sdd-ledger-guard, sdd-ratify-guard) are excellently
engineered — self-gating, fail-open, resulting-content validation, engine-side
primary gate + hook echo, tested no-op invariant. **That deny doctrine is
kept verbatim for everything new.** But they cover only three niche
invariants, while a typical Edit spawns ~7 node processes (5 sync) of which
only 2 can block. The cost is latency/CPU, not tokens (channel discipline is
already good).

1. **Consolidate 13 registrations → ~6**: one PreToolUse guard dispatcher
   (arc-guard + sdd-ledger-guard + sdd-ratify-guard + new guards) and one
   PostToolUse dispatcher (quality-check accumulator + arc-remind +
   compact-suggester counter + observe post), plus SessionStart,
   UserPromptSubmit, Stop, PreCompact. Fail-open wrapper moves to
   dispatcher level.
2. **New hard guard — dag-guard**: dag.yaml currently has zero protection
   (an agent can flip pending→completed or delete dependencies). Clone
   sdd-ledger-guard's resulting-content diff: deny illegal TaskStatus
   transitions (completed is monotonic) and dependency deletion. Pair with
   an engine-side check (loop.js / finish-epic.js) since PreToolUse denies
   are void under --dangerously-skip-permissions.
3. **New hard guard — secrets-guard**: regex scan of Write/Edit content and
   `git commit` commands for key/token patterns. Warn-first with a
   test-credential allowlist; flip to deny in 5.x after false-positive
   burn-in.
4. **Autopilot-only promotions** (gate on loopSentinelPresent): deny
   `gh pr merge`/`git push` when no test was observed at a PR boundary or
   when `evals/benchmarks/latest.json` is older than the SKILL.md edit —
   arc-remind already computes both predicates and merely prints them.
   Attended mode keeps nudge-only behavior.
5. **Close known bypasses**: extend GIT_MERGE_RE to `git -C <path> merge` /
   `git --git-dir … merge` (resolving the -C target for marker checks);
   Bash-side deny for redirects/`sed -i`/`tee` targeting decisions.yml,
   dag.yaml, research-config.md inside their gated contexts.
6. **quality-check → Stop-time batching** (ECC pattern): accumulate edited
   paths, run prettier + tsc once at Stop instead of per-edit (currently up
   to 2× 30s-timeout tsc per Edit).
7. **Kill compact-suggester as a standalone sync `.*` hook** (worst
   cost/value in the audit); its shared diary counter and suggestion emit
   fold into the post dispatcher.
8. **observe / end.js perf fixes** per D4.
9. **Operability** (from ECC): hooks.json JSON-schema + CI validation,
   stable `id` + description per entry, blocking-vs-advisory doc table,
   `ARCFORGE_DISABLED_HOOKS` env var for per-id disablement.
10. Deferred past 5.0 (false-positive-prone; prototype behind a strict
    profile first): Stop-hook completion-claim gate; scoped TDD write-gate
    inside epic worktrees.

---

## Breaking changes (v5.0.0 changelog skeleton)

1. Skills removed by merge: arc-receiving-review, arc-observing.
2. Skill renamed: arc-requesting-review → arc-reviewing.
3. Four skills become user-invoked only (disable-model-invocation):
   arc-auditing-spec, arc-recalling, arc-reflecting, arc-writing-skills.
4. All descriptions rewritten to the two-register grammar; routing behavior
   may shift.
5. All surviving SKILL.md bodies restructured (~8,134 → ~5,200 lines);
   depth moves to `references/*.md`.
6. hooks.json restructured to dispatcher entries with stable ids; new env
   control plane ARCFORGE_DISABLED_HOOKS.
7. New hard denies: dag.yaml illegal transitions; Bash redirects to gated
   ledger files; `git -C` merge bypass closed; autopilot-mode
   no-test/stale-eval push denies; secrets warn (deny in 5.x).
8. quality-check no longer formats/typechecks per edit (batched at Stop).
9. Learning subsystem default-off.
10. Gemini and OpenCode support removed (`.gemini/`, `.opencode/` deleted).
11. Skill pytest layer replaced with structure-only checks + line budget.
12. New frontmatter: `category`, lifecycle status; non-promoted skills do
    not ship.
13. Eval baselines: discipline skills + merged skills re-baselined; the
    rest declared a new baseline epoch.
14. No shims, no aliases: old slash commands stop resolving; CHANGELOG
    carries the old→new mapping table.

---

## Spike outcomes (2026-07-12) — empirical, ADR-style

Run as three parallel agents executing real `claude -p` / `codex exec`
fixtures (Claude Code CLI 2.1.207, Codex CLI 0.133.0). Raw evidence in the
session scratchpad under `spike/`.

**ADR-S1 — Claude Code plugin loader is NOT recursive; category dirs work
via plugin.json enumeration.** The default loader scans only
`skills/<name>/SKILL.md` (a 2-skill fixture with one nested skill logged
"Loaded 1 skills"; slash + autotrigger both failed for the nested one).
Adding the component-path field `"skills": ["./skills/<cat>", ...]` to
`plugin.json` registers each category dir as a scan root, after which
slash and autotrigger both work end-to-end. The namespace stays FLAT
(`/arcforge:arc-foo` — the category segment never appears), so a physical
move is invisible to users. Consequences: plugin.json must enumerate every
category dir, kept in sync by a lint step; skill names must stay globally
unique across categories. (Side note: the "recursive skill discovery"
folklore holds for `~/.claude/skills` / `.claude/skills` at best — it is
empirically false for the plugin loader on 2.1.207.)

**ADR-S2 — disable-model-invocation is a hard, two-layer block.** The
flagged skill's description is absent from model context (zero per-turn
tax, confirmed), autotrigger cannot occur, slash invocation works, and a
directed Skill-tool call is rejected by the harness itself ("Skill …
cannot be used with Skill tool due to disable-model-invocation") even when
trusted injected text (faithful simulation of hook additionalContext)
orders the invocation. Therefore hook-driven routing to a flagged skill
BREAKS structurally → the flag list excludes every skill named in
model-channel hook text (see D8: arc-reflecting deferred).

**ADR-S3 — Codex is tier-1.** Discovery through `~/.agents/skills/` is
recursive to at least depth 3: a nested fixture was listed in
`codex debug prompt-input` (deterministic ground truth, usable in CI),
explicitly invocable, and auto-triggered from its description; 5/5
headless runs succeeded. Constraints: category layout adds no namespace
on Codex either (frontmatter `name` is the only key — global uniqueness
required); automation must pin `-m <supported-model>`. Unverified residue:
whether the `arcforge:` prefix (which comes from the symlink dir name)
survives for category-nested skills under the symlink — retest with a
symlinked fixture before relying on the prefix. Env note: the local
`~/.agents/arcforge` clone is stale (Apr 23) and should be updated or
re-pointed for meaningful Codex testing.

**Net effect on the plan**: physical category directories are feasible on
both tier-1 platforms and user-invisible (flat namespace on both). They
remain a separable PR: frontmatter `category:` lands first (step 9), the
physical move happens after the name sweep, carrying the plugin.json
enumeration + lint, the known flat-path updates (pytest iterdir,
check-doc-refs, learning.js, hooks `../../skills/<name>/` paths incl.
end.js:76, eval Target lines), and a `codex debug prompt-input` CI check.

## Roadmap (ordered)

1. ~~Spike~~ **DONE** — see Spike outcomes above.
2. **Platform removal PR**: delete `.gemini/`, `.opencode/`; shrink
   version-sync file set and `scripts/check-version-sync.js`; update
   README/docs platform tables.
3. **Hook consolidation PR** (behavior-preserving): two dispatchers,
   Stop-time quality batching, observe fast-path, end.js O(1) common Stop,
   hooks.json schema + CI validation, stable ids, doc table.
4. **New guards PR(s)**: dag-guard, secrets-guard (warn mode), arc-guard
   bypass closures, autopilot denies — each with engine-side twin and
   no-op-invariant tests.
5. **Merges** (one atomic PR each): arc-reviewing; arc-learning (with the
   full runtime-coupling checklist above).
6. **Name-graph sweep**: arc-using router table (+ router-lies invariant),
   handoff mentions across ~30 SKILL.md files, hook nudge strings
   (arc-remind main.js:146-173, arc-guard :62/:72/:144, inject-context
   slash literals), agents/arc-auditing-spec-*.md,
   docs/guide/skills-reference.md, README. Gates: `npm run check:docs`,
   cross-reference pytest, full suite.
7. **Pytest conversion**: replace the 32 prose-assertion files with the
   structure-only checker + line-budget allowlist; update learning.js's
   materializer.
8. **Body diets**: one category per PR, per the targets above; create
   `references/*.md` for disclosed depth.
9. **Descriptions + frontmatter**: two-register rewrite, invocation flags
   (per spike), category/status fields; rebuild skills index README by
   category and register; move rationale prose to docs/guide pages.
10. **Eval re-baseline** (per D5): discipline + merged skills first;
    retarget/retire scenario files (eval-command.js:333 errors on dangling
    targets); regenerate `evals/benchmarks/latest.json` as the v5 epoch.
11. **Docs/knowledge sync**: CHANGELOG from the list above with the
    old→new table; re-ingest the Obsidian wiki (skills are in scope and
    will drift).
12. **Release 5.0.0**: reduced-file version sync, tag, marketplace
    propagation.
13. **5.x follow-ups**: secrets-guard warn→deny flip; arc-finishing →
    `scripts/finish-epic.js` extraction (430→<300); physical category
    directories (spike PASSED — user-invisible on both tier-1 platforms,
    so it needs no breaking window; execute per ADR-S1/S3: plugin.json
    enumeration + lint, flat-path updates, codex debug prompt-input CI
    check); arc-reflecting DMI flag after rerouting inject-context's
    reflect message to the user channel; learning subsystem A/B self-eval
    (design doc first); deferred completion-claim / TDD write gates behind
    a strict profile.
