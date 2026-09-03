# codex-harness — spec

> Status: building v6.1.0 · [ROADMAP](../ROADMAP.md)
> Living document — keep in sync with the shipped behavior; record the *why* of any
> change in the ROADMAP Decision Log.
> Tracks: `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`,
> `.claude-plugin/plugin.json`, `hooks/claude-code.json`,
> `skills/core/*/agents/openai.yaml`,
> `scripts/check-version-sync.js`, `scripts/check-hooks-schema.js`

## Purpose

arcforge installs on a second host. Codex CLI users get the skills — the part of
the toolkit that is portable markdown — from the same source tree Claude Code
installs from, with no second copy of anything to keep in sync.

The point is not parity. It is that a Codex user gets the fifteen skills and an
honest, up-front account of what they do not get, instead of a plugin that looks
whole and fails halfway through a workflow.

## Scope

- **In scope:** the manifest pair Codex reads; what loads on Codex and what does
  not; how arcforge's Claude Code hooks are kept out of Codex; the version-parity
  gate across the two manifests; the two install paths; the boundary as
  documented to users.
- **Out of scope:** porting hooks, learning, eval, or the loop to Codex
  (`codex-hooks-adapter` and `harness-neutral-model-runner` are Backlog wishes);
  getting the `arcforge` CLI onto Codex's PATH (`codex-cli-on-path`); narrowing
  what the Codex install copies — a local marketplace install copies the whole
  source tree and no `files`-style filter is known to gate it; the skills
  themselves, which are [skill-system](skill-system.md)'s, and the CLI contract
  they lean on, which is [cli](cli.md)'s.

## Behavior

### Packaging

- **B-1 One tree, two manifests.** Claude Code reads `.claude-plugin/`; Codex
  reads `.codex-plugin/plugin.json` plus `.agents/plugins/marketplace.json`. The
  manifest pair, and the filename of the hook registry (B-2), are the *entire*
  difference between the two targets: one `skills/` tree, one `hooks/` tree, one
  engine, no per-host copy of any component, and no build step that emits one
  target from the other. Both Codex files are hand-maintained beside their
  Claude Code twins.
- **B-2 Skills port; hooks are invisible to Codex by construction.** All fifteen
  skills load on Codex from a single `"skills": "./skills/core/"` entry and
  appear namespaced `arcforge:<name>`. Hooks, the learning subsystem, the eval
  harness and the unattended loop do not run there: they are built on Claude
  Code's hook protocol and on spawning `claude`.

  Not running is not enough, though — Codex *auto-discovers* plugin hooks at
  `hooks/hooks.json` <!-- doc-ref-lint: ignore R1 names the path that must NOT exist; its absence is the guard (check:hooks) --> whether or not a manifest names them, so
  arcforge's Claude-shaped hooks would otherwise execute inside Codex sessions.
  The registry therefore lives at `hooks/claude-code.json`, a path Codex does
  not look for, and `.claude-plugin/plugin.json` names it explicitly with
  `"hooks": "./hooks/claude-code.json"`. The Codex manifest declares no `hooks`
  key, and Codex does not read `.claude-plugin/plugin.json` at all when
  `.codex-plugin/plugin.json` exists, so that declaration cannot reach it either.

  `npm run check:hooks` gates all three halves: the Claude Code declaration is
  exactly that path, the Codex manifest is silent, and neither `hooks.json` nor
  `hooks/hooks.json` <!-- doc-ref-lint: ignore R1 names the path that must NOT exist; its absence is the guard (check:hooks) --> exists. A file at either discovered path is a finding even
  when nothing references it, because discovery does not need a reference. What
  is deliberately *not* relied on: Codex's hook-trust gate, which asks the user
  to hold a security boundary that one careless grant defeats.
- **B-2a The explicit-intent gate is re-declared in Codex's own vocabulary.**
  `disable-model-invocation: true` is Claude Code's mechanism and buys nothing on
  Codex — verified against codex-cli 0.152.1, where `codex debug prompt-input`
  listed all fifteen skills, the three user-invoked ones included, in the
  `<skills_instructions>` block the model selects from. Codex's bundled validator
  goes further and rejects the key outright — "frontmatter field
  `disable-model-invocation` must be false". Codex spells the same intent
  `policy.allow_implicit_invocation: false` in a skill-local
  `skills/core/<name>/agents/openai.yaml`; with those three files in place the
  same command listed twelve skills, the three gated ones absent, while staying
  explicitly reachable — that is what `allow_implicit_invocation` gates, per
  Codex's own field docs: "not injected into the model context by default, but can
  still be invoked explicitly".

  The file is skill-local, so D1 §4.3 holds and no manifest edit is involved. It
  carries the `interface.display_name` and `interface.short_description` that
  Codex's validator requires whenever the manifest exists, and nothing else —
  Claude Code never reads it. The two mechanisms are asserted as one set in
  `tests/skills/test_skill_structure.py`, in both directions, so a skill cannot
  gain the flag without the policy or keep the policy after losing the flag.
- **B-3 The CLI does not reach Codex, and says so at the call site.** The bare
  `arcforge` command is Claude Code's mechanism: it puts every loaded plugin's
  `bin/` on PATH, and Codex does not — verified twice with a fixture plugin,
  once under an inherited environment and once with Codex's own environment
  policy: `command -v <plugin bin>` was empty both times, and the same turn's
  `PATH` dump carried no Codex plugin `bin/` entry while the Claude Code plugin
  `bin/` directories inherited from the parent shell were plainly visible in it.
  On Codex the eight engine-free skills work in full; the seven CLI-backed ones
  load and read correctly but report `command not found` at their first engine
  step. That failure is loud and located, which is the accepted cost — the
  alternative, a skill that constructs its own path to the engine, would break
  the black-box boundary that makes the engine safe to change (D1/D9 in
  `.claude/rules/architecture.md`).
- **B-4 Version parity is a gate, not a habit.** `.codex-plugin/plugin.json`
  carries its own `version`, so it is the ninth row in
  `npm run check:versions` and a bump that misses it fails CI. The Codex
  marketplace schema carries no version field, so `.agents/plugins/marketplace.json`
  is deliberately not a version location.

### What a user meets

- **B-5 Two install paths, both first-class.** Claude Code:
  `/plugin marketplace add GregoryHo/arcforge` then
  `/plugin install arcforge@arcforge-dev`. Codex: `codex plugin marketplace add`
  on the same repo, then `codex plugin add arcforge@arcforge-dev`. Neither is a
  footnote on the other; the README documents both, and the release audit checks
  both.
- **B-6 The boundary is documented before install, not discovered after.** The
  README's Codex section names which eight skills work fully, which seven degrade
  to `command not found`, which subsystems do not run at all, and how a skill is
  actually reached on each host — a `/arcforge:<name>` slash command on Claude
  Code, the composer's `$` mention picker on Codex, which has no slash commands for
  skills. The router carries that same per-host note above its Skill Map, whose
  rows are written in the Claude Code spelling; without it the index reads as a
  list of commands a Codex user cannot run. A Codex user
  should be able to decide whether to install without running anything — and
  without being handed a security chore: because of B-2 there is no hook-trust
  prompt to answer and nothing to "leave untrusted".

### What this must not become

- **B-7 No source-level split.** No `platform/` directories, no per-host skill
  variants, no conditional branches in a skill body on which host is running.
  If a future host needs behavior arcforge cannot express in one tree, that is a
  decision to record, not a directory to add.

## Data / domain model

The manifest pair — four hand-maintained files, each owned by one host:

| File | Read by | Carries |
|---|---|---|
| `.claude-plugin/plugin.json` | Claude Code | canonical `version`; `skills` as an array; `hooks` naming the registry |
| `.claude-plugin/marketplace.json` | Claude Code | `owner`, `plugins[0].version`, `source: "./"` |
| `.codex-plugin/plugin.json` | Codex CLI | mirrored `version`; `skills` as a string; `interface` block; no `hooks` |
| `.agents/plugins/marketplace.json` | Codex CLI | `interface.displayName`; `plugins[0].source` object; `policy` |
| `skills/core/<name>/agents/openai.yaml` | Codex CLI | `interface` (required when present); `policy.allow_implicit_invocation` for the three user-invoked skills |

Shapes worth knowing, all verified against codex-cli 0.151.0 rather than inferred:

- Codex's `skills` is a **bare string**, not an array. Both forms load
  identically — the rendered `<skills_instructions>` blocks were byte-identical
  across the two — so the string is the documented shape and the array buys
  nothing.
- Codex resolves skills through a **roots table**: one absolute root per source,
  with per-skill entries written relative to it. arcforge's root is
  `<codex-home>/plugins/cache/arcforge-dev/arcforge/<version>/skills/core`. A
  verification that counts absolute per-skill paths will read zero; count the
  fifteen `arcforge:<name>` entries instead.
- **`.codex-plugin/plugin.json` wins outright.** A fixture whose Codex manifest
  declared no components, while its `.claude-plugin/plugin.json` declared both a
  skills directory and a `hooks` path, loaded neither — the Claude Code manifest
  was cached but never read. This is what makes the `hooks` key on the Claude
  Code manifest safe to add.
- `.claude-plugin/marketplace.json` **stays**. Codex tolerates it and prefers
  `.agents/plugins/marketplace.json` when both exist, with no warning either way.
- A local marketplace install copies the **whole source tree** into the plugin
  cache — `package.json`'s `files` array gates the npm payload and nothing about
  Codex. So `hooks/claude-code.json` *is* present in a Codex install; being
  present is harmless, being discoverable was not.

## Decisions

- **D-002** — Codex as a wrapped second harness was directionally decided at
  6.0.0 and left unscheduled.
- **D-013** — Codex packaging ships at 6.1.0, skills only, with the hook registry
  renamed out of Codex's discovery path.

See the [ROADMAP Decision Log](../ROADMAP.md#decision-log).
