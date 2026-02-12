// tests/scripts/global-index.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  appendToIndex,
  readIndex,
  findCrossProjectPatterns,
  promoteToGlobal,
  checkBubbleUpForProject,
} = require('../../scripts/lib/global-index');

describe('global-index', () => {
  const testDir = path.join(os.tmpdir(), `global-index-test-${Date.now()}`);
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

  describe('checkBubbleUpForProject — semantic matching', () => {
    let mockHomeDir;
    let instinctsBase;

    beforeEach(() => {
      mockHomeDir = path.join(testDir, 'home');
      instinctsBase = path.join(mockHomeDir, '.claude', 'instincts');
      jest.spyOn(os, 'homedir').mockReturnValue(mockHomeDir);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    function writeInstinct(project, filename, { trigger, domain }) {
      const dir = path.join(instinctsBase, project);
      fs.mkdirSync(dir, { recursive: true });
      const content = `---
trigger: "${trigger}"
domain: ${domain}
confidence: 0.70
---

## Action
Do the thing
`;
      fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
    }

    it('detects semantic match: different filenames, similar triggers, same domain', () => {
      writeInstinct('project-a', 'search-before-editing.md', {
        trigger: 'grep search codebase before editing files',
        domain: 'code-quality',
      });
      writeInstinct('project-b', 'grep-then-edit.md', {
        trigger: 'grep search codebase before editing changes',
        domain: 'code-quality',
      });

      checkBubbleUpForProject('project-a');

      const globalDir = path.join(instinctsBase, 'global');
      expect(fs.existsSync(path.join(globalDir, 'search-before-editing.md'))).toBe(true);
    });

    it('does NOT match when domains differ despite similar triggers', () => {
      writeInstinct('project-a', 'search-first.md', {
        trigger: 'grep search codebase before editing files',
        domain: 'code-quality',
      });
      writeInstinct('project-b', 'search-first-ops.md', {
        trigger: 'grep search codebase before editing files',
        domain: 'operations',
      });

      checkBubbleUpForProject('project-a');

      const globalDir = path.join(instinctsBase, 'global');
      expect(fs.existsSync(globalDir)).toBe(false);
    });

    it('does NOT match when trigger fingerprint has fewer than 3 words', () => {
      writeInstinct('project-a', 'short-trigger.md', {
        trigger: 'run tests',
        domain: 'testing',
      });
      writeInstinct('project-b', 'also-short.md', {
        trigger: 'run tests',
        domain: 'testing',
      });

      checkBubbleUpForProject('project-a');

      const globalDir = path.join(instinctsBase, 'global');
      expect(fs.existsSync(globalDir)).toBe(false);
    });

    it('does NOT match when Jaccard similarity is below 0.6', () => {
      writeInstinct('project-a', 'pattern-alpha.md', {
        trigger: 'always review database migrations carefully before deploying',
        domain: 'deployment',
      });
      writeInstinct('project-b', 'pattern-beta.md', {
        trigger: 'check frontend accessibility standards compliance testing',
        domain: 'deployment',
      });

      checkBubbleUpForProject('project-a');

      const globalDir = path.join(instinctsBase, 'global');
      expect(fs.existsSync(globalDir)).toBe(false);
    });
  });
});
