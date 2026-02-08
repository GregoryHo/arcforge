// tests/scripts/learn.test.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loadSkills,
  confidenceBar,
  pct,
  parseArgs
} = require('../../skills/arc-learning/scripts/learn');

const {
  parseConfidenceFrontmatter,
  applyConfirmation,
  applyContradiction,
  ARCHIVE_THRESHOLD
} = require('../../scripts/lib/confidence');

describe('learn CLI', () => {
  const testDir = path.join(os.tmpdir(), 'learn-test-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('parseArgs', () => {
    it('parses save command with flags', () => {
      const { command, flags } = parseArgs([
        'node', 'learn.js', 'save',
        '--name', 'fix-typescript',
        '--content', '# Fix',
        '--scope', 'global',
        '--confidence', '0.7'
      ]);
      expect(command).toBe('save');
      expect(flags.name).toBe('fix-typescript');
      expect(flags.content).toBe('# Fix');
      expect(flags.scope).toBe('global');
      expect(flags.confidence).toBe('0.7');
    });

    it('parses confirm command with positional', () => {
      const { command, positional, flags } = parseArgs([
        'node', 'learn.js', 'confirm', 'my-pattern', '--project', 'test-proj'
      ]);
      expect(command).toBe('confirm');
      expect(positional[0]).toBe('my-pattern');
      expect(flags.project).toBe('test-proj');
    });

    it('parses list with min-confidence', () => {
      const { command, flags } = parseArgs([
        'node', 'learn.js', 'list', '--min-confidence', '0.5'
      ]);
      expect(command).toBe('list');
      expect(flags['min-confidence']).toBe('0.5');
    });
  });

  describe('confidenceBar', () => {
    it('renders correctly for various values', () => {
      expect(confidenceBar(1.0).length).toBe(10);
      expect(confidenceBar(0.0).length).toBe(10);
      expect(confidenceBar(0.5).length).toBe(10);
    });

    it('handles undefined', () => {
      expect(confidenceBar(undefined).length).toBe(10);
    });
  });

  describe('loadSkills', () => {
    it('returns empty for non-existent directory', () => {
      expect(loadSkills('/nonexistent')).toHaveLength(0);
    });

    it('loads skills with confidence frontmatter', () => {
      const content = `---
name: test-skill
confidence: 0.65
extracted: 2026-02-08
scope: project
---

# Test Skill

## Problem
Something.`;

      fs.writeFileSync(path.join(testDir, 'test-skill.md'), content, 'utf-8');

      const skills = loadSkills(testDir);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('test-skill');
      expect(skills[0].confidence).toBe(0.65);
    });

    it('loads skills without confidence (legacy format)', () => {
      const content = `---
name: legacy-skill
extracted: 2026-01-01
---

# Legacy`;

      fs.writeFileSync(path.join(testDir, 'legacy-skill.md'), content, 'utf-8');

      const skills = loadSkills(testDir);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('legacy-skill');
      expect(skills[0].confidence).toBeUndefined();
    });

    it('loads multiple skills', () => {
      const makeSkill = (name, conf) => `---
name: ${name}
confidence: ${conf}
---

# ${name}`;

      fs.writeFileSync(path.join(testDir, 'a.md'), makeSkill('a', 0.8), 'utf-8');
      fs.writeFileSync(path.join(testDir, 'b.md'), makeSkill('b', 0.5), 'utf-8');

      const skills = loadSkills(testDir);
      expect(skills).toHaveLength(2);
    });
  });

  describe('confidence integration', () => {
    it('confirm increases learned skill confidence', () => {
      const { frontmatter } = parseConfidenceFrontmatter(`---
name: test
confidence: 0.65
---

# Test`);

      expect(applyConfirmation(frontmatter.confidence)).toBeCloseTo(0.70, 5);
    });

    it('multiple contradictions archive learned skill', () => {
      let conf = 0.50;
      for (let i = 0; i < 4; i++) {
        conf = applyContradiction(conf);
      }
      expect(conf).toBeLessThan(ARCHIVE_THRESHOLD);
    });
  });
});
