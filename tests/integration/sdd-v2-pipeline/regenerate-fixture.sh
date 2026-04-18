#!/usr/bin/env bash
# regenerate-fixture.sh — Rebuild specs/demo-spec/spec.xml, details/, dag.yaml
# and epics/ from the design.md seed via arc-refining + arc-planning.
#
# design.md is human-managed and never regenerated. The prompts below pin
# every requirement ID, epic ID, and dependency so regeneration produces
# a stable DAG shape — downstream tests assert against these IDs. See
# docs/plans/spec-driven-refine/handoff-e2e-pipeline-tests.md §11 for the
# full rationale.
#
# Usage:
#   ./regenerate-fixture.sh           # diff only, print apply command
#   ./regenerate-fixture.sh --apply   # copy results back into fixture/
#
# Env overrides:
#   SDD_V2_REGEN_REFINE_TIMEOUT   arc-refining timeout in seconds (default 600)
#   SDD_V2_REGEN_PLAN_TIMEOUT     arc-planning timeout in seconds (default 600)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURE_DIR="$SCRIPT_DIR/fixture"
ARCFORGE_ROOT="${ARCFORGE_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

TIMESTAMP=$(date +%s)
WORK_DIR="/tmp/arcforge-regen/$TIMESTAMP"
REFINE_LOG="$WORK_DIR/refine.log"
PLAN_LOG="$WORK_DIR/plan.log"

DESIGN_REL="docs/plans/demo-spec/2026-04-17/design.md"

APPLY=false
for arg in "$@"; do
    case "$arg" in
        --apply) APPLY=true ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
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

if [ ! -f "$FIXTURE_DIR/$DESIGN_REL" ]; then
    echo "  FATAL: design seed not found at $FIXTURE_DIR/$DESIGN_REL"
    exit 1
fi

# Seed the work dir with the design doc + package.json only. Don't pre-create
# specs/ — that's exactly what arc-refining and arc-planning produce.
cp -R "$FIXTURE_DIR/docs" "$WORK_DIR/"
cp "$FIXTURE_DIR/package.json" "$WORK_DIR/"

# Symlink arcforge scripts so arc-refining's sdd-utils module resolves.
# sdd-utils.js uses only node: builtins, so the symlink works across paths.
ln -s "$ARCFORGE_ROOT/scripts" "$WORK_DIR/scripts"

cd "$WORK_DIR"
git init --quiet
git config user.email 'regen@arcforge.local'
git config user.name 'arcforge regen'
git add . && git commit --quiet -m "regen baseline: design seed"

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
# Stage 2: arc-refining (design.md -> spec.xml + details/)
# ---------------------------------------------------------------------------
echo ""
echo ">>> Stage 2: arc-refining (design -> spec)..."
echo "    Log: $REFINE_LOG"

REFINE_PROMPT="Run arc-refining for spec-id 'demo-spec'. The design doc is at $DESIGN_REL. This is a headless regeneration run — do NOT ask any clarifying questions; make all necessary assumptions and proceed directly.

Write the results to specs/demo-spec/spec.xml and specs/demo-spec/details/core.xml.

Pin these values exactly (do not rename, reorder, or substitute):
- spec_id: demo-spec
- design_path reference inside spec.xml <source>: $DESIGN_REL
- Six requirement IDs, exactly these: fr-parser-001, fr-parser-002, fr-formatter-001, fr-formatter-002, fr-integration-001, fr-integration-002

Version: treat as v1 initial spec (spec_version 1, empty supersedes, delta version 1 iteration 2026-04-17 listing all six requirements as added)."

REFINE_TIMEOUT="${SDD_V2_REGEN_REFINE_TIMEOUT:-600}"
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
            echo "  Increase SDD_V2_REGEN_REFINE_TIMEOUT or check $REFINE_LOG"
            exit 1
        fi
        echo "  WARN: claude -p exited with status $EXIT_STATUS — checking for output..."
    }

# Validate arc-refining output — file presence + spec_id pin preserved.
REFINE_FAILED=0
for f in "specs/demo-spec/spec.xml" "specs/demo-spec/details/core.xml"; do
    if [ -f "$WORK_DIR/$f" ]; then
        echo "  [OK] $f"
    else
        echo "  [MISSING] $f"
        REFINE_FAILED=$((REFINE_FAILED+1))
    fi
done

if [ -f "$WORK_DIR/specs/demo-spec/spec.xml" ]; then
    if grep -q "demo-spec" "$WORK_DIR/specs/demo-spec/spec.xml"; then
        echo "  [OK] spec.xml contains demo-spec"
    else
        echo "  [FAIL] spec.xml does not contain demo-spec"
        REFINE_FAILED=$((REFINE_FAILED+1))
    fi
fi

if [ "$REFINE_FAILED" -gt 0 ]; then
    echo ""
    echo "FATAL: arc-refining produced $REFINE_FAILED missing/invalid file(s)."
    echo "Log: $REFINE_LOG"
    exit 1
fi

git add . && git commit --quiet -m "regen: arc-refining output"
echo "  spec.xml + details/core.xml produced and committed."

# ---------------------------------------------------------------------------
# Stage 3: arc-planning (spec.xml -> dag.yaml + epics/)
# ---------------------------------------------------------------------------
echo ""
echo ">>> Stage 3: arc-planning (spec -> dag + epics)..."
echo "    Log: $PLAN_LOG"

PLAN_PROMPT="Run arc-planning for spec-id 'demo-spec'. specs/demo-spec/spec.xml already exists. This is a headless regeneration run — do NOT ask any questions; work directly from the spec and produce specs/demo-spec/dag.yaml plus the epics/ directory.

Pin the DAG shape exactly (these constraints make the fixture reproducible — downstream tests assert against these IDs):

- Three epics, exactly these IDs: epic-parser, epic-formatter, epic-integration
- epic-parser — no epic-level deps; contains fr-parser-001 and fr-parser-002; features are INDEPENDENT (no intra-epic deps between them)
- epic-formatter — no epic-level deps; contains fr-formatter-001 and fr-formatter-002; fr-formatter-002 depends on fr-formatter-001
- epic-integration — depends on epic-parser AND epic-formatter at the epic level; contains fr-integration-001 and fr-integration-002

Produce:
- specs/demo-spec/dag.yaml (with the above shape)
- specs/demo-spec/epics/<epic-id>/epic.md for each of the three epics
- specs/demo-spec/epics/<epic-id>/features/<feature-id>.md for each of the six features"

PLAN_TIMEOUT="${SDD_V2_REGEN_PLAN_TIMEOUT:-600}"
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
            echo "  Increase SDD_V2_REGEN_PLAN_TIMEOUT or check $PLAN_LOG"
            exit 1
        fi
        echo "  WARN: claude -p exited with status $EXIT_STATUS — checking for output..."
    }

# Validate arc-planning output — the 10 expected files + epic refs in dag.yaml.
PLAN_FAILED=0
REQUIRED_FILES=(
    "specs/demo-spec/dag.yaml"
    "specs/demo-spec/epics/epic-parser/epic.md"
    "specs/demo-spec/epics/epic-formatter/epic.md"
    "specs/demo-spec/epics/epic-integration/epic.md"
    "specs/demo-spec/epics/epic-parser/features/fr-parser-001.md"
    "specs/demo-spec/epics/epic-parser/features/fr-parser-002.md"
    "specs/demo-spec/epics/epic-formatter/features/fr-formatter-001.md"
    "specs/demo-spec/epics/epic-formatter/features/fr-formatter-002.md"
    "specs/demo-spec/epics/epic-integration/features/fr-integration-001.md"
    "specs/demo-spec/epics/epic-integration/features/fr-integration-002.md"
)

for f in "${REQUIRED_FILES[@]}"; do
    if [ -f "$WORK_DIR/$f" ]; then
        echo "  [OK] $f"
    else
        echo "  [MISSING] $f"
        PLAN_FAILED=$((PLAN_FAILED+1))
    fi
done

if [ -f "$WORK_DIR/specs/demo-spec/dag.yaml" ]; then
    EPIC_HITS=$(grep -cE 'epic-parser|epic-formatter|epic-integration' \
        "$WORK_DIR/specs/demo-spec/dag.yaml" || echo 0)
    if [ "$EPIC_HITS" -ge 3 ]; then
        echo "  [OK] dag.yaml references all three epics ($EPIC_HITS hits)"
    else
        echo "  [MISSING] dag.yaml missing one or more epic IDs (only $EPIC_HITS hits)"
        PLAN_FAILED=$((PLAN_FAILED+1))
    fi
fi

if [ "$PLAN_FAILED" -gt 0 ]; then
    echo ""
    echo "FATAL: arc-planning produced $PLAN_FAILED missing/invalid file(s)."
    echo "Log: $PLAN_LOG"
    exit 1
fi

git add . && git commit --quiet -m "regen: arc-planning output"
echo "  dag.yaml + epics/ produced and committed."

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
    # rsync --delete handles the case where regen produces fewer files than
    # the current fixture has (e.g., an epic was removed). Plain cp would
    # leave orphan files behind.
    rsync -a --delete "$WORK_DIR/specs/demo-spec/" "$FIXTURE_DIR/specs/demo-spec/"
    echo "  Fixture updated. Review with 'git diff', then:"
    echo "    ARCFORGE_ROOT=\$PWD bash tests/integration/sdd-v2-pipeline/run-all.sh"
    echo "  If tests pass, commit:"
    echo "    git add tests/integration/sdd-v2-pipeline/fixture/"
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
    echo "    git add tests/integration/sdd-v2-pipeline/fixture/"
    echo "    git commit -m 'chore(tests): regenerate SDD v2 pipeline fixture'"
fi

echo ""
echo "=== Regeneration complete ==="
echo "  Refine log: $REFINE_LOG"
echo "  Plan log:   $PLAN_LOG"
