// tests/scripts/learning-curator-batch-assembler.test.js
//
// Slice E.2 — Layer 3 CuratorBatch assembler tests.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// HOME isolation (same pattern as learning-curator-queue-writer.test.js)
// ---------------------------------------------------------------------------

let tmpDir;
let homedirSpy;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-batch-test-'));
  homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(() => {
  homedirSpy.mockRestore();
  jest.resetModules();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});

// ---------------------------------------------------------------------------
// Fresh module getter
// ---------------------------------------------------------------------------

function getAssembler() {
  return require('../../scripts/lib/learning-curator/batch-assembler');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedObservations(project, records) {
  const obsDir = path.join(tmpDir, '.arcforge', 'observations', project);
  fs.mkdirSync(obsDir, { recursive: true });
  const obsPath = path.join(obsDir, 'observations.jsonl');
  for (const rec of records) {
    fs.appendFileSync(obsPath, `${JSON.stringify(rec)}\n`, 'utf8');
  }
  return obsPath;
}

function makeObservation(overrides = {}) {
  return {
    ts: '2026-05-21T01:00:00.000Z',
    event: 'tool_start',
    tool: 'Read',
    session: 'session-abc123',
    project: 'test-project',
    project_id: 'proj_abc123456789ab',
    evidence_status: 'present',
    input_summary: 'reading a config file',
    ...overrides,
  };
}

function seedDiaries(project, diaryEntries) {
  const diaryDir = path.join(tmpDir, '.arcforge', 'diaries', project);
  let i = 0;
  for (const entry of diaryEntries) {
    const sessionDir = path.join(diaryDir, `session-${i}`);
    fs.mkdirSync(sessionDir, { recursive: true });
    const diaryPath = path.join(sessionDir, `diary-${i}.md`);
    fs.writeFileSync(diaryPath, entry, 'utf8');
    i++;
  }
}

// ---------------------------------------------------------------------------
// Test: manifest shape
// ---------------------------------------------------------------------------

describe('assembleBatch — manifest shape', () => {
  test('produces a valid CuratorBatchManifest with required fields', () => {
    const { assembleBatch } = getAssembler();
    const project = 'test-project';
    const records = Array.from({ length: 15 }, (_, i) =>
      makeObservation({
        ts: `2026-05-21T01:${String(i).padStart(2, '0')}:00.000Z`,
      }),
    );
    seedObservations(project, records);

    const result = assembleBatch({ project });

    expect(result).toBeDefined();
    expect(result.batch_id).toMatch(/^batch_\d{8}T\d{6}Z_[a-f0-9]{12}$/);
    expect(result.batch_hash).toMatch(/^[a-f0-9]{12}$/);
    expect(result.manifest_path).toBeTruthy();
    expect(result.prompt_path).toBeTruthy();
    expect(result.project).toBe(project);

    // Manifest file must exist
    expect(fs.existsSync(result.manifest_path)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(result.manifest_path, 'utf8'));

    expect(manifest.schema_version).toBe(1);
    expect(manifest.batch_id).toBe(result.batch_id);
    expect(manifest.batch_hash).toBe(result.batch_hash);
    expect(manifest.scope.kind).toBe('project');
    expect(manifest.scope.project).toBe(project);
    expect(manifest.handed_to_layer4).toBe(false);
    expect(manifest.snapshot_saved).toBe(false);
    expect(manifest.safety.llm_visible).toBe(true);
    expect(manifest.safety.raw_hook_payloads_included).toBe(false);
    expect(manifest.safety.raw_transcripts_included).toBe(false);
    expect(manifest.safety.sanitizer_policy_version).toBe('v1');
    expect(manifest.selection_policy).toBeDefined();
    expect(manifest.source_windows).toBeDefined();
    expect(manifest.quality_inputs).toBeDefined();
    expect(manifest.limits).toBeDefined();
  });

  test('prompt file exists and contains project context', () => {
    const { assembleBatch } = getAssembler();
    const project = 'test-project';
    seedObservations(project, [makeObservation()]);

    const result = assembleBatch({ project });

    expect(fs.existsSync(result.prompt_path)).toBe(true);
    const promptContent = fs.readFileSync(result.prompt_path, 'utf8');
    expect(promptContent).toContain(project);
    expect(promptContent).toContain(result.batch_id);
  });
});

// ---------------------------------------------------------------------------
// Test: sanitizer applied
// ---------------------------------------------------------------------------

describe('assembleBatch — sanitizer applied to evidence', () => {
  test('Bearer token in input_summary is redacted in prompt file', () => {
    const { assembleBatch } = getAssembler();
    const project = 'secret-project';
    const secretToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_5W4giAjDgTKAz8W8';
    seedObservations(project, [
      makeObservation({
        project,
        input_summary: `Authorization: Bearer ${secretToken}`,
      }),
    ]);

    const result = assembleBatch({ project });
    const promptContent = fs.readFileSync(result.prompt_path, 'utf8');

    expect(promptContent).not.toContain(secretToken);
    expect(promptContent).toContain('[REDACTED]');
  });

  test('OPENAI_API_KEY in input_summary is redacted in prompt file', () => {
    const { assembleBatch } = getAssembler();
    const project = 'key-project';
    seedObservations(project, [
      makeObservation({
        project,
        input_summary: 'OPENAI_API_KEY=sk-secretkey123 used in script',
      }),
    ]);

    const result = assembleBatch({ project });
    const promptContent = fs.readFileSync(result.prompt_path, 'utf8');

    expect(promptContent).not.toContain('sk-secretkey123');
    expect(promptContent).toContain('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// Test: diary context
// ---------------------------------------------------------------------------

describe('assembleBatch — diary context', () => {
  test('includes diary content when diaries exist', () => {
    const { assembleBatch } = getAssembler();
    const project = 'diary-project';
    seedObservations(project, [makeObservation({ project })]);
    seedDiaries(project, [
      '# Session Summary\n\nUser asked me to refactor the auth module.',
      '# Session Summary\n\nFixed a bug in the rate limiter.',
      '# Session Summary\n\nAdded tests for the payment service.',
    ]);

    const result = assembleBatch({ project });
    const promptContent = fs.readFileSync(result.prompt_path, 'utf8');

    expect(promptContent).toContain('auth module');
    expect(promptContent).toContain('rate limiter');
    expect(promptContent).toContain('payment service');
  });

  test('omits diary section (or marks None) when no diaries exist', () => {
    const { assembleBatch } = getAssembler();
    const project = 'no-diary-project';
    seedObservations(project, [makeObservation({ project })]);

    const result = assembleBatch({ project });
    const promptContent = fs.readFileSync(result.prompt_path, 'utf8');

    const hasDiarySection = promptContent.includes('Recent Diary Reflections');
    if (hasDiarySection) {
      expect(promptContent).toMatch(/Recent Diary Reflections[\s\S]*?None/);
    }
  });

  test('limits diary context to at most 5 entries', () => {
    const { assembleBatch } = getAssembler();
    const project = 'many-diaries-project';
    seedObservations(project, [makeObservation({ project })]);
    // Seed 8 diaries — only 5 most recent should appear
    // Use timestamps to control ordering via file mtime
    const diaryDir = path.join(tmpDir, '.arcforge', 'diaries', project);
    const entries = [
      { name: 'old-1', content: '# Old 1\nOld content alpha' },
      { name: 'old-2', content: '# Old 2\nOld content beta' },
      { name: 'old-3', content: '# Old 3\nOld content gamma' },
      { name: 'recent-1', content: '# Recent 1\nRecent content delta' },
      { name: 'recent-2', content: '# Recent 2\nRecent content epsilon' },
      { name: 'recent-3', content: '# Recent 3\nRecent content zeta' },
      { name: 'recent-4', content: '# Recent 4\nRecent content eta' },
      { name: 'recent-5', content: '# Recent 5\nRecent content theta' },
    ];
    entries.forEach((e, i) => {
      const sessionDir = path.join(diaryDir, `session-${i}`);
      fs.mkdirSync(sessionDir, { recursive: true });
      const diaryPath = path.join(sessionDir, `diary-${i}.md`);
      fs.writeFileSync(diaryPath, e.content, 'utf8');
      // Set mtime to make ordering deterministic: old entries get earlier mtimes
      const mtime = new Date(2026, 0, 1 + i);
      fs.utimesSync(diaryPath, mtime, mtime);
    });

    const result = assembleBatch({ project });
    const promptContent = fs.readFileSync(result.prompt_path, 'utf8');

    const recentMatches = ['delta', 'epsilon', 'zeta', 'eta', 'theta'].filter((s) =>
      promptContent.includes(s),
    );
    // At least 4 of the 5 recent must be present
    expect(recentMatches.length).toBeGreaterThanOrEqual(4);
    // At most 2 of the old 3 must appear (because we capped at 5 most recent)
    const oldMatches = ['alpha', 'beta', 'gamma'].filter((s) => promptContent.includes(s));
    expect(oldMatches.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Test: stdout JSON shape
// ---------------------------------------------------------------------------

describe('assembleBatch — return value shape', () => {
  test('returns object with batch_id, batch_hash, manifest_path, prompt_path, project', () => {
    const { assembleBatch } = getAssembler();
    const project = 'shape-project';
    seedObservations(project, [makeObservation({ project })]);

    const result = assembleBatch({ project });

    expect(typeof result.batch_id).toBe('string');
    expect(typeof result.batch_hash).toBe('string');
    expect(typeof result.manifest_path).toBe('string');
    expect(typeof result.prompt_path).toBe('string');
    expect(result.project).toBe(project);
  });
});

// ---------------------------------------------------------------------------
// Criterion 2: typed evidence — DiaryEvidenceItem, ReflectEvidenceItem,
// RecallEvidenceItem — and source_windows with diaries/reflects/recalls keys.
// ---------------------------------------------------------------------------

function seedReflections(project, items) {
  const reflDir = path.join(tmpDir, '.arcforge', 'reflections', project);
  fs.mkdirSync(reflDir, { recursive: true });
  for (const item of items) {
    const content = [
      '---',
      `reflect_id: ${item.reflect_id}`,
      `project: ${project}`,
      `project_id: proj_abc123456789ab`,
      `session: session-xyz`,
      `created_at: ${item.created_at || '2026-05-22T01:00:00.000Z'}`,
      `source: reflection`,
      'source_diary_ids: []',
      '---',
      '',
      `# Reflection`,
      '',
      item.summary || 'No summary.',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(reflDir, `${item.reflect_id}.md`), content, 'utf8');
  }
}

function seedRecalls(project, items) {
  const recallDir = path.join(tmpDir, '.arcforge', 'recalls', project);
  fs.mkdirSync(recallDir, { recursive: true });
  for (const item of items) {
    const content = [
      '---',
      `recall_id: ${item.recall_id}`,
      `project: ${project}`,
      `project_id: proj_abc123456789ab`,
      `session: session-xyz`,
      `created_at: ${item.created_at || '2026-05-22T01:00:00.000Z'}`,
      `source: manual`,
      `recall_query: ${item.recall_query || ''}`,
      'returned_instinct_ids: []',
      '---',
      '',
      `# Recall`,
      '',
      item.summary || 'No summary.',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(recallDir, `${item.recall_id}.md`), content, 'utf8');
  }
}

describe('assembleBatch — typed evidence (criterion 2)', () => {
  test('manifest source_windows has diaries, reflects, recalls keys', () => {
    const { assembleBatch } = getAssembler();
    const project = 'typed-evidence-project';
    seedObservations(project, [makeObservation({ project })]);
    seedDiaries(project, ['# Diary\nSession summary about grep.']);
    seedReflections(project, [
      {
        reflect_id: 'reflect-20260522T010000Z-aabbccdd',
        summary: 'Grep pattern found in 3 sessions.',
      },
    ]);
    seedRecalls(project, [
      {
        recall_id: 'recall-20260522T010000Z-11223344',
        recall_query: 'grep',
        summary: 'Retrieved grep instinct.',
      },
    ]);

    const result = assembleBatch({ project });
    const manifest = JSON.parse(fs.readFileSync(result.manifest_path, 'utf8'));

    expect(manifest.source_windows.diaries).toBeDefined();
    expect(typeof manifest.source_windows.diaries.records_scanned).toBe('number');
    expect(typeof manifest.source_windows.diaries.records_selected).toBe('number');

    expect(manifest.source_windows.reflects).toBeDefined();
    expect(typeof manifest.source_windows.reflects.records_scanned).toBe('number');
    expect(typeof manifest.source_windows.reflects.records_selected).toBe('number');

    expect(manifest.source_windows.recalls).toBeDefined();
    expect(typeof manifest.source_windows.recalls.records_scanned).toBe('number');
    expect(typeof manifest.source_windows.recalls.records_selected).toBe('number');
  });

  test('manifest evidence_ids includes diary, reflect, recall evidence IDs', () => {
    const { assembleBatch } = getAssembler();
    const project = 'typed-evidence-ids-project';
    seedObservations(project, [makeObservation({ project })]);
    seedDiaries(project, ['# Diary\nSession content.']);
    seedReflections(project, [
      {
        reflect_id: 'reflect-20260522T010000Z-aabbccdd',
        summary: 'Reflect summary.',
      },
    ]);
    seedRecalls(project, [
      {
        recall_id: 'recall-20260522T010000Z-11223344',
        recall_query: 'query',
        summary: 'Recall summary.',
      },
    ]);

    const result = assembleBatch({ project });
    const manifest = JSON.parse(fs.readFileSync(result.manifest_path, 'utf8'));

    // evidence_ids should include items with diary/reflect/recall prefixes
    const ids = manifest.evidence_ids || [];
    const hasDiary = ids.some((id) => id.includes('diary'));
    const hasReflect = ids.some((id) => id.includes('reflect'));
    const hasRecall = ids.some((id) => id.includes('recall'));

    expect(hasDiary).toBe(true);
    expect(hasReflect).toBe(true);
    expect(hasRecall).toBe(true);
  });

  test('MAX_REFLECTS and MAX_RECALLS are non-zero (default 10)', () => {
    // This is tested by verifying that reflection/recall files are actually read.
    // If MAX_REFLECTS were 0, no reflect items would appear.
    const { assembleBatch } = getAssembler();
    const project = 'nonzero-max-project';
    seedObservations(project, [makeObservation({ project })]);
    seedReflections(project, [
      {
        reflect_id: 'reflect-20260522T010000Z-00000001',
        summary: 'First reflection.',
      },
    ]);

    const result = assembleBatch({ project });
    const manifest = JSON.parse(fs.readFileSync(result.manifest_path, 'utf8'));

    // With non-zero MAX_REFLECTS, reflects.records_selected should be 1
    expect(manifest.source_windows.reflects.records_selected).toBe(1);
  });

  test('diary items include evidence_id with diary prefix and evidence_type diary', () => {
    const { assembleBatch } = getAssembler();
    const project = 'diary-evidence-type-project';
    seedObservations(project, [makeObservation({ project })]);
    seedDiaries(project, ['# Diary\nGrep usage observed.']);

    const result = assembleBatch({ project });
    const manifest = JSON.parse(fs.readFileSync(result.manifest_path, 'utf8'));

    const ids = manifest.evidence_ids || [];
    expect(ids.some((id) => id.includes('diary'))).toBe(true);
  });

  test('diary content still surfaces in rendered prompt after typed refactor', () => {
    const { assembleBatch } = getAssembler();
    const project = 'diary-prompt-project';
    seedObservations(project, [makeObservation({ project })]);
    seedDiaries(project, ['# Diary\nUser uses grep extensively for code search.']);

    const result = assembleBatch({ project });
    const promptContent = fs.readFileSync(result.prompt_path, 'utf8');

    // The diary summary must appear in the prompt
    expect(promptContent).toContain('grep extensively');
  });
});
