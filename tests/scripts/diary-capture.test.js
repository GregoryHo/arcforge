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
  let savedSession;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-capture-home-'));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diary-capture-tmp-'));
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
  });

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

    it('spawns the enricher with ARCFORGE_SPAWNED=enricher when triggered', async () => {
      const { createSessionCounter } = require('../../scripts/lib/utils');
      const { runDiaryCapture } = require('../../scripts/lib/diary-capture');
      createSessionCounter('user-count').write(15);

      const result = runDiaryCapture({
        project: 'demo',
        date: '2026-06-14',
        sessionId: 'diary-capture-session',
      });
      expect(result.triggered).toBe(true);

      const marker = path.join(binDir, 'spawned.marker');
      const content = await waitForMarker(marker, 5000);
      expect(content).toBe('enricher');
    });
  });
});
