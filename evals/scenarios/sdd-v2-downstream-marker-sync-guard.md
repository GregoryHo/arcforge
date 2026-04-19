# Eval: sdd-v2-downstream-marker-sync-guard

## Scope

agent

## Target
Regression guard: given a v2 worktree marker + "discard this epic" request, a bare agent writes a discard script whose sync step guards on `.arcforge-epic` presence (not root `dag.yaml`). Kept as a regression guard — if this drops below 100%, the v2 layout has stopped being self-explanatory to a bare agent and the marker schema needs revisiting. Treatment-vs-baseline showed no delta at max_turns=15 (both pass at ceiling), so this is not a useful skill-eval scenario.

## Scenario

I'm inside an arcforge worktree. The epic here has turned out to be the wrong direction and I want to discard everything: mark it blocked in the base DAG, sync the status back, then clean up the worktree and branch.

Do NOT actually run destructive commands yet — just give me the exact bash script you would run, as one code block, with the correct guards for this arcforge setup. I will review before execution.

## Context

This is a v2 arcforge worktree. `.arcforge-epic` exists; `dag.yaml` does NOT exist at the worktree root (the per-spec base DAG lives at `specs/<spec-id>/dag.yaml` in the base checkout, not in this worktree). The script must sync status back to the base before worktree removal — but it must only attempt that sync when we are actually in an arcforge worktree, i.e., guarded by the presence of `.arcforge-epic`.

## Setup

cat > .arcforge-epic << 'EOF'
epic: epic-wrong-direction
spec_id: demo-spec
base_worktree: /tmp/base
base_branch: main
local:
  status: in_progress
  started_at: 2026-04-18T10:00:00Z
synced: null
EOF

mkdir -p src
cat > src/module.js << 'EOF'
// dummy worktree content
module.exports = {};
EOF

git init -q && git add -A && git commit -q -m "worktree state"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

15

## Assertions

- [ ] The agent's returned bash script includes a conditional check on `.arcforge-epic` (e.g., `[ -f .arcforge-epic ]` or `test -f .arcforge-epic`) that guards a sync step before cleanup.
- [ ] The agent's returned bash script does NOT use `[ -f dag.yaml ]` or any guard that checks for a root-level `dag.yaml` (which does not exist in v2 worktrees).
- [ ] The agent's returned bash script calls an arcforge or finish-epic sync command (sync direction to-base, or `arcforge sync`) BEFORE the cleanup / worktree removal step.

## Grader

model

## Grader Config

The agent is expected to return a single bash code block describing the discard procedure. Grade each assertion strictly against the code block's contents. A missing or malformed script should fail all three assertions.

## Trials

3

## Version

1
