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
