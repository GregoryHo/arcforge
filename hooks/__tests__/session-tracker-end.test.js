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
  const sessionId = 'v5-transcript-gate';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-tg-tmp-'));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-tg-home-'));
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

  function runStop(projectDir, transcriptPath) {
    return spawnSync('node', [END], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: 'Stop',
        cwd: projectDir,
        transcript_path: transcriptPath,
      }),
      encoding: 'utf-8',
      env: { ...process.env, HOME: homeDir, TMPDIR: tmpDir, CLAUDE_PROJECT_DIR: projectDir },
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

  it('above threshold: transcript IS parsed → enrichment present in session JSON', () => {
    fs.writeFileSync(counterPath('tool-count'), '60');
    fs.writeFileSync(counterPath('user-count'), '0');

    const transcript = path.join(tmpDir, 'transcript.jsonl');
    fs.writeFileSync(transcript, `${JSON.stringify({ type: 'user', content: 'hello there' })}\n`);

    const projectDir = path.join(homeDir, 'v5tg-high');
    fs.mkdirSync(projectDir, { recursive: true });

    const res = runStop(projectDir, transcript);
    assert.strictEqual(res.status, 0, res.stderr);

    const session = savedSession(projectDir);
    assert.deepStrictEqual(
      session.userMessageContent,
      ['hello there'],
      'above threshold enriches userMessageContent from the transcript',
    );
  });
});
