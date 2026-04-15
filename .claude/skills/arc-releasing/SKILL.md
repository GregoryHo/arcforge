---
name: arc-releasing
description: Use this skill whenever the user (an arcforge contributor) says they want to bump arcforge's version, cut a release, "ship vX.Y.Z", "準備發版", "ready to release", or any equivalent intent on the arcforge repo itself — even if they don't use the word "release". Runs the canonical release workflow: pre-flight checks → vault ingest → outdated-doc audit → CHANGELOG → 5-file version bump → commit/push/PR → post-merge tag. Contributor-only; do NOT trigger inside projects that merely install arcforge as a plugin.
---

# arc-releasing

You are helping an arcforge contributor ship a new version. The goal of this skill is zero silent drift between the canonical version files, the CHANGELOG, shipped documentation, and the Obsidian vault knowledge base. Those four surfaces get out of sync surprisingly easily — a prior release (v1.4.0) discovered that `marketplace.json` had been stuck two versions behind, and v1.4.1 discovered the observer daemon and the JS side had diverged state roots. The checklist below is designed to catch exactly those classes of drift before they ship.

This is a **project-local, contributor-only** skill. It lives in `.claude/skills/` (not the shipped `skills/` directory) because releasing arcforge is a maintainer activity, not a user activity. If you see this skill trigger inside a project that merely *installs* arcforge, something is wrong — stop and tell the user.

## Pre-Flight (before touching anything)

Never start the release workflow on a broken branch.

1. `npm run lint` — exit code 0 (warnings acceptable, errors are not)
2. `npm test` — all 4 runners green
3. `git status` clean of unrelated work-in-progress. Untracked lock files or editor droppings that belong in `.gitignore` must be addressed separately, never folded into the release commit
4. `git log main..HEAD --oneline` — verify the commits listed match the intended release scope

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

Invoke `/arcforge:arc-maintaining-obsidian` in **ingest** mode. Scope depends on the release shape — always propose scope before bulk-processing, because ingest is the most expensive step in the workflow:

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

**Never rewrite past `CHANGELOG.md` entries.** They are history, and downstream users, the vault's Decision notes, and `git log vPREV..vCURRENT` workflows all depend on them being stable. If a past entry turns out wrong, add a correction inside the *new* release's entry. Stealth edits break provenance.

Out-of-scope for this audit (do not modify):
- `docs/plans/*` — design history
- `.claude/rules/*` — contributor rules, not shipped surface
- Tests that *deliberately blacklist* old patterns — they should still reference the old string, that's how they enforce the new convention

### 3. Update `CHANGELOG.md`

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

**Write narrative, not file lists.** The reader of this entry six months from now needs to know: what broke, why it broke, how the fix works, and what they can now do (or stop worrying about) as a result. "Updated `session-utils.js`" is useless. "Diary enricher had silently failed for 30 days because Claude Code v2.1.78+ blocks nested Writes inside `~/.claude/` — moved state to `~/.arcforge/`, 91 stubs now enrich" is reference-grade. This is the text that shows up on the marketplace release page; treat it as a user-facing artifact.

### 4. Bump the version in **all 5 canonical locations**

| File | Where in the file |
|---|---|
| `package.json` | top-level `"version"` field |
| `.claude-plugin/plugin.json` | top-level `"version"` field (canonical per `.claude/rules/plugin.md`) |
| `.claude-plugin/marketplace.json` | `plugins[0].version` |
| `.opencode/plugins/arcforge.js` | `version:` property inside the default export |
| `README.md` | version badge URL (shields.io, near line 3) |

Verify with a single grep after bumping:

```bash
grep -rn "X\.Y\.Z" package.json .claude-plugin/ .opencode/plugins/arcforge.js README.md
```

Expect **exactly 5 hits**. Fewer means a split-brain bump (dangerous — different platforms disagree about the current version). More means a stale copy elsewhere that also needs attention.

`package-lock.json` top-level `"version"` is known-stale at an older value. Leave it unless you're doing a dedicated lockfile refresh; never combine that with a release commit, since mixed diffs make rollback painful.

### 5. Commit, push, open PR

- Commit message: `chore(release): vX.Y.Z` with a brief body summarizing scope
- Stage exactly the 6 release files (5 version locations + `CHANGELOG.md`). Avoid `git add -A` — it tends to pull in lock files, editor droppings, and workspace metadata
- `git push -u origin <branch>`
- `gh pr create` with a test-plan checklist in the body: 4 runners green, lint green, secret scan clean, canonical 5-location grep returned exactly 5 hits

### 6. After PR merges to main — tag it

Arcforge has tagged every release since `v1.0.0`. Skipping a tag breaks the `git log vPREV..HEAD` workflow that the *next* release relies on to scope its CHANGELOG.

```bash
git checkout main && git pull
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

If the user is merging via GitHub UI (squash or merge), run the tag commands against `main` after the merge completes — the merge commit on main is what represents the release on the main timeline, not the source branch's tip.

## Things That Are Easy to Forget

These are the steps that get skipped when a contributor is in a hurry. The skill's job is to surface them even when the user doesn't ask:

- **Ingest before bump.** Once the version flips, the "why" narrative is harder to reconstruct for the vault. That's why it's step 1, not step 5.
- **`.opencode/plugins/arcforge.js`.** The only non-JSON, non-README version location. It doesn't pattern-match "config file" in a search, so it gets missed.
- **README badge URL.** The shields.io badge is image-cached; stale numbers visually persist even after every other file is correct. Worth an extra explicit mention.
- **Secret scan.** Release commits are large diffs. `git diff --cached | grep -iE "api[_-]?key|token|secret|password"` before pushing. The cost of a false positive is low; the cost of a committed secret is very high.
- **Daily note append.** After the release ships, `obsidian daily:append` with a one-line release summary so the release is preserved in the vault's chronological log, not only in `log.md`.
- **The post-merge tag.** Merging the PR does not auto-tag. This is the single most commonly skipped step.

## Anti-Patterns (from real arcforge release incidents)

- **Silent version drift** — v1.4.0 discovered `.claude-plugin/marketplace.json` had been stuck two versions behind. The 5-location grep is designed to catch exactly this.
- **Version bump without CHANGELOG entry** — the marketplace release cache is version-keyed. A bump with no CHANGELOG entry ships to users who have no way to tell what changed. The checklist order (CHANGELOG *before* version bump) enforces pairing them.
- **Editing past CHANGELOG entries** — downstream users and vault Decision notes depend on past entries being stable. Add corrections to the current entry; never stealth-edit the past.
- **Partial bump shipped** — bumping 3 of 5 locations produces a release where Claude Code, OpenCode, and the marketplace JSON disagree about the current version. Always use the 5-location grep as a post-bump gate.
- **Mixing release commit with other work** — `chore(release): vX.Y.Z` should be *only* the 6 release files. Unrelated fixes bundled in make bisect and rollback painful. Commit work-in-progress separately *before* the release commit.
- **Skipping the post-merge tag** — without the tag, the next release can't use `git log vPREV..HEAD` to scope its CHANGELOG. Missing tags cause the *next* release to either drop entries or include already-shipped ones.

## After the Release

- If a new skill was added, verify it appears in `docs/guide/skills-reference.md` and in `MOC-ArcForge-Skills.md` in the vault (the ingest step should have caught this, but a final visual check is cheap)
- `gh issue list --search "X.Y.Z"` to find issues the release resolves and close them
- If this was a minor or major release, consider whether any evals need regenerated baselines for the new surface area (see `.claude/rules/eval.md`)
