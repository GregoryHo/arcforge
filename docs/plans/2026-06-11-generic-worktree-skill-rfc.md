# RFC: arc-using-worktrees → generic two-tier worktree skill

Status: Proposed. Overrides blueprint item 1.7 ("merge into arc-coordinating") per owner directive. Builds on verified facts from /tmp/arcforge-audit-items.json (broken `${SKILL_ROOT}/scripts/coordinator.js` path — skill ships no scripts/; stale `-b <epic-id>` branch claim vs engine's `<spec-id>/<epic-id>` via `getEpicBranchName`) and /tmp/arcforge-goal-analyses.json goal-1 (18 broken `status --json` path references; binding conflict resolution: bless `node "${ARCFORGE_ROOT}/scripts/cli.js"` as the one invocation convention).

---

## 1. Chosen architecture (one recommendation)

**A small CLI subcommand group (`arcforge worktree add|list|remove`) backed by a new zero-dependency lib module, plus a rewritten two-tier SKILL.md that detects context and routes.** Not prose-only git commands, for three load-bearing reasons:

1. **The never-hardcode-paths rule makes prose impossible to do correctly.** Canonical paths come from `worktree-paths.js` at runtime; prose `git worktree add` either hardcodes a path (forbidden) or shells into `node -e` anyway. A subcommand is the honest shape.
2. **Hooks see Bash command text.** Routing adds through `node .../cli.js worktree add` means arc-remind's `WORKTREE_ADD_RE` (`/\bgit\s+worktree\s+add\b/`, main.js:43) and the planned arc-guard G4 rule never match generic-tier operations — the seams resolve by construction, with zero gating logic added to hooks.
3. **North star:** the human reviews; the toolkit produces. A deterministic CLI with JSON output is reviewable production; prose git is improvisation.

**Path derivation for generic (non-epic) worktrees — reuse, don't invent:** `getWorktreePath(projectRoot, /*specId=*/null, slug)` already produces `~/.arcforge/worktrees/<project>-<hash6(projectRoot)>-<slug>/` (the documented legacy-null hash branch, worktree-paths.js:55-65). Verified consequences, all benign:
- `parseWorktreePath()` recognizes generic worktrees as managed → `_findBaseWorktree()` (coordinator-core.js:381-395) correctly skips them as base candidates.
- `_syncBase()` scans only `epic.worktree` entries from dag.yaml (coordinator-worktree-ops.js:415-425) → generic worktrees are invisible to sync. No coordinator change needed.
- Null-spec hash ≠ spec-scoped hash → no collision with current epic worktrees even for identical names.

**No new marker file.** Discrimination is: managed path (`parseWorktreePath !== null`) × epic marker (`hasArcforgeMarker`). Generic = managed ∧ ¬marker; external = ¬managed. `finish` defaults derive from git itself (base = first non-managed entry in `git worktree list --porcelain`; target branch = its HEAD). Avoids a second marker schema and keeps file-based state minimal.

**"Finish" in generic tier = handoff, not duplication.** The skill routes to the existing 4-option gate: `.arcforge-epic` present → arc-finishing-epic (coordinator merge; arc-guard G2 enforces); absent → arc-finishing (merge locally / push+PR / keep / discard with typed confirm), whose Step 5 cleanup becomes `arcforge worktree remove`. The twin-skill drift history (#59) is exactly why the 4-option prompt must not be copied a third time; this stays compatible with blueprint wave 6.1 (finishing-twin merge) — after 6.1 the handoff target collapses to one skill, no change to this RFC.

**Composition tier = pointer, not parallel documentation.** Epic expansion is one short subsection delegating to `node "${ARCFORGE_ROOT}/scripts/cli.js" expand --epic <id> --project-setup` (the blessed convention), with full lifecycle semantics owned solely by arc-coordinating. This kills the confirmed drift pair (two skills re-documenting expand) by a different route than merging — satisfying the blueprint's drift-class rationale while honoring the override.

### Detection + handoff contract (precise)

Evaluated top-down at skill entry; first match wins:

| # | Signal (verifiable) | Route |
|---|---|---|
| 1 | `.arcforge-epic` exists in cwd | Already inside an epic worktree. Never create nested worktrees. Work → arc-implementing; integration → arc-finishing-epic. Raw `git merge` here is denied by arc-guard G2 — the skill must say so, not fight it. |
| 2 | `specs/<spec-id>/dag.yaml` exists AND the requested work matches an epic id in it | Composition tier: `arcforge expand --epic <id> --project-setup`; read absolute `path` from JSON (verified emitted at cli.js:481). Marker + DAG bookkeeping owned by the engine. |
| 3 | dag.yaml exists but work is NOT an epic (experiment, hotfix, review checkout) | Generic tier is legitimate inside an arcforge project — flexibility requirement. `arcforge worktree add`. |
| 4 | No arcforge state at all | Generic tier. Full value standalone. |

User-stated constraints override (e.g. explicit custom path → honor it via raw git; `worktree list` still shows it, annotated `external`).

---

## 2. SKILL.md outline (rewritten `skills/arc-using-worktrees/SKILL.md`)

Name kept (`arc-using-worktrees` — preserves the `arc-using-<tool>` naming convention cited in arc-writing-skills and most inbound references). ~150 lines, Standard tier.

```
---
name: arc-using-worktrees
description: Use when work needs an isolated workspace — a parallel branch,
  an experiment, a review checkout, or scoping to one epic — in ANY git repo,
  even if the user never says "worktree". Epic context auto-escalates to the
  coordinator; everything else uses the generic worktree CLI.
---
# arc-using-worktrees
## Which Tier Am I In?            ← the 4-row detection table above, verbatim rules
## Generic Tier (any git repo, zero arcforge state)
   - Invocation header: : "${ARCFORGE_ROOT:?...}" + node "${ARCFORGE_ROOT}/scripts/cli.js"
   - add:    arcforge worktree add <name> [--branch <b>] [--from <ref>] [--setup]
             → read `path` from JSON output; never reconstruct
   - list:   arcforge worktree list --json   ← the generic status surface
   - switch: cd to the `path` field from list/add JSON
   - remove: arcforge worktree remove <name> [--force]
   - Conventions: branch defaults to <name>; existing branch is checked out,
     missing branch created from --from (default: base HEAD); dirty worktree
     refuses removal without --force
## Composition Tier (epic context present)
   - One subsection: delegate to `arcforge expand --epic <id> --project-setup`;
     branch is `<spec-id>/<epic-id>` (engine-derived — fixes the stale -b claim);
     full lifecycle (batch expand/merge/sync/cleanup) → arc-coordinating
## Finishing (both tiers)
   - .arcforge-epic present → /arc-finishing-epic (coordinator merge; G2 enforces)
   - absent → /arc-finishing (4-option gate); cleanup via arcforge worktree remove
## Red Flags (carried over + generalized)
   1. "I'll git worktree add directly" → CLI derives the canonical path; raw git
      loses list/remove/finish coherence (and in epic context breaks marker+DAG)
   2. "I'll put it somewhere convenient like ./worktrees/" → canonical derivation only
   3. "I'll hardcode ~/.arcforge/worktrees/... in output" → read JSON `path`
   4. "It's epic work but expand refused" → the refusal is correct; report blocked
   5. "The CLI failed, so I'll do it manually" → report Blocked Format and stop
## Stage Completion Format / Blocked Format  (kept, path-from-JSON, both tiers)
## Related Skills (arc-coordinating, arc-finishing, arc-finishing-epic,
   arc-implementing; called-by list preserved)
```

Cross-platform note (seam d): the skill depends only on Node + the CLI — both already required on all four platforms. Hooks (remind/guard) are Claude-Code-only *enhancements*; no instruction in the skill assumes they exist.

---

## 3. CLI changes (file-level)

| File | Change |
|---|---|
| **`scripts/lib/worktree-generic.js`** (NEW, ~180 lines) | Named exports: `addGenericWorktree({projectRoot, name, branch, from, setup})`, `listWorktrees({projectRoot})`, `removeGenericWorktree({projectRoot, target, force})`, `runWorktreeCommand(args, projectRoot)` (single dispatch entry so the cli.js case stays ~10 lines). Implementation: `execFileSync('git', [...])` array-args only (security.md); paths via `getWorktreePath(projectRoot, null, slug)` + `parseWorktreePath`; slug via `sanitizeProjectName` (utils.js:444); epic detection via `hasArcforgeMarker`; `--setup` reuses `getDefaultInstallCommand` from `package-manager.js` (same helper expand uses, coordinator-worktree-ops.js:16). `list` enumerates `git worktree list --porcelain` and annotates each entry `kind: base\|epic\|generic\|external` (+ `epic`/`spec_id` from marker when present). `remove` refuses marker-bearing worktrees with exit-1 redirect to `arcforge cleanup`, and refuses dirty trees without `--force`. Error strategy: throw with context (lib tier). |
| **`scripts/cli.js`** | New `case 'worktree':` delegating wholly to `runWorktreeCommand` + ~12 help lines. cli.js is at 665 lines vs the 700 hard limit — the thin-case discipline is mandatory; if it can't land under 700, that is a stop condition (below), not a license to cram. |
| **Tests** | New Jest suite for worktree-generic (runs under `npm run test:scripts`), exercising add/list/remove against a temp repo with `homeDir` override, including: epic-marker refusal, dirty-tree refusal, external-worktree listing, null-spec path derivation round-trip via `parseWorktreePath`. |

Explicitly **not** built: a `worktree finish` subcommand (interactive ceremony belongs to the finishing skills) and any change to `status --json` (fix 1.1 stays an independent epic-tier fix; the generic tier's status surface is `worktree list --json`, so seam c is resolved by separation, not by extending the 18-reference surface).

---

## 4. Hook changes

- **arc-guard: no code change.** Verified: G2/G3 self-gate on `hasArcforgeMarker(cwd)` (main.js:83) → markerless generic worktrees hit the tested no-op invariant; `git merge` in a generic worktree proceeds. Add one regression test asserting exactly that (generic-worktree cwd + `git merge` → no deny).
- **arc-remind: message-only update.** `worktreeAddNudge()` (main.js:135-141) rewritten: epic work → `arcforge expand`; non-epic → `arcforge worktree add` (replacing "(Fine for a non-epic worktree.)"). Gating (`isArcforgeProject` = `specs/` exists) unchanged. CLI-routed adds never trigger it (command text contains no `git worktree add` — verified against the regex). Update `hooks/arc-remind/README.md` + tests.
- **Coordination requirement for future G4** (blueprint wave 2.1, out of scope here): its deny regex must match raw `git worktree add|remove` only (the node CLI invocation doesn't match — verified), and its deny message must offer both redirects (`arcforge expand` for epics, `arcforge worktree add|remove` for generic). Record this in the G4 work item.

---

## 5. Migration of shipped references

| Reference | Action |
|---|---|
| `skills/arc-using/SKILL.md:50` (Worktree Rule) | Rewrite: epic worktrees via `arc-coordinating expand`/composition tier; all other worktrees via `arc-using-worktrees` generic tier (`arcforge worktree add`). Re-run routing eval once (batch with other arc-using edits per blueprint). |
| `skills/arc-executing-tasks/SKILL.md:169`, `skills/arc-agent-driven/SKILL.md:218` | Keep ("Required: arc-using-worktrees") — composition tier preserves the contract; no text change needed beyond optional "(epic tier)" clarifier. |
| `skills/arc-finishing/SKILL.md:259` + Step 5 | Cleanup step becomes `arcforge worktree remove` (generic worktrees); related-skills line updated. |
| `skills/arc-finishing-epic/SKILL.md:390` | Unchanged — composition tier still delegates to expand, statement stays true. |
| `skills/arc-dispatching-parallel/SKILL.md:309` | Unchanged (epic-level row remains accurate). |
| `hooks/arc-remind/main.js:138` + README | Per §4. |
| `README.md:155`, `docs/guide/skills-reference.md` (§arc-using-worktrees, line 364+) | Description → "generic worktree management for any repo + epic isolation when DAG context exists". |
| `docs/guide/worktree-workflow.md` | Add a "Generic (non-epic) worktrees" section: null-spec derivation, list annotation semantics, sync/merge invisibility guarantee, finish handoff. |
| Contributor surface (`tests/skills/test_skill_arc_using_worktrees.py`, `tests/skills/pressure/arc-using-worktrees-cli-failure.md`, CONTRIBUTING, website copy) | Pytest + pressure fixture updated to the two-tier content (the CLI-failure refusal scenario is preserved and must still pass); website copy already generic ("isolated workspaces") — no change. |

---

## 6. Work packages — 驗收條件 / 停止條件 / unbroken scenarios

**WP1 — Generic worktree engine (worktree-generic.js + cli.js case + Jest tests)**
- 驗收條件: in a fresh temp git repo, `node scripts/cli.js worktree add t1` exits 0 and prints JSON whose `path` is under `getWorktreeRoot()` and round-trips through `parseWorktreePath`; branch `t1` checked out; `worktree list --json` annotates base/epic/generic/external correctly against a fixture containing all four kinds; `remove` on an epic-marker worktree exits 1 with an `arcforge cleanup` redirect; `remove` on a dirty tree exits 1 without `--force`; `npm test` (all 5 runners) and `npm run lint` green; `scripts/cli.js` ≤ 700 lines.
- 停止條件: cli.js cannot absorb the case under 700 lines without distorting the thin-case shape → halt, escalate cli.js decomposition as a prerequisite. Null-spec path derivation collides with any real pre-v2 legacy worktree during testing → halt, escalate (never silently change hash inputs). Any need for a non-stdlib dependency → halt (architecture rule).
- Unbroken scenario: S2 below — full epic pipeline must pass untouched with the new module merely present.

**WP2 — SKILL.md rewrite + skill tests/eval**
- 驗收條件: pytest `test_skill_arc_using_worktrees.py` passes against the new frontmatter/structure; pressure fixture (CLI-failure → refuse manual bypass, emit Blocked Format) passes; zero occurrences of `${SKILL_ROOT}/scripts/coordinator.js` and of the stale `-b <epic-id>` claim (grep-verifiable); composition-tier section delegates rather than re-documents (no expand semantics beyond the one command + JSON-path rule); arc-evaluating gate run (behavioral footprint is total here) with the routing/refusal eval green.
- 停止條件: pressure-scenario refusal regresses after 2 prompt iterations → halt, escalate to owner (do not weaken the scenario). Detection-table rules prove ambiguous in eval transcripts (model can't decide tier from the 4 signals) → halt, redesign signals rather than adding prose patches.
- Unbroken scenarios: S1 and S2.

**WP3 — Seam migration (hook message, arc-using rule, finishing/docs/README references)**
- 驗收條件: `npm run test:hooks` green including two new tests (arc-guard no-deny in markerless generic worktree; arc-remind nudge text mentions both redirects and still doesn't fire on the node CLI form); arc-using routing eval re-run green; repo-wide grep shows no shipped instruction telling users to derive generic worktree paths from `arcforge status --json`; docs/guide/worktree-workflow.md generic section merged.
- 停止條件: any hook test reveals guard/remind firing on CLI-routed operations → halt; never widen or weaken guard regexes unilaterally. A non-Claude platform guide turns out to lack a working ARCFORGE_ROOT resolution for the CLI invocation → halt, escalate (no per-platform hacks in shipped skill text).
- Unbroken scenarios: S2 and S3.

**End-to-end scenarios this skill must keep unbroken (regression set):**
- **S1 — standalone generic (flexibility):** plain git repo, zero arcforge state, no Claude-Code hooks (e.g. OpenCode): add → work → arc-finishing 4-option gate → `arcforge worktree remove` → `git worktree list` clean. Full value with nothing else opted into.
- **S2 — epic pipeline (composition):** `specs/<id>/dag.yaml` → detection row 2 → `expand --epic` creates marker'd worktree on branch `<spec-id>/<epic-id>` → raw `git merge` inside is denied by G2 → arc-finishing-epic coordinator merge → cleanup → DAG consistent.
- **S3 — mixed coexistence (no broken seams):** arcforge project with in-flight epics + a generic experiment worktree added beside them: `arcforge sync` ignores it, `_findBaseWorktree` skips it, epic merge succeeds, no guard/remind false positives, `worktree list --json` shows both kinds correctly annotated.

**Sequencing:** WP1 → WP2 → WP3; the blessed-invocation convention (already binding) is a stated precondition; G4 (wave 2.1) and status-json fix 1.1 proceed independently with the coordination notes in §4/§3.