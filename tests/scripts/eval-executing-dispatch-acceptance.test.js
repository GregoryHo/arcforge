/**
 * eval-executing-dispatch-acceptance.test.js - the D1 scenario's grader, offline
 *
 * Drives the scenario's own `## Grader Config` through the engine
 * (`parseScenario` → `gradeTrialResult` → real `python3 -I`) against synthetic
 * format-2 transcripts. One case per row of the design gate's offline-test
 * table (`docs/plans/v6.6/wp-d/design-gate.executing-dispatching-v2.md`,
 * 「grader 的離線測試」), plus the shapes the gate's rules name but the table
 * does not cover. No session is started.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseScenario } = require('../../scripts/lib/eval-scenario');
const { gradeTrialResult } = require('../../scripts/lib/eval-graders');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCENARIO_FILE = path.join(
  PROJECT_ROOT,
  'evals/scenarios/eval-executing-dispatch-acceptance.md',
);

const C1 = 'A burst of exactly 10 requests within 1000 ms is allowed; the 11th gets 429.';
const C2 = '`Retry-After` is rounded up to whole seconds.';
const C3 = 'The counter key is `${ip}:${route}`, never `ip` alone.';
const CRITERIA = `Acceptance criteria:\n1. ${C1}\n2. ${C2}\n3. ${C3}`;
const T1_OWNERSHIP = 'Add GET /health to src/server.js. Do not touch `src/limiter.js`, T2 owns it.';

const agent = (description, prompt) => `[Tool: Agent] ${JSON.stringify({ description, prompt })}`;

describe('eval-executing-dispatch-acceptance scenario', () => {
  it('parses through the engine with the gate’s Version, Trials, Scope, Target and Environment', () => {
    const scenario = parseScenario(SCENARIO_FILE, PROJECT_ROOT);
    expect(scenario.version).toBe('1');
    expect(scenario.trials).toBe(5);
    expect(scenario.scope).toBe('skill');
    expect(scenario.target).toBe('skills/core/executing/SKILL.md');
    expect(scenario.environment).toEqual(['PATH+=${PROJECT_ROOT}/bin']);
    expect(scenario.grader).toBe('code');
    expect(scenario.assertions).toHaveLength(1);
    expect(scenario.maxTurns).toBeUndefined();
  });
});

describe('eval-executing-dispatch-acceptance grader (offline)', () => {
  let scenario;
  let trialDir;
  let workDir;

  beforeAll(() => {
    scenario = parseScenario(SCENARIO_FILE, PROJECT_ROOT);
  });

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd1-grader-'));
    trialDir = path.join(workDir, 'trial');
    fs.mkdirSync(trialDir);
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  /** Grade a transcript made of these blocks; returns the label, reason and audit lines. */
  function grade(blocks) {
    const transcript = path.join(workDir, 'transcript.txt');
    fs.writeFileSync(transcript, blocks.join('\n\n'));
    const graded = gradeTrialResult({ trialDir, transcript }, scenario, PROJECT_ROOT);
    expect(graded.gradeError).toBeUndefined();
    const output = graded.graderOutput || '';
    return {
      passed: graded.passed,
      evidence: graded.evidence?.[0],
      dispatch: output.split('\n').filter((l) => l.startsWith('-- audit: limiter dispatch:')),
      output,
    };
  }

  const writeLimiter = () =>
    `[Tool: Write] ${trialDir}/src/limiter.js\n\`\`\`\nmodule.exports = {};\n\`\`\``;

  // ---- the gate's table, row by row ----

  it('T1 ownership card, then a T2 writer carrying the three criteria: PASS on the second block', () => {
    const g = grade([
      agent('Add health route', T1_OWNERSHIP),
      agent('Implement rate limiter', `Implement src/limiter.js.\n\n${CRITERIA}`),
    ]);
    expect(g.passed).toBe(true);
    expect(g.dispatch[0]).toMatch(/#1 ownership-mention/);
    expect(g.dispatch[1]).toMatch(/#2 writer \[scored\].*criteria 3\/3/);
  });

  it('T1 ownership card, then a path-only T2 writer: FAIL, all three missing', () => {
    const g = grade([
      agent('Add health route', T1_OWNERSHIP),
      agent('Implement rate limiter', 'Implement the limiter per `specs/limiter.md`'),
    ]);
    expect(g.passed).toBe(false);
    expect(g.evidence).toMatch(/call #2\) lacks acceptance criteria 1, 2, 3/);
    expect(g.dispatch[1]).toMatch(/spec path in prompt: yes/);
  });

  it('only the T1 ownership card: FAIL no T2 writer dispatch identified', () => {
    const g = grade([agent('Add health route', T1_OWNERSHIP)]);
    expect(g.evidence).toBe('FAIL: no T2 writer dispatch identified');
    expect(g.dispatch[0]).toMatch(/#1 ownership-mention/);
  });

  it('writer recognised by its prompt sentence, criteria only in the later acceptance: FAIL on the writer', () => {
    const g = grade([
      agent(
        'T2 implementation',
        'Implement the limiter in `src/limiter.js` per `specs/limiter.md`.',
      ),
      agent('Test limiter acceptance', CRITERIA),
    ]);
    expect(g.passed).toBe(false);
    expect(g.evidence).toMatch(/call #1\) lacks acceptance criteria 1, 2, 3/);
    expect(g.dispatch[0]).toMatch(/#1 writer \[scored\].*limiter in prompt/);
    expect(g.dispatch[1]).toMatch(/#2 acceptance .*criteria 3\/3/);
  });

  it('path-only writer, then "Verify limiter" with the criteria: FAIL on the writer', () => {
    const g = grade([
      agent('Implement rate limiter', 'Implement the limiter per `specs/limiter.md`'),
      agent('Verify limiter', CRITERIA),
    ]);
    expect(g.evidence).toMatch(/call #1\) lacks/);
    expect(g.dispatch[1]).toMatch(/#2 acceptance/);
  });

  it('src/limiter.js written, then "Write limiter acceptance tests": FAIL, write is no exemption', () => {
    const g = grade([writeLimiter(), agent('Write limiter acceptance tests', CRITERIA)]);
    expect(g.evidence).toBe('FAIL: no T2 writer dispatch identified');
    expect(g.dispatch[0]).toMatch(/#1 acceptance/);
  });

  it('src/limiter.js written, then "Second opinion on limiter": FAIL, the block is after-write', () => {
    const g = grade([writeLimiter(), agent('Second opinion on limiter', CRITERIA)]);
    expect(g.evidence).toBe('FAIL: no T2 writer dispatch identified');
    expect(g.dispatch[0]).toMatch(/#1 after-write/);
  });

  it('only "Review limiter implementation": FAIL, implementation is not implement', () => {
    const g = grade([agent('Review limiter implementation', CRITERIA)]);
    expect(g.evidence).toBe('FAIL: no T2 writer dispatch identified');
    expect(g.dispatch[0]).toMatch(/#1 acceptance/);
  });

  it('"Implement and verify the rate limiter" with the criteria: PASS by the implement exemption', () => {
    const g = grade([agent('Implement and verify the rate limiter', CRITERIA)]);
    expect(g.passed).toBe(true);
    expect(g.dispatch[0]).toMatch(/#1 writer \[scored\]/);
  });

  it('"Add rate limiting and tests" with the criteria: FAIL, a known false FAIL', () => {
    const g = grade([agent('Add rate limiting and tests', CRITERIA)]);
    expect(g.evidence).toBe('FAIL: no T2 writer dispatch identified');
    expect(g.dispatch[0]).toMatch(/#1 acceptance/);
  });

  it('T1 card mentioning the limiter with no marker goes first: FAIL scored on T1, a known false FAIL', () => {
    const g = grade([
      agent('Add health route', 'Add GET /health. Coordinate with T2, which handles the limiter'),
      agent('Implement rate limiter', CRITERIA),
    ]);
    expect(g.evidence).toMatch(/call #1\) lacks acceptance criteria 1, 2, 3/);
    expect(g.dispatch[0]).toMatch(/#1 writer \[scored\]/);
  });

  it('"`src/limiter.js` is owned by T2." is not split at .js: PASS on the second block', () => {
    const g = grade([
      agent('Add health route', 'Add GET /health. `src/limiter.js` is owned by T2.'),
      agent('T2 implementation', `Implement the limiter.\n${CRITERIA}`),
    ]);
    expect(g.passed).toBe(true);
    expect(g.dispatch[0]).toMatch(/#1 ownership-mention/);
    expect(g.dispatch[1]).toMatch(/#2 writer \[scored\]/);
  });

  it('criterion 2 paraphrased as "Retry-After in seconds": FAIL, criterion 2 missing', () => {
    const g = grade([
      agent(
        'Implement rate limiter',
        `Implement src/limiter.js.\n1. ${C1}\n2. Retry-After in seconds.\n3. ${C3}`,
      ),
    ]);
    expect(g.evidence).toMatch(/lacks acceptance criteria 2 verbatim/);
  });

  it('backticks and case differ ("`retry-after` is rounded up to whole seconds"): matches the original', () => {
    const g = grade([
      agent(
        'Implement rate limiter',
        `- a burst of exactly 10 requests within 1000 ms is allowed; the 11th gets 429\n- \`retry-after\` is rounded up to whole seconds\n- the counter key is \${ip}:\${route}, never ip alone`,
      ),
    ]);
    expect(g.passed).toBe(true);
  });

  it('no Agent or Task block: FAIL T2 not dispatched', () => {
    const g = grade(['[Assistant] Doing it myself.', writeLimiter()]);
    expect(g.evidence).toBe('FAIL: T2 not dispatched');
  });

  it('one Agent block whose JSON does not parse: FAIL T2 not dispatched, the block unreadable', () => {
    const g = grade(['[Tool: Agent] {"description": "Implement rate limiter", "prompt": ']);
    expect(g.evidence).toBe('FAIL: T2 not dispatched');
    expect(g.dispatch[0]).toMatch(/#1 unreadable/);
  });

  // ---- shapes the gate's rules name that the table does not ----

  it('a single T2 writer with the three criteria, through the Task tool name: PASS', () => {
    const g = grade([
      '[Tool: Read] specs/limiter.md',
      `[Tool: Task] ${JSON.stringify({ description: 'Implement rate limiter', prompt: CRITERIA })}`,
    ]);
    expect(g.passed).toBe(true);
    expect(g.output).toMatch(/-- audit: specs\/limiter\.md opened: yes/);
  });

  it('a Bash redirect into limiter.js counts as a write: the later dispatch is after-write', () => {
    const g = grade([
      "[Tool: Bash] $ cat > src/limiter.js <<'EOF'\nmodule.exports = {};\nEOF",
      agent('Rate limiter follow-up', CRITERIA),
    ]);
    expect(g.evidence).toBe('FAIL: no T2 writer dispatch identified');
    expect(g.dispatch[0]).toMatch(/#1 after-write/);
  });

  it('an Edit of src/limiter.js before the dispatch counts as a write', () => {
    const g = grade([
      `[Tool: Edit] ${trialDir}/src/limiter.js (replace "a" → "b")`,
      agent('Rate limiter follow-up', CRITERIA),
    ]);
    expect(g.dispatch[0]).toMatch(/#1 after-write/);
  });

  it('a writer whose every limiter sentence carries a marker is an ownership mention (known false FAIL)', () => {
    const g = grade([
      agent(
        'T2 implementation',
        `Implement the limiter in src/limiter.js and do not touch src/server.js.\n${CRITERIA}`,
      ),
    ]);
    expect(g.evidence).toBe('FAIL: no T2 writer dispatch identified');
    expect(g.dispatch[0]).toMatch(/#1 ownership-mention/);
  });

  it('marks a staged SKILL.md read as dispatching’s only when references/ was named under that copy', () => {
    const d = '/var/folders/x/T/arcforge-eval-skill-41-aB3';
    const e = '/var/folders/x/T/arcforge-eval-skill-41-cD4';
    const g = grade([
      `[Tool: Read] ${d}/SKILL.md`,
      `[Tool: Read] ${d}/references/acceptance.md`,
      `[Tool: Read] ${e}/SKILL.md`,
    ]);
    expect(g.output).toMatch(/opened: staged SKILL\.md, dispatching's .*aB3\/SKILL\.md/);
    expect(g.output).toMatch(/opened: staged SKILL\.md, copy not identified: .*cD4\/SKILL\.md/);
  });

  it('prints the unscored audit lines', () => {
    const g = grade([
      '[Tool: Bash] $ arcforge worktree add limiter --json',
      '[Result: Bash] error (exit 127)',
      agent('Add health route', 'Add GET /health. Use model: haiku.'),
      agent('Implement rate limiter', CRITERIA),
    ]);
    expect(g.output).toMatch(/-- audit: agent calls: 2/);
    expect(g.output).toMatch(/-- audit: specs\/limiter\.md opened: no/);
    expect(g.output).toMatch(
      /-- audit: arcforge errors: exit 127 <- \$ arcforge worktree add limiter --json/,
    );
    expect(g.output).toMatch(/-- audit: model tier: #1/);
    expect(g.output).toMatch(/-- audit: not top-level: cannot be determined/);
    expect(g.output).toMatch(/-- audit: dispatching\/SKILL\.md opened: no tool call/);
    expect(g.output).toMatch(/-- audit: outside the trial tree: none/);
  });
});
