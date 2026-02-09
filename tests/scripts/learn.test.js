// tests/scripts/learn.test.js

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock session-utils paths
let mockInstinctsDir;
let mockGlobalInstinctsDir;

jest.mock('../../scripts/lib/session-utils', () => ({
  getInstinctsDir: jest.fn(() => mockInstinctsDir),
  getGlobalInstinctsDir: jest.fn(() => mockGlobalInstinctsDir)
}));

const { loadInstincts, clusterInstincts, parseArgs } = require('../../skills/arc-learning/scripts/learn');

describe('learn.js (instinct clustering)', () => {
  const testDir = path.join(os.tmpdir(), 'learn-test-' + Date.now());

  beforeEach(() => {
    mockInstinctsDir = path.join(testDir, 'instincts');
    mockGlobalInstinctsDir = path.join(testDir, 'global');
    fs.mkdirSync(mockInstinctsDir, { recursive: true });
    fs.mkdirSync(mockGlobalInstinctsDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function writeInstinct(dir, id, { confidence = 0.7, domain = 'testing', trigger = '' } = {}) {
    const content = `---
id: ${id}
confidence: ${confidence.toFixed(2)}
domain: ${domain}
trigger: ${trigger}
---

## Action
Do the thing for ${id}
`;
    fs.writeFileSync(path.join(dir, `${id}.md`), content, 'utf-8');
  }

  describe('loadInstincts', () => {
    it('returns empty array for non-existent directory', () => {
      expect(loadInstincts('/nonexistent')).toEqual([]);
    });

    it('loads instinct files with frontmatter', () => {
      writeInstinct(mockInstinctsDir, 'test-1', { confidence: 0.7, domain: 'testing' });
      const result = loadInstincts(mockInstinctsDir);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test-1');
      expect(result[0].confidence).toBe(0.7);
      expect(result[0].domain).toBe('testing');
    });

    it('skips files without confidence', () => {
      fs.writeFileSync(path.join(mockInstinctsDir, 'no-conf.md'), '# Just text\n', 'utf-8');
      const result = loadInstincts(mockInstinctsDir);
      expect(result).toHaveLength(0);
    });
  });

  describe('clusterInstincts', () => {
    it('returns empty for fewer than 3 instincts in any domain', () => {
      const instincts = [
        { id: 'a', domain: 'testing', confidence: 0.7, trigger: 'when testing' },
        { id: 'b', domain: 'testing', confidence: 0.7, trigger: 'when testing more' }
      ];
      expect(clusterInstincts(instincts)).toEqual([]);
    });

    it('clusters 3+ instincts in the same domain', () => {
      const instincts = [
        { id: 'a', domain: 'testing', confidence: 0.7, trigger: 'when running tests' },
        { id: 'b', domain: 'testing', confidence: 0.8, trigger: 'when executing tests' },
        { id: 'c', domain: 'testing', confidence: 0.6, trigger: 'when checking tests' }
      ];
      const clusters = clusterInstincts(instincts);
      expect(clusters.length).toBeGreaterThanOrEqual(1);
      expect(clusters[0].domain).toBe('testing');
    });

    it('requires at least 1 instinct with confidence >= 0.6', () => {
      const instincts = [
        { id: 'a', domain: 'testing', confidence: 0.3, trigger: 'low conf 1' },
        { id: 'b', domain: 'testing', confidence: 0.2, trigger: 'low conf 2' },
        { id: 'c', domain: 'testing', confidence: 0.1, trigger: 'low conf 3' }
      ];
      expect(clusterInstincts(instincts)).toEqual([]);
    });

    it('separates different domains', () => {
      const instincts = [
        { id: 'a', domain: 'testing', confidence: 0.7, trigger: 'test 1' },
        { id: 'b', domain: 'testing', confidence: 0.7, trigger: 'test 2' },
        { id: 'c', domain: 'testing', confidence: 0.7, trigger: 'test 3' },
        { id: 'd', domain: 'debug', confidence: 0.7, trigger: 'debug 1' },
        { id: 'e', domain: 'debug', confidence: 0.7, trigger: 'debug 2' }
      ];
      const clusters = clusterInstincts(instincts);
      // Only testing should cluster (3+), debug only has 2
      const domains = clusters.map(c => c.domain);
      expect(domains).toContain('testing');
      expect(domains).not.toContain('debug');
    });
  });

  describe('parseArgs', () => {
    it('parses scan command with project', () => {
      const result = parseArgs(['node', 'learn.js', 'scan', '--project', 'myproj']);
      expect(result.command).toBe('scan');
      expect(result.flags.project).toBe('myproj');
    });

    it('parses preview command', () => {
      const result = parseArgs(['node', 'learn.js', 'preview']);
      expect(result.command).toBe('preview');
    });

    it('handles no arguments', () => {
      const result = parseArgs(['node', 'learn.js']);
      expect(result.command).toBeUndefined();
    });
  });
});
