const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('observe: getArchiveDir', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-'));
    process.env.HOME = testDir;
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should return path ending in /archive', () => {
    const { getArchiveDir } = require('../observe/main');
    const result = getArchiveDir('test-project');
    assert.ok(result.endsWith('/archive'), `Expected path ending in /archive, got: ${result}`);
  });

  it('should include project name in path', () => {
    const { getArchiveDir } = require('../observe/main');
    const result = getArchiveDir('my-project');
    assert.ok(result.includes('my-project'), `Expected project in path, got: ${result}`);
  });
});

describe('observe: getPidFile', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should return path containing .observer.lock/pid', () => {
    const { getPidFile } = require('../observe/main');
    const result = getPidFile();
    assert.ok(
      result.includes('.observer.lock') && result.endsWith('pid'),
      `Expected .observer.lock/pid in path, got: ${result}`,
    );
  });

  it('should be under .arcforge/instincts/', () => {
    const { getPidFile } = require('../observe/main');
    const result = getPidFile();
    assert.ok(
      result.includes('.arcforge') && result.includes('instincts'),
      `Expected .arcforge/instincts/ in path, got: ${result}`,
    );
  });
});

describe('observe: extractSkillName', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
  });

  it('returns the skill name for a Skill tool call', () => {
    const { extractSkillName } = require('../observe/main');
    assert.strictEqual(
      extractSkillName('Skill', { skill: 'arc-debugging', args: 'something' }),
      'arc-debugging',
    );
  });

  it('returns null when the tool is not Skill', () => {
    const { extractSkillName } = require('../observe/main');
    assert.strictEqual(extractSkillName('Bash', { skill: 'arc-debugging' }), null);
  });

  it('returns null when tool_input is missing or malformed', () => {
    const { extractSkillName } = require('../observe/main');
    assert.strictEqual(extractSkillName('Skill', null), null);
    assert.strictEqual(extractSkillName('Skill', undefined), null);
    assert.strictEqual(extractSkillName('Skill', 'not-an-object'), null);
    assert.strictEqual(extractSkillName('Skill', {}), null);
    assert.strictEqual(extractSkillName('Skill', { skill: '   ' }), null);
  });

  it('caps skill name length to a small bound', () => {
    const { extractSkillName } = require('../observe/main');
    const long = 'x'.repeat(500);
    const result = extractSkillName('Skill', { skill: long });
    assert.ok(result.length <= 128, `expected <= 128 chars, got ${result.length}`);
  });
});

describe('observe: classifyOutcome', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
  });

  it('returns unknown when the response is missing', () => {
    const { classifyOutcome } = require('../observe/main');
    assert.strictEqual(classifyOutcome(undefined), 'unknown');
    assert.strictEqual(classifyOutcome(null), 'unknown');
  });

  it('returns success for a plain object response', () => {
    const { classifyOutcome } = require('../observe/main');
    assert.strictEqual(classifyOutcome({ type: 'create' }), 'success');
  });

  it('returns success for a non-object response', () => {
    const { classifyOutcome } = require('../observe/main');
    assert.strictEqual(classifyOutcome('ok'), 'success');
  });

  it('returns error when is_error is true', () => {
    const { classifyOutcome } = require('../observe/main');
    assert.strictEqual(classifyOutcome({ is_error: true, content: 'boom' }), 'error');
  });

  it('returns error when an error field is set', () => {
    const { classifyOutcome } = require('../observe/main');
    assert.strictEqual(classifyOutcome({ error: 'failed' }), 'error');
  });
});

describe('observe: responseByteSize', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
  });

  it('returns 0 for missing responses', () => {
    const { responseByteSize } = require('../observe/main');
    assert.strictEqual(responseByteSize(null), 0);
    assert.strictEqual(responseByteSize(undefined), 0);
  });

  it('returns the utf8 byte length for object payloads', () => {
    const { responseByteSize } = require('../observe/main');
    const payload = { a: 1 };
    const expected = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    assert.strictEqual(responseByteSize(payload), expected);
  });
});

describe('observe: privacy boundaries', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/sanitize-observation')];
  });

  it('redacts secret-like fields from sanitized payloads', () => {
    // sanitizeObservationPayload now lives in scripts/lib/sanitize-observation
    const { sanitizeObservationPayload } = require('../../scripts/lib/sanitize-observation');
    const out = sanitizeObservationPayload(
      'curl -H "Authorization: Bearer sk-12345" --data api_key="abc123"',
      5000,
    );

    assert.ok(!out.includes('sk-12345'), 'bearer token must be redacted');
    assert.ok(!out.includes('abc123'), 'api_key value must be redacted');
    assert.ok(out.includes('[REDACTED]'), 'redaction marker must be present');
  });

  it('caps sanitized payload length at the configured maximum', () => {
    const { sanitizeObservationPayload } = require('../../scripts/lib/sanitize-observation');
    const { MAX_OUTPUT_LENGTH } = require('../observe/main');
    const huge = 'A'.repeat(MAX_OUTPUT_LENGTH * 4);
    const out = sanitizeObservationPayload(huge, MAX_OUTPUT_LENGTH);
    assert.ok(
      out.length <= MAX_OUTPUT_LENGTH + '...[truncated]'.length,
      `expected truncation, got ${out.length} chars`,
    );
    assert.ok(out.endsWith('...[truncated]'), 'truncation marker must be appended');
  });
});

describe('observe: event shape on PreToolUse', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let projectRoot;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-pre-shape-'));
    projectRoot = path.join(testDir, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
    process.env.HOME = path.join(testDir, 'home');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('stores only Skill metadata, not Skill args, on pre-events', () => {
    const learning = require('../../scripts/lib/learning');
    const sessionUtils = require('../../scripts/lib/session-utils');
    const { spawnSync } = require('node:child_process');

    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });

    const hookInput = {
      session_id: 'pre-skill-session',
      hook_event_name: 'PreToolUse',
      cwd: projectRoot,
      tool_name: 'Skill',
      tool_input: { skill: 'arc-debugging', args: 'private task details sk-12345' },
    };

    const scriptPath = path.join(__dirname, '..', 'observe', 'main.js');
    const result = spawnSync('node', [scriptPath, 'pre'], {
      input: JSON.stringify(hookInput),
      env: { ...process.env, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const obsPath = sessionUtils.getObservationsPath(path.basename(projectRoot));
    const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(entry.event, 'tool_start');
    assert.strictEqual(entry.skill, 'arc-debugging');
    assert.ok(!('input' in entry), 'pre-event must not persist raw tool input');
    // Slice C: no semantic field; SafeEvidencePatch fields instead
    assert.ok(!('semantic' in entry), 'semantic field must not be persisted (Decision 4)');
    assert.strictEqual(entry.evidence_status, 'present');
    assert.strictEqual(entry.operation_kind, 'skill');
    assert.ok(!JSON.stringify(entry).includes('private task details'));
    assert.ok(!JSON.stringify(entry).includes('sk-12345'));
  });
});

describe('observe: event shape on PostToolUse', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let projectRoot;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-shape-'));
    projectRoot = path.join(testDir, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
    process.env.HOME = path.join(testDir, 'home');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('writes a metadata-only post-event with skill, outcome, and output_bytes', () => {
    const learning = require('../../scripts/lib/learning');
    const sessionUtils = require('../../scripts/lib/session-utils');
    const { spawnSync } = require('node:child_process');

    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });

    const hookInput = {
      session_id: 'shape-session',
      hook_event_name: 'PostToolUse',
      cwd: projectRoot,
      tool_name: 'Skill',
      tool_input: { skill: 'arc-debugging', args: 'investigate something' },
      tool_response: { type: 'create', content: 'x'.repeat(2048) },
    };

    const scriptPath = path.join(__dirname, '..', 'observe', 'main.js');
    const result = spawnSync('node', [scriptPath, 'post'], {
      input: JSON.stringify(hookInput),
      env: { ...process.env, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const obsPath = sessionUtils.getObservationsPath(path.basename(projectRoot));
    assert.ok(fs.existsSync(obsPath), `expected observation file at ${obsPath}`);
    const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);

    assert.strictEqual(entry.event, 'tool_end');
    assert.strictEqual(entry.tool, 'Skill');
    assert.strictEqual(entry.skill, 'arc-debugging');
    assert.strictEqual(entry.outcome, 'success');
    assert.ok(typeof entry.output_bytes === 'number' && entry.output_bytes > 0);
    assert.ok(!('output' in entry), 'post-event must not persist tool response content');
    assert.ok(entry.ts && entry.session && entry.project_id);
  });

  it('writes nothing when learning is disabled (observation stays gated)', () => {
    const sessionUtils = require('../../scripts/lib/session-utils');
    const { spawnSync } = require('node:child_process');

    const hookInput = {
      session_id: 'gated-session',
      hook_event_name: 'PostToolUse',
      cwd: projectRoot,
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_response: { stdout: 'a\nb\n' },
    };

    const scriptPath = path.join(__dirname, '..', 'observe', 'main.js');
    const result = spawnSync('node', [scriptPath, 'post'], {
      input: JSON.stringify(hookInput),
      env: { ...process.env, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0);

    const obsPath = sessionUtils.getObservationsPath(path.basename(projectRoot));
    assert.ok(!fs.existsSync(obsPath), 'observation file must not be created when gating is off');
  });

  it('classifies error responses and records the outcome', () => {
    const learning = require('../../scripts/lib/learning');
    const sessionUtils = require('../../scripts/lib/session-utils');
    const { spawnSync } = require('node:child_process');

    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });

    const hookInput = {
      session_id: 'err-session',
      hook_event_name: 'PostToolUse',
      cwd: projectRoot,
      tool_name: 'Bash',
      tool_input: { command: 'false' },
      tool_response: { is_error: true, content: 'command failed' },
    };

    const scriptPath = path.join(__dirname, '..', 'observe', 'main.js');
    const result = spawnSync('node', [scriptPath, 'post'], {
      input: JSON.stringify(hookInput),
      env: { ...process.env, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const obsPath = sessionUtils.getObservationsPath(path.basename(projectRoot));
    const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(entry.outcome, 'error');
    assert.ok(!('skill' in entry), 'non-Skill calls must not record a skill field');
  });
});

// Note: summarizeToolInput tests moved to tests/scripts/learning-observation-view.test.js
// (Slice C — Decision 4: semantic view is read-time only, lives in scripts/lib/)

describe('observe: pre-event persists SafeEvidencePatch (Slice C)', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let projectRoot;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-evidence-'));
    projectRoot = path.join(testDir, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
    process.env.HOME = path.join(testDir, 'home');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('writes SafeEvidencePatch on Bash tool_start (no semantic, no raw input)', () => {
    const learning = require('../../scripts/lib/learning');
    const sessionUtils = require('../../scripts/lib/session-utils');
    const { spawnSync } = require('node:child_process');

    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });

    const hookInput = {
      session_id: 'evidence-bash-session',
      hook_event_name: 'PreToolUse',
      cwd: projectRoot,
      tool_name: 'Bash',
      tool_input: { command: 'npm test', description: 'run tests' },
    };
    const scriptPath = path.join(__dirname, '..', 'observe', 'main.js');
    const result = spawnSync('node', [scriptPath, 'pre'], {
      input: JSON.stringify(hookInput),
      env: { ...process.env, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const obsPath = sessionUtils.getObservationsPath(path.basename(projectRoot));
    const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    // Decision 4: no semantic field
    assert.ok(!('semantic' in entry), 'semantic field must not be persisted (Decision 4)');
    // SafeEvidencePatch fields
    assert.strictEqual(entry.evidence_status, 'present');
    assert.strictEqual(entry.operation_kind, 'shell');
    // sanitized input is present (Bash tool)
    assert.ok('input' in entry, 'Bash tool_start must have sanitized input');
    assert.ok(!JSON.stringify(entry).includes('run tests'), 'description must not be persisted');
  });

  it('writes SafeEvidencePatch on Read tool_start (path field, no contents)', () => {
    const learning = require('../../scripts/lib/learning');
    const sessionUtils = require('../../scripts/lib/session-utils');
    const { spawnSync } = require('node:child_process');

    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });

    const hookInput = {
      session_id: 'evidence-read-session',
      hook_event_name: 'PreToolUse',
      cwd: projectRoot,
      tool_name: 'Read',
      tool_input: { file_path: 'README.md', contents: 'secret content' },
    };
    const scriptPath = path.join(__dirname, '..', 'observe', 'main.js');
    const result = spawnSync('node', [scriptPath, 'pre'], {
      input: JSON.stringify(hookInput),
      env: { ...process.env, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const obsPath = sessionUtils.getObservationsPath(path.basename(projectRoot));
    const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.ok(!('semantic' in entry), 'semantic field must not be persisted');
    assert.strictEqual(entry.evidence_status, 'present');
    assert.strictEqual(entry.operation_kind, 'read');
    assert.ok('path' in entry, 'Read must persist sanitized path');
    assert.ok(!('input' in entry), 'Read must not have input field');
    assert.ok(
      !JSON.stringify(entry).includes('secret content'),
      'file contents must not be persisted',
    );
  });

  it('omits_unsupported_tool for unknown tool classes', () => {
    const learning = require('../../scripts/lib/learning');
    const sessionUtils = require('../../scripts/lib/session-utils');
    const { spawnSync } = require('node:child_process');

    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });

    const hookInput = {
      session_id: 'evidence-unknown-session',
      hook_event_name: 'PreToolUse',
      cwd: projectRoot,
      tool_name: 'SomeUnknownTool',
      tool_input: { x: 1 },
    };
    const scriptPath = path.join(__dirname, '..', 'observe', 'main.js');
    const result = spawnSync('node', [scriptPath, 'pre'], {
      input: JSON.stringify(hookInput),
      env: { ...process.env, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const obsPath = sessionUtils.getObservationsPath(path.basename(projectRoot));
    const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(entry.evidence_status, 'omitted_unsupported_tool');
    assert.ok(!('semantic' in entry), 'semantic field must not be persisted');
  });
});

describe('observe: statistical auto-trigger is retired', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let projectRoot;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-no-autotrigger-'));
    projectRoot = path.join(testDir, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
    process.env.HOME = path.join(testDir, 'home');
    process.env.CLAUDE_PROJECT_DIR = projectRoot;
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('does not invoke the statistical pipeline from the observe hook', () => {
    const learning = require('../../scripts/lib/learning');
    const { spawnSync } = require('node:child_process');
    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });

    // Seed enough observations that the retired analyzer WOULD have queued
    // a candidate. After retirement, running the hook must not add anything
    // to the candidate queue.
    const observationPath = learning.getObservationPath({ projectRoot });
    fs.mkdirSync(path.dirname(observationPath), { recursive: true });
    const projectId = learning.getProjectId(projectRoot);
    const seed = ['workflow-a', 'workflow-b']
      .flatMap((session) =>
        ['Read', 'Edit'].map((tool) => ({
          project_id: projectId,
          session,
          event: 'tool_start',
          tool,
          input: '{}',
        })),
      )
      .map((record) => JSON.stringify(record))
      .join('\n');
    fs.writeFileSync(observationPath, `${seed}\n`, 'utf8');

    const queuedBefore = learning.loadCandidates({ scope: 'project', projectRoot });

    const hookInput = {
      session_id: 'no-autotrigger',
      hook_event_name: 'PreToolUse',
      cwd: projectRoot,
      tool_name: 'Read',
      tool_input: { file_path: 'README.md' },
    };
    const scriptPath = path.join(__dirname, '..', 'observe', 'main.js');
    const result = spawnSync('node', [scriptPath, 'pre'], {
      input: JSON.stringify(hookInput),
      env: { ...process.env, HOME: process.env.HOME, CLAUDE_PROJECT_DIR: projectRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const queuedAfter = learning.loadCandidates({ scope: 'project', projectRoot });
    assert.strictEqual(
      queuedAfter.length,
      queuedBefore.length,
      'observe hook must not create candidates via the retired statistical pipeline',
    );
  });

  it('does not export runAutomaticLearningTrigger from the observe hook module', () => {
    const observeModule = require('../observe/main');
    assert.strictEqual(
      observeModule.runAutomaticLearningTrigger,
      undefined,
      'runAutomaticLearningTrigger must be removed from observe hook exports',
    );
  });
});

// ─────────────────────────────────────────────
// Slice B — C1 + C2: shouldObserve path filtering
// ─────────────────────────────────────────────

describe('observe: shouldObserve — eval-trial path rejection (C1)', () => {
  const originalEnv = { ...process.env };
  let testHome;

  beforeEach(() => {
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-c1-'));
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
    delete require.cache[require.resolve('../../scripts/lib/learning')];

    // Enable learning globally so path filtering is the only gate
    const learning = require('../../scripts/lib/learning');
    learning.setLearningEnabled({ scope: 'global', enabled: true, homeDir: testHome });
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    delete require.cache[require.resolve('../observe/main')];
  });

  afterEach(() => {
    fs.rmSync(testHome, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('rejects a projectRoot containing /.eval-trials/', () => {
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'projects', '.eval-trials', 'run-1'),
      homeDir: testHome,
    });
    assert.strictEqual(result, false, 'should return false for .eval-trials/ path');
  });

  it('rejects a projectRoot matching trial-dir suffix -tN+-[A-Za-z0-9]{6}', () => {
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'myapp-t123-abc456'),
      homeDir: testHome,
    });
    assert.strictEqual(result, false, 'should return false for trial-dir suffix path');
  });

  it('rejects various valid trial-dir suffix patterns', () => {
    const { shouldObserve } = require('../observe/main');
    const trialPaths = [
      path.join(testHome, 'proj-t1-aB2cD3'),
      path.join(testHome, 'myrepo-t99-ZZZZZZ'),
      path.join(testHome, 'arcforge-t0-a1B2c3'),
    ];
    for (const projectRoot of trialPaths) {
      const result = shouldObserve({ projectRoot, homeDir: testHome });
      assert.strictEqual(result, false, `should reject trial path: ${projectRoot}`);
    }
  });

  it('allows a normal project path when learning is globally enabled', () => {
    const { shouldObserve } = require('../observe/main');
    const normalRoot = path.join(testHome, 'my-normal-project');
    const result = shouldObserve({ projectRoot: normalRoot, homeDir: testHome });
    assert.strictEqual(
      result,
      true,
      'should return true for normal path with global learning enabled',
    );
  });

  it('does not reject a path that has "eval-trials" without the /.eval-trials/ pattern', () => {
    const { shouldObserve } = require('../observe/main');
    // A path named "eval-trials-project" at the basename level (no slash+dot)
    const normalRoot = path.join(testHome, 'eval-trials-project');
    const result = shouldObserve({ projectRoot: normalRoot, homeDir: testHome });
    assert.strictEqual(
      result,
      true,
      'eval-trials-project without /.eval-trials/ should be allowed',
    );
  });
});

describe('observe: shouldObserve — ARCFORGE_OBSERVE_SKIP_PATHS env var (C2)', () => {
  const originalEnv = { ...process.env };
  let testHome;

  beforeEach(() => {
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-c2-'));
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
    delete require.cache[require.resolve('../../scripts/lib/learning')];

    // Enable learning globally so skip-path env var is the only gate
    const learning = require('../../scripts/lib/learning');
    learning.setLearningEnabled({ scope: 'global', enabled: true, homeDir: testHome });
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    delete require.cache[require.resolve('../observe/main')];
  });

  afterEach(() => {
    fs.rmSync(testHome, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('rejects a projectRoot that contains a substring from ARCFORGE_OBSERVE_SKIP_PATHS', () => {
    const skipDir = path.join(testHome, 'skip-me');
    process.env.ARCFORGE_OBSERVE_SKIP_PATHS = `${skipDir},/other/skip`;
    delete require.cache[require.resolve('../observe/main')];
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(skipDir, 'my-project'),
      homeDir: testHome,
    });
    assert.strictEqual(
      result,
      false,
      'should return false when projectRoot matches ARCFORGE_OBSERVE_SKIP_PATHS substring',
    );
  });

  it('rejects the second entry in a comma-separated list', () => {
    const skipDir = path.join(testHome, 'other-skip');
    process.env.ARCFORGE_OBSERVE_SKIP_PATHS = `${path.join(testHome, 'first')},${skipDir}`;
    delete require.cache[require.resolve('../observe/main')];
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(skipDir, 'project'),
      homeDir: testHome,
    });
    assert.strictEqual(result, false, 'should reject the second skip-path entry');
  });

  it('allows a path not in ARCFORGE_OBSERVE_SKIP_PATHS when learning is enabled', () => {
    process.env.ARCFORGE_OBSERVE_SKIP_PATHS = path.join(testHome, 'skip-me');
    delete require.cache[require.resolve('../observe/main')];
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'safe-project'),
      homeDir: testHome,
    });
    assert.strictEqual(result, true, 'should allow a path not in the skip list');
  });

  it('honors an empty ARCFORGE_OBSERVE_SKIP_PATHS (no-op)', () => {
    process.env.ARCFORGE_OBSERVE_SKIP_PATHS = '';
    delete require.cache[require.resolve('../observe/main')];
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'project'),
      homeDir: testHome,
    });
    // With empty skip list and global learning enabled, should return true
    assert.strictEqual(result, true, 'empty skip list should not block observation');
  });
});

// ─────────────────────────────────────────────
// Slice B — C6: Daemon lazy-start
// ─────────────────────────────────────────────

describe('observe: daemon lazy-start (C6)', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-lazystart-'));
    process.env.HOME = testDir;
    process.env.CLAUDE_PROJECT_DIR = path.join(testDir, 'project');
    // CI safety: never actually spawn a real daemon during tests.
    process.env.ARCFORGE_OBSERVE_NO_SPAWN = '1';
    fs.mkdirSync(process.env.CLAUDE_PROJECT_DIR, { recursive: true });
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
    delete require.cache[require.resolve('../../scripts/lib/learning')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('exports LAZY_START_THRESHOLD constant defaulting to 50', () => {
    const mod = require('../observe/main');
    assert.strictEqual(mod.LAZY_START_THRESHOLD, 50, 'default LAZY_START_THRESHOLD must be 50');
  });

  it('exports spawnDaemonIfNeeded function', () => {
    const mod = require('../observe/main');
    assert.strictEqual(
      typeof mod.spawnDaemonIfNeeded,
      'function',
      'spawnDaemonIfNeeded must be exported',
    );
  });

  it('honors ARCFORGE_LAZY_START_THRESHOLD env override', () => {
    process.env.ARCFORGE_LAZY_START_THRESHOLD = '5';
    delete require.cache[require.resolve('../observe/main')];
    const mod = require('../observe/main');
    assert.strictEqual(mod.LAZY_START_THRESHOLD, 5, 'env override must apply');
  });

  it('returns "below-threshold" when observation count is below threshold', () => {
    const { spawnDaemonIfNeeded } = require('../observe/main');
    const { getObservationsPath } = require('../../scripts/lib/session-utils');
    const obsPath = getObservationsPath('test-project');
    fs.mkdirSync(path.dirname(obsPath), { recursive: true });
    const lines = `${Array.from({ length: 10 }, (_, i) => JSON.stringify({ i })).join('\n')}\n`;
    fs.writeFileSync(obsPath, lines, 'utf-8');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'below-threshold');
  });

  it('returns "pid-exists" when PID file is present (daemon already running)', () => {
    const { spawnDaemonIfNeeded } = require('../observe/main');
    const { getObservationsPath, getObserverPidFile } = require('../../scripts/lib/session-utils');
    const obsPath = getObservationsPath('test-project');
    fs.mkdirSync(path.dirname(obsPath), { recursive: true });
    const lines = `${Array.from({ length: 60 }, (_, i) => JSON.stringify({ i })).join('\n')}\n`;
    fs.writeFileSync(obsPath, lines, 'utf-8');

    const pidFile = getObserverPidFile();
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(process.pid), 'utf-8');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'pid-exists');
    assert.ok(fs.existsSync(pidFile), 'PID file should still exist');
  });

  it('returns "no-file" when observations file does not exist', () => {
    const { spawnDaemonIfNeeded } = require('../observe/main');
    const { getObservationsPath } = require('../../scripts/lib/session-utils');
    const obsPath = getObservationsPath('test-project');
    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'no-file');
  });

  it('returns "no-spawn-env" when threshold met but ARCFORGE_OBSERVE_NO_SPAWN=1', () => {
    const { spawnDaemonIfNeeded, LAZY_START_THRESHOLD } = require('../observe/main');
    const { getObservationsPath } = require('../../scripts/lib/session-utils');
    const obsPath = getObservationsPath('test-project');
    fs.mkdirSync(path.dirname(obsPath), { recursive: true });
    const lines =
      Array.from({ length: LAZY_START_THRESHOLD }, (_, i) => JSON.stringify({ i })).join('\n') +
      '\n';
    fs.writeFileSync(obsPath, lines, 'utf-8');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'no-spawn-env');
  });
});

// ─────────────────────────────────────────────
// Slice C — Sanitizer import + buildObservedEvidence
// ─────────────────────────────────────────────

describe('observe: sanitizer is imported from shared module (Slice C — C5)', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
  });

  it('buildObservedEvidence redacts Authorization Bearer values in Bash commands', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Bash', {
      command: "curl -H 'Authorization: Bearer sk-abc123' https://api.example.com",
    });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.ok(patch.input.includes('Authorization: Bearer'), 'keyword preserved');
    assert.ok(!patch.input.includes('sk-abc123'), 'secret must be redacted');
  });

  it('buildObservedEvidence redacts OPENAI_API_KEY env-var assignments', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Bash', {
      command: 'OPENAI_API_KEY=sk-real-secret python run.py',
    });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.ok(!patch.input.includes('sk-real-secret'), 'secret must be redacted');
  });
});

describe('observe: buildObservedEvidence — per-tool SafeEvidencePatch (Slice C — C6)', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
  });

  it('Bash tool returns present evidence with sanitized input and shell operation_kind', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Bash', { command: 'npm test' });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.strictEqual(patch.operation_kind, 'shell');
    assert.ok('input' in patch, 'Bash must have input field');
    assert.ok(!('path' in patch), 'Bash must not have path field');
  });

  it('Bash tool sanitizes secrets in the command', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Bash', {
      command: 'curl -H "Authorization: Bearer sk-12345" https://api.example.com',
    });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.ok(!patch.input.includes('sk-12345'), 'Bearer token must be redacted');
    assert.ok(patch.input.includes('https://api.example.com'), 'URL must be preserved');
  });

  it('Read tool returns present evidence with path and read operation_kind', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Read', { file_path: 'README.md' });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.strictEqual(patch.operation_kind, 'read');
    assert.ok('path' in patch, 'Read must have path field');
    assert.ok(!('input' in patch), 'Read must not have input field');
  });

  it('Edit tool returns present evidence with path and edit operation_kind', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Edit', {
      file_path: 'src/foo.js',
      old_string: 'old',
      new_string: 'new',
    });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.strictEqual(patch.operation_kind, 'edit');
    assert.ok('path' in patch);
    assert.ok(!JSON.stringify(patch).includes('old'), 'old_string must not be persisted');
    assert.ok(!JSON.stringify(patch).includes('new'), 'new_string must not be persisted');
  });

  it('Write tool returns present evidence with path and write operation_kind', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Write', {
      file_path: 'output.txt',
      content: 'secret file content',
    });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.strictEqual(patch.operation_kind, 'write');
    assert.ok('path' in patch);
    assert.ok(
      !JSON.stringify(patch).includes('secret file content'),
      'content must not be persisted',
    );
  });

  it('Grep tool returns present evidence with path and search operation_kind', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Grep', { pattern: 'TODO', path: 'src/' });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.strictEqual(patch.operation_kind, 'search');
    assert.ok('pattern' in patch || 'path' in patch, 'Grep must have pattern or path');
  });

  it('Glob tool returns present evidence with glob and glob operation_kind', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Glob', { pattern: '**/*.test.js' });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.strictEqual(patch.operation_kind, 'glob');
  });

  it('Skill tool returns present evidence with skill name only (no args)', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Skill', {
      skill: 'arc-debugging',
      args: { sensitive: 'private' },
    });
    assert.strictEqual(patch.evidence_status, 'present');
    assert.strictEqual(patch.operation_kind, 'skill');
    assert.strictEqual(patch.skill, 'arc-debugging');
    assert.ok(!JSON.stringify(patch).includes('private'), 'skill args must not be persisted');
  });

  it('unknown tool class returns omitted_unsupported_tool', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('SomeUnknownTool', { x: 1 });
    assert.strictEqual(patch.evidence_status, 'omitted_unsupported_tool');
    assert.ok(!('input' in patch), 'unsupported tool must not have input');
  });

  it('returns omitted_no_input when tool_input is missing', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Bash', null);
    assert.strictEqual(patch.evidence_status, 'omitted_no_input');
  });

  it('no raw tool_input persisted — evidence_status present on Bash', () => {
    const { buildObservedEvidence } = require('../observe/main');
    const patch = buildObservedEvidence('Bash', { command: 'ls', env: { SECRET: 'abc' } });
    // env dump must not be in the output
    assert.ok(!JSON.stringify(patch).includes('abc'), 'env dump must not be persisted');
  });
});

// ---------------------------------------------------------------------------
// Criterion #5 — ARCFORGE_OBSERVE_EXPLICIT_SKIP + ARCFORGE_OBSERVE_SELF_ANALYSIS
// ---------------------------------------------------------------------------

describe('observe: shouldObserve — ARCFORGE_OBSERVE_EXPLICIT_SKIP env guard (C3)', () => {
  const originalEnv = { ...process.env };
  let testHome;

  beforeEach(() => {
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-c3-'));
    // Enable learning globally so env var is the only gate
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    const learning = require('../../scripts/lib/learning');
    learning.setLearningEnabled({ scope: 'global', enabled: true, homeDir: testHome });
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    delete require.cache[require.resolve('../observe/main')];
  });

  afterEach(() => {
    fs.rmSync(testHome, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    delete require.cache[require.resolve('../observe/main')];
  });

  it('returns false when ARCFORGE_OBSERVE_EXPLICIT_SKIP=1', () => {
    process.env.ARCFORGE_OBSERVE_EXPLICIT_SKIP = '1';
    // No cache deletion — reads process.env at call time
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'my-project'),
      homeDir: testHome,
    });
    assert.strictEqual(
      result,
      false,
      'ARCFORGE_OBSERVE_EXPLICIT_SKIP=1 should disable observation',
    );
  });

  it('does not skip when ARCFORGE_OBSERVE_EXPLICIT_SKIP is "0"', () => {
    process.env.ARCFORGE_OBSERVE_EXPLICIT_SKIP = '0';
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'my-project'),
      homeDir: testHome,
    });
    assert.strictEqual(
      result,
      true,
      'ARCFORGE_OBSERVE_EXPLICIT_SKIP=0 should not disable observation',
    );
  });

  it('does not skip when ARCFORGE_OBSERVE_EXPLICIT_SKIP is unset', () => {
    delete process.env.ARCFORGE_OBSERVE_EXPLICIT_SKIP;
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'my-project'),
      homeDir: testHome,
    });
    assert.strictEqual(
      result,
      true,
      'unset ARCFORGE_OBSERVE_EXPLICIT_SKIP should not disable observation',
    );
  });
});

describe('observe: shouldObserve — ARCFORGE_OBSERVE_SELF_ANALYSIS env guard (C4)', () => {
  const originalEnv = { ...process.env };
  let testHome;

  beforeEach(() => {
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-c4-'));
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    const learning = require('../../scripts/lib/learning');
    learning.setLearningEnabled({ scope: 'global', enabled: true, homeDir: testHome });
    delete require.cache[require.resolve('../../scripts/lib/learning')];
    delete require.cache[require.resolve('../observe/main')];
  });

  afterEach(() => {
    fs.rmSync(testHome, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    delete require.cache[require.resolve('../observe/main')];
  });

  it('returns false when ARCFORGE_OBSERVE_SELF_ANALYSIS=1', () => {
    process.env.ARCFORGE_OBSERVE_SELF_ANALYSIS = '1';
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'my-project'),
      homeDir: testHome,
    });
    assert.strictEqual(
      result,
      false,
      'ARCFORGE_OBSERVE_SELF_ANALYSIS=1 should disable observation',
    );
  });

  it('does not skip when ARCFORGE_OBSERVE_SELF_ANALYSIS is "0"', () => {
    process.env.ARCFORGE_OBSERVE_SELF_ANALYSIS = '0';
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'my-project'),
      homeDir: testHome,
    });
    assert.strictEqual(
      result,
      true,
      'ARCFORGE_OBSERVE_SELF_ANALYSIS=0 should not disable observation',
    );
  });

  it('does not skip when ARCFORGE_OBSERVE_SELF_ANALYSIS is unset', () => {
    delete process.env.ARCFORGE_OBSERVE_SELF_ANALYSIS;
    const { shouldObserve } = require('../observe/main');
    const result = shouldObserve({
      projectRoot: path.join(testHome, 'my-project'),
      homeDir: testHome,
    });
    assert.strictEqual(
      result,
      true,
      'unset ARCFORGE_OBSERVE_SELF_ANALYSIS should not disable observation',
    );
  });
});
