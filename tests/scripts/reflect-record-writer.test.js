// tests/scripts/reflect-record-writer.test.js
//
// Criterion 1: reflect-record-writer.js saves operation records to
// ~/.arcforge/reflections/<project>/<reflect_id>.md with atomic write.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-reflect-record-test-'));
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

describe('saveReflectionRecord — basic write', () => {
  test('writes file at ~/.arcforge/reflections/<project>/<reflect_id>.md', () => {
    const { saveReflectionRecord } = getWriter();
    const reflectId = 'reflect-20260522T010000Z-abcd1234';
    saveReflectionRecord({
      reflect_id: reflectId,
      project: 'test-project',
      project_id: 'proj_abc123456789ab',
      session: 'session-abc',
      created_at: '2026-05-22T01:00:00.000Z',
      source_diary_ids: ['diary-1.md', 'diary-2.md'],
      summary: 'Reflected on two sessions and found grep pattern.',
      homeDir: tmpDir,
    });

    const expectedPath = path.join(
      tmpDir,
      '.arcforge',
      'reflections',
      'test-project',
      `${reflectId}.md`,
    );
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  test('file contains YAML frontmatter with required fields', () => {
    const { saveReflectionRecord } = getWriter();
    const reflectId = 'reflect-20260522T010000Z-abcd1234';
    saveReflectionRecord({
      reflect_id: reflectId,
      project: 'test-project',
      project_id: 'proj_abc123456789ab',
      session: 'session-abc',
      created_at: '2026-05-22T01:00:00.000Z',
      source_diary_ids: ['diary-1.md', 'diary-2.md'],
      summary: 'Pattern found: grep first.',
      homeDir: tmpDir,
    });

    const filePath = path.join(
      tmpDir,
      '.arcforge',
      'reflections',
      'test-project',
      `${reflectId}.md`,
    );
    const content = fs.readFileSync(filePath, 'utf8');

    // Must begin with YAML frontmatter
    expect(content).toMatch(/^---\n/);
    expect(content).toContain(`reflect_id: ${reflectId}`);
    expect(content).toContain('project: test-project');
    expect(content).toContain('project_id: proj_abc123456789ab');
    expect(content).toContain('session: session-abc');
    expect(content).toContain('created_at: ');
    expect(content).toContain('source: reflection');
  });

  test('file body contains summary', () => {
    const { saveReflectionRecord } = getWriter();
    const reflectId = 'reflect-20260522T010000Z-abcd1234';
    saveReflectionRecord({
      reflect_id: reflectId,
      project: 'myproject',
      project_id: 'proj_xyz',
      session: 'session-1',
      created_at: '2026-05-22T01:00:00.000Z',
      source_diary_ids: [],
      summary: 'User always runs grep before editing files.',
      homeDir: tmpDir,
    });

    const filePath = path.join(tmpDir, '.arcforge', 'reflections', 'myproject', `${reflectId}.md`);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('User always runs grep before editing files.');
  });

  test('writes atomically — no partial file on crash', () => {
    // Atomic write means file is either fully present or absent.
    // We verify the .tmp file is cleaned up after write.
    const { saveReflectionRecord } = getWriter();
    const reflectId = 'reflect-20260522T010000Z-ef567890';
    saveReflectionRecord({
      reflect_id: reflectId,
      project: 'atomic-project',
      project_id: 'proj_atomic',
      session: 'session-x',
      created_at: '2026-05-22T01:00:00.000Z',
      source_diary_ids: [],
      summary: 'Atomic write test.',
      homeDir: tmpDir,
    });

    const filePath = path.join(
      tmpDir,
      '.arcforge',
      'reflections',
      'atomic-project',
      `${reflectId}.md`,
    );
    const tmpFilePath = `${filePath}.tmp`;

    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(tmpFilePath)).toBe(false);
  });

  test('creates parent directories recursively', () => {
    const { saveReflectionRecord } = getWriter();
    const reflectId = 'reflect-20260522T010000Z-11223344';
    // Project with slashes-free name — just verify dir creation
    saveReflectionRecord({
      reflect_id: reflectId,
      project: 'brand-new-project',
      project_id: 'proj_new',
      session: 'session-y',
      created_at: '2026-05-22T01:00:00.000Z',
      source_diary_ids: [],
      summary: 'New project reflection.',
      homeDir: tmpDir,
    });

    const dir = path.join(tmpDir, '.arcforge', 'reflections', 'brand-new-project');
    expect(fs.existsSync(dir)).toBe(true);
  });
});
