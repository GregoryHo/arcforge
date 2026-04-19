#!/usr/bin/env bash
# Scaffold the SDD v2 pipeline fixture into a trial directory.
#
# Copies the hand-authored per-spec fixture (specs/demo-spec/..., docs/...,
# package.json) into the target dir, initializes a fresh git repo, and writes
# a permissive .claude/settings.local.json so `claude -p --dangerously-skip-permissions`
# can operate freely during integration tests.
#
# Usage: ./scaffold.sh <target-directory>

set -euo pipefail

TARGET_DIR="${1:?Usage: $0 <target-directory>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# Copy the fixture tree (specs/, docs/, package.json). We use cp -R with a
# trailing /. on each source so hidden files are captured too.
cp -R "$SCRIPT_DIR/specs" .
cp -R "$SCRIPT_DIR/docs" .
cp "$SCRIPT_DIR/package.json" .

# Initialize a fresh git repo for arcforge CLI commands that expect one
# (expand creates worktrees via `git worktree add`).
git init --quiet
git config user.email 'test@arcforge.local'
git config user.name 'arcforge test'

# Permissive allow-list — tests run under --dangerously-skip-permissions but
# the settings file is kept for parity with other integration fixtures.
mkdir -p .claude
cat > .claude/settings.local.json <<'SETTINGS'
{
  "permissions": {
    "allow": [
      "Read(**)",
      "Edit(**)",
      "Write(**)",
      "Bash(git:*)",
      "Bash(node:*)",
      "Bash(npm:*)",
      "Bash(mkdir:*)",
      "Bash(rm:*)",
      "Bash(mv:*)",
      "Bash(arcforge:*)",
      "Agent(*)",
      "Skill(*)"
    ]
  }
}
SETTINGS

git add .
git commit --quiet -m "fixture baseline: demo-spec SDD v2 layout"

echo "Scaffolded sdd-v2-pipeline fixture at: $TARGET_DIR"
