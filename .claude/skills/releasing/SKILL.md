---
name: releasing
description: Use this skill whenever the user (an arcforge contributor) says they want to bump arcforge's version, cut a release, "ship vX.Y.Z", "準備發版", "ready to release", or any equivalent intent on the arcforge repo itself — even if they don't use the word "release". Runs the canonical release workflow: pre-flight checks → vault ingest → outdated-doc audit → CHANGELOG → product-state flip → 8-file version bump (incl. website) → commit/push/PR → post-merge tag. Contributor-only; do NOT trigger inside projects that merely install arcforge as a plugin.
---

# releasing

You are helping an arcforge contributor ship a new version. The goal of this skill is zero silent drift between the canonical version files, the CHANGELOG, shipped documentation, and the Obsidian vault knowledge base. Those four surfaces get out of sync surprisingly easily — a prior release (v1.4.0) discovered that `marketplace.json` had been stuck two versions behind, and v1.4.1 discovered the observer daemon and the JS side had diverged state roots. The checklist below is designed to catch exactly those classes of drift before they ship.

This is a **project-local, contributor-only** skill. It lives in `.claude/skills/` (not the shipped `skills/` directory) because releasing arcforge is a maintainer activity, not a user activity. If you see this skill trigger inside a project that merely *installs* arcforge, something is wrong — stop and tell the user.

## Pre-Flight (before touching anything)

Never start the release workflow on a broken branch.

1. `npm run lint` — exit code 0 (warnings acceptable, errors are not)
2. `npm test` — all **5** runners green (`test:scripts`, `test:hooks`, `test:node`, `test:skills`, `test:observer-daemon`)
3. The **6 static checks**, which are CI-gated but deliberately *not* part of `npm test` — run each and require exit 0:

   ```bash
   npm run check:versions && npm run check:docs && npm run check:cli-consumers \
     && npm run check:hooks && npm run check:eval-targets && npm run check:product
   ```

   `check:versions` will still be red at this point if you have not bumped yet — that is expected before step 6 and must be green after it. The other five must be green *now*: a red `check:docs` before the bump means the shipped prose already disagrees with the code, and the release would carry that lie forward. `check:product` green here means the product state is coherent going in; step 5 flips it and you run the check again to prove the flip landed whole rather than half.
4. `git status` clean of unrelated work-in-progress. Untracked lock files or editor droppings that belong in `.gitignore` must be addressed separately, never folded into the release commit
5. `git log main..HEAD --oneline` — verify the commits listed match the intended release scope
6. `node scripts/check-unmerged-branches.js` — every local branch with commits off `main` must be dispositioned: a MERGED PR, an OPEN PR, or already landed on `origin/main`. A branch reported `NO-PR` is unmerged work about to miss this release — land it (open + merge a PR) or delete it, then re-run. The script catches squash-merged branches that `git branch --no-merged main` cannot see. Releaser-only; it cannot be a CI gate (a fresh runner has no local branches), and it degrades to list-only if `gh` is absent.

If any pre-flight fails, stop and tell the user. A broken release is worse than a delayed one, because it ships to users through the marketplace cache and is painful to recall.

## Semver Decision — Always Ask the User

Do NOT decide semver level unilaterally. After pre-flight, read `git log main..HEAD --oneline` and any design docs the branch touched, then present the user with the commit list plus a **recommendation** and ask them to confirm:

```
Here's what's on this branch since last release:
  <commit list>

Recommendation: patch / minor / major

Reasoning: <why>

Confirm the level before I proceed.
```

Guidelines for your recommendation:

| Change shape | Suggest |
|---|---|
| Backward-compatible fixes, refactors, doc-only updates | **patch** (`1.x.y` → `1.x.y+1`) |
| New skill, new CLI command, new backward-compatible feature | **minor** (`1.x.y` → `1.x+1.0`) |
| Breaking change (removed/renamed shipped API, hook contract change, CLI flag rename) | **major** (`x.y.z` → `x+1.0.0`) |

Branch prefix is a hint, not a rule: `fix/*` usually patches but can minor-bump if it added something. The final call is always the user's — your job is to make the call easy to judge, not to make it for them.

## The Checklist

Do these in order. Each step depends on the previous one being correct.

### 1. Ingest the release into the Obsidian vault

Invoke `/arcforge:maintaining-obsidian` in **ingest** mode. Scope depends on the release shape — always propose scope before bulk-processing, because ingest is the most expensive step in the workflow:

| Release shape | Ingest scope |
|---|---|
| Patch with an architectural decision inside (e.g., v1.4.1's `~/.arcforge/` consolidation) | Decision note + refresh Source notes whose content substantively changed + propagate + index/log + daily note |
| Patch with only small fixes | Skip, or just append a single `log.md` entry |
| Minor release (new skill or feature) | Full sync: new Source notes for new skills/guides, Decision notes for any architectural shifts, update affected MOCs, propagate cross-refs |
| Major release | Everything above, plus update `MOC-ArcForge.md` to reflect the new surface |

Ingest **before** the version bump. Once the version flips, reconstructing the "why this release existed" narrative for the vault becomes harder — git shows *what* changed, but the reasoning context has moved on.

### 2. Audit outdated documents in shipped surface

Branches that do migrations often miss a file or two. Grep for stale patterns that the branch was *supposed* to eliminate. The specific patterns depend on what the release contained — examples from recent releases:

```bash
# After a state-path migration:
grep -rn "~/\.claude/instincts\|~/\.claude/diaryed\|~/\.claude/observations" skills/ docs/guide/ .claude-plugin/ hooks/

# After a worktree path change:
grep -rn "\.arcforge-worktrees/" skills/ docs/guide/ .claude-plugin/

# Generic: version strings hardcoded outside canonical locations
grep -rn "<old-version>" skills/ docs/guide/
```

Also check for renamed helpers, removed CLI flags, or deprecated config keys that the SKILL.md / rules / guides still mention.

Things to verify, with reasoning:

- **No hardcoded skill counts.** Values like "15 skills" drift every time a skill ships. Prefer an invariant phrasing — a description that stays true across all releases needs no maintenance. The one place a count is legitimately pinned is `EXPECTED_SKILL_COUNT` in `tests/skills/test_skill_structure.py`, which exists precisely to fail when the number changes without anyone noticing.
- **No stale path references.** If this release moved anything (state dirs, worktree paths, config locations), greps from the examples above apply here too. Skills live under `skills/core/<name>/`, so a reference to a bare `skills/<name>/` is stale.
- **No stale invocation names.** Skills are invoked as `/arcforge:<name>` with no prefix. Any surviving `arc-<name>` slash reference in shipped surface is dangling — `npm run check:docs` gates that class over its scan set (`SCAN_DIRS` + `SCAN_ROOT_FILES` in `scripts/check-doc-refs.js` — read the constants, don't trust a cached list), so check the website and any doc outside that set by hand.

**Never rewrite past `CHANGELOG.md` entries.** They are history, and downstream users, the vault's Decision notes, and `git log vPREV..vCURRENT` workflows all depend on them being stable. If a past entry turns out wrong, add a correction inside the *new* release's entry. Stealth edits break provenance.

Out-of-scope for this audit (do not modify):
- `docs/plans/*` — design history
- `.claude/rules/*` — contributor rules, not shipped surface
- Tests that *deliberately blacklist* old patterns — they should still reference the old string, that's how they enforce the new convention

### 3. Benchmark-freshness gate (required for any release that touched eval-backed surface)

A release that changes skill behavior must ship a benchmark that reflects *this* release, not the last one. A stale benchmark silently asserts that behavior nothing has re-measured is still passing — exactly the failure mode eval exists to prevent.

> **Regenerating the benchmark is a live-eval step.** The grading is done by LLM graders, not by code in this skill or in CI's `npm test`. You (or a dedicated CI live-eval job) must run the regeneration manually before tagging; the skill cannot run it for you. Treat this section as the **gate you must clear**, not a command the skill executes.

1. **Regenerate the benchmark** against the release branch (manual/CI live-eval run — see `skills/core/evaluating/SKILL.md` for the regeneration procedure). This refreshes `evals/benchmarks/latest.json` and `evals/benchmarks/raw/latest.json`.

   > Path note: the canonical report location is `evals/benchmarks/` (`latest.json` + `raw/latest.json`), each carrying a top-level `generated` ISO-8601 timestamp. Older notes that say `evals/reports/latest.json` are referring to this same artifact under its prior name.

2. **Assert freshness.** The `generated` timestamp in both `evals/benchmarks/latest.json` and `evals/benchmarks/raw/latest.json` must be **newer than the previous release tag's commit date**. If the timestamp predates the last tag, the benchmark was never re-run for this release — stop and regenerate.

   ```bash
   PREV_TAG=$(git tag --sort=-version:refname | head -1)
   PREV_TAG_DATE=$(git log -1 --format=%cI "$PREV_TAG")
   GEN=$(node -p "require('./evals/benchmarks/latest.json').generated")
   RAW_GEN=$(node -p "require('./evals/benchmarks/raw/latest.json').generated")
   # Both GEN and RAW_GEN must sort AFTER PREV_TAG_DATE.
   echo "prev tag: $PREV_TAG_DATE | latest: $GEN | raw: $RAW_GEN"
   ```

   > **This manual check and the CI gate do not resolve the same previous tag.** `release.yml` runs `scripts/check-benchmark-freshness.js`, which derives its previous tag from `git describe --tags --abbrev=0 <tag>^` — and `git describe` matches *any* nearest reachable tag, not just release tags. In a repo that also carries non-release tags (phase gates, rc markers), it will land on the nearest one of those instead of the last `vX.Y.Z`. The recipe above filters to version-sorted tags and lands on the real previous release, so **the manual answer is the trustworthy one**; treat a green CI gate as necessary, not sufficient. Verify by printing both:
   >
   > ```bash
   > echo "manual   : $(git tag --sort=-version:refname | head -1)"
   > echo "CI gate  : $(git describe --tags --abbrev=0 HEAD)"
   > ```
   >
   > If they disagree, the CI gate compared against the wrong baseline. Two ways that goes wrong: it passes vacuously (no eval-backed file changed since a very recent non-release tag, so the timestamp is never even examined), or it false-fails (a non-release tag was cut *after* the benchmark was generated, so a genuinely fresh benchmark reads as stale).

3. **No unclassified failing rows on changed scenarios.** For every scenario that changed since the last release, confirm the raw report has **no failing row left unclassified** (every fail must carry a known failure category, not a blank or `unknown` classification). An unclassified failing row means a regression nobody triaged — that is a release blocker until it is either classified as a known/accepted gap or fixed.

If either freshness or the unclassified-failure check fails, **stop and tell the user**. Do not write the CHANGELOG or bump the version against a stale or untriaged benchmark — the release would ship a behavior claim that the eval surface contradicts.

### 4. Update `CHANGELOG.md`

Insert a new section at the top, under the header block, **before** the previous release:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Fixed
- ...

### Changed
- ...

### Added
- ...

### Removed
- ...
```

Include only sections that have entries. Order: Fixed → Changed → Added → Removed.

**Write narrative, not file lists.** The reader of this entry six months from now needs to know: what broke, why it broke, how the fix works, and what they can now do (or stop worrying about) as a result. "Updated `session-utils.js`" is useless. "Diary enricher had silently failed for 30 days because Claude Code v2.1.78+ blocks nested Writes inside `~/.claude/` — moved state to `~/.arcforge/`, 91 stubs now enrich" is reference-grade. The `release.yml` workflow extracts this exact `## [X.Y.Z]` section verbatim into the GitHub Release body when the tag is pushed (it slices from the version header to the next `## [` header), so this is the text users read on the GitHub release page — treat it as a user-facing artifact. The release job **fails** if no matching CHANGELOG section exists, which enforces the "no bump without CHANGELOG entry" rule below.

### 5. Flip the product state

`product/` records what the product is and why. A release makes it stale in four
places at once, and nothing in the version bump touches any of them. `product/AGENTS.md`
(*Ship a version*) is the authority; the mechanics are:

1. Flip the release's roadmap row in `product/ROADMAP.md` to `Status: shipped`.
2. Fill that row's `Tag` column with `vX.Y.Z`.
3. Set the `Status:` header of every spec the row governs to `shipped vX.Y.Z`. A spec
   carrying the compound form — `shipped v6.0.0 · extended by 6.1.0 (building)` —
   collapses to `shipped v6.1.0`.
4. Move `← we are here` onto whatever is next. If nothing is next yet it stays on the
   row that just shipped: exactly one row carries it, always.

Then prove all four landed:

```bash
npm run check:product
```

It was green before this step and it must be green after — a `building` row with
`building` spec headers agrees just as well as a `shipped` row with `shipped` headers.
What it catches is a **half-done flip**: the row moved but a spec header didn't, the
`Tag` cell left empty, the marker never moved. That is the failure that actually
happens, because the four edits live in four different files and only the first one
feels like "the release".

Commit this on its own, ahead of the release commit:

```bash
git add product/
git commit -m "docs(product): flip vX.Y.Z to shipped"
```

Keeping it separate is deliberate — the release commit in step 7 stays exactly the 9
version files, so reverting a bad bump does not drag the product history back with it.

### 6. Bump the version in **all 8 canonical locations**

| File | Where in the file |
|---|---|
| `package.json` | top-level `"version"` field |
| `.claude-plugin/plugin.json` | top-level `"version"` field (canonical per `.claude/rules/plugin.md`) |
| `.claude-plugin/marketplace.json` | `plugins[0].version` |
| `README.md` | version badge URL (shields.io, near line 3) |
| `website/page/hero.jsx` | hero version label (`vX.Y.Z` near top of component) |
| `website/page/sections.jsx` | footer line (`MIT · vX.Y.Z · By ...`) |
| `website/page/hero.js` | babel build artifact — regenerate, do not hand-edit |
| `website/page/sections.js` | babel build artifact — regenerate, do not hand-edit |

After editing the two `.jsx` files, regenerate the `.js` artifacts:

```bash
npm run build:website
```

The babel output is committed to the repo (no separate publish pipeline reads it from a build cache), so `.jsx` and `.js` must match in the same commit. Don't hand-edit the `.js` files — the babel transform also touches surrounding output and an out-of-band edit drifts from what `build:website` would produce next time.

Verify with a single grep after bumping + building:

```bash
grep -rn "X\.Y\.Z" package.json .claude-plugin/ README.md website/page/
```

Expect **exactly 8 hits**. Fewer means a split-brain bump (dangerous — different platforms or the website disagree about the current version). More means a stale copy elsewhere that also needs attention.

For an authoritative pass/fail that compares every location against the canonical `plugin.json` version, run `npm run check:versions` (zero-dep `scripts/check-version-sync.js`). It prints a location → version table and exits non-zero on any drift. The same check runs in CI and gates `release.yml` before the GitHub Release is created, so a drifted bump fails the release rather than shipping silently.

`package-lock.json` top-level `"version"` is known-stale at an older value. Leave it unless you're doing a dedicated lockfile refresh; never combine that with a release commit, since mixed diffs make rollback painful.

For releases that change **shipped surface area** (new skill, removed CLI flag, new marketing claim), also audit the website **content** — `website/page/hero.jsx` and `sections.jsx` carry the project framing. Patch releases usually just need the version label bumped; minor/major releases often need copy adjustments too. Confirm with the user before rewriting hero copy or feature lists.

### 7. Commit, push, open PR

- Commit message: `chore(release): vX.Y.Z` with a brief body summarizing scope
- Stage exactly the 9 release files (8 version locations + `CHANGELOG.md`) — the product-state flip from step 5 is already its own commit on this branch, so do not fold it in. Avoid `git add -A` — it tends to pull in lock files, editor droppings, and workspace metadata
- `git push -u origin <branch>`
- `gh pr create` with a test-plan checklist in the body: 5 runners green, 6 static checks green, lint green, secret scan clean, canonical 8-location grep returned exactly 8 hits

### 8. After PR merges to main — tag it

Arcforge has tagged every release since `v1.0.0`. Skipping a tag breaks the `git log vPREV..HEAD` workflow that the *next* release relies on to scope its CHANGELOG.

```bash
git checkout main && git pull
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

If the user is merging via GitHub UI (squash or merge), run the tag commands against `main` after the merge completes — the merge commit on main is what represents the release on the main timeline, not the source branch's tip.

## Things That Are Easy to Forget

These are the steps that get skipped when a contributor is in a hurry. The skill's job is to surface them even when the user doesn't ask:

- **Ingest before bump.** Once the version flips, the "why" narrative is harder to reconstruct for the vault. That's why it's step 1, not step 6.
- **Website version labels + babel rebuild.** `website/page/hero.jsx` and `sections.jsx` both carry the version, and the committed `.js` siblings must be regenerated via `npm run build:website` to match — easy to miss because the website looks like a "doc only" surface but `.jsx` ≠ `.js` in a single commit is a real defect.
- **README badge URL.** The shields.io badge is image-cached; stale numbers visually persist even after every other file is correct. Worth an extra explicit mention.
- **Secret scan.** Release commits are large diffs. `git diff --cached | grep -iE "api[_-]?key|token|secret|password"` before pushing. The cost of a false positive is low; the cost of a committed secret is very high.
- **Daily note append.** After the release ships, `obsidian daily:append` with a one-line release summary so the release is preserved in the vault's chronological log, not only in `log.md`.
- **The product-state flip.** The roadmap row, its `Tag` cell, the spec headers, and the `← we are here` marker are four edits in four files, and a version bump touches none of them. `npm run check:product` is the proof you did all four.
- **The post-merge tag.** Merging the PR does not auto-tag. This is the single most commonly skipped step.

## Anti-Patterns (from real arcforge release incidents)

- **Silent version drift** — v1.4.0 discovered `.claude-plugin/marketplace.json` had been stuck two versions behind. The 8-location grep is designed to catch exactly this. v3.0.1 expanded the surface to include `website/page/{hero,sections}.{jsx,js}` after the website was found to have been silently bumped manually during v3.0.0.
- **Version bump without CHANGELOG entry** — the marketplace release cache is version-keyed. A bump with no CHANGELOG entry ships to users who have no way to tell what changed. The checklist order (CHANGELOG *before* version bump) enforces pairing them.
- **Editing past CHANGELOG entries** — downstream users and vault Decision notes depend on past entries being stable. Add corrections to the current entry; never stealth-edit the past.
- **Partial bump shipped** — bumping a subset of the 8 locations produces a release where Claude Code, the marketplace JSON, or the website disagree about the current version. Always use the 8-location grep as a post-bump gate.
- **Mixing release commit with other work** — `chore(release): vX.Y.Z` should be *only* the 9 release files (8 version locations + `CHANGELOG.md`). Unrelated fixes bundled in make bisect and rollback painful. Commit work-in-progress separately *before* the release commit.
- **Skipping the post-merge tag** — without the tag, the next release can't use `git log vPREV..HEAD` to scope its CHANGELOG. Missing tags cause the *next* release to either drop entries or include already-shipped ones.

## After the Release

- If a new skill was added, verify it appears in `docs/guide/skills-reference.md` and in `MOC-ArcForge-Skills.md` in the vault (the ingest step should have caught this, but a final visual check is cheap)
- `gh issue list --search "X.Y.Z"` to find issues the release resolves and close them
- If this was a minor or major release, consider whether any evals need regenerated baselines for the new surface area (see `.claude/rules/eval.md`)
