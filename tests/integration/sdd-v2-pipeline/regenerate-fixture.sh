#!/usr/bin/env bash
# regenerate-fixture.sh — Regenerate the SDD v2 pipeline fixture from its design seed.
#
# Rebuilds the structured downstream artifacts (spec.xml, details/, dag.yaml,
# epics/) by re-running arc-refining and arc-planning against the existing
# design.md. Shows a diff against the current fixture so you can review before
# applying.
#
# NEVER re-runs arc-brainstorming. design.md is the human-managed seed.
# Upstream design decisions are managed by humans; downstream structured
# outputs are regenerable from that fixed seed.
#
# Regenerated outputs (only these):
#   specs/demo-spec/spec.xml
#   specs/demo-spec/details/
#   specs/demo-spec/dag.yaml
#   specs/demo-spec/epics/
#
# Usage:
#   ./regenerate-fixture.sh           # diff only, print apply command
#   ./regenerate-fixture.sh --apply   # copy results back into fixture/
#
# Env overrides:
#   SDD_REGEN_REFINE_TIMEOUT   arc-refining timeout in seconds (default 600)
#   SDD_REGEN_PLAN_TIMEOUT     arc-planning timeout in seconds (default 600)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURE_DIR="$SCRIPT_DIR/fixture"
ARCFORGE_ROOT="${ARCFORGE_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

TIMESTAMP=$(date +%s)
WORK_DIR="/tmp/arcforge-regen/$TIMESTAMP"
REFINE_LOG="$WORK_DIR/refine.log"
PLAN_LOG="$WORK_DIR/plan.log"

APPLY=false
for arg in "$@"; do
    [ "$arg" = "--apply" ] && APPLY=true
done

echo "=== SDD v2 Fixture Regeneration ==="
echo "Fixture:    $FIXTURE_DIR"
echo "Plugin dir: $ARCFORGE_ROOT"
echo "Work dir:   $WORK_DIR"
echo ""
echo "NOTE: design.md is the human-managed seed — it is never regenerated."
echo "      Only spec.xml, details/, dag.yaml, and epics/ are rebuilt."
echo ""

mkdir -p "$WORK_DIR"

# ---------------------------------------------------------------------------
# Stage 1: scaffold the working directory
# ---------------------------------------------------------------------------
echo ">>> Stage 1: Scaffolding work directory..."

cp -R "$FIXTURE_DIR/docs" "$WORK_DIR/"
cp "$FIXTURE_DIR/package.json" "$WORK_DIR/"

# Symlink arcforge scripts so arc-refining's sdd-utils validation finds them.
# sdd-utils.js uses only node: builtins, so the symlink is safe across paths.
ln -s "$ARCFORGE_ROOT/scripts" "$WORK_DIR/scripts"

cd "$WORK_DIR"
git init --quiet
git config user.email 'regen@arcforge.local'
git config user.name 'arcforge regen'
git add . && git commit --quiet -m "regen baseline"

mkdir -p .claude
cat > .claude/settings.local.json <<'SETTINGS'
{
  "permissions": {
    "allow": [
      "Read(**)", "Edit(**)", "Write(**)",
      "Bash(git:*)", "Bash(node:*)", "Bash(npm:*)",
      "Bash(mkdir:*)", "Bash(rm:*)", "Bash(mv:*)",
      "Bash(arcforge:*)", "Agent(*)", "Skill(*)"
    ]
  }
}
SETTINGS

echo "  Done — working directory at $WORK_DIR"

# ---------------------------------------------------------------------------
# Stage 2: arc-refining (design.md → spec.xml + details/)
# ---------------------------------------------------------------------------
echo ""
echo ">>> Stage 2: arc-refining (design → spec)..."
echo "    Log: $REFINE_LOG"

REFINE_PROMPT="Run arc-refining for spec-id 'demo-spec'. The design doc is at docs/plans/demo-spec/2026-04-17/design.md. This is a headless regeneration run — do NOT ask any clarifying questions; make all necessary assumptions and proceed directly. Produce specs/demo-spec/spec.xml and specs/demo-spec/details/core.xml. Treat this as an initial spec (spec_version 1, no supersedes, delta version 1 iteration 2026-04-17 listing all requirements as added)."

REFINE_TIMEOUT="${SDD_REGEN_REFINE_TIMEOUT:-600}"
timeout --kill-after=30 "$REFINE_TIMEOUT" \
    claude -p "$REFINE_PROMPT" \
        --plugin-dir "$ARCFORGE_ROOT" \
        --dangerously-skip-permissions \
        --output-format stream-json \
        --verbose \
    > "$REFINE_LOG" 2>&1 \
    || {
        EXIT_STATUS=$?
        if [ "$EXIT_STATUS" -eq 124 ]; then
            echo "  ERROR: arc-refining timed out after ${REFINE_TIMEOUT}s"
            echo "  Increase SDD_REGEN_REFINE_TIMEOUT or check $REFINE_LOG"
            exit 1
        fi
        echo "  WARN: claude -p exited with status $EXIT_STATUS — checking for output..."
    }

if [ ! -f "$WORK_DIR/specs/demo-spec/spec.xml" ]; then
    echo "  FAIL: arc-refining did not produce specs/demo-spec/spec.xml"
    echo "  First 30 lines of log:"
    head -30 "$REFINE_LOG" | sed 's/^/    /' || true
    exit 1
fi
echo "  spec.xml produced."

# ---------------------------------------------------------------------------
# Stage 3: arc-planning (spec.xml → dag.yaml + epics/)
# ---------------------------------------------------------------------------
echo ""
echo ">>> Stage 3: arc-planning (spec → dag + epics)..."
echo "    Log: $PLAN_LOG"

PLAN_PROMPT="Run arc-planning for spec-id 'demo-spec'. specs/demo-spec/spec.xml already exists. This is a headless regeneration run — do NOT ask any questions; work directly from the spec and produce specs/demo-spec/dag.yaml plus the epics/ directory (epics/epic-parser/, epics/epic-formatter/, epics/epic-integration/ with their epic.md and features/ files)."

PLAN_TIMEOUT="${SDD_REGEN_PLAN_TIMEOUT:-600}"
timeout --kill-after=30 "$PLAN_TIMEOUT" \
    claude -p "$PLAN_PROMPT" \
        --plugin-dir "$ARCFORGE_ROOT" \
        --dangerously-skip-permissions \
        --output-format stream-json \
        --verbose \
    > "$PLAN_LOG" 2>&1 \
    || {
        EXIT_STATUS=$?
        if [ "$EXIT_STATUS" -eq 124 ]; then
            echo "  ERROR: arc-planning timed out after ${PLAN_TIMEOUT}s"
            echo "  Increase SDD_REGEN_PLAN_TIMEOUT or check $PLAN_LOG"
            exit 1
        fi
        echo "  WARN: claude -p exited with status $EXIT_STATUS — checking for output..."
    }

if [ ! -f "$WORK_DIR/specs/demo-spec/dag.yaml" ]; then
    echo "  FAIL: arc-planning did not produce specs/demo-spec/dag.yaml"
    echo "  First 30 lines of log:"
    head -30 "$PLAN_LOG" | sed 's/^/    /' || true
    exit 1
fi
echo "  dag.yaml + epics/ produced."

# ---------------------------------------------------------------------------
# Stage 4: diff generated output against current fixture
# ---------------------------------------------------------------------------
echo ""
echo ">>> Stage 4: Diff (generated vs. current fixture)"
echo ""

DIFF_OUT=$(diff -r \
    "$FIXTURE_DIR/specs" \
    "$WORK_DIR/specs" \
    2>/dev/null || true)

if [ -z "$DIFF_OUT" ]; then
    echo "  No diff — generated output matches the current fixture exactly."
else
    echo "$DIFF_OUT" | head -100
    DIFF_LINES=$(echo "$DIFF_OUT" | wc -l | tr -d ' ')
    if [ "$DIFF_LINES" -gt 100 ]; then
        echo "  ... (diff truncated at 100 lines — full diff in work dir)"
    fi
fi

# ---------------------------------------------------------------------------
# Stage 5: apply or print manual command
# ---------------------------------------------------------------------------
echo ""

if $APPLY; then
    echo ">>> Stage 5: Applying generated output to fixture (--apply)..."
    rsync -a --delete "$WORK_DIR/specs/demo-spec/" "$FIXTURE_DIR/specs/demo-spec/"
    echo "  Fixture updated. Review with 'git diff', then:"
    echo "    git add tests/integration/sdd-v2-pipeline/fixture/specs/"
    echo "    git commit -m 'chore(tests): regenerate SDD v2 pipeline fixture'"
else
    echo ">>> Stage 5: Review and apply manually"
    echo ""
    echo "  Generated artifacts: $WORK_DIR/specs/"
    echo ""
    echo "  To apply to the fixture:"
    echo "    rsync -a --delete $WORK_DIR/specs/demo-spec/ $FIXTURE_DIR/specs/demo-spec/"
    echo ""
    echo "  Or re-run with --apply to copy automatically."
    echo ""
    echo "  After applying, review the diff and commit:"
    echo "    git add tests/integration/sdd-v2-pipeline/fixture/specs/"
    echo "    git commit -m 'chore(tests): regenerate SDD v2 pipeline fixture'"
fi

echo ""
echo "=== Regeneration complete ==="
echo "  Refine log: $REFINE_LOG"
echo "  Plan log:   $PLAN_LOG"
