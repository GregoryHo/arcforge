/**
 * Fail-open (hooks spec B-2) for the two session-tracker hooks that had no
 * top-level guard: an error thrown anywhere inside start.js or end.js must end
 * the hook with exit 0 and no stack trace on stderr.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const START = path.join(__dirname, '..', 'session-tracker', 'start.js');
const END = path.join(__dirname, '..', 'session-tracker', 'end.js');
const SESSION_ID = 'fail-open';

describe('session-tracker fail-open (B-2)', () => {
  let root;
  let projectDir;
  let arcforgeHome;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'st-fail-open-'));
    projectDir = path.join(root, 'proj');
    arcforgeHome = path.join(root, 'arcforge-home');
    fs.mkdirSync(projectDir);
    fs.mkdirSync(path.join(root, 'tmp'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function run(script, hookEventName) {
    return spawnSync('node', [script], {
      input: JSON.stringify({
        session_id: SESSION_ID,
        hook_event_name: hookEventName,
        cwd: projectDir,
      }),
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: root,
        TMPDIR: path.join(root, 'tmp'),
        ARCFORGE_HOME: arcforgeHome,
        ARCFORGE_OBSERVE_NO_SPAWN: '1',
        CLAUDE_PROJECT_DIR: projectDir,
      },
    });
  }

  it('start.js exits 0 quietly when the session dir cannot be created', () => {
    // A regular file where the arcforge home directory should be makes the
    // session-dir mkdir throw (ENOTDIR) — the unwritable-home case.
    fs.writeFileSync(arcforgeHome, '');

    const result = run(START, 'SessionStart');

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stderr, '');
  });

  it('end.js exits 0 quietly when the session record has an unexpected shape', () => {
    // Valid JSON, wrong shape: a non-string project makes the record's own
    // path computation throw a TypeError.
    const date = new Date().toISOString().split('T')[0];
    const sessionDir = path.join(arcforgeHome, 'sessions', 'proj', date);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, `session-${SESSION_ID}.json`),
      JSON.stringify({ project: 42, date: 42 }),
    );

    const result = run(END, 'Stop');

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.strictEqual(result.stderr, '');
  });
});
