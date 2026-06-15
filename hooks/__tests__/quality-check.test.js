const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('quality-check: checkConsoleLogs', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-quality-'));
    delete require.cache[require.resolve('../quality-check/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should detect console.log statements', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'test.js');
    fs.writeFileSync(filePath, 'const x = 1;\nconsole.log("hello");\nconst y = 2;\n');

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].line, 2);
  });

  it('should detect console.debug and console.info', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'test.js');
    fs.writeFileSync(filePath, 'console.debug("d");\nconsole.info("i");\n');

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 2);
  });

  it('should NOT flag console.warn or console.error (prescribed CLI error layer)', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'test.js');
    fs.writeFileSync(filePath, 'console.warn("w");\nconsole.error("e");\n');

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 0);
  });

  it('should skip lines starting with //', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'test.js');
    fs.writeFileSync(filePath, '// console.log("commented out");\nconsole.log("real");\n');

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].line, 2);
  });

  it('should skip lines starting with *', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'test.js');
    fs.writeFileSync(filePath, '* console.log("in jsdoc");\nconsole.log("real");\n');

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].line, 2);
  });

  it('should return empty array for file with no console statements', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'clean.js');
    fs.writeFileSync(filePath, 'const x = 1;\nconst y = 2;\n');

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 0);
  });

  it('should return empty array for nonexistent file', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const result = checkConsoleLogs(path.join(testDir, 'nonexistent.js'));
    assert.strictEqual(result.length, 0);
  });

  it('should return correct line numbers and content', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'test.js');
    fs.writeFileSync(filePath, 'const a = 1;\n\n\nconsole.log("on line 4");\n');

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].line, 4);
    assert.ok(result[0].content.includes('console.log'));
  });

  it('should truncate long content to 60 chars', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'test.js');
    const longLine = `console.log("${'a'.repeat(100)}");\n`;
    fs.writeFileSync(filePath, longLine);

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 1);
    assert.ok(
      result[0].content.length <= 60,
      `Content should be <= 60 chars, got ${result[0].content.length}`,
    );
  });
});

describe('quality-check: collectFindings buckets by audience (RV-3)', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-quality-buckets-'));
    delete require.cache[require.resolve('../quality-check/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('routes console.* findings to the model channel, never systemMessage', () => {
    const { collectFindings } = require('../quality-check/main');
    const file = path.join(testDir, 'app.js');
    fs.writeFileSync(file, 'console.log("debug");\n');
    // No prettier/typescript devDeps in the temp dir → no Formatted notice.
    const { modelReason, systemMessage } = collectFindings(file, file, testDir);
    assert.ok(modelReason?.includes('console.* found'), 'console finding → model');
    assert.ok(modelReason.includes('Line 1'), 'cites the line');
    assert.strictEqual(systemMessage, null, '`Formatted:` must never leak into systemMessage');
  });

  it('returns no findings for a clean file', () => {
    const { collectFindings } = require('../quality-check/main');
    const file = path.join(testDir, 'clean.js');
    fs.writeFileSync(file, 'const x = 1;\n');
    assert.deepStrictEqual(collectFindings(file, file, testDir), {
      modelReason: null,
      systemMessage: null,
    });
  });
});

describe('quality-check: main() channel routing (RV-3 e2e)', () => {
  const { spawnSync } = require('node:child_process');
  const script = path.join(__dirname, '..', 'quality-check', 'main.js');
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-quality-e2e-'));
  });
  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function run(filePath) {
    const input = {
      cwd: testDir,
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: { file_path: filePath },
    };
    return spawnSync('node', [script], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      timeout: 15000,
    });
  }

  it('emits exactly one JSON object carrying findings in the model channel', () => {
    const file = path.join(testDir, 'app.js');
    fs.writeFileSync(file, 'const x = 1;\nconsole.log("oops");\n');
    const r = run(file);
    const out = (r.stdout || '').trim();
    assert.ok(out, 'should produce stdout for a console.log finding');
    // Exactly one JSON object — a parse of the whole trimmed stdout must succeed.
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.includes('console.* found'),
      'finding must reach the model via additionalContext',
    );
    assert.ok(
      !('systemMessage' in parsed),
      'no Formatted notice (no prettier devDep) → no systemMessage key',
    );
  });

  it('stays silent for a clean file (no output, exit 0)', () => {
    const file = path.join(testDir, 'clean.js');
    fs.writeFileSync(file, 'const x = 1;\n');
    const r = run(file);
    assert.strictEqual((r.stdout || '').trim(), '', 'clean file → no output');
    assert.strictEqual(r.status, 0, 'exit 0');
  });
});

describe('quality-check: hooks.json registration', () => {
  const hooksJsonPath = path.join(__dirname, '..', 'hooks.json');

  it('should parse hooks.json and register quality-check once with plain "Edit|Write" matcher', () => {
    const config = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8'));
    const postToolUse = config.hooks.PostToolUse;
    assert.ok(Array.isArray(postToolUse), 'PostToolUse should be an array');

    const qualityCheckEntries = postToolUse.filter((entry) =>
      entry.hooks.some((h) => h.command.includes('quality-check/main.js')),
    );
    assert.strictEqual(
      qualityCheckEntries.length,
      1,
      `Expected exactly 1 quality-check entry, got ${qualityCheckEntries.length}`,
    );

    // Plain tool-name regex — the only matcher syntax verified to fire on
    // PostToolUse (v2.1.173). The ts/tsx/js/jsx gate lives in main.js.
    assert.strictEqual(
      qualityCheckEntries[0].matcher,
      'Edit|Write',
      `Matcher must be the plain tool-name regex "Edit|Write". Got: ${qualityCheckEntries[0].matcher}`,
    );
  });
});
