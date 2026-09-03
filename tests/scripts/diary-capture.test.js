// tests/scripts/diary-capture.test.js
//
// ICL-8: diary-capture.js is the shared diary-capture core + counter-ownership
// owner. These tests cover threshold gating, reset-on-trigger-only, the binding
// counter contract, the dual-path enricher spawn (PATH-stub claude), the
// stale-draft probe, and the suggester-state path helper.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('diary-capture', () => {
  let homeDir;
  let tmpDir;
  let projectRoot;
  let savedSession;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-capture-home-'));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-capture-tmp-'));
    // Consent is read from projectRoot, never from the runner's cwd — a temp
    // root keeps the gate's answer independent of local repo state.
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-capture-proj-'));
    jest.spyOn(os, 'homedir').mockReturnValue(homeDir);
    process.env.TMPDIR = tmpDir;
    savedSession = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'diary-capture-session';
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (savedSession === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = savedSession;
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  /** Turn the project-scope learning opt-in on for the temp projectRoot. */
  function enableLearning() {
    const configPath = path.join(projectRoot, '.arcforge', 'learning', 'config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ scope: 'project', enabled: true }));
  }

  describe('counter ownership', () => {
    it('readCounts reflects both counters', () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { readCounts } = require('../../scripts/lib/diary-capture');
      createSessionCounter('user-count').write(3);
      createSessionCounter('tool-count').write(7);
      expect(readCounts()).toEqual({ userCount: 3, toolCount: 7 });
    });

    it('resetCounters zeroes both counters', () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { resetCounters, readCounts } = require('../../scripts/lib/diary-capture');
      createSessionCounter('user-count').write(9);
      createSessionCounter('tool-count').write(60);
      resetCounters();
      expect(readCounts()).toEqual({ userCount: 0, toolCount: 0 });
    });

    it('binding contract: incrementSharedToolCount x50 -> readCounts 50 -> shouldTrigger', () => {
      const { incrementSharedToolCount, readCounts } = require('../../scripts/lib/diary-capture');
      const { shouldTrigger } = require('../../scripts/lib/thresholds');
      for (let i = 0; i < 50; i++) incrementSharedToolCount();
      const { toolCount } = readCounts();
      expect(toolCount).toBe(50);
      expect(shouldTrigger(0, toolCount)).toBe(true);
    });
  });

  describe('getSuggesterStatePath', () => {
    it('is session-scoped and lives under the temp dir', () => {
      const { getSuggesterStatePath } = require('../../scripts/lib/diary-capture');
      const p = getSuggesterStatePath();
      expect(p).toContain('arcforge-suggester-state-');
      expect(p).toContain('diary-capture-session');
    });
  });

  describe('draftIsStale', () => {
    it('returns true for an unenriched stub and false for an enriched draft', () => {
      const { draftIsStale } = require('../../scripts/lib/diary-capture');
      const stub = path.join(tmpDir, 'stub.md');
      const enriched = path.join(tmpDir, 'enriched.md');
      fs.writeFileSync(stub, '# Diary\n\n## Decisions\n<!-- TO BE ENRICHED -->\n');
      fs.writeFileSync(enriched, '# Diary\n\n## Decisions\n- shipped the fix\n');
      expect(draftIsStale(stub)).toBe(true);
      expect(draftIsStale(enriched)).toBe(false);
    });
  });

  // D-010's retention half: the opt-in decides how long verbatim prose may stay
  // in the session record, not only whether it is written there.
  describe('pruneUngatedProse', () => {
    it('deletes carried prose when the opt-in is off and reports no consent', () => {
      const { pruneUngatedProse } = require('../../scripts/lib/diary-capture');
      const session = { userMessageContent: ['a secret sentence'], toolsUsed: ['Edit'] };

      expect(pruneUngatedProse(session, { projectRoot })).toBe(false);
      expect(session.userMessageContent).toBeUndefined();
      expect(session.toolsUsed).toEqual(['Edit']);
    });

    it('leaves the record alone when the opt-in is on', () => {
      enableLearning();
      const { pruneUngatedProse } = require('../../scripts/lib/diary-capture');
      const session = { userMessageContent: ['a secret sentence'] };

      expect(pruneUngatedProse(session, { projectRoot })).toBe(true);
      expect(session.userMessageContent).toEqual(['a secret sentence']);
    });

    it('fails closed on a missing projectRoot and tolerates a null session', () => {
      const { pruneUngatedProse } = require('../../scripts/lib/diary-capture');

      expect(pruneUngatedProse(null)).toBe(false);
      const session = { userMessageContent: ['a secret sentence'] };
      expect(pruneUngatedProse(session, {})).toBe(false);
      expect(session.userMessageContent).toBeUndefined();
    });
  });

  describe('runDiaryCapture threshold gating', () => {
    it('does NOT trigger or reset below threshold', () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { runDiaryCapture, readCounts } = require('../../scripts/lib/diary-capture');
      createSessionCounter('user-count').write(1);
      createSessionCounter('tool-count').write(2);

      const result = runDiaryCapture({
        project: 'demo',
        date: '2026-06-14',
        sessionId: 'diary-capture-session',
        projectRoot,
      });

      expect(result.triggered).toBe(false);
      // Counters preserved (reset only on trigger).
      expect(readCounts()).toEqual({ userCount: 1, toolCount: 2 });
    });

    it('triggers above threshold, generates a draft, and resets counters', () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { runDiaryCapture, readCounts } = require('../../scripts/lib/diary-capture');
      createSessionCounter('user-count').write(15); // >= MIN_USER_MESSAGES (10)
      createSessionCounter('tool-count').write(3);

      const result = runDiaryCapture({
        project: 'demo',
        date: '2026-06-14',
        sessionId: 'diary-capture-session',
        projectRoot,
      });

      expect(result.triggered).toBe(true);
      expect(result.draftPath).toBeTruthy();
      expect(fs.existsSync(result.draftPath)).toBe(true);
      // Sole reset path fired.
      expect(readCounts()).toEqual({ userCount: 0, toolCount: 0 });
    });
  });

  describe('dual-path enricher spawn (PATH-stub claude)', () => {
    let binDir;
    let savedPath;

    beforeEach(() => {
      binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-capture-bin-'));
      savedPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
      // Stub `claude`: record ARCFORGE_SPAWNED to a marker so we can assert the
      // detached enricher actually ran with the relay-isolation env.
      const marker = path.join(binDir, 'spawned.marker');
      const stub = `#!/bin/sh\ncat > /dev/null\nprintf '%s' "$ARCFORGE_SPAWNED" > "${marker}"\n`;
      fs.writeFileSync(path.join(binDir, 'claude'), stub, { mode: 0o755 });
    });

    afterEach(() => {
      process.env.PATH = savedPath;
      fs.rmSync(binDir, { recursive: true, force: true });
    });

    async function waitForMarker(file, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8');
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    }

    it('spawns the enricher with ARCFORGE_SPAWNED=enricher when learning is on', async () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { runDiaryCapture } = require('../../scripts/lib/diary-capture');
      enableLearning();
      createSessionCounter('user-count').write(15);

      const result = runDiaryCapture({
        project: 'demo',
        date: '2026-06-14',
        sessionId: 'diary-capture-session',
        projectRoot,
      });
      expect(result.triggered).toBe(true);
      expect(result.enriched).toBe(true);

      const marker = path.join(binDir, 'spawned.marker');
      const content = await waitForMarker(marker, 5000);
      expect(content).toBe('enricher');
    });

    it('writes the draft but does NOT spawn the enricher when learning is off', async () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { runDiaryCapture } = require('../../scripts/lib/diary-capture');
      createSessionCounter('user-count').write(15);

      const result = runDiaryCapture({
        project: 'demo',
        date: '2026-06-14',
        sessionId: 'diary-capture-session',
        projectRoot,
      });

      // Continuity survives the gate; enrichment does not (D-009).
      expect(result.triggered).toBe(true);
      expect(result.draftPath).toBeTruthy();
      expect(fs.existsSync(result.draftPath)).toBe(true);
      expect(result.enriched).toBe(false);

      const marker = path.join(binDir, 'spawned.marker');
      expect(await waitForMarker(marker, 1000)).toBeNull();
    });

    it('fails closed when projectRoot is omitted — draft yes, enricher no', async () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { runDiaryCapture } = require('../../scripts/lib/diary-capture');
      // A GLOBAL opt-in answers true for any projectRoot, so nothing but the
      // fail-closed guard can stop the spawn here: if the gate ever falls back
      // to process.cwd() again, this test spawns and fails.
      const globalConfig = path.join(homeDir, '.arcforge', 'learning', 'config.json');
      fs.mkdirSync(path.dirname(globalConfig), { recursive: true });
      fs.writeFileSync(globalConfig, JSON.stringify({ scope: 'global', enabled: true }));
      createSessionCounter('user-count').write(15);

      const result = runDiaryCapture({
        project: 'demo',
        date: '2026-06-14',
        sessionId: 'diary-capture-session',
        // projectRoot deliberately omitted.
      });

      expect(result.triggered).toBe(true);
      expect(fs.existsSync(result.draftPath)).toBe(true);
      expect(result.enriched).toBe(false);
      expect(await waitForMarker(path.join(binDir, 'spawned.marker'), 1000)).toBeNull();
    });

    it('spawns the enricher on a GLOBAL-scope opt-in too', async () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { runDiaryCapture } = require('../../scripts/lib/diary-capture');
      const globalConfig = path.join(homeDir, '.arcforge', 'learning', 'config.json');
      fs.mkdirSync(path.dirname(globalConfig), { recursive: true });
      fs.writeFileSync(globalConfig, JSON.stringify({ scope: 'global', enabled: true }));
      createSessionCounter('user-count').write(15);

      const result = runDiaryCapture({
        project: 'demo',
        date: '2026-06-14',
        sessionId: 'diary-capture-session',
        projectRoot,
      });
      expect(result.enriched).toBe(true);

      const marker = path.join(binDir, 'spawned.marker');
      expect(await waitForMarker(marker, 5000)).toBe('enricher');
    });
  });

  describe('enricher permissions (D-009)', () => {
    let binDir;
    let savedPath;

    beforeEach(() => {
      binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-capture-argv-'));
      savedPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
      // Stub `claude` so the REAL argv the enricher spawns with is recorded,
      // one argument per line (paths contain no newlines). The lines go to a
      // temp file and are renamed into place, so the poller below can never
      // read a half-written argv and miss a flag that is simply not there yet.
      const argvFile = path.join(binDir, 'argv.txt');
      fs.writeFileSync(
        path.join(binDir, 'claude'),
        `#!/bin/sh\ncat > /dev/null\nfor a in "$@"; do printf '%s\\n' "$a"; done > "${argvFile}.tmp"\nmv "${argvFile}.tmp" "${argvFile}"\n`,
        { mode: 0o755 },
      );
    });

    afterEach(() => {
      process.env.PATH = savedPath;
      fs.rmSync(binDir, { recursive: true, force: true });
    });

    async function recordedArgv(timeoutMs) {
      const file = path.join(binDir, 'argv.txt');
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (fs.existsSync(file)) {
          const lines = fs.readFileSync(file, 'utf-8').split('\n');
          lines.pop();
          if (lines.length > 0) return lines;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    }

    it('drops --dangerously-skip-permissions and adds the draft dir with acceptEdits', async () => {
      const { spawnDiaryEnricher } = require('../../scripts/lib/diary-capture');
      const draftPath = path.join(homeDir, '.arcforge', 'diaries', 'demo', '2026-06-14', 'd.md');
      fs.mkdirSync(path.dirname(draftPath), { recursive: true });

      spawnDiaryEnricher(draftPath, { userMessages: [] }, 'demo');
      const argv = await recordedArgv(5000);
      expect(argv).not.toBeNull();

      expect(argv).not.toContain('--dangerously-skip-permissions');
      expect(argv[argv.indexOf('--add-dir') + 1]).toBe(path.dirname(draftPath));
      expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
      expect(argv[argv.indexOf('--tools') + 1]).toBe('Read,Write');
    });
  });
});
