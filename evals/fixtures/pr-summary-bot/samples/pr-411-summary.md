# reviewbot summary — PR #411 "Rate limit the export endpoint"

Hello reviewers! This pull request touches 7 files across the service. Below is a
walkthrough of each change so you have full context before reviewing.

**`src/http/router.js`** — This file registers the HTTP routes. The diff adds a
new `require` at the top of the file for `../middleware/rate-limit`, and then
inserts that middleware into the chain for the `/export` route. The route
registration for `/export` now passes three arguments instead of two: the path,
the new middleware, and the handler. The other route registrations in this file
are unchanged.

**`src/middleware/rate-limit.js`** — This is a new file. It exports a single
function, `rateLimit`, which takes an options object with `windowMs` and `max`
properties and returns an Express-style middleware function. Inside, it keeps a
`Map` keyed by the caller's API key. On each request it reads the current count
for the key, compares it against `max`, and either increments the count and calls
`next()`, or responds. There is a `setInterval` at module scope that clears the
map every `windowMs` milliseconds.

**`src/http/handlers/export.js`** — The handler itself is mostly unchanged. Two
lines were removed where it used to log the request, and a comment above
`buildExport` was reworded.

**`config/default.json`** — Adds two keys, `exportRateWindowMs` set to 60000 and
`exportRateMax` set to 5. These are read by `router.js` when constructing the
middleware.

**`test/middleware/rate-limit.test.js`** — A new test file with three tests. The
first asserts that a request under the limit passes through. The second asserts
that the sixth request in a window does not. The third asserts that the map is
cleared after the window elapses, using fake timers.

**`docs/api.md`** — A paragraph was added under the Export section describing the
limit, and the table of endpoints gained a "Rate limited" column with "yes" for
`/export` and "no" for every other row.

**`package.json`** — No dependency changes; only the `test` script gained
`--test-concurrency=1` so the fake-timer test does not interfere with others.

Over the limit, the middleware responds `429` and the response body is
`{"error":"rate_limited"}` — note this differs from every other error in the
service, which uses the `{"code":..., "message":...}` envelope that clients parse.
Existing clients will not recognise this body.

The overall change is well structured and the tests look reasonable. Nice work!
