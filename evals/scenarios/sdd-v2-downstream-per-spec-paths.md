# Eval: sdd-v2-downstream-per-spec-paths

## Scope

workflow

## Target
SDD v2 downstream per-spec path reading: agent inside a worktree with `.arcforge-epic` (carrying spec_id) must read per-spec epic artifacts at `specs/<spec-id>/epics/<epic-id>/epic.md`, not v1 root-level decoys at `epics/<epic-id>/epic.md`.

## Scenario

You are in an arcforge worktree. The `.arcforge-epic` marker identifies which spec and epic this worktree is for.

List the IDs of every feature defined for the current epic. Return only the feature IDs, one per line, in the exact order they appear in the epic spec. Do not implement anything — just read the epic spec and list the feature IDs.

## Context

This is a per-spec SDD v2 arcforge project. Truth for epic artifacts lives under `specs/<spec-id>/epics/<epic-id>/` — NOT at the repo root. Conflicting files may exist at legacy paths; trust only the per-spec layout.

## Setup

mkdir -p specs/demo-spec/epics/epic-alpha specs/demo-spec/details epics/epic-alpha

cat > .arcforge-epic << 'EOF'
epic: epic-alpha
spec_id: demo-spec
base_worktree: /tmp/base
base_branch: main
local:
  status: in_progress
  started_at: 2026-04-18T10:00:00Z
synced: null
EOF

cat > specs/demo-spec/spec.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<spec>
  <overview>
    <spec_id>demo-spec</spec_id>
    <spec_version>1</spec_version>
    <status>active</status>
    <title>Demo Spec</title>
    <description>Fixture spec for the per-spec-paths eval.</description>
  </overview>
</spec>
EOF

cat > specs/demo-spec/dag.yaml << 'EOF'
epics:
  - id: epic-alpha
    name: Alpha Epic
    status: in_progress
    spec_path: specs/demo-spec/epics/epic-alpha/epic.md
    worktree: epic-alpha
    depends_on: []
    features:
      - id: feat-real-1
        name: Real feature one
        status: pending
      - id: feat-real-2
        name: Real feature two
        status: pending
      - id: feat-real-3
        name: Real feature three
        status: pending
blocked: []
EOF

cat > specs/demo-spec/epics/epic-alpha/epic.md << 'EOF'
# Epic: Alpha (per-spec canonical copy)

spec_id: demo-spec
epic: epic-alpha

## Features

- feat-real-1 — Real feature one
- feat-real-2 — Real feature two
- feat-real-3 — Real feature three
EOF

# v1 decoy at root — WRONG feature list, DO NOT read this
cat > epics/epic-alpha/epic.md << 'EOF'
# Epic: Alpha (legacy root-level copy — DO NOT USE)

## Features

- feat-legacy-x — WRONG: legacy feature x
- feat-legacy-y — WRONG: legacy feature y
EOF

# Legacy root dag.yaml also present as noise
cat > dag.yaml << 'EOF'
epics:
  - id: epic-alpha
    features:
      - id: feat-legacy-x
      - id: feat-legacy-y
blocked: []
EOF

git init -q && git add -A && git commit -q -m "fixture"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

10

## Assertions

- [ ] The agent's final answer lists exactly three feature IDs: `feat-real-1`, `feat-real-2`, `feat-real-3`, in that order.
- [ ] The agent did NOT include any feature id starting with `feat-legacy` in its answer.
- [tool_called] Read:specs/demo-spec/epics/epic-alpha/epic.md

## Grader

mixed

## Grader Config

Text assertions check the agent's final textual answer. Grade strictly — the answer must list the three real feature IDs and must exclude the legacy decoys. Whitespace, bullet characters, and extra commentary are acceptable as long as the three real IDs appear and no `feat-legacy-*` appears.

## Trials

3

## Version

1
