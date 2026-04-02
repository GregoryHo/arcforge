# Epic: eval-dashboard

## Goal

Update dashboard to display behavioral assertions, action logs, new scenario fields, turns used, and mixed grading results.

## Files

- `scripts/eval-dashboard.js`
- `scripts/eval-dashboard-ui.html`

## Features

1. **dashboard-behavioral-assertions** — Display behavioral assertion type + match status
2. **dashboard-action-log** — Action log timeline tab in transcript modal
3. **dashboard-scenario-fields** — Show Plugin Dir and Max Turns in scenario detail
4. **dashboard-turns-used** — Show turns used vs max turns in trial results
5. **dashboard-mixed-grading** — Show code/model scores separately for mixed grading

## Dependencies

- eval-core (actions field in results)
- eval-grading (behavioral assertion scores, mixed grading data)

## Source

- specs/details/dashboard-updates.xml
