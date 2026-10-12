/**
 * eval-trial-environment.test.js - The environment a trial runs in (B-7).
 *
 * Nothing here is mocked: the lookups run in a real shell under the environment
 * the helper built, against a stand-in operator PATH. No `claude` is spawned.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  SYSTEM_PATH,
  resolveOnPath,
  ensureToolShims,
  trialEnv,
} = require('../../scripts/lib/eval-trial-environment');

/** Where `name` resolves in a shell running under `env`; '' when nowhere. */
function which(name, env) {
  try {
    return execFileSync('/bin/sh', ['-c', `command -v ${name}`], { env, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function writeExecutable(file, body = '#!/bin/sh\necho stand-in\n') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode: 0o755 });
  return file;
}

describe('a contained trial does not inherit the operator environment', () => {
  let root;
  let projectRoot;
  let trialDir;
  let operatorBin;
  let parentEnv;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'test-trial-env-')));
    projectRoot = path.join(root, 'project');
    trialDir = path.join(projectRoot, '.eval-trials', 'scn-t1-abc');
    fs.mkdirSync(trialDir, { recursive: true });
    // The operator's own tool directory: `claude` shares it with tools the
    // trial must not see, the way ~/.local/bin holds both claude and uv.
    operatorBin = path.join(root, 'operator', 'bin');
    writeExecutable(path.join(operatorBin, 'claude'));
    writeExecutable(path.join(operatorBin, 'arcforge'));
    writeExecutable(path.join(operatorBin, 'uv'));
    parentEnv = {
      PATH: [operatorBin, ...SYSTEM_PATH].join(':'),
      HOME: path.join(root, 'home'),
      USER: 'operator',
      LANG: 'en_US.UTF-8',
      LC_CTYPE: 'UTF-8',
      TMPDIR: os.tmpdir(),
      ANTHROPIC_API_KEY: 'key-for-auth',
      ANTHROPIC_MODEL: 'operator-picked-model',
      CLAUDECODE: '1',
      EDITOR: 'vim',
      SOME_SERVICE_TOKEN: 'operator-secret',
    };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const build = (opts = {}) => trialEnv(trialDir, {}, { projectRoot, parentEnv, ...opts });

  it('resolves no arcforge and no uv, though both are on the operator PATH', () => {
    expect(which('arcforge', parentEnv)).toBe(path.join(operatorBin, 'arcforge'));
    const env = build();
    expect(which('arcforge', env)).toBe('');
    expect(which('uv', env)).toBe('');
  });

  it('still resolves claude and node, through the shim directory', () => {
    const env = build();
    const binDir = path.join(projectRoot, '.eval-trials', '.bin');
    expect(which('claude', env)).toBe(path.join(binDir, 'claude'));
    expect(which('node', env)).toBe(path.join(binDir, 'node'));
    expect(fs.readlinkSync(path.join(binDir, 'claude'))).toBe(path.join(operatorBin, 'claude'));
    expect(fs.realpathSync(path.join(binDir, 'node'))).toBe(fs.realpathSync(process.execPath));
    // The shim runs: the trial's node is the parent's node.
    const version = execFileSync('node', ['--version'], { env, encoding: 'utf8' }).trim();
    expect(version).toBe(process.version);
  });

  it('builds PATH from the shim directory and the system directories only', () => {
    const entries = build().PATH.split(':');
    expect(entries).toEqual([path.join(projectRoot, '.eval-trials', '.bin'), ...SYSTEM_PATH]);
    expect(entries).not.toContain(operatorBin);
  });

  it('forwards identity, locale and auth, and drops everything else', () => {
    const env = build();
    expect(env).toMatchObject({
      HOME: parentEnv.HOME,
      USER: 'operator',
      LANG: 'en_US.UTF-8',
      LC_CTYPE: 'UTF-8',
      TMPDIR: parentEnv.TMPDIR,
      ANTHROPIC_API_KEY: 'key-for-auth',
    });
    for (const dropped of ['ANTHROPIC_MODEL', 'CLAUDECODE', 'EDITOR', 'SOME_SERVICE_TOKEN']) {
      expect(env).not.toHaveProperty(dropped);
    }
  });

  it('points the arcforge data home into the trial and leaves HOME alone', () => {
    const env = build();
    expect(env.ARCFORGE_HOME).toBe(path.join(trialDir, '.arcforge'));
    expect(env.HOME).toBe(parentEnv.HOME);
    expect(env).not.toHaveProperty('CLAUDE_CONFIG_DIR');
  });

  it('keeps the operator environment whole for a --no-isolate trial', () => {
    const env = build({ contained: false });
    expect(env.PATH).toBe(parentEnv.PATH);
    expect(env.EDITOR).toBe('vim');
    expect(env.ARCFORGE_HOME).toBe(path.join(trialDir, '.arcforge'));
    expect(fs.existsSync(path.join(projectRoot, '.eval-trials', '.bin'))).toBe(false);
  });

  it('does not mutate the environment it was built from', () => {
    const before = { ...parentEnv };
    build();
    expect(parentEnv).toEqual(before);
  });

  it('on this host too: a trial resolves no arcforge', () => {
    // The real parent environment, whatever the developer or CI has on PATH.
    expect(which('arcforge', trialEnv(trialDir, {}, { projectRoot }))).toBe('');
  });
});

describe('the shim directory', () => {
  let root;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'test-trial-shims-')));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('follows claude when the operator PATH resolves it somewhere else', () => {
    const binDir = path.join(root, 'shims');
    const first = writeExecutable(path.join(root, 'a', 'claude'));
    const second = writeExecutable(path.join(root, 'b', 'claude'));
    ensureToolShims(binDir, path.dirname(first));
    expect(fs.readlinkSync(path.join(binDir, 'claude'))).toBe(first);
    ensureToolShims(binDir, path.dirname(second));
    expect(fs.readlinkSync(path.join(binDir, 'claude'))).toBe(second);
  });

  it('leaves no claude shim when the operator has none, and drops a stale one', () => {
    const binDir = path.join(root, 'shims');
    const claude = writeExecutable(path.join(root, 'a', 'claude'));
    ensureToolShims(binDir, path.dirname(claude));
    ensureToolShims(binDir, path.join(root, 'empty'));
    expect(fs.existsSync(path.join(binDir, 'claude'))).toBe(false);
    expect(fs.existsSync(path.join(binDir, 'node'))).toBe(true);
  });

  it('never resolves claude to its own shim', () => {
    const binDir = path.join(root, 'shims');
    const claude = writeExecutable(path.join(root, 'a', 'claude'));
    ensureToolShims(binDir, path.dirname(claude));
    // A run started from inside a trial has the shim directory first on PATH.
    ensureToolShims(binDir, [binDir, path.dirname(claude)].join(':'));
    expect(fs.readlinkSync(path.join(binDir, 'claude'))).toBe(claude);
  });

  it('skips a non-executable file and a directory of the same name', () => {
    fs.mkdirSync(path.join(root, 'dir', 'claude'), { recursive: true });
    fs.mkdirSync(path.join(root, 'plain'));
    fs.writeFileSync(path.join(root, 'plain', 'claude'), 'not executable', { mode: 0o644 });
    const real = writeExecutable(path.join(root, 'real', 'claude'));
    const pathValue = ['dir', 'plain', 'real'].map((d) => path.join(root, d)).join(':');
    expect(resolveOnPath('claude', pathValue)).toBe(real);
    expect(resolveOnPath('claude', path.join(root, 'plain'))).toBeUndefined();
  });
});
