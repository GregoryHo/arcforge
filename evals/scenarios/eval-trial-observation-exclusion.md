# Eval: eval-trial-observation-exclusion

**Status**: Active — Slice B eval-trial path skip gate.

## Scope
learning

## Target
hooks/observe/main.js (shouldObserve / isSkippedPath)

## Scenario
This is a code-grader-only eval (no Claude agent trial). It directly tests the
`shouldObserve()` function from `hooks/observe/main.js` against three path categories:

1. **Eval trial path** — a project root containing `/.eval-trials/` segment (must be SKIPPED)
2. **Trial suffix path** — a project root ending with `-t1-A1B2C3` (trial suffix, must be SKIPPED)
3. **Normal project path** — a regular project root (must NOT be skipped)

The Slice B drift fix added `EVAL_TRIAL_SEGMENT_RE` and `EVAL_TRIAL_SUFFIX_RE` guards to
`isSkippedPath()` to prevent eval-trial activity from contaminating real observation logs.
This eval verifies those guards function correctly.

Constraints:
- All calls use `homeDir` override to redirect to TRIAL_DIR.
- Learning must be enabled in TRIAL_DIR for the positive-control assertion (A3) to work.
- No real observations should be written to HOME.

## Context
From `hooks/observe/main.js` (Slice B implementation):

```js
const EVAL_TRIAL_SEGMENT_RE = /\/\.eval-trials\//;
const EVAL_TRIAL_SUFFIX_RE = /-t\d+-[A-Za-z0-9]{6}$/;

function isSkippedPath(projectRoot) {
  if (EVAL_TRIAL_SEGMENT_RE.test(projectRoot)) return true;
  if (EVAL_TRIAL_SUFFIX_RE.test(projectRoot)) return true;
  // ...
  return false;
}
```

Without these guards, every eval trial run would write fake "observations" to the user's
`.arcforge/observations/` store, polluting the corpus that the daemon-curator uses to generate
learning candidates. This eval is the regression gate for that drift fix.

## Preflight
skip

## Verdict Policy
non-regression

## Setup
node - <<'JS'
// Setup: enable learning for the trial's normal project root
// so shouldObserve returns true for normal paths (positive control).
const path = require('path');
const fs = require('fs');

const trialDir = process.env.TRIAL_DIR || process.cwd();
process.env.HOME = trialDir;

// Create .arcforge/learning/config.json to enable learning globally
// (shouldObserve checks isLearningEnabled; we need it to return true for normal paths)
const learningDir = path.join(trialDir, '.arcforge', 'learning');
fs.mkdirSync(learningDir, { recursive: true });
fs.writeFileSync(
  path.join(learningDir, 'config.json'),
  JSON.stringify({ scope: 'global', enabled: true }),
  'utf8',
);

// Also create the observations dir for a normal project so there's somewhere to write
const normalObsDir = path.join(trialDir, '.arcforge', 'observations', 'normal-project');
fs.mkdirSync(normalObsDir, { recursive: true });

console.log('Setup complete: learning enabled at', learningDir);
JS

## Assertions
- [ ] A1: `shouldObserve({ projectRoot: '/home/user/.eval-trials/test-run/project' })` returns `false` — eval-trial segment is skipped.
- [ ] A2: `shouldObserve({ projectRoot: '/home/user/my-project-t1-A1B2C3' })` returns `false` — trial suffix is skipped.
- [ ] A3: `shouldObserve({ projectRoot: '$TRIAL_DIR', homeDir: '$TRIAL_DIR' })` returns `true` when learning is enabled — normal project is NOT skipped.

## Grader
code

## Grader Config
node - <<'JS'
const path = require('path');
const fs = require('fs');

const trialDir = process.env.TRIAL_DIR || process.cwd();
const projectRoot = process.env.PROJECT_ROOT || path.join(__dirname, '../..');

process.env.HOME = trialDir;

function emit(label, ok, reason) {
  if (ok) {
    process.stdout.write(`${label}:PASS\n`);
  } else {
    process.stdout.write(`${label}:FAIL:${reason || ''}\n`);
  }
}

let allPass = true;

try {
  // Clear module cache so environment changes take effect
  const mainJsPath = require.resolve(path.join(projectRoot, 'hooks/observe/main.js'));
  delete require.cache[mainJsPath];

  const { shouldObserve } = require(mainJsPath);

  // A1: eval-trial SEGMENT path — must return false
  const evalTrialPath = '/home/user/.eval-trials/test-run/project';
  const a1Result = shouldObserve({ projectRoot: evalTrialPath, homeDir: trialDir });
  const a1 = a1Result === false;
  emit('A1', a1, a1 ? '' : `shouldObserve returned ${a1Result} for eval-trial segment path — should be false`);
  if (!a1) allPass = false;

  // A2: trial SUFFIX path — must return false
  const trialSuffixPath = '/home/user/my-project-t1-A1B2C3';
  const a2Result = shouldObserve({ projectRoot: trialSuffixPath, homeDir: trialDir });
  const a2 = a2Result === false;
  emit('A2', a2, a2 ? '' : `shouldObserve returned ${a2Result} for trial-suffix path — should be false`);
  if (!a2) allPass = false;

  // A3: normal project path — should return true (learning is enabled for trialDir)
  const a3Result = shouldObserve({ projectRoot: trialDir, homeDir: trialDir });
  const a3 = a3Result === true;
  emit('A3', a3, a3 ? '' : `shouldObserve returned ${a3Result} for normal path — should be true when learning enabled`);
  if (!a3) allPass = false;

} catch (err) {
  emit('A1', false, `grader exception: ${err.message}`);
  emit('A2', false, 'grader exception');
  emit('A3', false, 'grader exception');
  process.exit(1);
}

process.exit(allPass ? 0 : 1);
JS

## Trials
3

## Version
1
