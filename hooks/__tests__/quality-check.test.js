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

describe('quality-check: PostToolUse is accumulate-only, findings batch at Stop (v5)', () => {
  const { spawnSync } = require('node:child_process');
  const script = path.join(__dirname, '..', 'quality-check', 'main.js');
  const originalTmpdir = process.env.TMPDIR;
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-quality-e2e-'));
    delete require.cache[require.resolve('../quality-check/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });
  afterEach(() => {
    // Restore TMPDIR before removing testDir — the accumulate test points TMPDIR
    // at testDir, and a leaked value breaks sibling describes' mkdtemp calls.
    if (originalTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmpdir;
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

  it('emits NOTHING on PostToolUse even when the file has a console.log finding', () => {
    const file = path.join(testDir, 'app.js');
    fs.writeFileSync(file, 'const x = 1;\nconsole.log("oops");\n');
    const r = run(file);
    // Findings are deferred to the Stop batch — the PostToolUse entry is silent.
    assert.strictEqual((r.stdout || '').trim(), '', 'accumulate-only → no PostToolUse output');
    assert.strictEqual(r.status, 0, 'exit 0');
  });

  it('accumulates the edited path and surfaces findings via the Stop batch, then clears', () => {
    const { setSessionIdFromInput, clearCachedSessionId } = require('../../scripts/lib/utils');
    const { accumulate, runStopBatch, readAccumulated } = require('../quality-check/main');

    process.env.TMPDIR = testDir;
    clearCachedSessionId();
    setSessionIdFromInput({ session_id: 'qc-accum' });

    const file = path.join(testDir, 'app.js');
    fs.writeFileSync(file, 'const x = 1;\nconsole.log("oops");\n');

    // Accumulate-only: no return value, path recorded, deduped across two edits.
    assert.strictEqual(
      accumulate({ tool_name: 'Write', tool_input: { file_path: file }, cwd: testDir }),
      null,
    );
    accumulate({ tool_name: 'Edit', tool_input: { file_path: file }, cwd: testDir });
    assert.deepStrictEqual(readAccumulated(), [file], 'path accumulated once (deduped)');

    // Stop batch runs the console.* scan once and folds it into a systemMessage.
    const message = runStopBatch(testDir);
    assert.ok(message?.includes('console.* found'), 'Stop batch surfaces the console finding');

    // The accumulator is cleared — a second Stop over the same session says nothing.
    assert.deepStrictEqual(readAccumulated(), [], 'accumulator cleared after the batch');
    assert.strictEqual(runStopBatch(testDir), null, 'nothing left to report');
  });

  it('non-code files and clean files stay silent (no output, exit 0)', () => {
    const clean = path.join(testDir, 'clean.js');
    fs.writeFileSync(clean, 'const x = 1;\n');
    const r = run(clean);
    assert.strictEqual((r.stdout || '').trim(), '', 'clean file → no output');
    assert.strictEqual(r.status, 0, 'exit 0');
  });
});

describe('quality-check: hooks.json registration contract (v5 dispatcher)', () => {
  const hooksJsonPath = path.join(__dirname, '..', 'hooks.json');
  const config = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8'));

  function syncGroups(event) {
    return (config.hooks[event] || []).filter((g) => g.hooks.every((h) => h.async !== true));
  }

  it('PostToolUse exposes exactly one sync dispatcher entry (dispatch-post.js)', () => {
    const sync = syncGroups('PostToolUse');
    assert.strictEqual(sync.length, 1, 'exactly one sync PostToolUse matcher-group');
    assert.ok(
      sync[0].hooks.some((h) => h.command.includes('dispatch-post.js')),
      'the sync PostToolUse entry is the post dispatcher',
    );
  });

  it('PreToolUse exposes exactly one sync dispatcher entry (dispatch-pre.js)', () => {
    const sync = syncGroups('PreToolUse');
    assert.strictEqual(sync.length, 1, 'exactly one sync PreToolUse matcher-group');
    assert.ok(
      sync[0].hooks.some((h) => h.command.includes('dispatch-pre.js')),
      'the sync PreToolUse entry is the guard dispatcher',
    );
  });

  it('quality-check is folded into the dispatcher, not registered directly', () => {
    assert.ok(
      !JSON.stringify(config.hooks).includes('quality-check/main.js'),
      'quality-check runs via the post dispatcher, not its own registration',
    );
  });

  it('every matcher-group carries a stable, unique id', () => {
    const ids = [];
    for (const groups of Object.values(config.hooks)) {
      for (const g of groups) {
        assert.ok(
          typeof g.id === 'string' && g.id.trim(),
          `group has a string id (matcher ${g.matcher})`,
        );
        ids.push(g.id);
      }
    }
    assert.strictEqual(new Set(ids).size, ids.length, 'ids are unique across the file');
  });

  it('passes the hooks-schema validator with zero violations', () => {
    const { validateHooksJson } = require('../../scripts/check-hooks-schema');
    assert.deepStrictEqual(validateHooksJson(config), []);
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

    it('falls back to the file path as a positional arg when there is no tsconfig (TS-1)', () => {
      const { buildTscArgs } = require('../quality-check/typescript');
      const args = buildTscArgs(['tsc'], {
        tsconfigPath: null,
        buildInfoPath: null,
        filePath: '/x/a.ts',
      });
      assert.ok(args.includes('/x/a.ts'), 'file path must be passed as an input to tsc');
      assert.ok(!args.includes('--project'), 'no tsconfig means no --project flag');
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
      const result = runTypeCheck(file, 'npm', {
        execCommand: 'stub-tsc',
        run,
        findUpwards: () => null,
      });

      assert.strictEqual(calls.length, 1, 'success on the incremental path → no retry');
      assert.ok(calls[0].includes('--incremental'), 'used the incremental fast path');
      assert.deepStrictEqual(result, { errors: [], warnings: [], standalone: true });
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

    it('passes the file path to tsc when no ancestor tsconfig.json exists (TS-1)', () => {
      const { runTypeCheck } = require('../quality-check/typescript');
      const file = path.join(testDir, 'a.ts');
      fs.writeFileSync(file, 'const x: number = "bad";\n');
      const absoluteFile = path.resolve(file);

      const calls = [];
      const run = (_cmd, args) => {
        calls.push(args);
        return {
          stdout: `${absoluteFile}(1,7): error TS2322: Type 'string' is not assignable to type 'number'.`,
          stderr: '',
          exitCode: 2,
        };
      };
      const result = runTypeCheck(file, 'npm', {
        execCommand: 'stub-tsc',
        run,
        findUpwards: () => null,
      });

      assert.ok(
        calls[0].includes(absoluteFile),
        'no tsconfig found → tsc must receive the file path as an input',
      );
      assert.ok(!calls[0].includes('--project'), 'no tsconfig found → no --project flag');
      assert.strictEqual(result.errors.length, 1, 'the real type error must surface');
      assert.ok(result.errors[0].includes('TS2322'));
    });

    it('flags the result as standalone when no ancestor tsconfig.json exists (TS-1 follow-up)', () => {
      const { runTypeCheck } = require('../quality-check/typescript');
      const file = path.join(testDir, 'b.ts');
      fs.writeFileSync(file, 'const x: number = 1;\n');
      const run = (_cmd, _args) => ({ stdout: '', stderr: '', exitCode: 0 });
      const result = runTypeCheck(file, 'npm', {
        execCommand: 'stub-tsc',
        run,
        findUpwards: () => null,
      });
      assert.strictEqual(result.standalone, true, 'no tsconfig found → standalone must be true');
    });
  });
});
