# Dashboard UI Test Plan

Server-side endpoints are covered by `eval-dashboard.test.js` (31 tests, all passing).
The following documents manual verification criteria for the browser-side behavior
that cannot be driven by jest/jsdom due to EventSource and fetch dependencies.

## fr-dash-001 — Two-Tab Layout: Outputs and Benchmark

### ac1: Tab click renders matching content without reload
- Open dashboard, click "Benchmark" tab → benchmark content renders without page reload
- Click "Outputs" tab → outputs content renders without page reload
- Verify no full page navigation occurs (URL path stays the same)

### ac2: URL fragment encodes tab + trial — copy-paste URL reopens same view
- Navigate to Outputs > select scenario > select run > advance to trial 3
- Observe URL fragment: `#tab=outputs&scenario=<name>&runId=<id>&condition=results&trial=2`
- Copy URL, open new tab, paste URL → same trial loads automatically
- Click Benchmark tab → fragment updates to `#tab=benchmark`
- Reload page → Benchmark tab is active

### ac3: Benchmark tab shows duration/token deltas alongside pass-rate
- Navigate to Benchmark tab
- Click on a scenario that has A/B results (baseline + treatment conditions)
- Verify "Resource Deltas (Treatment vs Baseline)" section appears
- Verify rows: Duration, Input Tokens, Output Tokens with Baseline/Treatment/Delta columns
- For regressions (treatment > 2x baseline): delta shows red "(!!)" suffix

## fr-dash-002 — Auto-Saving Feedback Textbox per Eval

### ac1: 2-second debounce write to feedback.json
- Navigate to Outputs > scenario > run > trial
- Type in the feedback textarea
- Wait <2 seconds → no save occurs yet (status shows "Saving…")
- Stop typing for 2 seconds → "Saved" appears, feedback.json created at
  `evals/results/<scenario>/<runId>/feedback.json`
- Verify file contents: `{ "trial-N": "...", "last_saved": "<ISO>" }`

### ac2: Prior feedback pre-populates textarea
- Save feedback for trial 1
- Navigate away (click a different scenario)
- Navigate back to the same run + trial 1
- Textarea is pre-populated with previously saved feedback

### ac3: Save state indicator transitions Saving… ↔ Saved
- Type in textarea → indicator immediately shows "Saving…" (amber)
- After 2s idle → indicator shows "Saved" (green)
- Type again → indicator returns to "Saving…"

## fr-dash-003 — Keyboard Navigation Between Trials

### ac1: ArrowRight advances trial when cursor is not in input
- Navigate to Outputs > trial view (multiple trials)
- Click somewhere on the page outside the textarea
- Press ArrowRight → advances to next trial, URL fragment updates
- Press ArrowLeft → returns to previous trial

### ac2: ArrowLeft/Right inside textarea moves cursor, NOT trial
- Click inside the feedback textarea
- Press ArrowRight → cursor moves right within textarea (no trial change)
- Press ArrowLeft → cursor moves left within textarea (no trial change)

### ac3: Boundary no-op (no wrap, no error)
- Navigate to first trial (trial 0)
- Press ArrowLeft → nothing happens, no error, stays on trial 0
- Navigate to last trial
- Press ArrowRight → nothing happens, no error, stays on last trial

## fr-dash-004 — SSE Real-Time Monitoring

### ac1: New trials appear within 5s via SSE
- Start an eval run in a terminal
- Open the dashboard to the Outputs tab > matching run
- Within 5 seconds of a trial completing, the trial count updates
  (refresh is debounced at 2s after SSE event)

### ac2: SSE URL path unchanged
- SSE endpoint remains at `/api/events` (same as before refactor)
- External tooling that connects to `/api/events` still works

### ac3: Client disconnect releases subscription (server-side test)
- Covered by jest test "should remove client on disconnect"
- `sseClients.size` returns to pre-connect count after `res.on('close')` fires
