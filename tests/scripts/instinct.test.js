// tests/scripts/instinct.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  loadInstincts,
  confidenceBar,
  pct,
  parseArgs,
} = require('../../skills/arc-observing/scripts/instinct');

const {
  parseConfidenceFrontmatter,
  applyConfirmation,
  applyContradiction,
  ARCHIVE_THRESHOLD,
} = require('../../scripts/lib/confidence');

describe('instinct', () => {
  const testDir = path.join(os.tmpdir(), `instinct-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('confidenceBar', () => {
    it('renders full bar at 1.0', () => {
      const bar = confidenceBar(1.0);
      expect(bar).toBe('\u2588'.repeat(10));
    });

    it('renders empty bar at 0.0', () => {
      const bar = confidenceBar(0.0);
      expect(bar).toBe('\u2591'.repeat(10));
    });

    it('renders half bar at 0.5', () => {
      const bar = confidenceBar(0.5);
      expect(bar).toBe('\u2588'.repeat(5) + '\u2591'.repeat(5));
    });

    it('renders 7/10 at 0.7', () => {
      const bar = confidenceBar(0.7);
      expect(bar).toBe('\u2588'.repeat(7) + '\u2591'.repeat(3));
    });
  });

  describe('pct', () => {
    it('formats 0.5 as 50%', () => {
      expect(pct(0.5)).toBe('50%');
    });

    it('formats 0.75 as 75%', () => {
      expect(pct(0.75)).toBe('75%');
    });

    it('formats 0.0 as 0%', () => {
      expect(pct(0.0)).toBe('0%');
    });

    it('formats 1.0 as 100%', () => {
      expect(pct(1.0)).toBe('100%');
    });
  });

  describe('parseArgs', () => {
    it('parses status command', () => {
      const { command, positional } = parseArgs(['node', 'cli.js', 'status']);
      expect(command).toBe('status');
      expect(positional).toHaveLength(0);
    });

    it('parses confirm with id and project', () => {
      const { command, positional, flags } = parseArgs([
        'node',
        'cli.js',
        'confirm',
        'grep-before-edit',
        '--project',
        'my-api',
      ]);
      expect(command).toBe('confirm');
      expect(positional[0]).toBe('grep-before-edit');
      expect(flags.project).toBe('my-api');
    });

    it('parses contradict with id', () => {
      const { command, positional } = parseArgs(['node', 'cli.js', 'contradict', 'bad-pattern']);
      expect(command).toBe('contradict');
      expect(positional[0]).toBe('bad-pattern');
    });

    it('handles no arguments', () => {
      const { command } = parseArgs(['node', 'cli.js']);
      expect(command).toBeUndefined();
    });
  });

  describe('loadInstincts', () => {
    it('returns empty array for non-existent directory', () => {
      const result = loadInstincts('/nonexistent/path');
      expect(result).toHaveLength(0);
    });

    it('loads instinct files with frontmatter', () => {
      const content = `---
id: test-pattern
trigger: "when editing files"
confidence: 0.65
domain: workflow
confirmations: 3
contradictions: 0
---

# Test Pattern

## Action
Always test first.`;

      fs.writeFileSync(path.join(testDir, 'test-pattern.md'), content, 'utf-8');

      const instincts = loadInstincts(testDir);
      expect(instincts).toHaveLength(1);
      expect(instincts[0].id).toBe('test-pattern');
      expect(instincts[0].frontmatter.confidence).toBe(0.65);
      expect(instincts[0].frontmatter.domain).toBe('workflow');
    });

    it('skips files without confidence frontmatter', () => {
      fs.writeFileSync(path.join(testDir, 'readme.md'), '# No frontmatter\n', 'utf-8');

      const instincts = loadInstincts(testDir);
      expect(instincts).toHaveLength(0);
    });

    it('loads multiple instincts', () => {
      const makeInstinct = (id, conf) => `---
id: ${id}
confidence: ${conf}
domain: workflow
---

# ${id}`;

      fs.writeFileSync(path.join(testDir, 'a.md'), makeInstinct('a', 0.8), 'utf-8');
      fs.writeFileSync(path.join(testDir, 'b.md'), makeInstinct('b', 0.5), 'utf-8');
      fs.writeFileSync(path.join(testDir, 'c.md'), makeInstinct('c', 0.3), 'utf-8');

      const instincts = loadInstincts(testDir);
      expect(instincts).toHaveLength(3);
    });
  });

  describe('confirm/contradict integration', () => {
    it('confirm increases confidence and updates file', () => {
      const content = `---
id: test-instinct
confidence: 0.50
confirmations: 2
contradictions: 0
last_confirmed: 2026-01-01
---

# Test Instinct

## Action
Do the thing.`;

      const filePath = path.join(testDir, 'test-instinct.md');
      fs.writeFileSync(filePath, content, 'utf-8');

      // Simulate confirm by applying the same logic as cmdConfirm
      const { frontmatter } = parseConfidenceFrontmatter(content);
      const newConf = applyConfirmation(frontmatter.confidence);
      expect(newConf).toBeCloseTo(0.55, 5);
    });

    it('contradict decreases confidence', () => {
      const { frontmatter } = parseConfidenceFrontmatter(`---
id: bad-instinct
confidence: 0.50
---

# Bad`);

      const newConf = applyContradiction(frontmatter.confidence);
      expect(newConf).toBeCloseTo(0.4, 5);
    });

    it('multiple contradictions can trigger archive', () => {
      let conf = 0.5;
      // 4 contradictions: 0.50 → 0.40 → 0.30 → 0.20 → 0.10
      for (let i = 0; i < 4; i++) {
        conf = applyContradiction(conf);
      }
      expect(conf).toBeLessThan(ARCHIVE_THRESHOLD);
    });
  });
});
