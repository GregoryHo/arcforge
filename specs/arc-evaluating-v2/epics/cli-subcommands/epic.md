# Epic: New CLI Subcommands — preflight / lint / audit

## Summary
Wave-2 automation: arc eval preflight runs baseline pilot trials and blocks unpreflighted scenarios (hash-tracked, k<5 exempt from INSUFFICIENT_DATA); arc eval lint validates scenario schema; arc eval audit aggregates claims + weak_assertions across benchmark history.

## Source
Detail file: `specs/arc-evaluating-v2/details/cli-subcommands.xml`

## Dependencies
- grader-trials

## Features
- **cli-001** — arc eval preflight subcommand (source: `fr-cli-001`)
- **cli-002** — arc eval lint subcommand (source: `fr-cli-002`)
- **cli-003** — arc eval audit subcommand (source: `fr-cli-003`)
