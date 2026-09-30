// tests/scripts/confidence.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  INITIAL,
  CONFIRM_DELTA,
  CONTRADICT_DELTA,
  DECAY_PER_WEEK,
  AUTO_LOAD_THRESHOLD,
  ARCHIVE_THRESHOLD,
  MAX_CONFIDENCE,
  MIN_CONFIDENCE,
  MANUAL_CONTRADICT_DELTA,
  MANUAL_DECAY_PER_WEEK,
  RESISTANT_SOURCES,
  parseConfidenceFrontmatter,
  updateConfidenceFrontmatter,
  calculateDecay,
  applyConfirmation,
  applyContradiction,
  shouldAutoLoad,
  shouldArchive,
  runDecayCycle,
} = require('../../scripts/lib/confidence');

describe('confidence', () => {
  describe('constants', () => {
    it('has expected default values', () => {
      expect(INITIAL).toBe(0.5);
      expect(CONFIRM_DELTA).toBe(0.05);
      expect(CONTRADICT_DELTA).toBe(-0.1);
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
        archived_at: '2026-02-08',
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
    const testDir = path.join(os.tmpdir(), `confidence-decay-test-${Date.now()}`);
    // Decay reads ActivationRecords and writes its audit under the arcforge
    // home, so every case runs against a scratch home, never the real one.
    const testHome = path.join(os.tmpdir(), `confidence-decay-home-${Date.now()}`);
    let savedHome;

    beforeEach(() => {
      fs.mkdirSync(testDir, { recursive: true });
      savedHome = process.env.ARCFORGE_HOME;
      process.env.ARCFORGE_HOME = testHome;
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
      fs.rmSync(testHome, { recursive: true, force: true });
      if (savedHome === undefined) delete process.env.ARCFORGE_HOME;
      else process.env.ARCFORGE_HOME = savedHome;
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
        expect(frontmatter.confidence).toBeLessThan(0.5);
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

    it('halves weekly decay for source: manual', () => {
      // Create manual instinct with old last_confirmed (4 weeks ago)
      const content = `---
id: manual-pattern
confidence: 0.50
source: manual
last_confirmed: 2026-01-17
---

# Manual Pattern`;

      fs.writeFileSync(path.join(testDir, 'manual-pattern.md'), content, 'utf-8');

      // Also create a session-observation instinct with same date and confidence
      const autoContent = `---
id: auto-pattern
confidence: 0.50
source: session-observation
last_confirmed: 2026-01-17
---

# Auto Pattern`;

      fs.writeFileSync(path.join(testDir, 'auto-pattern.md'), autoContent, 'utf-8');

      runDecayCycle(testDir);

      // Manual should decay less than auto
      if (fs.existsSync(path.join(testDir, 'manual-pattern.md'))) {
        const manualUpdated = fs.readFileSync(path.join(testDir, 'manual-pattern.md'), 'utf-8');
        const { frontmatter: manualFm } = parseConfidenceFrontmatter(manualUpdated);

        if (fs.existsSync(path.join(testDir, 'auto-pattern.md'))) {
          const autoUpdated = fs.readFileSync(path.join(testDir, 'auto-pattern.md'), 'utf-8');
          const { frontmatter: autoFm } = parseConfidenceFrontmatter(autoUpdated);
          expect(manualFm.confidence).toBeGreaterThan(autoFm.confidence);
        }
      }
    });

    it('halves weekly decay for source: reflection', () => {
      const content = `---
id: reflection-pattern
confidence: 0.50
source: reflection
last_confirmed: 2026-01-17
---

# Reflection Pattern`;

      fs.writeFileSync(path.join(testDir, 'reflection-pattern.md'), content, 'utf-8');

      const autoContent = `---
id: auto-pattern-2
confidence: 0.50
source: session-observation
last_confirmed: 2026-01-17
---

# Auto Pattern 2`;

      fs.writeFileSync(path.join(testDir, 'auto-pattern-2.md'), autoContent, 'utf-8');

      runDecayCycle(testDir);

      if (fs.existsSync(path.join(testDir, 'reflection-pattern.md'))) {
        const reflUpdated = fs.readFileSync(path.join(testDir, 'reflection-pattern.md'), 'utf-8');
        const { frontmatter: reflFm } = parseConfidenceFrontmatter(reflUpdated);

        if (fs.existsSync(path.join(testDir, 'auto-pattern-2.md'))) {
          const autoUpdated = fs.readFileSync(path.join(testDir, 'auto-pattern-2.md'), 'utf-8');
          const { frontmatter: autoFm } = parseConfidenceFrontmatter(autoUpdated);
          expect(reflFm.confidence).toBeGreaterThan(autoFm.confidence);
        }
      }
    });
  });

  // B-10 / D-022: decay charges each elapsed period once, never archives an
  // activated instinct, and audits + stamps every archive it does perform.
  describe('runDecayCycle — B-10 charge once, spare the activated, audit the archive', () => {
    let root;
    let home;
    let savedHome;
    const NOW = new Date('2026-03-01T12:00:00.000Z');
    const FOUR_WEEKS_BEFORE = '2026-02-01';

    function instinct(id, confidence, lastConfirmed, source = 'session-observation') {
      return `---
id: ${id}
confidence: ${confidence}
source: ${source}
last_confirmed: ${lastConfirmed}
---

# ${id}

## Action
Do the thing.
`;
    }

    function writeInstinct(dir, id, confidence, lastConfirmed, source) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${id}.md`),
        instinct(id, confidence, lastConfirmed, source),
        'utf-8',
      );
    }

    function readFm(filePath) {
      return parseConfidenceFrontmatter(fs.readFileSync(filePath, 'utf-8')).frontmatter;
    }

    function recordActivation(candidateId, action = 'activate') {
      const dir = path.join(home, 'learning', 'activations');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${Date.now()}-${candidateId}-${action}.json`),
        JSON.stringify({
          candidate_id: candidateId,
          action,
          created_at: new Date().toISOString(),
        }),
      );
    }

    function auditLines() {
      const logPath = path.join(home, 'learning', 'dashboard', 'actions.jsonl');
      if (!fs.existsSync(logPath)) return [];
      return fs
        .readFileSync(logPath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    }

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'decay-b10-'));
      home = path.join(root, 'home');
      savedHome = process.env.ARCFORGE_HOME;
      process.env.ARCFORGE_HOME = home;
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
      if (savedHome === undefined) delete process.env.ARCFORGE_HOME;
      else process.env.ARCFORGE_HOME = savedHome;
    });

    it('five cycles over the same interval equal one cycle', () => {
      const once = path.join(root, 'once');
      const five = path.join(root, 'five');
      writeInstinct(once, 'p', '0.50', FOUR_WEEKS_BEFORE);
      writeInstinct(five, 'p', '0.50', FOUR_WEEKS_BEFORE);

      runDecayCycle(once, { now: NOW });
      for (let i = 0; i < 5; i++) runDecayCycle(five, { now: NOW });

      expect(fs.existsSync(path.join(five, 'p.md'))).toBe(true);
      expect(fs.existsSync(path.join(five, 'archived', 'p.md'))).toBe(false);
      const single = readFm(path.join(once, 'p.md'));
      expect(single.confidence).toBeCloseTo(0.5 - 4 * DECAY_PER_WEEK, 5);
      expect(readFm(path.join(five, 'p.md')).confidence).toBe(single.confidence);
    });

    it('cycles spread across the interval charge the same total as one at its end', () => {
      const once = path.join(root, 'once');
      const spread = path.join(root, 'spread');
      writeInstinct(once, 'p', '0.50', FOUR_WEEKS_BEFORE);
      writeInstinct(spread, 'p', '0.50', FOUR_WEEKS_BEFORE);

      runDecayCycle(once, { now: NOW });
      // Daily sessions: each one alone is less than a period, so nothing may be
      // lost to rounding and nothing may be charged twice.
      for (let day = 1; day <= 28; day++) {
        const at = new Date(Date.parse(`${FOUR_WEEKS_BEFORE}T12:00:00.000Z`) + day * 86400000);
        runDecayCycle(spread, { now: at });
      }

      expect(readFm(path.join(spread, 'p.md')).confidence).toBe(
        readFm(path.join(once, 'p.md')).confidence,
      );
    });

    it('a confirmation after a charge restarts the clock from last_confirmed', () => {
      const dir = path.join(root, 'confirm');
      writeInstinct(dir, 'p', '0.50', FOUR_WEEKS_BEFORE);
      // Charges four whole weeks, through 2026-03-01.
      runDecayCycle(dir, { now: new Date('2026-03-05T00:00:00.000Z') });
      const filePath = path.join(dir, 'p.md');
      fs.writeFileSync(
        filePath,
        updateConfidenceFrontmatter(fs.readFileSync(filePath, 'utf-8'), {
          confidence: 0.47,
          last_confirmed: '2026-03-06',
        }),
      );

      // Eight days after the charge, three after the confirmation: no period
      // has elapsed since the user last confirmed it.
      runDecayCycle(dir, { now: new Date('2026-03-09T00:00:00.000Z') });

      expect(readFm(filePath).confidence).toBe(0.47);
    });

    it('never archives an activated instinct', () => {
      const dir = path.join(root, 'instincts', 'proj');
      writeInstinct(dir, 'cand_active', '0.12', '2025-01-01');
      recordActivation('cand_active');

      const result = runDecayCycle(dir, { now: NOW });

      expect(result.archived).not.toContain('cand_active.md');
      expect(fs.existsSync(path.join(dir, 'cand_active.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'archived', 'cand_active.md'))).toBe(false);
      expect(auditLines()).toHaveLength(0);
    });

    it('archives an instinct once deactivated, like any other', () => {
      const dir = path.join(root, 'instincts', 'proj');
      writeInstinct(dir, 'cand_gone', '0.12', '2025-01-01');
      recordActivation('cand_gone', 'activate');
      recordActivation('cand_gone', 'deactivate');

      const result = runDecayCycle(dir, { now: NOW });

      expect(result.archived).toContain('cand_gone.md');
    });

    it('stamps the archived file with the decay reason and audits the instinct by name', () => {
      const dir = path.join(root, 'instincts', 'proj');
      writeInstinct(dir, 'dying', '0.12', '2025-01-01');

      const result = runDecayCycle(dir, { now: NOW });

      expect(result.archived).toEqual(['dying.md']);
      const archived = readFm(path.join(dir, 'archived', 'dying.md'));
      expect(archived.archive_reason).toBe('decay');
      expect(archived.archived_at).toBe('2026-03-01');

      const lines = auditLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        accepted: true,
        action: 'decay_archive',
        instinct_id: 'dying',
        reason: 'decay',
        actor: { actor_type: 'decay_cycle' },
      });
      expect(lines[0].confidence_before).toBe(0.12);
      // The audit trail carries no absolute filesystem path.
      expect(JSON.stringify(lines[0])).not.toContain(root);
    });
  });

  describe('source-aware constants', () => {
    it('has resistance constants', () => {
      expect(MANUAL_CONTRADICT_DELTA).toBe(-0.05);
      expect(MANUAL_DECAY_PER_WEEK).toBe(0.01);
      expect(RESISTANT_SOURCES).toBeInstanceOf(Set);
      expect(RESISTANT_SOURCES.has('manual')).toBe(true);
      expect(RESISTANT_SOURCES.has('reflection')).toBe(true);
      expect(RESISTANT_SOURCES.has('session-observation')).toBe(false);
    });
  });

  describe('applyContradiction (source-aware)', () => {
    it('halves delta for source: manual (-0.05 instead of -0.10)', () => {
      const result = applyContradiction(0.5, 'manual');
      expect(result).toBeCloseTo(0.45, 5);
    });

    it('halves delta for source: reflection (-0.05 instead of -0.10)', () => {
      const result = applyContradiction(0.5, 'reflection');
      expect(result).toBeCloseTo(0.45, 5);
    });

    it('full delta for source: session-observation (-0.10)', () => {
      const result = applyContradiction(0.5, 'session-observation');
      expect(result).toBeCloseTo(0.4, 5);
    });

    it('full delta when source is undefined (backward compat)', () => {
      const result = applyContradiction(0.5);
      expect(result).toBeCloseTo(0.4, 5);
    });

    it('still respects MIN_CONFIDENCE floor for resistant sources', () => {
      const result = applyContradiction(0.12, 'manual');
      expect(result).toBe(MIN_CONFIDENCE);
    });
  });
});
