# Intermittent failures

A failure that appears in some runs of an identical command is still
deterministic — you are just missing a variable. Find the variable before you
retry your way past it.

## Name the hidden variable

| Symptom | Usual variable |
|---|---|
| Fails under load or in CI, passes locally | Timing: something is waited on by duration, not by condition |
| Fails only when the whole suite runs | Shared state: a global, a file, a database row, an env var left behind |
| Fails only in a particular order | Order dependence: one unit leaves state the next one reads |
| Fails roughly 1 run in N | Concurrency: two paths race for the same resource |

Confirm which one by making it fail on demand: loop the command, run the suspect
units alone and together, force the ordering. A failure you can trigger is a
failure you can trace with Phase 2.

## Timing: wait for the condition, not the clock

Arbitrary sleeps encode a guess about how long something takes. The guess holds
on an idle laptop and breaks on a loaded CI box.

```js
// Guessing
await new Promise((r) => setTimeout(r, 50));
expect(getResult()).toBeDefined();

// Waiting for what you actually care about
await waitFor(() => getResult() !== undefined);
```

A generic poller, once, in the test helpers:

```js
async function waitFor(condition, description, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    const result = condition();
    if (result) return result;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}
```

Three rules it encodes: always carry a timeout (a bare loop hangs forever), poll
around 10ms (1ms burns CPU for nothing), and evaluate the condition inside the
loop (a value read before the loop never changes).

Common shapes: `waitFor(() => events.some((e) => e.type === 'DONE'))`,
`waitFor(() => machine.state === 'ready')`, `waitFor(() => items.length >= 5)`,
`waitFor(() => fs.existsSync(path))`.

## When a real delay is correct

Timed behavior — a debounce, a throttle window, a ticker — is the thing under
test, so you must let clock time pass. Wait for the triggering condition first,
then sleep a duration derived from the documented interval, and write the
derivation down:

```js
await waitFor(() => manager.started, 'tool start');
await new Promise((r) => setTimeout(r, 200)); // 2 ticks at the 100ms interval
```

A sleep with no comment explaining the number is a guess wearing a justification.
