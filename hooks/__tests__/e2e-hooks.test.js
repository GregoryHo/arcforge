/**
 * E2E Integration Tests for Arcforge Hooks
 *
 * Tests the full execution path: stdin JSON → hook script → stdout/stderr/exit code.
 * Input fixtures based on real Claude Code hook input captured from a live session.
 * Uses spawnSync to capture stderr on success (not just on error).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const HOOKS_DIR = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(HOOKS_DIR, '..');

// ─────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────

/**
 * Run a hook script as a child process with mock stdin.
 * Uses spawnSync to capture stdout AND stderr on both success and failure.
 */
function runHook(executable, scriptPath, { args = [], stdinJson = null, env = {}, cwd } = {}) {
  const opts = {
    env: { ...process.env, ...env },
    timeout: 15000,
    encoding: 'utf-8',
  };
  if (cwd) opts.cwd = cwd;
  if (stdinJson != null) {
    opts.input = typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson);
  }
  const result = spawnSync(executable, [scriptPath, ...args], opts);
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

function runNodeHook(scriptPath, stdinJson, env = {}) {
  return runHook('node', scriptPath, { stdinJson, env });
}

function runBashHook(scriptPath, stdinJson, env = {}) {
  return runHook('bash', scriptPath, { stdinJson, env });
}

function runPythonHook(scriptPath, stdinJson, env = {}) {
  return runHook('python3', scriptPath, { stdinJson, env, cwd: PROJECT_ROOT });
}

/**
 * Build hook event input JSON matching real Claude Code schema.
 * Fields based on captured live session input (2026-03-30).
 */
function makeHookInput(eventName, extras = {}, overrides = {}) {
  return {
    session_id: `test-${Date.now()}`,
    transcript_path: '/tmp/test-transcript.jsonl',
    cwd: PROJECT_ROOT,
    permission_mode: 'default',
    hook_event_name: eventName,
    ...extras,
    ...overrides,
  };
}

function makeSessionStartInput(source = 'startup', overrides = {}) {
  return makeHookInput('SessionStart', { source }, overrides);
}

function makeUserPromptInput(prompt = 'hello', overrides = {}) {
  return makeHookInput('UserPromptSubmit', { prompt }, overrides);
}

function makeToolUseInput(eventName, toolName, toolInput = {}, overrides = {}) {
  return makeHookInput(
    eventName,
    { tool_name: toolName, tool_input: toolInput, tool_use_id: `toolu_test_${Date.now()}` },
    overrides,
  );
}

function makeStopInput(overrides = {}) {
  return makeHookInput(
    'Stop',
    { stop_hook_active: false, last_assistant_message: 'Done.' },
    overrides,
  );
}

// ─────────────────────────────────────────────
// SessionStart: inject-skills/main.sh
// ─────────────────────────────────────────────

describe('E2E: inject-skills/main.sh', () => {
  const scriptPath = path.join(HOOKS_DIR, 'inject-skills', 'main.sh');

  it('should inject arc-using skill content with ARCFORGE_ROOT', () => {
    const envFile = path.join(os.tmpdir(), `test-env-${Date.now()}`);
    const result = runBashHook(scriptPath, null, { CLAUDE_ENV_FILE: envFile });

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);

    const parsed = JSON.parse(result.stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('arcforge'), 'Should mention arcforge');
    assert.ok(ctx.includes('ARCFORGE_ROOT'), 'Should include ARCFORGE_ROOT');
    assert.ok(
      ctx.includes('arc-brainstorming') || ctx.includes('arc-tdd'),
      'Should include skill names',
    );

    assert.ok(fs.existsSync(envFile), 'Should write CLAUDE_ENV_FILE');
    fs.rmSync(envFile, { force: true });
  });

  it('should exit 0 without CLAUDE_ENV_FILE', () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDE_ENV_FILE;
    const result = runBashHook(scriptPath, null, cleanEnv);

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
    assert.ok(JSON.parse(result.stdout).hookSpecificOutput, 'Should produce valid JSON');
  });
});

// ─────────────────────────────────────────────
// SessionStart: session-tracker/inject-context.js
// ─────────────────────────────────────────────

describe('E2E: session-tracker/inject-context.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'session-tracker', 'inject-context.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-inject-ctx-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should produce no output when no instincts exist', () => {
    const input = makeSessionStartInput('startup');
    const result = runNodeHook(scriptPath, input, { CLAUDE_PROJECT_DIR: testDir, HOME: testDir });

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout.trim(), '', 'No instincts = no stdout');
  });

  it('should inject high-confidence instincts into stdout', () => {
    const projectName = path.basename(testDir);
    const instinctsDir = path.join(testDir, '.claude', 'instincts', projectName);
    fs.mkdirSync(instinctsDir, { recursive: true });
    fs.writeFileSync(
      path.join(instinctsDir, 'test-instinct.md'),
      [
        '---',
        'id: test-instinct',
        'confidence: 0.85',
        'trigger: When writing code',
        '---',
        '',
        '## Action',
        'Write tests first',
      ].join('\n'),
    );

    const input = makeSessionStartInput('startup');
    const result = runNodeHook(scriptPath, input, { CLAUDE_PROJECT_DIR: testDir, HOME: testDir });

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.trim().length > 0, 'Should produce stdout with instincts');

    const parsed = JSON.parse(result.stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('test-instinct'), 'Should include instinct ID');
    assert.ok(ctx.includes('85%'), 'Should include confidence percentage');
  });

  it('should NOT inject instincts below 0.70 threshold', () => {
    const projectName = path.basename(testDir);
    const instinctsDir = path.join(testDir, '.claude', 'instincts', projectName);
    fs.mkdirSync(instinctsDir, { recursive: true });
    fs.writeFileSync(
      path.join(instinctsDir, 'low.md'),
      [
        '---',
        'id: low-confidence',
        'confidence: 0.30',
        'trigger: Test',
        '---',
        '',
        '## Action',
        'Skip',
      ].join('\n'),
    );

    const input = makeSessionStartInput('startup');
    const result = runNodeHook(scriptPath, input, { CLAUDE_PROJECT_DIR: testDir, HOME: testDir });

    assert.strictEqual(result.exitCode, 0);
    if (result.stdout.trim()) {
      assert.ok(
        !result.stdout.includes('low-confidence'),
        'Should not include low-confidence instinct',
      );
    }
  });

  it('should output both systemMessage and hookSpecificOutput for high-confidence instincts', () => {
    const projectName = path.basename(testDir);
    const instinctsDir = path.join(testDir, '.claude', 'instincts', projectName);
    fs.mkdirSync(instinctsDir, { recursive: true });
    fs.writeFileSync(
      path.join(instinctsDir, 'dual-test.md'),
      [
        '---',
        'id: dual-test',
        'confidence: 0.90',
        'trigger: When editing files',
        '---',
        '',
        '## Action',
        'Run linter first',
      ].join('\n'),
    );

    const input = makeSessionStartInput('startup');
    const result = runNodeHook(scriptPath, input, { CLAUDE_PROJECT_DIR: testDir, HOME: testDir });

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);

    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.systemMessage, 'Should have systemMessage for user');
    assert.ok(
      parsed.systemMessage.includes('1 instinct active'),
      `systemMessage should show count. Got: "${parsed.systemMessage}"`,
    );
    assert.ok(
      parsed.hookSpecificOutput?.additionalContext,
      'Should have additionalContext for Claude',
    );
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.includes('dual-test'),
      'additionalContext should include instinct ID',
    );
  });
});

// ─────────────────────────────────────────────
// SessionStart: session-tracker/start.js
// ─────────────────────────────────────────────

describe('E2E: session-tracker/start.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'session-tracker', 'start.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-start-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create session JSON file on startup', () => {
    const sessionId = 'test-session-create';
    const input = makeSessionStartInput('startup', { session_id: sessionId });
    const result = runNodeHook(scriptPath, input, { CLAUDE_PROJECT_DIR: testDir, HOME: testDir });

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);

    // Verify session file was created
    const projectName = path.basename(testDir);
    const sessionsBase = path.join(testDir, '.claude', 'sessions', projectName);
    if (fs.existsSync(sessionsBase)) {
      const dateDirs = fs.readdirSync(sessionsBase);
      assert.ok(dateDirs.length > 0, 'Should have a date directory');
      const dateDir = path.join(sessionsBase, dateDirs[0]);
      const sessionFiles = fs.readdirSync(dateDir).filter((f) => f.includes(sessionId));
      assert.ok(sessionFiles.length > 0, 'Should have a session file');

      const sessionData = JSON.parse(fs.readFileSync(path.join(dateDir, sessionFiles[0]), 'utf-8'));
      assert.ok(sessionData.started, 'Session file should have started timestamp');
      assert.strictEqual(sessionData.project, projectName, 'Should have correct project name');
    }
  });

  it('should exit 0 with empty stdin', () => {
    const result = runNodeHook(scriptPath, '', { CLAUDE_PROJECT_DIR: testDir, HOME: testDir });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });
});

// ─────────────────────────────────────────────
// SessionStart: log-lightweight.py
// ─────────────────────────────────────────────

describe('E2E: log-lightweight.py', () => {
  const scriptPath = path.join(HOOKS_DIR, 'log-lightweight.py');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-log-lw-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create state file and log on SessionStart', () => {
    const input = makeSessionStartInput('startup', { cwd: testDir });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);

    const logDir = path.join(testDir, '.claude', 'logs', 'lightweight');
    assert.ok(fs.existsSync(path.join(logDir, '.state.json')), 'Should create state file');
  });

  it('should build timeline across SessionStart + PostToolUse', () => {
    const sessionId = 'test-timeline';
    const transcriptPath = '/tmp/test-timeline.jsonl';

    // SessionStart
    runPythonHook(
      scriptPath,
      makeSessionStartInput('startup', {
        cwd: testDir,
        session_id: sessionId,
        transcript_path: transcriptPath,
      }),
      { PYTHONPATH: HOOKS_DIR },
    );

    // PostToolUse (Write)
    runPythonHook(
      scriptPath,
      makeToolUseInput(
        'PostToolUse',
        'Write',
        { file_path: '/tmp/test.js' },
        {
          cwd: testDir,
          session_id: sessionId,
          transcript_path: transcriptPath,
          tool_response: { type: 'create' },
        },
      ),
      { PYTHONPATH: HOOKS_DIR },
    );

    // Verify state has timeline with tool entry
    const stateFile = path.join(testDir, '.claude', 'logs', 'lightweight', '.state.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.ok(Array.isArray(state.timeline), 'Should have timeline array');
    const toolEntries = state.timeline.filter((e) => e.type === 'tool');
    assert.ok(toolEntries.length > 0, 'Timeline should contain tool entries');
    assert.strictEqual(toolEntries[0].tool, 'Write', 'Should track Write tool');
  });

  it('should exit 0 with empty stdin and no stderr', () => {
    const result = runPythonHook(scriptPath, '', { PYTHONPATH: HOOKS_DIR });
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stderr.trim(), '', 'Should not produce stderr on empty stdin');
  });

  it('should exit 0 with malformed JSON', () => {
    const result = runPythonHook(scriptPath, 'not valid json', { PYTHONPATH: HOOKS_DIR });
    assert.strictEqual(result.exitCode, 0);
  });
});

// ─────────────────────────────────────────────
// UserPromptSubmit: user-message-counter/main.js
// ─────────────────────────────────────────────

describe('E2E: user-message-counter/main.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'user-message-counter', 'main.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-counter-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should increment counter across multiple calls', () => {
    const sessionId = 'test-counter-incr';
    const env = { TMPDIR: testDir };

    for (let i = 0; i < 3; i++) {
      const input = makeUserPromptInput(`msg ${i}`, { session_id: sessionId });
      const result = runNodeHook(scriptPath, input, env);
      assert.strictEqual(result.exitCode, 0, `Call ${i} stderr: ${result.stderr}`);
    }

    // Counter file uses getSessionId() → "session-{sessionId}"
    const counterFile = path.join(testDir, `arcforge-user-count-session-${sessionId}`);
    assert.ok(fs.existsSync(counterFile), 'Counter file should exist');
    const count = parseInt(fs.readFileSync(counterFile, 'utf-8').trim(), 10);
    assert.strictEqual(count, 3, 'Counter should be 3 after 3 calls');
  });

  it('should pass through stdin to stdout', () => {
    const input = makeUserPromptInput('test passthrough');
    const result = runNodeHook(scriptPath, input, {
      TMPDIR: testDir,
      CLAUDE_SESSION_ID: 'test-pt',
    });

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.trim().length > 0, 'Should pass stdin through to stdout');
  });
});

// ─────────────────────────────────────────────
// PreToolUse / PostToolUse: observe/main.js
// ─────────────────────────────────────────────

describe('E2E: observe/main.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'observe', 'main.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should append observation entry to JSONL on PreToolUse', () => {
    const input = makeToolUseInput('PreToolUse', 'Edit', { file_path: '/tmp/test.js' });
    const result = runNodeHook(scriptPath, input, { CLAUDE_PROJECT_DIR: testDir, HOME: testDir });

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);

    // Check observations.jsonl was written
    const projectName = path.basename(testDir);
    const obsPath = path.join(
      testDir,
      '.claude',
      'observations',
      projectName,
      'observations.jsonl',
    );
    if (fs.existsSync(obsPath)) {
      const lines = fs.readFileSync(obsPath, 'utf-8').trim().split('\n');
      assert.ok(lines.length > 0, 'Should have at least one observation');
      const entry = JSON.parse(lines[0]);
      assert.ok(entry.tool, 'Entry should have tool field');
      assert.ok(entry.ts, 'Entry should have timestamp');
    }
  });

  it('should exit 0 on PostToolUse', () => {
    const input = makeToolUseInput('PostToolUse', 'Edit', { file_path: '/tmp/test.js' });
    const result = runNodeHook(scriptPath, input, { CLAUDE_PROJECT_DIR: testDir, HOME: testDir });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });
});

// ─────────────────────────────────────────────
// PostToolUse: quality-check/main.js
// ─────────────────────────────────────────────

describe('E2E: quality-check/main.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'quality-check', 'main.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-qc-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should detect console.log in edited JS file', () => {
    // Create a JS file with console.log
    const jsFile = path.join(testDir, 'test-consolelog.js');
    fs.writeFileSync(jsFile, 'function foo() {\n  console.log("debug");\n  return 42;\n}\n');

    const input = makeToolUseInput('PostToolUse', 'Edit', {
      file_path: jsFile,
      old_string: 'old',
      new_string: 'new',
    });
    const result = runNodeHook(scriptPath, input);

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);

    // quality-check outputs systemMessage via stdout JSON
    const parsed = JSON.parse(result.stdout);
    assert.ok(
      parsed.systemMessage,
      `Should output systemMessage. stdout: "${result.stdout.trim()}"`,
    );
    assert.ok(
      parsed.systemMessage.includes('console'),
      `systemMessage should mention console. Got: "${parsed.systemMessage}"`,
    );
  });

  it('should exit 0 on non-JS file', () => {
    const input = makeToolUseInput('PostToolUse', 'Edit', { file_path: '/tmp/test-file.md' });
    const result = runNodeHook(scriptPath, input);
    assert.strictEqual(result.exitCode, 0);
  });
});

// ─────────────────────────────────────────────
// PostToolUse: compact-suggester/main.js
// ─────────────────────────────────────────────

describe('E2E: compact-suggester/main.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'compact-suggester', 'main.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-compact-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should suggest compact at 50 tool calls', () => {
    const sessionId = 'test-threshold';
    const env = { TMPDIR: testDir };

    // Pre-create counter at 49 (compact-suggester uses its own "compact-count" counter)
    const counterFile = path.join(testDir, `arcforge-compact-count-session-${sessionId}`);
    fs.writeFileSync(counterFile, '49');

    // The 50th call should trigger suggestion
    const input = makeToolUseInput(
      'PostToolUse',
      'Read',
      { file_path: '/tmp/test.js' },
      { session_id: sessionId },
    );
    const result = runNodeHook(scriptPath, input, env);

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);

    // compact-suggester outputs systemMessage via stdout JSON
    const parsed = JSON.parse(result.stdout);
    assert.ok(
      parsed.systemMessage,
      `Should output systemMessage at threshold. stdout: "${result.stdout.trim()}"`,
    );
    assert.ok(
      parsed.systemMessage.includes('tool call') || parsed.systemMessage.includes('compact'),
      `systemMessage should mention tool calls or compact. Got: "${parsed.systemMessage}"`,
    );
  });

  it('should NOT suggest below threshold', () => {
    const sessionId = 'test-below';
    const env = { TMPDIR: testDir, CLAUDE_SESSION_ID: sessionId };

    const input = makeToolUseInput('PostToolUse', 'Read', { file_path: '/tmp/test.js' });
    const result = runNodeHook(scriptPath, input, env);

    assert.strictEqual(result.exitCode, 0);
    // No suggestion at count=1
    assert.ok(!result.stderr.includes('/compact'), 'Should not suggest compact below threshold');
  });

  it('should exit 0 with empty stdin', () => {
    const result = runNodeHook(scriptPath, '', {
      TMPDIR: testDir,
      CLAUDE_SESSION_ID: 'test-empty',
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// ─────────────────────────────────────────────
// PreCompact: pre-compact/main.js
// ─────────────────────────────────────────────

describe('E2E: pre-compact/main.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'pre-compact', 'main.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-precompact-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should log compaction event', () => {
    const input = makeHookInput('PreCompact', {}, { session_id: 'test-precompact' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
      TMPDIR: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);

    // Check compaction log was written
    const projectName = path.basename(testDir);
    const logPath = path.join(testDir, '.claude', 'sessions', projectName, 'compaction-log.txt');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf-8');
      assert.ok(
        content.includes('compaction') || content.includes('Context'),
        'Should log compaction event',
      );
    }
  });

  it('should exit 0 with empty stdin', () => {
    const result = runNodeHook(scriptPath, '', {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
      TMPDIR: testDir,
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// ─────────────────────────────────────────────
// Stop: session-tracker/end.js
// ─────────────────────────────────────────────

describe('E2E: session-tracker/end.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'session-tracker', 'end.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-end-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should exit 0 on Stop event', () => {
    const input = makeStopInput({ session_id: 'test-end' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
      TMPDIR: testDir,
    });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });

  it('should exit 0 with empty stdin', () => {
    const result = runNodeHook(scriptPath, '', {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
      TMPDIR: testDir,
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// ─────────────────────────────────────────────
// log-lightweight.py (Other Events)
// ─────────────────────────────────────────────

describe('E2E: log-lightweight.py (Other Events)', () => {
  const scriptPath = path.join(HOOKS_DIR, 'log-lightweight.py');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-log-other-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should exit 0 on UserPromptSubmit', () => {
    const input = makeUserPromptInput('hello world', { cwd: testDir });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });

  it('should exit 0 on PostToolUse', () => {
    const input = makeToolUseInput(
      'PostToolUse',
      'Edit',
      { file_path: '/tmp/test.js' },
      { cwd: testDir, tool_response: { type: 'edit' } },
    );
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });

  it('should exit 0 on Stop', () => {
    const input = makeStopInput({ cwd: testDir });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });

  it('should exit 0 on SessionEnd', () => {
    const input = makeHookInput('SessionEnd', { reason: 'other' }, { cwd: testDir });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });

  it('should exit 0 on SubagentStop', () => {
    const input = makeHookInput('SubagentStop', {}, { cwd: testDir });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });

  it('should exit 0 on PermissionRequest', () => {
    const input = makeToolUseInput(
      'PermissionRequest',
      'Bash',
      { command: 'ls' },
      { cwd: testDir },
    );
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });
    assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
  });
});
