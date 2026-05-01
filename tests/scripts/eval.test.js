const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Mock utils.execCommand so gradeWithModel tests can intercept Claude calls.
// Default implementation delegates to the real function — only gradeWithModel
// tests override via mockReturnValueOnce.
jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn((...args) => actual.execCommand(...args)) };
});
const mockUtils = require('../../scripts/lib/utils');

const {
  parseEvalName,
  parseScenario,
  buildTrialPrompt,
  listScenarios,
  appendResult,
  loadResults,
  passAtK,
  passAllK,
  computeDelta,
  generateBenchmark,
  getVerdict,
  ensureEvalsDir,
  gradeWithCode,
  parseAssertionLabels,
  buildCodeGraderBlockRefs,
  gradeWithModel,
  gradeTrialResult,
  saveTranscript,
  captureTrialArtifacts,
  parseStreamJsonOutput,
  parseActionsFromTranscript,
  buildPluginDirSettings,
  resolveMaxTurns,
  createTrialDir,
  runTrial,
  executeAndGradeTrial,
  runSkillEval,
  runWorkflowEval,
  snapScore,
  validateGraderResponse,
  SCENARIOS_DIR,
  RESULTS_DIR,
  BENCHMARKS_DIR,
} = require('../../scripts/lib/eval');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-eval-'));
}

function writeScenario(dir, filename, content) {
  const scenariosDir = path.join(dir, SCENARIOS_DIR);
  fs.mkdirSync(scenariosDir, { recursive: true });
  const filePath = path.join(scenariosDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function makeResult(overrides = {}) {
  return {
    eval: 'test-eval',
    trial: 1,
    k: 3,
    passed: false,
    grader: 'code',
    score: 0,
    timestamp: '2026-03-17T10:00:00Z',
    ...overrides,
  };
}

const FULL_SCENARIO = `# Eval: tdd-compliance

## Scope
skill

## Scenario
Ask Claude to implement a function using TDD.

## Context
The project uses Jest for testing.

## Assertions
- [ ] Writes test before implementation
- [x] Test file exists
- [ ] All tests pass

## Grader
code

## Grader Config
npm run test:scripts
`;

describe('eval.js', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    mockUtils.execCommand.mockClear();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── parseEvalName ───────────────────────────────────────────

  describe('parseEvalName', () => {
    it('should parse baseline condition', () => {
      const { scenarioName, condition } = parseEvalName('my-eval-baseline');
      expect(scenarioName).toBe('my-eval');
      expect(condition).toBe('baseline');
    });

    it('should parse treatment condition', () => {
      const { scenarioName, condition } = parseEvalName('my-eval-treatment');
      expect(scenarioName).toBe('my-eval');
      expect(condition).toBe('treatment');
    });

    it('should default to results for single runs', () => {
      const { scenarioName, condition } = parseEvalName('my-eval');
      expect(scenarioName).toBe('my-eval');
      expect(condition).toBe('results');
    });

    it('should not strip -baseline from middle of name', () => {
      const { scenarioName, condition } = parseEvalName('baseline-eval');
      expect(scenarioName).toBe('baseline-eval');
      expect(condition).toBe('results');
    });
  });

  // ── parseScenario ────────────────────────────────────────────

  describe('parseScenario', () => {
    it('should parse a full scenario with all sections', () => {
      const filePath = writeScenario(tempDir, 'tdd.md', FULL_SCENARIO);
      const scenario = parseScenario(filePath);

      expect(scenario.name).toBe('tdd-compliance');
      expect(scenario.scope).toBe('skill');
      expect(scenario.scenario).toBe('Ask Claude to implement a function using TDD.');
      expect(scenario.context).toBe('The project uses Jest for testing.');
      expect(scenario.assertions).toEqual([
        'Writes test before implementation',
        'Test file exists',
        'All tests pass',
      ]);
      expect(scenario.grader).toBe('code');
      expect(scenario.graderConfig).toBe('npm run test:scripts');
    });

    it('should fall back to filename when no Eval header', () => {
      const content = '## Scope\nagent\n\n## Scenario\nDo something.\n';
      const filePath = writeScenario(tempDir, 'my-eval.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.name).toBe('my-eval');
    });

    it('should extract both checked and unchecked assertions', () => {
      const content = `# Eval: mixed
## Assertions
- [ ] unchecked item
- [x] checked item
- [ ] another unchecked
`;
      const filePath = writeScenario(tempDir, 'mixed.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.assertions).toHaveLength(3);
      expect(scenario.assertions[0]).toBe('unchecked item');
      expect(scenario.assertions[1]).toBe('checked item');
    });

    it('should use defaults for missing sections', () => {
      const content = '# Eval: minimal\n\n## Scenario\nJust a task.\n';
      const filePath = writeScenario(tempDir, 'minimal.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.name).toBe('minimal');
      expect(scenario.scope).toBe('skill');
      expect(scenario.context).toBe('');
      expect(scenario.assertions).toEqual([]);
      expect(scenario.grader).toBe('code');
      expect(scenario.graderConfig).toBe('');
    });

    it('should ignore non-assertion lines in assertions section', () => {
      const content = `# Eval: filtered
## Assertions
Some intro text.
- [ ] Real assertion
- Not a checkbox item
- [ ] Another assertion
Plain text at end.
`;
      const filePath = writeScenario(tempDir, 'filtered.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.assertions).toEqual(['Real assertion', 'Another assertion']);
    });

    it('should extract trials section as integer', () => {
      const content = `# Eval: with-trials
## Scenario
Do something.
## Trials
15
`;
      const filePath = writeScenario(tempDir, 'with-trials.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.trials).toBe(15);
    });

    it('should default trials to undefined when missing', () => {
      const content = '# Eval: no-trials\n\n## Scenario\nJust a task.\n';
      const filePath = writeScenario(tempDir, 'no-trials.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.trials).toBeUndefined();
    });

    it('should extract version section', () => {
      const content = `# Eval: versioned
## Scenario
Do something.
## Version
2
`;
      const filePath = writeScenario(tempDir, 'versioned.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.version).toBe('2');
    });

    it('should preserve [tool_called] prefix on behavioral assertions', () => {
      // Regression: an earlier strip regex ate `[tool_called]` along with
      // markdown checkboxes, silently rerouting behavioral assertions to
      // the model grader. Behavioral prefixes MUST reach parseBehavioralAssertion.
      const content = `# Eval: behavioral
## Scenario
Do stuff.
## Assertions
- [ ] text one
- [tool_called] Bash:npm test
- [tool_not_called] Bash:rm -rf
- [tool_before] Bash:npm install < Bash:npm test
- [x] already-checked text
`;
      const filePath = writeScenario(tempDir, 'behavioral.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.assertions).toHaveLength(5);
      expect(scenario.assertions[0]).toBe('text one');
      expect(scenario.assertions[1]).toBe('[tool_called] Bash:npm test');
      expect(scenario.assertions[2]).toBe('[tool_not_called] Bash:rm -rf');
      expect(scenario.assertions[3]).toBe('[tool_before] Bash:npm install < Bash:npm test');
      expect(scenario.assertions[4]).toBe('already-checked text');
    });

    it('should default version to undefined when missing', () => {
      const content = '# Eval: no-version\n\n## Scenario\nJust a task.\n';
      const filePath = writeScenario(tempDir, 'no-version.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.version).toBeUndefined();
    });

    it('should extract explicit preflight skip section', () => {
      const content = `# Eval: non-regression
## Scenario
Do something.
## Preflight
skip
`;
      const filePath = writeScenario(tempDir, 'preflight-skip.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.preflight).toBe('skip');
    });

    it('should default preflight to undefined when missing', () => {
      const content = '# Eval: default-preflight\n\n## Scenario\nJust a task.\n';
      const filePath = writeScenario(tempDir, 'default-preflight.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.preflight).toBeUndefined();
    });

    it('should extract target section', () => {
      const content = `# Eval: with-target
## Scope
skill
## Target
skills/arc-tdd/SKILL.md
## Scenario
Do something.
`;
      const filePath = writeScenario(tempDir, 'with-target.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.target).toBe('skills/arc-tdd/SKILL.md');
    });

    it('should default target to undefined when missing', () => {
      const content = '# Eval: no-target\n\n## Scenario\nJust a task.\n';
      const filePath = writeScenario(tempDir, 'no-target.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.target).toBeUndefined();
    });

    it('should preserve ## lines inside heredocs in setup section', () => {
      const content = `# Eval: heredoc-test

## Scenario
Do something.

## Setup

cat > briefing.md << 'EOF'
# Title

## Section One
Content of section one.

## Section Two
Content of section two.
EOF

## Assertions

- [ ] Check something
`;
      const filePath = writeScenario(tempDir, 'heredoc.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.setup).toContain('## Section One');
      expect(scenario.setup).toContain('## Section Two');
      expect(scenario.setup).toContain('Content of section two.');
      expect(scenario.assertions).toEqual(['Check something']);
    });

    it('should handle multiple heredocs with ## lines in setup', () => {
      const content = `# Eval: multi-heredoc

## Scenario
Do something.

## Setup

cat > file1.md << 'EOF'
## Heading A
Content A.
EOF

cat > file2.md << 'MARKER'
## Heading B
Content B.
MARKER

## Assertions

- [ ] Verify output
`;
      const filePath = writeScenario(tempDir, 'multi-heredoc.md', content);
      const scenario = parseScenario(filePath);

      expect(scenario.setup).toContain('## Heading A');
      expect(scenario.setup).toContain('## Heading B');
      expect(scenario.setup).toContain("cat > file2.md << 'MARKER'");
      expect(scenario.assertions).toEqual(['Verify output']);
    });
  });

  // ── parseStreamJsonOutput ────────────────────────────────────

  describe('parseStreamJsonOutput', () => {
    const nullUsage = { input_tokens: null, output_tokens: null, duration_ms: null };

    it('should return empty strings for empty input', () => {
      const result = parseStreamJsonOutput('');
      expect(result).toEqual({ textResult: '', richTranscript: '', usage: nullUsage });
    });

    it('should return empty strings for null/undefined', () => {
      expect(parseStreamJsonOutput(null)).toEqual({
        textResult: '',
        richTranscript: '',
        usage: nullUsage,
      });
      expect(parseStreamJsonOutput(undefined)).toEqual({
        textResult: '',
        richTranscript: '',
        usage: nullUsage,
      });
    });

    it('should extract text from assistant messages', () => {
      const input = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello world' }] },
      });
      const { richTranscript } = parseStreamJsonOutput(input);
      expect(richTranscript).toContain('[Assistant] Hello world');
    });

    it('should extract tool use from assistant messages', () => {
      const input = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }],
        },
      });
      const { richTranscript } = parseStreamJsonOutput(input);
      expect(richTranscript).toContain('[Tool: Bash] $ ls -la');
    });

    it('should extract textResult from result event', () => {
      const input = JSON.stringify({ type: 'result', result: 'Final answer' });
      const { textResult } = parseStreamJsonOutput(input);
      expect(textResult).toBe('Final answer');
    });

    it('should skip malformed JSON lines', () => {
      const lines = [
        'not json at all',
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'OK' }] } }),
        '{ broken',
      ].join('\n');
      const { richTranscript } = parseStreamJsonOutput(lines);
      expect(richTranscript).toContain('[Assistant] OK');
    });

    it('should skip system and other non-assistant events', () => {
      const lines = [
        JSON.stringify({ type: 'system', subtype: 'init' }),
        JSON.stringify({ type: 'rate_limit_event' }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Real content' }] },
        }),
      ].join('\n');
      const { richTranscript } = parseStreamJsonOutput(lines);
      expect(richTranscript).toBe('[Assistant] Real content');
    });

    it('should include full Write content without truncation', () => {
      const longContent = 'x'.repeat(600);
      const input = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/tmp/f.js', content: longContent },
            },
          ],
        },
      });
      const { richTranscript } = parseStreamJsonOutput(input);
      expect(richTranscript).toContain('/tmp/f.js');
      expect(richTranscript).toContain(longContent);
      expect(richTranscript).not.toContain('truncated');
    });

    it('should handle Edit tool summary', () => {
      const input = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/tmp/f.js', old_string: 'old', new_string: 'new' },
            },
          ],
        },
      });
      const { richTranscript } = parseStreamJsonOutput(input);
      expect(richTranscript).toContain('[Tool: Edit]');
      expect(richTranscript).toContain('replace "old"');
      expect(richTranscript).toContain('"new"');
    });
  });

  // ── parseActionsFromTranscript ──────────────────────────────

  describe('parseActionsFromTranscript', () => {
    it('should parse a tool action', () => {
      const transcript = '[Tool: Skill] arc-verifying';
      const actions = parseActionsFromTranscript(transcript);
      expect(actions).toEqual([{ type: 'tool', name: 'Skill', args: 'arc-verifying', index: 0 }]);
    });

    it('should parse an assistant text action', () => {
      const transcript = '[Assistant] some text';
      const actions = parseActionsFromTranscript(transcript);
      expect(actions).toEqual([{ type: 'text', content: 'some text', index: 0 }]);
    });

    it('should take only first line as args for multi-line tool output', () => {
      const transcript = '[Tool: Write] /tmp/file.js\n```\nconsole.log("hi")\n```';
      const actions = parseActionsFromTranscript(transcript);
      expect(actions).toHaveLength(1);
      expect(actions[0].args).toBe('/tmp/file.js');
    });

    it('should produce 0-based monotonically increasing indices', () => {
      const transcript = [
        '[Assistant] first',
        '',
        '[Tool: Bash] $ ls',
        '',
        '[Assistant] second',
      ].join('\n');
      const actions = parseActionsFromTranscript(transcript);
      expect(actions.map((a) => a.index)).toEqual([0, 1, 2]);
    });

    it('should return empty array for empty transcript', () => {
      expect(parseActionsFromTranscript('')).toEqual([]);
      expect(parseActionsFromTranscript(null)).toEqual([]);
      expect(parseActionsFromTranscript(undefined)).toEqual([]);
    });

    it('should handle mixed tool and text actions', () => {
      const transcript = [
        '[Assistant] Let me check the files',
        '',
        '[Tool: Bash] $ ls -la',
        '',
        '[Tool: Read] /tmp/foo.js',
        '',
        '[Assistant] Here is the result',
      ].join('\n');
      const actions = parseActionsFromTranscript(transcript);
      expect(actions).toHaveLength(4);
      expect(actions[0]).toEqual({ type: 'text', content: 'Let me check the files', index: 0 });
      expect(actions[1]).toEqual({ type: 'tool', name: 'Bash', args: '$ ls -la', index: 1 });
      expect(actions[2]).toEqual({ type: 'tool', name: 'Read', args: '/tmp/foo.js', index: 2 });
      expect(actions[3]).toEqual({ type: 'text', content: 'Here is the result', index: 3 });
    });
  });

  // ── parseScenario — Plugin Dir & Max Turns ──────────────────

  describe('parseScenario — Plugin Dir', () => {
    it('should resolve PROJECT_ROOT variable in Plugin Dir', () => {
      const content = `# Eval: plugin-test
## Scenario
Do something.
## Plugin Dir
\${PROJECT_ROOT}
`;
      const filePath = writeScenario(tempDir, 'plugin-test.md', content);
      const scenario = parseScenario(filePath, tempDir);
      expect(scenario.pluginDir).toBe(tempDir);
    });

    it('should use absolute path as-is for Plugin Dir', () => {
      const content = `# Eval: plugin-abs
## Scenario
Do something.
## Plugin Dir
/opt/plugins/my-plugin
`;
      const filePath = writeScenario(tempDir, 'plugin-abs.md', content);
      const scenario = parseScenario(filePath);
      expect(scenario.pluginDir).toBe('/opt/plugins/my-plugin');
    });

    it('should leave pluginDir undefined when missing', () => {
      const content = `# Eval: no-plugin
## Scenario
Do something.
`;
      const filePath = writeScenario(tempDir, 'no-plugin.md', content);
      const scenario = parseScenario(filePath);
      expect(scenario.pluginDir).toBeUndefined();
    });
  });

  describe('parseScenario — Max Turns', () => {
    it('should parse Max Turns as integer', () => {
      const content = `# Eval: turns-test
## Scenario
Do something.
## Max Turns
5
`;
      const filePath = writeScenario(tempDir, 'turns-test.md', content);
      const scenario = parseScenario(filePath);
      expect(scenario.maxTurns).toBe(5);
    });

    it('should leave maxTurns undefined when missing', () => {
      const content = `# Eval: no-turns
## Scenario
Do something.
`;
      const filePath = writeScenario(tempDir, 'no-turns.md', content);
      const scenario = parseScenario(filePath);
      expect(scenario.maxTurns).toBeUndefined();
    });
  });

  // ── resolveMaxTurns ─────────────────────────────────────────

  describe('resolveMaxTurns', () => {
    it('should return CLI maxTurns when set', () => {
      expect(resolveMaxTurns({ maxTurns: 20, scenarioMaxTurns: 10, pluginDir: '/foo' })).toBe(20);
    });

    it('should return scenario maxTurns when CLI not set', () => {
      expect(resolveMaxTurns({ scenarioMaxTurns: 15, pluginDir: '/foo' })).toBe(15);
    });

    it('should default to 10 when pluginDir set and no explicit maxTurns', () => {
      expect(resolveMaxTurns({ pluginDir: '/foo' })).toBe(10);
    });

    it('should return undefined when no pluginDir and no explicit maxTurns', () => {
      expect(resolveMaxTurns({})).toBeUndefined();
    });

    it('should prefer CLI over scenario over pluginDir default', () => {
      expect(resolveMaxTurns({ maxTurns: 25, scenarioMaxTurns: 15, pluginDir: '/foo' })).toBe(25);
    });
  });

  // ── buildPluginDirSettings ──────────────────────────────────

  describe('buildPluginDirSettings', () => {
    it('should disable all plugins and auto-memory', () => {
      const settings = JSON.parse(buildPluginDirSettings());
      expect(settings.autoMemoryEnabled).toBe(false);
      expect(settings).not.toHaveProperty('claudeMdExcludes');
    });

    it('should include enabledPlugins all set to false', () => {
      // When claude CLI unavailable, still returns valid JSON without enabledPlugins
      const settings = JSON.parse(buildPluginDirSettings());
      expect(settings.autoMemoryEnabled).toBe(false);
      // enabledPlugins may or may not be present depending on CLI availability
      if (settings.enabledPlugins) {
        for (const val of Object.values(settings.enabledPlugins)) {
          expect(val).toBe(false);
        }
      }
    });

    it('should return valid JSON even if claude CLI unavailable', () => {
      // Force CLI to fail
      mockUtils.execCommand.mockReturnValueOnce({ stdout: '', stderr: 'not found', exitCode: 1 });
      const result = buildPluginDirSettings();
      expect(() => JSON.parse(result)).not.toThrow();
      const settings = JSON.parse(result);
      expect(settings.autoMemoryEnabled).toBe(false);
      expect(settings).not.toHaveProperty('claudeMdExcludes');
    });
  });

  // ── runTrial ────────────────────────────────────────────────

  describe('runTrial', () => {
    it('should initialize a best-effort git boundary in trial dirs', () => {
      const trialDir = createTrialDir('boundary-test', 1, tempDir);
      expect(fs.existsSync(path.join(trialDir, '.git', 'HEAD'))).toBe(true);
    });

    it('should return structured setup_failed infraError instead of throwing', () => {
      const scenario = {
        name: 'setup-failure',
        scenario: 'No-op.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
        setup: 'exit 1',
      };
      mockUtils.execCommand.mockReturnValueOnce({ stdout: '', stderr: 'boom', exitCode: 1 });

      const result = runTrial(scenario, 1, 1, { projectRoot: tempDir, isolated: false });

      expect(result.infraError).toBe(true);
      expect(result.errorType).toBe('setup_failed');
      expect(result.error).toContain('Setup failed');
      expect(result.trialDir).toBeTruthy();
      expect(fs.existsSync(result.trialDir)).toBe(true);
    });

    it('should clean trial dirs for setup_failed infraError in executeAndGradeTrial', () => {
      const scenario = {
        name: 'setup-cleanup',
        scenario: 'No-op.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
        setup: 'exit 1',
      };
      mockUtils.execCommand.mockReturnValueOnce({ stdout: '', stderr: 'boom', exitCode: 1 });

      const result = executeAndGradeTrial(scenario, scenario, 1, 1, {
        projectRoot: tempDir,
        isolated: false,
      });

      expect(result.infraError).toBe(true);
      expect(result.errorType).toBe('setup_failed');
      expect(fs.existsSync(result.trialDir)).toBe(false);
    });

    it('should use cached semi-isolation settings for pluginDir trials', () => {
      const scenario = {
        name: 'cached-semi',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };
      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');
      mockUtils.execCommand.mockReturnValueOnce({ stdout: rawStream, stderr: '', exitCode: 0 });

      const result = runTrial(scenario, 1, 1, {
        projectRoot: tempDir,
        isolated: false,
        pluginDir: tempDir,
        isolationSettings: '{"cached":true}',
      });

      expect(result.infraError).toBeUndefined();
      const settings = fs.readFileSync(
        path.join(result.trialDir, '.claude', 'settings.json'),
        'utf8',
      );
      expect(settings).toBe('{"cached":true}');
      expect(mockUtils.execCommand).toHaveBeenCalledTimes(1);
    });

    it('should not use raw stream-json as graded output when no assistant text is captured', () => {
      const scenario = {
        name: 'thinking-only',
        scenario: 'Repair the draft.',
        context: 'Context-only task.',
        assertions: ['A'],
        grader: 'model',
        graderConfig: 'Score it.',
      };

      const rawStream = [
        JSON.stringify({ type: 'system', subtype: 'init' }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'thinking', thinking: 'Internal reasoning only' }] },
        }),
        JSON.stringify({ type: 'result', subtype: 'success', result: '', stop_reason: 'end_turn' }),
      ].join('\n');

      mockUtils.execCommand.mockReturnValueOnce({
        stdout: rawStream,
        stderr: '',
        exitCode: 0,
      });

      const result = runTrial(scenario, 1, 1, { projectRoot: tempDir, isolated: false });

      expect(result.output).toBe('');
      expect(result.error).toContain('No assistant output captured');
      expect(fs.readFileSync(result.transcript, 'utf8')).toContain('"type":"assistant"');
    });
  });

  // ── buildTrialPrompt ─────────────────────────────────────────

  describe('buildTrialPrompt', () => {
    it('should include context and task but not assertions', () => {
      const scenario = {
        context: 'Project uses Jest.',
        scenario: 'Write a function.',
        assertions: ['Tests pass', 'Code compiles'],
      };
      const prompt = buildTrialPrompt(scenario);

      expect(prompt).toContain('## Context');
      expect(prompt).toContain('Project uses Jest.');
      expect(prompt).toContain('## Task');
      expect(prompt).toContain('Write a function.');
      // Assertions are grading criteria, not agent requirements
      expect(prompt).not.toContain('## Requirements');
      expect(prompt).not.toContain('Tests pass');
    });

    it('should omit context when empty', () => {
      const scenario = { context: '', scenario: 'Do something.', assertions: [] };
      const prompt = buildTrialPrompt(scenario);

      expect(prompt).not.toContain('## Context');
      expect(prompt).toContain('## Task');
    });
  });

  // ── listScenarios ─────────────────────────────────────────────

  describe('listScenarios', () => {
    it('should return empty array when scenarios dir does not exist', () => {
      const result = listScenarios(tempDir);
      expect(result).toEqual([]);
    });

    it('should return only .md files', () => {
      const scenariosDir = path.join(tempDir, SCENARIOS_DIR);
      fs.mkdirSync(scenariosDir, { recursive: true });
      fs.writeFileSync(path.join(scenariosDir, 'a.md'), '# Eval: a');
      fs.writeFileSync(path.join(scenariosDir, 'b.md'), '# Eval: b');
      fs.writeFileSync(path.join(scenariosDir, 'c.txt'), 'not a scenario');

      const result = listScenarios(tempDir);
      expect(result).toHaveLength(2);
      expect(result.every((f) => f.endsWith('.md'))).toBe(true);
    });

    it('should return full paths', () => {
      writeScenario(tempDir, 'test.md', '# Eval: test');
      const result = listScenarios(tempDir);

      expect(result).toHaveLength(1);
      expect(path.isAbsolute(result[0])).toBe(true);
      expect(result[0]).toContain(tempDir);
    });
  });

  // ── appendResult / loadResults ────────────────────────────────

  describe('appendResult and loadResults', () => {
    it('should roundtrip a single result', () => {
      const result = makeResult({ passed: true, score: 1.0 });
      appendResult(result, tempDir);

      const loaded = loadResults('test-eval', tempDir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].eval).toBe('test-eval');
      expect(loaded[0].passed).toBe(true);
      expect(loaded[0].score).toBe(1.0);
    });

    it('should append multiple results to same file', () => {
      appendResult(makeResult({ trial: 1 }), tempDir);
      appendResult(makeResult({ trial: 2 }), tempDir);
      appendResult(makeResult({ trial: 3 }), tempDir);

      const loaded = loadResults('test-eval', tempDir);
      expect(loaded).toHaveLength(3);
      expect(loaded.map((r) => r.trial)).toEqual([1, 2, 3]);
    });

    it('should return empty when results dir does not exist', () => {
      const loaded = loadResults('nonexistent', tempDir);
      expect(loaded).toEqual([]);
    });

    it('should not cross-contaminate evals with similar name suffixes', () => {
      // "tdd" results should NOT include "advanced-tdd" results
      const tddResult = makeResult({ eval: 'tdd', score: 1.0, passed: true });
      const advResult = makeResult({ eval: 'advanced-tdd', score: 0.5 });

      appendResult(tddResult, tempDir);
      appendResult(advResult, tempDir);

      const tddLoaded = loadResults('tdd', tempDir);
      expect(tddLoaded).toHaveLength(1);
      expect(tddLoaded[0].eval).toBe('tdd');
    });

    it('should create results directory if missing', () => {
      const resultsDir = path.join(tempDir, RESULTS_DIR);
      expect(fs.existsSync(resultsDir)).toBe(false);

      appendResult(makeResult(), tempDir);
      expect(fs.existsSync(resultsDir)).toBe(true);
    });

    it('should create hierarchical directory structure', () => {
      appendResult(makeResult({ timestamp: '2026-03-17T10:00:00Z' }), tempDir);

      const scenarioDir = path.join(tempDir, RESULTS_DIR, 'test-eval');
      expect(fs.existsSync(scenarioDir)).toBe(true);
      // Without runId, falls back to compact date (YYYYMMDD) as dir name
      const runDir = path.join(scenarioDir, '20260317');
      expect(fs.existsSync(runDir)).toBe(true);
      const files = fs.readdirSync(runDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('results.jsonl');
    });

    it('should use runId as directory when provided', () => {
      appendResult(makeResult({ runId: '20260317-100000' }), tempDir);

      const jsonlPath = path.join(
        tempDir,
        RESULTS_DIR,
        'test-eval',
        '20260317-100000',
        'results.jsonl',
      );
      expect(fs.existsSync(jsonlPath)).toBe(true);
    });

    it('should store A/B results as baseline.jsonl and treatment.jsonl', () => {
      appendResult(makeResult({ eval: 'my-ab-baseline', runId: '20260317-100000' }), tempDir);
      appendResult(makeResult({ eval: 'my-ab-treatment', runId: '20260317-100000' }), tempDir);

      const runDir = path.join(tempDir, RESULTS_DIR, 'my-ab', '20260317-100000');
      expect(fs.existsSync(path.join(runDir, 'baseline.jsonl'))).toBe(true);
      expect(fs.existsSync(path.join(runDir, 'treatment.jsonl'))).toBe(true);
    });

    it('should filter by version', () => {
      appendResult(makeResult({ trial: 1, score: 0.5, version: '1' }), tempDir);
      appendResult(makeResult({ trial: 2, score: 0.8, version: '2' }), tempDir);
      appendResult(makeResult({ trial: 3, score: 0.9, version: '2' }), tempDir);

      const v2 = loadResults('test-eval', tempDir, { version: '2' });
      expect(v2).toHaveLength(2);
      expect(v2.every((r) => r.version === '2')).toBe(true);
    });

    it('should default unversioned results to version 1', () => {
      appendResult(makeResult({ trial: 1, score: 0.5 }), tempDir);
      appendResult(makeResult({ trial: 2, score: 0.8, version: '2' }), tempDir);

      const v1 = loadResults('test-eval', tempDir, { version: '1' });
      expect(v1).toHaveLength(1);
      expect(v1[0].trial).toBe(1);
    });

    it('should filter by since date', () => {
      appendResult(makeResult({ trial: 1, timestamp: '2026-03-15T10:00:00Z' }), tempDir);
      appendResult(makeResult({ trial: 2, timestamp: '2026-03-18T10:00:00Z' }), tempDir);

      const recent = loadResults('test-eval', tempDir, { since: '2026-03-17' });
      expect(recent).toHaveLength(1);
      expect(recent[0].trial).toBe(2);
    });

    it('should return all results when no filter options', () => {
      appendResult(makeResult({ trial: 1, version: '1' }), tempDir);
      appendResult(makeResult({ trial: 2, version: '2' }), tempDir);

      const all = loadResults('test-eval', tempDir);
      expect(all).toHaveLength(2);
    });

    it('should filter by model', () => {
      appendResult(makeResult({ trial: 1, model: 'sonnet' }), tempDir);
      appendResult(makeResult({ trial: 2, model: 'opus' }), tempDir);
      appendResult(makeResult({ trial: 3, model: 'sonnet' }), tempDir);

      const sonnet = loadResults('test-eval', tempDir, { model: 'sonnet' });
      expect(sonnet).toHaveLength(2);
      expect(sonnet.every((r) => r.model === 'sonnet')).toBe(true);
    });

    it('should read from legacy flat files when no scenario dir exists', () => {
      // Manually write a legacy flat file
      const resultsDir = path.join(tempDir, RESULTS_DIR);
      fs.mkdirSync(resultsDir, { recursive: true });
      const legacy = makeResult({ passed: true, score: 1.0 });
      fs.writeFileSync(
        path.join(resultsDir, '2026-03-17-test-eval.jsonl'),
        `${JSON.stringify(legacy)}\n`,
      );

      const loaded = loadResults('test-eval', tempDir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].passed).toBe(true);
    });

    it('should load A/B results from hierarchical condition files', () => {
      appendResult(
        makeResult({ eval: 'ab-test-baseline', runId: '20260317-100000', score: 0.3 }),
        tempDir,
      );
      appendResult(
        makeResult({ eval: 'ab-test-treatment', runId: '20260317-100000', score: 0.9 }),
        tempDir,
      );

      const baseline = loadResults('ab-test-baseline', tempDir);
      expect(baseline).toHaveLength(1);
      expect(baseline[0].score).toBe(0.3);

      const treatment = loadResults('ab-test-treatment', tempDir);
      expect(treatment).toHaveLength(1);
      expect(treatment[0].score).toBe(0.9);
    });
  });

  // ── passAtK ──────────────────────────────────────────────────

  describe('passAtK', () => {
    it('should return true when at least one passes', () => {
      expect(passAtK([{ passed: false }, { passed: true }, { passed: false }])).toBe(true);
    });

    it('should return false when all fail', () => {
      expect(passAtK([{ passed: false }, { passed: false }])).toBe(false);
    });

    it('should return true when all pass', () => {
      expect(passAtK([{ passed: true }, { passed: true }])).toBe(true);
    });

    it('should return false for empty array', () => {
      expect(passAtK([])).toBe(false);
    });
  });

  // ── passAllK ─────────────────────────────────────────────────

  describe('passAllK', () => {
    it('should return true when all pass', () => {
      expect(passAllK([{ passed: true }, { passed: true }])).toBe(true);
    });

    it('should return false when any fails', () => {
      expect(passAllK([{ passed: true }, { passed: false }])).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(passAllK([])).toBe(false);
    });
  });

  // ── computeDelta ─────────────────────────────────────────────

  describe('computeDelta', () => {
    it('should compute positive delta', () => {
      const baseline = [{ score: 0.4 }, { score: 0.6 }]; // avg 0.5
      const treatment = [{ score: 0.7 }, { score: 0.9 }]; // avg 0.8
      expect(computeDelta(baseline, treatment)).toBeCloseTo(0.3);
    });

    it('should compute negative delta', () => {
      const baseline = [{ score: 0.8 }];
      const treatment = [{ score: 0.5 }];
      expect(computeDelta(baseline, treatment)).toBeCloseTo(-0.3);
    });

    it('should return 0 for empty baseline', () => {
      expect(computeDelta([], [{ score: 1.0 }])).toBe(0);
    });

    it('should return 0 for empty treatment', () => {
      expect(computeDelta([{ score: 1.0 }], [])).toBe(0);
    });

    it('should return 0 for identical scores', () => {
      const data = [{ score: 0.7 }, { score: 0.7 }];
      expect(computeDelta(data, data)).toBeCloseTo(0);
    });
  });

  // ── getVerdict ────────────────────────────────────────────────

  describe('getVerdict', () => {
    it('should return SHIP for 100% pass rate', () => {
      expect(getVerdict([{ passed: true }, { passed: true }, { passed: true }])).toBe('SHIP');
    });

    it('should return NEEDS WORK for 80% pass rate', () => {
      const results = [
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: false },
      ];
      expect(getVerdict(results)).toBe('NEEDS WORK');
    });

    it('should return NEEDS WORK at exactly 60% boundary', () => {
      const results = [
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: false },
        { passed: false },
      ];
      expect(getVerdict(results)).toBe('NEEDS WORK');
    });

    it('should return BLOCKED for <60% pass rate', () => {
      const results = [
        { passed: true },
        { passed: false },
        { passed: false },
        { passed: false },
        { passed: false },
      ];
      expect(getVerdict(results)).toBe('BLOCKED');
    });

    it('should return BLOCKED for empty results', () => {
      expect(getVerdict([])).toBe('BLOCKED');
    });
  });

  // ── generateBenchmark ─────────────────────────────────────────

  describe('generateBenchmark', () => {
    it('should generate benchmark from scenarios and results', () => {
      writeScenario(
        tempDir,
        'my-eval.md',
        '# Eval: my-eval\n\n## Scope\nagent\n\n## Scenario\nTest.\n',
      );

      const resultsDir = path.join(tempDir, RESULTS_DIR);
      fs.mkdirSync(resultsDir, { recursive: true });
      const results = [
        makeResult({ eval: 'my-eval', trial: 1, passed: true, score: 1.0 }),
        makeResult({ eval: 'my-eval', trial: 2, passed: true, score: 0.8 }),
        makeResult({ eval: 'my-eval', trial: 3, passed: false, score: 0.2 }),
      ];
      const jsonl = `${results.map((r) => JSON.stringify(r)).join('\n')}\n`;
      fs.writeFileSync(path.join(resultsDir, '2026-03-17-my-eval.jsonl'), jsonl);

      const benchmark = generateBenchmark(tempDir);

      expect(benchmark.evals['my-eval']).toBeDefined();
      expect(benchmark.evals['my-eval'].trials).toBe(3);
      expect(benchmark.evals['my-eval'].pass_rate).toBeCloseTo(0.67, 1);
      expect(benchmark.evals['my-eval'].avg_score).toBeCloseTo(0.67, 1);
      expect(benchmark.evals['my-eval'].pass_at_k).toBe(true);
      expect(benchmark.evals['my-eval'].pass_all_k).toBe(false);
    });

    it('should skip scenarios with no results', () => {
      writeScenario(tempDir, 'empty-eval.md', '# Eval: empty-eval\n\n## Scenario\nNo runs.\n');

      const benchmark = generateBenchmark(tempDir);
      expect(benchmark.evals['empty-eval']).toBeUndefined();
    });

    it('should write latest.json', () => {
      writeScenario(tempDir, 'bench.md', '# Eval: bench\n\n## Scenario\nTest.\n');
      generateBenchmark(tempDir);

      const jsonPath = path.join(tempDir, BENCHMARKS_DIR, 'latest.json');
      expect(fs.existsSync(jsonPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      expect(data.generated).toBeDefined();
    });

    it('should write timestamped snapshot alongside latest.json', () => {
      writeScenario(tempDir, 'snap.md', '# Eval: snap\n\n## Scenario\nTest.\n');
      const benchmark = generateBenchmark(tempDir);

      const dateStr = benchmark.generated.split('T')[0];
      const snapshotPath = path.join(tempDir, BENCHMARKS_DIR, `${dateStr}.json`);
      expect(fs.existsSync(snapshotPath)).toBe(true);

      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      const latest = JSON.parse(
        fs.readFileSync(path.join(tempDir, BENCHMARKS_DIR, 'latest.json'), 'utf8'),
      );
      expect(snapshot).toEqual(latest);
    });

    it('should include by_model breakdown when results have model field', () => {
      writeScenario(
        tempDir,
        'model-eval.md',
        '# Eval: model-eval\n\n## Scope\nagent\n\n## Scenario\nTest.\n',
      );

      // Use appendResult to write in new hierarchical format
      appendResult(
        makeResult({
          eval: 'model-eval',
          trial: 1,
          passed: true,
          score: 1.0,
          model: 'sonnet',
          runId: '20260317-100000',
        }),
        tempDir,
      );
      appendResult(
        makeResult({
          eval: 'model-eval',
          trial: 2,
          passed: false,
          score: 0.5,
          model: 'opus',
          runId: '20260317-100000',
        }),
        tempDir,
      );

      const benchmark = generateBenchmark(tempDir);
      const data = benchmark.evals['model-eval'];
      expect(data).toBeDefined();
      expect(data.trials).toBe(2);
      expect(data.by_model).toBeDefined();
      expect(data.by_model.sonnet.trials).toBe(1);
      expect(data.by_model.sonnet.pass_rate).toBe(1.0);
      expect(data.by_model.opus.trials).toBe(1);
      expect(data.by_model.opus.pass_rate).toBe(0);
    });

    it('should not include by_model when no model field in results', () => {
      writeScenario(
        tempDir,
        'no-model.md',
        '# Eval: no-model\n\n## Scope\nagent\n\n## Scenario\nTest.\n',
      );

      appendResult(
        makeResult({
          eval: 'no-model',
          trial: 1,
          passed: true,
          score: 1.0,
          runId: '20260317-100000',
        }),
        tempDir,
      );

      const benchmark = generateBenchmark(tempDir);
      expect(benchmark.evals['no-model'].by_model).toBeUndefined();
    });
  });

  // ── ensureEvalsDir ────────────────────────────────────────────

  describe('ensureEvalsDir', () => {
    it('should create all three subdirectories', () => {
      ensureEvalsDir(tempDir);

      expect(fs.existsSync(path.join(tempDir, SCENARIOS_DIR))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, RESULTS_DIR))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, BENCHMARKS_DIR))).toBe(true);
    });

    it('should be idempotent', () => {
      ensureEvalsDir(tempDir);
      ensureEvalsDir(tempDir);

      expect(fs.existsSync(path.join(tempDir, SCENARIOS_DIR))).toBe(true);
    });
  });

  // ── gradeWithCode ─────────────────────────────────────────────

  describe('gradeWithCode', () => {
    it('should return passed:true for successful command', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, ['node', '-e', 'process.exit(0)'], tempDir);

      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should return passed:false for failing command', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, ['node', '-e', 'process.exit(1)'], tempDir);

      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0.0);
    });

    it('should not mutate the input result', () => {
      const result = makeResult();
      const original = { ...result };
      gradeWithCode(result, ['node', '-e', 'process.exit(0)'], tempDir);

      expect(result).toEqual(original);
    });

    it('should handle string command via shell', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, 'node -e "process.exit(0)"', tempDir);

      expect(graded.passed).toBe(true);
    });

    it('should handle shell features like && chaining', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, 'true && node -e "process.exit(0)"', tempDir);

      expect(graded.passed).toBe(true);
    });

    it('should inject TRIAL_DIR env var when result has trialDir', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-env-'));
      fs.writeFileSync(path.join(trialDir, 'marker.txt'), 'found');
      try {
        const result = makeResult({ trialDir });
        const graded = gradeWithCode(result, 'test -f "$TRIAL_DIR/marker.txt"', tempDir);
        expect(graded.passed).toBe(true);
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });

    it('should work without trialDir (no TRIAL_DIR env var)', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, 'true', tempDir);
      expect(graded.passed).toBe(true);
    });

    it('should run grader in trialDir when available', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-cwd-'));
      fs.writeFileSync(path.join(trialDir, 'artifact.txt'), 'hello');
      try {
        const result = makeResult({ trialDir });
        const graded = gradeWithCode(result, 'test -f artifact.txt', tempDir);
        expect(graded.passed).toBe(true);
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });

    it('should inject PROJECT_ROOT env var', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-pr-'));
      try {
        const result = makeResult({ trialDir });
        const graded = gradeWithCode(result, `test "$PROJECT_ROOT" = "${tempDir}"`, tempDir);
        expect(graded.passed).toBe(true);
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });
  });

  // ── parseAssertionLabels ─────────────────────────────────────

  describe('parseAssertionLabels', () => {
    it('should parse mixed PASS and FAIL labels', () => {
      const stdout = 'A1:PASS\nA2:FAIL:found throw\nA3:PASS\n';
      const results = parseAssertionLabels(stdout);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ index: 1, passed: true, reason: '' });
      expect(results[1]).toEqual({ index: 2, passed: false, reason: 'found throw' });
      expect(results[2]).toEqual({ index: 3, passed: true, reason: '' });
    });

    it('should return empty array when no labels found', () => {
      const stdout = 'some random output\nPASS: all good\n';
      expect(parseAssertionLabels(stdout)).toEqual([]);
    });

    it('should sort by assertion index', () => {
      const stdout = 'A3:PASS\nA1:FAIL:oops\nA2:PASS\n';
      const results = parseAssertionLabels(stdout);

      expect(results[0].index).toBe(1);
      expect(results[1].index).toBe(2);
      expect(results[2].index).toBe(3);
    });

    it('should handle FAIL without reason', () => {
      const stdout = 'A1:FAIL\n';
      const results = parseAssertionLabels(stdout);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ index: 1, passed: false, reason: '' });
    });
  });

  // ── buildCodeGraderBlockRefs ──────────────────────────────────

  describe('buildCodeGraderBlockRefs', () => {
    it('should find Write blocks matching trial dir', () => {
      const transcript = [
        '[Assistant] I will write the file.',
        '[Tool: Write] /trial/dir/order.js\n```\ncode here\n```',
        '[Assistant] Done.',
      ].join('\n\n');
      const refs = buildCodeGraderBlockRefs(transcript, '/trial/dir', 2);

      expect(refs).toEqual([[2], [2]]);
    });

    it('should return null when no Write blocks found', () => {
      const transcript = '[Assistant] Hello.\n\n[Tool: Bash] $ ls';
      expect(buildCodeGraderBlockRefs(transcript, '/trial/dir', 2)).toBeNull();
    });

    it('should return null when transcript is empty', () => {
      expect(buildCodeGraderBlockRefs('', '/trial/dir', 2)).toBeNull();
      expect(buildCodeGraderBlockRefs(undefined, '/trial/dir', 2)).toBeNull();
    });

    it('should map multiple Write blocks to all assertions', () => {
      const transcript = [
        '[Tool: Write] /trial/dir/a.js\n```\na\n```',
        '[Assistant] Next file.',
        '[Tool: Write] /trial/dir/b.js\n```\nb\n```',
      ].join('\n\n');
      const refs = buildCodeGraderBlockRefs(transcript, '/trial/dir', 3);

      expect(refs).toEqual([
        [1, 3],
        [1, 3],
        [1, 3],
      ]);
    });
  });

  // ── gradeWithCode (per-assertion labels) ─────────────────────

  describe('gradeWithCode per-assertion labels', () => {
    it('should produce assertionScores when labels present', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-labels-'));
      try {
        const result = makeResult({ trialDir });
        const graded = gradeWithCode(
          result,
          'echo "A1:PASS" && echo "A2:FAIL:bad" && echo "A3:PASS" && exit 1',
          tempDir,
        );

        expect(graded.assertionScores).toEqual([1, 0, 1]);
        expect(graded.evidence).toEqual(['PASS', 'FAIL: bad', 'PASS']);
        expect(graded.score).toBeCloseTo(0.67, 1);
        expect(graded.passed).toBe(false);
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });

    it('should fall back to binary when no labels', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, 'echo "all good" && exit 0', tempDir);

      expect(graded.assertionScores).toBeUndefined();
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should store graderOutput from stdout', () => {
      const result = makeResult();
      const graded = gradeWithCode(result, 'echo "FAIL: something broke" && exit 1', tempDir);

      expect(graded.graderOutput).toBe('FAIL: something broke');
      expect(graded.passed).toBe(false);
    });
  });

  // ── captureTrialArtifacts ─────────────────────────────────────

  describe('captureTrialArtifacts', () => {
    it('should capture files from trial directory', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-art-'));
      fs.writeFileSync(path.join(trialDir, 'main.js'), 'console.log("hello");');
      fs.writeFileSync(path.join(trialDir, 'test.js'), 'assert(true);');
      try {
        const result = captureTrialArtifacts(trialDir);
        expect(result).toContain('main.js');
        expect(result).toContain('console.log("hello");');
        expect(result).toContain('test.js');
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });

    it('should skip hidden directories like .claude', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-art-'));
      fs.mkdirSync(path.join(trialDir, '.claude'));
      fs.writeFileSync(path.join(trialDir, '.claude', 'settings.json'), '{}');
      fs.writeFileSync(path.join(trialDir, 'app.js'), 'code');
      try {
        const result = captureTrialArtifacts(trialDir);
        expect(result).toContain('app.js');
        expect(result).not.toContain('settings.json');
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });

    it('should return empty string for missing directory', () => {
      expect(captureTrialArtifacts('/nonexistent/path')).toBe('');
      expect(captureTrialArtifacts(null)).toBe('');
      expect(captureTrialArtifacts(undefined)).toBe('');
    });

    it('should respect maxFiles limit', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-art-'));
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(trialDir, `file${i}.js`), `content ${i}`);
      }
      try {
        const result = captureTrialArtifacts(trialDir, { maxFiles: 2 });
        expect(result).toContain('more files not shown');
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });

    it('should handle large files gracefully', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-art-'));
      fs.writeFileSync(path.join(trialDir, 'big.js'), 'x'.repeat(20000));
      try {
        const result = captureTrialArtifacts(trialDir, { maxFileSize: 10000 });
        expect(result).toContain('too large to include');
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });

    it('should walk subdirectories', () => {
      const trialDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-art-'));
      fs.mkdirSync(path.join(trialDir, 'src'));
      fs.writeFileSync(path.join(trialDir, 'src', 'index.js'), 'exports');
      try {
        const result = captureTrialArtifacts(trialDir);
        expect(result).toContain('src/index.js');
      } finally {
        fs.rmSync(trialDir, { recursive: true, force: true });
      }
    });
  });

  // ── gradeWithModel ────────────────────────────────────────────

  describe('gradeWithModel', () => {
    const mockScenario = {
      name: 'test-eval',
      scope: 'agent',
      scenario: 'Do something.',
      context: '',
      assertions: ['Criterion A', 'Criterion B'],
      grader: 'model',
      graderConfig: 'Score based on completeness.',
    };

    it('should be exported as a function', () => {
      expect(typeof gradeWithModel).toBe('function');
    });

    it('should parse valid JSON grade and not mutate input', () => {
      const result = makeResult({ output: 'test output' });
      const original = { ...result };

      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [1.0, 1.0], "overall": 1.0, "passed": true}',
        stderr: '',
        exitCode: 0,
      });

      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(result).toEqual(original);
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should handle Claude failure after retry', () => {
      // Both attempts fail
      mockUtils.execCommand
        .mockReturnValueOnce({ stdout: '', stderr: 'error', exitCode: 1 })
        .mockReturnValueOnce({ stdout: '', stderr: 'error', exitCode: 1 });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0);
      expect(graded.error).toContain('failed to respond');
    });

    it('should handle unparseable response after retry', () => {
      // Both attempts return unparseable text
      mockUtils.execCommand
        .mockReturnValueOnce({ stdout: 'cannot grade...', stderr: '', exitCode: 0 })
        .mockReturnValueOnce({ stdout: 'still cannot grade...', stderr: '', exitCode: 0 });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(false);
      expect(graded.error).toContain('unparseable');
      expect(graded.gradeError).toBe(true);
      expect(graded.errorType).toBe('model_grader_unparseable');
    });

    it('should extract JSON from mixed markdown response', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout:
          'Here is my grade:\n```json\n{"scores": [1.0, 0.5], "overall": 0.75, "passed": false}\n```',
        stderr: '',
        exitCode: 0,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0.75);
    });

    it('should parse grader JSON when evidence strings contain braces', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: `Here is the grade:
\`\`\`json
{"scores":[1.0,0.5],"evidence":["Uses db.query({ text: \\"...\\", values: [normalizedEmail] })","Skips formatting"],"overall":0.75,"passed":false}
\`\`\``,
        stderr: '',
        exitCode: 0,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0.75);
      expect(graded.error).toBeUndefined();
    });

    it('should retry on first parse failure then succeed', () => {
      mockUtils.execCommand
        .mockReturnValueOnce({ stdout: 'unparseable garbage', stderr: '', exitCode: 0 })
        .mockReturnValueOnce({
          stdout: '{"scores": [1.0], "overall": 1.0, "passed": true}',
          stderr: '',
          exitCode: 0,
        });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should retry on first Claude failure then succeed', () => {
      mockUtils.execCommand
        .mockReturnValueOnce({ stdout: '', stderr: 'timeout', exitCode: 1 })
        .mockReturnValueOnce({
          stdout: '{"scores": [1.0], "overall": 1.0, "passed": true}',
          stderr: '',
          exitCode: 0,
        });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should strip code fences with json language tag', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '```json\n{"scores": [1.0], "overall": 1.0, "passed": true}\n```',
        stderr: '',
        exitCode: 0,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should snap continuous scores to 5-tier scale', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [0.85, 0.6], "overall": 0.72, "passed": true}',
        stderr: '',
        exitCode: 0,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      // 0.85 → 0.75, 0.6 → 0.5, overall recomputed = 0.63, not all 1.0 so passed=false
      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0.63);
    });

    it('should accept exact 3-tier scores unchanged', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [0, 0.5, 1.0], "overall": 0.5, "passed": false}',
        stderr: '',
        exitCode: 0,
      });

      const threeAssertionScenario = { ...mockScenario, assertions: ['A', 'B', 'C'] };
      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, threeAssertionScenario, tempDir);
      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0.5);
    });

    it('should clamp out-of-range scores', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [1.5, -0.1], "overall": 0.7, "passed": true}',
        stderr: '',
        exitCode: 0,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      // 1.5 → clamp to 1.0 → snap to 1.0, -0.1 → clamp to 0 → snap to 0
      expect(graded.passed).toBe(false);
      expect(graded.score).toBe(0.5);
    });

    it('should treat empty scores array as parse failure and retry', () => {
      mockUtils.execCommand
        .mockReturnValueOnce({
          stdout: '{"scores": [], "overall": 0, "passed": false}',
          stderr: '',
          exitCode: 0,
        })
        .mockReturnValueOnce({
          stdout: '{"scores": [1.0, 1.0], "overall": 1.0, "passed": true}',
          stderr: '',
          exitCode: 0,
        });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should recompute overall from snapped scores ignoring LLM overall', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [1.0, 0.5], "overall": 0.99, "passed": true}',
        stderr: '',
        exitCode: 0,
      });

      const result = makeResult({ output: 'test output' });
      const graded = gradeWithModel(result, mockScenario, tempDir);
      // LLM says overall=0.99, but recomputed from [1.0, 0.5] = 0.75
      expect(graded.score).toBe(0.75);
      expect(graded.passed).toBe(false);
    });
  });

  // ── snapScore ───────────────────────────────────────────────

  describe('snapScore', () => {
    it('should snap to 0 for very low scores', () => {
      expect(snapScore(0)).toBe(0);
      expect(snapScore(0.1)).toBe(0);
      expect(snapScore(0.125)).toBe(0);
    });

    it('should snap to 0.25 for low scores', () => {
      expect(snapScore(0.13)).toBe(0.25);
      expect(snapScore(0.25)).toBe(0.25);
      expect(snapScore(0.375)).toBe(0.25);
    });

    it('should snap to 0.5 for mid scores', () => {
      expect(snapScore(0.38)).toBe(0.5);
      expect(snapScore(0.5)).toBe(0.5);
      expect(snapScore(0.625)).toBe(0.5);
    });

    it('should snap to 0.75 for high scores', () => {
      expect(snapScore(0.63)).toBe(0.75);
      expect(snapScore(0.75)).toBe(0.75);
      expect(snapScore(0.875)).toBe(0.75);
    });

    it('should snap to 1.0 for very high scores', () => {
      expect(snapScore(0.88)).toBe(1.0);
      expect(snapScore(1.0)).toBe(1.0);
    });

    it('should clamp out-of-range values', () => {
      expect(snapScore(-0.5)).toBe(0);
      expect(snapScore(1.5)).toBe(1.0);
    });
  });

  // ── validateGraderResponse ────────────────────────────────────

  describe('validateGraderResponse', () => {
    it('should return null for missing scores', () => {
      expect(validateGraderResponse({}, 2)).toBeNull();
      expect(validateGraderResponse({ scores: [] }, 2)).toBeNull();
    });

    it('should snap scores and recompute overall', () => {
      const result = validateGraderResponse(
        { scores: [0.85, 0.6], overall: 0.72, passed: true },
        2,
      );
      expect(result.scores).toEqual([0.75, 0.5]);
      expect(result.overall).toBe(0.63);
      expect(result.passed).toBe(false);
    });

    it('should pass only when all scores are 1.0', () => {
      const allGood = validateGraderResponse({ scores: [1.0, 1.0], overall: 1.0, passed: true }, 2);
      expect(allGood.passed).toBe(true);

      const partial = validateGraderResponse(
        { scores: [1.0, 0.5], overall: 0.75, passed: false },
        2,
      );
      expect(partial.passed).toBe(false);
    });

    it('should handle non-numeric score values', () => {
      const result = validateGraderResponse(
        { scores: ['bad', null, 0.9], overall: 0, passed: false },
        3,
      );
      expect(result.scores).toEqual([0, 0, 1.0]);
    });

    it('should warn but not reject on assertion count mismatch', () => {
      const stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation();
      const result = validateGraderResponse({ scores: [1.0], overall: 1.0, passed: true }, 3);
      expect(result).not.toBeNull();
      expect(result.scores).toEqual([1.0]);
      expect(stderrWrite).toHaveBeenCalled();
      stderrWrite.mockRestore();
    });
  });

  // ── saveTranscript ────────────────────────────────────────────

  describe('saveTranscript', () => {
    it('should save output to transcript file in hierarchical path', () => {
      const filePath = saveTranscript('my-eval', 1, 'full output text', tempDir, '20260317-100000');

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('full output text');
      expect(filePath).toContain('trial-1.txt');
      expect(filePath).toContain(path.join('my-eval', '20260317-100000', 'transcripts'));
    });

    it('should create transcripts subdirectory under scenario/runId', () => {
      saveTranscript('test', 2, 'output', tempDir, '20260317-100000');
      const transcriptsDir = path.join(
        tempDir,
        RESULTS_DIR,
        'test',
        '20260317-100000',
        'transcripts',
      );
      expect(fs.existsSync(transcriptsDir)).toBe(true);
    });

    it('should use condition prefix for A/B transcripts', () => {
      const filePath = saveTranscript(
        'my-ab-baseline',
        1,
        'baseline output',
        tempDir,
        '20260317-100000',
      );
      expect(filePath).toContain('baseline-trial-1.txt');
      expect(filePath).toContain(path.join('my-ab', '20260317-100000', 'transcripts'));
    });

    it('should fall back to compact date when no runId', () => {
      const filePath = saveTranscript('test', 1, 'output', tempDir);
      expect(fs.existsSync(filePath)).toBe(true);
      // Falls back to YYYYMMDD format
      expect(filePath).toContain(path.join('test'));
      expect(filePath).toContain('transcripts');
    });
  });

  // ── gradeTrialResult ──────────────────────────────────────────

  describe('gradeTrialResult', () => {
    it('should dispatch to gradeWithCode for code grader', () => {
      const result = makeResult();
      const scenario = { grader: 'code', graderConfig: 'true' };
      const graded = gradeTrialResult(result, scenario, tempDir);
      expect(graded.passed).toBe(true);
      expect(graded.score).toBe(1.0);
    });

    it('should dispatch to gradeWithModel for model grader', () => {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '{"scores": [0.9], "overall": 0.9, "passed": true}',
        stderr: '',
        exitCode: 0,
      });
      const result = makeResult({ output: 'some output' });
      const scenario = {
        grader: 'model',
        graderConfig: 'Check quality.',
        assertions: ['Is good'],
      };
      const graded = gradeTrialResult(result, scenario, tempDir);
      expect(graded.passed).toBe(true);
    });

    it('should return human-pending for human grader', () => {
      const result = makeResult();
      const scenario = { grader: 'human', graderConfig: '' };
      const graded = gradeTrialResult(result, scenario, tempDir);
      expect(graded.grader).toBe('human-pending');
    });
  });

  // ── action-result-storage ─────────────────────────────────────

  describe('action-result-storage', () => {
    it('should persist actions in JSONL results', () => {
      const actions = [
        { type: 'text', content: 'hello', index: 0 },
        { type: 'tool', name: 'Bash', args: '$ ls', index: 1 },
      ];
      const result = makeResult({ actions });
      appendResult(result, tempDir);

      const loaded = loadResults('test-eval', tempDir);
      expect(loaded[0].actions).toEqual(actions);
    });

    it('should load results without actions field (backward compat)', () => {
      const result = makeResult();
      appendResult(result, tempDir);

      const loaded = loadResults('test-eval', tempDir);
      expect(loaded[0].actions).toBeUndefined();
    });
  });

  // ── runTrial — plugin-dir ───────────────────────────────────

  describe('runTrial — plugin-dir', () => {
    it('should add --plugin-dir to claude args when pluginDir set', () => {
      const scenario = {
        name: 'pd-test',
        scenario: 'Test task.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      // First call: buildPluginDirSettings() → plugin list
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });
      // Second call: claude -p trial
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: rawStream,
        stderr: '',
        exitCode: 0,
      });

      runTrial(scenario, 1, 1, {
        projectRoot: tempDir,
        pluginDir: tempDir,
        isolated: false,
      });

      // Call[0] is plugin list, Call[1] is the actual claude trial
      const callArgs = mockUtils.execCommand.mock.calls[1];
      expect(callArgs[0]).toBe('claude');
      expect(callArgs[1]).toContain('--plugin-dir');
      expect(callArgs[1]).toContain(tempDir);
      // Should NOT add --strict-mcp-config when pluginDir is used
      expect(callArgs[1]).not.toContain('--strict-mcp-config');
    });

    it('should return infraError when pluginDir path does not exist', () => {
      const scenario = {
        name: 'pd-missing',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const result = runTrial(scenario, 1, 1, {
        projectRoot: tempDir,
        pluginDir: '/nonexistent/plugin/path',
        isolated: false,
      });

      expect(result.infraError).toBe(true);
    });

    it('should not add --plugin-dir when pluginDir not set', () => {
      const scenario = {
        name: 'no-pd',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      mockUtils.execCommand.mockReturnValueOnce({
        stdout: rawStream,
        stderr: '',
        exitCode: 0,
      });

      runTrial(scenario, 1, 1, { projectRoot: tempDir, isolated: false });

      const callArgs = mockUtils.execCommand.mock.calls[0];
      expect(callArgs[1]).not.toContain('--plugin-dir');
    });
  });

  // ── runTrial — max-turns ────────────────────────────────────

  describe('runTrial — max-turns', () => {
    it('should add --max-turns when maxTurns set', () => {
      const scenario = {
        name: 'mt-test',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      mockUtils.execCommand.mockReturnValueOnce({
        stdout: rawStream,
        stderr: '',
        exitCode: 0,
      });

      runTrial(scenario, 1, 1, {
        projectRoot: tempDir,
        maxTurns: 15,
        isolated: false,
      });

      const callArgs = mockUtils.execCommand.mock.calls[0];
      expect(callArgs[1]).toContain('--max-turns');
      const mtIdx = callArgs[1].indexOf('--max-turns');
      expect(callArgs[1][mtIdx + 1]).toBe('15');
    });

    it('should default to 10 when pluginDir set but no maxTurns', () => {
      const scenario = {
        name: 'mt-default',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      // First call: buildPluginDirSettings() → plugin list
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });
      // Second call: claude -p trial
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: rawStream,
        stderr: '',
        exitCode: 0,
      });

      runTrial(scenario, 1, 1, {
        projectRoot: tempDir,
        pluginDir: tempDir,
        isolated: false,
      });

      // Call[0] is plugin list, Call[1] is the actual claude trial
      const callArgs = mockUtils.execCommand.mock.calls[1];
      expect(callArgs[1]).toContain('--max-turns');
      const mtIdx = callArgs[1].indexOf('--max-turns');
      expect(callArgs[1][mtIdx + 1]).toBe('10');
    });

    it('should not add --max-turns when neither maxTurns nor pluginDir set', () => {
      const scenario = {
        name: 'mt-none',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      mockUtils.execCommand.mockReturnValueOnce({
        stdout: rawStream,
        stderr: '',
        exitCode: 0,
      });

      runTrial(scenario, 1, 1, { projectRoot: tempDir, isolated: false });

      const callArgs = mockUtils.execCommand.mock.calls[0];
      expect(callArgs[1]).not.toContain('--max-turns');
    });
  });

  // ── runSkillEval ──────────────────────────────────────────────

  describe('runSkillEval', () => {
    it('should be exported as a function', () => {
      expect(typeof runSkillEval).toBe('function');
    });
  });

  // ── executeAndGradeTrial — pluginDir/maxTurns forwarding ────

  describe('executeAndGradeTrial', () => {
    it('should forward pluginDir to runTrial', () => {
      const scenario = {
        name: 'egt-pd',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      // Call 1: buildPluginDirSettings() → plugin list
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '[]',
        stderr: '',
        exitCode: 0,
      });
      // Call 2: claude -p trial
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: rawStream,
        stderr: '',
        exitCode: 0,
      });
      // Call 3: code grader
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      executeAndGradeTrial(scenario, scenario, 1, 1, {
        projectRoot: tempDir,
        label: 'treatment',
        pluginDir: tempDir,
        isolated: false,
      });

      // Call[1] is the claude trial (call[0] is plugin list)
      const callArgs = mockUtils.execCommand.mock.calls[1];
      expect(callArgs[0]).toBe('claude');
      expect(callArgs[1]).toContain('--plugin-dir');
      expect(callArgs[1]).toContain(tempDir);
    });

    it('should forward maxTurns to runTrial', () => {
      const scenario = {
        name: 'egt-mt',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      // Call 1: claude -p trial
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: rawStream,
        stderr: '',
        exitCode: 0,
      });
      // Call 2: code grader
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      executeAndGradeTrial(scenario, scenario, 1, 1, {
        projectRoot: tempDir,
        label: 'treatment',
        maxTurns: 20,
        isolated: false,
      });

      const callArgs = mockUtils.execCommand.mock.calls[0];
      expect(callArgs[0]).toBe('claude');
      expect(callArgs[1]).toContain('--max-turns');
      const mtIdx = callArgs[1].indexOf('--max-turns');
      expect(callArgs[1][mtIdx + 1]).toBe('20');
    });
  });

  // ── fr-gr-001: timing and token metrics ─────────────────────

  describe('fr-gr-001 — parseStreamJsonOutput yields usage', () => {
    it('should return usage with input_tokens and output_tokens from result event', () => {
      const input = JSON.stringify({
        type: 'result',
        result: 'Done',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        duration_ms: 1234,
      });
      const { textResult, usage } = parseStreamJsonOutput(input);
      expect(textResult).toBe('Done');
      expect(usage).toEqual({ input_tokens: 100, output_tokens: 50, duration_ms: 1234 });
    });

    it('should return usage with nulls when result event has no usage', () => {
      const input = JSON.stringify({ type: 'result', result: 'Done' });
      const { usage } = parseStreamJsonOutput(input);
      expect(usage).toEqual({ input_tokens: null, output_tokens: null, duration_ms: null });
    });

    it('should return null usage fields when duration_ms is absent', () => {
      const input = JSON.stringify({
        type: 'result',
        result: 'Done',
        usage: { input_tokens: 42, output_tokens: 17 },
      });
      const { usage } = parseStreamJsonOutput(input);
      expect(usage.input_tokens).toBe(42);
      expect(usage.output_tokens).toBe(17);
      expect(usage.duration_ms).toBeNull();
    });

    it('should return null usage when no result event is present', () => {
      const input = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hello' }] },
      });
      const { usage } = parseStreamJsonOutput(input);
      expect(usage).toEqual({ input_tokens: null, output_tokens: null, duration_ms: null });
    });

    it('should preserve backwards-compatible return shape (textResult and richTranscript still present)', () => {
      const input = JSON.stringify({ type: 'result', result: 'Answer' });
      const result = parseStreamJsonOutput(input);
      expect(result).toHaveProperty('textResult');
      expect(result).toHaveProperty('richTranscript');
      expect(result).toHaveProperty('usage');
    });
  });

  describe('fr-gr-001 — runTrial includes duration_ms, input_tokens, output_tokens', () => {
    function makeStreamWithUsage({ inputTokens, outputTokens, durationMs } = {}) {
      const resultEvent = { type: 'result', result: 'Done' };
      if (inputTokens !== undefined || outputTokens !== undefined) {
        resultEvent.usage = { input_tokens: inputTokens, output_tokens: outputTokens };
      }
      if (durationMs !== undefined) resultEvent.duration_ms = durationMs;
      return [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify(resultEvent),
      ].join('\n');
    }

    it('should include duration_ms, input_tokens, output_tokens on successful trial result', () => {
      const scenario = {
        name: 'tok-test',
        scenario: 'Do it.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };
      mockUtils.execCommand
        .mockReturnValueOnce({ stdout: '[]', stderr: '', exitCode: 0 }) // plugin list
        .mockReturnValueOnce({
          stdout: makeStreamWithUsage({ inputTokens: 200, outputTokens: 80, durationMs: 5000 }),
          stderr: '',
          exitCode: 0,
        }); // claude trial

      const result = runTrial(scenario, 1, 1, { projectRoot: tempDir, isolated: true });

      expect(result).toHaveProperty('duration_ms');
      expect(result).toHaveProperty('input_tokens');
      expect(result).toHaveProperty('output_tokens');
      expect(result.input_tokens).toBe(200);
      expect(result.output_tokens).toBe(80);
      expect(typeof result.duration_ms).toBe('number');
    });

    it('should use null for token fields when result event has no usage', () => {
      const scenario = {
        name: 'tok-null',
        scenario: 'Do it.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };
      mockUtils.execCommand
        .mockReturnValueOnce({ stdout: '[]', stderr: '', exitCode: 0 })
        .mockReturnValueOnce({ stdout: makeStreamWithUsage(), stderr: '', exitCode: 0 });

      const result = runTrial(scenario, 1, 1, { projectRoot: tempDir, isolated: true });

      expect(result).toHaveProperty('input_tokens', null);
      expect(result).toHaveProperty('output_tokens', null);
      expect(result).toHaveProperty('duration_ms');
      expect(typeof result.duration_ms).toBe('number');
    });

    it('should include duration_ms, input_tokens: null, output_tokens: null on plugin-dir-missing infraError', () => {
      const scenario = {
        name: 'tok-infra',
        scenario: 'Do it.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
        pluginDir: '/does/not/exist',
      };

      const result = runTrial(scenario, 1, 1, { projectRoot: tempDir, isolated: false });

      expect(result.infraError).toBe(true);
      expect(result).toHaveProperty('duration_ms');
      expect(result).toHaveProperty('input_tokens', null);
      expect(result).toHaveProperty('output_tokens', null);
    });

    it('should include all three fields on no-output infraError', () => {
      const scenario = {
        name: 'tok-noout',
        scenario: 'Do it.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };
      // Produce a result event with no assistant messages (triggers "No assistant output captured")
      const emptyStream = JSON.stringify({
        type: 'result',
        result: '',
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      mockUtils.execCommand
        .mockReturnValueOnce({ stdout: '[]', stderr: '', exitCode: 0 })
        .mockReturnValueOnce({ stdout: emptyStream, stderr: '', exitCode: 0 });

      const result = runTrial(scenario, 1, 1, { projectRoot: tempDir, isolated: true });

      expect(result).toHaveProperty('duration_ms');
      expect(result).toHaveProperty('input_tokens');
      expect(result).toHaveProperty('output_tokens');
    });
  });

  // ── runWorkflowEval — plugin-dir ────────────────────────────

  describe('runWorkflowEval', () => {
    it('should be exported as a function', () => {
      expect(typeof runWorkflowEval).toBe('function');
    });

    it('should pass pluginDir to treatment trials when scenario has pluginDir', () => {
      const scenario = {
        name: 'wf-pd',
        scope: 'workflow',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
        pluginDir: tempDir,
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      // Each trial needs: isolation settings (1 call) + claude trial (1 call) + code grader (1 call)
      // Baseline (1 trial): buildIsolationSettings plugin list + claude + grader = 3 calls
      // Treatment (1 trial): buildPluginDirSettings plugin list + claude + grader = 3 calls
      for (let i = 0; i < 6; i++) {
        if (i % 3 === 0) {
          // plugin list call
          mockUtils.execCommand.mockReturnValueOnce({
            stdout: '[]',
            stderr: '',
            exitCode: 0,
          });
        } else if (i % 3 === 1) {
          // claude trial call
          mockUtils.execCommand.mockReturnValueOnce({
            stdout: rawStream,
            stderr: '',
            exitCode: 0,
          });
        } else {
          // code grader call
          mockUtils.execCommand.mockReturnValueOnce({
            stdout: '',
            stderr: '',
            exitCode: 0,
          });
        }
      }

      runWorkflowEval(scenario, 1, { projectRoot: tempDir });

      // Find the claude calls (not plugin list or grader) — they have 'claude' as first arg
      const claudeCalls = mockUtils.execCommand.mock.calls.filter(
        (c) => c[0] === 'claude' && c[1].includes('-p'),
      );
      // Should have 2 claude calls: 1 baseline + 1 treatment
      expect(claudeCalls.length).toBe(2);

      // Treatment call should have --plugin-dir
      const treatmentCall = claudeCalls[1];
      expect(treatmentCall[1]).toContain('--plugin-dir');
      expect(treatmentCall[1]).toContain(tempDir);

      // Baseline call should NOT have --plugin-dir
      const baselineCall = claudeCalls[0];
      expect(baselineCall[1]).not.toContain('--plugin-dir');
    });

    it('should not use --plugin-dir for treatment when scenario has no pluginDir', () => {
      const scenario = {
        name: 'wf-no-pd',
        scope: 'workflow',
        scenario: 'Test.',
        context: '',
        assertions: [],
        grader: 'code',
        graderConfig: 'true',
      };

      const rawStream = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done' }] },
        }),
        JSON.stringify({ type: 'result', result: 'Done' }),
      ].join('\n');

      // Baseline: buildIsolationSettings + claude + grader = 3
      // Treatment: claude + grader = 2 (no isolation build needed for non-isolated)
      for (let i = 0; i < 5; i++) {
        if (i === 0) {
          mockUtils.execCommand.mockReturnValueOnce({
            stdout: '[]',
            stderr: '',
            exitCode: 0,
          });
        } else if (i % 2 === 1) {
          mockUtils.execCommand.mockReturnValueOnce({
            stdout: rawStream,
            stderr: '',
            exitCode: 0,
          });
        } else {
          mockUtils.execCommand.mockReturnValueOnce({
            stdout: '',
            stderr: '',
            exitCode: 0,
          });
        }
      }

      runWorkflowEval(scenario, 1, { projectRoot: tempDir });

      const claudeCalls = mockUtils.execCommand.mock.calls.filter(
        (c) => c[0] === 'claude' && c[1].includes('-p'),
      );

      // Neither baseline nor treatment should have --plugin-dir
      for (const call of claudeCalls) {
        expect(call[1]).not.toContain('--plugin-dir');
      }
    });
  });
});
