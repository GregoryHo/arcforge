#!/usr/bin/env bash
# SessionStart hook for arcforge plugin

set -euo pipefail

# Determine plugin root directory (two levels up from inject-skills/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Inject ARCFORGE_ROOT into Bash tool environment (for SKILL_ROOT fallback)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export ARCFORGE_ROOT=\"${PLUGIN_ROOT}\"" >> "$CLAUDE_ENV_FILE"
fi

# Attended-mode opt-in: when the project carries an .arcforge-attended marker,
# export ARCFORGE_MODE=attended so the refiner's attended draft-then-ratify path
# and `arcforge ratify` are reachable for a human at the terminal. The marker is
# the ONLY opt-in mechanism — a deliberate, per-project file the human drops in;
# sessions the loop spawns never inherit it (the loop scrubs ARCFORGE_MODE from
# spawn env — see docs/guide/sdd-pipeline.md). CLAUDE_PROJECT_DIR is provided to
# every hook; if it is unset we simply do not opt in (we never parse stdin here).
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -n "${CLAUDE_PROJECT_DIR:-}" ] &&
  [ -f "${CLAUDE_PROJECT_DIR}/.arcforge-attended" ]; then
  echo "export ARCFORGE_MODE=attended" >> "$CLAUDE_ENV_FILE"
fi

# Escape outputs for JSON using pure bash
escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

bootstrap_context=$(cat <<EOF_CONTEXT
ArcForge skills are available for this project.

ARCFORGE_ROOT=${PLUGIN_ROOT}

Use ArcForge as a minimal, composable toolkit:
- Respect higher-priority instructions, explicit user constraints, and harness/eval isolation.
- Prefer the smallest useful workflow; skills are tools, not laws.
- For ArcForge workflow tasks, read or invoke the relevant skill on demand.
- For routing help or a full skill index, invoke the arcforge:arc-using skill.
- For simple answers, read-only inspection, grading, or isolated evals, proceed directly when no workflow is needed.
EOF_CONTEXT
)

bootstrap_escaped=$(escape_for_json "$bootstrap_context")

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${bootstrap_escaped}"
  }
}
EOF

exit 0
