# Backlog — Tallyhouse

Un-scheduled ideas. A line here is a wish, not a commitment.

## Exporting

- **csv-export** — pull a report out as CSV, the way JSON already works, so a
  run can be opened in a spreadsheet without a conversion step.
- **xlsx-export** — the same for real spreadsheet files · needs: csv-export.

## Reporting

- **run-diff** — show what changed between two runs of the same saved query.
- **row-limits** — cap the rows a single run may store, with a visible truncation
  marker rather than a silent cut.

## Operations

- **schedule-backoff** — stop re-running a schedule that has failed several
  times in a row, and say so on the report.
