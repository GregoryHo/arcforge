// tests/scripts/global-index.test.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  appendToIndex,
  readIndex,
  findCrossProjectPatterns,
  isAlreadyGlobal,
  promoteToGlobal
} = require('../../scripts/lib/global-index');

describe('global-index', () => {
  const testDir = path.join(os.tmpdir(), 'global-index-test-' + Date.now());
  const indexPath = path.join(testDir, 'global-index.jsonl');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('appendToIndex', () => {
    it('creates index file and appends entry', () => {
      appendToIndex(indexPath, 'grep-before-edit', 'project-a', 0.7, 'instinct');

      const content = fs.readFileSync(indexPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.id).toBe('grep-before-edit');
      expect(entry.project).toBe('project-a');
      expect(entry.confidence).toBe(0.7);
      expect(entry.type).toBe('instinct');
      expect(entry.timestamp).toBeDefined();
    });

    it('appends multiple entries', () => {
      appendToIndex(indexPath, 'pattern-a', 'proj-1', 0.5, 'learned');
      appendToIndex(indexPath, 'pattern-b', 'proj-2', 0.6, 'learned');

      const entries = readIndex(indexPath);
      expect(entries).toHaveLength(2);
    });
  });

  describe('readIndex', () => {
    it('returns empty for non-existent file', () => {
      expect(readIndex('/nonexistent/path')).toEqual([]);
    });

    it('reads and parses JSONL entries', () => {
      appendToIndex(indexPath, 'test', 'proj', 0.5, 'instinct');
      const entries = readIndex(indexPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('test');
    });
  });

  describe('findCrossProjectPatterns', () => {
    it('finds patterns in 2+ projects', () => {
      appendToIndex(indexPath, 'common-pattern', 'project-a', 0.7, 'instinct');
      appendToIndex(indexPath, 'common-pattern', 'project-b', 0.6, 'instinct');
      appendToIndex(indexPath, 'unique-pattern', 'project-a', 0.5, 'instinct');

      const cross = findCrossProjectPatterns(indexPath, 2);
      expect(cross).toHaveLength(1);
      expect(cross[0].id).toBe('common-pattern');
      expect(cross[0].count).toBe(2);
      expect(cross[0].projects).toContain('project-a');
      expect(cross[0].projects).toContain('project-b');
    });

    it('returns empty when no cross-project patterns', () => {
      appendToIndex(indexPath, 'a', 'proj-1', 0.5, 'instinct');
      appendToIndex(indexPath, 'b', 'proj-2', 0.5, 'instinct');

      const cross = findCrossProjectPatterns(indexPath, 2);
      expect(cross).toHaveLength(0);
    });

    it('respects minProjects threshold', () => {
      appendToIndex(indexPath, 'wide-pattern', 'proj-1', 0.5, 'learned');
      appendToIndex(indexPath, 'wide-pattern', 'proj-2', 0.5, 'learned');
      appendToIndex(indexPath, 'wide-pattern', 'proj-3', 0.5, 'learned');

      const cross2 = findCrossProjectPatterns(indexPath, 2);
      expect(cross2).toHaveLength(1);

      const cross3 = findCrossProjectPatterns(indexPath, 3);
      expect(cross3).toHaveLength(1);

      const cross4 = findCrossProjectPatterns(indexPath, 4);
      expect(cross4).toHaveLength(0);
    });
  });

  describe('promoteToGlobal', () => {
    it('copies file to global directory', () => {
      const sourceDir = path.join(testDir, 'source');
      const globalDir = path.join(testDir, 'global');
      fs.mkdirSync(sourceDir, { recursive: true });

      const sourcePath = path.join(sourceDir, 'test-pattern.md');
      fs.writeFileSync(sourcePath, '# Test Pattern\n', 'utf-8');

      const result = promoteToGlobal(sourcePath, globalDir, indexPath);

      expect(result).not.toBeNull();
      expect(fs.existsSync(path.join(globalDir, 'test-pattern.md'))).toBe(true);
    });

    it('does not overwrite existing global file', () => {
      const sourceDir = path.join(testDir, 'source');
      const globalDir = path.join(testDir, 'global');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(globalDir, { recursive: true });

      const sourcePath = path.join(sourceDir, 'existing.md');
      fs.writeFileSync(sourcePath, '# New\n', 'utf-8');
      fs.writeFileSync(path.join(globalDir, 'existing.md'), '# Old\n', 'utf-8');

      const result = promoteToGlobal(sourcePath, globalDir, indexPath);

      expect(result).toBeNull();
      // Old content preserved
      const content = fs.readFileSync(path.join(globalDir, 'existing.md'), 'utf-8');
      expect(content).toBe('# Old\n');
    });

    it('appends promotion entry to index', () => {
      const sourceDir = path.join(testDir, 'source');
      const globalDir = path.join(testDir, 'global');
      fs.mkdirSync(sourceDir, { recursive: true });

      const sourcePath = path.join(sourceDir, 'promoted.md');
      fs.writeFileSync(sourcePath, '# Promoted\n', 'utf-8');

      promoteToGlobal(sourcePath, globalDir, indexPath);

      const entries = readIndex(indexPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].promoted).toBeDefined();
    });
  });
});
