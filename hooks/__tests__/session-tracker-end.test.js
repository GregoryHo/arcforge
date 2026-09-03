const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { calculateDurationMinutes } = require('../session-tracker/end');

const END = path.join(__dirname, '..', 'session-tracker', 'end.js');

describe('calculateDurationMinutes', () => {
  it('should calculate duration correctly', () => {
    const start = '2025-01-01T10:00:00Z';
    const end = '2025-01-01T10:30:00Z';
    assert.strictEqual(calculateDurationMinutes(start, end), 30);
  });

  it('should round to nearest minute', () => {
    const start = '2025-01-01T10:00:00Z';
    const end = '2025-01-01T10:00:45Z';
    assert.strictEqual(calculateDurationMinutes(start, end), 1);
  });

  it('should return null for missing timestamps', () => {
    assert.strictEqual(calculateDurationMinutes(null, '2025-01-01T10:00:00Z'), null);
    assert.strictEqual(calculateDurationMinutes('2025-01-01T10:00:00Z', null), null);
    assert.strictEqual(calculateDurationMinutes(null, null), null);
  });
});

// ---------------------------------------------------------------------------
// ICL-11: 'Session paused' message gating (only on triggered branch)
// ---------------------------------------------------------------------------

describe('Stop message gating (ICL-11)', () => {
  const originalEnv = { ...process.env };
  let tmpDir;
  let homeDir;
  const sessionId = 'icl11-gate';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icl11-tmp-'));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icl11-home-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  function counterPath(name) {
    return path.join(tmpDir, `arcforge-${name}-session-${sessionId}`);
  }

  function runStop(projectDir) {
    return spawnSync('node', [END], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: 'Stop',
        cwd: projectDir,
      }),
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: homeDir,
        TMPDIR: tmpDir,
        CLAUDE_PROJECT_DIR: projectDir,
      },
    });
  }

  it('above threshold (triggered): emits user-visible Session paused systemMessage', () => {
    // Seed tool-count above the diary threshold (50) so the capture triggers.
    fs.writeFileSync(counterPath('tool-count'), '60');
    fs.writeFileSync(counterPath('user-count'), '0');

    const projectDir = path.join(homeDir, 'icl11-proj');
    fs.mkdirSync(projectDir, { recursive: true });

    const res = runStop(projectDir);
    assert.strictEqual(res.status, 0, res.stderr);

    const parsed = JSON.parse(res.stdout.trim());
    assert.ok(parsed.systemMessage, 'systemMessage present when triggered');
    assert.ok(parsed.systemMessage.includes('Session paused'));
  });

  it('below threshold: no user-visible systemMessage (stderr log only)', () => {
    fs.writeFileSync(counterPath('tool-count'), '3');
    fs.writeFileSync(counterPath('user-count'), '2');

    const projectDir = path.join(homeDir, 'icl11-proj-low');
    fs.mkdirSync(projectDir, { recursive: true });

    const res = runStop(projectDir);
    assert.strictEqual(res.status, 0, res.stderr);

    // No JSON systemMessage on stdout below threshold.
    assert.strictEqual(res.stdout.trim(), '', 'no stdout systemMessage below threshold');
    // The paused notice is logged to stderr instead.
    assert.ok(res.stderr.includes('Session paused'), 'paused notice logged to stderr');
  });
});

// ---------------------------------------------------------------------------
// v5: transcript parse is gated behind the diary threshold (perf). Below
// threshold the transcript is NOT parsed, so the session JSON loses the
// userMessageContent/toolsUsed enrichment (documented behavior delta).
// ---------------------------------------------------------------------------

describe('Stop transcript-parse threshold gate (v5)', () => {
  const originalEnv = { ...process.env };
  let tmpDir;
  let homeDir;
  let binDir;
  const sessionId = 'v5-transcript-gate';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-tg-tmp-'));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-tg-home-'));
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-tg-bin-'));
    // Stub `claude` so an opted-in Stop never launches the real enricher.
    fs.writeFileSync(path.join(binDir, 'claude'), '#!/bin/sh\ncat > /dev/null\n', { mode: 0o755 });
  });

  afterEach(() => {
    for (const dir of [tmpDir, homeDir, binDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  function counterPath(name) {
    return path.join(tmpDir, `arcforge-${name}-session-${sessionId}`);
  }

  /** Turn the project-scope learning opt-in on for a project dir. */
  function enableLearning(projectDir) {
    const configPath = path.join(projectDir, '.arcforge', 'learning', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ scope: 'project', enabled: true }));
  }

  /** Turn the project-scope learning opt-in explicitly OFF for a project dir. */
  function disableLearning(projectDir) {
    const configPath = path.join(projectDir, '.arcforge', 'learning', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ scope: 'project', enabled: false }));
  }

  /** Reseed the shared counters so a second Stop lands where the test wants it. */
  function seedCounts(toolCount, userCount) {
    fs.writeFileSync(counterPath('tool-count'), String(toolCount));
    fs.writeFileSync(counterPath('user-count'), String(userCount));
  }

  /** A transcript with one user sentence and one Edit tool call. */
  function writeTranscript(name, sentence) {
    const transcript = path.join(tmpDir, name);
    fs.writeFileSync(
      transcript,
      `${[
        JSON.stringify({ type: 'user', content: sentence }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/tmp/foo.ts' } }],
          },
        }),
      ].join('\n')}\n`,
    );
    return transcript;
  }

  function runStop(projectDir, transcriptPath) {
    return spawnSync('node', [END], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: 'Stop',
        cwd: projectDir,
        transcript_path: transcriptPath,
      }),
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: homeDir,
        TMPDIR: tmpDir,
        CLAUDE_PROJECT_DIR: projectDir,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      },
    });
  }

  function savedSession(projectDir) {
    const project = path.basename(projectDir);
    const date = new Date().toISOString().split('T')[0];
    const file = path.join(
      homeDir,
      '.arcforge',
      'sessions',
      project,
      date,
      `session-${sessionId}.json`,
    );
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  it('below threshold: transcript is NOT parsed → no enrichment in session JSON', () => {
    fs.writeFileSync(counterPath('tool-count'), '3');
    fs.writeFileSync(counterPath('user-count'), '2');

    const transcript = path.join(tmpDir, 'transcript.jsonl');
    fs.writeFileSync(transcript, `${JSON.stringify({ type: 'user', content: 'hello there' })}\n`);

    const projectDir = path.join(homeDir, 'v5tg-low');
    fs.mkdirSync(projectDir, { recursive: true });

    const res = runStop(projectDir, transcript);
    assert.strictEqual(res.status, 0, res.stderr);

    const session = savedSession(projectDir);
    assert.strictEqual(
      session.userMessageContent,
      undefined,
      'below threshold must NOT enrich userMessageContent',
    );
    assert.strictEqual(session.toolsUsed, undefined, 'below threshold must NOT enrich toolsUsed');
    assert.deepStrictEqual(session.filesModified, [], 'filesModified defaults to empty');
  });

  it('above threshold + learning ON: transcript IS parsed → enrichment present in session JSON', () => {
    fs.writeFileSync(counterPath('tool-count'), '60');
    fs.writeFileSync(counterPath('user-count'), '0');

    const transcript = path.join(tmpDir, 'transcript.jsonl');
    fs.writeFileSync(transcript, `${JSON.stringify({ type: 'user', content: 'hello there' })}\n`);

    const projectDir = path.join(homeDir, 'v5tg-high');
    fs.mkdirSync(projectDir, { recursive: true });
    enableLearning(projectDir);

    const res = runStop(projectDir, transcript);
    assert.strictEqual(res.status, 0, res.stderr);

    const session = savedSession(projectDir);
    assert.deepStrictEqual(
      session.userMessageContent,
      ['hello there'],
      'above threshold enriches userMessageContent from the transcript',
    );
  });

  // ---------------------------------------------------------------------
  // D-010: capture depth. Counts, tool names and paths are continuity and
  // stay always-on; verbatim user prose waits for the learning opt-in.
  // ---------------------------------------------------------------------
  it('above threshold + learning OFF: keeps filesModified/toolsUsed, drops user prose', () => {
    fs.writeFileSync(counterPath('tool-count'), '60');
    fs.writeFileSync(counterPath('user-count'), '0');

    const transcript = path.join(tmpDir, 'transcript.jsonl');
    fs.writeFileSync(
      transcript,
      `${[
        JSON.stringify({ type: 'user', content: 'a secret sentence' }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/tmp/foo.ts' } }],
          },
        }),
      ].join('\n')}\n`,
    );

    const projectDir = path.join(homeDir, 'v5tg-off');
    fs.mkdirSync(projectDir, { recursive: true });
    // No learning config anywhere — the default.

    const res = runStop(projectDir, transcript);
    assert.strictEqual(res.status, 0, res.stderr);

    const session = savedSession(projectDir);
    assert.strictEqual(
      session.userMessageContent,
      undefined,
      'user prose must NOT be stored with learning off',
    );
    assert.deepStrictEqual(session.toolsUsed, ['Edit'], 'tool names still recorded');
    assert.deepStrictEqual(
      session.filesModified,
      ['/tmp/foo.ts'],
      'filesModified still recorded — the diary Files-modified line depends on it',
    );
  });

  // -------------------------------------------------------------------
  // D-010 retention: the opt-in governs how long prose may STAY, not only
  // whether it is written. The session record is reloaded and rewritten on
  // every Stop, so a gate that only skipped the assignment would keep
  // re-serializing prose captured before the user opted out.
  // -------------------------------------------------------------------
  it('learning ON above threshold, then OFF above threshold: prose is removed, not merely not rewritten', () => {
    const projectDir = path.join(homeDir, 'v5tg-optout-high');
    fs.mkdirSync(projectDir, { recursive: true });
    enableLearning(projectDir);

    seedCounts(60, 0);
    const first = runStop(projectDir, writeTranscript('t1.jsonl', 'a secret sentence'));
    assert.strictEqual(first.status, 0, first.stderr);
    assert.deepStrictEqual(savedSession(projectDir).userMessageContent, ['a secret sentence']);

    disableLearning(projectDir);
    seedCounts(60, 0);
    const second = runStop(projectDir, writeTranscript('t2.jsonl', 'another sentence'));
    assert.strictEqual(second.status, 0, second.stderr);

    const session = savedSession(projectDir);
    assert.strictEqual(
      session.userMessageContent,
      undefined,
      'prose captured under the opt-in must be deleted once it is withdrawn',
    );
    assert.deepStrictEqual(
      session.toolsUsed,
      ['Edit'],
      'tool names are continuity, still recorded',
    );
    assert.deepStrictEqual(session.filesModified, ['/tmp/foo.ts'], 'paths still recorded');
  });

  it('learning ON above threshold, then OFF below threshold: prose is removed, tool names carry forward', () => {
    const projectDir = path.join(homeDir, 'v5tg-optout-low');
    fs.mkdirSync(projectDir, { recursive: true });
    enableLearning(projectDir);

    seedCounts(60, 0);
    const first = runStop(projectDir, writeTranscript('t1.jsonl', 'a secret sentence'));
    assert.strictEqual(first.status, 0, first.stderr);
    assert.deepStrictEqual(savedSession(projectDir).userMessageContent, ['a secret sentence']);

    disableLearning(projectDir);
    seedCounts(3, 2);
    const second = runStop(projectDir, writeTranscript('t2.jsonl', 'another sentence'));
    assert.strictEqual(second.status, 0, second.stderr);

    const session = savedSession(projectDir);
    assert.strictEqual(
      session.userMessageContent,
      undefined,
      'a below-threshold Stop must prune too — it rewrites the record just the same',
    );
    assert.deepStrictEqual(
      session.toolsUsed,
      ['Edit'],
      'toolsUsed keeps its documented carry-forward — it is continuity, not prose',
    );
  });

  it('learning stays ON: a below-threshold Stop keeps the prose an earlier parse wrote', () => {
    const projectDir = path.join(homeDir, 'v5tg-stays-on');
    fs.mkdirSync(projectDir, { recursive: true });
    enableLearning(projectDir);

    seedCounts(60, 0);
    const first = runStop(projectDir, writeTranscript('t1.jsonl', 'a secret sentence'));
    assert.strictEqual(first.status, 0, first.stderr);

    seedCounts(3, 2);
    const second = runStop(projectDir, writeTranscript('t2.jsonl', 'another sentence'));
    assert.strictEqual(second.status, 0, second.stderr);

    assert.deepStrictEqual(
      savedSession(projectDir).userMessageContent,
      ['a secret sentence'],
      'with learning on the carry-forward hooks.md documents is unchanged',
    );
  });
});

// ---------------------------------------------------------------------------
// D-009: the reflection nudge is behind the same opt-in as the enrichment it
// follows. Reflection IS the learning loop, and with learning off the diaries
// it counts are permanent stubs — an ungated nudge would recur at every Stop
// above the threshold, forever, about work the user declined.
// ---------------------------------------------------------------------------

describe('Stop reflect-ready nudge gate (D-009)', () => {
  const originalEnv = { ...process.env };
  let tmpDir;
  let homeDir;
  let binDir;
  const sessionId = 'reflect-gate';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reflect-gate-tmp-'));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reflect-gate-home-'));
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reflect-gate-bin-'));
    // Stub `claude` so the opted-in case never launches the real enricher.
    fs.writeFileSync(path.join(binDir, 'claude'), '#!/bin/sh\ncat > /dev/null\n', { mode: 0o755 });
  });

  afterEach(() => {
    for (const dir of [tmpDir, homeDir, binDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  /** Turn the project-scope learning opt-in on for a project dir. */
  function enableLearning(projectDir) {
    const configPath = path.join(projectDir, '.arcforge', 'learning', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ scope: 'project', enabled: true }));
  }

  /** Three unprocessed diaries — REFLECT_READY_MIN_DIARIES. */
  function seedDiaries(project) {
    const dir = path.join(homeDir, '.arcforge', 'diaries', project, '2026-09-01');
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ['a', 'b', 'c']) {
      fs.writeFileSync(path.join(dir, `diary-session-${name}.md`), '# Diary\n');
    }
  }

  function pendingReflectActions(project) {
    const file = path.join(homeDir, '.arcforge', 'sessions', project, 'pending-actions.json');
    if (!fs.existsSync(file)) return [];
    const { actions = [] } = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return actions.filter((a) => a.type === 'reflect-ready');
  }

  /** Run a Stop above the diary threshold, so the nudge is even considered. */
  function runStop(projectDir) {
    fs.writeFileSync(path.join(tmpDir, `arcforge-user-count-session-${sessionId}`), '15');
    fs.writeFileSync(path.join(tmpDir, `arcforge-tool-count-session-${sessionId}`), '0');
    return spawnSync('node', [END], {
      input: JSON.stringify({ session_id: sessionId, hook_event_name: 'Stop', cwd: projectDir }),
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: homeDir,
        TMPDIR: tmpDir,
        CLAUDE_PROJECT_DIR: projectDir,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      },
    });
  }

  function makeProject(name) {
    const projectDir = path.join(homeDir, name);
    fs.mkdirSync(projectDir, { recursive: true });
    seedDiaries(path.basename(projectDir));
    return projectDir;
  }

  it('learning off: no reflect-ready nudge, however many diaries pile up', () => {
    const projectDir = makeProject('reflect-off');

    const res = runStop(projectDir);
    assert.strictEqual(res.status, 0, res.stderr);
    // Guard against a vacuous pass: this Stop really was above the threshold,
    // so the nudge was considered and declined, not skipped upstream.
    assert.ok(res.stdout.includes('Session paused'), `expected a triggered Stop: ${res.stdout}`);
    assert.deepStrictEqual(
      pendingReflectActions(path.basename(projectDir)),
      [],
      'reflect-ready must not be queued while learning is off',
    );
  });

  it('learning on: the nudge is queued as before', () => {
    const projectDir = makeProject('reflect-on');
    enableLearning(projectDir);

    const res = runStop(projectDir);
    assert.strictEqual(res.status, 0, res.stderr);
    assert.strictEqual(
      pendingReflectActions(path.basename(projectDir)).length,
      1,
      'reflect-ready is queued once learning is on',
    );
  });
});
