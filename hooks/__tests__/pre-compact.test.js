const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const PRE_COMPACT = path.join(__dirname, '..', 'pre-compact', 'main.js');

describe('pre-compact: updateSessionFile', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-precompact-'));
    process.env.HOME = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-precompact-session';
    delete require.cache[require.resolve('../pre-compact/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should add compaction markers to session JSON', () => {
    const { updateSessionFile } = require('../pre-compact/main');

    // Create a session file
    const sessionDir = path.join(testDir, '.arcforge', 'sessions', 'test-project', '2025-01-15');
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, 'session-123.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ toolCalls: 10, compactions: [] }));

    const result = updateSessionFile(
      'test-project',
      '2025-01-15',
      '2025-01-15T10:30:00Z',
      'session-123',
    );
    assert.strictEqual(result, true);

    const updated = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    assert.strictEqual(updated.compactions.length, 1);
    assert.strictEqual(updated.compactions[0], '2025-01-15T10:30:00Z');
    assert.strictEqual(updated.lastCompaction, '2025-01-15T10:30:00Z');
    assert.strictEqual(updated.lastUpdated, '2025-01-15T10:30:00Z');
  });

  it('should return false for missing session file', () => {
    const { updateSessionFile } = require('../pre-compact/main');
    const result = updateSessionFile(
      'test-project',
      '2025-01-15',
      '2025-01-15T10:30:00Z',
      'nonexistent',
    );
    assert.strictEqual(result, false);
  });

  it('should append multiple compaction markers', () => {
    const { updateSessionFile } = require('../pre-compact/main');

    const sessionDir = path.join(testDir, '.arcforge', 'sessions', 'test-project', '2025-01-15');
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, 'session-123.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ toolCalls: 10 }));

    updateSessionFile('test-project', '2025-01-15', '2025-01-15T10:30:00Z', 'session-123');
    updateSessionFile('test-project', '2025-01-15', '2025-01-15T11:00:00Z', 'session-123');

    const updated = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    assert.strictEqual(updated.compactions.length, 2);
  });
});

// ─────────────────────────────────────────────
// PreCompact diary-capture dual path (ICL-8)
// ─────────────────────────────────────────────

describe('pre-compact: diary-capture fixture (ICL-8)', () => {
  const originalEnv = { ...process.env };
  let homeDir;
  let tmpDir;
  let binDir;
  const sessionId = 'session-precompact-fixture';

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-home-'));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-tmp-'));
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-bin-'));
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  });

  function counterPath(name) {
    // session_id comes from stdin → getSessionId() = `session-${id}`. Here the
    // raw id already starts with "session-" so the counter file double-stamps;
    // mirror getSessionId exactly: `session-${rawId}`.
    return path.join(tmpDir, `arcforge-${name}-session-${sessionId}`);
  }

  function pendingActions(project) {
    const file = path.join(homeDir, '.arcforge', 'sessions', project, 'pending-actions.json');
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8')).actions;
  }

  async function waitFor(file, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (fs.existsSync(file)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  it('stdin-only session_id: generates draft, calls enricher, queues diary-ready, resets counters', async () => {
    // S5-4: CLAUDE_SESSION_ID explicitly UNSET — session id must come from stdin.
    const marker = path.join(binDir, 'spawned.marker');
    fs.writeFileSync(
      path.join(binDir, 'claude'),
      `#!/bin/sh\ncat > /dev/null\nprintf '%s' "$ARCFORGE_SPAWNED" > "${marker}"\n`,
      { mode: 0o755 },
    );

    // Seed the user counter ABOVE threshold under the stdin-derived session id.
    fs.writeFileSync(counterPath('user-count'), '15');
    fs.writeFileSync(counterPath('tool-count'), '0');

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-proj-'));
    const project = path.basename(projectDir);

    const env = {
      ...process.env,
      HOME: homeDir,
      TMPDIR: tmpDir,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PROJECT_DIR: projectDir,
    };
    delete env.CLAUDE_SESSION_ID;

    const res = spawnSync('node', [PRE_COMPACT], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: 'PreCompact',
        cwd: projectDir,
      }),
      encoding: 'utf-8',
      env,
    });

    try {
      assert.strictEqual(res.status, 0, res.stderr);

      // diary-ready queued for next SessionStart.
      const diaryReady = pendingActions(project).filter((a) => a.type === 'diary-ready');
      assert.strictEqual(diaryReady.length, 1, 'diary-ready queued');

      // Counter reset (the sole reset path) hit the file the suggester actually wrote.
      assert.strictEqual(fs.readFileSync(counterPath('user-count'), 'utf-8'), '0', 'user reset');
      assert.strictEqual(fs.readFileSync(counterPath('tool-count'), 'utf-8'), '0', 'tool reset');

      // A draft was generated under the redirected HOME.
      const diariesDir = path.join(homeDir, '.arcforge', 'diaries', project);
      assert.ok(fs.existsSync(diariesDir), 'diaries dir created');

      // Enricher stub fired with the relay-isolation env (poll: detached spawn).
      assert.ok(await waitFor(marker, 5000), 'enricher stub invoked');
      assert.strictEqual(fs.readFileSync(marker, 'utf-8'), 'enricher', 'ARCFORGE_SPAWNED=enricher');
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('below threshold: no draft, no diary-ready, counters preserved', () => {
    fs.writeFileSync(path.join(binDir, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(counterPath('user-count'), '2');
    fs.writeFileSync(counterPath('tool-count'), '3');

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-proj-'));
    const project = path.basename(projectDir);

    const env = {
      ...process.env,
      HOME: homeDir,
      TMPDIR: tmpDir,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PROJECT_DIR: projectDir,
    };
    delete env.CLAUDE_SESSION_ID;

    const res = spawnSync('node', [PRE_COMPACT], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: 'PreCompact',
        cwd: projectDir,
      }),
      encoding: 'utf-8',
      env,
    });

    try {
      assert.strictEqual(res.status, 0, res.stderr);
      assert.strictEqual(pendingActions(project).length, 0, 'no actions queued');
      assert.strictEqual(
        fs.readFileSync(counterPath('user-count'), 'utf-8'),
        '2',
        'user preserved',
      );
      assert.strictEqual(
        fs.readFileSync(counterPath('tool-count'), 'utf-8'),
        '3',
        'tool preserved',
      );
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
