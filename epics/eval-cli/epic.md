# Epic: eval-cli

## Goal

Add --no-isolate, --plugin-dir, and --max-turns flags to eval CLI commands.

## File

`scripts/cli.js`

## Features

1. **cli-no-isolate** — --no-isolate flag for eval run
2. **cli-plugin-dir** — --plugin-dir flag for eval run and eval ab
3. **cli-max-turns** — --max-turns flag for eval run and eval ab

## Dependencies

- eval-core (cli passes options to runTrial which uses the new parameters)

## Source

- specs/details/cli-flags.xml
