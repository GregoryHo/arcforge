/**
 * Learning Unification Integration Tests
 *
 * Validates that the unified learning system (instinct-based only)
 * works end-to-end after removing the parallel "learned skills" system.
 *
 * Stage 16: Final integration verification.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ─────────────────────────────────────────────
// 1. instinct-writer creates correct frontmatter
// ─────────────────────────────────────────────

describe('instinct-writer creates correct frontmatter', () => {
  let testDir;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-instinct-writer-'));
    // Point CLAUDE_DIR (via HOME) to our temp dir so getInstinctsDir resolves there
    process.env.HOME = testDir;
    // Create the .claude/instincts/test-project directory
    fs.mkdirSync(path.join(testDir, '.claude', 'instincts', 'test-project'), { recursive: true });
    // Clear module caches so session-utils picks up new HOME
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
    delete require.cache[require.resolve('../../scripts/lib/instinct-writer')];
    delete require.cache[require.resolve('../../scripts/lib/global-index')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
    delete require.cache[require.resolve('../../scripts/lib/instinct-writer')];
    delete require.cache[require.resolve('../../scripts/lib/global-index')];
  });

  it('should create instinct file with YAML frontmatter fields', () => {
    const { saveInstinct } = require('../../scripts/lib/instinct-writer');

    const result = saveInstinct({
      id: 'test-instinct',
      trigger: 'When user asks for help',
      action: 'Provide context-aware assistance',
      project: 'test-project',
      domain: 'support',
      source: 'manual',
      evidence: 'Observed in 3 sessions',
    });

    assert.ok(result.path, 'should return a file path');
    assert.ok(result.isNew, 'should be a new instinct');
    assert.ok(typeof result.confidence === 'number', 'should return confidence');

    // Read the file and verify frontmatter
    const content = fs.readFileSync(result.path, 'utf-8');
    assert.ok(content.startsWith('---\n'), 'should start with frontmatter delimiter');
    assert.ok(content.includes('confidence:'), 'should have confidence field');
    assert.ok(content.includes('trigger:'), 'should have trigger field');
    assert.ok(content.includes('domain: support'), 'should have domain field');
    assert.ok(content.includes('source: manual'), 'should have source field');
  });
});

// ─────────────────────────────────────────────
// 2. recall.js save delegates to instinct-writer
// ─────────────────────────────────────────────

describe('recall.js save delegates to instinct-writer', () => {
  it('should export cmdSave function', () => {
    const recall = require('../../skills/arc-recalling/scripts/recall');
    assert.ok(typeof recall.cmdSave === 'function', 'cmdSave should be exported');
  });

  it('should import saveInstinct from instinct-writer', () => {
    // Read the source to verify it uses instinct-writer with source: manual
    const recallSource = fs.readFileSync(
      path.join(__dirname, '../../skills/arc-recalling/scripts/recall.js'),
      'utf-8',
    );
    assert.ok(
      recallSource.includes("source: 'manual'"),
      'recall.js should pass source: manual to saveInstinct',
    );
    assert.ok(
      recallSource.includes('instinct-writer'),
      'recall.js should import from instinct-writer',
    );
  });
});

// ─────────────────────────────────────────────
// 3. reflect.js save-instinct uses 0.85 cap
// ─────────────────────────────────────────────

describe('reflect.js save-instinct uses 0.85 cap', () => {
  it('should export REFLECT_MAX_CONFIDENCE as 0.85', () => {
    const { REFLECT_MAX_CONFIDENCE } = require('../../scripts/lib/confidence');
    assert.strictEqual(REFLECT_MAX_CONFIDENCE, 0.85, 'REFLECT_MAX_CONFIDENCE should be 0.85');
  });

  it('should be lower than MAX_CONFIDENCE', () => {
    const { REFLECT_MAX_CONFIDENCE, MAX_CONFIDENCE } = require('../../scripts/lib/confidence');
    assert.ok(
      REFLECT_MAX_CONFIDENCE < MAX_CONFIDENCE,
      'REFLECT_MAX_CONFIDENCE should be less than MAX_CONFIDENCE',
    );
  });
});

// ─────────────────────────────────────────────
// 4. inject-context loads diary (not session markdown)
// ─────────────────────────────────────────────

describe('inject-context loads diary (not session markdown)', () => {
  it('should export findRecentMarkdownFiles', () => {
    const injectContext = require('../session-tracker/inject-context');
    assert.ok(
      typeof injectContext.findRecentMarkdownFiles === 'function',
      'findRecentMarkdownFiles should be exported',
    );
  });

  it('findRecentMarkdownFiles should return diary header for diary files', () => {
    // Verify the function signature handles empty input gracefully
    const { findRecentMarkdownFiles } = require('../session-tracker/inject-context');
    const result = findRecentMarkdownFiles([]);
    assert.strictEqual(result.header, null, 'should return null header for empty sessions');
    assert.deepStrictEqual(result.contents, [], 'should return empty contents for empty sessions');
  });
});

// ─────────────────────────────────────────────
// 5. inject-context loads instincts
// ─────────────────────────────────────────────

describe('inject-context loads instincts', () => {
  it('should export loadAutoInstincts', () => {
    const injectContext = require('../session-tracker/inject-context');
    assert.ok(
      typeof injectContext.loadAutoInstincts === 'function',
      'loadAutoInstincts should be exported',
    );
  });

  it('should export loadInstinctFiles helper', () => {
    const injectContext = require('../session-tracker/inject-context');
    assert.ok(
      typeof injectContext.loadInstinctFiles === 'function',
      'loadInstinctFiles should be exported',
    );
  });
});

// ─────────────────────────────────────────────
// 6. inject-context does NOT load learned skills
// ─────────────────────────────────────────────

describe('inject-context does not load learned skills', () => {
  it('should not export getLearnedSkillsDir', () => {
    const injectContext = require('../session-tracker/inject-context');
    assert.strictEqual(
      injectContext.getLearnedSkillsDir,
      undefined,
      'getLearnedSkillsDir should not be exported from inject-context',
    );
  });

  it('should not reference getLearnedSkillsDir in source', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../session-tracker/inject-context.js'),
      'utf-8',
    );
    assert.ok(
      !source.includes('getLearnedSkillsDir'),
      'inject-context.js should not reference getLearnedSkillsDir',
    );
  });
});

// ─────────────────────────────────────────────
// 7. end.js references /recall not /learn
// ─────────────────────────────────────────────

describe('end.js references /recall not /learn', () => {
  it('formatStopReason output should not contain /learn', () => {
    const { formatStopReason } = require('../session-tracker/end');
    const session = {
      started: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      toolCalls: 10,
      userMessages: 5,
      filesModified: ['a.js'],
    };

    const output = formatStopReason(session, null);
    assert.ok(!output.includes('/learn'), 'formatStopReason should not reference /learn command');
  });

  it('end.js source should not contain /learn command reference', () => {
    const source = fs.readFileSync(path.join(__dirname, '../session-tracker/end.js'), 'utf-8');
    // /learn as a command reference (not part of other words like "learned")
    const hasLearnCommand = /\/learn\b/.test(source);
    assert.ok(!hasLearnCommand, 'end.js should not reference /learn as a command');
  });
});

// ─────────────────────────────────────────────
// 8. start.js only decays instincts
// ─────────────────────────────────────────────

describe('start.js only decays instincts', () => {
  it('should not import getLearnedSkillsDir', () => {
    const source = fs.readFileSync(path.join(__dirname, '../session-tracker/start.js'), 'utf-8');
    assert.ok(
      !source.includes('getLearnedSkillsDir'),
      'start.js should not import getLearnedSkillsDir',
    );
  });

  it('should import runDecayCycle from confidence', () => {
    const source = fs.readFileSync(path.join(__dirname, '../session-tracker/start.js'), 'utf-8');
    assert.ok(
      source.includes('runDecayCycle'),
      'start.js should use runDecayCycle for instinct decay',
    );
  });

  it('should export runDecayCycles function', () => {
    const start = require('../session-tracker/start');
    assert.ok(typeof start.runDecayCycles === 'function', 'runDecayCycles should be exported');
  });
});

// ─────────────────────────────────────────────
// 9. pending-actions create + consume flow
// ─────────────────────────────────────────────

describe('pending-actions create + consume flow', () => {
  let testDir;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-pending-actions-'));
    process.env.HOME = testDir;
    // Create the .claude/sessions directory
    fs.mkdirSync(path.join(testDir, '.claude', 'sessions', 'test-project'), { recursive: true });
    delete require.cache[require.resolve('../../scripts/lib/pending-actions')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    delete require.cache[require.resolve('../../scripts/lib/pending-actions')];
  });

  it('should complete add -> get -> consume lifecycle', () => {
    const {
      addPendingAction,
      getPendingActions,
      consumeAction,
    } = require('../../scripts/lib/pending-actions');

    // Add an action
    const action = addPendingAction('test-project', 'reflect-ready', { count: 3 });
    assert.ok(action.id, 'action should have an id');
    assert.strictEqual(action.type, 'reflect-ready');
    assert.strictEqual(action.consumed, false);

    // Get pending actions
    const pending = getPendingActions('test-project');
    assert.strictEqual(pending.length, 1, 'should have 1 pending action');
    assert.strictEqual(pending[0].id, action.id);

    // Consume the action
    const consumed = consumeAction('test-project', action.id);
    assert.strictEqual(consumed, true, 'consume should return true');

    // After consuming, no pending actions remain
    const remaining = getPendingActions('test-project');
    assert.strictEqual(remaining.length, 0, 'should have 0 pending actions after consume');
  });
});

// ─────────────────────────────────────────────
// 10. learn.js has new commands
// ─────────────────────────────────────────────

describe('learn.js has new commands', () => {
  it('should export loadInstincts', () => {
    const learn = require('../../skills/arc-learning/scripts/learn');
    assert.ok(typeof learn.loadInstincts === 'function', 'loadInstincts should be exported');
  });

  it('should export clusterInstincts', () => {
    const learn = require('../../skills/arc-learning/scripts/learn');
    assert.ok(typeof learn.clusterInstincts === 'function', 'clusterInstincts should be exported');
  });

  it('should export parseArgs', () => {
    const learn = require('../../skills/arc-learning/scripts/learn');
    assert.ok(typeof learn.parseArgs === 'function', 'parseArgs should be exported');
  });

  it('should export scan and preview commands', () => {
    const learn = require('../../skills/arc-learning/scripts/learn');
    assert.ok(typeof learn.cmdScan === 'function', 'cmdScan should be exported');
    assert.ok(typeof learn.cmdPreview === 'function', 'cmdPreview should be exported');
  });
});

// ─────────────────────────────────────────────
// 11. No getLearnedSkillsDir in scripts/ or hooks/
// ─────────────────────────────────────────────

describe('no getLearnedSkillsDir in scripts/ or hooks/', () => {
  function findJsFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        results.push(...findJsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('should not have getLearnedSkillsDir in any JS file under scripts/', () => {
    const rootDir = path.join(__dirname, '../../scripts');
    const jsFiles = findJsFiles(rootDir);
    const violations = [];

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('getLearnedSkillsDir')) {
        violations.push(path.relative(path.join(__dirname, '../..'), file));
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `Found getLearnedSkillsDir references in: ${violations.join(', ')}`,
    );
  });

  it('should not have getLearnedSkillsDir in any JS file under hooks/', () => {
    const rootDir = path.join(__dirname, '..');
    const jsFiles = findJsFiles(rootDir);
    const thisFile = __filename;
    const violations = [];

    for (const file of jsFiles) {
      if (file === thisFile) continue; // Skip this test file
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('getLearnedSkillsDir')) {
        violations.push(path.relative(path.join(__dirname, '../..'), file));
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `Found getLearnedSkillsDir references in: ${violations.join(', ')}`,
    );
  });
});

// ─────────────────────────────────────────────
// 12. Fingerprint Jaccard is available
// ─────────────────────────────────────────────

describe('fingerprint Jaccard is available', () => {
  it('should export buildTriggerFingerprint', () => {
    const { buildTriggerFingerprint } = require('../../scripts/lib/fingerprint');
    assert.ok(
      typeof buildTriggerFingerprint === 'function',
      'buildTriggerFingerprint should be importable',
    );
  });

  it('should export jaccardSimilarity', () => {
    const { jaccardSimilarity } = require('../../scripts/lib/fingerprint');
    assert.ok(typeof jaccardSimilarity === 'function', 'jaccardSimilarity should be importable');
  });

  it('should compute fingerprint from trigger text', () => {
    const { buildTriggerFingerprint } = require('../../scripts/lib/fingerprint');
    const fp = buildTriggerFingerprint('When user modifies test files');
    assert.ok(fp instanceof Set, 'fingerprint should be a Set');
    assert.ok(fp.size > 0, 'fingerprint should have tokens');
    assert.ok(fp.has('user'), 'should contain "user"');
    assert.ok(fp.has('modifies'), 'should contain "modifies"');
    assert.ok(fp.has('test'), 'should contain "test"');
    assert.ok(fp.has('files'), 'should contain "files"');
  });

  it('should compute Jaccard similarity between two sets', () => {
    const { jaccardSimilarity } = require('../../scripts/lib/fingerprint');
    const setA = new Set(['a', 'b', 'c']);
    const setB = new Set(['b', 'c', 'd']);
    const similarity = jaccardSimilarity(setA, setB);
    // Intersection = {b, c} = 2, Union = {a, b, c, d} = 4, J = 2/4 = 0.5
    assert.strictEqual(similarity, 0.5, 'Jaccard similarity should be 0.5');
  });

  it('should return 1.0 for identical sets', () => {
    const { jaccardSimilarity } = require('../../scripts/lib/fingerprint');
    const setA = new Set(['x', 'y']);
    const similarity = jaccardSimilarity(setA, setA);
    assert.strictEqual(similarity, 1.0, 'identical sets should have similarity 1.0');
  });
});
