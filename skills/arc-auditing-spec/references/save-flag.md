# --save Flag — arc-auditing-spec

Reference for the `--save` flag's output path, hash derivation, and
directory-creation rules. SKILL.md carries the summary + all pytest-pinned
tokens; this file is the worked-example authority.

## Output Path

When `--save` is present: after Phase 5 has printed the Decisions table,
the main session writes the full Phase 2 report + Phase 5 Decisions table
to:

```
~/.arcforge/reviews/<project-hash>/<spec-id>/<YYYY-MM-DD-HHMM>.md
```

The filename uses 24-hour time. A concrete example:

```
~/.arcforge/reviews/a1b2c3/arc-auditing-spec/2026-04-24-1435.md
```

## Project-Hash Derivation

Obtain `<project-hash>` via a subprocess call — do NOT reimplement the
hash inline. Reimplementing risks drift from the canonical hash in
`scripts/lib/worktree-paths.js`, which in turn breaks the one-project-one-hash
guarantee that ties review paths to worktree paths (fr-oi-005-ac3).

Run this one-liner from the project root:

```bash
node -e "const { hashRepoPath } = require('./scripts/lib/worktree-paths.js'); console.log(hashRepoPath(process.cwd()));"
```

The 6-char hex string printed is `<project-hash>`.

## Parent-Directory Creation

Ensure the parent directories exist before writing:

```bash
mkdir -p ~/.arcforge/reviews/<project-hash>/<spec-id>/
```

## Zero-Write Default

Without `--save`: **zero files are written anywhere.** No file is written
at any point during the audit unless the `--save` flag is explicitly present
on the invocation. The default is read-only; `--save` is the ONE carve-out,
and only to `~/.arcforge/reviews/` — never into `specs/`, `docs/`, or any
project-tracked path.
