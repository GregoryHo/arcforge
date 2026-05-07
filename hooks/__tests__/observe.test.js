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
    assert.ok(entry.input.includes('arc-debugging'));
    assert.ok(!entry.input.includes('private task details'));
    assert.ok(!entry.input.includes('sk-12345'));
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

describe('observe: automatic learning trigger', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let projectRoot;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-learning-'));
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

  it('queues only pending candidates when learning is enabled', () => {
    const learning = require('../../scripts/lib/learning');
    const { runAutomaticLearningTrigger } = require('../observe/main');
    learning.setLearningEnabled({ scope: 'project', enabled: true, projectRoot });
    const observationPath = learning.getObservationPath({ projectRoot });
    fs.mkdirSync(path.dirname(observationPath), { recursive: true });
    const projectId = learning.getProjectId(projectRoot);
    fs.writeFileSync(
      observationPath,
      `${[
        {
          project_id: projectId,
          session: 'workflow-a',
          event: 'tool_start',
          tool: 'Read',
          input: '{}',
        },
        {
          project_id: projectId,
          session: 'workflow-a',
          event: 'tool_start',
          tool: 'Edit',
          input: '{}',
        },
        {
          project_id: projectId,
          session: 'workflow-b',
          event: 'tool_start',
          tool: 'Read',
          input: '{}',
        },
        {
          project_id: projectId,
          session: 'workflow-b',
          event: 'tool_start',
          tool: 'Edit',
          input: '{}',
        },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n')}\n`,
      'utf8',
    );

    runAutomaticLearningTrigger(projectRoot);

    const queued = learning.loadCandidates({ scope: 'project', projectRoot });
    assert.strictEqual(queued.length, 1);
    assert.strictEqual(queued[0].status, 'pending');
    assert.ok(!fs.existsSync(path.join(projectRoot, 'skills', queued[0].name, 'SKILL.md')));
  });
});
