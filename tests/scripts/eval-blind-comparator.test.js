/**
 * Tests for eval-blind-comparator harness plumbing (fr-ag-003).
 *
 * Tests:
 *   - A/B label assignment is randomized across many invocations (fr-ag-003-ac2)
 *   - Prompt sent to agent contains none of the forbidden strings (fr-ag-003-ac3)
 *   - Winner label is mapped back from A/B to baseline/treatment correctly
 */

// Mock utils.execCommand to intercept Claude calls.
jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn((...args) => actual.execCommand(...args)) };
});

const mockUtils = require('../../scripts/lib/utils');
const {
  runBlindComparator,
  buildBlindComparatorPrompt,
  BLIND_COMPARATOR_FORBIDDEN,
} = require('../../scripts/lib/eval-graders');

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Make a minimal mock JSON response that the blind comparator would return.
 * @param {'A'|'B'|'tie'} winner
 */
function makeAgentResponse(winner = 'A') {
  return JSON.stringify({
    winner,
    reasoning: 'Output A was more complete.',
    score_a: 0.8,
    score_b: 0.6,
    rubric: [{ criterion: 'Addresses the task', weight: 1.0 }],
    scores_a: [0.8],
    scores_b: [0.6],
  });
}

const TASK_PROMPT = 'Write a function that reverses a string.';
const BASELINE_OUTPUT = 'function reverse(s) { return s.split("").reverse().join(""); }';
const TREATMENT_OUTPUT = 'const reverse = (s) => [...s].reverse().join("");';

// ── fr-ag-003-ac2: A/B label randomization is uniform ─────────────────────────

describe('runBlindComparator — A/B label randomization', () => {
  // We run many invocations with a stubbed execCommand and count how often
  // baseline maps to A vs B. We accept anything between 30% and 70%.

  it('maps baseline to A approximately 50% of the time across 1000 invocations', () => {
    const N = 1000;
    let baselineWasA = 0;

    for (let i = 0; i < N; i++) {
      // Agent always says winner = 'A'
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: makeAgentResponse('A'),
        stderr: '',
        exitCode: 0,
      });

      const result = runBlindComparator(
        TASK_PROMPT,
        BASELINE_OUTPUT,
        TREATMENT_OUTPUT,
        '/fake/root',
      );

      // If winner_original_label is 'baseline', then baseline was mapped to A
      if (result && result.winner_original_label === 'baseline') {
        baselineWasA++;
      }
    }

    const fraction = baselineWasA / N;
    // Accept 30%-70% — randomness should land in this range with very high probability
    expect(fraction).toBeGreaterThan(0.3);
    expect(fraction).toBeLessThan(0.7);
  });

  it('maps baseline to B approximately 50% of the time across 1000 invocations', () => {
    const N = 1000;
    let baselineWasB = 0;

    for (let i = 0; i < N; i++) {
      // Agent always says winner = 'B'
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: makeAgentResponse('B'),
        stderr: '',
        exitCode: 0,
      });

      const result = runBlindComparator(
        TASK_PROMPT,
        BASELINE_OUTPUT,
        TREATMENT_OUTPUT,
        '/fake/root',
      );

      // If winner_original_label is 'baseline', then baseline was B (won as B)
      if (result && result.winner_original_label === 'baseline') {
        baselineWasB++;
      }
    }

    const fraction = baselineWasB / N;
    expect(fraction).toBeGreaterThan(0.3);
    expect(fraction).toBeLessThan(0.7);
  });

  afterEach(() => {
    mockUtils.execCommand.mockClear();
  });
});

// ── fr-ag-003-ac3: forbidden strings absent from prompt ───────────────────────

describe('buildBlindComparatorPrompt — forbidden string exclusion', () => {
  const AGENT_DEF = 'You are an Eval Blind Comparator.\n';

  it('does not contain "baseline" in the prompt', () => {
    const prompt = buildBlindComparatorPrompt(
      TASK_PROMPT,
      BASELINE_OUTPUT,
      TREATMENT_OUTPUT,
      AGENT_DEF,
    );
    expect(prompt.toLowerCase()).not.toContain('baseline');
  });

  it('does not contain "treatment" in the prompt', () => {
    const prompt = buildBlindComparatorPrompt(
      TASK_PROMPT,
      BASELINE_OUTPUT,
      TREATMENT_OUTPUT,
      AGENT_DEF,
    );
    expect(prompt.toLowerCase()).not.toContain('treatment');
  });

  it('does not contain "with_skill" in the prompt', () => {
    const prompt = buildBlindComparatorPrompt(
      TASK_PROMPT,
      'output mentioning something',
      'another output',
      AGENT_DEF,
    );
    expect(prompt).not.toContain('with_skill');
  });

  it('does not contain "without_skill" in the prompt', () => {
    const prompt = buildBlindComparatorPrompt(
      TASK_PROMPT,
      'some output',
      'other output',
      AGENT_DEF,
    );
    expect(prompt).not.toContain('without_skill');
  });

  it('labels outputs as A and B, not baseline/treatment', () => {
    const prompt = buildBlindComparatorPrompt(
      TASK_PROMPT,
      BASELINE_OUTPUT,
      TREATMENT_OUTPUT,
      AGENT_DEF,
    );
    expect(prompt).toContain('Output A');
    expect(prompt).toContain('Output B');
  });

  it('BLIND_COMPARATOR_FORBIDDEN list covers all required strings', () => {
    expect(BLIND_COMPARATOR_FORBIDDEN).toContain('baseline');
    expect(BLIND_COMPARATOR_FORBIDDEN).toContain('treatment');
    expect(BLIND_COMPARATOR_FORBIDDEN).toContain('with_skill');
    expect(BLIND_COMPARATOR_FORBIDDEN).toContain('without_skill');
  });
});

// ── runBlindComparator prompt sanitization (via mock capture) ─────────────────

describe('runBlindComparator — prompt sanitization', () => {
  afterEach(() => {
    mockUtils.execCommand.mockClear();
  });

  it('strips "baseline" from the task prompt before sending to agent', () => {
    let capturedInput = '';
    mockUtils.execCommand.mockImplementationOnce((_cmd, _args, opts) => {
      capturedInput = opts.input || '';
      return { stdout: makeAgentResponse('A'), stderr: '', exitCode: 0 };
    });

    runBlindComparator(
      'This is a baseline comparison task',
      BASELINE_OUTPUT,
      TREATMENT_OUTPUT,
      '/fake/root',
    );

    expect(capturedInput.toLowerCase()).not.toContain('baseline');
  });

  it('strips "treatment" from outputs before sending to agent', () => {
    let capturedInput = '';
    mockUtils.execCommand.mockImplementationOnce((_cmd, _args, opts) => {
      capturedInput = opts.input || '';
      return { stdout: makeAgentResponse('B'), stderr: '', exitCode: 0 };
    });

    runBlindComparator(
      TASK_PROMPT,
      'This is the treatment output showing the skill works',
      'Control output without skill applied',
      '/fake/root',
    );

    expect(capturedInput.toLowerCase()).not.toContain('treatment');
  });

  it('strips the skill name from outputs when provided', () => {
    let capturedInput = '';
    mockUtils.execCommand.mockImplementationOnce((_cmd, _args, opts) => {
      capturedInput = opts.input || '';
      return { stdout: makeAgentResponse('A'), stderr: '', exitCode: 0 };
    });

    runBlindComparator(
      TASK_PROMPT,
      'Output using arc-tdd skill',
      'Output without arc-tdd skill',
      '/fake/root',
      'arc-tdd',
    );

    expect(capturedInput).not.toContain('arc-tdd');
  });
});

// ── runBlindComparator — winner label mapping ─────────────────────────────────

describe('runBlindComparator — winner label mapping', () => {
  afterEach(() => {
    mockUtils.execCommand.mockClear();
  });

  it('returns null when the agent call fails', () => {
    mockUtils.execCommand.mockReturnValueOnce({ stdout: '', stderr: 'error', exitCode: 1 });

    const result = runBlindComparator(TASK_PROMPT, BASELINE_OUTPUT, TREATMENT_OUTPUT, '/fake/root');
    expect(result).toBeNull();
  });

  it('returns null when agent returns unparseable JSON', () => {
    mockUtils.execCommand.mockReturnValueOnce({
      stdout: 'not json at all',
      stderr: '',
      exitCode: 0,
    });

    const result = runBlindComparator(TASK_PROMPT, BASELINE_OUTPUT, TREATMENT_OUTPUT, '/fake/root');
    expect(result).toBeNull();
  });

  it('returns tie when agent returns tie', () => {
    mockUtils.execCommand.mockReturnValueOnce({
      stdout: makeAgentResponse('tie'),
      stderr: '',
      exitCode: 0,
    });

    const result = runBlindComparator(TASK_PROMPT, BASELINE_OUTPUT, TREATMENT_OUTPUT, '/fake/root');
    expect(result).not.toBeNull();
    expect(result.winner_original_label).toBe('tie');
  });

  it('includes reasoning and rubric in the result', () => {
    mockUtils.execCommand.mockReturnValueOnce({
      stdout: JSON.stringify({
        winner: 'A',
        reasoning: 'Output A was clearer.',
        score_a: 0.9,
        score_b: 0.5,
        rubric: [{ criterion: 'Clarity', weight: 1.0 }],
        scores_a: [0.9],
        scores_b: [0.5],
      }),
      stderr: '',
      exitCode: 0,
    });

    const result = runBlindComparator(TASK_PROMPT, BASELINE_OUTPUT, TREATMENT_OUTPUT, '/fake/root');
    expect(result).not.toBeNull();
    expect(result.reasoning).toBe('Output A was clearer.');
    expect(result.rubric).toHaveLength(1);
    expect(result.rubric[0].criterion).toBe('Clarity');
  });

  it('exposes score_baseline and score_treatment in result', () => {
    mockUtils.execCommand.mockReturnValueOnce({
      stdout: JSON.stringify({
        winner: 'A',
        reasoning: 'A wins.',
        score_a: 0.8,
        score_b: 0.4,
        rubric: [],
        scores_a: [],
        scores_b: [],
      }),
      stderr: '',
      exitCode: 0,
    });

    const result = runBlindComparator(TASK_PROMPT, BASELINE_OUTPUT, TREATMENT_OUTPUT, '/fake/root');
    expect(result).not.toBeNull();
    // score_baseline and score_treatment must both be present
    expect(typeof result.score_baseline).toBe('number');
    expect(typeof result.score_treatment).toBe('number');
  });
});
