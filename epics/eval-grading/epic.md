# Epic: eval-grading

## Goal

Add behavioral assertion parsing, deterministic grading against action logs, and mixed grading support to the eval graders.

## File

`scripts/lib/eval-graders.js`

## Features

1. **behavioral-assertion-parser** — Parse [tool_*] assertion prefixes
2. **behavioral-assertion-grader** — Grade assertions against action log
3. **mixed-grader** — Combine behavioral (code) and text (model) assertions

## Dependencies

- eval-core (needs action log from parseActionsFromTranscript)

## Source

- specs/details/behavioral-assertions.xml
- specs/details/mixed-grading.xml
