# init-vault Bootstrap Workflow

Read this file when the user invokes `init-vault <path> --name <name>` (with or without `--preset=<name>`). This 11-step workflow walks the LLM through validating, choosing a preset, asking minimal questions, **authoring** the vault contract from preset guidance, seeding operational files, and registering the vault. The skill drives the conversation; do not skip steps.

## The Workflow

### 1. Validate path

Confirm `<path>` exists and is a directory. Refuse if:
- It's already registered — check with `arcforge obsidian list-vaults --json`.
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

The preset's `<...>` markers and `<TODO: ...>` blocks are instructions to you, not content: resolve each with the user's answer, or, where the user deferred, leave a `<TODO>` in SCHEMA.md and name it in the closing report.

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

This vault is maintained through arcforge's `/maintaining-obsidian` skill. See:

- `AGENTS.md` — thin runtime contract (scope, paths, integration capabilities, language policy, schema authority)
- `SCHEMA.md` — domain schema and policy (note types, frontmatter, body templates, tag taxonomy, thresholds)

When working in this vault, use that skill for ingest / query / audit.
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

### 9. Register via the arcforge CLI (mechanical, not LLM-authored)

Registry mutation goes through `arcforge`, not
hand-written JSON. Run:

```bash
arcforge obsidian register \
  --name <name> \
  --path <absolute-path> \
  --preset <preset> \
  --scope "<scope from question 3>" \
  --json
```

The CLI:
- writes a fully-formed registry entry (default `search` config: filesystem baseline, no QMD collection, fallbacks `[filesystem, obsidian-cli]`)
- promotes the first-registered vault to `default` automatically
- holds a file lock for the duration of the write
- atomically replaces the registry file

Print the JSON result to the user (it includes `becameDefault: true|false`). Never write the registry file yourself — there is no step in this workflow where constructing it by hand is correct. If step 10 enables QMD, run a follow-up `arcforge obsidian set-default` only when the user explicitly asked to switch defaults; otherwise leave the registry alone.

### 10. Optional QMD collection

QMD is optional acceleration, not a prerequisite. Step 3 already
captured the user's QMD preference. If they accepted:

1. Run `qmd create -c obsidian-<name>` to create the collection.
2. Pass `--qmd-collection obsidian-<name>` (which implies
   `--search-preferred qmd`) to step 9's `obsidian register` command —
   no separate registry edit. **Step 10 is folded into step 9 when QMD
   is enabled.**

If skipped or unavailable, leave filesystem as the baseline and note
that the skill falls back to filesystem search/read operations, with
`obsidian-cli search` as an optional runtime route when Obsidian is
available.

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
- If step 9 (register) fails after files are written, files stay; tell user to retry `arcforge obsidian register --name <name> --path <path>` once the failure cause is addressed.
