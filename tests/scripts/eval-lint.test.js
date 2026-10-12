/**
 * Tests for eval-lint.js
 *
 * Covers:
 * - lintScenario: validates scenario markdown and returns diagnostics
 * - Well-formed → no diagnostics (exit 0)
 * - Missing ## Assertions → diagnostic naming the section
 * - Assertion missing grader-type → diagnostic naming the assertion id
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { lintScenario, REQUIRED_SECTIONS } = require('../../scripts/lib/eval-lint');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-lint-'));
}

function writeScenario(dir, name, content) {
  const scenariosDir = path.join(dir, 'evals', 'scenarios');
  fs.mkdirSync(scenariosDir, { recursive: true });
  const filePath = path.join(scenariosDir, `${name}.md`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// A well-formed scenario with all required sections and properly shaped assertions
const WELL_FORMED = `# Eval: my-eval

## Context
Some context here.

## Setup
echo "setup"

## Grader Config
Score based on output quality.

## Assertions
- [ ] A1: The output is valid JSON
- [ ] A2: The output contains a "result" key

## Scope
skill

## Grader
model
`;

// Missing ## Assertions section
const MISSING_ASSERTIONS = `# Eval: no-assertions

## Context
Some context.

## Setup
echo "setup"

## Grader Config
Score based on quality.

## Scope
skill

## Grader
model
`;

// Has ## Assertions but entries missing grader-type (ID field present, but grader type absent)
// In practice the lint rule is: each assertion line must have an ID (e.g. A1:)
// and must also have either model/code/behavioral grader context or a valid assertion format.
// For this implementation, each assertion must have an ID prefix like "A1:", "A2:", etc.
const MISSING_ASSERTION_ID = `# Eval: bad-assertions

## Context
Some context.

## Grader Config
Score based on output.

## Assertions
- [ ] The output is valid JSON
- [ ] A2: has an id but first one does not

## Scope
skill

## Grader
model
`;

// Assertion entry is blank or just whitespace
const BLANK_ASSERTION = `# Eval: blank-assertion

## Context
Some context.

## Grader Config
Score based on output.

## Assertions
- [ ]
- [ ] A2: valid assertion

## Scope
skill

## Grader
model
`;

// ── REQUIRED_SECTIONS ────────────────────────────────────────────────────────

describe('REQUIRED_SECTIONS', () => {
  test('is an array containing Context, Grader Config, and Assertions', () => {
    expect(Array.isArray(REQUIRED_SECTIONS)).toBe(true);
    // Must require Assertions
    const lower = REQUIRED_SECTIONS.map((s) => s.toLowerCase());
    expect(lower).toContain('assertions');
    // Must require Grader Config
    expect(lower).toContain('grader config');
  });
});

// ── lintScenario: well-formed ─────────────────────────────────────────────────

describe('lintScenario - well-formed', () => {
  test('returns empty diagnostics array for a valid scenario', () => {
    const dir = makeTempDir();
    const filePath = writeScenario(dir, 'my-eval', WELL_FORMED);

    const diagnostics = lintScenario(filePath);

    expect(Array.isArray(diagnostics)).toBe(true);
    expect(diagnostics).toHaveLength(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('accepts behavioral assertions like "[tool_called] Bash:npm test"', () => {
    // Regression: lint parser previously stripped the [tool_*] bracket
    // when capturing assertion text, then ASSERTION_ID_RE rejected the
    // bare remainder as missing an ID prefix.
    const BEHAVIORAL = `# Eval: behavioral

## Context
ctx

## Setup
echo setup

## Grader Config
score it

## Assertions
- [tool_called] Bash:npm test
- [tool_called] Skill:arc-finishing-epic

## Scope
skill

## Grader
model
`;
    const dir = makeTempDir();
    const filePath = writeScenario(dir, 'behavioral', BEHAVIORAL);

    const diagnostics = lintScenario(filePath);

    expect(diagnostics).toHaveLength(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── lintScenario: missing sections ───────────────────────────────────────────

describe('lintScenario - reserved name suffix', () => {
  test.each(['baseline', 'treatment', 'preflight'])('flags a name ending in -%s', (suffix) => {
    const dir = makeTempDir();
    const content = WELL_FORMED.replace('# Eval: my-eval', `# Eval: release-${suffix}`);
    const diagnostics = lintScenario(writeScenario(dir, 'release', content));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].line).toBe(1);
    expect(diagnostics[0].message).toContain(`ends in the reserved suffix "-${suffix}"`);
    expect(diagnostics[0].message).toContain(`the ${suffix} condition of "release"`);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('flags a file whose name supplies the scenario name', () => {
    const dir = makeTempDir();
    const content = WELL_FORMED.replace('# Eval: my-eval\n', '');
    const diagnostics = lintScenario(writeScenario(dir, 'release-preflight', content));

    expect(diagnostics.map((d) => d.line)).toEqual([1]);
    expect(diagnostics[0].message).toContain('"release-preflight"');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('accepts the suffix words anywhere but the end', () => {
    const dir = makeTempDir();
    const content = WELL_FORMED.replace('# Eval: my-eval', '# Eval: preflight-baseline-check');
    expect(lintScenario(writeScenario(dir, 'ok', content))).toHaveLength(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('lintScenario - missing ## Assertions section', () => {
  test('returns diagnostic naming the missing section', () => {
    const dir = makeTempDir();
    const filePath = writeScenario(dir, 'no-assertions', MISSING_ASSERTIONS);

    const diagnostics = lintScenario(filePath);

    expect(diagnostics.length).toBeGreaterThan(0);
    const messages = diagnostics.map((d) => d.message.toLowerCase());
    const hasAssertionsMention = messages.some((m) => m.includes('assertions'));
    expect(hasAssertionsMention).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('diagnostic has file, line, and message fields', () => {
    const dir = makeTempDir();
    const filePath = writeScenario(dir, 'no-assertions', MISSING_ASSERTIONS);

    const diagnostics = lintScenario(filePath);

    expect(diagnostics.length).toBeGreaterThan(0);
    const d = diagnostics[0];
    expect(typeof d.file).toBe('string');
    expect(typeof d.line).toBe('number');
    expect(typeof d.message).toBe('string');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── lintScenario: assertion missing ID ───────────────────────────────────────

describe('lintScenario - assertion missing ID', () => {
  test('returns diagnostic referencing the assertion position', () => {
    const dir = makeTempDir();
    const filePath = writeScenario(dir, 'bad-assertions', MISSING_ASSERTION_ID);

    const diagnostics = lintScenario(filePath);

    expect(diagnostics.length).toBeGreaterThan(0);
    // Should mention assertion or id
    const messages = diagnostics.map((d) => d.message.toLowerCase());
    const hasAssertionMention = messages.some(
      (m) => m.includes('assertion') || m.includes('id') || m.includes('identifier'),
    );
    expect(hasAssertionMention).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── lintScenario: blank assertion ────────────────────────────────────────────

describe('lintScenario - blank assertion entry', () => {
  test('returns diagnostic for blank assertion text', () => {
    const dir = makeTempDir();
    const filePath = writeScenario(dir, 'blank-assertion', BLANK_ASSERTION);

    const diagnostics = lintScenario(filePath);

    expect(diagnostics.length).toBeGreaterThan(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── lintScenario: diagnostic format ──────────────────────────────────────────

describe('lintScenario - diagnostic format', () => {
  test('diagnostic file field matches the input file path', () => {
    const dir = makeTempDir();
    const filePath = writeScenario(dir, 'no-assertions', MISSING_ASSERTIONS);

    const diagnostics = lintScenario(filePath);
    const d = diagnostics[0];

    expect(d.file).toBe(filePath);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('returns empty array (not null or undefined) for clean scenario', () => {
    const dir = makeTempDir();
    const filePath = writeScenario(dir, 'my-eval', WELL_FORMED);

    const result = lintScenario(filePath);

    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('lintScenario: ## Environment', () => {
  let dir;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const withEnvironment = (lines) =>
    `${WELL_FORMED}\n## Environment\n${lines.join('\n')}\n\n## Design Notes\nPATH=ignored here\n`;
  const environmentHeading = (content) => content.split('\n').indexOf('## Environment') + 1;

  it('accepts valid declarations, comments and blank lines', () => {
    const file = writeScenario(
      dir,
      'env-ok',
      withEnvironment([
        '# the tool under test',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: scenario placeholder, not a JS template
        'PATH+=${PROJECT_ROOT}/bin',
        '',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: scenario placeholder, not a JS template
        'PATH^=${TRIAL_DIR}/fakebin',
        'PATH-=/usr/sbin',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: scenario placeholder, not a JS template
        'UV_CACHE_DIR=${TRIAL_DIR}/.cache/uv',
      ]),
    );
    expect(lintScenario(file)).toEqual([]);
  });

  it('reports each bad declaration at its own line', () => {
    const content = withEnvironment([
      'PATH=/usr/local/bin',
      '# fine',
      'HOME=/tmp/elsewhere',
      'UV_CACHE_DIR=/var/cache/uv',
    ]);
    const file = writeScenario(dir, 'env-bad', content);
    const heading = environmentHeading(content);
    const diagnostics = lintScenario(file);
    expect(diagnostics.map((d) => d.line)).toEqual([heading + 1, heading + 3, heading + 4]);
    expect(diagnostics[0].message).toMatch(/## Environment line \d+: PATH cannot be replaced/);
    expect(diagnostics[1].message).toMatch(/HOME is not a variable a scenario may declare/);
    expect(diagnostics[2].message).toMatch(/UV_CACHE_DIR must point inside the trial/);
  });

  it('reports a removal of the directory claude resolves from', () => {
    const file = writeScenario(
      dir,
      'env-shim',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: scenario placeholder, not a JS template
      withEnvironment(['PATH-=${PROJECT_ROOT}/.eval-trials/.bin']),
    );
    expect(lintScenario(file).map((d) => d.message)).toEqual([
      expect.stringMatching(/would remove the directory claude and node resolve from/),
    ]);
  });

  it('reports that removal spelled as the literal path, given the project root', () => {
    const shims = path.join(path.resolve(dir), '.eval-trials', '.bin');
    const file = writeScenario(dir, 'env-shim-literal', withEnvironment([`PATH-=${shims}`]));
    expect(lintScenario(file, dir).map((d) => d.message)).toEqual([
      expect.stringMatching(/would remove the directory claude and node resolve from/),
    ]);
  });

  it('reports a control character in a declaration', () => {
    const content = withEnvironment(['PATH+=/tmp/a\x00b']);
    const file = writeScenario(dir, 'env-nul', content);
    expect(lintScenario(file)).toEqual([
      {
        file,
        line: environmentHeading(content) + 1,
        message: expect.stringMatching(/## Environment line \d+: contains a control character/),
      },
    ]);
  });

  it('ignores a fenced ## Environment example, as the trial does', () => {
    const { parseScenario } = require('../../scripts/lib/eval-scenario');
    const example = ['```', '## Environment', 'PATH=/usr/local/bin', 'not a declaration', '```'];
    const file = writeScenario(
      dir,
      'env-example',
      `${WELL_FORMED}\n## Design Notes\nA scenario may declare:\n\n${example.join('\n')}\n`,
    );
    expect(lintScenario(file)).toEqual([]);
    expect(parseScenario(file)).not.toHaveProperty('environment');
  });

  // CommonMark's fence rule. Each example is followed by a real section, so a
  // fence that fails to close is caught as well as one that closes too early.
  const FENCED_EXAMPLES = [
    ['a tilde fence', ['~~~', '## Environment', 'PATH=/usr/local/bin', '~~~']],
    ['a tilde fence with an info string', ['~~~text', '## Environment', 'HOME=/tmp/x', '~~~']],
    ['an indented backtick fence', ['   ```', '## Environment', 'PATH=/usr/local/bin', '   ```']],
    [
      'a tilde fence holding a backtick fence',
      ['~~~', '```sh', 'echo hi', '```', '## Environment', 'PATH=/usr/local/bin', '~~~'],
    ],
    [
      'a backtick fence holding a tilde fence',
      ['```', '~~~', 'echo hi', '~~~', '## Environment', 'PATH=/usr/local/bin', '```'],
    ],
    [
      'a four-backtick fence holding a three-backtick line',
      ['````', '```', '## Environment', 'PATH=/usr/local/bin', '```', '````'],
    ],
  ];

  it.each(FENCED_EXAMPLES)('ignores a ## Environment example inside %s', (_label, example) => {
    const { parseScenario } = require('../../scripts/lib/eval-scenario');
    const notes = `${WELL_FORMED}\n## Design Notes\nA scenario may declare:\n\n${example.join('\n')}\n`;

    const alone = writeScenario(dir, 'env-fence-alone', notes);
    expect(lintScenario(alone)).toEqual([]);
    expect(parseScenario(alone)).not.toHaveProperty('environment');

    const followed = writeScenario(
      dir,
      'env-fence-followed',
      `${notes}\n## Environment\nPATH-=/usr/sbin\n`,
    );
    expect(lintScenario(followed)).toEqual([]);
    expect(parseScenario(followed).environment).toEqual(['PATH-=/usr/sbin']);
  });

  it('does not open a fence at four spaces of indentation', () => {
    const { parseScenario } = require('../../scripts/lib/eval-scenario');
    const file = writeScenario(
      dir,
      'env-indented-code',
      `${WELL_FORMED}\n## Design Notes\n    \`\`\`\n## Environment\nPATH-=/usr/sbin\n`,
    );
    expect(lintScenario(file)).toEqual([]);
    expect(parseScenario(file).environment).toEqual(['PATH-=/usr/sbin']);
  });

  it('reads a real section after a fenced example of one', () => {
    const { parseScenario } = require('../../scripts/lib/eval-scenario');
    const content = [
      WELL_FORMED,
      '## Design Notes',
      '```',
      '## Environment',
      'PATH=/usr/local/bin',
      '```',
      '',
      '## Environment',
      'PATH-=/usr/sbin',
      'HOME=/tmp/elsewhere',
      '',
    ].join('\n');
    const file = writeScenario(dir, 'env-example-then-real', content);
    expect(lintScenario(file)).toEqual([
      {
        file,
        line: content.split('\n').lastIndexOf('HOME=/tmp/elsewhere') + 1,
        message: expect.stringMatching(/HOME is not a variable a scenario may declare/),
      },
    ]);
    expect(parseScenario(file).environment).toEqual(['PATH-=/usr/sbin', 'HOME=/tmp/elsewhere']);
  });

  it('reports a fenced block, which the trial would refuse line by line', () => {
    const file = writeScenario(
      dir,
      'env-fenced',
      withEnvironment(['```', 'PATH-=/usr/sbin', '```']),
    );
    expect(lintScenario(file).map((d) => d.message)).toEqual([
      expect.stringMatching(/expected PATH\+=<dir>/),
      expect.stringMatching(/expected PATH\+=<dir>/),
    ]);
  });
});
