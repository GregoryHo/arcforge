# Contributing to arcforge

Welcome! arcforge is a skill-based agent toolkit for Claude Code. Contributions are welcome across skills, the CLI engine, and hooks. Keep in mind that skills target AI agents as their primary consumers, not just humans.

## Table of Contents

- [Philosophy & Principles](#philosophy--principles)
- [How we work](#how-we-work)
- [Quick Start](#quick-start)
- [Plugin Development](#plugin-development)
- [Contributing Skills](#contributing-skills)
- [Contributing to the CLI Engine](#contributing-to-the-cli-engine)
- [Contributing Hooks](#contributing-hooks)
- [Test Runner Map](#test-runner-map)
- [PR Process](#pr-process)
- [Guidelines](#guidelines)
- [Getting Help](#getting-help)

---

## Philosophy & Principles

arcforge is opinionated. Before contributing, understand these principles:

### The Iron Law

```
NO SKILL WITHOUT A FAILING TEST FIRST
```

This is TDD applied to process documentation. You write pressure scenarios, watch agents fail without your skill (baseline), write the skill, watch agents comply, then close loopholes. If you wrote the skill before testing, delete it and start over.

### Core Beliefs

- **Incremental progress over big bangs** — small changes that compile and pass tests
- **Evidence over claims** — if you didn't watch an agent fail without the skill, you don't know if it teaches the right thing
- **Boring and obvious** — choose the simple, readable solution over the clever one

See [`CLAUDE.md`](CLAUDE.md) for the command reference and `.claude/rules/` for the standing conventions.

---

## How we work

arcforge is maintained **spec-driven**. `product/` holds the product's living state — one spec per feature area, a semver roadmap, an append-only Decision Log, and a backlog of un-scheduled wishes — and `product/AGENTS.md` is the guide to keeping it current. Engineering conventions stay in `.claude/rules/`; `product/` answers *what the toolkit does, for whom, and in what order*.

Three consequences for a PR:

- **A behavior change ships with its spec change in the same PR.** The spec describes the *current* product, not the original plan. A merged PR whose spec still describes the old behavior is incomplete, not tidy-later.
- **A choice becomes a `D-NNN`** in the ROADMAP Decision Log, cited from the spec it pins. Recorded decisions are never edited or renumbered — reverse one by appending a superseding entry and flipping one line on the old one.
- **`npm run check:product` gates the mechanical half** — one `← we are here` marker, a gap-free Decision Log, every supersession flipped, spec headers matching their governing roadmap row, and a `Tag` cell that agrees with its row's status. It cannot tell whether what you wrote is *true*; that is what review is for.

Two project-local agents make this cheaper: `pm` writes `product/**` and nothing else, `qa` runs the gates and changes nothing. See `.claude/agents/README.md`.

Add one line to your pre-PR check, alongside the runners and the static checks:

- [ ] relevant `product/specs/*.md` updated in this PR (+ `D-NNN` recorded when a choice was made)

---

## Quick Start

```bash
# 1. Fork and clone
gh repo fork GregoryHo/arcforge --clone
cd arcforge

# 2. Install dependencies (one package.json, one lockfile — hooks are not a
#    separate npm project)
npm install
pip install pytest pyyaml    # required for npm run test:skills

# 3. Create a branch
git checkout -b feat/my-contribution   # or fix/..., docs/...

# 4. Make your changes (see sections below)

# 5. Run all 5 test runners
npm test

# 6. Run the 6 static checks — CI gates on these and npm test does not cover them
npm run check:versions && npm run check:docs && npm run check:cli-consumers \
  && npm run check:hooks && npm run check:eval-targets && npm run check:product
npm run lint

# 7. Submit PR
git push -u origin feat/my-contribution
```

---

## Plugin Development

When developing inside the arcforge repo, you need the plugin to load from your local checkout instead of the cached marketplace version. The project handles this automatically:

- **`.claude/settings.json`** disables the marketplace install (`arcforge@arcforge-dev`) at project scope, so it never conflicts with local changes.
- **`--plugin-dir .`** tells Claude Code to load the plugin directly from the filesystem. This bypasses the version cache entirely — no version bump needed, changes are picked up immediately.

### Starting a Dev Session

```bash
npm run dev
```

This runs `claude --plugin-dir .`, which starts Claude Code with the local plugin loaded. You can also run the command directly if you prefer.

### Hot Reload Workflow

1. Edit skill files, hooks, or other plugin components
2. In the Claude session, run `/reload-plugins` <!-- doc-ref-lint: ignore R4 Claude Code built-in command, not an arcforge skill -->
3. Changes are reflected immediately — no restart needed

### Verifying Local Plugin

arcforge sets no environment variable of its own, so verify by behavior instead. Inside a dev session:

```
/arcforge:using
```

If the router loads, the plugin is loaded. To confirm it came from your checkout rather than the cache, edit a line of `skills/core/using/SKILL.md`, run `/reload-plugins`, and invoke it again — your edit should be visible. <!-- doc-ref-lint: ignore R4 Claude Code built-in command, not an arcforge skill -->

### Notes

- `--plugin-dir` requires Claude Code v2.1.74+
- The marketplace version continues to work in all other projects — this override is session-scoped
- You do NOT need to bump `version` in `plugin.json` during development

---

## Contributing Skills

Skills are the most common contribution type. Read this section carefully.

### Prerequisites

**You must read [`skills/core/writing-skills/SKILL.md`](skills/core/writing-skills/SKILL.md) first.** It carries the authoring methodology: invocation choice, description register, information hierarchy, guidance form, and the evidence a skill needs before it ships.

### Naming Convention

| Rule | Details |
|------|---------|
| Prefix | None — the plugin namespace already supplies one (`/arcforge:<name>`) |
| Match | `name` in the frontmatter must equal the directory name |
| Case | kebab-case |
| Voice | Verb-first, active |
| Form | Gerund (-ing) for process skills |

**Good names:**
- `brainstorming` — single action, gerund
- `code-review` — the artifact under review, when the gerund reads worse

**Bad names:**
- `arc-brainstorming` — prefixed; the plugin namespace already supplies `/arcforge:` <!-- doc-ref-lint: ignore R4 deliberate bad-name teaching example, not a skill reference -->
- `coordinator` — agent-noun, use a gerund
- `debug` — bare verb, use `debugging`

### Directory Structure

Skills live in lifecycle buckets. Only `core/` ships; `in-progress/` and `deprecated/` are on-disk holding areas that never load, so promoting or retiring a skill is a `git mv` between buckets with no manifest edit.

```
skills/
  core/
    <name>/
      SKILL.md              # Main skill file (required)
      references/           # Only if needed (heavy reference, scripts)
```

### Frontmatter Format

The schema is **frozen**, and its single authority is
`docs/decisions/skill-schema.md` — by that document's own rule it must
not be restated elsewhere, so this section deliberately does not copy the field
table. The mechanical form of the schema is `tests/skills/test_skill_structure.py`:
run `npm run test:skills` and the failures name exactly what the schema demands
(legal keys, `name` == directory, the description register for your invocation
mode, and the body line cap).

Two warnings worth carrying up front, because agents trip on them most:

- **Never summarize the skill's workflow in the description** — Claude may
  follow the description instead of reading the full skill.
- There is **no exception table** for the body line cap: if a skill doesn't
  fit, split it into `references/` or move behavior into the CLI.

### Iron Law Process

1. **RED** — Run pressure scenarios with a subagent WITHOUT the skill. Document baseline behavior and rationalizations verbatim.
2. **GREEN** — Write the skill addressing those specific failures. Re-run scenarios WITH the skill. Agent should now comply.
3. **REFACTOR** — Find new rationalizations, add explicit counters, re-test until bulletproof.

Behavioral evidence comes from the eval harness (`arcforge eval`), not from a self-report. See `/arcforge:evaluating` and `.claude/rules/eval.md`.

### Test File

No per-skill test file is needed. A single generic checker, `tests/skills/test_skill_structure.py`, discovers every `skills/core/*/SKILL.md` dynamically and validates the frozen frontmatter schema, `name` == directory, the description register, section structure, cross-references, referenced supporting files, and the line budget.

Adding or removing a skill is a deliberate three-part edit in one commit:

1. the skill directory under `skills/core/`
2. its row in the Skill Map in `skills/core/using/SKILL.md` — a tested bijection, so a missing row fails CI
3. `EXPECTED_SKILL_COUNT` in `tests/skills/test_skill_structure.py`

### Self-Containment (D1)

A skill directory is a **closed unit**. Nothing under `skills/<bucket>/<name>/` may require, import, or source anything outside that directory — not the engine, not a sibling skill. Engine functionality is reached exactly one way: a subprocess call to the bare `arcforge` CLI, which is on PATH because Claude Code adds every loaded plugin's `bin/` to it.

Skill prose must not name engine internals (`scripts/lib/...`) or rely on environment variables that aren't set in skill Bash. `CLAUDE_PLUGIN_ROOT` is hooks-only and verified UNSET in skill-triggered Bash; arcforge sets no variable of its own.

### Quick Checklist

- [ ] Read `skills/core/writing-skills/SKILL.md` before starting
- [ ] Name has no prefix and matches the directory name
- [ ] Frontmatter, description register, and body budget satisfy `docs/decisions/skill-schema.md` — `npm run test:skills` names any violation
- [ ] Nothing outside the skill directory is required/imported/sourced
- [ ] Ran baseline scenario WITHOUT skill (RED)
- [ ] Skill addresses specific baseline failures (GREEN)
- [ ] Closed loopholes from additional testing (REFACTOR)
- [ ] Router row added and `EXPECTED_SKILL_COUNT` updated in the same commit
- [ ] `npm run test:skills` passes

---

## Contributing to the CLI Engine

### Architecture

- Entry point: `scripts/cli.js` — the engine's only public surface
- Modules: `scripts/lib/` — canonical source, imported directly by hooks
- Five command groups: `worktree`, `loop`, `eval`, `learn`, `obsidian`
- No external runtime dependencies — Node.js standard library only

The dependency arrow points one way (D8): `scripts/**` and `hooks/**` must never reference a skill under `skills/`. A jest suite asserts this with an allowlist that is empty and must stay empty.

### Tests

- **Jest**: `npm run test:scripts` — tests in `tests/scripts/`, plus an 80% line floor over `scripts/lib/`
- **Custom runner**: `npm run test:node` — tests in `tests/node/` (CLI manifest contract, YAML parser, locking)

Any new file under `scripts/lib/` lands inside the coverage floor, so ship its tests in the same commit.

### Conventions

- No external dependencies (keep `devDependencies` minimal)
- Use `execFileSync` with argument arrays instead of `exec` to prevent shell injection
- Adding or changing a command or flag means updating `scripts/lib/cli-manifest.js` — the doc linter and the consumer check both read it, and a second hardcoded copy is forbidden
- Follow existing module patterns in `scripts/lib/`

---

## Contributing Hooks

Hooks extend Claude Code behavior through event-driven JavaScript modules. See [`hooks/README.md`](hooks/README.md) for full documentation.

### Architecture

```
hooks/
  hooks.json              # Hook registration
  __tests__/              # Node --test suites
  <hook-name>/
    main.js               # Entry point
    README.md             # Hook documentation
```

Six components are registered across six lifecycle events: `session-tracker` (SessionStart, Stop), `user-message-counter` (UserPromptSubmit), `secrets-guard` (PreToolUse), `observe` (PreToolUse, PostToolUse), `compact-suggester` (PostToolUse), and `pre-compact` (PreCompact).

### Hook Events

| Event | Trigger | Common Use Cases |
|-------|---------|------------------|
| SessionStart | startup, resume, clear, compact | Context injection, session file creation |
| PreToolUse | Before tool execution | Guard rails, observation |
| PostToolUse | After tool completion | Observation, threshold suggestions |
| UserPromptSubmit | When user submits prompt | Counters, input inspection |
| PreCompact | Before context compaction | State checkpointing |
| Stop | When Claude stops | Finalize session, diary capture |

### Shared Utilities

Import from `scripts/lib/utils.js` (canonical location) for common operations:
- `readStdinSync()` — read stdin for hook chaining
- `readFileSafe(path, default)` — safe file read with fallback
- `writeFileSafe(path, content)` — safe file write with directory creation

### Conventions

- Must be Node.js (not bash) for cross-platform support
- Silent catch — a hook must never crash the session
- Use `${CLAUDE_PLUGIN_ROOT}` (with braces) for path references in `hooks.json`
- Use `path.join()` for file paths; temp files go to `os.tmpdir()`
- Tests: `npm run test:hooks` (runs `hooks/__tests__/` with Node `--test`)
- The schema of `hooks.json` is checked by `npm run check:hooks`

---

## Test Runner Map

arcforge uses five separate test runners. **All must pass before submitting a PR.**

| Runner | Command | Location | What It Tests |
|--------|---------|----------|---------------|
| Jest | `npm run test:scripts` | `tests/scripts/` | Engine + the contract lints (D1, D8, router bijection, task-list schema) |
| Node `--test` | `npm run test:hooks` | `hooks/__tests__/` | Hook behavior |
| Custom | `npm run test:node` | `tests/node/` | CLI manifest contract, YAML parser, locking |
| pytest | `npm run test:skills` | `tests/skills/` | Skill structure validation |
| Bash | `npm run test:observer-daemon` | `tests/observer-daemon/` | Observer daemon behavior |
| **All** | **`npm test`** | All above | **Run this before every PR** |

Six static checks run in CI and are **not** part of `npm test`:

| Command | Guards |
|---|---|
| `npm run check:versions` | Version strings in sync across the locations in `scripts/check-version-sync.js` |
| `npm run check:docs` | Docs don't promise paths, commands, or flags the engine lacks |
| `npm run check:cli-consumers` | CLI callers match the CLI surface |
| `npm run check:hooks` | `hooks/hooks.json` schema |
| `npm run check:eval-targets` | Eval scenarios don't target things that no longer exist |
| `npm run check:product` | `product/` roadmap, Decision Log, and spec headers stay consistent |

---

## PR Process

### Branch Naming

```
feat/add-brainstorming-skill
fix/cli-yaml-parser-edge-case
docs/update-hook-readme
```

### Commit Messages

Use conventional commits:

```
feat(skills): add debugging skill
fix(cli): handle empty YAML files gracefully
docs(hooks): document session-tracker events
test(skills): add pressure scenarios for executing
```

### For Skill PRs

You must document Iron Law compliance in the PR description:
1. What baseline behavior you observed (RED)
2. How the skill addresses those failures (GREEN)
3. What loopholes you closed (REFACTOR)

### PR Template

A PR template is provided at `.github/PULL_REQUEST_TEMPLATE.md`. Fill it out completely.

### Doc-reference gate (`npm run check:docs`)

CI runs a doc-reference linter (`scripts/check-doc-refs.js`, engine in `scripts/lib/doc-refs.js`) over the user-facing markdown surface (`skills/`, `docs/guide/`, `hooks/`, and `README.md`). It fails the build when a doc makes a promise the engine does not keep:

| Rule | Catches |
|------|---------|
| R1 | A repo-relative path in a code span (under `scripts/`, `skills/`, `hooks/`, `.claude-plugin/`) that does not resolve to a real file or directory. |
| R2 | A CLI invocation naming a command, or a `--flag`, that the CLI manifest (`scripts/lib/cli-manifest.js`) does not declare. |
| R3 | A `--json` output field promise that is not in that command's pinned manifest output shape. |
| R4 | A doc's claim that a skill exists, when it does not resolve to a skill directory. |

All four rules gate the build. Run it locally before opening a PR:

```bash
npm run check:docs
```

When a finding is a genuine false positive — an illustrative or placeholder path that is not a real reference — suppress it on that line with an escape-hatch comment whose **reason is mandatory** (a reason-less directive is itself a finding):

```
<!-- doc-ref-lint: ignore R1 illustrative path example, not a real repo file -->
```

Use the escape hatch sparingly. If you find yourself adding many suppressions, the rule is probably mis-firing — fix the linter (its data comes from the manifest, never a second hardcoded copy) rather than papering over it.

---

## Guidelines

### Do

- Read existing skills, hooks, and tests before writing new ones
- Follow existing patterns and conventions
- Run `npm test` before submitting (all 5 runners must pass)
- Run the 6 static checks so CI doesn't catch what you could have
- Include tests for new functionality
- Keep skills inside the 250-line cap; use `references/` for overflow
- Use `execFileSync` over `exec` (prevents shell injection)

### Don't

- Include sensitive data (API keys, tokens, local paths)
- Summarize skill workflow in the description field
- Skip the Iron Law — no exceptions, not even for "simple additions"
- Reach outside a skill directory from inside it, or reference a skill from engine or hook code
- Use `@`-file syntax to cross-reference skills (force-loads context)
- Add external runtime dependencies without strong justification
- Use bash for hooks (Node.js required for cross-platform)
- Create skills for one-off solutions or standard practices already documented elsewhere

---

## Getting Help

- **GitHub Issues**: Report bugs or suggest features
- **Key files to read first**:
  - [`README.md`](README.md) — Project overview and installation
  - [`CLAUDE.md`](CLAUDE.md) — Command reference
  - `.claude/rules/architecture.md` — The boundaries every contribution has to respect
  - [`skills/core/writing-skills/SKILL.md`](skills/core/writing-skills/SKILL.md) — Complete skill authoring guide
  - [`hooks/README.md`](hooks/README.md) — Hook architecture and events

---

Thanks for contributing to arcforge!
