#!/usr/bin/env bash
# Eval: fr-sc-001-ac3 — no pipeline skill may auto-invoke /arc-auditing-spec.
#
# This is the cheapest possible check for the whole audit contract: a literal
# grep for the slash-command name in the pipeline-skill bodies. If any of them
# ever reference /arc-auditing-spec in a way that implies invocation (vs. pure
# documentation), this script exits non-zero.
#
# Also codified as test_no_pipeline_auto_invocation_of_audit_skill in
# tests/skills/test_skill_arc_auditing_spec.py — keep them in sync.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

FAIL=0
for skill in skills/arc-brainstorming/SKILL.md \
             skills/arc-refining/SKILL.md \
             skills/arc-planning/SKILL.md; do
  if [[ ! -f "$skill" ]]; then
    continue
  fi
  if grep -nF "/arc-auditing-spec" "$skill" > /dev/null 2>&1; then
    echo "FAIL: $skill references /arc-auditing-spec (fr-sc-001-ac3 violation)"
    grep -nF "/arc-auditing-spec" "$skill"
    FAIL=1
  fi
done

if [[ $FAIL -eq 0 ]]; then
  echo "PASS: sc-001-ac3 — no pipeline skill invokes /arc-auditing-spec"
fi
exit $FAIL
