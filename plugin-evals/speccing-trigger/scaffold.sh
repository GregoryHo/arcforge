#!/usr/bin/env bash
# Lays down the fixture eval-speccing-spec-before-code measured: the tallyhouse
# repo with product/ state, committed at 0.3.0. Mirrors that scenario's
# `## Setup` so routing sees the same situation.
#
# The runner gives this script no path variables, and its cwd is the run's
# working directory, so the fixture is found relative to this file.
set -euo pipefail

case_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fixture="$case_dir/../../evals/fixtures/tallyhouse-product"

test -d "$fixture" || {
  echo "fixture missing: $fixture (case dir: $case_dir)" >&2
  exit 1
}

cp -R "$fixture/." .

git init -q -b main
git config user.email fixture@example.com
git config user.name fixture
git add README.md package.json product src test
git commit -q -m "tallyhouse: 0.3.0, JSON export"
