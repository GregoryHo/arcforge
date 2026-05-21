const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('observe: truncate', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CLAUDE_SESSION_ID = 'test-observe-session';
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should return original string when under maxLen', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate('hello', 10), 'hello');
  });

  it('should return original string when exactly maxLen', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate('12345', 5), '12345');
  });

  it('should truncate and add indicator when over maxLen', () => {
    const { truncate } = require('../observe/main');
    const result = truncate('hello world', 5);
    assert.strictEqual(result, 'hello...[truncated]');
  });

  it('should return empty string for null input', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate(null, 10), '');
  });

  it('should return empty string for undefined input', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate(undefined, 10), '');
  });

  it('should return empty string for empty string input', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate('', 10), '');
  });
});

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

describe('observe: buildObservedToolInput', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
  });

  it('drops Skill args while retaining the skill name', () => {
    const { buildObservedToolInput } = require('../observe/main');
    assert.deepStrictEqual(
      buildObservedToolInput('Skill', { skill: 'arc-debugging', args: 'private task details' }),
      { skill: 'arc-debugging' },
    );
  });

  it('keeps non-Skill tool input unchanged for existing learning signal extraction', () => {
    const { buildObservedToolInput } = require('../observe/main');
    const input = { command: 'npm test' };
    assert.strictEqual(buildObservedToolInput('Bash', input), input);
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
  });

  it('redacts secret-like fields from sanitized payloads', () => {
    const { sanitizeObservationPayload } = require('../observe/main');
    const out = sanitizeObservationPayload(
      'curl -H "Authorization: Bearer sk-12345" --data api_key="abc123"',
      5000,
    );

    assert.ok(!out.includes('sk-12345'), 'bearer token must be redacted');
    assert.ok(!out.includes('abc123'), 'api_key value must be redacted');
    assert.ok(out.includes('[REDACTED]'), 'redaction marker must be present');
  });

  it('caps sanitized payload length at the configured maximum', () => {
    const { sanitizeObservationPayload, MAX_OUTPUT_LENGTH } = require('../observe/main');
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
    assert.strictEqual(entry.semantic.skill_name, 'arc-debugging');
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

describe('observe: semantic summaries', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
  });

  it('classifies known bash command kinds without storing the command line', () => {
    const { summarizeToolInput } = require('../observe/main');
    assert.deepStrictEqual(summarizeToolInput('Bash', { command: 'npm test' }), {
      tool: 'Bash',
      payload_saved: false,
      operation: 'shell',
      command_kind: 'test',
    });
    assert.strictEqual(summarizeToolInput('Bash', { command: 'git status' }).command_kind, 'git');
    assert.strictEqual(
      summarizeToolInput('Bash', { command: 'npm run lint' }).command_kind,
      'lint',
    );
  });

  it('classifies file-targeted tools by path class without storing file path', () => {
    const { summarizeToolInput } = require('../observe/main');
    const summary = summarizeToolInput('Edit', { file_path: 'tests/scripts/foo.test.js' });
    assert.strictEqual(summary.path_class, 'test');
    assert.strictEqual(summary.file_kind, 'js');
    assert.strictEqual(summary.payload_saved, false);
    assert.ok(!('file_path' in summary), 'file path must not be persisted in summary');
  });

  it('maps unknown file suffixes to a bounded enum', () => {
    const { summarizeToolInput } = require('../observe/main');
    const summary = summarizeToolInput('Read', {
      file_path: 'notes/customer-acme.secretprojectcodename',
    });
    assert.strictEqual(summary.file_kind, 'other');
    assert.ok(!JSON.stringify(summary).includes('secretprojectcodename'));
  });

  it('records skill name in summary when tool is Skill', () => {
    const { summarizeToolInput } = require('../observe/main');
    const summary = summarizeToolInput('Skill', { skill: 'arc-debugging', args: 'private' });
    assert.strictEqual(summary.skill_name, 'arc-debugging');
    assert.ok(!('args' in summary), 'skill args must not be persisted in summary');
  });

  it('falls back to the unknown classifications when unfamiliar tool is supplied', () => {
    const { summarizeToolInput } = require('../observe/main');
    const summary = summarizeToolInput('SomeNewTool', { x: 1 });
    assert.strictEqual(summary.operation, 'other');
    assert.strictEqual(summary.payload_saved, false);
  });
});

describe('observe: pre-event persists semantic summary', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let projectRoot;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-semantic-'));
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

  it('writes a bounded semantic field on tool_start observations', () => {
    const learning = require('../../scripts/lib/learning');
    const sessionUtils = require('../../scripts/lib/session-utils');
    const { spawnSync } = require('node:child_process');

    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });

    const hookInput = {
      session_id: 'sem-session',
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
    assert.ok(entry.semantic, 'semantic summary must be present on pre events');
    assert.strictEqual(entry.semantic.tool, 'Bash');
    assert.strictEqual(entry.semantic.command_kind, 'test');
    assert.strictEqual(entry.semantic.payload_saved, false);
    assert.ok(!('input' in entry), 'pre-event must not persist raw tool input');
    assert.ok(!JSON.stringify(entry).includes('npm test'));
    assert.ok(!JSON.stringify(entry).includes('run tests'));
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
    const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ i })).join('\n') + '\n';
    fs.writeFileSync(obsPath, lines, 'utf-8');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'below-threshold');
  });

  it('returns "pid-exists" when PID file is present (daemon already running)', () => {
    const { spawnDaemonIfNeeded } = require('../observe/main');
    const { getObservationsPath, getObserverPidFile } = require('../../scripts/lib/session-utils');
    const obsPath = getObservationsPath('test-project');
    fs.mkdirSync(path.dirname(obsPath), { recursive: true });
    const lines = Array.from({ length: 60 }, (_, i) => JSON.stringify({ i })).join('\n') + '\n';
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
