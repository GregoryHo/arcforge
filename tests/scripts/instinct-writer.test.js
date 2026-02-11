// tests/scripts/instinct-writer.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Mock session-utils to redirect paths to temp directories
// Variables prefixed with "mock" are allowed in jest.mock() factories
let mockProjectInstinctsDir;
let mockGlobalInstinctsDir;
let mockGlobalIndexPath;

jest.mock('../../scripts/lib/session-utils', () => ({
  getInstinctsDir: () => mockProjectInstinctsDir,
  getGlobalInstinctsDir: () => mockGlobalInstinctsDir,
  getInstinctsGlobalIndex: () => mockGlobalIndexPath,
}));

const { saveInstinct, checkInstinctDuplicate } = require('../../scripts/lib/instinct-writer');
const { readIndex } = require('../../scripts/lib/global-index');
const {
  parseConfidenceFrontmatter,
  INITIAL,
  MAX_CONFIDENCE,
} = require('../../scripts/lib/confidence');

describe('instinct-writer', () => {
  const testDir = path.join(os.tmpdir(), `instinct-writer-test-${Date.now()}`);

  beforeEach(() => {
    mockProjectInstinctsDir = path.join(testDir, 'instincts', 'test-project');
    mockGlobalInstinctsDir = path.join(testDir, 'instincts', 'global');
    mockGlobalIndexPath = path.join(testDir, 'instincts', 'global-index.jsonl');
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('saveInstinct', () => {
    it('writes correct frontmatter and body', () => {
      const result = saveInstinct({
        id: 'grep-before-edit',
        trigger: 'when editing files',
        action: 'search for existing patterns first',
        project: 'test-project',
        domain: 'workflow',
        source: 'observation',
        evidence: 'saw this 3 times in session',
      });

      expect(result.path).toContain('grep-before-edit.md');
      expect(result.isNew).toBe(true);
      expect(result.confidence).toBe(INITIAL);

      const content = fs.readFileSync(result.path, 'utf-8');
      const { frontmatter, body } = parseConfidenceFrontmatter(content);

      expect(frontmatter.id).toBe('grep-before-edit');
      expect(frontmatter.trigger).toBe('when editing files');
      expect(frontmatter.action).toBe('search for existing patterns first');
      expect(frontmatter.domain).toBe('workflow');
      expect(frontmatter.source).toBe('observation');
      expect(frontmatter.confidence).toBe(INITIAL);
      expect(frontmatter.confirmations).toBe(0);
      expect(frontmatter.contradictions).toBe(0);
      expect(frontmatter.evidence).toBe('saw this 3 times in session');
      expect(frontmatter.extracted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(frontmatter.last_confirmed).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Body structure
      expect(body).toContain('# Grep Before Edit');
      expect(body).toContain('## Trigger');
      expect(body).toContain('when editing files');
      expect(body).toContain('## Action');
      expect(body).toContain('search for existing patterns first');
    });

    it('uses default values for optional fields', () => {
      const result = saveInstinct({
        id: 'basic-instinct',
        trigger: 'always',
        action: 'do the thing',
        project: 'test-project',
      });

      const content = fs.readFileSync(result.path, 'utf-8');
      const { frontmatter } = parseConfidenceFrontmatter(content);

      expect(frontmatter.domain).toBe('general');
      expect(frontmatter.source).toBe('manual');
      expect(frontmatter.evidence).toBe('');
    });

    it('caps confidence at maxConfidence', () => {
      const result = saveInstinct({
        id: 'high-evidence',
        trigger: 'when coding',
        action: 'test first',
        project: 'test-project',
        maxConfidence: 0.85,
        evidenceCount: 10,
      });

      // INITIAL(0.5) + 0.05 * 10 = 1.0, capped at 0.85
      expect(result.confidence).toBe(0.85);

      const content = fs.readFileSync(result.path, 'utf-8');
      const { frontmatter } = parseConfidenceFrontmatter(content);
      expect(frontmatter.confidence).toBeCloseTo(0.85, 2);
    });

    it('increases confidence based on evidenceCount', () => {
      const result = saveInstinct({
        id: 'moderate-evidence',
        trigger: 'when reviewing',
        action: 'check imports',
        project: 'test-project',
        evidenceCount: 2,
      });

      // INITIAL(0.5) + 0.05 * 2 = 0.6
      expect(result.confidence).toBeCloseTo(0.6, 5);
    });

    it('caps at MAX_CONFIDENCE when no maxConfidence provided', () => {
      const result = saveInstinct({
        id: 'lots-of-evidence',
        trigger: 'always',
        action: 'do it',
        project: 'test-project',
        evidenceCount: 20,
      });

      // INITIAL(0.5) + 0.05 * 20 = 1.5, capped at MAX_CONFIDENCE(0.9)
      expect(result.confidence).toBe(MAX_CONFIDENCE);
    });

    it('returns isNew: true on first save', () => {
      const result = saveInstinct({
        id: 'new-pattern',
        trigger: 'when starting',
        action: 'read docs',
        project: 'test-project',
      });

      expect(result.isNew).toBe(true);
    });

    it('returns isNew: false when file already exists', () => {
      // First save
      saveInstinct({
        id: 'existing-pattern',
        trigger: 'when starting',
        action: 'read docs',
        project: 'test-project',
      });

      // Second save (overwrite)
      const result = saveInstinct({
        id: 'existing-pattern',
        trigger: 'when starting',
        action: 'read docs v2',
        project: 'test-project',
      });

      expect(result.isNew).toBe(false);
    });

    it('appends entry to global index', () => {
      saveInstinct({
        id: 'indexed-pattern',
        trigger: 'when testing',
        action: 'mock first',
        project: 'test-project',
        evidenceCount: 1,
      });

      const entries = readIndex(mockGlobalIndexPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('indexed-pattern');
      expect(entries[0].project).toBe('test-project');
      expect(entries[0].confidence).toBeCloseTo(0.55, 5);
      expect(entries[0].type).toBe('instinct');
      expect(entries[0].timestamp).toBeDefined();
    });

    it('appends multiple entries on multiple saves', () => {
      saveInstinct({
        id: 'pattern-a',
        trigger: 'a',
        action: 'do a',
        project: 'test-project',
      });

      saveInstinct({
        id: 'pattern-b',
        trigger: 'b',
        action: 'do b',
        project: 'test-project',
      });

      const entries = readIndex(mockGlobalIndexPath);
      expect(entries).toHaveLength(2);
    });

    it('throws on invalid filename with path traversal', () => {
      expect(() => {
        saveInstinct({
          id: 'secret..hidden',
          trigger: 'malicious',
          action: 'attack',
          project: 'test-project',
        });
      }).toThrow(/parent directory traversal not allowed/);
    });

    it('throws on filename with path separators', () => {
      expect(() => {
        saveInstinct({
          id: 'foo/bar',
          trigger: 'malicious',
          action: 'attack',
          project: 'test-project',
        });
      }).toThrow(/path separators not allowed/);
    });

    it('throws on empty filename', () => {
      expect(() => {
        saveInstinct({
          id: '',
          trigger: 'empty',
          action: 'nothing',
          project: 'test-project',
        });
      }).toThrow(/non-empty string/);
    });

    it('title-cases id with hyphens for heading', () => {
      const result = saveInstinct({
        id: 'my-cool-pattern',
        trigger: 'always',
        action: 'be cool',
        project: 'test-project',
      });

      const content = fs.readFileSync(result.path, 'utf-8');
      expect(content).toContain('# My Cool Pattern');
    });
  });

  describe('checkInstinctDuplicate', () => {
    it('returns unique when no matching file exists', () => {
      const result = checkInstinctDuplicate('nonexistent', 'test-project');
      expect(result).toBe('unique');
    });

    it('detects duplicate in project directory', () => {
      // Create the project instinct file
      fs.mkdirSync(mockProjectInstinctsDir, { recursive: true });
      const filePath = path.join(mockProjectInstinctsDir, 'existing-pattern.md');
      fs.writeFileSync(filePath, '---\nid: existing-pattern\n---\n# Existing\n', 'utf-8');

      const result = checkInstinctDuplicate('existing-pattern', 'test-project');
      expect(result).toMatch(/^duplicate\|project\|/);
      expect(result).toContain('existing-pattern.md');
    });

    it('detects duplicate in global directory', () => {
      // Create the global instinct file
      fs.mkdirSync(mockGlobalInstinctsDir, { recursive: true });
      const filePath = path.join(mockGlobalInstinctsDir, 'global-pattern.md');
      fs.writeFileSync(filePath, '---\nid: global-pattern\n---\n# Global\n', 'utf-8');

      const result = checkInstinctDuplicate('global-pattern', 'test-project');
      expect(result).toMatch(/^duplicate\|global\|/);
      expect(result).toContain('global-pattern.md');
    });

    it('prefers project duplicate over global', () => {
      // Create both project and global files with same name
      fs.mkdirSync(mockProjectInstinctsDir, { recursive: true });
      fs.mkdirSync(mockGlobalInstinctsDir, { recursive: true });

      fs.writeFileSync(
        path.join(mockProjectInstinctsDir, 'both-places.md'),
        '# Project copy\n',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(mockGlobalInstinctsDir, 'both-places.md'),
        '# Global copy\n',
        'utf-8',
      );

      const result = checkInstinctDuplicate('both-places', 'test-project');
      expect(result).toMatch(/^duplicate\|project\|/);
    });

    it('throws on invalid id with path traversal', () => {
      expect(() => {
        checkInstinctDuplicate('secret..hidden', 'test-project');
      }).toThrow(/parent directory traversal not allowed/);
    });

    it('throws on invalid id with path separators', () => {
      expect(() => {
        checkInstinctDuplicate('foo/bar', 'test-project');
      }).toThrow(/path separators not allowed/);
    });
  });
});
