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

  // -------------------------------------------------------------------
  // D-010 retention: stamping the compaction marker rewrites the whole
  // record, so the same opt-in that governs capture governs what survives
  // here. Without the prune, a compaction re-serializes prose captured
  // before the user opted out.
  // -------------------------------------------------------------------

  /** A session record carrying prose an earlier, opted-in Stop wrote. */
  function seedRecordWithProse(sessionId) {
    const sessionDir = path.join(testDir, '.arcforge', 'sessions', 'test-project', '2025-01-15');
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, `${sessionId}.json`);
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({
        toolCalls: 10,
        compactions: [],
        userMessageContent: ['carried prose'],
        toolsUsed: ['Edit'],
      }),
    );
    return sessionFile;
  }

  /** A project root whose project-scope learning config is written as `enabled`. */
  function projectRootWithLearning(enabled) {
    const projectRoot = path.join(testDir, `proj-${enabled ? 'on' : 'off'}`);
    const configPath = path.join(projectRoot, '.arcforge', 'learning', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ scope: 'project', enabled }));
    return projectRoot;
  }

  it('prunes carried user prose when the opt-in is off', () => {
    const { updateSessionFile } = require('../pre-compact/main');
    const sessionFile = seedRecordWithProse('session-prune-off');

    const result = updateSessionFile(
      'test-project',
      '2025-01-15',
      '2025-01-15T10:30:00Z',
      'session-prune-off',
      { projectRoot: projectRootWithLearning(false) },
    );
    assert.strictEqual(result, true);

    const updated = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    assert.strictEqual(
      updated.userMessageContent,
      undefined,
      'a compaction must not re-serialize prose captured before the opt-out',
    );
    assert.deepStrictEqual(updated.toolsUsed, ['Edit'], 'tool names are continuity, kept');
    assert.strictEqual(updated.compactions.length, 1, 'the compaction marker still lands');
  });

  it('keeps carried user prose while the opt-in is on', () => {
    const { updateSessionFile } = require('../pre-compact/main');
    const sessionFile = seedRecordWithProse('session-prune-on');

    updateSessionFile('test-project', '2025-01-15', '2025-01-15T10:30:00Z', 'session-prune-on', {
      projectRoot: projectRootWithLearning(true),
    });

    const updated = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    assert.deepStrictEqual(
      updated.userMessageContent,
      ['carried prose'],
      'with learning on the record keeps what an earlier parse wrote',
    );
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

  /** Turn the project-scope learning opt-in on for a project dir. */
  function enableLearning(projectDir) {
    const configPath = path.join(projectDir, '.arcforge', 'learning', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ scope: 'project', enabled: true }));
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
    // Enrichment is opt-in (D-009): this case asserts the spawn, so opt in.
    enableLearning(projectDir);

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

  it('learning off: draft + diary-ready still happen, but the enricher never spawns', async () => {
    const marker = path.join(binDir, 'spawned.marker');
    fs.writeFileSync(
      path.join(binDir, 'claude'),
      `#!/bin/sh\ncat > /dev/null\nprintf '%s' "$ARCFORGE_SPAWNED" > "${marker}"\n`,
      { mode: 0o755 },
    );

    fs.writeFileSync(counterPath('user-count'), '15');
    fs.writeFileSync(counterPath('tool-count'), '0');

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-proj-'));
    const project = path.basename(projectDir);
    // No learning config anywhere — the default.

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
      // Continuity is unchanged by the opt-in.
      assert.strictEqual(
        pendingActions(project).filter((a) => a.type === 'diary-ready').length,
        1,
        'diary-ready still queued',
      );
      assert.ok(
        fs.existsSync(path.join(homeDir, '.arcforge', 'diaries', project)),
        'draft still generated',
      );
      // Enrichment is not.
      assert.strictEqual(await waitFor(marker, 1000), false, 'enricher must NOT spawn');
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
  // D-010 retention, end-to-end: updateSessionFile fails closed on a missing
  // projectRoot, so a main() that never threaded it through would delete prose
  // even for an opted-in user — and every direct-call test would still pass.
  // This case spawns the real hook to pin the wiring.
  it('main(): a compaction with learning ON keeps the prose an earlier Stop wrote', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-keep-proj-'));
    const project = path.basename(projectDir);
    enableLearning(projectDir);

    const date = new Date().toISOString().split('T')[0];
    const sessionDir = path.join(homeDir, '.arcforge', 'sessions', project, date);
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, `session-${sessionId}.json`);
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({ compactions: [], userMessageContent: ['carried prose'] }),
    );

    // Below the diary threshold, so this compaction only stamps the record.
    fs.writeFileSync(counterPath('user-count'), '1');
    fs.writeFileSync(counterPath('tool-count'), '1');

    const env = {
      ...process.env,
      HOME: homeDir,
      TMPDIR: tmpDir,
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
      const updated = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      assert.strictEqual(updated.compactions.length, 1, 'the compaction marker landed');
      assert.deepStrictEqual(
        updated.userMessageContent,
        ['carried prose'],
        'main() must pass the project root through — an opted-in record keeps its prose',
      );
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------
  // Draft freshness. The draft is rendered from the session record by a
  // subprocess, so a compaction that reaches the threshold before any Stop has
  // closed the record must stamp the CURRENT counts and paths BEFORE the draft
  // is generated. Stamping afterwards produced a draft reporting 0 messages and
  // 0 tool calls for the very compaction the hook logged as 12 msgs / 55 tools.
  // -------------------------------------------------------------------

  const TODAY = new Date().toISOString().split('T')[0];

  /** A record holding an earlier turn's counts and no touched paths. */
  function seedStaleRecord(project) {
    const sessionDir = path.join(homeDir, '.arcforge', 'sessions', project, TODAY);
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, `session-${sessionId}.json`);
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({
        project,
        date: TODAY,
        sessionId: `session-${sessionId}`,
        started: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        userMessages: 0,
        toolCalls: 0,
        filesModified: [],
        compactions: [],
      }),
    );
    return sessionFile;
  }

  /** A harness transcript carrying user prose plus Edit/Write tool uses. */
  function writeTranscript() {
    const transcriptPath = path.join(homeDir, 'transcript.jsonl');
    const entry = (o) => JSON.stringify(o);
    fs.writeFileSync(
      transcriptPath,
      `${[
        entry({
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: 'ship the fix' }] },
        }),
        entry({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', name: 'Edit', input: { file_path: '/repo/src/alpha.js' } },
            ],
          },
        }),
        entry({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', name: 'Write', input: { file_path: '/repo/src/beta.js' } },
            ],
          },
        }),
      ].join('\n')}\n`,
    );
    return transcriptPath;
  }

  /** Spawn the real hook on an above-threshold PreCompact carrying a transcript. */
  function compactAboveThreshold(projectDir) {
    fs.writeFileSync(path.join(binDir, 'claude'), '#!/bin/sh\ncat > /dev/null\nexit 0\n', {
      mode: 0o755,
    });
    fs.writeFileSync(counterPath('user-count'), '12');
    fs.writeFileSync(counterPath('tool-count'), '55');

    const env = {
      ...process.env,
      HOME: homeDir,
      TMPDIR: tmpDir,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PROJECT_DIR: projectDir,
    };
    delete env.CLAUDE_SESSION_ID;

    return spawnSync('node', [PRE_COMPACT], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: 'PreCompact',
        transcript_path: writeTranscript(),
        cwd: projectDir,
      }),
      encoding: 'utf-8',
      env,
    });
  }

  function readDraft(project) {
    return fs.readFileSync(
      path.join(
        homeDir,
        '.arcforge',
        'diaries',
        project,
        TODAY,
        `diary-session-${sessionId}-draft.md`,
      ),
      'utf-8',
    );
  }

  function readRecord(project) {
    return JSON.parse(
      fs.readFileSync(
        path.join(homeDir, '.arcforge', 'sessions', project, TODAY, `session-${sessionId}.json`),
        'utf-8',
      ),
    );
  }

  it('above threshold: the draft renders this compaction, not the stale record', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-fresh-proj-'));
    const project = path.basename(projectDir);
    seedStaleRecord(project);

    const res = compactAboveThreshold(projectDir);

    try {
      assert.strictEqual(res.status, 0, res.stderr);
      const draft = readDraft(project);
      assert.match(draft, /\*\*User messages\*\*: 12/, 'draft reports the live message count');
      assert.match(draft, /\*\*Tool calls\*\*: 55/, 'draft reports the live tool count');
      assert.match(
        draft,
        /\*\*Files modified\*\*: .*alpha\.js.*beta\.js/,
        'draft lists the paths this compaction touched',
      );
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('above threshold: the record is stamped with the same counts and paths', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-stamp-proj-'));
    const project = path.basename(projectDir);
    seedStaleRecord(project);

    const res = compactAboveThreshold(projectDir);

    try {
      assert.strictEqual(res.status, 0, res.stderr);
      const record = readRecord(project);
      assert.strictEqual(record.userMessages, 12, 'record carries the live message count');
      assert.strictEqual(record.toolCalls, 55, 'record carries the live tool count');
      assert.deepStrictEqual(
        record.filesModified,
        ['/repo/src/alpha.js', '/repo/src/beta.js'],
        'record carries the transcript-derived paths',
      );
      assert.deepStrictEqual(record.toolsUsed, ['Edit', 'Write'], 'tool names are continuity');
      assert.strictEqual(record.compactions.length, 1, 'the compaction marker still lands');
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  // The stamp is a new WRITE path for prose — PreCompact previously only ever
  // pruned it — so the gate is pinned in both directions (D-010 / B-6).
  it('learning off: the stamp writes counts and paths but never the user prose', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-gate-off-proj-'));
    const project = path.basename(projectDir);
    seedStaleRecord(project);
    // No learning config anywhere — the default.

    const res = compactAboveThreshold(projectDir);

    try {
      assert.strictEqual(res.status, 0, res.stderr);
      const record = readRecord(project);
      assert.strictEqual(
        record.userMessageContent,
        undefined,
        'a compaction must not write verbatim prose while the opt-in is off',
      );
      assert.strictEqual(record.userMessages, 12, 'the count is continuity and lands either way');
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('learning on: the stamp includes the verbatim user prose', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precompact-gate-on-proj-'));
    const project = path.basename(projectDir);
    enableLearning(projectDir);
    seedStaleRecord(project);

    const res = compactAboveThreshold(projectDir);

    try {
      assert.strictEqual(res.status, 0, res.stderr);
      assert.deepStrictEqual(
        readRecord(project).userMessageContent,
        ['ship the fix'],
        'with the opt-in on the compaction records what the transcript parsed',
      );
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
