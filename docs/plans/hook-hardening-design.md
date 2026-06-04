# Hook Hardening Design — moving select skill intents from ICL to deterministic hooks

**Status:** Tier 1 + Tier 2 (first slice) implemented. Contributor-facing design note (not shipped).
**Date:** 2026-06-04

## Problem

Most arcforge skill "gates" are enforced purely by in-context-learning (ICL):
prose in a `SKILL.md` that only shapes behavior if the skill happens to be
loaded, and which the model can silently skip. A survey of all 33 skills + all
10 hooks confirmed:

- **The hook layer is 100% advisory/observational today.** No hook blocks; no
  hook reads epic/DAG state. The block-capable helpers (`outputDecision`, exit 2)
  exist in `scripts/lib/utils.js` but are used by zero hooks.
- Every skill gate is either pure prose or a self-invoked CLI check the agent
  bypasses by ignoring the skill.

The goal: move the gates that have a **precise mechanical discriminator** into
hooks, as either a hard block ("hard limit") or a deterministic reminder.

## Framework: tier = discriminator precision, not event capability

Whether a hook event *can* block (PreToolUse / Stop / UserPromptSubmit can;
PostToolUse / PreCompact / SessionStart cannot) is the easy part. The hard part
is whether a mechanical signal exists that is precise enough to act on without
catching legitimate work. That precision assigns the tier:

- **Tier 1 — hard block.** A discrete deterministic event with a signal ⇔
  violation discriminator and near-zero legitimate collision.
- **Tier 2 — deterministic reminder.** Deterministic trigger, but the violation
  is probabilistic — nudge, never block.
- **Tier 3 — stays ICL.** Semantic gate, no mechanical proxy. Inventing a proxy
  is worse than nothing (false blocks train the model and user to bypass).

### Two cross-cutting constraints

1. **No "skill-active sentinel."** A global hook cannot tell which skill is in
   play. So any *per-skill discipline* gate (read-only audits, mutation rules,
   "do X before Y within this skill") cannot be scoped by a global hook — it
   would fire everywhere. Only gates tied to a globally-meaningful discrete event
   are hookable: a git command, a specific CLI invocation, a write to a canonical
   path, or the `.arcforge-epic` marker. Per-skill read-only discipline belongs
   in subagent `allowed-tools` frontmatter (as `arc-auditing-spec` already does),
   not a hook.

2. **No-op-without-arcforge-context is existential, not nice-to-have.** Hooks
   ship to every user. A blocking hook that misfires on a project that isn't
   mid-epic makes the user disable arcforge hooks wholesale — you lose all of
   them, not one. Every blocking hook must be provably inert when there is no
   `.arcforge-epic` marker and no `specs/*/dag.yaml`, and that inertness must be
   a tested invariant. (All 10 existing hooks already no-op gracefully, but none
   *block* — the first blocking hook is the first whose false-positive actively
   harms a user.)

## Survey results (full skill × hook map)

### Tier 1 — hard-block candidates

| Candidate | Discriminator | Disposition |
|-----------|---------------|-------------|
| Worktree phase guard: raw `git merge` inside a worktree | `.arcforge-epic` present + `git merge` | **BUILT** (`arc-guard` G2) |
| Worktree phase guard: loop inside a worktree | `.arcforge-epic` present + loop invocation | **BUILT** (`arc-guard` G3) |
| Direct `git worktree add` (bypass `arcforge expand`) | literal `git worktree add` in an arcforge project (`specs/`) | **BUILT as a NUDGE** (`arc-remind`) — not a block: a base session may legitimately open a non-epic worktree (e.g. PR review), so a hard block would false-positive |
| `arc-finishing` ↔ `arc-finishing-epic` routing | marker present/absent | Collapses into G2 — blocking raw `git merge` inside a worktree *is* the routing redirect |
| `arc-researching` config immutability | `research-config.md` exists + edit targets it | **BUILT** (`arc-guard` R-immutable) — the locked judge must not be edited mid-loop; near-zero false-positive (file written only at Step-4 lock) |
| `arc-researching` scope fence | `research-config.md` CANNOT paths | **BUILT, conservatively** (`arc-guard` R-scope) — blocks only CANNOT entries that resolve to an **existing** file/dir; free-form prose / globs are skipped (a missed fence is recoverable; a false block mid-loop is not) |
| `arc-writing-skills` eval-before-ship | commit/push after a SKILL.md edit | **BUILT — BOTH** a shippable plugin nudge (`arc-remind`, once/session) AND a non-blocking CI annotation (`ci.yml`). Not a hard gate: the metadata-only carve-out means no precise per-PR signal |
| `arc-releasing` benchmark-freshness | `benchmarks/latest.json` `.generated` vs prev tag | **BUILT — CI only** (`release.yml`, scoped hard-fail). arc-releasing is contributor-only *by its own design* — so this stays in CI, not the shipped plugin |

### Tier 2 — deterministic reminders

| Candidate | Discriminator | Disposition |
|-----------|---------------|-------------|
| `arc-verifying` + `arc-requesting-review` at completion | `gh pr create` / `gh pr merge` | **BUILT** (`arc-remind`, one PR-boundary reminder; tracks test-seen this session) |
| `arc-tdd` production-edit-before-test | edit w/o preceding failing test | Deferred — refactor (explicitly blessed by arc-tdd) is indistinguishable; reminder-only at best |
| `arc-evaluating` SKILL edit w/o eval | SKILL.md edit w/o fresh benchmark | Deferred — metadata-only carve-out collides |
| edit on `main`/`master` (no arcforge setup) | first **code** edit on main/master, once/session | **BUILT** (`arc-remind`, project-general). NB: an earlier "active DAG + on main" scope was rejected as *anti-correlated* with intent — the worktree runs on the epic branch, so an edit-on-main session is the base/coordinator (legitimately editing main with an active DAG), while the real "implementing on main with no setup" case has *no* DAG yet. The shipped version drops the DAG condition: first code (non-doc) edit to main/master, once/session, on any project. |

### Tier 3 — stays ICL (do not hook)

`arc-debugging` (root-cause leaves no trace), `arc-receiving-review` (forbidden-
phrase regex is unblockable pre-send and over-matches genuine agreement),
`arc-dispatching-parallel` (task independence is semantic), `arc-brainstorming`
explore-first, `arc-refining` R3 no-invention, `arc-writing-tasks` bite-sized,
and **`arc-using`** (deliberately non-enforceable — "skills are tools, not laws";
a forcing hook contradicts its philosophy).

### Already enforced — not ICL gaps (do not rebuild)

- `arc-releasing` version-sync: `check:versions` + CI.
- `arc-observing` / `arc-learning`: core gates enforced by daemon/CLI
  architecture, not prose.
- `arc-auditing-spec` / `arc-maintaining-obsidian` mutation discipline:
  subagent `allowed-tools` frontmatter is the mechanism, not a hook.

### Partially covered by existing hooks

- `arc-compacting` ← `compact-suggester` (tool-count + read/write ratio; can't
  block, phase-boundary semantics uncovered).
- `arc-journaling` ← `pre-compact` (auto diary-draft; can't block).

## What was built

Two plugin hooks + a canonical-source extraction + two CI gates. Each hook
dispatches by tool (`Bash`, `Edit`, `Write`) and emits at most one outcome per
call; the fast no-op path (no marker / no `research-config.md`) is a single
`existsSync`, so the PreToolUse hot-path cost stays low. Both hooks are registered
under separate `tool == "Bash"/"Edit"/"Write"` matcher groups — proven matcher
grammar (`quality-check` uses `tool == "Edit"`), avoiding an untestable `||`.

### `scripts/lib/marker.js` (new)

Extracted `readArcforgeMarker` out of `coordinator.js` into a lightweight module
(`MARKER_FILENAME`, `markerPath`, `hasArcforgeMarker`, `readArcforgeMarker`) so a
hot-path hook can check the marker without `require`-ing the ~1000-line
coordinator + its YAML parser. `coordinator.js` re-imports and re-exports it, so
`cli.js`'s existing import is unaffected. `hasArcforgeMarker` is a cheap
`fs.existsSync`; YAML parse happens only on the deny path.

### `hooks/arc-guard/main.js` (PreToolUse, BLOCKING, synchronous)

Hard blocks via `{ hookSpecificOutput: { permissionDecision: 'deny',
permissionDecisionReason } }`, exit 0. Fail-open on any error.

- **Bash, gated by `.arcforge-epic` in cwd** — **G2** raw `git merge` (excl.
  `git merge-base` and `--abort/--continue/--quit` via lookahead) → redirect to
  the `finish-epic.js` flow; **G3** arcforge loop invocation → redirect to base.
- **Edit/Write, gated by `research-config.md` in cwd** — **R-immutable** editing
  the locked contract → deny (names the human-approved unlock escape);
  **R-scope** editing a CANNOT-modify path that resolves to an existing file/dir
  → deny. Prose/glob CANNOT entries are skipped (conservative).

### `hooks/arc-remind/main.js` (PostToolUse, NON-BLOCKING)

User-facing `systemMessage` nudges (intentionally to the user, not Claude — these
are human-in-the-loop). Per-session counters keep them rare/context-aware.

- **PR boundary** (`gh pr create`/`merge`) → verify (arc-verifying) + review
  (arc-requesting-review), noting whether a test ran this session.
- **`git worktree add`** in an arcforge project → prefer `arcforge expand` for
  epic worktrees.
- **`git commit`/`push` after a SKILL.md edit**, once/session → re-run the eval
  (arc-writing-skills Iron Law) — the shippable, user-facing eval-before-ship gate.
- **First code (non-doc) edit on `main`/`master`**, once/session → prefer a branch
  or epic worktree for feature work (arc-executing-tasks). Project-general — no DAG
  condition (that signal is anti-correlated with intent; see the Tier-2 table).

### CI gates

- `scripts/check-benchmark-freshness.js` + step in `release.yml` — scoped hard-fail
  if eval-backed surface changed since the previous tag but
  `evals/benchmarks/latest.json` `.generated` is not newer. First-release and
  doc-only releases pass. Contributor-only by arc-releasing's own design.
- `scripts/check-skill-eval-annotation.js` + PR job in `ci.yml` — non-blocking
  GitHub `::warning::` when a PR changes a `skills/*/SKILL.md` without a matching
  eval/test/benchmark update. Non-blocking because the metadata-only carve-out
  means there is no precise per-PR signal; the deterministic user-facing
  enforcement is the arc-remind nudge above.

### Tests

`hooks/__tests__/arc-guard.test.js`, `arc-remind.test.js`, and
`tests/scripts/check-ci-gates.test.js` exercise the pure cores (export pure
functions, assert directly). Key cases: the **no-op invariants** (no marker /
no research-config → never denies), the **`git merge-base` & conflict-recovery
false-positive guards**, **`loop.js`-as-a-file-arg** (read vs run), the
**CANNOT-path prose-skip**, and a **wire-format e2e** (subprocess stdin→stdout
asserting the real `permissionDecision: 'deny'` JSON — the one thing the pure-core
tests can't cover).

> Live blocking cannot be verified in this repo — the arcforge plugin is disabled
> here (`arcforge@arcforge-dev: false`). The unit tests piping crafted stdin are
> the sufficient, correct verification; a live end-to-end check needs
> `claude --plugin-dir .` and is out of scope for the build.

## Design rules for future hardening hooks

1. Assign the tier by discriminator precision, not by whether the event can block.
2. A blocking hook must be provably inert without arcforge context — as a tested
   invariant. False-positive on the block path is the expensive direction.
3. Per-skill discipline (read-only, "do X before Y within a skill") is not
   hookable globally — use subagent `allowed-tools`.
4. Reminders are still ICL — but *deterministically triggered* ICL whose value is
   that they fire even when the skill was never loaded. Keep them rare and
   anchored to discrete, high-signal events.
5. Keep command patterns conservative; prefer a missed block (safe) over a false
   block (expensive).
