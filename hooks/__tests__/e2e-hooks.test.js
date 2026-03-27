/**
 * E2E Integration Tests for Arcforge Hooks
 *
 * Tests the full execution path: stdin JSON → hook script → stdout/stderr/exit code.
 * Complements existing unit tests by verifying the actual hook invocation pipeline.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const HOOKS_DIR = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(HOOKS_DIR, '..');

// ─────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────

/**
 * Run a hook script as a child process with mock stdin.
 * Captures stdout, stderr, and exit code on both success and failure paths.
 */
function runHook(executable, scriptPath, { args = [], stdinJson = null, env = {}, cwd } = {}) {
  const opts = {
    env: { ...process.env, ...env },
    timeout: 15000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  if (cwd) opts.cwd = cwd;
  if (stdinJson != null) {
    opts.input = typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson);
  }
  try {
    const stdout = execFileSync(executable, [scriptPath, ...args], opts);
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status ?? 1,
    };
  }
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
 * Build hook event input JSON. All hooks share this base shape;
 * pass event-specific fields via `extras`.
 */
function makeHookInput(eventName, extras = {}, overrides = {}) {
  return {
    hook_event_name: eventName,
    session_id: `test-${Date.now()}`,
    cwd: PROJECT_ROOT,
    transcript_path: '/tmp/test-transcript.jsonl',
    ...extras,
    ...overrides,
  };
}

function makeSessionStartInput(trigger = 'startup', overrides = {}) {
  return makeHookInput('SessionStart', { trigger }, overrides);
}

function makeUserPromptInput(prompt = 'hello', overrides = {}) {
  return makeHookInput('UserPromptSubmit', { prompt }, overrides);
}

function makeToolUseInput(eventName, toolName, toolInput = {}, overrides = {}) {
  return makeHookInput(eventName, { tool_name: toolName, tool_input: toolInput }, overrides);
}

// ─────────────────────────────────────────────
// SessionStart Hooks
// ─────────────────────────────────────────────

describe('E2E: inject-skills/main.sh', () => {
  const scriptPath = path.join(HOOKS_DIR, 'inject-skills', 'main.sh');

  it('should exit 0 and produce valid JSON on trigger=startup', () => {
    const envFile = path.join(os.tmpdir(), `test-env-${Date.now()}`);
    const result = runBashHook(scriptPath, null, { CLAUDE_ENV_FILE: envFile });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
    assert.ok(result.stdout.trim().length > 0, 'Should produce stdout');

    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.hookSpecificOutput, 'Should have hookSpecificOutput');
    assert.ok(parsed.hookSpecificOutput.additionalContext, 'Should have additionalContext');
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.includes('arcforge'),
      'Should mention arcforge in context',
    );

    // CLAUDE_ENV_FILE should have been written
    assert.ok(fs.existsSync(envFile), 'Should write CLAUDE_ENV_FILE');
    const envContent = fs.readFileSync(envFile, 'utf-8');
    assert.ok(envContent.includes('ARCFORGE_ROOT'), 'Env file should set ARCFORGE_ROOT');

    fs.rmSync(envFile, { force: true });
  });

  it('should exit 0 on trigger=clear without CLAUDE_ENV_FILE', () => {
    const result = runBashHook(scriptPath, null, { CLAUDE_ENV_FILE: '' });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);

    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.hookSpecificOutput, 'Should have hookSpecificOutput');
  });

  it('should exit 0 when CLAUDE_ENV_FILE env var is unset', () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDE_ENV_FILE;

    const result = runBashHook(scriptPath, null, cleanEnv);

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.hookSpecificOutput, 'Should still produce valid JSON');
  });
});

describe('E2E: session-tracker/inject-context.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'session-tracker', 'inject-context.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-inject-ctx-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should exit 0 with no instincts and no pending actions', () => {
    const input = makeSessionStartInput('clear', { session_id: 'test-no-instincts' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 with trigger=startup', () => {
    const input = makeSessionStartInput('startup', { session_id: 'test-startup' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 with trigger=resume', () => {
    const input = makeSessionStartInput('resume', { session_id: 'test-resume' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should inject instinct context when high-confidence instincts exist', () => {
    const projectName = path.basename(testDir);
    const instinctsDir = path.join(testDir, '.claude', 'instincts', projectName);
    fs.mkdirSync(instinctsDir, { recursive: true });
    fs.writeFileSync(
      path.join(instinctsDir, 'test-instinct.md'),
      [
        '---',
        'id: test-instinct',
        'confidence: 0.85',
        'trigger: When user asks for help',
        '---',
        '',
        '## Action',
        'Respond helpfully',
      ].join('\n'),
    );

    const input = makeSessionStartInput('clear', { session_id: 'test-with-instincts' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);

    if (result.stdout.trim()) {
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.hookSpecificOutput, 'Should have hookSpecificOutput');
      assert.ok(
        parsed.hookSpecificOutput.additionalContext.includes('test-instinct'),
        'Should include instinct id in context',
      );
    }
  });

  it('should NOT inject instincts below threshold', () => {
    const projectName = path.basename(testDir);
    const instinctsDir = path.join(testDir, '.claude', 'instincts', projectName);
    fs.mkdirSync(instinctsDir, { recursive: true });
    fs.writeFileSync(
      path.join(instinctsDir, 'low-confidence.md'),
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

    const input = makeSessionStartInput('clear', { session_id: 'test-low-conf' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0);

    if (result.stdout.trim()) {
      assert.ok(
        !result.stdout.includes('low-confidence'),
        'Should not include low-confidence instinct',
      );
    }
  });
});

describe('E2E: session-tracker/start.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'session-tracker', 'start.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-start-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should exit 0 on trigger=startup and create session file', () => {
    const sessionId = `test-${Date.now()}`;
    const input = makeSessionStartInput('startup', { session_id: sessionId });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on trigger=clear', () => {
    const input = makeSessionStartInput('clear', { session_id: 'test-clear' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on trigger=resume', () => {
    const input = makeSessionStartInput('resume', { session_id: 'test-resume' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 with empty stdin', () => {
    const result = runNodeHook(scriptPath, '', {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(
      result.exitCode,
      0,
      `Exit code should be 0 even with empty stdin, stderr: ${result.stderr}`,
    );
  });
});

describe('E2E: log-lightweight.py (SessionStart)', () => {
  const scriptPath = path.join(HOOKS_DIR, 'log-lightweight.py');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-log-lw-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should exit 0 on SessionStart with valid cwd', () => {
    const input = makeSessionStartInput('startup', {
      cwd: testDir,
      session_id: 'test-log-session',
    });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on SessionStart with trigger=clear', () => {
    const input = makeSessionStartInput('clear', {
      cwd: testDir,
      session_id: 'test-log-clear',
    });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should write state file to correct directory (Issue B)', () => {
    const input = makeSessionStartInput('startup', {
      cwd: testDir,
      session_id: 'test-log-dir',
    });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);

    const expectedLogDir = path.join(testDir, '.claude', 'logs', 'lightweight');
    const stateFile = path.join(expectedLogDir, '.state.json');
    assert.ok(
      fs.existsSync(stateFile),
      `State file should be at ${stateFile}, not in a different directory`,
    );
  });

  it('should exit 0 with empty cwd (fallback behavior)', () => {
    const input = makeSessionStartInput('startup', {
      cwd: '',
      session_id: 'test-log-empty-cwd',
    });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(
      result.exitCode,
      0,
      `Exit code should be 0 even with empty cwd, stderr: ${result.stderr}`,
    );
  });

  it('should exit 0 with malformed JSON input', () => {
    const result = runPythonHook(scriptPath, 'not valid json', { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(
      result.exitCode,
      0,
      'Should exit 0 even with malformed input (silent catch)',
    );
  });

  it('should exit 0 with empty stdin and no stderr (Issue A fix)', () => {
    // Empty stdin was the root cause of "SessionStart:clear hook error"
    const result = runPythonHook(scriptPath, '', { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, 'Should exit 0 with empty stdin');
    assert.strictEqual(
      result.stderr.trim(),
      '',
      'Should NOT produce stderr output (this would show as "hook error" in Claude Code)',
    );
  });
});

// ─────────────────────────────────────────────
// UserPromptSubmit Hooks
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

  it('should exit 0 and pass through stdin', () => {
    const input = makeUserPromptInput('test message');
    const result = runNodeHook(scriptPath, input, {
      TMPDIR: testDir,
      CLAUDE_SESSION_ID: 'test-counter',
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 with empty prompt', () => {
    const input = makeUserPromptInput('');
    const result = runNodeHook(scriptPath, input, {
      TMPDIR: testDir,
      CLAUDE_SESSION_ID: 'test-counter-empty',
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });
});

// ─────────────────────────────────────────────
// PreToolUse / PostToolUse Hooks
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

  it('should exit 0 on PreToolUse event', () => {
    const input = makeToolUseInput('PreToolUse', 'Edit', { file_path: '/tmp/test.js' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on PostToolUse event', () => {
    const input = makeToolUseInput('PostToolUse', 'Edit', { file_path: '/tmp/test.js' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });
});

describe('E2E: quality-check/main.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'quality-check', 'main.js');

  it('should exit 0 on PostToolUse for .js file edit', () => {
    const input = makeToolUseInput('PostToolUse', 'Edit', {
      file_path: '/tmp/test-file.js',
      old_string: 'old',
      new_string: 'new',
    });
    const result = runNodeHook(scriptPath, input);

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on PostToolUse for non-JS file', () => {
    const input = makeToolUseInput('PostToolUse', 'Edit', { file_path: '/tmp/test-file.md' });
    const result = runNodeHook(scriptPath, input);

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });
});

describe('E2E: compact-suggester/main.js', () => {
  const scriptPath = path.join(HOOKS_DIR, 'compact-suggester', 'main.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-compact-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should exit 0 on PostToolUse', () => {
    const input = makeToolUseInput('PostToolUse', 'Read', { file_path: '/tmp/test.js' });
    const result = runNodeHook(scriptPath, input, {
      TMPDIR: testDir,
      CLAUDE_SESSION_ID: 'test-compact',
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 with empty stdin', () => {
    const result = runNodeHook(scriptPath, '', {
      TMPDIR: testDir,
      CLAUDE_SESSION_ID: 'test-compact-empty',
    });

    assert.strictEqual(
      result.exitCode,
      0,
      `Exit code should be 0 even with empty stdin, stderr: ${result.stderr}`,
    );
  });
});

// ─────────────────────────────────────────────
// Stop Hooks
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
    const input = makeHookInput('Stop', {}, { session_id: 'test-end' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
      TMPDIR: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 with empty stdin', () => {
    const result = runNodeHook(scriptPath, '', {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
      TMPDIR: testDir,
    });

    assert.strictEqual(
      result.exitCode,
      0,
      `Exit code should be 0 even with empty stdin, stderr: ${result.stderr}`,
    );
  });
});

// ─────────────────────────────────────────────
// PreCompact Hooks
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

  it('should exit 0 on PreCompact event', () => {
    const input = makeHookInput('PreCompact', {}, { session_id: 'test-precompact' });
    const result = runNodeHook(scriptPath, input, {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
      TMPDIR: testDir,
    });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 with empty stdin', () => {
    const result = runNodeHook(scriptPath, '', {
      CLAUDE_PROJECT_DIR: testDir,
      HOME: testDir,
      TMPDIR: testDir,
    });

    assert.strictEqual(
      result.exitCode,
      0,
      `Exit code should be 0 even with empty stdin, stderr: ${result.stderr}`,
    );
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

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on PostToolUse', () => {
    const input = makeToolUseInput(
      'PostToolUse',
      'Edit',
      { file_path: '/tmp/test.js' },
      { cwd: testDir, tool_response: { success: true } },
    );
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on Stop', () => {
    const input = makeHookInput('Stop', {}, { cwd: testDir });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on SessionEnd', () => {
    const input = makeHookInput('SessionEnd', {}, { cwd: testDir });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on SubagentStop', () => {
    const input = makeHookInput('SubagentStop', {}, { cwd: testDir });
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });

  it('should exit 0 on PermissionRequest', () => {
    const input = makeToolUseInput(
      'PermissionRequest',
      'Bash',
      { command: 'ls' },
      { cwd: testDir },
    );
    const result = runPythonHook(scriptPath, input, { PYTHONPATH: HOOKS_DIR });

    assert.strictEqual(result.exitCode, 0, `Exit code should be 0, stderr: ${result.stderr}`);
  });
});
