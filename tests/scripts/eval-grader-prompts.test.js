/**
 * eval-grader-prompts.test.js - The model grader, analyzer and blind comparator
 * load their methodology from the engine, not from the user's project (#196).
 *
 * Every call runs with projectRoot set to an empty temp directory — the
 * situation of a user running `arcforge eval` in their own project.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn() };
});
const mockUtils = require('../../scripts/lib/utils');
const {
  gradeWithModel,
  compareWithModel,
  runBlindComparator,
} = require('../../scripts/lib/eval-grader-model');
const { loadAgentDef } = require('../../scripts/lib/eval-grader-io');

const PROMPTS = path.join(__dirname, '..', '..', 'scripts', 'lib', 'prompts');

/** A line from the prompt's body (past the frontmatter) that must reach the model. */
function bodyLine(file) {
  const body = fs.readFileSync(path.join(PROMPTS, file), 'utf8').replace(/^---[\s\S]*?---\n*/m, '');
  return body.split('\n').find((l) => l.trim().length > 20);
}

function sentPrompt() {
  const call = mockUtils.execCommand.mock.calls.find((c) => c[0] === 'claude');
  return call[2].input;
}

describe('grader prompts resolve relative to the engine', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'test-user-project-'));
    mockUtils.execCommand.mockReset();
    mockUtils.execCommand.mockReturnValue({ stdout: '', stderr: '', exitCode: 1 });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('sends the grader methodology from a project that is not the arcforge checkout', () => {
    const scenario = { name: 's', assertions: ['A1: it works'], graderConfig: '' };
    gradeWithModel({ trial: 1, output: 'done' }, scenario, projectRoot);
    expect(sentPrompt()).toContain(bodyLine('eval-grader.md'));
  });

  it('sends the analyzer methodology from a project that is not the arcforge checkout', () => {
    const scenario = { name: 's', assertions: ['A1: it works'] };
    const rows = [{ trial: 1, score: 1, passed: true }];
    compareWithModel(scenario, rows, rows, projectRoot, { delta: 0 });
    expect(sentPrompt()).toContain(bodyLine('eval-analyzer.md'));
  });

  it('sends the blind comparator methodology from a project that is not the arcforge checkout', () => {
    runBlindComparator('the task', 'output one', 'output two', projectRoot);
    expect(sentPrompt()).toContain(bodyLine('eval-blind-comparator.md'));
  });
});

describe('loadAgentDef fails loudly', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-agent-def-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws, naming the path, when the prompt file is missing', () => {
    const missing = path.join(dir, 'absent.md');
    expect(() => loadAgentDef(missing)).toThrow(missing);
  });

  it('throws when the prompt is empty once its frontmatter is stripped', () => {
    const empty = path.join(dir, 'empty.md');
    fs.writeFileSync(empty, '---\nname: x\n---\n\n   \n');
    expect(() => loadAgentDef(empty)).toThrow(/empty/);
  });
});
