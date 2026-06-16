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

describe('quality-check: tsc incremental cost bound (RV-4)', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../quality-check/typescript')];
  });

  describe('buildTscArgs (arg construction)', () => {
    it('adds --incremental + --tsBuildInfoFile when a build-info path is given', () => {
      const { buildTscArgs } = require('../quality-check/typescript');
      const args = buildTscArgs(['tsc'], {
        tsconfigPath: '/proj/tsconfig.json',
        buildInfoPath: '/tmp/cache/abc.tsbuildinfo',
      });
      assert.deepStrictEqual(args, [
        'tsc',
        '--noEmit',
        '--pretty',
        'false',
        '--incremental',
        '--tsBuildInfoFile',
        '/tmp/cache/abc.tsbuildinfo',
        '--project',
        '/proj/tsconfig.json',
      ]);
      // --tsBuildInfoFile must immediately follow --incremental (required pairing).
      const inc = args.indexOf('--incremental');
      assert.strictEqual(
        args[inc + 1],
        '--tsBuildInfoFile',
        '--incremental needs the buildinfo flag',
      );
    });

    it('omits --incremental entirely when no build-info path is given (fallback shape)', () => {
      const { buildTscArgs } = require('../quality-check/typescript');
      const args = buildTscArgs(['tsc'], {
        tsconfigPath: '/proj/tsconfig.json',
        buildInfoPath: null,
      });
      assert.ok(!args.includes('--incremental'), 'no incremental flag in fallback');
      assert.ok(!args.includes('--tsBuildInfoFile'), 'no buildinfo flag in fallback');
      assert.ok(args.includes('--noEmit'), 'still a noEmit type-check');
      assert.ok(args.includes('--project'), 'still scoped to the tsconfig');
    });

    it('passes the executable args through and keeps --noEmit --pretty false', () => {
      const { buildTscArgs } = require('../quality-check/typescript');
      const args = buildTscArgs(['exec', 'tsc'], {});
      assert.deepStrictEqual(args.slice(0, 5), ['exec', 'tsc', '--noEmit', '--pretty', 'false']);
    });
  });

  describe('buildInfoPathFor (stable per-project cache)', () => {
    it('lives inside the OS tmpdir and is stable for a given project key', () => {
      const { buildInfoPathFor } = require('../quality-check/typescript');
      const a = buildInfoPathFor('/proj/tsconfig.json');
      const b = buildInfoPathFor('/proj/tsconfig.json');
      assert.strictEqual(a, b, 'same project → same cache file (so the 2nd run is warm)');
      assert.ok(a.startsWith(os.tmpdir()), 'cache lives in the OS tmpdir');
      assert.ok(a.endsWith('.tsbuildinfo'), 'ends with .tsbuildinfo');
    });

    it('gives different projects different cache files', () => {
      const { buildInfoPathFor } = require('../quality-check/typescript');
      assert.notStrictEqual(
        buildInfoPathFor('/proj-a/tsconfig.json'),
        buildInfoPathFor('/proj-b/tsconfig.json'),
      );
    });
  });

  describe('isIncrementalFlagRejected (back-off detector)', () => {
    it('detects TS5023 "Unknown compiler option" for --incremental (old tsc)', () => {
      const { isIncrementalFlagRejected } = require('../quality-check/typescript');
      assert.ok(
        isIncrementalFlagRejected("error TS5023: Unknown compiler option '--incremental'."),
      );
    });

    it('detects TS5074 (incremental requires tsBuildInfoFile)', () => {
      const { isIncrementalFlagRejected } = require('../quality-check/typescript');
      assert.ok(
        isIncrementalFlagRejected(
          "error TS5074: Option '--incremental' can only be specified using tsconfig, emitting to single file or when option '--tsBuildInfoFile' is specified.",
        ),
      );
    });

    it('does NOT treat a genuine source type error as a flag rejection', () => {
      const { isIncrementalFlagRejected } = require('../quality-check/typescript');
      assert.ok(
        !isIncrementalFlagRejected(
          "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.",
        ),
        'a real type error must not trigger the back-off (would mask the error)',
      );
    });

    it('does not back off on empty output', () => {
      const { isIncrementalFlagRejected } = require('../quality-check/typescript');
      assert.ok(!isIncrementalFlagRejected(''));
    });
  });

  describe('runTypeCheck fallback (stub tsc rejecting --incremental)', () => {
    let testDir;
    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-tsc-fallback-'));
    });
    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('retries WITHOUT --incremental and still type-checks (never silently dropped)', () => {
      const { runTypeCheck } = require('../quality-check/typescript');
      const file = path.join(testDir, 'a.ts');
      fs.writeFileSync(file, 'const x: number = "bad";\n');

      const calls = [];
      // Stub: a tsc that does not understand --incremental. First call (with the
      // flag) is rejected like an old compiler; second call (without it) does the
      // real type-check and surfaces the source error.
      const run = (_cmd, args) => {
        calls.push(args);
        if (args.includes('--incremental')) {
          return {
            stdout: '',
            stderr: "error TS5023: Unknown compiler option '--incremental'.",
            exitCode: 1,
          };
        }
        return {
          stdout: `${file}(1,7): error TS2322: Type 'string' is not assignable to type 'number'.`,
          stderr: '',
          exitCode: 2,
        };
      };

      const result = runTypeCheck(file, 'npm', { execCommand: 'stub-tsc', run });

      assert.strictEqual(calls.length, 2, 'first call backs off → exactly one retry');
      assert.ok(calls[0].includes('--incremental'), 'first attempt uses the fast path');
      assert.ok(!calls[1].includes('--incremental'), 'retry drops only the speedup flag');
      assert.strictEqual(result.errors.length, 1, 'the real type error still surfaces');
      assert.ok(
        result.errors[0].includes('TS2322'),
        'type-checking was NOT silently dropped on flag rejection',
      );
    });

    it('does not retry when the incremental run succeeds (fast path stays single-call)', () => {
      const { runTypeCheck } = require('../quality-check/typescript');
      const file = path.join(testDir, 'ok.ts');
      fs.writeFileSync(file, 'const x: number = 1;\n');

      const calls = [];
      const run = (_cmd, args) => {
        calls.push(args);
        return { stdout: '', stderr: '', exitCode: 0 };
      };
      const result = runTypeCheck(file, 'npm', { execCommand: 'stub-tsc', run });

      assert.strictEqual(calls.length, 1, 'success on the incremental path → no retry');
      assert.ok(calls[0].includes('--incremental'), 'used the incremental fast path');
      assert.deepStrictEqual(result, { errors: [], warnings: [] });
    });

    it('does not retry on a genuine type error (real errors are not flag rejections)', () => {
      const { runTypeCheck } = require('../quality-check/typescript');
      const file = path.join(testDir, 'bad.ts');
      fs.writeFileSync(file, 'const x: number = "bad";\n');

      const calls = [];
      const run = (_cmd, args) => {
        calls.push(args);
        return {
          stdout: `${file}(1,7): error TS2322: Type 'string' is not assignable to type 'number'.`,
          stderr: '',
          exitCode: 2,
        };
      };
      const result = runTypeCheck(file, 'npm', { execCommand: 'stub-tsc', run });

      assert.strictEqual(calls.length, 1, 'a real type error must not trigger a (futile) retry');
      assert.strictEqual(result.errors.length, 1);
    });
  });
});
