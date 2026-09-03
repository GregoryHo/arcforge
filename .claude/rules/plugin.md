# Plugin

arcforge ships **one source tree with two plugin manifests**: Claude Code reads
`.claude-plugin/`, Codex CLI reads `.codex-plugin/` + `.agents/plugins/`. There is
no platform-specific source split — see *The Codex manifest pair* below for what
each target actually loads.

## Plugin Manifest (`.claude-plugin/plugin.json`)

- Required field: `name` (kebab-case, becomes namespace prefix)
- Optional metadata: `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`
- Component path fields available: `commands`, `agents`, `skills`, `hooks`, `mcpServers`, `outputStyles`, `lspServers`
- `hooks`: declare it as `"./hooks/claude-code.json"`. It is not optional and
  not conventional — see *Hook Registration* below

## Skill Discovery and the `skills` Whitelist

Skills live in **lifecycle buckets** — `skills/core/<name>/`, plus
`in-progress/` and `deprecated/` as needed — and `plugin.json` carries a single
directory entry:

```json
"skills": ["./skills/core/"]
```

**Verified mechanics** (empirically tested against Claude Code, not inferred):

- Nested directories are **not** auto-discovered. Remove the `skills` field and
  a nested layout loads nothing. The whitelist is not a filter — it is the only
  way to load a nested layout.
- The whitelist accepts **directory entries**: `"skills": ["./skills/core/"]`
  loads every skill under that directory in one entry.
- The loaded identifier is the skill's `name` (== dirname); the bucket segment
  does not appear in it, so a move between buckets never changes an invocation.

Consequences to work with, not around:

- Only `core/` ships. `in-progress/` and `deprecated/` are on-disk holding areas
  that never load, so they need no manifest edit and no exclusion rule.
- Promoting or retiring a skill is a **`git mv` between buckets** — the manifest
  does not change.
- The buckets are not tracked when empty; create one at the moment a skill moves
  into it rather than keeping a placeholder.
- Guards resolve skills through the bucket. `skills/core` is the single point in
  `tests/scripts/skill-tree.js` (jest) and `tests/skills/test_skill_structure.py`
  (pytest); the D8 lint treats a bucket segment as generic tree access and keys
  on the skill name inside it.

## Versioning

- `plugin.json` is the canonical version (wins if `marketplace.json` also sets one)
- Every other location that must match is enumerated in
  `scripts/check-version-sync.js` (`LOCATIONS`) and enforced by
  `npm run check:versions` — sync against that list, don't maintain a copy of it
- Bumping the version is critical — plugin code is cached by version, so changes
  without a version bump don't propagate to installed copies

## Marketplace (`.claude-plugin/marketplace.json`)

- Required: `name`, `owner.name`, `plugins` array
- Installation: `claude plugin install arcforge@arcforge-dev`
- Source types: GitHub repo, git URL, npm, pip, relative path

## The Codex manifest pair (`.codex-plugin/` + `.agents/plugins/`)

Codex CLI installs from the same repo root over a second manifest pair. Both
files are hand-maintained alongside their Claude Code twins; nothing generates
one from the other.

| File | Read by | Carries |
|---|---|---|
| `.claude-plugin/plugin.json` | Claude Code | canonical `version`, `skills` array |
| `.claude-plugin/marketplace.json` | Claude Code | `owner`, `plugins[0].version`, `source: "./"` |
| `.codex-plugin/plugin.json` | Codex CLI | mirrored `version`, `skills` **string**, `interface` block |
| `.agents/plugins/marketplace.json` | Codex CLI | `interface.displayName`, `plugins[0].source` object, `policy` |
| `skills/core/<name>/agents/openai.yaml` | Codex CLI | `interface` (required when the file exists), `policy.allow_implicit_invocation` |

Differences that are deliberate, not oversights:

- **`skills` is a bare string** (`"./skills/core/"`), not an array. Both forms
  load identically on codex-cli 0.151.0 — spike-verified byte-identical
  `<skills_instructions>` blocks — so the string is the documented shape and the
  array buys nothing.
- **Skills are namespaced `arcforge:<name>`** on Codex, same as Claude Code's
  `/arcforge:<name>`. All 15 load from one directory entry.
- **User-invoked skills need a second declaration, and it is not a manifest
  edit.** `disable-model-invocation: true` is Claude Code's key and does nothing
  on Codex: spike-verified on codex-cli 0.152.1, `codex debug prompt-input`
  listed all 15 skills — the 3 user-invoked ones included — and Codex's own
  bundled validator rejects the key ("must be false"). Codex's equivalent is a
  skill-local `skills/core/<name>/agents/openai.yaml` with
  `policy.allow_implicit_invocation: false`; adding it to the 3 dropped the same
  listing to 12. These files are **Codex-only metadata Claude Code ignores**, they
  live inside the skill so D1 §4.3 holds, and Codex's validator requires a
  non-empty `interface.display_name` + `interface.short_description` whenever the
  file exists — a policy-only manifest is rejected. The two mechanisms are pinned
  to one set, both directions, by `tests/skills/test_skill_structure.py`.
- **Hooks are kept out of Codex's reach by the registry's filename, not by a
  manifest key.** Codex auto-discovers plugin hooks at `hooks/hooks.json`
  *whether or not a manifest names them* — spike-verified: a fixture whose
  manifest was silent still fired every event it declared there. So arcforge's
  registry lives at `hooks/claude-code.json`, which Codex never looks for. Same
  spike, same paid turn: the renamed fixture produced zero hook firings while
  the positive control produced sixteen. The Codex manifest therefore declares
  no `hooks` key — a statement of intent, not the guard, since the leak fires
  from discovery whether a manifest names the path or not — and
  `npm run check:hooks` gates all three halves — the Claude Code declaration,
  the Codex silence, and the absence of `hooks.json` / `hooks/hooks.json`.
  Do not "simplify" this by moving the registry back to the conventional name:
  that re-opens the leak, and no hook-trust prompt stands in the way of a user
  who grants trust once for some other plugin.
- **`.claude-plugin/marketplace.json` stays.** Codex tolerates it and prefers
  `.agents/plugins/marketplace.json` when both exist — spike-verified with two
  distinguishable marketplace names, no warning either way.
- **Version parity is enforced.** `.codex-plugin/plugin.json` is the 9th row in
  `scripts/check-version-sync.js`. The Codex marketplace schema carries no
  version field, so `.agents/plugins/marketplace.json` is not a version location.
- **`package.json` `files` does not gate the Codex payload.** `codex plugin add`
  from a local marketplace copies the whole source tree into
  `$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>/`. Keep `files`
  correct for npm, but never assume it narrows what Codex ships.

Product-level rationale — why Codex gets skills and nothing else — is
`product/specs/codex-harness.md`.

## Hook Registration

- `hooks/claude-code.json`, declared by `.claude-plugin/plugin.json` as
  `"hooks": "./hooks/claude-code.json"`. Claude Code honours a manifest `hooks`
  path — verified on 2.1.258 via `--plugin-dir` against a negative control (key
  removed ⇒ no hooks ran), so the filename is genuinely free. The conventional
  `hooks/hooks.json` is left empty on purpose; see *The Codex manifest pair* above
- **Residual:** that manifest key is now the ONLY thing loading the registry. If
  a future Claude Code stops honouring it, every hook goes silent and no static
  check can tell — `check:hooks` proves the wiring is self-consistent, not that
  the host reads it. A live session is the only proof. The verification above
  loaded the plugin from a source tree with `--plugin-dir`; a marketplace-installed
  copy resolving components out of the version-keyed cache is untested, and cannot
  be tested before the branch is pushed — check it on the first 6.1.0 install
- Use `${CLAUDE_PLUGIN_ROOT}` (with braces) for all path references in hooks
- Handler types: `command` (shell), `prompt` (LLM evaluation), `agent` (multi-turn subagent)
- Supported events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PreCompact, Stop, SubagentStop, SubagentStart, SessionEnd, PermissionRequest, Notification, TeammateIdle, TaskCompleted

## Environment Variables (available in hooks)

| Variable | Scope | Description |
|----------|-------|-------------|
| `${CLAUDE_PLUGIN_ROOT}` | All hooks | Absolute path to plugin directory |
| `$CLAUDE_PROJECT_DIR` | All hooks | Project root directory |
| `$CLAUDE_ENV_FILE` | SessionStart only | File to persist env vars |
| `$CLAUDE_CODE_REMOTE` | All hooks | `"true"` in web environments, unset in CLI |

There is no arcforge-specific env var, deliberately: skills reach the engine by
subprocess CLI (D1), never by injected environment. Don't introduce one.

`${CLAUDE_PLUGIN_ROOT}` is a **hooks-only** variable — spike-verified UNSET in
skill-triggered Bash. The skill → engine boundary is the bare `arcforge` CLI
(D9): Claude Code adds every loaded plugin's `bin/` to PATH, and `bin/arcforge`
is the shim to `scripts/cli.js` (D1, see `.claude/rules/architecture.md`).

## Plugin Directory Layout

- `.claude-plugin/` — only `plugin.json` + `marketplace.json` go here
- `.codex-plugin/` — only `plugin.json` goes here; the Codex marketplace file
  lives at `.agents/plugins/marketplace.json` (the location Codex looks in)
- Component dirs at plugin root: `skills/` (bucketed, see above), `hooks/` —
  shared by both manifests, never duplicated per target
- Skills become namespaced when installed: `/arcforge:<skill-name>` on Claude
  Code, `arcforge:<skill-name>` on Codex — the bucket is a layout detail, never
  part of the name
- There is no `agents/`, `templates/`, or `commands/` directory. `.agents/` is
  the Codex marketplace location and is not a component dir. Adding a new
  component type is a design decision, not a convenience

## Distribution

- `package.json` `files` array controls the npm payload — it does **not** gate
  what a marketplace install copies (see the Codex manifest pair above)
- Claude Code: GitHub marketplace (`claude plugin install arcforge@arcforge-dev`)
- Codex CLI: `codex plugin marketplace add GregoryHo/arcforge` then
  `codex plugin add arcforge@arcforge-dev`
- Plugin scopes: `user` (default), `project`, `local`, `managed`
