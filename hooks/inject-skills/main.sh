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

# Read arc-using content
using_content=$(cat "${PLUGIN_ROOT}/skills/arc-using/SKILL.md" 2>&1 || echo "Error reading arc-using skill")

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

using_escaped=$(escape_for_json "$using_content")

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<EXTREMELY_IMPORTANT>\nYou have arcforge skills.\n\nARCFORGE_ROOT=${PLUGIN_ROOT}\n\n**Below is the full content of your 'arc-using' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${using_escaped}\n</EXTREMELY_IMPORTANT>"
  }
}
EOF

exit 0
