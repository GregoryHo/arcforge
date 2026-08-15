const {
  rubricDrift,
  parseScenarioText,
  SCENARIO_FILE_RE,
} = require('../../scripts/check-eval-version-bump');

const scenario = ({
  version = '1',
  assertions = '- [ ] A1: agent explains the root cause',
  grader = 'model',
  graderConfig = 'Score 1 when the answer names the cause.',
  context = 'A bug report.',
} = {}) =>
  [
    '# Eval: eval-demo',
    '',
    '## Scope',
    'skill',
    '',
    '## Version',
    version,
    '',
    '## Context',
    context,
    '',
    '## Scenario',
    'Fix the failing test.',
    '',
    '## Assertions',
    assertions,
    '',
    '## Grader',
    grader,
    '',
    '## Grader Config',
    graderConfig,
    '',
  ].join('\n');

const drift = (before, after) =>
  rubricDrift(parseScenarioText(before, 'eval-demo.md'), parseScenarioText(after, 'eval-demo.md'));

describe('SCENARIO_FILE_RE', () => {
  it('matches a scenario file', () => {
    expect(SCENARIO_FILE_RE.test('evals/scenarios/eval-demo.md')).toBe(true);
  });

  it('ignores results, nested dirs, and non-markdown', () => {
    expect(SCENARIO_FILE_RE.test('evals/scenarios/retired/eval-demo.md')).toBe(false);
    expect(SCENARIO_FILE_RE.test('evals/results/eval-demo/run.jsonl')).toBe(false);
    expect(SCENARIO_FILE_RE.test('evals/skill-eval-coverage.md')).toBe(false);
  });
});

describe('rubricDrift', () => {
  it('reports no drift when nothing changed', () => {
    expect(drift(scenario(), scenario())).toEqual({ changed: [], versionBumped: false });
  });

  it('flags an assertion edit that left the version alone', () => {
    const after = scenario({ assertions: '- [ ] A1: agent names the file and line' });
    expect(drift(scenario(), after)).toEqual({ changed: ['assertions'], versionBumped: false });
  });

  it('clears the same edit once the version moves', () => {
    const after = scenario({ version: '2', assertions: '- [ ] A1: agent names the file and line' });
    expect(drift(scenario(), after)).toEqual({ changed: ['assertions'], versionBumped: true });
  });

  it('flags a grader switch and a grader-config rewrite', () => {
    const after = scenario({ grader: 'code', graderConfig: 'npm test' });
    expect(drift(scenario(), after).changed).toEqual(['grader', 'grader config']);
  });

  it('flags an added assertion', () => {
    const after = scenario({
      assertions: '- [ ] A1: agent explains the root cause\n- [tool_called] Bash:npm test',
    });
    expect(drift(scenario(), after).changed).toEqual(['assertions']);
  });

  it('ignores a prompt-only edit — out of scope by design', () => {
    expect(drift(scenario(), scenario({ context: 'A different bug report.' })).changed).toEqual([]);
  });

  it('ignores whitespace reflow inside the assertion list', () => {
    const after = scenario({ assertions: '-   [ ]   A1: agent explains the root cause  ' });
    expect(drift(scenario(), after).changed).toEqual([]);
  });
});
