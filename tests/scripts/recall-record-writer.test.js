// tests/scripts/recall-record-writer.test.js
//
// Criterion 1: operation-record-writer.js saves recall operation records to
// ~/.arcforge/recalls/<project>/<recall_id>.md with atomic write.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-recall-record-test-'));
  jest.resetModules();
});

afterEach(() => {
  jest.resetModules();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});

function getWriter() {
  return require('../../scripts/lib/operation-record-writer');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('saveRecallRecord — basic write', () => {
  test('writes file at ~/.arcforge/recalls/<project>/<recall_id>.md', () => {
    const { saveRecallRecord } = getWriter();
    const recallId = 'recall-20260522T010000Z-abcd1234';
    saveRecallRecord({
      recall_id: recallId,
      project: 'test-project',
      project_id: 'proj_abc123456789ab',
      session: 'session-abc',
      created_at: '2026-05-22T01:00:00.000Z',
      recall_query: 'grep patterns',
      returned_instinct_ids: ['grep-before-edit', 'search-first'],
      summary: 'Recalled grep instincts for this session.',
      homeDir: tmpDir,
    });

    const expectedPath = path.join(
      tmpDir,
      '.arcforge',
      'recalls',
      'test-project',
      `${recallId}.md`,
    );
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  test('file contains YAML frontmatter with required fields', () => {
    const { saveRecallRecord } = getWriter();
    const recallId = 'recall-20260522T010000Z-abcd1234';
    saveRecallRecord({
      recall_id: recallId,
      project: 'test-project',
      project_id: 'proj_abc123456789ab',
      session: 'session-abc',
      created_at: '2026-05-22T01:00:00.000Z',
      recall_query: 'grep patterns',
      returned_instinct_ids: ['grep-before-edit'],
      summary: 'Found relevant grep instinct.',
      homeDir: tmpDir,
    });

    const filePath = path.join(tmpDir, '.arcforge', 'recalls', 'test-project', `${recallId}.md`);
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toMatch(/^---\n/);
    expect(content).toContain(`recall_id: ${recallId}`);
    expect(content).toContain('project: test-project');
    expect(content).toContain('project_id: proj_abc123456789ab');
    expect(content).toContain('session: session-abc');
    expect(content).toContain('created_at: ');
    expect(content).toContain('source: manual');
  });

  test('file body contains summary', () => {
    const { saveRecallRecord } = getWriter();
    const recallId = 'recall-20260522T010000Z-abcd1234';
    saveRecallRecord({
      recall_id: recallId,
      project: 'myproject',
      project_id: 'proj_xyz',
      session: 'session-1',
      created_at: '2026-05-22T01:00:00.000Z',
      recall_query: 'test query',
      returned_instinct_ids: [],
      summary: 'No instincts matched the query.',
      homeDir: tmpDir,
    });

    const filePath = path.join(tmpDir, '.arcforge', 'recalls', 'myproject', `${recallId}.md`);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('No instincts matched the query.');
  });

  test('writes atomically — tmp file cleaned up after write', () => {
    const { saveRecallRecord } = getWriter();
    const recallId = 'recall-20260522T010000Z-ef567890';
    saveRecallRecord({
      recall_id: recallId,
      project: 'atomic-project',
      project_id: 'proj_atomic',
      session: 'session-x',
      created_at: '2026-05-22T01:00:00.000Z',
      recall_query: 'atomic',
      returned_instinct_ids: [],
      summary: 'Atomic write test.',
      homeDir: tmpDir,
    });

    const filePath = path.join(tmpDir, '.arcforge', 'recalls', 'atomic-project', `${recallId}.md`);
    const tmpFilePath = `${filePath}.tmp`;

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(tmpFilePath)).toBe(false);
  });

  test('creates parent directories recursively', () => {
    const { saveRecallRecord } = getWriter();
    const recallId = 'recall-20260522T010000Z-11223344';
    saveRecallRecord({
      recall_id: recallId,
      project: 'brand-new-recall-project',
      project_id: 'proj_new',
      session: 'session-y',
      created_at: '2026-05-22T01:00:00.000Z',
      recall_query: 'new query',
      returned_instinct_ids: [],
      summary: 'First recall in project.',
      homeDir: tmpDir,
    });

    const dir = path.join(tmpDir, '.arcforge', 'recalls', 'brand-new-recall-project');
    expect(fs.existsSync(dir)).toBe(true);
  });
});
