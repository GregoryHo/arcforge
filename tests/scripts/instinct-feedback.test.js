// tests/scripts/instinct-feedback.test.js
//
// Replaces tests/scripts/instinct.test.js, which tested
// skills/arc-learning/scripts/instinct.js (deleted in v6/P5 — the logic moved to
// scripts/lib/instinct-feedback.js so the engine owns it).
//
// Coverage carried over: confidenceBar, pct, loadInstincts (all four cases).
// Coverage ADDED: the old confirm/contradict "integration" tests only re-tested
// confidence.js arithmetic and never touched a file. These drive the real
// confirmInstinct/contradictInstinct against real instinct files, including the
// archive path. The old parseArgs tests are dropped with the script's own arg
// parser; the CLI parser is covered in learning-workflow.test.js.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadInstincts,
  confidenceBar,
  pct,
  collectInstinctStatus,
  renderInstinctStatus,
  syncCuratorCandidate,
  confirmInstinct,
  contradictInstinct,
  formatConfidenceChange,
  ARCHIVE_THRESHOLD,
} = require('../../scripts/lib/instinct-feedback');

// Unique per run so a stray id can never collide with a real curator candidate
// in the developer's home queue (syncCuratorCandidate reads it best-effort).
const uniq = (name) => `p5t-${name}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

function makeInstinct({ id, confidence, domain = 'workflow', trigger = '', action = '', source }) {
  return [
    '---',
    `id: ${id}`,
    trigger ? `trigger: "${trigger}"` : null,
    `domain: ${domain}`,
    source ? `source: ${source}` : null,
    `confidence: ${confidence}`,
    'confirmations: 0',
    'contradictions: 0',
    '---',
    '',
    `# ${id}`,
    '',
    '## Action',
    action || 'Do the thing.',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

describe('instinct-feedback rendering helpers', () => {
  describe('confidenceBar', () => {
    it('renders a full bar at 1.0', () => {
      expect(confidenceBar(1.0)).toBe('█'.repeat(10));
    });
    it('renders an empty bar at 0.0', () => {
      expect(confidenceBar(0.0)).toBe('░'.repeat(10));
    });
    it('renders a half bar at 0.5', () => {
      expect(confidenceBar(0.5)).toBe(`${'█'.repeat(5)}${'░'.repeat(5)}`);
    });
    it('renders 7/10 at 0.7', () => {
      expect(confidenceBar(0.7)).toBe(`${'█'.repeat(7)}${'░'.repeat(3)}`);
    });
  });

  describe('pct', () => {
    it('formats 0.5 as 50%', () => expect(pct(0.5)).toBe('50%'));
    it('formats 0.75 as 75%', () => expect(pct(0.75)).toBe('75%'));
    it('formats 0.0 as 0%', () => expect(pct(0.0)).toBe('0%'));
    it('formats 1.0 as 100%', () => expect(pct(1.0)).toBe('100%'));
  });

  it('formatConfidenceChange shows both ends of the transition', () => {
    expect(formatConfidenceChange(0.5, 0.55)).toContain('50%');
    expect(formatConfidenceChange(0.5, 0.55)).toContain('55%');
    expect(formatConfidenceChange(0.5, 0.55)).toContain('→');
  });
});

describe('loadInstincts', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-load-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty array for a non-existent directory', () => {
    expect(loadInstincts(path.join(dir, 'nope'))).toHaveLength(0);
  });

  it('loads an instinct file with its frontmatter', () => {
    fs.writeFileSync(
      path.join(dir, 'test-pattern.md'),
      makeInstinct({
        id: 'test-pattern',
        confidence: 0.65,
        trigger: 'when editing files',
        action: 'Always test first.',
      }),
    );

    const instincts = loadInstincts(dir);
    expect(instincts).toHaveLength(1);
    expect(instincts[0].id).toBe('test-pattern');
    expect(instincts[0].frontmatter.confidence).toBe(0.65);
    expect(instincts[0].frontmatter.domain).toBe('workflow');
  });

  it('skips a markdown file with no confidence frontmatter', () => {
    fs.writeFileSync(path.join(dir, 'readme.md'), '# No frontmatter\n');
    expect(loadInstincts(dir)).toHaveLength(0);
  });

  it('loads multiple instincts', () => {
    for (const [id, conf] of [
      ['a', 0.8],
      ['b', 0.5],
      ['c', 0.3],
    ]) {
      fs.writeFileSync(path.join(dir, `${id}.md`), makeInstinct({ id, confidence: conf }));
    }
    expect(loadInstincts(dir)).toHaveLength(3);
  });
});

describe('instinct status view', () => {
  let home;
  let previousHome;
  const project = 'status-proj';

  const instinctsDir = () => path.join(home, 'instincts', project);

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-status-'));
    previousHome = process.env.ARCFORGE_HOME;
    process.env.ARCFORGE_HOME = home;
    fs.mkdirSync(instinctsDir(), { recursive: true });
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ARCFORGE_HOME;
    else process.env.ARCFORGE_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('rejects a blank project', () => {
    expect(() => collectInstinctStatus('')).toThrow(/project must be a non-empty string/);
  });

  it('reports no instincts when the project has none', () => {
    const status = collectInstinctStatus(project);
    expect(status.instincts).toHaveLength(0);
    expect(renderInstinctStatus(status)).toContain(`No instincts found for project "${project}"`);
  });

  it('groups by domain and sorts each domain by descending confidence', () => {
    fs.writeFileSync(
      path.join(instinctsDir(), 'low.md'),
      makeInstinct({ id: 'low', confidence: 0.4, domain: 'testing' }),
    );
    fs.writeFileSync(
      path.join(instinctsDir(), 'high.md'),
      makeInstinct({ id: 'high', confidence: 0.9, domain: 'testing' }),
    );
    fs.writeFileSync(
      path.join(instinctsDir(), 'other.md'),
      makeInstinct({ id: 'other', confidence: 0.6, domain: 'workflow' }),
    );

    const status = collectInstinctStatus(project);
    expect(Object.keys(status.byDomain).sort()).toEqual(['testing', 'workflow']);
    expect(status.byDomain.testing.map((i) => i.id)).toEqual(['high', 'low']);
  });

  it('flags instincts between the archive threshold and 0.3 as at risk', () => {
    fs.writeFileSync(
      path.join(instinctsDir(), 'shaky.md'),
      makeInstinct({ id: 'shaky', confidence: 0.2 }),
    );
    fs.writeFileSync(
      path.join(instinctsDir(), 'solid.md'),
      makeInstinct({ id: 'solid', confidence: 0.8 }),
    );

    const status = collectInstinctStatus(project);
    expect(status.atRisk).toEqual(['shaky']);
    expect(renderInstinctStatus(status)).toContain('At risk');
  });

  it('renders the trigger and the action line from the body', () => {
    fs.writeFileSync(
      path.join(instinctsDir(), 'documented.md'),
      makeInstinct({
        id: 'documented',
        confidence: 0.7,
        trigger: 'before editing',
        action: 'Grep for callers first.',
      }),
    );

    const rendered = renderInstinctStatus(collectInstinctStatus(project));
    expect(rendered).toContain('trigger: before editing');
    expect(rendered).toContain('action: Grep for callers first.');
  });

  it('states that injection is activation-gated', () => {
    fs.writeFileSync(path.join(instinctsDir(), 'x.md'), makeInstinct({ id: 'x', confidence: 0.5 }));
    expect(renderInstinctStatus(collectInstinctStatus(project))).toContain('activation-gated');
  });
});

describe('confirm / contradict against real instinct files', () => {
  let home;
  let previousHome;
  const project = 'feedback-proj';

  const instinctsDir = () => path.join(home, 'instincts', project);
  const archivedDir = () => path.join(home, 'instincts', project, 'archived');

  const write = (id, confidence, extra = {}) => {
    fs.writeFileSync(
      path.join(instinctsDir(), `${id}.md`),
      makeInstinct({ id, confidence, ...extra }),
    );
  };

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-feedback-'));
    previousHome = process.env.ARCFORGE_HOME;
    process.env.ARCFORGE_HOME = home;
    fs.mkdirSync(instinctsDir(), { recursive: true });
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ARCFORGE_HOME;
    else process.env.ARCFORGE_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('throws with the searched directory when the instinct does not exist', () => {
    expect(() => confirmInstinct(uniq('absent'), project)).toThrow(/Instinct not found/);
    expect(() => confirmInstinct(uniq('absent'), project)).toThrow(new RegExp(project));
  });

  it('confirm raises confidence and persists it to the file', () => {
    const id = uniq('confirmed');
    write(id, 0.5);

    const result = confirmInstinct(id, project);

    expect(result.oldConfidence).toBe(0.5);
    expect(result.confidence).toBeCloseTo(0.55, 5);
    expect(result.confirmations).toBe(1);
    expect(result.archived).toBe(false);
    expect(fs.readFileSync(result.path, 'utf-8')).toContain('confidence: 0.55');
  });

  it('confirm accumulates across repeated calls', () => {
    const id = uniq('twice');
    write(id, 0.5);

    confirmInstinct(id, project);
    const second = confirmInstinct(id, project);

    expect(second.confirmations).toBe(2);
    expect(second.confidence).toBeGreaterThan(0.55);
  });

  it('contradict lowers confidence and leaves the file in place above the threshold', () => {
    const id = uniq('contradicted');
    write(id, 0.5);

    const result = contradictInstinct(id, project);

    expect(result.confidence).toBeCloseTo(0.4, 5);
    expect(result.contradictions).toBe(1);
    expect(result.archived).toBe(false);
    expect(fs.existsSync(path.join(instinctsDir(), `${id}.md`))).toBe(true);
  });

  it('contradict archives the instinct once confidence falls below the threshold', () => {
    const id = uniq('doomed');
    write(id, ARCHIVE_THRESHOLD);

    const result = contradictInstinct(id, project);

    expect(result.archived).toBe(true);
    expect(result.confidence).toBeLessThan(ARCHIVE_THRESHOLD);
    expect(fs.existsSync(path.join(instinctsDir(), `${id}.md`))).toBe(false);
    expect(fs.existsSync(path.join(archivedDir(), `${id}.md`))).toBe(true);
    expect(fs.readFileSync(path.join(archivedDir(), `${id}.md`), 'utf-8')).toContain(
      'archived_at:',
    );
  });

  it('applies the gentler contradiction delta to a manual-source instinct', () => {
    const manual = uniq('manual');
    const observed = uniq('observed');
    write(manual, 0.5, { source: 'manual' });
    write(observed, 0.5, { source: 'observation' });

    const manualResult = contradictInstinct(manual, project);
    const observedResult = contradictInstinct(observed, project);

    expect(manualResult.confidence).toBeGreaterThan(observedResult.confidence);
  });

  it('rejects an id that is not a safe filename', () => {
    expect(() => confirmInstinct('../escape', project)).toThrow();
  });

  it('syncCuratorCandidate is a no-op when no candidate matches the instinct', () => {
    expect(() =>
      syncCuratorCandidate(uniq('nocandidate'), { confirmations: 1, contradictions: 0 }, false),
    ).not.toThrow();
  });
});
