const { summarizeToolInput } = require('../../scripts/lib/learning-observation-view');

// ---------------------------------------------------------------------------
// summarizeToolInput — read-time semantic view derivation
// ---------------------------------------------------------------------------

describe('summarizeToolInput — Bash', () => {
  it('classifies npm test as test command kind', () => {
    const view = summarizeToolInput('Bash', { command: 'npm test' });
    expect(view.tool).toBe('Bash');
    expect(view.operation_kind).toBe('shell');
    expect(view.command_kind).toBe('test');
    expect(view.payload_saved).toBe(false);
  });

  it('classifies git status as git command kind', () => {
    const view = summarizeToolInput('Bash', { command: 'git status' });
    expect(view.command_kind).toBe('git');
  });

  it('classifies npm run lint as lint command kind', () => {
    const view = summarizeToolInput('Bash', { command: 'npm run lint' });
    expect(view.command_kind).toBe('lint');
  });

  it('classifies npm run build as build command kind', () => {
    const view = summarizeToolInput('Bash', { command: 'npm run build' });
    expect(view.command_kind).toBe('build');
  });

  it('classifies node script.js as run command kind', () => {
    const view = summarizeToolInput('Bash', { command: 'node scripts/cli.js foo' });
    expect(view.command_kind).toBe('run');
  });
});

describe('summarizeToolInput — file-targeted tools', () => {
  it('classifies Edit with a test file path', () => {
    const view = summarizeToolInput('Edit', { file_path: 'tests/scripts/foo.test.js' });
    expect(view.tool).toBe('Edit');
    expect(view.operation_kind).toBe('edit');
    expect(view.path_class).toBe('test');
    expect(view.file_kind).toBe('js');
    expect(view.payload_saved).toBe(false);
    expect(Object.keys(view)).not.toContain('file_path');
  });

  it('classifies Read with a docs markdown file', () => {
    const view = summarizeToolInput('Read', { file_path: 'docs/guide/learning.md' });
    expect(view.operation_kind).toBe('read');
    expect(view.path_class).toBe('docs');
    expect(view.file_kind).toBe('md');
  });

  it('classifies Write with a source JS file', () => {
    // scripts/ is classified as 'script' by PATH_CLASSES (^scripts\/ pattern)
    const view = summarizeToolInput('Write', { file_path: 'scripts/lib/foo.js' });
    expect(view.operation_kind).toBe('write');
    expect(view.path_class).toBe('script');
    expect(view.file_kind).toBe('js');
  });
});

describe('summarizeToolInput — Skill', () => {
  it('records skill name without args', () => {
    const view = summarizeToolInput('Skill', { skill: 'arc-debugging', args: 'private' });
    expect(view.operation_kind).toBe('skill');
    expect(view.skill_name).toBe('arc-debugging');
    expect(Object.keys(view)).not.toContain('args');
  });
});

describe('summarizeToolInput — Grep and Glob', () => {
  it('classifies Grep as search operation', () => {
    const view = summarizeToolInput('Grep', { pattern: 'foo', path: 'src/' });
    expect(view.operation_kind).toBe('search');
  });

  it('classifies Glob as glob operation', () => {
    const view = summarizeToolInput('Glob', { pattern: '**/*.test.js' });
    expect(view.operation_kind).toBe('glob');
  });
});

describe('summarizeToolInput — unknown/missing input', () => {
  it('returns other operation for unknown tool', () => {
    const view = summarizeToolInput('SomeNewTool', { x: 1 });
    expect(view.operation_kind).toBe('other');
    expect(view.payload_saved).toBe(false);
  });

  it('returns minimal view when tool_input is missing', () => {
    const view = summarizeToolInput('Bash', null);
    expect(view.tool).toBe('Bash');
    expect(view.payload_saved).toBe(false);
  });
});
