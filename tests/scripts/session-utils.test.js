// tests/scripts/session-utils.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  getDiaryPath,
  saveDiary,
  getProcessedLogPath,
  parseProcessedLog,
  updateProcessedLog,
  generateHandover,
} = require('../../scripts/lib/session-utils');

describe('session-utils', () => {
  const testDir = path.join(os.tmpdir(), `session-utils-test-${Date.now()}`);
  const originalHome = process.env.HOME;

  beforeAll(() => {
    // Create test directory structure
    fs.mkdirSync(testDir, { recursive: true });
    // Override HOME to use test directory
    process.env.HOME = testDir;
  });

  afterAll(() => {
    // Restore HOME
    process.env.HOME = originalHome;
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('getDiaryPath', () => {
    it('returns correct path structure', () => {
      const result = getDiaryPath('my-project', '2026-01-15', 'abc123');
      expect(result).toContain('.arcforge');
      expect(result).toContain('diaries');
      expect(result).toContain('my-project');
      expect(result).toContain('2026-01-15');
      expect(result).toContain('diary-abc123.md');
    });
  });

  describe('getProcessedLogPath', () => {
    it('returns project-specific path when project provided', () => {
      const result = getProcessedLogPath('my-project');
      expect(result).toContain('diaryed');
      expect(result).toContain('my-project');
      expect(result).toContain('processed.log');
    });

    it('returns global path when no project', () => {
      const result = getProcessedLogPath(null);
      expect(result).toContain('diaryed');
      expect(result).toContain('global');
      expect(result).toContain('processed.log');
    });
  });

  describe('saveDiary', () => {
    it('creates directories and saves content', () => {
      const diaryPath = path.join(
        testDir,
        '.arcforge',
        'diaries',
        'test-project',
        '2026-01-15',
        'diary-test.md',
      );
      const content = '# Test Diary\n\nContent here';

      const result = saveDiary(diaryPath, content);

      expect(result).toBe(true);
      expect(fs.existsSync(diaryPath)).toBe(true);
      expect(fs.readFileSync(diaryPath, 'utf-8')).toBe(content);
    });
  });

  describe('parseProcessedLog', () => {
    it('returns empty set for non-existent file', () => {
      const result = parseProcessedLog('/nonexistent/path/processed.log');
      expect(result.size).toBe(0);
    });

    it('parses log entries correctly', () => {
      const logDir = path.join(testDir, 'test-log');
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, 'processed.log');
      fs.writeFileSync(
        logPath,
        '# Comment\ndiary-abc.md | 2026-01-15 | reflection-1.md\ndiary-def.md | 2026-01-16 | reflection-2.md\n',
      );

      const result = parseProcessedLog(logPath);

      expect(result.size).toBe(2);
      expect(result.has('diary-abc.md')).toBe(true);
      expect(result.has('diary-def.md')).toBe(true);
    });
  });

  describe('updateProcessedLog', () => {
    it('appends entries to log', () => {
      const logDir = path.join(testDir, 'update-log-test');
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, 'processed.log');

      updateProcessedLog(logPath, ['diary-new.md'], 'reflection-1.md');

      const content = fs.readFileSync(logPath, 'utf-8');
      expect(content).toContain('diary-new.md');
      expect(content).toContain('reflection-1.md');
    });
  });

  describe('generateHandover', () => {
    const baseOpts = {
      date: '2026-05-14',
      sessionId: 'session-abc123',
      cwd: '/Users/test/project',
    };

    it('emits only required sections when only nextStep provided', () => {
      const out = generateHandover({
        ...baseOpts,
        nextStep: 'Continue editing X',
      });

      expect(out).toContain('# Handover: continue from where we left off');
      expect(out).toContain('**From:** 2026-05-14 / session-abc123');
      expect(out).toContain('**Cwd:** /Users/test/project');
      expect(out).toContain('## What to do next');
      expect(out).toContain('Continue editing X');
      expect(out).not.toContain('## Context');
      expect(out).not.toContain('## Pointers');
      expect(out).not.toContain("## Don't redo");
      expect(out).not.toContain('TO BE ENRICHED');
    });

    it('uses focus in title and renders all four sections when full opts provided', () => {
      const out = generateHandover({
        ...baseOpts,
        focus: 'phases 4-5 of runtime plan',
        nextStep: 'Continue at docs/plans/X.md from Phase 4',
        context: 'Plan has 5 phases; 1-3 done.',
        pointers: 'docs/plans/X.md:80-160',
        dontRedo: 'Phase 3 tried Z; abandoned for W.',
        branch: 'feat/runtime-plan',
      });

      expect(out).toContain('# Handover: phases 4-5 of runtime plan');
      expect(out).toContain('**Branch:** feat/runtime-plan');
      expect(out).toContain('## What to do next');
      expect(out).toContain('## Context');
      expect(out).toContain('## Pointers');
      expect(out).toContain("## Don't redo");
      // Order: What to do next → Context → Pointers → Don't redo
      const order = [
        out.indexOf('## What to do next'),
        out.indexOf('## Context'),
        out.indexOf('## Pointers'),
        out.indexOf("## Don't redo"),
      ];
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('omits the Branch line when branch is null', () => {
      const out = generateHandover({
        ...baseOpts,
        nextStep: 'do thing',
        branch: null,
      });

      expect(out).not.toContain('**Branch:**');
      expect(out).toContain('**Cwd:**');
    });

    it('throws when nextStep is missing', () => {
      expect(() => generateHandover({ ...baseOpts, focus: 'x' })).toThrow(/next.?step/i);
    });
  });
});
