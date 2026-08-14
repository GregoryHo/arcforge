# Finding the origin

Two techniques for Phase 2, picked by what is blocking the backward walk.

| Blocker | Technique |
|---|---|
| The error is deep in a call chain and you cannot see where the bad value entered | Backward tracing |
| The value crosses a process, service, or job boundary and disappears from view | Boundary instrumentation |

## Backward tracing

Walk from the symptom to the producer, one frame at a time.

1. **Observe the symptom exactly.** Copy the error, the failing value, and the
   frame it fired in. `Error: git init failed in /repo/packages/core`.
2. **Find the immediate cause.** Which line performs the failing operation, and
   with which arguments? `execFileAsync('git', ['init'], { cwd: projectDir })`.
3. **Ask what called it, with what.** Record the value at each hop, not just the
   call. `projectDir = ''` — an empty string, which resolves `cwd` to the process
   working directory.
4. **Keep going until the value is manufactured.** Stop at the first frame whose
   inputs are correct and whose output is not. That frame is the origin.
5. **Fix there.** In the example: a test helper returned `{ tempDir: '' }` and a
   top-level initializer read it before setup ran. The fix belongs in the helper,
   not in the `git init` call five frames down.

### When the chain is not readable by eye

Instrument before the dangerous operation rather than after it fails, and print
the whole context you would otherwise guess at:

```js
console.error('DEBUG git init:', {
  directory,
  cwd: process.cwd(),
  stack: new Error().stack,
});
```

Use `console.error` in tests — a project logger is often suppressed there. Then
run and filter: `npm test 2>&1 | grep 'DEBUG git init'`. Read the captured stacks
for the caller that repeats.

### When you do not know which run causes it

Bisect over the units rather than reasoning about them. Run each test file alone
and check for the artifact after each:

```bash
for t in src/**/*.test.ts; do
  npm test "$t"
  [ -d .git ] && { echo "POLLUTER: $t"; break; }
done
```

The same shape works for any observable side effect: a stray file, a mutated
fixture, a leaked environment variable.

## Boundary instrumentation

When a value crosses components (CI to build to signing, API to service to
database), no single stack trace spans the gap. Log what enters and what leaves
at every boundary, run **once**, and read which hop broke it — do not fix at the
first suspicious hop.

```bash
# Layer 1: workflow — is the secret present at all?
echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

# Layer 2: build script — did it survive the process boundary?
env | grep IDENTITY || echo "IDENTITY not in environment"

# Layer 3: signing script — is the state it depends on there?
security find-identity -v

# Layer 4: the operation itself, verbose
codesign --sign "$IDENTITY" --verbose=4 "$APP"
```

Reading the output tells you which transition lost the value (workflow to build,
say), which turns a whole-pipeline mystery into a single-component bug. Then
resume the backward walk inside that component.
