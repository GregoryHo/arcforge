// tests/scripts/auto-diary.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  generateDraft,
  getDraftPath,
  summarizeObservations,
  parseArgs,
} = require('../../skills/arc-journaling/scripts/auto-diary');

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
  });

  describe('getDraftPath', () => {
    it('returns correct draft path', () => {
      const draftPath = getDraftPath('my-project', '2026-02-08', 'abc123');
      expect(draftPath).toContain('sessions');
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
