/**
 * ICL-3 — instinct keyspace migration wiring (hook layer).
 *
 * Verifies the two trigger points for the one-time, idempotent migration that
 * relocates stale hash-keyed instinct files into the canonical name-keyed dir:
 *   1. start.js main() (async background) — migrateInstincts(project)
 *   2. inject-context.js loadAutoInstincts(project) — lazy migration on a
 *      basename miss, closing the first-session window (S5-6).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SESSION_UTILS = '../../scripts/lib/session-utils';
const UTILS = '../../scripts/lib/utils';
const START = '../session-tracker/start';
const INJECT = '../session-tracker/inject-context';
const CONFIDENCE = '../../scripts/lib/confidence';

function clearCache() {
  for (const mod of [SESSION_UTILS, UTILS, START, INJECT, CONFIDENCE]) {
    const resolved = require.resolve(mod);
    delete require.cache[resolved];
  }
}

// Build an active instinct file: leading YAML frontmatter (so it is loadable /
// decayable) plus the embedded ```json scope block the migration reads.
function instinctFile(candidateId, project, projectId, confidence) {
  const scopeBlock = JSON.stringify(
    {
      schema_version: 1,
      candidate_id: candidateId,
      scope: { kind: 'project', project, project_id: projectId },
    },
    null,
    2,
  );
  return [
    '---',
    `id: ${candidateId}`,
    `confidence: ${confidence}`,
    'trigger: migrated instinct trigger',
    'domain: workflow',
    '---',
    '',
    '```json',
    scopeBlock,
    '```',
    '',
    '## Action',
    'do the thing',
    '',
  ].join('\n');
}

let testDir;
let projectRoot;
const originalEnv = { ...process.env };

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icl3-hook-mig-'));
  projectRoot = path.join(testDir, 'myproj');
  fs.mkdirSync(projectRoot, { recursive: true });
  process.env.HOME = testDir;
  process.env.CLAUDE_PROJECT_DIR = projectRoot;
  clearCache();
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  clearCache();
});

describe('start.js migrateInstincts', () => {
  it('relocates a stale hash-keyed instinct into the name-keyed dir', () => {
    const { getInstinctsDir } = require(SESSION_UTILS);
    const { getProjectName } = require(UTILS);
    const start = require(START);

    const project = getProjectName(); // == 'myproj'
    const hashDir = path.join(testDir, '.arcforge', 'instincts', 'proj-hash-zzz');
    fs.mkdirSync(hashDir, { recursive: true });
    fs.writeFileSync(
      path.join(hashDir, 'cand_start.md'),
      instinctFile('cand_start', project, 'proj-hash-zzz', 0.8),
    );

    const res = start.migrateInstincts(project);
    assert.deepStrictEqual(res.moved, ['cand_start.md']);

    const nameFile = path.join(getInstinctsDir(project), 'cand_start.md');
    assert.ok(fs.existsSync(nameFile), 'file should be in the name-keyed dir');
    assert.ok(
      !fs.existsSync(path.join(hashDir, 'cand_start.md')),
      'file should no longer be in the hash-keyed dir',
    );
  });

  it('is a safe no-op when there is nothing to migrate', () => {
    const start = require(START);
    const { getProjectName } = require(UTILS);
    const res = start.migrateInstincts(getProjectName());
    assert.deepStrictEqual(res, { moved: [], skipped: [] });
  });
});

describe('inject-context loadAutoInstincts — first-session window (S5-6)', () => {
  it('lazily migrates on a basename miss, then loads the migrated instinct', () => {
    const { getProjectName } = require(UTILS);
    const { getInstinctsDir } = require(SESSION_UTILS);
    const inject = require(INJECT);

    const project = getProjectName();
    // Stale file only in the hash dir; the name-keyed dir does not exist yet —
    // exactly the state when start.js (async) has not yet run.
    const hashDir = path.join(testDir, '.arcforge', 'instincts', 'proj-hash-www');
    fs.mkdirSync(hashDir, { recursive: true });
    fs.writeFileSync(
      path.join(hashDir, 'cand_inject.md'),
      instinctFile('cand_inject', project, 'proj-hash-www', 0.9),
    );

    const result = inject.loadAutoInstincts(project);

    // The instinct was migrated and then loaded (count reflects the high-conf
    // migrated file).
    assert.strictEqual(result.count, 1, 'migrated instinct should be loaded');
    assert.ok(/cand_inject/.test(result.text), 'loaded text should mention the instinct');

    // And it physically moved into the name-keyed dir.
    const nameFile = path.join(getInstinctsDir(project), 'cand_inject.md');
    assert.ok(fs.existsSync(nameFile), 'file should be migrated to the name-keyed dir');
  });
});
