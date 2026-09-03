// tests/scripts/auto-diary.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  generateDraft,
  getDraftPath,
  summarizeObservations,
  parseArgs,
} = require('../../scripts/lib/auto-diary');
const { getSessionDir } = require('../../scripts/lib/utils');
const { getObservationsPath } = require('../../scripts/lib/session-utils');

describe('auto-diary', () => {
  const testDir = path.join(os.tmpdir(), `auto-diary-test-${Date.now()}`);
  const originalHome = process.env.HOME;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    process.env.HOME = originalHome;
  });

  describe('parseArgs', () => {
    it('parses generate command with flags', () => {
      const { command, flags } = parseArgs([
        'node',
        'auto-diary.js',
        'generate',
        '--project',
        'my-api',
        '--date',
        '2026-02-08',
        '--session',
        'abc123',
      ]);
      expect(command).toBe('generate');
      expect(flags.project).toBe('my-api');
      expect(flags.date).toBe('2026-02-08');
      expect(flags.session).toBe('abc123');
    });

    it('parses finalize command', () => {
      const { command } = parseArgs([
        'node',
        'auto-diary.js',
        'finalize',
        '--project',
        'x',
        '--date',
        'y',
        '--session',
        'z',
      ]);
      expect(command).toBe('finalize');
    });
  });

  describe('generateDraft', () => {
    it('generates draft with template sections', () => {
      const draft = generateDraft('test-project', '2026-02-08', 'test-session');

      expect(draft).toContain('# Session Diary: test-project');
      expect(draft).toContain('**Date:** 2026-02-08');
      expect(draft).toContain('**Session ID:** test-session');
      expect(draft).toContain('## Decisions Made');
      expect(draft).toContain('## User Preferences Observed');
      expect(draft).toContain('## What Worked Well');
      expect(draft).toContain('## Challenges & Solutions');
      expect(draft).toContain('## Context for Next Session');
      expect(draft).toContain('<!-- TO BE ENRICHED');
      expect(draft).toContain('**Generalizable?**');
    });

    it('includes session metrics section', () => {
      const draft = generateDraft('test-project', '2026-02-08', 'test-session');
      expect(draft).toContain('## Session Metrics');
    });

    it('includes draft timestamp', () => {
      const draft = generateDraft('test-project', '2026-02-08', 'test-session');
      expect(draft).toContain('_Draft generated at');
    });

    // The always-on draft carries more than counts: the file paths the session
    // touched, and a tool-usage aggregate when observations already exist.
    // product/specs/hooks.md B-6 documents both — these pin them.
    describe('what the always-on draft actually renders (hooks B-6)', () => {
      const project = 'draft-content-project';
      const date = '2026-02-08';
      const sessionId = 'sess-1';
      const originalArcforgeHome = process.env.ARCFORGE_HOME;

      beforeEach(() => {
        // getArcforgeHome() reads ARCFORGE_HOME first — without this an
        // inherited value would point these tests at a real diary store.
        process.env.ARCFORGE_HOME = path.join(testDir, 'arcforge-home');
        const sessionDir = getSessionDir(project, date);
        fs.mkdirSync(sessionDir, { recursive: true });
        fs.writeFileSync(
          path.join(sessionDir, `${sessionId}.json`),
          JSON.stringify({
            started: '2026-02-08T10:00:00.000Z',
            lastUpdated: '2026-02-08T10:30:00.000Z',
            toolCalls: 5,
            userMessages: 2,
            compactions: [],
            filesModified: ['src/billing.ts', 'notes/private.md'],
          }),
        );
      });

      afterEach(() => {
        if (originalArcforgeHome === undefined) delete process.env.ARCFORGE_HOME;
        else process.env.ARCFORGE_HOME = originalArcforgeHome;
      });

      it('renders the modified-file paths from the session record', () => {
        const draft = generateDraft(project, date, sessionId);
        expect(draft).toContain('**Files modified**:');
        expect(draft).toContain('src/billing.ts');
        expect(draft).toContain('notes/private.md');
      });

      it('includes the tool-usage aggregate only when an observations log exists', () => {
        expect(generateDraft(project, date, sessionId)).not.toContain('## Tool Usage Summary');

        const obsPath = getObservationsPath(project);
        fs.mkdirSync(path.dirname(obsPath), { recursive: true });
        fs.writeFileSync(
          obsPath,
          `${[
            JSON.stringify({ event: 'tool_start', tool: 'Read' }),
            JSON.stringify({ event: 'tool_start', tool: 'Edit' }),
          ].join('\n')}\n`,
        );

        const withObservations = generateDraft(project, date, sessionId);
        expect(withObservations).toContain('## Tool Usage Summary');
        expect(withObservations).toContain('**Most used**:');
      });
    });
  });

  describe('getDraftPath', () => {
    it('returns correct draft path', () => {
      const draftPath = getDraftPath('my-project', '2026-02-08', 'abc123');
      expect(draftPath).toContain('diaries');
      expect(draftPath).toContain('my-project');
      expect(draftPath).toContain('2026-02-08');
      expect(draftPath).toContain('diary-abc123-draft.md');
    });
  });

  describe('summarizeObservations', () => {
    it('returns null for non-existent project', () => {
      const result = summarizeObservations('nonexistent-project-xyz');
      expect(result).toBeNull();
    });
  });
});
