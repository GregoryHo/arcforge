# CLI Invocation Convention

> The one blessed way to invoke the arcforge CLI, on all four platforms
> (Claude Code, Codex, Gemini CLI, OpenCode). Skills, templates, agents,
> and docs that invoke the CLI follow this convention; this document is
> the authority they defer to.

## The blessed form

Always invoke the CLI through `ARCFORGE_ROOT`:

```bash
node "${ARCFORGE_ROOT}/scripts/cli.js" <cmd>
```

Examples:

```bash
node "${ARCFORGE_ROOT}/scripts/cli.js" status
node "${ARCFORGE_ROOT}/scripts/cli.js" next
node "${ARCFORGE_ROOT}/scripts/cli.js" loop --pattern dag --max-runs 50
```

Why one form: arcforge is installed in different places on different
platforms, and your working directory is your *own* project — not the
arcforge checkout. A single variable-anchored form works everywhere the
variable resolves, and never depends on cwd.

## Resolving ARCFORGE_ROOT

### Claude Code (plugin install)

Nothing to do. The SessionStart hook (`inject-skills`) exports
`ARCFORGE_ROOT` pointing at the installed plugin directory, so the
blessed form works as-is in every plugin session.

### Codex / Gemini CLI / OpenCode (fallback header)

These platforms have no SessionStart hook, so `ARCFORGE_ROOT` is unset.
All three install guides standardize the clone location at
`~/.agents/arcforge`, which makes a one-line fallback valid everywhere.
Put this header at the top of any shell block that invokes the CLI:

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
if [ ! -d "$ARCFORGE_ROOT" ]; then
  echo "ERROR: ARCFORGE_ROOT=$ARCFORGE_ROOT does not exist. Set ARCFORGE_ROOT to your arcforge checkout." >&2
  exit 1
fi
node "${ARCFORGE_ROOT}/scripts/cli.js" <cmd>
```

How it behaves per platform:

| Platform | `ARCFORGE_ROOT` before header | Result |
|----------|-------------------------------|--------|
| Claude Code | Set by SessionStart hook | Hook value wins — `:=` only assigns when unset/null |
| Codex / Gemini CLI / OpenCode | Unset | Falls back to `~/.agents/arcforge` (the standard clone location) |
| Any, nonstandard install | Unset, clone elsewhere | Existence check reports the bad path; export `ARCFORGE_ROOT` manually |

Do **not** use the abort form `"${ARCFORGE_ROOT:?}"` instead — on the
three non-Claude platforms the variable starts unset, so a bare `:?`
turns the very first command into a dead end. The `:=` fallback plus an
existence check is the blessed pattern.

## Skill-local scripts: SKILL_ROOT

Some skills ship their own `scripts/` directory (e.g.
`skills/arc-coordinating/scripts/`). **Any skill that ships its own
`scripts/` directory** may anchor those scripts with a `SKILL_ROOT`
fallback header — this is an attribute-based rule, not an enumerated
allowlist of skill names:

```bash
: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/<skill-name>}"
if [ ! -d "$SKILL_ROOT" ]; then
  echo "ERROR: SKILL_ROOT=$SKILL_ROOT does not exist. Set ARCFORGE_ROOT or SKILL_ROOT manually." >&2
  exit 1
fi
node "${SKILL_ROOT}/scripts/<script>.js" <args>
```

`SKILL_ROOT` is for a skill's *own* files only. References to the shared
engine (`scripts/lib/`, `scripts/cli.js`) always go through
`${ARCFORGE_ROOT}` directly.

## The one forbidden form: same-command inline assignment

The **only** forbidden invocation form is assigning `ARCFORGE_ROOT` in
the same command that expands it:

```bash
# FORBIDDEN — POSIX expansion trap
ARCFORGE_ROOT=/opt/arcforge node "${ARCFORGE_ROOT}/scripts/cli.js" status
```

POSIX shells expand the argument words *before* the temporary inline
assignment takes effect, so `"${ARCFORGE_ROOT}"` expands to the
*previous* value. If the variable was unset, the command actually run
is `node /scripts/cli.js status`:

```text
$ unset ARCFORGE_ROOT
$ ARCFORGE_ROOT=/opt/arcforge node "${ARCFORGE_ROOT}/scripts/cli.js" status
Error: Cannot find module '/scripts/cli.js'
```

If you need to pin a nonstandard location, export first on its own
line — then the blessed form works:

```bash
export ARCFORGE_ROOT=/opt/arcforge
node "${ARCFORGE_ROOT}/scripts/cli.js" status
```

## Bare form: local checkout only

```bash
node scripts/cli.js <cmd>
```

The bare relative form is limited to a **local checkout** of the
arcforge repository — it only works when your cwd is the arcforge repo
root (the package is not published to npm, so there is no global
`arcforge` binary). It must not appear in skills, templates, agents, or
any instruction that runs from a user's project, because there is no
`scripts/cli.js` relative to the user's cwd there.

## Quick reference

| Form | Status | Where |
|------|--------|-------|
| `node "${ARCFORGE_ROOT}/scripts/cli.js" <cmd>` | Blessed | Everywhere |
| `: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"` + existence check | Blessed header | Non-Claude platforms (harmless no-op under Claude Code) |
| `: "${SKILL_ROOT:=${ARCFORGE_ROOT:-}/skills/<name>}"` | Allowed | Any skill shipping its own `scripts/` directory |
| `ARCFORGE_ROOT=... node "${ARCFORGE_ROOT}/..."` | **Forbidden** | Nowhere — same-command inline assignment never resolves |
| `node scripts/cli.js <cmd>` | Restricted | Local checkout of the arcforge repo only |
