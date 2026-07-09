# Porting arcforge to a New Platform

> How to add a fifth platform — an IDE, CLI, or agent runner beyond Claude
> Code, Codex, Gemini CLI, and OpenCode — so arcforge skills are discoverable
> and runnable there.
>
> This is a **contributor** guide. It lives in `docs/guide/` alongside the
> user-facing guides because that is arcforge's single documentation surface;
> [`CONTRIBUTING.md`](../../CONTRIBUTING.md) frames it as contributor work. When
> this guide and the code disagree, the code wins — fix the guide.

The integration mechanism differs across platforms and keeps changing. This
guide teaches the **invariants** — the things that must hold no matter the
mechanism — then points you at the closest live reference implementation to
copy. It is written in two layers: Parts 1–3 are principles and a
supportability check; Parts 4–5 are a prescriptive procedure an agent can
execute.

---

## Part 1 — How arcforge runs on any platform

arcforge is the same content everywhere. Skills are the source of truth and are
**platform-agnostic** (see [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md)).
What changes per platform is a thin delivery layer with three components:

1. **Skills (platform-agnostic).** Everything in `skills/` is shared verbatim.
   Skills describe *actions* — "dispatch a subagent", "track task progress",
   "search the web" — and never name a specific tool. This is what lets one
   skill body run on all platforms without edits.

2. **Tool mapping (per-platform).** Each platform needs the action vocabulary
   translated into its real tool names. That lives in
   `skills/arc-using/references/<platform>-tools.md` — see the existing
   `skills/arc-using/references/codex-tools.md` and
   `skills/arc-using/references/opencode-tools.md`.

3. **Bootstrap (per-platform, degradable).** At session start, a minimal
   bootstrap tells the model that arcforge skills exist and where the install
   root is. The shared text is `hooks/inject-skills/bootstrap.txt`; how it
   reaches the model is platform-specific (Part 3). Unlike some toolkits,
   arcforge does **not** require auto-injection — two shipped platforms (Codex,
   Gemini) run without it and degrade to native skill discovery (Part 2).

### Two rules that make this work

**1. Skills name actions, not tools.** Do **not** edit skill bodies to fit your
platform. A port adds a tool-mapping reference and a delivery shim; it never
reaches into `skills/*/SKILL.md` to swap tool names. If you find yourself
editing a skill to make the port work, the fix belongs in the tool mapping.

**2. The user runs the platform's own install; your port's code never silently
edits the user's config.** Every arcforge install is a documented action the
user runs — a marketplace install, or the `ln -s` commands in an `INSTALL.md`.
What is off-limits is your *port's code* reaching into a user's global or
personal config to inject anything behind their back. If the install mechanism
genuinely can't carry the bootstrap, that is a limitation to document (Part 2's
degraded mode) — never a license to hand-edit the user's files.

---

## Part 2 — Can this platform be supported?

A platform can host arcforge only if it satisfies four invariants. Check them
before writing code.

### (a) Skill discovery

The model must be able to load a skill's full content on demand — either through
a **native skill mechanism** (Claude Code's `Skill` tool, Codex/Gemini native
skill discovery) or, absent one, a **file-read fallback** so that
`skills/*/SKILL.md` are reachable with the platform's read tool. A platform with
neither a skill tool nor file-read cannot work.

### (b) Can run `scripts/cli.js`

Several skills shell out to the arcforge CLI. `scripts/cli.js` is Node.js
standard library only, **zero external runtime dependencies** — so the platform
needs a shell plus `node` on `PATH`, nothing more. This is a hard requirement,
not degradable: skills like arc-coordinating and arc-looping are inert without a
runnable CLI.

### (c) ARCFORGE_ROOT resolution

Skills locate the install root through `ARCFORGE_ROOT`. Each platform resolves
it differently, and a port must pick one:

- **Injected at session start** — Claude Code's `hooks/inject-skills/main.sh`
  writes `export ARCFORGE_ROOT="${PLUGIN_ROOT}"` into `$CLAUDE_ENV_FILE`, so
  every Bash tool call sees it.
- **Resolved at runtime by the plugin** — `.opencode/plugins/arcforge.js`
  computes the root from its own module path (`path.resolve(__dirname, '../..')`)
  and the Codex manifest `.codex-plugin/plugin.json` declares `"skills": "./skills/"`
  relative to the manifest.
- **Standard-clone fallback** — platforms with no hook (Codex, Gemini) rely on
  skills falling back to the standard clone location `~/.agents/arcforge`, which
  the user overrides by exporting `ARCFORGE_ROOT` in their shell profile if they
  cloned elsewhere. See `.codex/INSTALL.md` and `.gemini/INSTALL.md`.

### (d) Context injection at session start (preferred, not required)

Injecting the bootstrap at session start — the arcforge analog of a "you have
skills" preamble — is **strongly preferred** but degradable. The shared source
is `hooks/inject-skills/` (`main.sh` reads `bootstrap.txt`, substitutes
`${ARCFORGE_ROOT}`, and emits it). OpenCode re-reads the same `bootstrap.txt`
from its plugin.

**Degraded mode (no auto-injection).** If the platform cannot inject at session
start, it must instead rely on **native skill discovery** surfacing
`arc-using`'s description so the model loads it on demand, with `ARCFORGE_ROOT`
resolved via the `~/.agents/arcforge` fallback. This is exactly how Codex and
Gemini ship today — no bootstrap, discovery does the triggering. The floor below
that (a platform lacking even native discovery) is a documented manual
`SKILL.md` read, but prefer native discovery whenever the platform offers it.

### Capability checklist

| Capability | Required? | Fallback if absent |
|---|---|---|
| Skill discovery (native tool **or** file-read of `SKILL.md`) | **Required** | Read `skills/*/SKILL.md` directly with the read tool |
| Run `scripts/cli.js` (shell + `node`, zero deps) | **Required** | None — hard requirement |
| File read / write / edit | **Required** | None |
| ARCFORGE_ROOT resolution | **Required** | `~/.agents/arcforge` standard-clone fallback |
| Session-start context injection | Preferred | Native skill discovery surfaces `arc-using`; `~/.agents/arcforge` for the root |
| Subagent / task dispatch | Degradable | Run roles sequentially in-session (the tool map says how — never fabricate a `Task` call) |
| Task / todo tracking | Degradable | arcforge's durable `.arcforge/sdd/progress.md` ledger, or a Markdown checklist |
| Web fetch / search | Degradable | Consult the harness, or skip |
| Hooks | **Claude-only** | Other platforms skip — no arcforge feature depends on a hook for correctness |

---

## Part 3 — Choose your integration shape

There are three structural shapes, distinguished by *how the bootstrap reaches
the model*. Pick the one matching what your platform exposes, then copy that
reference.

### Shape A — Shell-hook (injects)

The platform runs a shell command at session start and reads JSON from its
stdout. The script exports `ARCFORGE_ROOT`, reads `bootstrap.txt`, and prints
the platform's JSON shape.

- Reference: `hooks/inject-skills/main.sh` (+ `hooks/inject-skills/bootstrap.txt`),
  registered via `.claude-plugin/plugin.json` (Claude Code auto-discovers
  `skills/` and `hooks/hooks.json` by convention).
- The JSON field name and nesting are **per-platform** — Claude Code expects
  `{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "…" } }`.
  Get your platform's exact shape right, or the bootstrap never injects.

### Shape B — In-process plugin (injects)

The platform loads a JS/TS module with a message/system lifecycle callback.
Skills are discovered separately (OpenCode uses a symlink — see its
`INSTALL.md`); the module's job is to inject the bootstrap in code.

- Reference: `.opencode/plugins/arcforge.js` — its `experimental.chat.system.transform`
  callback reads the **same** `bootstrap.txt`, wraps it in `<EXTREMELY_IMPORTANT>`
  tags, and pushes it onto the system array. It caches the built string at module
  level (the callback fires on every request).
- This shape carries a version field in the module, so it is version-bearing
  (Part 4, Step 6).

### Shape C — Native discovery + symlink (degraded, no injection)

The platform discovers skills natively but has no session-start injection point.
There is no bootstrap; the platform surfaces skill descriptions and the model
loads `arc-using` on demand. `ARCFORGE_ROOT` resolves via `~/.agents/arcforge`.

- Reference (marketplace manifest): `.codex-plugin/plugin.json` (declares
  `"skills": "./skills/"` and `"hooks": {}` so Codex does not adopt the Claude
  Code hooks) plus the marketplace entry `.agents/plugins/marketplace.json`.
  Install docs: `.codex/INSTALL.md`.
- Reference (per-skill symlink): Gemini expects each skill folder directly under
  `~/.gemini/skills/`, so the install symlinks each one. Install docs:
  `.gemini/INSTALL.md`.

### Routing table

| If the platform… | Use shape | Copy from |
|---|---|---|
| runs a shell command at session start and reads its stdout | A (shell-hook) | `hooks/inject-skills/main.sh` + `.claude-plugin/plugin.json` |
| loads a JS/TS plugin module with a message/system lifecycle callback | B (in-process) | `.opencode/plugins/arcforge.js` |
| only discovers skills natively (marketplace manifest or symlinked dir), no injection point | C (degraded) | `.codex-plugin/` (marketplace) or `.gemini/` (per-skill symlink) |

Shapes compose: the *skill-discovery* mechanism and the *bootstrap* mechanism
need not be the same shape (OpenCode discovers via symlink but injects in code).
Decide the two questions separately.

---

## Part 4 — The porting procedure

### Step 1 — Study the closest reference implementation

Open the files named in Part 3 for your shape and read them end to end. The
patterns below are summaries; the code is the spec.

### Step 2 — Add the manifest / plugin shim through the platform's own install mechanism

Create whatever the platform uses to recognize the plugin, and make it
installable by a command the *user* runs — never by your code editing the user's
config (Part 1, rule 2).

- **Shape A:** a `*-plugin/plugin.json` (see `.claude-plugin/plugin.json`) plus a
  session-start hook registration.
- **Shape B:** the module the platform loads (see `.opencode/plugins/arcforge.js`)
  plus the package metadata it needs to be discovered.
- **Shape C:** a marketplace manifest declaring `"skills": "./skills/"` (see
  `.codex-plugin/plugin.json`) **or** the per-skill symlink recipe (Gemini).

### Step 3 — Wire the bootstrap (or accept the degrade)

- **Shape A / B:** get `bootstrap.txt` in front of the model at session start.
  **Reuse the shared file — do not fork the bootstrap text.** Both `main.sh` and
  `arcforge.js` read `hooks/inject-skills/bootstrap.txt` so every platform emits
  an identical bootstrap; a second copy will drift.
- **Shape C:** there is no injector. Confirm native discovery surfaces
  `arc-using` and that `ARCFORGE_ROOT` resolves via `~/.agents/arcforge`. Document
  the degrade in the platform's `INSTALL.md` the way `.codex/INSTALL.md` does.

### Step 4 — Add the tool mapping

Create `skills/arc-using/references/<platform>-tools.md`, translating the action
vocabulary into the platform's real tools. Cover: read/write/edit a file, run a
shell command, search files, fetch/search the web, **dispatch a subagent**
(including any config flag to enable it), and **track task progress**. Follow the
structure of `skills/arc-using/references/codex-tools.md`.

**Get the real tool names from the platform, never invent them** — in a live
session, ask the model to list the exact machine names of every tool it can call.
Where the platform has no native skill tool, state plainly in the mapping that
reading `SKILL.md` is the blessed way to load a skill, so the model doesn't think
it's bypassing the mechanism.

### Step 5 — Add an install doc

Write `<platform>/INSTALL.md` following `.opencode/INSTALL.md` (in-process) or
`.codex/INSTALL.md` (native discovery): prerequisites (Git, Node), the clone to
`~/.agents/arcforge`, the install command or symlink, a verify step, updating,
and uninstalling. The only supported install action is a command the user runs.

### Step 6 — Register the version (only if the platform has a version-bearing manifest)

If your shim carries its own version string (like `.opencode/plugins/arcforge.js`
or `.codex-plugin/plugin.json`), it must move in lockstep with every release:

1. Add an entry (file path + a version extractor) to the `LOCATIONS` array in
   `scripts/check-version-sync.js`.
2. Add a row to the canonical version table in
   `.claude/skills/arc-releasing/SKILL.md` (the "all 10 canonical locations"
   list) and bump the count language accordingly.

If instead your platform rides an already-tracked file (e.g. the repo-root
`package.json`), there is nothing new to register.

---

## Part 5 — Acceptance test

A port is done when a fresh session on the new platform, in a throwaway
directory, passes all applicable checks:

1. **Skill discovery works.** Ask the model to invoke `arc-using`; it loads and
   can route to another skill. (On a no-skill-tool platform, confirm it reads the
   `SKILL.md` on demand.)
2. **The CLI runs.** `arcforge schema` (or `node scripts/cli.js schema`) prints
   the `dag.yaml` schema. `schema` needs no project state, so it is the cleanest
   zero-setup smoke check; `arcforge status --json` also works inside an
   arcforge project.
3. **(Shape A / B only) The bootstrap is present.** Confirm the bootstrap text
   reached the model — e.g. ask "what is `ARCFORGE_ROOT`?" and check it reports
   the install path, or grep the platform's session log for the bootstrap marker.
   For Shape C this check is **N/A** — checks 1 and 2 are the bar.

Capture the transcript; a new-platform PR should show discovery and the CLI
working (and, for A/B, the bootstrap injected).

---

## Appendix — Reference implementations

Use the files as the live index; when in doubt, read them, not this table.

| Platform | Integration style | Entry point | Bootstrap | Tool mapping | Install |
|---|---|---|---|---|---|
| Claude Code | Shell-hook (A) | `.claude-plugin/plugin.json` + `hooks/inject-skills/` | `main.sh` → `hookSpecificOutput.additionalContext` (reads `bootstrap.txt`) | native `Skill` tool | marketplace (`.claude-plugin/marketplace.json`) |
| OpenCode | In-process plugin (B) | `.opencode/plugins/arcforge.js` | `experimental.chat.system.transform` (same `bootstrap.txt`) | `skills/arc-using/references/opencode-tools.md` | symlink (`.opencode/INSTALL.md`) |
| Codex | Native discovery + marketplace (C) | `.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json` | none — degraded to native discovery | `skills/arc-using/references/codex-tools.md` | marketplace or symlink (`.codex/INSTALL.md`) |
| Gemini CLI | Native discovery + per-skill symlink (C) | per-skill symlinks into `~/.gemini/skills/` | none — degraded to native discovery | none shipped (actions are vendor-neutral) | symlink (`.gemini/INSTALL.md`) |
