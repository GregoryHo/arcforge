#!/usr/bin/env bash
# Eval: fr-sc-002-ac3 — each audit sub-agent's tool allowlist is read-only,
# enforced structurally in the agent frontmatter (not in prose).
#
# Checks each of the three agent files for:
#   - presence of a `tools:` frontmatter list
#   - only {Read, Grep, Glob} appear
#   - NONE of {Edit, Write, Bash, NotebookEdit} appear
#
# NOTE (M-2): This shell script uses a bespoke awk/grep YAML parser which is
# fragile against the inline-array tools form (`tools: [Read, Grep, Glob]`).
# The canonical check is now the pytest assertion `test_agent_read_only_tool_grant`
# in tests/skills/test_skill_arc_auditing_spec.py, which uses yaml.safe_load
# and handles both block-list and inline-array YAML forms correctly.
# This shell script is retained as a secondary smoke test only.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

AGENTS=(
  agents/arc-auditing-spec-cross-artifact-alignment.md
  agents/arc-auditing-spec-internal-consistency.md
  agents/arc-auditing-spec-state-transition-integrity.md
)

FAIL=0
for agent in "${AGENTS[@]}"; do
  if [[ ! -f "$agent" ]]; then
    echo "FAIL: $agent does not exist"
    FAIL=1
    continue
  fi

  # Extract YAML frontmatter (between first and second '---' line)
  frontmatter="$(awk '/^---$/{c++; next} c==1' "$agent")"

  if ! grep -q "^tools:" <<<"$frontmatter"; then
    echo "FAIL: $agent missing \`tools:\` frontmatter field (sc-002-ac3)"
    FAIL=1
    continue
  fi

  # Extract the tools block (from `tools:` through next top-level key)
  tools_block="$(awk '
    /^tools:/ {inblock=1; next}
    inblock && /^[A-Za-z]/ && !/^  / {inblock=0}
    inblock {print}
  ' <<<"$frontmatter")"

  # Any forbidden tool → fail
  for bad in Edit Write Bash NotebookEdit; do
    if grep -qw "$bad" <<<"$tools_block"; then
      echo "FAIL: $agent grants forbidden tool '$bad' (sc-002-ac3 read-only violation)"
      FAIL=1
    fi
  done

  # Every listed tool must be in the allowlist
  listed="$(grep -oE '[A-Z][A-Za-z]+' <<<"$tools_block" || true)"
  for tool in $listed; do
    case "$tool" in
      Read|Grep|Glob) ;;
      *)
        echo "FAIL: $agent tool '$tool' not in read-only allowlist {Read, Grep, Glob}"
        FAIL=1
        ;;
    esac
  done
done

if [[ $FAIL -eq 0 ]]; then
  echo "PASS: sc-002-ac3 — all three audit agents have read-only tool grants"
fi
exit $FAIL
