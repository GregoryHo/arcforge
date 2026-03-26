#!/usr/bin/env bash
# NOTE: .cmd extension is historical; this is a bash script used as the hook
# dispatcher. It is invoked by hooks.json for inject-skills/main.sh.
set -euo pipefail

HOOK_SCRIPT="$1"
if [ -z "${HOOK_SCRIPT}" ]; then
    echo "Usage: run-hook.cmd <hook-script>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
"${SCRIPT_DIR}/${HOOK_SCRIPT}"
