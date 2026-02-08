// tests/scripts/confidence.test.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  INITIAL,
  CONFIRM_DELTA,
  CONTRADICT_DELTA,
  DECAY_PER_WEEK,
  AUTO_LOAD_THRESHOLD,
  ARCHIVE_THRESHOLD,
  MAX_CONFIDENCE,
  MIN_CONFIDENCE,
  parseConfidenceFrontmatter,
  updateConfidenceFrontmatter,
  calculateDecay,
  applyConfirmation,
  applyContradiction,
  shouldAutoLoad,
  shouldArchive,
  clampConfidence,
  runDecayCycle
} = require('../../scripts/lib/confidence');

describe('confidence', () => {
  describe('constants', () => {
    it('has expected default values', () => {
      expect(INITIAL).toBe(0.5);
      expect(CONFIRM_DELTA).toBe(0.05);
      expect(CONTRADICT_DELTA).toBe(-0.10);
      expect(DECAY_PER_WEEK).toBe(0.02);
      expect(AUTO_LOAD_THRESHOLD).toBe(0.7);
      expect(ARCHIVE_THRESHOLD).toBe(0.15);
      expect(MAX_CONFIDENCE).toBe(0.9);
      expect(MIN_CONFIDENCE).toBe(0.1);
    });
  });

  describe('parseConfidenceFrontmatter', () => {
    it('parses valid frontmatter', () => {
      const content = `---
id: grep-before-edit
trigger: "when modifying code"
confidence: 0.65
domain: workflow
confirmations: 8
contradictions: 0
---

# Grep Before Edit

## Action
Always grep first.`;

      const { frontmatter, body } = parseConfidenceFrontmatter(content);

      expect(frontmatter.id).toBe('grep-before-edit');
      expect(frontmatter.trigger).toBe('when modifying code');
      expect(frontmatter.confidence).toBe(0.65);
      expect(frontmatter.domain).toBe('workflow');
      expect(frontmatter.confirmations).toBe(8);
      expect(frontmatter.contradictions).toBe(0);
      expect(body).toContain('# Grep Before Edit');
    });

    it('returns empty frontmatter for non-frontmatter content', () => {
      const content = '# Just a heading\n\nSome text.';
      const { frontmatter, body } = parseConfidenceFrontmatter(content);

      expect(Object.keys(frontmatter)).toHaveLength(0);
      expect(body).toBe(content);
    });

    it('handles empty content', () => {
      const { frontmatter, body } = parseConfidenceFrontmatter('');
      expect(Object.keys(frontmatter)).toHaveLength(0);
      expect(body).toBe('');
    });

    it('handles null content', () => {
      const { frontmatter, body } = parseConfidenceFrontmatter(null);
      expect(Object.keys(frontmatter)).toHaveLength(0);
      expect(body).toBe('');
    });
  });

  describe('updateConfidenceFrontmatter', () => {
    it('updates specific fields', () => {
      const content = `---
id: test
confidence: 0.50
domain: workflow
---

# Test`;

      const updated = updateConfidenceFrontmatter(content, { confidence: 0.75 });
      const { frontmatter } = parseConfidenceFrontmatter(updated);

      expect(frontmatter.confidence).toBe(0.75);
      expect(frontmatter.id).toBe('test');
      expect(frontmatter.domain).toBe('workflow');
    });

    it('adds new fields', () => {
      const content = `---
id: test
confidence: 0.50
---

# Test`;

      const updated = updateConfidenceFrontmatter(content, {
        last_confirmed: '2026-02-08',
        archived_at: '2026-02-08'
      });
      const { frontmatter } = parseConfidenceFrontmatter(updated);

      expect(frontmatter.last_confirmed).toBe('2026-02-08');
      expect(frontmatter.archived_at).toBe('2026-02-08');
    });
  });

  describe('calculateDecay', () => {
    it('returns 0 for no last confirmed', () => {
      expect(calculateDecay(null)).toBe(0);
      expect(calculateDecay(undefined)).toBe(0);
    });

    it('returns 0 for same day', () => {
      const today = new Date();
      const decay = calculateDecay(today.toISOString().split('T')[0], today);
      expect(decay).toBeCloseTo(0, 2);
    });

    it('decays correctly for 1 week', () => {
      const now = new Date('2026-02-15');
      const decay = calculateDecay('2026-02-08', now);
      expect(decay).toBeCloseTo(DECAY_PER_WEEK, 3);
    });

    it('decays correctly for 4 weeks', () => {
      const now = new Date('2026-03-08');
      const decay = calculateDecay('2026-02-08', now);
      expect(decay).toBeCloseTo(DECAY_PER_WEEK * 4, 2);
    });
  });

  describe('applyConfirmation', () => {
    it('increases confidence by CONFIRM_DELTA', () => {
      expect(applyConfirmation(0.5)).toBeCloseTo(0.55, 5);
      expect(applyConfirmation(0.7)).toBeCloseTo(0.75, 5);
    });

    it('caps at MAX_CONFIDENCE', () => {
      expect(applyConfirmation(0.88)).toBe(MAX_CONFIDENCE);
      expect(applyConfirmation(0.9)).toBe(MAX_CONFIDENCE);
    });

    it('uses INITIAL if no confidence provided', () => {
      expect(applyConfirmation(undefined)).toBeCloseTo(INITIAL + CONFIRM_DELTA, 5);
    });
  });

  describe('applyContradiction', () => {
    it('decreases confidence by CONTRADICT_DELTA', () => {
      expect(applyContradiction(0.5)).toBeCloseTo(0.4, 5);
      expect(applyContradiction(0.7)).toBeCloseTo(0.6, 5);
    });

    it('floors at MIN_CONFIDENCE', () => {
      expect(applyContradiction(0.15)).toBe(MIN_CONFIDENCE);
      expect(applyContradiction(0.1)).toBe(MIN_CONFIDENCE);
    });
  });

  describe('shouldAutoLoad', () => {
    it('returns true at threshold', () => {
      expect(shouldAutoLoad(0.7)).toBe(true);
    });

    it('returns true above threshold', () => {
      expect(shouldAutoLoad(0.85)).toBe(true);
    });

    it('returns false below threshold', () => {
      expect(shouldAutoLoad(0.69)).toBe(false);
    });

    it('returns false for zero', () => {
      expect(shouldAutoLoad(0)).toBe(false);
    });
  });

  describe('shouldArchive', () => {
    it('returns true below threshold', () => {
      expect(shouldArchive(0.14)).toBe(true);
      expect(shouldArchive(0.1)).toBe(true);
    });

    it('returns false at threshold', () => {
      expect(shouldArchive(0.15)).toBe(false);
    });

    it('returns false above threshold', () => {
      expect(shouldArchive(0.5)).toBe(false);
    });
  });

  describe('runDecayCycle', () => {
    const testDir = path.join(os.tmpdir(), 'confidence-decay-test-' + Date.now());

    beforeEach(() => {
      fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('returns empty for non-existent directory', () => {
      const result = runDecayCycle('/nonexistent/path');
      expect(result.decayed).toHaveLength(0);
      expect(result.archived).toHaveLength(0);
    });

    it('decays old instincts', () => {
      // Create instinct with old last_confirmed (8 weeks ago)
      const content = `---
id: old-pattern
confidence: 0.50
last_confirmed: 2025-12-14
---

# Old Pattern`;

      fs.writeFileSync(path.join(testDir, 'old-pattern.md'), content, 'utf-8');

      const result = runDecayCycle(testDir);

      expect(result.decayed.length + result.archived.length).toBeGreaterThan(0);

      // Check the file was updated or archived
      if (result.decayed.includes('old-pattern.md')) {
        const updated = fs.readFileSync(path.join(testDir, 'old-pattern.md'), 'utf-8');
        const { frontmatter } = parseConfidenceFrontmatter(updated);
        expect(frontmatter.confidence).toBeLessThan(0.50);
      }
    });

    it('archives instincts below threshold', () => {
      // Confidence 0.12 with old date — will decay below 0.15
      const content = `---
id: dying-pattern
confidence: 0.12
last_confirmed: 2025-01-01
---

# Dying Pattern`;

      fs.writeFileSync(path.join(testDir, 'dying-pattern.md'), content, 'utf-8');

      const result = runDecayCycle(testDir);

      expect(result.archived).toContain('dying-pattern.md');
      expect(fs.existsSync(path.join(testDir, 'dying-pattern.md'))).toBe(false);
      expect(fs.existsSync(path.join(testDir, 'archived', 'dying-pattern.md'))).toBe(true);
    });

    it('skips files without confidence frontmatter', () => {
      fs.writeFileSync(path.join(testDir, 'readme.md'), '# No frontmatter\n', 'utf-8');

      const result = runDecayCycle(testDir);

      expect(result.decayed).toHaveLength(0);
      expect(result.archived).toHaveLength(0);
    });
  });
});
