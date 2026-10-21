/**
 * eval-transcript-fidelity.test.js - transcript format 2: an Agent/Task call
 * keeps its whole input, a failed tool result is recorded (never its content),
 * and a session that ended on a synthetic limit message is told apart. The
 * `claude` subprocess is stubbed; no session is spawned.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn() };
});
const mockUtils = require('../../scripts/lib/utils');
const {
  TRANSCRIPT_FORMAT,
  parseStreamJsonOutput,
  parseActionsFromTranscript,
} = require('../../scripts/lib/eval-transcript');
const { isOutputComplete, isProviderRefusal } = require('../../scripts/lib/eval-trial-outcome');
const { RESULTS_DIR, SCENARIOS_DIR, findScenario, runTrial } = require('../../scripts/lib/eval');

const line = (event) => JSON.stringify(event);
const assistant = (content, extra = {}) =>
  line({ type: 'assistant', message: { content, ...extra } });
const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input });
const toolResult = (id, content, isError) =>
  line({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) },
      ],
    },
  });
const result = (text, outputTokens) =>
  line({ type: 'result', result: text, usage: { input_tokens: 10, output_tokens: outputTokens } });
const synthetic = (text, usage = { input_tokens: 0, output_tokens: 0 }) =>
  assistant([{ type: 'text', text }], { model: '<synthetic>', ...(usage ? { usage } : {}) });
const parse = (...events) => parseStreamJsonOutput(events.join('\n'));
const LIMIT = "You've hit your session limit · resets 5am";

describe('transcript format 2', () => {
  it('is version 2', () => {
    expect(TRANSCRIPT_FORMAT).toBe(2);
  });

  describe('tool input', () => {
    it('leaves the six special-cased tools byte-identical', () => {
      const { richTranscript } = parse(
        assistant([
          toolUse('1', 'Write', { file_path: 'a.js', content: 'x = 1' }),
          toolUse('2', 'Edit', { file_path: 'a.js', old_string: 'x', new_string: 'y' }),
          toolUse('3', 'Read', { file_path: 'a.js' }),
          toolUse('4', 'Bash', { command: 'npm test' }),
          toolUse('5', 'Glob', { pattern: '**/*.js' }),
          toolUse('6', 'Grep', { pattern: 'foo', path: 'src' }),
        ]),
      );
      expect(richTranscript).toBe(
        [
          '[Tool: Write] a.js\n```\nx = 1\n```',
          '[Tool: Edit] a.js (replace "x" → "y")',
          '[Tool: Read] a.js',
          '[Tool: Bash] $ npm test',
          '[Tool: Glob] pattern: **/*.js',
          '[Tool: Grep] pattern: foo in src',
        ].join('\n\n'),
      );
    });

    it('still cuts any other tool at 200 characters', () => {
      const { richTranscript } = parse(
        assistant([toolUse('1', 'WebFetch', { url: 'u', prompt: 'p'.repeat(500) })]),
      );
      expect(richTranscript).toBe(
        `[Tool: WebFetch] ${JSON.stringify({ url: 'u', prompt: 'p'.repeat(500) }).slice(0, 200)}`,
      );
    });

    it.each(['Agent', 'Task'])('keeps a %s call whole, on one line', (name) => {
      const prompt = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}. ${'w'.repeat(90)}`).join(
        '\n\n',
      );
      expect(prompt.length).toBeGreaterThan(2000);
      const input = { description: 'review', prompt };
      const { richTranscript } = parse(assistant([toolUse('1', name, input)]));
      const actions = parseActionsFromTranscript(richTranscript);
      expect(actions).toHaveLength(1);
      expect(actions[0].name).toBe(name);
      expect(JSON.parse(actions[0].args)).toEqual(input);
    });
  });

  describe('tool results', () => {
    const bash = assistant([toolUse('b1', 'Bash', { command: 'npm test' })]);

    it('records a failed Bash call with its exit code', () => {
      const { richTranscript } = parse(bash, toolResult('b1', 'Exit code 1\nFAIL secret', true));
      expect(richTranscript).toBe('[Tool: Bash] $ npm test\n\n[Result: Bash] error (exit 1)');
    });

    it('reads the exit code from an array of text blocks too', () => {
      const content = [{ type: 'text', text: 'Exit code 127\nnot found' }];
      const { richTranscript } = parse(bash, toolResult('b1', content, true));
      expect(richTranscript).toContain('[Result: Bash] error (exit 127)');
    });

    it('never copies the result content', () => {
      const { richTranscript } = parse(bash, toolResult('b1', 'Exit code 2\nFAIL secret', true));
      expect(richTranscript).not.toContain('secret');
    });

    it('gives a non-Bash error no exit suffix', () => {
      const { richTranscript } = parse(
        assistant([toolUse('r1', 'Read', { file_path: 'nope.js' })]),
        toolResult('r1', 'Exit code 1 lookalike', true),
      );
      expect(richTranscript).toBe('[Tool: Read] nope.js\n\n[Result: Read] error');
    });

    it('emits nothing for a successful result', () => {
      const { richTranscript } = parse(bash, toolResult('b1', 'all passed', false));
      expect(richTranscript).toBe('[Tool: Bash] $ npm test');
    });

    it('never turns a [Result:] block into an action', () => {
      const { richTranscript } = parse(bash, toolResult('b1', 'Exit code 1', true));
      expect(parseActionsFromTranscript(richTranscript)).toEqual([
        { type: 'tool', name: 'Bash', args: '$ npm test', index: 0 },
      ]);
    });

    it('leaves isProviderRefusal and isOutputComplete verdicts unchanged', () => {
      const cases = [
        [bash, result('', 0)],
        [bash, assistant([{ type: 'text', text: 'Done' }]), result('Done', 50)],
        [bash, result(LIMIT, 0)],
      ];
      for (const events of cases) {
        const without = parse(...events);
        const withResult = parse(
          events[0],
          toolResult('b1', 'Exit code 1', true),
          ...events.slice(1),
        );
        const verdicts = (p) => {
          const actions = parseActionsFromTranscript(p.richTranscript);
          return [
            isProviderRefusal({ ...p, actions }),
            isOutputComplete({ textResult: p.textResult, actions }),
          ];
        };
        expect(verdicts(withResult)).toEqual(verdicts(without));
      }
    });
  });

  describe('endedSynthetic', () => {
    const bash = assistant([toolUse('b1', 'Bash', { command: 'ls' })]);

    it('is set when the last assistant message is a synthetic limit message', () => {
      expect(parse(bash, synthetic(LIMIT), result(LIMIT, 4430)).endedSynthetic).toBe(true);
    });

    it('is not set for a model turn', () => {
      const text = assistant([{ type: 'text', text: 'Done' }], {
        model: 'claude-opus-5-5',
        usage: { output_tokens: 12 },
      });
      expect(parse(bash, text, result('Done', 4430)).endedSynthetic).toBe(false);
    });

    it('is reset by a later tool_use', () => {
      expect(parse(synthetic(LIMIT), bash).endedSynthetic).toBe(false);
    });

    it('is not set when usage is absent', () => {
      expect(parse(bash, synthetic(LIMIT, null)).endedSynthetic).toBe(false);
    });

    it('is false for empty output', () => {
      expect(parseStreamJsonOutput('').endedSynthetic).toBe(false);
    });
  });
});

describe('runTrial with transcript format 2', () => {
  const NAME = 'fidelity';
  const RUN_ID = '20261021-120000-ab12';
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-transcript-fidelity-'));
    const scenarioFile = path.join(tempDir, SCENARIOS_DIR, `${NAME}.md`);
    fs.mkdirSync(path.dirname(scenarioFile), { recursive: true });
    fs.writeFileSync(
      scenarioFile,
      `# Eval: ${NAME}\n\n## Scope\nskill\n\n## Scenario\nDo it.\n\n## Assertions\n- [ ] A1: It works\n\n## Grader\nmodel\n\n## Version\n1\n`,
    );
    mockUtils.execCommand.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const trial = (stdout) => {
    mockUtils.execCommand.mockImplementation((cmd) =>
      path.basename(cmd) === 'claude'
        ? { stdout, stderr: '', exitCode: 0 }
        : { stdout: '', stderr: '', exitCode: 0 },
    );
    return runTrial(findScenario(NAME, tempDir), 3, 5, {
      projectRoot: tempDir,
      label: 'treatment',
      runId: RUN_ID,
    });
  };

  it('saves the raw stream-json beside the transcript', () => {
    const stdout = [assistant([{ type: 'text', text: 'Done' }]), result('Done', 5)].join('\n');
    const row = trial(stdout);
    const runDir = path.join(tempDir, RESULTS_DIR, NAME, RUN_ID);
    expect(fs.readFileSync(path.join(runDir, 'raw', 'treatment-trial-3.jsonl'), 'utf8')).toBe(
      stdout,
    );
    expect(row.transcript).toBe(path.join(runDir, 'transcripts', 'treatment-trial-3.txt'));
    expect(row.transcript_format).toBe(TRANSCRIPT_FORMAT);
  });

  it('records a limit that landed after tool calls as a provider refusal', () => {
    const stdout = [
      assistant([toolUse('b1', 'Bash', { command: 'ls' })]),
      assistant([toolUse('w1', 'Write', { file_path: 't.js', content: 'x' })]),
      synthetic(LIMIT),
      result(LIMIT, 4430),
    ].join('\n');
    const row = trial(stdout);
    expect(row).toMatchObject({
      errorType: 'provider_refusal',
      infraError: true,
      refusalAfterActions: 2,
    });
    expect(row.error).toContain('after 2 tool calls');
  });
});
