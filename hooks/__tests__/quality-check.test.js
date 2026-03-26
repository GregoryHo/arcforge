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

  it('should detect console.warn, console.error, console.debug, console.info', () => {
    const { checkConsoleLogs } = require('../quality-check/main');
    const filePath = path.join(testDir, 'test.js');
    fs.writeFileSync(
      filePath,
      'console.warn("w");\nconsole.error("e");\nconsole.debug("d");\nconsole.info("i");\n',
    );

    const result = checkConsoleLogs(filePath);
    assert.strictEqual(result.length, 4);
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
    assert.ok(result[0].content.length <= 60, `Content should be <= 60 chars, got ${result[0].content.length}`);
  });
});
