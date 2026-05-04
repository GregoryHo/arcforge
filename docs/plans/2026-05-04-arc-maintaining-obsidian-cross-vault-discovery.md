# arc-maintaining-obsidian — Cross-Vault Discovery (Follow-up to PR #27)

**Status:** deferred. Scope split out of PR #27 to keep that PR focused on the multi-vault foundation (registry + Vault Resolution + AGENTS.md template + 5 maintenance subcommands). This doc captures three deferred UX improvements that emerged during PR #27's design discussion so they aren't lost.

**Precursor:** PR #27 — `feat(skills): multi-vault support for arc-maintaining-obsidian` (branch `feat/maintaining-obsidian-multi-vault`).

## Why this exists

PR #27 makes the skill **route to** the right vault. It doesn't help the user **discover** which vault a piece of content lives in. With 1 vault, that question doesn't exist. With 3+ vaults and routes that can change (paths move, vaults get added/renamed), users will hit:

- *"I don't remember which vault has my notes about X."*
- *"I see the registry has 3 vaults — what's actually in each?"*
- *"I queried the wrong vault and got 0 results — am I sure it's not in another?"*

Today's `list-vaults` would print bare `name + path`, and `query` would only search the resolved vault. Both are mechanically correct but UX-poor as the registry grows.

## Deferred features

### F1 — Scope shown alongside vault name everywhere

**Problem:** `list-vaults` and Vault Resolution's "ask" fallback identify vaults by `name` only. With mutable routes, a name like `research` carries no semantic hint about what's inside.

**Solution:** Every place the skill surfaces a vault choice, also print the `scope` field that AGENTS.md frontmatter already provides. Registry's `scope` field is populated at `register` / `init-vault` time by reading the vault's `AGENTS.md` frontmatter (or supplied via `--scope` flag).

**Output format:**

```
Available vaults:
  research (default)  — Personal LLM Wiki — research, dev, papers
  work                — Client / confidential work
  news                — News ingest pipeline + parody drafts
```

**Touch points** in SKILL.md:
- "Vault Resolution" step 5 (Ask) — show scope in the prompt
- "Registry Maintenance" → `list-vaults` — show scope in output
- First-run gate message — show scope when listing existing vaults

**Implementation cost:** small. `scope` is already in the registry schema. Just thread it through the print/prompt code.

### F2 — Auto-fallback hint on 0-hit query

**Problem:** User runs `query "X"` from current vault. Returns 0 hits. They might assume the vault doesn't have it — but it might be in a sibling vault.

**Solution:** When `query` returns 0 hits in the resolved vault, the skill silently runs the same query against every other registered vault's QMD collection. Reports per-vault hit count. Offers to re-run against a chosen vault.

**Output format:**

```
✅ Query answered — cited 0 notes in research

ℹ️ This term wasn't found in research, but other vaults have hits:
   - work: 1 hit
   - news: 0 hits

   Re-run against work? [y/N/--vault=<name>]
```

**Implementation cost:** medium. Need to:
- Extend Query mode pipeline with a `0-hit fallback` step
- Iterate registered vaults, run lightweight count query (`qmd query "X" -c <collection> --files | wc -l` or `--json`)
- Skip if user already used `--vault` (they explicitly scoped)
- Skip in `--quiet` mode (autonomous loops shouldn't prompt)

**Open question:** should fallback be opt-in (`--cross-check` flag) or always-on with opt-out (`--no-cross-check`)? Default-on is friendlier; default-off is faster. Default-on with a `0-hit` trigger condition is probably the sweet spot — only adds latency when results are empty anyway.

### F3 — Explicit `query --all-vaults "X"`

**Problem:** Sometimes the user genuinely wants to search the union of all vaults — e.g., "do I have any notes about Y anywhere?" F2 only triggers on 0-hit; this is for when the user knows up front they want broad search.

**Solution:** A flag on `query` mode that runs the QMD query across every registered collection in parallel, merges results, prefixes each hit with its source vault.

**Output format:**

```
qmd query "context engineering" across all vaults:

Hits in research (4):
  - [[Effective-Context-Engineering]] (score 92%)
  - [[Context-Rot-Concept]] (score 87%)
  ...

Hits in work (1):
  - [[Internal-Harness-Orchestrator-Design]] (score 71%)

Hits in news (0)
```

**Implementation cost:** small (once F2's iteration helper exists). Just runs the same multi-collection query but always, not only on 0-hit.

**Open question:** result merging — sort by score (cross-vault) or group by vault (current proposal)? Group-by-vault is more interpretable; sort-by-score is closer to "best answer first". Probably group-by-vault wins because cross-vault scores aren't really comparable (different collections, different doc densities).

## Constraints inherited from PR #27

- Registry lives at `~/.arcforge/obsidian-vaults.json`. F1/F2/F3 all read it.
- Each vault has its own QMD collection named `obsidian-<vault-name>`. F2/F3 iterate this list.
- Skill never hand-edits the registry. F1's scope source is AGENTS.md frontmatter, captured at `register` / `init-vault` time. If user later edits AGENTS.md scope, registry should be re-synced — likely a small `arc-maintaining-obsidian sync-registry` subcommand or auto-sync on `list-vaults`.

## Order of work

Recommend implementing in this order — each unlocks the next:

1. **F1** (scope display) — small, foundational, immediately visible UX win.
2. **F2** (0-hit fallback) — medium, builds the multi-collection iteration helper.
3. **F3** (`--all-vaults`) — trivial once F2 exists.

## Iron Law plan

For each feature, write the failing tests first against `tests/skills/test_skill_arc_maintaining_obsidian.py`:

- F1: assert `list-vaults` documentation in SKILL.md mentions `scope`; assert Vault Resolution's "ask" step mentions scope
- F2: assert SKILL.md Query mode pipeline includes a 0-hit fallback / cross-vault check step
- F3: assert `argument-hint` includes `--all-vaults`; assert SKILL.md documents the cross-vault output format

## Out of scope (deeper futures, not this follow-up)

- Cross-vault wikilink resolution (would require unified namespace — large change)
- Vault aliasing (multiple names → one path)
- Read-only vaults (registry flag preventing ingest/audit modify)
- Remote vault support (collaborator's vault over SSH or git)

## Decision log

- 2026-05-04 — PR #27 design discussion: deferred F1/F2/F3 to keep first multi-vault PR focused. User asked for a written record so they don't get lost.
