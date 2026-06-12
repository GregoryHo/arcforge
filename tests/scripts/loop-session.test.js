const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildClaudeArgs,
  buildSpawnEnv,
  appendStallGuidance,
  spawnSession,
  spawnSessionAsync,
  PERMISSION_STALL_GUIDANCE,
} = require('../../scripts/lib/loop-session');

describe('buildClaudeArgs', () => {
  it('returns the headless base args by default', () => {
    expect(buildClaudeArgs()).toEqual([
      '-p',
      '--output-format',
      'json',
      '--no-session-persistence',
    ]);
  });

  it('passes --permission-mode through with its value', () => {
    const args = buildClaudeArgs({ permissionMode: 'acceptEdits' });
    const idx = args.indexOf('--permission-mode');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('acceptEdits');
  });

  it('passes --allowed-tools through with its value', () => {
    const args = buildClaudeArgs({ allowedTools: 'Bash,Read' });
    const idx = args.indexOf('--allowed-tools');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('Bash,Read');
  });

  it('never auto-appends --dangerously-skip-permissions on any path', () => {
    const variants = [
      {},
      { permissionMode: 'default' },
      { allowedTools: 'Bash' },
      { permissionMode: 'acceptEdits', allowedTools: 'Bash,Read' },
    ];
    for (const options of variants) {
      expect(buildClaudeArgs(options)).not.toContain('--dangerously-skip-permissions');
    }
  });
});

describe('buildSpawnEnv', () => {
  let savedMode;
  let savedSpawned;

  beforeEach(() => {
    savedMode = process.env.ARCFORGE_MODE;
    savedSpawned = process.env.ARCFORGE_SPAWNED;
  });

  afterEach(() => {
    if (savedMode === undefined) delete process.env.ARCFORGE_MODE;
    else process.env.ARCFORGE_MODE = savedMode;
    if (savedSpawned === undefined) delete process.env.ARCFORGE_SPAWNED;
    else process.env.ARCFORGE_SPAWNED = savedSpawned;
  });

  it('clears an inherited ARCFORGE_MODE=attended so loop sessions are never attended', () => {
    process.env.ARCFORGE_MODE = 'attended';
    const env = buildSpawnEnv();
    expect(env.ARCFORGE_MODE).not.toBe('attended');
  });

  it('sets the ARCFORGE_SPAWNED loop marker', () => {
    delete process.env.ARCFORGE_SPAWNED;
    const env = buildSpawnEnv();
    expect(env.ARCFORGE_SPAWNED).toBe('loop');
  });
});

describe('appendStallGuidance', () => {
  it('leaves successful results untouched', () => {
    const result = { exitCode: 0, stdout: 'ok', stderr: '' };
    expect(appendStallGuidance(result).stderr).toBe('');
  });

  it('appends headless guidance when the session was killed by timeout', () => {
    const error = Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' });
    const result = { exitCode: 1, stdout: '', stderr: '', error };
    expect(appendStallGuidance(result).stderr).toContain(PERMISSION_STALL_GUIDANCE);
  });

  it('appends headless guidance when stderr mentions permissions', () => {
    const result = { exitCode: 1, stdout: '', stderr: 'Permission to use Bash denied' };
    expect(appendStallGuidance(result).stderr).toContain(PERMISSION_STALL_GUIDANCE);
  });

  it('leaves unrelated failures untouched', () => {
    const result = { exitCode: 1, stdout: '', stderr: 'syntax error' };
    expect(appendStallGuidance(result).stderr).toBe('syntax error');
  });
});

describe('spawn env hygiene (stub claude)', () => {
  let binDir;
  let savedPath;
  let savedMode;
  let savedSpawned;

  /** Write an executable `claude` stub into binDir. */
  function writeStub(body) {
    const stubPath = path.join(binDir, 'claude');
    fs.writeFileSync(stubPath, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }

  beforeEach(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-session-stub-'));
    savedPath = process.env.PATH;
    savedMode = process.env.ARCFORGE_MODE;
    savedSpawned = process.env.ARCFORGE_SPAWNED;
    process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
    process.env.ARCFORGE_MODE = 'attended';
    delete process.env.ARCFORGE_SPAWNED;
  });

  afterEach(() => {
    process.env.PATH = savedPath;
    if (savedMode === undefined) delete process.env.ARCFORGE_MODE;
    else process.env.ARCFORGE_MODE = savedMode;
    if (savedSpawned === undefined) delete process.env.ARCFORGE_SPAWNED;
    else process.env.ARCFORGE_SPAWNED = savedSpawned;
    fs.rmSync(binDir, { recursive: true, force: true });
  });

  const ENV_ECHO_STUB =
    'cat > /dev/null\n' +
    'printf \'{"total_cost_usd":0.01,"result":"MODE=%s SPAWNED=%s"}\' "$ARCFORGE_MODE" "$ARCFORGE_SPAWNED"';

  it('spawnSession child env never carries ARCFORGE_MODE=attended and has the spawn marker', () => {
    writeStub(ENV_ECHO_STUB);
    const result = spawnSession('test prompt', binDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('MODE=attended');
    expect(result.stdout).toContain('SPAWNED=loop');
  });

  it('spawnSessionAsync child env never carries ARCFORGE_MODE=attended and has the spawn marker', async () => {
    writeStub(ENV_ECHO_STUB);
    const result = await spawnSessionAsync('test prompt', binDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('MODE=attended');
    expect(result.stdout).toContain('SPAWNED=loop');
  });

  it('kills the session at taskTimeoutMs and appends headless guidance', () => {
    writeStub('sleep 5');
    const result = spawnSession('test prompt', binDir, { taskTimeoutMs: 250 });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(PERMISSION_STALL_GUIDANCE);
  });
});
