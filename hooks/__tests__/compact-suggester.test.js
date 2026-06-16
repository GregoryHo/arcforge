const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const SUGGESTER = path.join(__dirname, '..', 'compact-suggester', 'main.js');
const PRE_COMPACT = path.join(__dirname, '..', 'pre-compact', 'main.js');

function freshModule() {
  delete require.cache[require.resolve('../compact-suggester/main')];
  delete require.cache[require.resolve('../../scripts/lib/diary-capture')];
  delete require.cache[require.resolve('../../scripts/lib/utils')];
  return require('../compact-suggester/main');
}

// ---------------------------------------------------------------------------
// State file consolidation (ICL-9)
// ---------------------------------------------------------------------------

describe('compact-suggester: single JSON state file', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-compact-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-compact-session';
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('initializes with count 0', () => {
    const { readCount } = freshModule();
    assert.strictEqual(readCount(), 0);
  });

  it('uses one JSON state file at the shared suggester path', () => {
    const { getStateFilePath } = freshModule();
    const filePath = getStateFilePath();
    assert.ok(filePath.includes('arcforge-suggester-state'));
    assert.ok(filePath.endsWith('.json'));
    assert.ok(filePath.includes('test-compact-session'));
  });

  it('readState/writeState round-trip', () => {
    const { readState, writeState, emptyState } = freshModule();
    writeState({ ...emptyState(), tools: 50, reads: 30, writes: 20 });
    const state = readState();
    assert.strictEqual(state.tools, 50);
    assert.strictEqual(state.reads, 30);
    assert.strictEqual(state.writes, 20);
  });
});

// ---------------------------------------------------------------------------
// Suggestion timing
// ---------------------------------------------------------------------------

describe('shouldSuggest logic', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-suggest-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-suggest-session';
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('does not suggest below threshold', () => {
    const { shouldSuggest } = freshModule();
    assert.strictEqual(shouldSuggest(0), false);
    assert.strictEqual(shouldSuggest(25), false);
    assert.strictEqual(shouldSuggest(49), false);
  });

  it('suggests at threshold (50)', () => {
    const { shouldSuggest } = freshModule();
    assert.strictEqual(shouldSuggest(50), true);
  });

  it('suggests at intervals (75, 100, 125)', () => {
    const { shouldSuggest } = freshModule();
    assert.strictEqual(shouldSuggest(75), true);
    assert.strictEqual(shouldSuggest(100), true);
    assert.strictEqual(shouldSuggest(125), true);
  });

  it('does not suggest between intervals', () => {
    const { shouldSuggest } = freshModule();
    assert.strictEqual(shouldSuggest(51), false);
    assert.strictEqual(shouldSuggest(60), false);
    assert.strictEqual(shouldSuggest(74), false);
    assert.strictEqual(shouldSuggest(99), false);
  });
});

// ---------------------------------------------------------------------------
// Rolling-window phase detection
// ---------------------------------------------------------------------------

describe('rolling-window phase detection', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let mod;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-phase-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-phase-session';
    mod = freshModule();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  function windowOf(reads, writes) {
    const state = mod.emptyState();
    for (let i = 0; i < reads; i++) mod.trackToolType(state, { tool_name: 'Read' });
    for (let i = 0; i < writes; i++) mod.trackToolType(state, { tool_name: 'Edit' });
    return state.window;
  }

  it('detects read-heavy phase from window', () => {
    const win = windowOf(11, 1);
    assert.strictEqual(mod.phaseFromWindow(win), 'read-heavy');
    const msg = mod.buildMessage(50, win);
    assert.ok(msg.includes('mostly reads'));
    assert.ok(msg.includes('arc-compacting'));
  });

  it('detects write-heavy phase from window', () => {
    const win = windowOf(4, 8);
    assert.strictEqual(mod.phaseFromWindow(win), 'write-heavy');
    const msg = mod.buildMessage(50, win);
    assert.ok(msg.includes('active implementation'));
    assert.ok(msg.includes('arc-compacting'));
  });

  it('neutral when no phase dominates', () => {
    const win = windowOf(6, 6);
    assert.strictEqual(mod.phaseFromWindow(win), 'neutral');
    assert.ok(mod.buildMessage(50, win).includes('arc-compacting'));
  });

  it('neutral when too few samples', () => {
    const win = windowOf(5, 0);
    assert.strictEqual(mod.phaseFromWindow(win), 'neutral');
    assert.ok(mod.buildMessage(50, win).includes('arc-compacting'));
  });

  it('window is bounded to 20 most-recent entries', () => {
    // 30 reads then 20 writes → last 20 are all writes → write-heavy,
    // even though lifetime reads (30) outnumber writes (20).
    const win = windowOf(30, 20);
    assert.strictEqual(win.length, 20);
    assert.strictEqual(mod.phaseFromWindow(win), 'write-heavy');
  });

  it('suppresses non-critical reminders during write-heavy window', () => {
    const win = windowOf(4, 8);
    assert.strictEqual(mod.shouldSuppressReminder(75, win), true);
    assert.strictEqual(mod.shouldSuppressReminder(50, win), false);
    assert.strictEqual(mod.shouldSuppressReminder(100, win), false);
  });

  it('does not suppress during read-heavy window', () => {
    const win = windowOf(11, 1);
    assert.strictEqual(mod.shouldSuppressReminder(75, win), false);
  });

  it('tracks Read/Glob/Grep as reads, Write/Edit/NotebookEdit as writes', () => {
    const state = mod.emptyState();
    mod.trackToolType(state, { tool_name: 'Read' });
    mod.trackToolType(state, { tool_name: 'Glob' });
    mod.trackToolType(state, { tool_name: 'Grep' });
    mod.trackToolType(state, { tool_name: 'Write' });
    mod.trackToolType(state, { tool_name: 'Edit' });
    mod.trackToolType(state, { tool_name: 'NotebookEdit' });
    assert.strictEqual(state.reads, 3);
    assert.strictEqual(state.writes, 3);
  });

  it('ignores unrelated tools', () => {
    const state = mod.emptyState();
    mod.trackToolType(state, { tool_name: 'Bash' });
    mod.trackToolType(state, { tool_name: 'Task' });
    assert.strictEqual(state.window.length, 0);
    assert.strictEqual(state.reads, 0);
    assert.strictEqual(state.writes, 0);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: event-driven runs (acceptance cases)
// ---------------------------------------------------------------------------

describe('compact-suggester e2e (ICL-9 acceptance)', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let homeDir;
  const sessionId = 'icl9-e2e';

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-icl9-tmp-'));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-icl9-home-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  function env(extra = {}) {
    return {
      ...process.env,
      TMPDIR: testDir,
      HOME: homeDir,
      ...extra,
    };
  }

  function runSuggester(toolName, e = env()) {
    return spawnSync('node', [SUGGESTER], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: 'PostToolUse',
        tool_name: toolName,
      }),
      encoding: 'utf-8',
      env: e,
    });
  }

  function statePath() {
    return path.join(testDir, `arcforge-suggester-state-session-${sessionId}.json`);
  }

  function toolCountPath() {
    return path.join(testDir, `arcforge-tool-count-session-${sessionId}`);
  }

  function readState() {
    return JSON.parse(fs.readFileSync(statePath(), 'utf-8'));
  }

  it('drives to 50 events → one suggestion + one state file + shared tool-count', () => {
    let suggestions = 0;
    for (let i = 0; i < 50; i++) {
      const res = runSuggester('Read');
      assert.strictEqual(res.status, 0, res.stderr);
      if (res.stdout.trim()) {
        const parsed = JSON.parse(res.stdout);
        if (parsed.systemMessage) suggestions++;
      }
    }
    assert.strictEqual(suggestions, 1, 'exactly one suggestion fired at 50');

    // $TMPDIR holds exactly one suggester state file + the shared tool-count.
    const tmpFiles = fs
      .readdirSync(testDir)
      .filter(
        (f) => f.startsWith('arcforge-suggester-state') || f.startsWith('arcforge-tool-count'),
      );
    assert.deepStrictEqual(
      tmpFiles.sort(),
      [
        `arcforge-suggester-state-session-${sessionId}.json`,
        `arcforge-tool-count-session-${sessionId}`,
      ].sort(),
    );
    assert.ok(
      !fs.existsSync(path.join(testDir, `arcforge-compact-count-session-${sessionId}`)),
      'no legacy compact-count file',
    );

    // State records the suggestion snapshot and the tool tally.
    const state = readState();
    assert.strictEqual(state.tools, 50);
    assert.strictEqual(state.suggestions.length, 1);
    assert.strictEqual(state.suggestions[0].count, 50);

    // Shared diary tool-count incremented in lockstep (binding preserved).
    assert.strictEqual(fs.readFileSync(toolCountPath(), 'utf-8'), '50');
  });

  it('S6-3: threshold output is a SINGLE JSON object carrying BOTH channels', () => {
    // Drive to the threshold; capture the one event that produces output.
    let thresholdOut = null;
    for (let i = 0; i < 50; i++) {
      const res = runSuggester('Read');
      assert.strictEqual(res.status, 0, res.stderr);
      if (res.stdout.trim()) thresholdOut = res.stdout.trim();
    }
    assert.ok(thresholdOut, 'threshold produced stdout');

    // Exactly one JSON object (single-output pattern), not two lines.
    assert.strictEqual(thresholdOut.split('\n').length, 1, 'exactly one stdout line');
    const parsed = JSON.parse(thresholdOut);

    // Both channels present in the SAME object: user-visible systemMessage
    // AND model-visible additionalContext (the arc-compacting indicator).
    assert.ok(parsed.systemMessage, 'user-visible systemMessage present');
    assert.ok(
      parsed.systemMessage.includes('arc-compacting'),
      'user line points at arc-compacting',
    );
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
    const modelLine = parsed.hookSpecificOutput.additionalContext;
    assert.ok(modelLine, 'model-visible additionalContext present');
    assert.ok(modelLine.includes('arc-compacting'), 'model line is the arc-compacting indicator');
  });

  it('records suggestions[] into the live session JSON', () => {
    const project = 'icl9-proj';
    const date = new Date().toISOString().split('T')[0];
    const sessionDir = path.join(homeDir, '.arcforge', 'sessions', project, date);
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, `session-${sessionId}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify({ sessionId: `session-${sessionId}` }));

    const projectDir = path.join(homeDir, project);
    fs.mkdirSync(projectDir, { recursive: true });
    const e = env({ CLAUDE_PROJECT_DIR: projectDir });

    for (let i = 0; i < 50; i++) runSuggester('Read', e);

    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    assert.ok(Array.isArray(session.suggestions), 'session JSON has suggestions[]');
    assert.strictEqual(session.suggestions.length, 1);
    assert.strictEqual(session.suggestions[0].count, 50);
  });

  it('second snapshot is write-heavy after a late write burst', () => {
    // 49 reads then a 51-event write burst (events 50..100). The 50-call
    // snapshot lands with a read-heavy rolling window; the 75-call reminder is
    // suppressed mid-write-burst; the 100-call snapshot lands write-heavy
    // (suppression lifts at >=100). So the 2nd recorded snapshot is write-heavy.
    for (let i = 0; i < 49; i++) runSuggester('Read');
    for (let i = 0; i < 51; i++) runSuggester('Edit'); // events 50..100
    const state = readState();
    assert.strictEqual(state.suggestions.length, 2, 'two snapshots (50 and 100)');
    assert.strictEqual(state.suggestions[0].count, 50);
    assert.strictEqual(state.suggestions[1].count, 100);
    assert.strictEqual(state.suggestions[1].phase, 'write-heavy', 'second snapshot write-heavy');
  });

  it('pre-compact reset clears suggestions; no stale suggestions after compaction', () => {
    // 60 events → first suggestion at 50, snapshot recorded.
    for (let i = 0; i < 60; i++) runSuggester('Read');
    let state = readState();
    assert.strictEqual(state.suggestions.length, 1, 'one snapshot before compaction');

    // Simulate pre-compact (resets the suggester state via the shared helper).
    const project = 'icl9-reset-proj';
    const projectDir = path.join(homeDir, project);
    fs.mkdirSync(projectDir, { recursive: true });
    const res = spawnSync('node', [PRE_COMPACT], {
      input: JSON.stringify({
        session_id: sessionId,
        hook_event_name: 'PreCompact',
        cwd: projectDir,
      }),
      encoding: 'utf-8',
      env: env({ CLAUDE_PROJECT_DIR: projectDir }),
    });
    assert.strictEqual(res.status, 0, res.stderr);
    assert.ok(!fs.existsSync(statePath()), 'suggester state file removed by pre-compact');

    // 30 more events → fresh start, no stale suggestions carried over.
    for (let i = 0; i < 30; i++) runSuggester('Read');
    state = readState();
    assert.strictEqual(state.tools, 30, 'counter restarted from zero');
    assert.strictEqual(state.suggestions.length, 0, 'no stale suggestions after compaction');
  });

  it('binding regression: diary threshold stays triggerable via shared tool-count', () => {
    // Drive 50 events and confirm the shared tool-count reaches the diary
    // threshold so the diary trigger remains firable after consolidation.
    for (let i = 0; i < 50; i++) runSuggester('Read');
    const { shouldTrigger, MIN_TOOL_CALLS } = require('../../scripts/lib/thresholds');
    const toolCount = parseInt(fs.readFileSync(toolCountPath(), 'utf-8'), 10);
    assert.strictEqual(toolCount, 50);
    assert.ok(toolCount >= MIN_TOOL_CALLS);
    assert.strictEqual(shouldTrigger(0, toolCount), true, 'diary threshold triggerable');
  });
});
