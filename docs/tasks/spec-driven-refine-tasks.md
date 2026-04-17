# Spec-Driven Development Pipeline Tasks

> **Goal:** Implement the SDD pipeline foundation — schema guidance files, validation toolkit, and updated pipeline skills — so brainstorming → refining → planning becomes an iterable, validated workflow with per-spec directory isolation.
> **Architecture:** Two shared infrastructure layers (sdd-schemas/ for LLM guidance, sdd-utils.js for programmatic validation) consumed by three pipeline skills (arc-brainstorming, arc-refining, arc-planning). Skills read schemas for format guidance and call sdd-utils.js for deterministic checks. Each spec lives in `specs/<spec-id>/` as a self-contained project unit.
> **Tech Stack:** Node.js (zero external deps), XML (spec.xml), Markdown (schemas, skills), Jest (tests/scripts/)

> **For Claude:** Use arc-agent-driven or arc-executing-tasks to implement.

## Context

The spec-driven-refine spec v2 (`specs/spec-driven-refine/spec.xml`) defines an iterable pipeline: brainstorming (elicit) → refiner (formalize) → planner (decompose). The three skills exist but lack shared validation infrastructure and v2 pipeline behaviors (Path A/B routing, filesystem-detected mode, delta metadata, sprint model, per-spec DAG location). This task list implements the foundation layer first (schemas + validation toolkit), then updates each skill.

Key behavior changes:
- **Brainstorming**: Scans specs/ for existing specs, routes to Path A (new) or Path B (iteration with gamma mode)
- **Refiner**: Detects mode from filesystem (no REFINER_INPUT), writes delta metadata to spec, two-pass write with validation
- **Planner**: Sprint model (always builds DAG from scratch), scopes to delta requirements, DAG lives in `specs/<spec-id>/dag.yaml`

## Tasks

### Task 1: Create Design Doc Schema (sdd-schemas/design.md)

**Files:**
- Create: `scripts/lib/sdd-schemas/design.md`

**Step 1: Create directory and file**

```bash
mkdir -p scripts/lib/sdd-schemas
```

Write `scripts/lib/sdd-schemas/design.md` — LLM guidance for producing and validating design docs. Must contain:

- **Location rule**: `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md` with spec-id from dir name and iteration from date dir name
- **Mode detection rule**: `specs/<spec-id>/spec.xml` exists = iteration mode, else initial mode. Mode from filesystem, not content.
- **Path A structure**: Problem/motivation, proposed solution, identifiable requirements (in prose), scope (includes/excludes). No fixed headings — refiner extracts from prose.
- **Path A valid example**: Complete design doc (~15 lines) with all minimum elements
- **Path A invalid example**: Empty stub with ERROR: "design doc has no substantive content"
- **Path B gamma mode structure**: Required: Context section (2-3 sentences, spec version reference), Change Intent section. Recommended: Architecture Impact section.
- **Path B valid example**: Complete gamma mode doc with Context, Change Intent, Architecture Impact
- **Path B invalid examples**: Missing Context → ERROR, Missing Change Intent → ERROR
- **Validation summary table**: File exists (ERROR, both), Substantive content (ERROR, both), Context heading (ERROR, B only), Change Intent heading (ERROR, B only), Stale iteration (WARNING, B only), Requirements identifiable (LLM, A only), Scope declared (LLM, A only)

Reference spec requirements: fr-sd-001 through fr-sd-004.

**Step 2: Verify**
Run: `cat scripts/lib/sdd-schemas/design.md | head -5`
Expected: file exists with `# Design Doc Schema` header

**Step 3: Commit**
`git commit -m "feat(cli): add design doc schema for SDD pipeline"`

---

### Task 2: Create Spec Identity Header Schema (sdd-schemas/spec.md)

**Files:**
- Create: `scripts/lib/sdd-schemas/spec.md`

**Step 1: Write file**

Write `scripts/lib/sdd-schemas/spec.md` — LLM guidance for producing and validating spec.xml identity headers. Must contain:

- **Required fields table**: spec_id (string, kebab-case, matches folder), spec_version (positive int, starts at 1), status (enum: "active"), title (string), description (string), source/design_path (valid file path), source/design_iteration (YYYY-MM-DD)
- **Conditional fields**: supersedes required when spec_version > 1, format `<spec-id>:v<N>`
- **Scope element**: XML structure with `<includes><feature id="...">` and `<excludes><reason>`. Empty includes = WARNING.
- **Delta element**: XML structure for v2+ specs with `<added>`, `<modified>`, `<removed>` child elements. Absence signals "plan all requirements."
- **Detail file structure**: `<detail_file path="...">` references, requirement element structure with id, title, description, acceptance_criteria, criterion with trace
- **Valid v1 example**: Complete `<overview>` with all required fields, no supersedes, scope with includes and excludes
- **Valid v2+ example**: Complete `<overview>` with supersedes, updated source, delta element
- **Invalid examples**: Missing spec_version (ERROR), broken design_path (ERROR), missing supersedes for v2+ (ERROR), invalid supersedes format (ERROR), empty scope (WARNING)
- **Validation summary table**: All deterministic checks with severity levels

Reference spec requirements: fr-sd-005 through fr-sd-007.

**Step 2: Verify**
Run: `cat scripts/lib/sdd-schemas/spec.md | head -5`
Expected: file exists with `# Spec Identity Header Schema` header

**Step 3: Commit**
`git commit -m "feat(cli): add spec identity header schema for SDD pipeline"`

---

### Task 3: Write failing tests for design doc parsing/validation

**Files:**
- Create: `tests/scripts/sdd-utils.test.js`

**Step 1: Write failing tests**

```js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  parseDesignDoc,
  validateDesignDoc,
} = require('../../scripts/lib/sdd-utils');

describe('parseDesignDoc', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-design-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return null for missing file', () => {
    const result = parseDesignDoc(
      path.join(tmpDir, 'docs/plans/auth/2026-04-01/design.md'),
      { cwd: tmpDir },
    );
    expect(result).toBeNull();
  });

  it('should extract spec_id and iteration from path', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-01');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'design.md'),
      '# Auth Design\n\nImplement per-user authentication with JWT tokens for secure access control and audit logging.',
    );

    const result = parseDesignDoc(
      path.join(designDir, 'design.md'),
      { cwd: tmpDir },
    );
    expect(result.spec_id).toBe('auth');
    expect(result.iteration).toBe('2026-04-01');
  });

  it('should detect initial mode when no spec.xml exists', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-01');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'design.md'),
      '# Auth Design\n\nImplement per-user authentication with JWT tokens for secure access control and audit logging.',
    );

    const result = parseDesignDoc(
      path.join(designDir, 'design.md'),
      { cwd: tmpDir },
    );
    expect(result.mode).toBe('initial');
  });

  it('should detect iteration mode when spec.xml exists', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-16');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'design.md'),
      '# Auth Iteration\n\n## Context\nAuth spec v1 covers registration and login.\n\n## Change Intent\nAdd OAuth provider support.',
    );
    const specDir = path.join(tmpDir, 'specs', 'auth');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'spec.xml'),
      '<spec><overview><design_iteration>2026-04-01</design_iteration></overview></spec>',
    );

    const result = parseDesignDoc(
      path.join(designDir, 'design.md'),
      { cwd: tmpDir },
    );
    expect(result.mode).toBe('iteration');
    expect(result.hasContext).toBe(true);
    expect(result.hasChangeIntent).toBe(true);
    expect(result.specDesignIteration).toBe('2026-04-01');
  });

  it('should detect missing Context heading', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-16');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'design.md'),
      '# Auth Iteration\n\n## Change Intent\nAdd OAuth provider support for reduced registration friction.',
    );
    const specDir = path.join(tmpDir, 'specs', 'auth');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'spec.xml'),
      '<spec><overview><design_iteration>2026-04-01</design_iteration></overview></spec>',
    );

    const result = parseDesignDoc(
      path.join(designDir, 'design.md'),
      { cwd: tmpDir },
    );
    expect(result.hasContext).toBe(false);
    expect(result.hasChangeIntent).toBe(true);
  });

  it('should return null for non-standard path pattern', () => {
    const nonStdDir = path.join(tmpDir, 'random');
    fs.mkdirSync(nonStdDir, { recursive: true });
    fs.writeFileSync(path.join(nonStdDir, 'design.md'), '# Random\n\nSome content.');

    const result = parseDesignDoc(
      path.join(nonStdDir, 'design.md'),
      { cwd: tmpDir },
    );
    expect(result).toBeNull();
  });

  it('should detect empty/stub content as non-substantive', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-01');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'design.md'), '# TODO\nFill in later');

    const result = parseDesignDoc(
      path.join(designDir, 'design.md'),
      { cwd: tmpDir },
    );
    expect(result.hasSubstantiveContent).toBe(false);
  });
});

describe('validateDesignDoc', () => {
  it('should return ERROR for null input (missing file)', () => {
    const result = validateDesignDoc(null);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'file' }),
      ]),
    );
  });

  it('should return ERROR for empty/stub content', () => {
    const result = validateDesignDoc({
      spec_id: 'auth',
      iteration: '2026-04-01',
      mode: 'initial',
      hasContext: false,
      hasChangeIntent: false,
      hasSubstantiveContent: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'content' }),
      ]),
    );
  });

  it('should pass valid initial mode doc', () => {
    const result = validateDesignDoc({
      spec_id: 'auth',
      iteration: '2026-04-01',
      mode: 'initial',
      hasContext: false,
      hasChangeIntent: false,
      hasSubstantiveContent: true,
    });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });

  it('should require Context heading in iteration mode', () => {
    const result = validateDesignDoc({
      spec_id: 'auth',
      iteration: '2026-04-16',
      mode: 'iteration',
      hasContext: false,
      hasChangeIntent: true,
      hasSubstantiveContent: true,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'Context' }),
      ]),
    );
  });

  it('should require Change Intent heading in iteration mode', () => {
    const result = validateDesignDoc({
      spec_id: 'auth',
      iteration: '2026-04-16',
      mode: 'iteration',
      hasContext: true,
      hasChangeIntent: false,
      hasSubstantiveContent: true,
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'Change Intent' }),
      ]),
    );
  });

  it('should warn on stale iteration date', () => {
    const result = validateDesignDoc({
      spec_id: 'auth',
      iteration: '2026-04-01',
      mode: 'iteration',
      hasContext: true,
      hasChangeIntent: true,
      hasSubstantiveContent: true,
      specDesignIteration: '2026-04-01',
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'WARNING', field: 'iteration' }),
      ]),
    );
  });

  it('should pass valid iteration mode doc', () => {
    const result = validateDesignDoc({
      spec_id: 'auth',
      iteration: '2026-04-16',
      mode: 'iteration',
      hasContext: true,
      hasChangeIntent: true,
      hasSubstantiveContent: true,
      specDesignIteration: '2026-04-01',
    });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });
});
```

**Step 2: Run tests**
Run: `npx jest tests/scripts/sdd-utils.test.js --no-coverage 2>&1 | head -20`
Expected: FAIL — `Cannot find module '../../scripts/lib/sdd-utils'`

---

### Task 4: Implement parseDesignDoc and validateDesignDoc

**Files:**
- Create: `scripts/lib/sdd-utils.js`

**Step 1: Implement**

```js
/**
 * SDD validation toolkit — deterministic checks for pipeline artifacts.
 * Validates structure and provides information; does NOT merge or author content.
 * LLM judgment is reserved for semantic checks (contradictions, ambiguity).
 */

const fs = require('node:fs');
const path = require('node:path');

const SUBSTANTIVE_CONTENT_MIN_LENGTH = 50;

/**
 * Parse a design doc file, extracting metadata from its path and content.
 * @param {string} filePath - Absolute path to the design.md file
 * @param {Object} [options]
 * @param {string} [options.cwd] - Working directory for filesystem checks (default: process.cwd())
 * @returns {{ spec_id: string, iteration: string, mode: 'initial'|'iteration', hasContext: boolean, hasChangeIntent: boolean, hasSubstantiveContent: boolean, specDesignIteration: string|null }|null}
 */
function parseDesignDoc(filePath, options = {}) {
  const cwd = options.cwd || process.cwd();

  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract spec_id and iteration from path pattern:
  // docs/plans/<spec-id>/<YYYY-MM-DD>/design.md
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(
    /docs\/plans\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/design\.md$/,
  );
  if (!match) return null;

  const [, specId, iteration] = match;

  // Determine mode from filesystem state
  const specPath = path.join(cwd, 'specs', specId, 'spec.xml');
  const specExists = fs.existsSync(specPath);
  const mode = specExists ? 'iteration' : 'initial';

  // Check for required headings (case-insensitive, any heading level)
  const hasContext = /^#+\s+Context\s*$/im.test(content);
  const hasChangeIntent = /^#+\s+Change\s+Intent\s*$/im.test(content);

  // Check substantive content (strip headings, check remaining length)
  const stripped = content.replace(/^#+\s+.*$/gm, '').trim();
  const hasSubstantiveContent =
    stripped.length >= SUBSTANTIVE_CONTENT_MIN_LENGTH;

  // For iteration mode, read spec's design_iteration
  let specDesignIteration = null;
  if (specExists) {
    const specContent = fs.readFileSync(specPath, 'utf-8');
    const iterMatch = specContent.match(
      /<design_iteration>([^<]+)<\/design_iteration>/,
    );
    if (iterMatch) specDesignIteration = iterMatch[1].trim();
  }

  return {
    spec_id: specId,
    iteration,
    mode,
    hasContext,
    hasChangeIntent,
    hasSubstantiveContent,
    specDesignIteration,
  };
}

/**
 * Validate a parsed design doc against the design doc contract.
 * @param {ReturnType<typeof parseDesignDoc>} parsed - Output from parseDesignDoc (null if file missing)
 * @returns {{ valid: boolean, issues: Array<{ level: 'ERROR'|'WARNING'|'INFO', field: string, message: string }> }}
 */
function validateDesignDoc(parsed) {
  const issues = [];

  if (!parsed) {
    issues.push({
      level: 'ERROR',
      field: 'file',
      message:
        'design doc not found. Run brainstorming to produce a design doc first.',
    });
    return { valid: false, issues };
  }

  if (!parsed.hasSubstantiveContent) {
    issues.push({
      level: 'ERROR',
      field: 'content',
      message: 'design doc has no substantive content',
    });
  }

  if (parsed.mode === 'iteration') {
    if (!parsed.hasContext) {
      issues.push({
        level: 'ERROR',
        field: 'Context',
        message:
          'iteration design doc missing required Context section — re-run brainstorming with Path B',
      });
    }
    if (!parsed.hasChangeIntent) {
      issues.push({
        level: 'ERROR',
        field: 'Change Intent',
        message:
          'iteration design doc missing required Change Intent section — re-run brainstorming with Path B',
      });
    }
    if (
      parsed.specDesignIteration &&
      parsed.iteration <= parsed.specDesignIteration
    ) {
      issues.push({
        level: 'WARNING',
        field: 'iteration',
        message: `design iteration ${parsed.iteration} is not newer than spec source ${parsed.specDesignIteration} — this may be a stale design doc`,
      });
    }
  }

  return {
    valid: issues.filter((i) => i.level === 'ERROR').length === 0,
    issues,
  };
}

module.exports = {
  parseDesignDoc,
  validateDesignDoc,
};
```

**Step 2: Run tests**
Run: `npx jest tests/scripts/sdd-utils.test.js --no-coverage`
Expected: All parseDesignDoc and validateDesignDoc tests PASS

**Step 3: Commit**
`git commit -m "feat(cli): add design doc parser and validator in sdd-utils"`

---

### Task 5: Write failing tests for spec header parsing/validation

**Files:**
- Modify: `tests/scripts/sdd-utils.test.js`

**Step 1: Update import and append spec header tests**

Update the import at the top of `tests/scripts/sdd-utils.test.js`:
```js
const {
  parseDesignDoc,
  validateDesignDoc,
  parseSpecHeader,
  validateSpecHeader,
} = require('../../scripts/lib/sdd-utils');
```

Append these test suites to the end of the file:

```js
describe('parseSpecHeader', () => {
  it('should return null for empty input', () => {
    expect(parseSpecHeader('')).toBeNull();
    expect(parseSpecHeader(null)).toBeNull();
  });

  it('should return null for XML without overview', () => {
    expect(parseSpecHeader('<spec><details></details></spec>')).toBeNull();
  });

  it('should parse v1 spec header', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>1</spec_version>
      <status>active</status>
      <title>Auth System</title>
      <description>Per-user authentication</description>
      <source>
        <design_path>docs/plans/auth/2026-04-01/design.md</design_path>
        <design_iteration>2026-04-01</design_iteration>
      </source>
      <scope>
        <includes>
          <feature id="login">User login</feature>
        </includes>
        <excludes>
          <reason>OAuth deferred</reason>
        </excludes>
      </scope>
    </overview></spec>`;

    const result = parseSpecHeader(xml);
    expect(result.spec_id).toBe('auth');
    expect(result.spec_version).toBe(1);
    expect(result.status).toBe('active');
    expect(result.title).toBe('Auth System');
    expect(result.description).toBe('Per-user authentication');
    expect(result.design_path).toBe('docs/plans/auth/2026-04-01/design.md');
    expect(result.design_iteration).toBe('2026-04-01');
    expect(result.supersedes).toBeNull();
    expect(result.scope.includes).toHaveLength(1);
    expect(result.scope.includes[0].id).toBe('login');
    expect(result.scope.excludes).toHaveLength(1);
  });

  it('should parse v2 spec with supersedes and delta', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>2</spec_version>
      <status>active</status>
      <supersedes>auth:v1</supersedes>
      <title>Auth System</title>
      <description>Auth with OAuth</description>
      <source>
        <design_path>docs/plans/auth/2026-04-16/design.md</design_path>
        <design_iteration>2026-04-16</design_iteration>
      </source>
      <scope>
        <includes>
          <feature id="login">User login</feature>
          <feature id="oauth">OAuth support</feature>
        </includes>
      </scope>
      <delta version="2" iteration="2026-04-16">
        <added ref="fr-oauth-001">OAuth integration</added>
        <modified ref="fr-login-001">Updated login flow</modified>
      </delta>
    </overview></spec>`;

    const result = parseSpecHeader(xml);
    expect(result.spec_version).toBe(2);
    expect(result.supersedes).toBe('auth:v1');
    expect(result.scope.includes).toHaveLength(2);
    expect(result.delta).toBeDefined();
    expect(result.delta.version).toBe('2');
    expect(result.delta.added).toHaveLength(1);
    expect(result.delta.modified).toHaveLength(1);
    expect(result.delta.removed).toHaveLength(0);
  });
});

describe('validateSpecHeader', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-spec-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return ERROR for null input', () => {
    const result = validateSpecHeader(null);
    expect(result.valid).toBe(false);
    expect(result.issues[0].level).toBe('ERROR');
    expect(result.issues[0].field).toBe('overview');
  });

  it('should flag missing required fields', () => {
    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: null,
        status: null,
        title: null,
        design_path: null,
        design_iteration: null,
        scope: null,
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(false);
    const errorFields = result.issues
      .filter((i) => i.level === 'ERROR')
      .map((i) => i.field);
    expect(errorFields).toContain('spec_version');
    expect(errorFields).toContain('status');
    expect(errorFields).toContain('design_path');
    expect(errorFields).toContain('design_iteration');
  });

  it('should flag non-positive spec_version', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-01');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'design.md'), 'content');

    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: 0,
        status: 'active',
        title: 'Auth',
        design_path: 'docs/plans/auth/2026-04-01/design.md',
        design_iteration: '2026-04-01',
        scope: { includes: [{ id: 'x', description: 'y' }], excludes: [] },
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'spec_version' }),
      ]),
    );
  });

  it('should flag broken design_path', () => {
    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: 1,
        status: 'active',
        title: 'Auth',
        design_path: 'docs/plans/auth/2026-99-99/design.md',
        design_iteration: '2026-04-01',
        scope: { includes: [{ id: 'x', description: 'y' }], excludes: [] },
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'ERROR',
          field: 'source/design_path',
        }),
      ]),
    );
  });

  it('should flag invalid date format', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-01');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'design.md'), 'content');

    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: 1,
        status: 'active',
        title: 'Auth',
        design_path: 'docs/plans/auth/2026-04-01/design.md',
        design_iteration: 'April 2026',
        scope: { includes: [{ id: 'x', description: 'y' }], excludes: [] },
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'ERROR',
          field: 'source/design_iteration',
        }),
      ]),
    );
  });

  it('should flag missing supersedes for v2+', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-16');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'design.md'), 'content');

    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: 2,
        status: 'active',
        title: 'Auth',
        design_path: 'docs/plans/auth/2026-04-16/design.md',
        design_iteration: '2026-04-16',
        supersedes: null,
        scope: { includes: [{ id: 'x', description: 'y' }], excludes: [] },
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'supersedes' }),
      ]),
    );
  });

  it('should flag invalid supersedes format', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-16');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'design.md'), 'content');

    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: 2,
        status: 'active',
        title: 'Auth',
        design_path: 'docs/plans/auth/2026-04-16/design.md',
        design_iteration: '2026-04-16',
        supersedes: 'auth-v1',
        scope: { includes: [{ id: 'x', description: 'y' }], excludes: [] },
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'supersedes' }),
      ]),
    );
  });

  it('should warn on empty scope includes', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-01');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'design.md'), 'content');

    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: 1,
        status: 'active',
        title: 'Auth',
        design_path: 'docs/plans/auth/2026-04-01/design.md',
        design_iteration: '2026-04-01',
        scope: { includes: [], excludes: [] },
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'WARNING', field: 'scope/includes' }),
      ]),
    );
  });

  it('should pass valid v1 header', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-01');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'design.md'), 'content');

    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: 1,
        status: 'active',
        title: 'Auth System',
        design_path: 'docs/plans/auth/2026-04-01/design.md',
        design_iteration: '2026-04-01',
        scope: {
          includes: [{ id: 'login', description: 'User login' }],
          excludes: [],
        },
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });

  it('should pass valid v2 header with supersedes', () => {
    const designDir = path.join(tmpDir, 'docs', 'plans', 'auth', '2026-04-16');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'design.md'), 'content');

    const result = validateSpecHeader(
      {
        spec_id: 'auth',
        spec_version: 2,
        status: 'active',
        title: 'Auth System',
        design_path: 'docs/plans/auth/2026-04-16/design.md',
        design_iteration: '2026-04-16',
        supersedes: 'auth:v1',
        scope: {
          includes: [{ id: 'login', description: 'User login' }],
          excludes: [],
        },
      },
      { cwd: tmpDir },
    );
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });
});
```

**Step 2: Run tests**
Run: `npx jest tests/scripts/sdd-utils.test.js --no-coverage 2>&1 | tail -10`
Expected: FAIL — `parseSpecHeader is not a function` (not exported yet)

---

### Task 6: Implement parseSpecHeader and validateSpecHeader

**Files:**
- Modify: `scripts/lib/sdd-utils.js`

**Step 1: Add implementations before module.exports**

```js
/**
 * Parse a spec.xml identity header from XML content.
 * Extracts the <overview> element and returns structured fields.
 * @param {string} specXmlContent - Raw XML content of spec.xml
 * @returns {Object|null} Parsed header or null if not found
 */
function parseSpecHeader(specXmlContent) {
  if (!specXmlContent || typeof specXmlContent !== 'string') return null;

  const overviewMatch = specXmlContent.match(
    /<overview>([\s\S]*?)<\/overview>/,
  );
  if (!overviewMatch) return null;

  const overview = overviewMatch[1];

  const extract = (tag) => {
    const m = overview.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1].trim() : null;
  };

  const specId = extract('spec_id');
  const specVersionStr = extract('spec_version');
  const status = extract('status');
  const title = extract('title');
  const description = extract('description');
  const supersedes = extract('supersedes');

  // Source element
  let designPath = null;
  let designIteration = null;
  const sourceMatch = overview.match(/<source>([\s\S]*?)<\/source>/);
  if (sourceMatch) {
    const src = sourceMatch[1];
    const dpMatch = src.match(/<design_path>([^<]+)<\/design_path>/);
    const diMatch = src.match(/<design_iteration>([^<]+)<\/design_iteration>/);
    if (dpMatch) designPath = dpMatch[1].trim();
    if (diMatch) designIteration = diMatch[1].trim();
  }

  // Scope element
  let scope = null;
  const scopeMatch = overview.match(/<scope>([\s\S]*?)<\/scope>/);
  if (scopeMatch) {
    const scopeContent = scopeMatch[1];
    const includes = [];
    const excludes = [];

    const featureRegex = /<feature\s+id="([^"]+)">([^<]*)<\/feature>/g;
    let fMatch;
    while ((fMatch = featureRegex.exec(scopeContent))) {
      includes.push({ id: fMatch[1], description: fMatch[2].trim() });
    }

    const reasonRegex = /<reason>([^<]*)<\/reason>/g;
    let rMatch;
    while ((rMatch = reasonRegex.exec(scopeContent))) {
      excludes.push(rMatch[1].trim());
    }

    scope = { includes, excludes };
  }

  // Delta element
  let delta = null;
  const deltaMatch = overview.match(
    /<delta\s+version="([^"]+)"\s+iteration="([^"]+)">([\s\S]*?)<\/delta>/,
  );
  if (deltaMatch) {
    const [, dVersion, dIteration, deltaContent] = deltaMatch;
    const added = [];
    const modified = [];
    const removed = [];

    const changeRegex =
      /<(added|modified|removed)\s+ref="([^"]+)"[^>]*>([^<]*)<\/\1>/g;
    let cMatch;
    while ((cMatch = changeRegex.exec(deltaContent))) {
      const entry = { ref: cMatch[2], text: cMatch[3].trim() };
      if (cMatch[1] === 'added') added.push(entry);
      else if (cMatch[1] === 'modified') modified.push(entry);
      else removed.push(entry);
    }

    delta = {
      version: dVersion,
      iteration: dIteration,
      added,
      modified,
      removed,
    };
  }

  return {
    spec_id: specId,
    spec_version: specVersionStr
      ? Number.parseInt(specVersionStr, 10)
      : null,
    status,
    title,
    description,
    design_path: designPath,
    design_iteration: designIteration,
    scope,
    supersedes: supersedes || null,
    delta,
  };
}

/**
 * Validate a parsed spec identity header.
 * @param {Object|null} parsed - Output from parseSpecHeader
 * @param {Object} [options]
 * @param {string} [options.cwd] - Working directory for filesystem checks
 * @returns {{ valid: boolean, issues: Array<{ level: 'ERROR'|'WARNING'|'INFO', field: string, message: string }> }}
 */
function validateSpecHeader(parsed, options = {}) {
  const cwd = options.cwd || process.cwd();
  const issues = [];

  if (!parsed) {
    issues.push({
      level: 'ERROR',
      field: 'overview',
      message:
        'spec identity header not found — spec.xml must contain an <overview> element',
    });
    return { valid: false, issues };
  }

  // Required fields
  const requiredFields = [
    'spec_id',
    'spec_version',
    'status',
    'title',
    'design_path',
    'design_iteration',
  ];
  for (const field of requiredFields) {
    if (parsed[field] === null || parsed[field] === undefined) {
      issues.push({
        level: 'ERROR',
        field,
        message: `missing required field: ${field}`,
      });
    }
  }

  // spec_version must be positive integer
  if (parsed.spec_version !== null && parsed.spec_version !== undefined) {
    if (
      !Number.isInteger(parsed.spec_version) ||
      parsed.spec_version < 1
    ) {
      issues.push({
        level: 'ERROR',
        field: 'spec_version',
        message: `spec_version must be a positive integer, got: ${parsed.spec_version}`,
      });
    }
  }

  // design_path must point to existing file
  if (parsed.design_path) {
    const resolvedPath = path.resolve(cwd, parsed.design_path);
    if (!fs.existsSync(resolvedPath)) {
      issues.push({
        level: 'ERROR',
        field: 'source/design_path',
        message: `design doc not found at ${parsed.design_path}`,
      });
    }
  }

  // design_iteration format
  if (
    parsed.design_iteration &&
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed.design_iteration)
  ) {
    issues.push({
      level: 'ERROR',
      field: 'source/design_iteration',
      message: `design_iteration must be YYYY-MM-DD format, got: ${parsed.design_iteration}`,
    });
  }

  // supersedes required for v2+
  if (parsed.spec_version > 1 && !parsed.supersedes) {
    issues.push({
      level: 'ERROR',
      field: 'supersedes',
      message: 'supersedes is required when spec_version > 1',
    });
  }

  // supersedes format
  if (parsed.supersedes && !/^[a-z0-9-]+:v\d+$/.test(parsed.supersedes)) {
    issues.push({
      level: 'ERROR',
      field: 'supersedes',
      message: `supersedes must be "<spec-id>:v<N>" format, got: ${parsed.supersedes}`,
    });
  }

  // scope warnings
  if (
    parsed.scope &&
    parsed.scope.includes &&
    parsed.scope.includes.length === 0
  ) {
    issues.push({
      level: 'WARNING',
      field: 'scope/includes',
      message:
        'scope includes is empty — consider listing included features',
    });
  }

  return {
    valid: issues.filter((i) => i.level === 'ERROR').length === 0,
    issues,
  };
}
```

Update `module.exports`:
```js
module.exports = {
  parseDesignDoc,
  validateDesignDoc,
  parseSpecHeader,
  validateSpecHeader,
};
```

**Step 2: Run tests**
Run: `npx jest tests/scripts/sdd-utils.test.js --no-coverage`
Expected: All tests PASS

**Step 3: Run full test suite**
Run: `npm test`
Expected: All 4 runners pass

**Step 4: Lint**
Run: `npm run lint:fix`

**Step 5: Commit**
`git commit -m "feat(cli): add spec header parser and validator in sdd-utils"`

---

### Task 7: Update arc-brainstorming SKILL.md

**Files:**
- Modify: `skills/arc-brainstorming/SKILL.md`

**Key changes from current:**
1. **Add Phase 0: Scan & Route** — scan `specs/` for existing spec_ids, ask user to confirm Path A (new) or Path B (iteration), MUST NOT auto-detect
2. **Remove REFINER_INPUT** — refiner now reads the complete design doc, no special structured section needed
3. **Add Path B (gamma mode)** — read existing spec + design iterations, produce Context/Change Intent/Architecture Impact sections
4. **Change output path** — from `docs/plans/YYYY-MM-DD-<topic>-design.md` to `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`
5. **Add Phase 5: Validate** — read `scripts/lib/sdd-schemas/design.md` before writing, validate output per path
6. **Add spec-id derivation** — Path A derives spec-id from content after Phase 2, confirms with user; Path B uses existing
7. **Path A template** — Problem, Proposed Solution, Requirements (prose), Scope (no REFINER_INPUT)
8. **Path B template** — Context, Change Intent, Architecture Impact

Remove the `REFINER_INPUT` template, `REFINER_INPUT_START/END` markers, and the "Include REFINER_INPUT section" instruction. Remove the routing logic that chose between refiner and task-writing based on complexity — always route to refiner after brainstorming.

See Task 7 full content in spec requirements fr-bs-001 through fr-bs-007, fr-cc-006.

**Step 1: Replace SKILL.md content**

Write the new SKILL.md following the structure above. The complete content should cover: Iron Law, When NOT to Use, Phase 0 (Scan & Route), Phase 1 (Understanding), Phase 2 (Exploring), Phase 3 (Presenting with path-specific sections), Phase 4 (Spec ID & Output), Phase 5 (Validate & Write), Templates (Path A + Path B), After the Design, Red Flags, Key Principles, Stage Completion Format, Blocked Format.

**Step 2: Verify**
Run: `npm run test:skills`
Expected: PASS

**Step 3: Commit**
`git commit -m "feat(skills): update arc-brainstorming for SDD pipeline v2"`

---

### Task 8: Update arc-refining SKILL.md

**Files:**
- Modify: `skills/arc-refining/SKILL.md`

**Key changes from current:**
1. **Remove REFINER_INPUT requirement** — refiner reads the complete design doc, not a structured section
2. **Add filesystem-detected mode** — check if `specs/<spec-id>/spec.xml` exists to determine initial vs iteration mode (no explicit mode declaration)
3. **Add input validation** — run `sdd-utils.js` `parseDesignDoc`/`validateDesignDoc` before any formalization, block on ERRORs with refiner-report.md
4. **Add spec-id routing** — when user doesn't provide spec-id, scan and present available targets
5. **Add identity header** — every spec.xml gets the full identity header per `sdd-schemas/spec.md`
6. **Add delta metadata output** — iteration mode writes `<delta>` element recording added/modified/removed
7. **Add version increment** — `spec_version = previous + 1`, `supersedes = <spec-id>:v<previous>`
8. **Add two-pass write** — build spec in memory, validate with `validateSpecHeader`, write atomically only if valid
9. **Add contradiction checks** — LLM judgment for contradictions and broken dependencies
10. **Change output path** — from `specs/` to `specs/<spec-id>/`
11. **Add R2 enforcement** — refiner MUST NOT write to `docs/plans/` (except refiner-report.md)
12. **Rejection report** — format with issues, types, and remediation recommendations

See Task 8 full content in spec requirements fr-rf-001 through fr-rf-011, fr-cc-002.

**Step 1: Replace SKILL.md content**

Write the new SKILL.md covering: Overview, When NOT to Use, Core Rules (with R2 and two-pass write), Input Validation (Phase 1), Formalization (Phase 2 with initial and iteration sub-modes), Contradiction Checks (LLM judgment), Iterative Refinement (Phase 3), Output Validation (Phase 4), Output Structure, Rejection Report format, Commit Requirements, Red Flags, Completion Format, Blocked Format.

**Step 2: Verify**
Run: `npm run test:skills`
Expected: PASS

**Step 3: Commit**
`git commit -m "feat(skills): update arc-refining for SDD pipeline v2"`

---

### Task 9: Update arc-planning SKILL.md

**Files:**
- Modify: `skills/arc-planning/SKILL.md`

**Key changes from current:**
1. **Add input validation** — run `sdd-utils.js` `validateSpecHeader` before decomposition, block on ERRORs
2. **Add spec-id routing** — when user doesn't provide spec-id, scan and present available targets
3. **Add DAG completion gate** — check existing `dag.yaml` before building new one; block if incomplete epics exist
4. **Sprint model** — always build dag.yaml from scratch (DAG is a derived view, not incrementally maintained)
5. **Delta-scoped planning** — when `<delta>` exists, plan only referenced requirements (added + modified); no delta (v1) = plan all
6. **Change output path** — from root `dag.yaml`/`epics/` to `specs/<spec-id>/dag.yaml` and `specs/<spec-id>/epics/`
7. **Add done signal** — all epics completed = sprint done, DAG can be archived
8. **Add output validation** — check epic fields, no cycles, valid references before writing
9. **Add R2 enforcement** — planner MUST NOT write to `spec.xml` or `details/`
10. **Remove trigger** — remove "specs/spec.xml exists → enter Planner" since path is now `specs/<spec-id>/spec.xml`
11. **Add "planner reads spec only" rule** — planner MUST NOT read design docs, spec's `<delta>` provides scope

See Task 9 full content in spec requirements fr-pl-001 through fr-pl-007, fr-cc-002.

**Step 1: Replace SKILL.md content**

Write the new SKILL.md covering: Overview, When NOT to Use, Input Validation (Phase 1), DAG Completion Gate (Phase 2), Sprint Model — Build From Scratch (Phase 3 with scope determination and mapping rules), Output Validation (Phase 4), Output Structure (per-spec), Infrastructure Commands, Done Signal, Commit Requirements, Unidirectional Flow, Red Flags, Completion Format, Blocked Format.

**Step 2: Verify**
Run: `npm run test:skills`
Expected: PASS

**Step 3: Run full test suite**
Run: `npm test`
Expected: All 4 runners pass

**Step 4: Lint**
Run: `npm run lint:fix`

**Step 5: Commit**
`git commit -m "feat(skills): update arc-planning for SDD pipeline v2"`
