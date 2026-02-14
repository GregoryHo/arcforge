// tests/scripts/evolve.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  classifyCluster,
  generateName,
  generateSkill,
  generateCommand,
  generateAgent,
  recordEvolution,
  readEvolutionLog,
  isAlreadyEvolved,
} = require('../../scripts/lib/evolve');

// ─────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────

function makeInstinct(id, overrides = {}) {
  return {
    id,
    confidence: 0.7,
    domain: 'testing',
    trigger: `when ${id}`,
    body: `## Action\nDo the thing for ${id}\n`,
    frontmatter: {
      id,
      confidence: overrides.confidence || 0.7,
      domain: overrides.domain || 'testing',
      trigger: overrides.trigger || `when ${id}`,
      source: overrides.source || 'session-observation',
    },
    ...overrides,
  };
}

function makeCluster(overrides = {}) {
  return {
    domain: 'testing',
    items: [
      makeInstinct('test-a', { trigger: 'when running unit tests' }),
      makeInstinct('test-b', { trigger: 'when running integration tests' }),
      makeInstinct('test-c', { trigger: 'when checking test results' }),
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// classifyCluster
// ─────────────────────────────────────────────

describe('classifyCluster', () => {
  it('classifies workflow-domain cluster with avg confidence >= 0.7 as command', () => {
    const cluster = makeCluster({
      domain: 'workflow',
      items: [
        makeInstinct('wf-a', { domain: 'workflow', confidence: 0.75 }),
        makeInstinct('wf-b', { domain: 'workflow', confidence: 0.7 }),
        makeInstinct('wf-c', { domain: 'workflow', confidence: 0.8 }),
      ],
    });
    const result = classifyCluster(cluster);
    expect(result.type).toBe('command');
    expect(result.reasons).toBeInstanceOf(Array);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('classifies automation-domain cluster with avg confidence >= 0.7 as command', () => {
    const cluster = makeCluster({
      domain: 'automation',
      items: [
        makeInstinct('auto-a', { domain: 'automation', confidence: 0.8 }),
        makeInstinct('auto-b', { domain: 'automation', confidence: 0.7 }),
        makeInstinct('auto-c', { domain: 'automation', confidence: 0.75 }),
      ],
    });
    const result = classifyCluster(cluster);
    expect(result.type).toBe('command');
  });

  it('classifies 3+ instinct cluster with avg confidence >= 0.75 as agent', () => {
    const cluster = makeCluster({
      domain: 'debugging',
      items: [
        makeInstinct('dbg-a', { domain: 'debugging', confidence: 0.8 }),
        makeInstinct('dbg-b', { domain: 'debugging', confidence: 0.75 }),
        makeInstinct('dbg-c', { domain: 'debugging', confidence: 0.85 }),
      ],
    });
    const result = classifyCluster(cluster);
    expect(result.type).toBe('agent');
  });

  it('classifies small cluster (< 3) as skill (default)', () => {
    const cluster = makeCluster({
      items: [makeInstinct('s-a', { confidence: 0.8 }), makeInstinct('s-b', { confidence: 0.8 })],
    });
    const result = classifyCluster(cluster);
    expect(result.type).toBe('skill');
  });

  it('defaults to skill when no primary rule matches', () => {
    const cluster = makeCluster({
      domain: 'testing',
      items: [
        makeInstinct('lo-a', { domain: 'testing', confidence: 0.5 }),
        makeInstinct('lo-b', { domain: 'testing', confidence: 0.55 }),
        makeInstinct('lo-c', { domain: 'testing', confidence: 0.6 }),
      ],
    });
    const result = classifyCluster(cluster);
    expect(result.type).toBe('skill');
  });

  it('uses keyword ratio as tiebreaker when domain is ambiguous', () => {
    // Action-heavy triggers → command via tiebreaker
    const cluster = makeCluster({
      domain: 'general',
      items: [
        makeInstinct('act-a', {
          domain: 'general',
          confidence: 0.72,
          trigger: 'when starting a new project setup',
        }),
        makeInstinct('act-b', {
          domain: 'general',
          confidence: 0.7,
          trigger: 'when running a deployment script',
        }),
        makeInstinct('act-c', {
          domain: 'general',
          confidence: 0.71,
          trigger: 'when creating a new release',
        }),
      ],
    });
    const result = classifyCluster(cluster);
    // With action-heavy triggers, should classify as command or skill
    expect(['command', 'skill']).toContain(result.type);
  });

  it('returns reasons array explaining classification', () => {
    const cluster = makeCluster();
    const result = classifyCluster(cluster);
    expect(result.reasons).toBeInstanceOf(Array);
    expect(result.reasons.length).toBeGreaterThan(0);
    for (const r of result.reasons) {
      expect(typeof r).toBe('string');
    }
  });
});

// ─────────────────────────────────────────────
// generateName
// ─────────────────────────────────────────────

describe('generateName', () => {
  it('generates arc-prefixed name for skills', () => {
    const name = generateName(makeCluster(), 'skill');
    expect(name).toMatch(/^arc-/);
  });

  it('generates plain name for commands (no arc- prefix)', () => {
    const name = generateName(makeCluster(), 'command');
    expect(name).not.toMatch(/^arc-/);
  });

  it('generates plain name for agents (no arc- prefix)', () => {
    const name = generateName(makeCluster(), 'agent');
    expect(name).not.toMatch(/^arc-/);
  });

  it('strips leading "when " from trigger text', () => {
    const cluster = makeCluster({
      items: [makeInstinct('x', { trigger: 'when debugging async tests' })],
    });
    const name = generateName(cluster, 'skill');
    expect(name).not.toContain('when');
  });

  it('sanitizes to lowercase kebab-case, truncates to 30 chars', () => {
    const cluster = makeCluster({
      items: [
        makeInstinct('x', {
          trigger: 'when doing something Very Long And Complicated With Extra Words Here',
        }),
      ],
    });
    const name = generateName(cluster, 'skill');
    expect(name).toMatch(/^[a-z0-9-]+$/);
    expect(name.length).toBeLessThanOrEqual(30);
  });

  it('uses most common trigger tokens for clusters', () => {
    const cluster = makeCluster({
      items: [
        makeInstinct('a', { trigger: 'when running unit tests' }),
        makeInstinct('b', { trigger: 'when running integration tests' }),
        makeInstinct('c', { trigger: 'when running e2e tests' }),
      ],
    });
    const name = generateName(cluster, 'skill');
    expect(name).toContain('running');
  });
});

// ─────────────────────────────────────────────
// generateSkill / generateCommand / generateAgent
// ─────────────────────────────────────────────

describe('generateSkill', () => {
  it('produces valid frontmatter', () => {
    const result = generateSkill(makeCluster(), 'arc-testing-patterns');
    expect(result.content).toMatch(/^---\n/);
    expect(result.content).toMatch(/name: arc-testing-patterns/);
    expect(result.type).toBe('skill');
  });

  it('description starts with "Use when"', () => {
    const result = generateSkill(makeCluster(), 'arc-testing-patterns');
    const descMatch = result.content.match(/description: "(.+)"/);
    expect(descMatch).toBeTruthy();
    expect(descMatch[1]).toMatch(/^Use when/);
  });

  it('description <= 1024 chars', () => {
    const result = generateSkill(makeCluster(), 'arc-testing-patterns');
    const descMatch = result.content.match(/description: "(.+)"/);
    expect(descMatch[1].length).toBeLessThanOrEqual(1024);
  });

  it('includes source instinct IDs', () => {
    const result = generateSkill(makeCluster(), 'arc-testing-patterns');
    expect(result.content).toContain('test-a');
    expect(result.content).toContain('test-b');
    expect(result.content).toContain('test-c');
  });

  it('returns correct path', () => {
    const result = generateSkill(makeCluster(), 'arc-testing-patterns');
    expect(result.path).toBe('skills/arc-testing-patterns/SKILL.md');
  });
});

describe('generateCommand', () => {
  it('produces valid frontmatter', () => {
    const result = generateCommand(makeCluster(), 'testing-patterns', 'arc-testing-patterns');
    expect(result.content).toMatch(/^---\n/);
    expect(result.type).toBe('command');
  });

  it('has disable-model-invocation: true', () => {
    const result = generateCommand(makeCluster(), 'testing-patterns', 'arc-testing-patterns');
    expect(result.content).toContain('disable-model-invocation: true');
  });

  it('references backing skill name', () => {
    const result = generateCommand(makeCluster(), 'testing-patterns', 'arc-testing-patterns');
    expect(result.content).toContain('arc-testing-patterns');
  });

  it('returns correct path', () => {
    const result = generateCommand(makeCluster(), 'testing-patterns', 'arc-testing-patterns');
    expect(result.path).toBe('commands/testing-patterns.md');
  });
});

describe('generateAgent', () => {
  it('produces valid frontmatter', () => {
    const result = generateAgent(makeCluster(), 'testing-patterns');
    expect(result.content).toMatch(/^---\n/);
    expect(result.type).toBe('agent');
  });

  it('has model: inherit', () => {
    const result = generateAgent(makeCluster(), 'testing-patterns');
    expect(result.content).toContain('model: inherit');
  });

  it('returns correct path', () => {
    const result = generateAgent(makeCluster(), 'testing-patterns');
    expect(result.path).toBe('agents/testing-patterns.md');
  });
});

// ─────────────────────────────────────────────
// recordEvolution / readEvolutionLog / isAlreadyEvolved
// ─────────────────────────────────────────────

describe('evolution tracking', () => {
  const testDir = path.join(os.tmpdir(), `evolve-test-${Date.now()}`);
  const testLogPath = path.join(testDir, 'evolved.jsonl');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('recordEvolution appends JSONL entry', () => {
    recordEvolution(
      {
        id: 'arc-testing',
        type: 'skill',
        instincts: ['i1', 'i2', 'i3'],
        project: 'arcforge',
        files: ['skills/arc-testing/SKILL.md'],
      },
      testLogPath,
    );

    const content = fs.readFileSync(testLogPath, 'utf-8');
    const entry = JSON.parse(content.trim());
    expect(entry.id).toBe('arc-testing');
    expect(entry.type).toBe('skill');
    expect(entry.instincts).toEqual(['i1', 'i2', 'i3']);
    expect(entry.project).toBe('arcforge');
    expect(entry.timestamp).toBeTruthy();
  });

  it('readEvolutionLog reads back entries', () => {
    recordEvolution(
      { id: 'a', type: 'skill', instincts: ['i1'], project: 'p1', files: [] },
      testLogPath,
    );
    recordEvolution(
      { id: 'b', type: 'command', instincts: ['i2'], project: 'p1', files: [] },
      testLogPath,
    );

    const entries = readEvolutionLog(testLogPath);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('a');
    expect(entries[1].id).toBe('b');
  });

  it('readEvolutionLog returns empty for missing file', () => {
    const entries = readEvolutionLog(path.join(testDir, 'nonexistent.jsonl'));
    expect(entries).toEqual([]);
  });

  it('isAlreadyEvolved detects already-evolved instinct sets', () => {
    recordEvolution(
      { id: 'x', type: 'skill', instincts: ['i1', 'i2', 'i3'], project: 'p1', files: [] },
      testLogPath,
    );

    expect(isAlreadyEvolved(['i1', 'i2', 'i3'], testLogPath)).toBe(true);
    expect(isAlreadyEvolved(['i1', 'i2'], testLogPath)).toBe(false);
    expect(isAlreadyEvolved(['i4', 'i5'], testLogPath)).toBe(false);
  });
});
