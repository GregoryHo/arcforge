// tests/scripts/learning-schemas.test.js
//
// v6 schema tests for the three on-disk formats the learning workflow writes.
//
// Each format gets the SAME two-sided treatment, because either side alone is
// worthless:
//   1. ROUND TRIP — the real writer's real output must validate clean. This is
//      what binds the validator to the owner: change what the writer emits and
//      this half turns red.
//   2. NEGATIVE SAMPLES — a battery of malformed files, each of which must be
//      rejected with the matching error. A validator that only ever sees good
//      input is vacuous; these samples are the proof it discriminates.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateInstinctFile,
  validateDiaryPath,
  validateOperationRecord,
  INSTINCT_REQUIRED_KEYS,
  RECORD_COMMON_KEYS,
} = require('../../scripts/lib/learning-schemas');

const { saveInstinct } = require('../../scripts/lib/instinct-writer');
const {
  saveReflectionRecord,
  saveRecallRecord,
} = require('../../scripts/lib/operation-record-writer');
const { resolveDiaryPath, writeDiary } = require('../../scripts/lib/learning-workflow');
const { contradictInstinct } = require('../../scripts/lib/instinct-feedback');

/** Run a body with ARCFORGE_HOME pointed at a throwaway directory. */
function withIsolatedHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-home-'));
  const previous = process.env.ARCFORGE_HOME;
  process.env.ARCFORGE_HOME = home;
  try {
    return fn(home);
  } finally {
    if (previous === undefined) delete process.env.ARCFORGE_HOME;
    else process.env.ARCFORGE_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

const GOOD_INSTINCT = [
  '---',
  'id: grep-before-edit',
  'trigger: "before editing a file"',
  'action: "grep for callers first"',
  'domain: workflow',
  'source: manual',
  'confidence: 0.55',
  'extracted: 2026-08-13',
  'last_confirmed: 2026-08-13',
  'confirmations: 0',
  'contradictions: 0',
  'evidence: ""',
  '---',
  '',
  '# Grep Before Edit',
  '',
  '## Trigger',
  'before editing a file',
  '',
  '## Action',
  'grep for callers first',
  '',
].join('\n');

/** Rebuild GOOD_INSTINCT with one frontmatter line replaced or removed. */
function mutateInstinct(key, replacement) {
  return GOOD_INSTINCT.split('\n')
    .map((line) => (line.startsWith(`${key}:`) ? replacement : line))
    .filter((line) => line !== null)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Instinct file schema
// ---------------------------------------------------------------------------

describe('instinct file schema', () => {
  it('accepts the file saveInstinct actually writes (round trip)', () => {
    withIsolatedHome(() => {
      const { path: filePath } = saveInstinct({
        id: 'schema-round-trip',
        trigger: 'when the schema test runs',
        action: 'validate the real output',
        project: 'schema-proj',
        domain: 'testing',
        source: 'manual',
        evidence: 'the round trip itself',
        evidenceCount: 2,
      });

      const check = validateInstinctFile(fs.readFileSync(filePath, 'utf-8'));
      expect(check.errors).toEqual([]);
      expect(check.valid).toBe(true);
    });
  });

  it('accepts an archived instinct, which carries an extra archived_at key', () => {
    withIsolatedHome(() => {
      saveInstinct({
        id: 'schema-archived',
        trigger: 't',
        action: 'a',
        project: 'schema-proj',
        source: 'observation',
      });
      // Drive confidence under the archive threshold through the real path.
      let result;
      for (let i = 0; i < 10; i++) {
        result = contradictInstinct('schema-archived', 'schema-proj');
        if (result.archived) break;
      }
      expect(result.archived).toBe(true);

      const check = validateInstinctFile(fs.readFileSync(result.path, 'utf-8'));
      expect(check.errors).toEqual([]);
    });
  });

  it('accepts the hand-written good sample', () => {
    expect(validateInstinctFile(GOOD_INSTINCT).valid).toBe(true);
  });

  it('rejects a file with no frontmatter block', () => {
    const check = validateInstinctFile('# Just a heading\n\n## Action\ndo it\n');
    expect(check.valid).toBe(false);
    expect(check.errors[0]).toMatch(/must open with a --- delimited frontmatter block/);
  });

  it.each(INSTINCT_REQUIRED_KEYS)('rejects a file missing %s', (key) => {
    const bad = GOOD_INSTINCT.split('\n')
      .filter((line) => !line.startsWith(`${key}:`))
      .join('\n');
    const check = validateInstinctFile(bad);
    expect(check.valid).toBe(false);
    expect(check.errors).toContain(`missing required frontmatter key: ${key}`);
  });

  it('rejects a confidence above 1', () => {
    const check = validateInstinctFile(mutateInstinct('confidence', 'confidence: 1.4'));
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/confidence must be within 0\.\.1/);
  });

  it('rejects a negative confidence', () => {
    const check = validateInstinctFile(mutateInstinct('confidence', 'confidence: -0.2'));
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/confidence must be within 0\.\.1/);
  });

  it('rejects a non-numeric confidence', () => {
    const check = validateInstinctFile(mutateInstinct('confidence', 'confidence: high'));
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/confidence must be a number/);
  });

  it('rejects a negative confirmations counter', () => {
    const check = validateInstinctFile(mutateInstinct('confirmations', 'confirmations: -3'));
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/confirmations must be a non-negative integer/);
  });

  it('rejects an unknown source', () => {
    const check = validateInstinctFile(mutateInstinct('source', 'source: telepathy'));
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/source must be one of/);
  });

  it('rejects a body with no ## Action section', () => {
    const bad = GOOD_INSTINCT.replace(
      '## Action\ngrep for callers first',
      'grep for callers first',
    );
    const check = validateInstinctFile(bad);
    expect(check.valid).toBe(false);
    expect(check.errors).toContain('missing required body section: ## Action');
  });

  it('rejects a body with no ## Trigger section', () => {
    const bad = GOOD_INSTINCT.replace('## Trigger\nbefore editing a file', 'before editing a file');
    const check = validateInstinctFile(bad);
    expect(check.valid).toBe(false);
    expect(check.errors).toContain('missing required body section: ## Trigger');
  });
});

// ---------------------------------------------------------------------------
// Diary path schema
// ---------------------------------------------------------------------------

describe('diary path schema', () => {
  it('accepts the path the diary helpers actually produce (round trip)', () => {
    withIsolatedHome(() => {
      const resolved = resolveDiaryPath({
        project: 'schema-proj',
        date: '2026-08-13',
        session: 'sess-1',
      });
      expect(validateDiaryPath(resolved).errors).toEqual([]);
      expect(validateDiaryPath(resolved, { draft: false }).valid).toBe(true);
    });
  });

  it('accepts the draft path the helpers produce, and marks it as a draft', () => {
    withIsolatedHome(() => {
      const draftPath = resolveDiaryPath({
        project: 'schema-proj',
        date: '2026-08-13',
        session: 'sess-1',
        draft: true,
      });
      expect(validateDiaryPath(draftPath, { draft: true }).valid).toBe(true);
      expect(validateDiaryPath(draftPath, { draft: false }).valid).toBe(false);
    });
  });

  it('accepts the path a real diary write lands on', () => {
    withIsolatedHome(() => {
      const { path: written } = writeDiary({
        project: 'schema-proj',
        date: '2026-08-13',
        session: 'sess-2',
        content: '# diary\n',
      });
      expect(fs.existsSync(written)).toBe(true);
      expect(validateDiaryPath(written).errors).toEqual([]);
    });
  });

  it('rejects an empty path', () => {
    expect(validateDiaryPath('').valid).toBe(false);
  });

  it('rejects a path not under a diaries root', () => {
    const check = validateDiaryPath('/home/u/.arcforge/journals/proj/2026-08-13/diary-s.md');
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/must live under a "diaries" root/);
  });

  it('rejects a non-ISO date directory', () => {
    const check = validateDiaryPath('/home/u/.arcforge/diaries/proj/aug-2026/diary-s.md');
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/must be YYYY-MM-DD/);
  });

  it('rejects a filename that is not diary-<session>.md', () => {
    const check = validateDiaryPath('/home/u/.arcforge/diaries/proj/2026-08-13/notes.md');
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/must be diary-<session>/);
  });

  it('rejects a diary file with no date directory between project and file', () => {
    const check = validateDiaryPath('/home/u/.arcforge/diaries/proj/diary-s.md');
    expect(check.valid).toBe(false);
  });

  it('refuses to build a path from a traversing project name', () => {
    withIsolatedHome(() => {
      expect(() =>
        resolveDiaryPath({ project: '../../etc', date: '2026-08-13', session: 's' }),
      ).toThrow(/project is not a valid path segment/);
    });
  });

  it('refuses to build a path from a date containing a separator', () => {
    withIsolatedHome(() => {
      expect(() => resolveDiaryPath({ project: 'p', date: '2026/08/13', session: 's' })).toThrow(
        /date is not a valid path segment/,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Operation record schema
// ---------------------------------------------------------------------------

describe('operation record schema', () => {
  let home;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-records-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  const readRecord = (kind, project, id) =>
    fs.readFileSync(
      path.join(
        home,
        '.arcforge',
        kind === 'reflect' ? 'reflections' : 'recalls',
        project,
        `${id}.md`,
      ),
      'utf-8',
    );

  it('accepts the reflection record the writer actually emits (round trip)', () => {
    saveReflectionRecord({
      reflect_id: 'reflect-schema-1',
      project: 'schema-proj',
      project_id: 'pid',
      session: 'sess',
      created_at: '2026-08-13T01:00:00.000Z',
      source_diary_ids: ['diary-a.md'],
      summary: 'a summary',
      homeDir: home,
    });

    const check = validateOperationRecord(
      readRecord('reflect', 'schema-proj', 'reflect-schema-1'),
      'reflect',
    );
    expect(check.errors).toEqual([]);
  });

  it('accepts a reflection record with no source diaries', () => {
    saveReflectionRecord({
      reflect_id: 'reflect-schema-empty',
      project: 'schema-proj',
      source_diary_ids: [],
      homeDir: home,
    });
    expect(
      validateOperationRecord(
        readRecord('reflect', 'schema-proj', 'reflect-schema-empty'),
        'reflect',
      ).errors,
    ).toEqual([]);
  });

  it('accepts the recall record the writer actually emits (round trip)', () => {
    saveRecallRecord({
      recall_id: 'recall-schema-1',
      project: 'schema-proj',
      project_id: 'pid',
      session: 'sess',
      created_at: '2026-08-13T01:00:00.000Z',
      recall_query: 'grep patterns',
      returned_instinct_ids: ['grep-before-edit'],
      summary: 'a summary',
      homeDir: home,
    });

    const check = validateOperationRecord(
      readRecord('recall', 'schema-proj', 'recall-schema-1'),
      'recall',
    );
    expect(check.errors).toEqual([]);
  });

  it('rejects an unknown record kind', () => {
    const check = validateOperationRecord('---\nx: 1\n---\n', 'daydream');
    expect(check.valid).toBe(false);
    expect(check.errors[0]).toMatch(/unknown operation record kind/);
  });

  it('rejects a record with no frontmatter block', () => {
    const check = validateOperationRecord('# Reflection\n\nbody only\n', 'reflect');
    expect(check.valid).toBe(false);
    expect(check.errors[0]).toMatch(/must open with a --- delimited frontmatter block/);
  });

  it('rejects a reflect record whose id lacks the reflect- prefix', () => {
    const bad = [
      '---',
      'reflect_id: summary-2026-08',
      'project: p',
      'project_id: ',
      'session: ',
      'created_at: 2026-08-13T01:00:00.000Z',
      'source: reflection',
      'source_diary_ids: []',
      '---',
      '',
    ].join('\n');
    const check = validateOperationRecord(bad, 'reflect');
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/must start with "reflect-"/);
  });

  it('rejects a recall record whose id lacks the recall- prefix', () => {
    const bad = [
      '---',
      'recall_id: remembered-thing',
      'project: p',
      'project_id: ',
      'session: ',
      'created_at: 2026-08-13T01:00:00.000Z',
      'source: manual',
      'recall_query: q',
      'returned_instinct_ids: []',
      '---',
      '',
    ].join('\n');
    const check = validateOperationRecord(bad, 'recall');
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/must start with "recall-"/);
  });

  it.each(RECORD_COMMON_KEYS)('rejects a reflect record missing %s', (key) => {
    const lines = [
      '---',
      'reflect_id: reflect-x',
      'project: p',
      'project_id: ',
      'session: ',
      'created_at: 2026-08-13T01:00:00.000Z',
      'source: reflection',
      'source_diary_ids: []',
      '---',
      '',
    ].filter((line) => !line.startsWith(`${key}:`));
    const check = validateOperationRecord(lines.join('\n'), 'reflect');
    expect(check.valid).toBe(false);
    expect(check.errors).toContain(`missing required frontmatter key: ${key}`);
  });

  it('rejects a reflect record missing source_diary_ids', () => {
    const bad = [
      '---',
      'reflect_id: reflect-x',
      'project: p',
      'project_id: ',
      'session: ',
      'created_at: 2026-08-13T01:00:00.000Z',
      'source: reflection',
      '---',
      '',
    ].join('\n');
    const check = validateOperationRecord(bad, 'reflect');
    expect(check.errors).toContain('missing required frontmatter key: source_diary_ids');
  });

  it('rejects a record with a non-ISO created_at', () => {
    const bad = [
      '---',
      'recall_id: recall-x',
      'project: p',
      'project_id: ',
      'session: ',
      'created_at: last tuesday',
      'source: manual',
      'recall_query: q',
      'returned_instinct_ids: []',
      '---',
      '',
    ].join('\n');
    const check = validateOperationRecord(bad, 'recall');
    expect(check.valid).toBe(false);
    expect(check.errors.join(' ')).toMatch(/created_at must be an ISO timestamp/);
  });

  it('rejects a record with an empty project', () => {
    const bad = [
      '---',
      'recall_id: recall-x',
      'project: ',
      'project_id: ',
      'session: ',
      'created_at: 2026-08-13T01:00:00.000Z',
      'source: manual',
      'recall_query: q',
      'returned_instinct_ids: []',
      '---',
      '',
    ].join('\n');
    const check = validateOperationRecord(bad, 'recall');
    expect(check.valid).toBe(false);
    expect(check.errors).toContain('project must not be empty');
  });
});
