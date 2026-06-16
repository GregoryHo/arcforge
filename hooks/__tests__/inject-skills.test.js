/**
 * inject-skills/main.sh — SessionStart env-injection contract (SDD-4).
 *
 * Drives the real bash hook via spawnSync and asserts:
 *   - .arcforge-attended marker present  → CLAUDE_ENV_FILE gets BOTH exports
 *     (ARCFORGE_ROOT and ARCFORGE_MODE=attended)
 *   - no marker                          → only ARCFORGE_ROOT is exported
 *   - the stdout SessionStart JSON contract is unchanged either way
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const MAIN_SH = path.resolve(__dirname, '..', 'inject-skills', 'main.sh');
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Run main.sh with a fresh temp CLAUDE_ENV_FILE and the given project dir.
 * Returns the parsed stdout JSON and the resulting env-file contents.
 */
function runInjectSkills({ projectDir } = {}) {
  const envFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inject-env-')), 'env');
  const env = { ...process.env, CLAUDE_ENV_FILE: envFile };
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  else delete env.CLAUDE_PROJECT_DIR;
  // A real attended marker in the harness's own env must not leak into the test.
  delete env.ARCFORGE_MODE;

  const result = spawnSync('bash', [MAIN_SH], {
    env,
    timeout: 15000,
    encoding: 'utf-8',
  });
  const envContents = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8') : '';
  fs.rmSync(path.dirname(envFile), { recursive: true, force: true });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
    envContents,
  };
}

describe('inject-skills/main.sh env injection', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-proj-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('exits 0 and emits the SessionStart JSON contract (no marker)', () => {
    const { stdout, exitCode } = runInjectSkills({ projectDir });
    assert.strictEqual(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(parsed.hookSpecificOutput.additionalContext, /ARCFORGE_ROOT=/);
  });

  it('exports only ARCFORGE_ROOT when no .arcforge-attended marker is present', () => {
    const { envContents } = runInjectSkills({ projectDir });
    assert.match(envContents, /export ARCFORGE_ROOT=/);
    assert.doesNotMatch(envContents, /ARCFORGE_MODE/);
  });

  it('exports BOTH ARCFORGE_ROOT and ARCFORGE_MODE=attended when the marker is present', () => {
    fs.writeFileSync(path.join(projectDir, '.arcforge-attended'), '');
    const { envContents } = runInjectSkills({ projectDir });
    assert.match(envContents, /export ARCFORGE_ROOT=/);
    assert.match(envContents, /export ARCFORGE_MODE=attended/);
  });

  it('stdout JSON is byte-identical with vs without the marker', () => {
    const without = runInjectSkills({ projectDir }).stdout;
    fs.writeFileSync(path.join(projectDir, '.arcforge-attended'), '');
    const withMarker = runInjectSkills({ projectDir }).stdout;
    assert.strictEqual(withMarker, without);
  });

  it('does not opt in when CLAUDE_PROJECT_DIR is unset (never parses stdin)', () => {
    // Even with a marker on disk, absence of CLAUDE_PROJECT_DIR means no opt-in.
    fs.writeFileSync(path.join(projectDir, '.arcforge-attended'), '');
    const { envContents, exitCode } = runInjectSkills({ projectDir: undefined });
    assert.strictEqual(exitCode, 0);
    assert.match(envContents, /export ARCFORGE_ROOT=/);
    assert.doesNotMatch(envContents, /ARCFORGE_MODE/);
  });

  it('exported ARCFORGE_ROOT points at the plugin root', () => {
    const { envContents } = runInjectSkills({ projectDir });
    assert.ok(
      envContents.includes(`export ARCFORGE_ROOT="${PLUGIN_ROOT}"`),
      `env file should export the plugin root; got:\n${envContents}`,
    );
  });
});
