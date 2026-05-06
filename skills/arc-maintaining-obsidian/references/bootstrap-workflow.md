# init-vault Bootstrap Workflow

Read this file when the user invokes `init-vault <path> --name <name>` (with or without `--preset=<name>`). This 11-step workflow walks the LLM through validating, choosing a preset, asking minimal questions, **authoring** the vault contract from preset guidance, seeding operational files, and registering the vault. The skill drives the conversation; do not skip steps.

## The Workflow

### 1. Validate path

Confirm `<path>` exists and is a directory. Refuse if:
- It's already in the registry (`~/.arcforge/obsidian-vaults.json`).
- It already contains `AGENTS.md` (would overwrite).

In either case, direct the user to `register` instead.

### 2. Pick preset

If `--preset=<name>` was supplied, use it. Otherwise list options and ask:

| Preset | Best for |
|---|---|
| `minimal` | Empty scaffold; user authors types from scratch. |
| `llm-wiki` | Karpathy-style second brain (Source / Entity / Synthesis / MOC / Decision / Log). |
| `news` | News pipeline: article ingest + daily / weekly aggregates. |
| `project-tracker` | Tasks / Milestones / Decisions / Sprints. |

Each preset ships under `presets/<name>/AGENTS.md` + `presets/<name>/SCHEMA.md` in this skill. **Presets are one-shot authoring guidance, not stamping templates** — read them to understand the shape, then author the user's vault contract with their actual values.

### 3. Ask preset-specific minimal questions

Common questions for any preset:

- **Vault scope statement** — one line, what this vault owns.
- **Search backend** — filesystem is the baseline. Ask whether to enable optional QMD semantic search; if yes, collect collection name (default `obsidian-<name>`). Do not require QMD for bootstrap.
- **Bilingual?** — only if the preset supports it (e.g., llm-wiki may go bilingual or mono; news / project-tracker default to mono).

Preset-specific questions live in the preset's `AGENTS.md` as `<TODO ...>` markers — surface them and prompt the user. Don't ask about things the preset doesn't support (e.g., don't ask about Raw Source adoption for `project-tracker` — that preset declares `raw_source: not-adopted`).

### 4. Author `<path>/AGENTS.md`

**Read** `presets/<preset>/AGENTS.md` to understand the canonical shape of this domain's thin runtime contract — Schema Authority baseline, identity, scope, language policy, raw-source adoption, paths, and integration capability declarations.

Then **write a fresh AGENTS.md** for the user's vault, filling in their actual values from the questions above:

- Real `name`, real `scope`, real language choice — **not placeholder strings**.
- Skip preset sections that don't apply to the user's situation (e.g., if user said monolingual, drop the bilingual block).
- Rephrase or extend where the user's case warrants.
- Keep the Schema Authority section verbatim — those 6 rules are the stable contract baseline across all presets.

**The preset is one-shot reading guidance, not a template to copy verbatim.** Do not leave unsubstituted placeholders like `<Vault Name>` in the written file — those are pedagogical markers in the preset, not literal output.

### 5. Author `<path>/SCHEMA.md`

Same pattern as step 4: read `presets/<preset>/SCHEMA.md` for the canonical type set + frontmatter + Visual Guidance shapes, then **author** the user's SCHEMA.md with their actual choices.

- Leave `<TODO ...>` markers **ONLY** for fields the user explicitly deferred (e.g., tag taxonomy details, audit thresholds, custom-type additions).
- Do not leave unsubstituted placeholders like `<Vault Name>`.
- For monolingual vaults, drop the bilingual callout structure section entirely.
- For vaults that don't adopt Raw Source pattern, drop the Raw Source frontmatter section.

### 6. Write `<path>/CLAUDE.md` shim

A one-paragraph redirect:

```markdown
# CLAUDE.md

This vault uses `arc-maintaining-obsidian` (arcforge plugin). See:

- `AGENTS.md` — thin runtime contract (scope, paths, integration capabilities, language policy, schema authority)
- `SCHEMA.md` — domain schema and policy (note types, frontmatter, body templates, tag taxonomy, thresholds)

When working in this vault, run `arc-maintaining-obsidian` for ingest / query / audit.
```

### 7. Seed `<path>/index.md`

Empty starter:

```markdown
# <Vault Name> Index
Last updated: YYYY-MM-DD
```

(Substitute `<Vault Name>` with the user's real vault name. Audit LINT will populate sections on first run.)

### 8. Seed `<path>/log.md`

First entry:

```
## [YYYY-MM-DD] init-vault | preset=<preset> name=<name>
```

(Real values, not placeholders.)

### 9. Register in `~/.arcforge/obsidian-vaults.json`

Add the entry with these fields:

```json
{
  "name": "<name>",
  "path": "<absolute-path>",
  "search": {
    "baseline": "filesystem",
    "preferred": "filesystem",
    "qmd_collection": null,
    "fallbacks": ["filesystem", "obsidian-cli"]
  },
  "scope": "<scope from question 3>",
  "preset": "<preset>"
}
```

If this is the first registered vault, set it as `default` automatically and tell the user.

### 10. Optional QMD collection

QMD is optional QMD acceleration, not a prerequisite. Ask the user: `Enable QMD semantic search?` Default is **no** unless the user has already requested semantic/hybrid search. If enabled, run `qmd create -c obsidian-<name>` and set `search.preferred = "qmd"`, `search.qmd_collection = "obsidian-<name>"`. If skipped or unavailable, leave filesystem as the baseline and note that the skill falls back to filesystem search/read operations, with `obsidian-cli search` as an optional runtime route when Obsidian is available.

### 11. Print available commands

Tell the user:

```
✅ Bootstrapped <Vault Name> (preset: <preset>)
   Registered at: <path>
   QMD collection: <collection name> (or "not configured")

You can now:
  - ingest <url|text>   create notes from sources
  - query <question>    search & synthesize
  - audit               vault health (LINK + LINT + GROW)
  - (bare invoke)       vault summary at any time
```

## Failure handling

If any step fails (file write error, registry write error, QMD failure), undo prior steps when reasonable — don't leave half-written files in the user's vault. Report the failure clearly so the user can re-run after fixing the cause.

Specifically:
- If step 4 / 5 fails after step 1 / 2, no files were written — clean.
- If step 6 fails after step 4 / 5 succeeded, leave AGENTS.md + SCHEMA.md (they're useful even without CLAUDE.md), warn user.
- If step 9 (register) fails after files are written, files stay; tell user to register manually via `register <path> --name <name>`.

## Worked Example

To make "author from preset, don't copy" concrete, here's how step 4 actually plays out for a real bootstrap:

**User input:** `init-vault /tmp/news-feed --name news-feed --preset=news`

**Question phase (step 3) responses:**
- Scope: `"AI policy news"`
- Search backend: filesystem baseline; user accepts optional QMD (`obsidian-news-feed`)
- Bilingual: `news` preset is mono-only, so the LLM doesn't ask.

**Step 4 execution:**

The LLM reads `presets/news/AGENTS.md` (the canonical news preset). It contains:
- Frontmatter with `<YYYY-MM-DD>` and `<Vault Scope>` placeholders.
- `## Schema Authority` baseline (6 rules — keep verbatim).
- `## Identity` describing news-pipeline LLM behavior.
- `## Layer 1` declaring Raw Source adopted under `Raw/<YYYY-MM-DD>/<source-slug>.md`.
- `## Language Policy` with `<TODO: declare e.g., English | 中文>`.
- `## Domain Policy` pointing agents to SCHEMA.md for taxonomy, thresholds, and type rules.

The LLM then **authors** `/tmp/news-feed/AGENTS.md` — NOT a literal copy. Concretely:

- Frontmatter: `created: 2026-05-06`, `scope: AI policy news`, `preset: news`, `schema_path: SCHEMA.md`, `raw_source: adopted`.
- `# news-feed — Agent Runtime Contract (News Pipeline)` (real name, not `<Vault Name>`).
- Schema Authority section: copied verbatim (the 6 rules are stable).
- Identity / Layer 1 / Layer 2 / Layer 3 sections: copied with substitutions.
- Language Policy: `Single language: English. Note bodies in English; no callouts.` (User said English; LLM resolved the TODO directly.)
- Domain Policy: points to `SCHEMA.md` for tag taxonomy, source validation rules, audit thresholds, and aggregation triggers.

**What the LLM does NOT do:**

- Does not leave any `<Vault Name>`, `<YYYY-MM-DD>`, `<Vault Scope>`, `<QMD Collection>` strings in the written file.
- Does not include the bilingual section (preset's news AGENTS.md doesn't have one anyway, but if it did and user said mono, LLM would skip it).
- Does not auto-fill tag taxonomy in SCHEMA.md with guesses — if user defers, leave a TODO in SCHEMA.md and tell the user where it is.
- Does not literally copy preset's `<TODO: ...>` instructions in the user's AGENTS.md (those are LLM-facing pedagogy, not user-facing content).

Step 5 (SCHEMA.md authoring) follows the same pattern with `presets/news/SCHEMA.md`.

This worked example is the load-bearing piece of "author from preset" — once the LLM internalizes that presets are guidance for authoring, the rest of the workflow is mechanical.
