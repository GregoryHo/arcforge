// tests/scripts/operation-record-roundtrip.test.js
//
// ICL-5 round-trip: a reflect/recall record written by operation-record-writer.js
// MUST be picked up by the learning-curator batch-assembler. The coupling is the
// filename prefix — the writer fail-fasts on a missing prefix, and the assembler
// only matches ^reflect-.*\.md$ / ^recall-.*\.md$. If the schemas ever diverge
// this test goes red instead of the record silently vanishing.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let tmpDir;
let homedirSpy;

beforeEach(() => {
  jest.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-roundtrip-test-'));
  // The assembler reads os.homedir() at call time — redirect it to the tmp HOME.
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

function getWriter() {
  return require('../../scripts/lib/operation-record-writer');
}

function getAssembler() {
  return require('../../scripts/lib/learning-curator/batch-assembler');
}

function readManifest(result) {
  return JSON.parse(fs.readFileSync(result.manifest_path, 'utf8'));
}

describe('operation-record-writer → batch-assembler round-trip', () => {
  test('a reflect record written by the writer is selected by the assembler', () => {
    const { saveReflectionRecord } = getWriter();
    const project = 'roundtrip-project';

    saveReflectionRecord({
      reflect_id: 'reflect-20260615T010000Z-aaaa1111',
      project,
      project_id: 'proj_roundtrip',
      session: 'session-rt',
      created_at: '2026-06-15T01:00:00.000Z',
      source_diary_ids: ['diary-1', 'diary-2'],
      summary: 'Reflected on grep-before-edit pattern.',
      homeDir: tmpDir,
    });

    const { assembleBatch } = getAssembler();
    const result = assembleBatch({ project });
    const manifest = readManifest(result);

    expect(manifest.source_windows.reflects.records_scanned).toBe(1);
    expect(manifest.source_windows.reflects.records_selected).toBe(1);
  });

  test('a recall record written by the writer is selected by the assembler', () => {
    const { saveRecallRecord } = getWriter();
    const project = 'roundtrip-project';

    saveRecallRecord({
      recall_id: 'recall-20260615T010000Z-bbbb2222',
      project,
      project_id: 'proj_roundtrip',
      session: 'session-rt',
      created_at: '2026-06-15T01:00:00.000Z',
      recall_query: 'grep patterns',
      returned_instinct_ids: ['grep-before-edit'],
      summary: 'Recalled grep instinct.',
      homeDir: tmpDir,
    });

    const { assembleBatch } = getAssembler();
    const result = assembleBatch({ project });
    const manifest = readManifest(result);

    expect(manifest.source_windows.recalls.records_scanned).toBe(1);
    expect(manifest.source_windows.recalls.records_selected).toBe(1);
    expect(manifest.quality_inputs.signal_mix.has_manual_recall).toBe(true);
  });
});

describe('operation-record-writer prefix fail-fast (assembler-match guard)', () => {
  test('reflect id without "reflect-" prefix throws', () => {
    const { saveReflectionRecord } = getWriter();
    expect(() =>
      saveReflectionRecord({
        reflect_id: '20260615-no-prefix',
        project: 'p',
        project_id: '',
        session: '',
        created_at: '2026-06-15T01:00:00.000Z',
        source_diary_ids: [],
        summary: '',
        homeDir: tmpDir,
      }),
    ).toThrow(/must start with "reflect-"/);
  });

  test('recall id without "recall-" prefix throws', () => {
    const { saveRecallRecord } = getWriter();
    expect(() =>
      saveRecallRecord({
        recall_id: '20260615-no-prefix',
        project: 'p',
        project_id: '',
        session: '',
        created_at: '2026-06-15T01:00:00.000Z',
        recall_query: '',
        returned_instinct_ids: [],
        summary: '',
        homeDir: tmpDir,
      }),
    ).toThrow(/must start with "recall-"/);
  });

  test('a prefix-violating reflect id is never silently dropped by the assembler', () => {
    // Confirm the negative side of the coupling: had the writer NOT fail-fast,
    // a non-prefixed file would be invisible to the assembler. We seed a raw,
    // wrongly-named file and verify the assembler skips it — which is exactly
    // why the writer must reject the id up front.
    const { saveReflectionRecord } = getWriter();
    const project = 'guard-project';

    // Manually write a wrongly-named record (bypassing the writer's guard).
    const dir = path.join(tmpDir, '.arcforge', 'reflections', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bad-name.md'), '---\nreflect_id: bad-name\n---\n');

    // And a correctly-prefixed one via the writer.
    saveReflectionRecord({
      reflect_id: 'reflect-good-id',
      project,
      project_id: '',
      session: '',
      created_at: '2026-06-15T01:00:00.000Z',
      source_diary_ids: [],
      summary: 'good',
      homeDir: tmpDir,
    });

    const { assembleBatch } = getAssembler();
    const manifest = readManifest(assembleBatch({ project }));

    // Only the prefixed record is scanned/selected — the bad-name one is invisible.
    expect(manifest.source_windows.reflects.records_scanned).toBe(1);
    expect(manifest.source_windows.reflects.records_selected).toBe(1);
  });
});
