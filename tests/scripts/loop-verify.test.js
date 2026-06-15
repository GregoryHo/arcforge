/**
 * loop-verify.test.js — AF-8 deterministic acceptance floor primitives.
 *
 * parseVerifyCommand is the "proper argv carrier" replacing split(' '): it
 * tokenizes quote-aware and REJECTS shell features (security.md). runVerify
 * runs an argv array via execFileSync (no shell) and reports — never throws —
 * a non-zero exit. recordVerifyResult persists per-run results for AF-9.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseVerifyCommand,
  runVerify,
  recordVerifyResult,
} = require('../../scripts/lib/loop-verify');

describe('parseVerifyCommand (argv carrier)', () => {
  it('tokenizes a simple command into an argv array', () => {
    expect(parseVerifyCommand('npm test')).toEqual(['npm', 'test']);
  });

  it('collapses repeated whitespace between tokens', () => {
    expect(parseVerifyCommand('  npm   run   lint  ')).toEqual(['npm', 'run', 'lint']);
  });

  it('keeps a double-quoted argument as one token', () => {
    expect(parseVerifyCommand('npm test -- --grep "a b c"')).toEqual([
      'npm',
      'test',
      '--',
      '--grep',
      'a b c',
    ]);
  });

  it('keeps a single-quoted argument as one token', () => {
    expect(parseVerifyCommand("pytest -k 'slow and io'")).toEqual(['pytest', '-k', 'slow and io']);
  });

  it('supports an empty quoted token', () => {
    expect(parseVerifyCommand('echo ""')).toEqual(['echo', '']);
  });

  // security.md STOP: shell features must be rejected, never interpolated.
  it.each([
    ['pipe', 'npm test | grep ok'],
    ['and-chain', 'npm test && npm run lint'],
    ['semicolon', 'npm test; echo done'],
    ['redirect-out', 'npm test > out.txt'],
    ['redirect-in', 'cat < in.txt'],
    ['backtick', 'echo `whoami`'],
    ['command-sub', 'echo $(whoami)'],
    // '$' + '{HOME}' kept split so the literal isn't read as a JS template placeholder.
    ['var-expand', `echo $${'{HOME}'}`],
  ])('rejects shell feature: %s', (_label, cmd) => {
    expect(() => parseVerifyCommand(cmd)).toThrow(/shell features/);
  });

  it('rejects an empty or whitespace-only command', () => {
    expect(() => parseVerifyCommand('')).toThrow(/non-empty/);
    expect(() => parseVerifyCommand('   ')).toThrow(/non-empty/);
  });

  it('rejects a non-string command', () => {
    expect(() => parseVerifyCommand(null)).toThrow(/non-empty/);
    expect(() => parseVerifyCommand(['npm', 'test'])).toThrow(/non-empty/);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseVerifyCommand('npm test "unterminated')).toThrow(/unterminated/);
  });
});

describe('runVerify (argv array, no shell)', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-verify-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('runs the argv array and returns exit 0 on success', () => {
    const result = runVerify(['node', '-e', 'process.exit(0)'], tmp);
    expect(result.exitCode).toBe(0);
    expect(result.command).toEqual(['node', '-e', 'process.exit(0)']);
  });

  it('returns the non-zero exit code on failure (never throws)', () => {
    const result = runVerify(['node', '-e', 'process.exit(3)'], tmp);
    expect(result.exitCode).toBe(3);
  });

  it('runs in the supplied cwd', () => {
    const result = runVerify(['node', '-e', 'process.stdout.write(process.cwd())'], tmp);
    expect(result.exitCode).toBe(0);
    // realpath: macOS /tmp is a symlink to /private/tmp.
    expect(fs.realpathSync(result.stdout.trim())).toBe(fs.realpathSync(tmp));
  });

  it('does NOT interpret shell metacharacters in arguments', () => {
    // If this were run through a shell, `;` would terminate and `echo pwned`
    // would run. As an argv array it is just a literal argument to node -e,
    // which prints it back verbatim.
    const result = runVerify(['node', '-e', 'process.stdout.write("a; echo b")'], tmp);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('a; echo b');
  });

  it('reports a missing binary as a non-zero exit, not a throw', () => {
    const result = runVerify(['this-binary-does-not-exist-af8'], tmp);
    expect(result.exitCode).not.toBe(0);
  });

  it('throws on an empty argv (programmer error)', () => {
    expect(() => runVerify([], tmp)).toThrow(/non-empty argv/);
  });
});

describe('recordVerifyResult (AF-9 persistence)', () => {
  it('appends a structured entry stamped with iteration and run_id', () => {
    const state = { iteration: 4, run_id: 'run-xyz' };
    const entry = recordVerifyResult(state, 'epic-a', {
      command: ['npm', 'test'],
      exitCode: 0,
      stdout: 'all good',
      stderr: '',
    });
    expect(state.verify_results).toHaveLength(1);
    expect(entry).toMatchObject({
      task_id: 'epic-a',
      iteration: 4,
      command: ['npm', 'test'],
      exit_code: 0,
      passed: true,
      run_id: 'run-xyz',
    });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('marks passed:false and captures output on a non-zero exit', () => {
    const state = { iteration: 1 };
    const entry = recordVerifyResult(state, 'epic-b', {
      command: ['npm', 'test'],
      exitCode: 1,
      stdout: 'out',
      stderr: 'boom',
    });
    expect(entry.passed).toBe(false);
    expect(entry.exit_code).toBe(1);
    expect(entry.output).toContain('boom');
  });

  it('appends across calls (accumulates for AF-9)', () => {
    const state = { iteration: 1 };
    recordVerifyResult(state, 'a', { command: ['x'], exitCode: 0, stdout: '', stderr: '' });
    recordVerifyResult(state, 'b', { command: ['y'], exitCode: 1, stdout: '', stderr: '' });
    expect(state.verify_results.map((r) => r.task_id)).toEqual(['a', 'b']);
  });

  it('strips control characters from captured output', () => {
    const state = { iteration: 1 };
    const entry = recordVerifyResult(state, 'a', {
      command: ['x'],
      exitCode: 1,
      stdout: 'clean\x00\x07dirty',
      stderr: '',
    });
    expect(entry.output).toBe('cleandirty');
  });

  it('omits run_id when state has none (legacy state)', () => {
    const state = { iteration: 1 };
    const entry = recordVerifyResult(state, 'a', {
      command: ['x'],
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    expect(entry.run_id).toBeUndefined();
  });
});
