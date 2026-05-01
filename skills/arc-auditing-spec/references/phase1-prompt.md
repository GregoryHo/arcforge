# Phase 1 Prompt Template — arc-auditing-spec

This file is the authoritative layout for the Phase 1 sub-agent prompt.
SKILL.md cites this file; assemble the prompt exactly as shown below and
dispatch all three axis agents in a SINGLE message (three parallel Task
tool uses).

## Template

Substitute each bracketed value with a resolved absolute path, OR the
literal absence marker string `(absent — file does not exist)` when the
artifact is missing. Use the directory absence marker
`(absent — directory does not exist)` for `details/*.xml` specifically.

```
spec-id: <spec-id>

Artifact paths (use absolute paths):
  design.md:      <absolute-path-to-design.md OR "(absent — file does not exist)">
  spec.xml:       <absolute-path-to-spec.xml OR "(absent — file does not exist)">
  details/*.xml:  <absolute-path-to-details/ OR "(absent — directory does not exist)">
  dag.yaml:       <absolute-path-to-dag.yaml OR "(absent — file does not exist)">

You are the <axis-name> audit axis. Follow your agent body exactly.
Return your findings conforming to skills/arc-auditing-spec/references/finding-schema.md.
```

## Path Resolution Rules

Resolve paths before dispatching:

| Artifact | Resolution rule |
|---|---|
| `design.md` | newest file matching `docs/plans/<spec-id>/*/design.md` (glob for the most recent iteration directory) |
| `spec.xml` | `specs/<spec-id>/spec.xml` |
| `details/*.xml` | `specs/<spec-id>/details/` directory |
| `dag.yaml` | `specs/<spec-id>/dag.yaml` |

If a file or directory does not exist, use the absence marker string
verbatim in the prompt — do not omit the line, do not invent a placeholder
path. The axis agents rely on the literal marker to take their
graceful-degradation branches (fr-aa-004).

## Axis-Name Substitution

For each of the three parallel Task invocations, substitute `<axis-name>`
with one of:

- `cross-artifact-alignment`
- `internal-consistency`
- `state-transition-integrity`

Axis names match the agent file names under `agents/arc-auditing-spec-*.md`.
