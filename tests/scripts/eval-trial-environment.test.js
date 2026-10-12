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

  it('survives the cleanup of a trial directory beside it', () => {
    const { createTrialDir, cleanupTrialDir } = require('../../scripts/lib/eval-trial-env');
    const trialDir = createTrialDir('scn', 1, root);
    const env = trialEnv(trialDir, {}, { projectRoot: root });
    const binDir = path.join(root, '.eval-trials', '.bin');
    cleanupTrialDir(trialDir);
    expect(fs.existsSync(trialDir)).toBe(false);
    expect(fs.existsSync(path.join(binDir, 'node'))).toBe(true);
    // A second trial of the same run finds the same directory, links untouched.
    const before = fs.lstatSync(path.join(binDir, 'node')).mtimeMs;
    expect(trialEnv(createTrialDir('scn', 2, root), {}, { projectRoot: root }).PATH).toBe(env.PATH);
    expect(fs.lstatSync(path.join(binDir, 'node')).mtimeMs).toBe(before);
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

describe('a scenario declares its own trial environment (## Environment)', () => {
  const { parseScenario } = require('../../scripts/lib/eval-scenario');
  const {
    TRIAL_DIR_VARS,
    parseEnvironment,
    declaredEnvironment,
  } = require('../../scripts/lib/eval-trial-environment');
  /* biome-ignore-start lint/suspicious/noTemplateCurlyInString: scenario placeholders, not JS templates */
  const REPO_BIN = 'PATH+=${PROJECT_ROOT}/bin';
  const FAKE_BIN = 'PATH^=${TRIAL_DIR}/fakebin';
  const UV_CACHE = 'UV_CACHE_DIR=${TRIAL_DIR}/.cache/uv';
  const BROWSERS = 'PLAYWRIGHT_BROWSERS_PATH=${TRIAL_DIR}/.cache/ms-playwright';
  /* biome-ignore-end lint/suspicious/noTemplateCurlyInString: scenario placeholders, not JS templates */
  let root;
  let projectRoot;
  let trialDir;
  let parentEnv;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'test-trial-declared-')));
    projectRoot = path.join(root, 'project');
    trialDir = path.join(projectRoot, '.eval-trials', 'scn-t1-abc');
    fs.mkdirSync(trialDir, { recursive: true });
    writeExecutable(path.join(projectRoot, 'bin', 'arcforge'));
    writeExecutable(path.join(root, 'operator', 'bin', 'uv'));
    parentEnv = {
      PATH: [path.join(root, 'operator', 'bin'), ...SYSTEM_PATH].join(':'),
      HOME: path.join(root, 'home'),
    };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const build = (environment, opts = {}) =>
    trialEnv(trialDir, { name: 'scn', environment }, { projectRoot, parentEnv, ...opts });
  const shims = () => path.join(projectRoot, '.eval-trials', '.bin');

  it('puts arcforge back on PATH only for a scenario that declares the repo bin', () => {
    expect(which('arcforge', build([]))).toBe('');
    const env = build([REPO_BIN]);
    expect(which('arcforge', env)).toBe(path.join(projectRoot, 'bin', 'arcforge'));
    expect(env.PATH.split(':')).toEqual([shims(), ...SYSTEM_PATH, path.join(projectRoot, 'bin')]);
  });

  it('lets a trial-local directory shadow a tool for that trial alone', () => {
    const fake = writeExecutable(path.join(trialDir, 'fakebin', 'uv'), '#!/bin/sh\nexit 127\n');
    const env = build([FAKE_BIN]);
    expect(which('uv', env)).toBe(fake);
    expect(env.PATH.split(':')[0]).toBe(path.join(trialDir, 'fakebin'));
    // Another trial of the same scenario gets its own directory, not this one.
    const other = path.join(projectRoot, '.eval-trials', 'scn-t2-def');
    const otherEnv = trialEnv(other, { environment: [FAKE_BIN] }, { projectRoot, parentEnv });
    expect(otherEnv.PATH.split(':')[0]).toBe(path.join(other, 'fakebin'));
  });

  it('removes a directory, and ignores a removal of one that is not there', () => {
    const env = build(['PATH-=/usr/sbin', 'PATH-=/not/on/path']);
    expect(env.PATH.split(':')).toEqual([shims(), '/usr/bin', '/bin', '/sbin']);
  });

  it('applies PATH declarations in the order written, without duplicates', () => {
    const env = build(['PATH+=/opt/a', 'PATH^=/opt/b', 'PATH+=/opt/b/', 'PATH-=/opt/a']);
    expect(env.PATH.split(':')).toEqual([shims(), ...SYSTEM_PATH, '/opt/b']);
  });

  it('points cache directories inside the trial', () => {
    const env = build([UV_CACHE, BROWSERS]);
    expect(env.UV_CACHE_DIR).toBe(path.join(trialDir, '.cache', 'uv'));
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe(path.join(trialDir, '.cache', 'ms-playwright'));
    expect(env.HOME).toBe(parentEnv.HOME);
  });

  it('applies the same declarations on top of a --no-isolate environment', () => {
    const env = build([REPO_BIN, UV_CACHE], { contained: false });
    expect(env.PATH).toBe([parentEnv.PATH, path.join(projectRoot, 'bin')].join(':'));
    expect(env.UV_CACHE_DIR).toBe(path.join(trialDir, '.cache', 'uv'));
  });

  it.each([
    ['PATH=/usr/local/bin', /PATH cannot be replaced/],
    ['HOME=/tmp/elsewhere', /HOME is not a variable a scenario may declare/],
    ['ANTHROPIC_MODEL=opus', /not a variable a scenario may declare/],
    ['PATH+=bin', /must be an absolute path/],
    ['PATH+=/a:/b', /one directory/],
    ['PATH+=/with space', /one directory/],
    ['PATH+=$HOME/bin', /expands only a leading/],
    ['PATH+=~/bin', /expands only a leading/],
    ['PATH+=/a/../b', /"\.\." segment/],
    ['PATH+=', /has no value/],
    ['UV_CACHE_DIR=/var/cache/uv', /must point inside the trial/],
    [`UV_CACHE_DIR=\${PROJECT_ROOT}/cache`, /must point inside the trial/],
    [`UV_CACHE_DIR=\${TRIAL_DIR}/`, /must point inside the trial/],
    [`UV_CACHE_DIR=\${TRIAL_DIR}/../escape`, /"\.\." segment/],
    [`PIP_CACHE_DIR+=\${TRIAL_DIR}/pip`, /takes "="/],
    [`PATH+=\${TRIAL_DIR}bin`, /needs a "\/" after the placeholder/],
    ['export PATH', /expected PATH\+=<dir>/],
  ])('refuses %s', (line, reason) => {
    const { directives, errors } = parseEnvironment([line]);
    expect(directives).toEqual([]);
    expect(errors).toEqual([{ index: 0, message: expect.stringMatching(reason) }]);
    expect(() => build([line])).toThrow(/bad ## Environment line/);
  });

  it('refuses to take the shim directory off PATH, however it is spelled', () => {
    for (const line of [
      `PATH-=\${PROJECT_ROOT}/.eval-trials/.bin`,
      `PATH-=\${PROJECT_ROOT}/.eval-trials/.bin/`,
    ]) {
      expect(parseEnvironment([line]).errors).toEqual([
        { index: 0, message: expect.stringMatching(/would remove the directory claude and node/) },
      ]);
    }
    // A literal path only shows itself once the project root is known.
    const literal = `PATH-=${shims()}`;
    expect(parseEnvironment([literal]).errors).toEqual([]);
    expect(() => build([literal])).toThrow(/would remove the directory claude and node/);
    // Moving it is not removing it: claude and node still resolve.
    const env = build([`PATH+=\${PROJECT_ROOT}/.eval-trials/.bin`]);
    expect(env.PATH.split(':')).toEqual([...SYSTEM_PATH, shims()]);
  });

  it('refuses a cache variable declared twice, naming the second line', () => {
    const { errors } = parseEnvironment([UV_CACHE, BROWSERS, UV_CACHE]);
    expect(errors).toEqual([{ index: 2, message: 'UV_CACHE_DIR is declared twice' }]);
  });

  it('names every bad line in one refusal, and builds nothing', () => {
    expect(() => declaredEnvironment({ name: 'scn', environment: ['PATH=/x', 'HOME=/y'] })).toThrow(
      /Scenario scn has a bad ## Environment line: "PATH=\/x": .*; "HOME=\/y": /,
    );
    expect(() => build(['PATH=/x'])).toThrow();
    expect(fs.existsSync(shims())).toBe(false);
  });

  it('accepts every declarable cache variable', () => {
    const lines = [...TRIAL_DIR_VARS].map((name) => `${name}=\${TRIAL_DIR}/.cache/${name}`);
    expect(parseEnvironment(lines).errors).toEqual([]);
  });

  it('is parsed from the scenario file as written, comments and blanks dropped', () => {
    const file = path.join(root, 'scn.md');
    fs.writeFileSync(
      file,
      [
        '# Eval: scn',
        '',
        '## Scenario',
        'Do it.',
        '',
        '## Environment',
        '# arcforge is the tool under test',
        `  ${REPO_BIN}  `,
        '',
        UV_CACHE,
        '',
        '## Setup',
        'true',
      ].join('\n'),
    );
    expect(parseScenario(file, projectRoot).environment).toEqual([REPO_BIN, UV_CACHE]);
    fs.writeFileSync(file, '# Eval: scn\n\n## Scenario\nDo it.\n');
    expect(parseScenario(file, projectRoot)).not.toHaveProperty('environment');
  });
});
