const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  PACKAGE_MANAGERS,
  getPackageManagerCommands,
  getPmRunCommand,
  getPmExecCommand,
  hasDependency,
  hasScript,
  getScripts,
  hasPackageJson,
  hasPyprojectToml,
  readPackageJson,
} = require('../../scripts/lib/package-manager');

describe('getPackageManagerCommands', () => {
  it('should return config for known PMs', () => {
    for (const pm of ['npm', 'pnpm', 'yarn', 'bun']) {
      const config = getPackageManagerCommands(pm);
      expect(config).not.toBeNull();
      expect(config.lockFile).toBeDefined();
      expect(config.command).toBe(pm === 'npm' ? 'npm' : pm);
      expect(config.test).toBeDefined();
    }
  });

  it('should return null for unknown PM', () => {
    expect(getPackageManagerCommands('deno')).toBeNull();
  });
});

describe('getPmRunCommand', () => {
  it('should generate correct run commands', () => {
    expect(getPmRunCommand('test', 'npm')).toEqual(['npm', 'run', 'test']);
    expect(getPmRunCommand('lint', 'pnpm')).toEqual(['pnpm', 'lint']);
    expect(getPmRunCommand('build', 'yarn')).toEqual(['yarn', 'build']);
    expect(getPmRunCommand('dev', 'bun')).toEqual(['bun', 'run', 'dev']);
  });

  it('should return null for unknown PM', () => {
    expect(getPmRunCommand('test', 'unknown')).toBeNull();
  });
});

describe('getPmExecCommand', () => {
  it('should generate correct exec commands', () => {
    expect(getPmExecCommand('prettier', 'npm')).toEqual(['npx', 'prettier']);
    expect(getPmExecCommand('tsc', 'pnpm')).toEqual(['pnpm', 'exec', 'tsc']);
    expect(getPmExecCommand('vitest', 'yarn')).toEqual(['yarn', 'vitest']);
    expect(getPmExecCommand('esbuild', 'bun')).toEqual(['bun', 'x', 'esbuild']);
  });

  it('should return null for unknown PM', () => {
    expect(getPmExecCommand('prettier', 'unknown')).toBeNull();
  });
});

describe('package.json inspection', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-pm-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('readPackageJson should parse valid package.json', () => {
    const pkg = { name: 'test', version: '1.0.0', scripts: { test: 'jest' } };
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg));
    expect(readPackageJson(testDir)).toEqual(pkg);
  });

  it('readPackageJson should return null when missing', () => {
    expect(readPackageJson(testDir)).toBeNull();
  });

  it('hasPackageJson should detect presence', () => {
    expect(hasPackageJson(testDir)).toBe(false);
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
    expect(hasPackageJson(testDir)).toBe(true);
  });

  it('hasPyprojectToml should detect presence', () => {
    expect(hasPyprojectToml(testDir)).toBe(false);
    fs.writeFileSync(path.join(testDir, 'pyproject.toml'), '[project]');
    expect(hasPyprojectToml(testDir)).toBe(true);
  });

  it('hasDependency should check both deps and devDeps', () => {
    const pkg = {
      dependencies: { lodash: '4.0.0' },
      devDependencies: { jest: '29.0.0' },
    };
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg));
    expect(hasDependency('lodash', testDir)).toBe(true);
    expect(hasDependency('jest', testDir)).toBe(true);
    expect(hasDependency('express', testDir)).toBe(false);
  });

  it('hasScript should detect available scripts', () => {
    const pkg = { scripts: { test: 'jest', lint: 'biome check' } };
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg));
    expect(hasScript('test', testDir)).toBe(true);
    expect(hasScript('build', testDir)).toBe(false);
  });

  it('getScripts should return all scripts', () => {
    const scripts = { test: 'jest', lint: 'biome check' };
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ scripts }));
    expect(getScripts(testDir)).toEqual(scripts);
  });

  it('getScripts should return empty object when no package.json', () => {
    expect(getScripts(testDir)).toEqual({});
  });
});

describe('PACKAGE_MANAGERS constant', () => {
  it('should have all four managers defined', () => {
    expect(Object.keys(PACKAGE_MANAGERS).sort()).toEqual(['bun', 'npm', 'pnpm', 'yarn']);
  });

  it('each manager should have required command fields', () => {
    for (const [_name, config] of Object.entries(PACKAGE_MANAGERS)) {
      expect(config.lockFile).toBeDefined();
      expect(config.command).toBeDefined();
      expect(Array.isArray(config.run)).toBe(true);
      expect(Array.isArray(config.exec)).toBe(true);
      expect(Array.isArray(config.install)).toBe(true);
      expect(Array.isArray(config.test)).toBe(true);
      expect(Array.isArray(config.build)).toBe(true);
    }
  });
});
