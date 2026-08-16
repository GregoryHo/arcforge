const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { REPO_ROOT } = require('./skill-tree');

// ---------------------------------------------------------------------------
// D8 — engine/skill boundary lint (v6).
// ---------------------------------------------------------------------------
//
// D8 (unrevisable decision): the engine owns the disk formats; skills consume
// them through the CLI. Dependency flows ONE way — skills may call the engine,
// the engine must never reach into `skills/`. Every reverse reference is a
// coupling that makes a skill undeletable.
//
// Rule: no file under `scripts/**` or `hooks/**` may name a CONCRETE skill
// directory. Two shapes are detected:
//   `skills/<name>/…`                     (path string)
//   path.join(…, 'skills', '<name>', …)   (segment list)
//
// Generic tree access is NOT a violation: `skills/` with no literal name, or a
// templated segment (`skills/${name}/`, path.join(dir, 'skills', name)) is how
// the repo-scanning guards legitimately work, and it survives any individual
// skill being deleted. Only a hard-coded skill NAME couples the engine to a
// skill's existence.
//
// SCOPE / EXCLUSIONS (deliberate, documented so nobody widens them silently):
//   - Code files only (.js/.mjs/.cjs/.sh/.json). Markdown under hooks/ is
//     prose, policed by the doc-reference linter (check:docs), not here.
//   - Test files (`__tests__/` dirs, `*.test.js`) are excluded: they are
//     contributor surface, they are being relocated during P1/P2, and pinning
//     their paths here would make an unrelated move turn this suite red.
//   - `.claude/skills/…` is this repo's own contributor-side skill dir, not the
//     shipped `skills/` tree, so it never counts.
//
// The two OUT-OF-PARTITION reverse references this file used to track —
// package.json's `test:observer-daemon` and jest.config.js's
// `**/skills/**/__tests__/**` testMatch — are gone as of P2: the observer daemon
// moved to scripts/lib/learning-curator/ (tests to tests/observer-daemon/) and
// the eval dashboard moved to scripts/lib/eval-dashboard/ (tests to
// tests/scripts/), so no skill tree holds engine code or engine tests any more.
//
// ALLOWLIST CONTRACT: the allowlist is compared for EXACT EQUALITY against the
// scan result. A new violation fails; so does a stale entry left behind after a
// reference is removed. Entries are keyed on file + skill (not line number) so
// that reformatting or unrelated edits in the same file don't produce spurious
// failures. THE ALLOWLIST MUST BE EMPTY AT THE P5 GATE — that emptiness is the
// formal machine proof that the D8 boundary decision landed. It may only ever
// shrink; adding an entry requires a maintainer decision, not a test edit.

const SCAN_ROOTS = ['scripts', 'hooks'];
const CODE_EXTS = new Set(['.js', '.mjs', '.cjs', '.sh', '.json']);

// Lifecycle buckets (P6.5): skills live at `skills/<bucket>/<name>/`, so the
// segment right after `skills/` is a bucket, not a skill. Naming a bucket is
// generic tree access — the same category as bare `skills/` — while naming a
// skill INSIDE one is the coupling D8 forbids. Both shapes below therefore
// capture an optional second segment and resolve through `resolvedSkill()`.
const BUCKETS = new Set(['core', 'in-progress', 'deprecated']);

// `skills/<name>` / `skills/<bucket>/<name>` as a path string. The first
// lookbehind stops `inject-skills/` from reading as `skills/`; the second
// exempts `.claude/skills/`. The trailing slash is OPTIONAL on purpose:
// hoisting the coupling into a variable (`const d = 'skills/arc-learning'`)
// strips the slash and would otherwise empty the allowlist while the coupling
// survives — exactly the evasion that would fake the P5 zero-assertion. The
// trailing boundary keeps `skills/foo` from matching inside `skills/foobar`.
const PATH_SHAPE_RE =
  /(?<![\w-])(?<!\.claude\/)skills\/([a-z0-9][a-z0-9-]*)(?:\/([a-z0-9][a-z0-9-]*))?(?![\w-])/g;
// path.join(root, 'skills', 'core', 'arc-evaluating', …) — the segmented evasion
// of the shape above. A variable segment (…, 'skills', name) is generic and not
// matched.
const SEGMENT_SHAPE_RE =
  /['"]skills['"]\s*,\s*['"]([a-z0-9][a-z0-9-]*)['"](?:\s*,\s*['"]([a-z0-9][a-z0-9-]*)['"])?/g;

/**
 * Resolve a regex match to the skill it couples to, or null when the reference
 * is generic tree access. A leading bucket segment is skipped: `skills/core/tdd`
 * couples to `tdd`, while `skills/core` on its own names no skill at all.
 * @param {RegExpMatchArray} m
 * @returns {string|null}
 */
function resolvedSkill(m) {
  if (!BUCKETS.has(m[1])) return m[1];
  return m[2] || null;
}

// file + skill → number of references. EMPTY as of the P5 gate.
//
// P2 burned every `scripts/**` entry down to zero by relocating the files the
// engine was reaching for: observer-daemon.sh + observer-prompt.md →
// scripts/lib/learning-curator/, auto-diary.js → scripts/lib/, the three eval
// agent prompts → scripts/lib/prompts/, the eval dashboard →
// scripts/lib/eval-dashboard/. What survived was `hooks/**` only.
//
// P5 burned the last entry: hooks/session-tracker/end.js used to shell out to
// `skills/arc-reflecting/scripts/reflect.js auto-check`. That logic moved into
// scripts/lib/learning-workflow.js (`checkReflectReady`) and the hook now
// requires the canonical engine directly, which is the legal direction.
//
// THE LIST IS NOW CLOSED. It may never grow again: an addition is a maintainer
// decision about the D8 boundary, not a test edit. Both the constant and the
// live scan are asserted empty below, so neither a new coupling nor a
// re-introduced allowlist entry can pass.
const ALLOWLIST = [];

function isExcluded(name) {
  return name.startsWith('.') || name === 'node_modules' || name === '__tests__';
}

function collectCodeFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (isExcluded(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectCodeFiles(full, acc);
    else if (entry.isFile() && CODE_EXTS.has(path.extname(entry.name))) {
      if (entry.name.endsWith('.test.js')) continue;
      acc.push(full);
    }
  }
  return acc;
}

/** @returns {{file:string, skill:string, line:number, content:string}[]} */
function findSkillReferences(absFile, repoRoot) {
  const rel = path.relative(repoRoot, absFile).split(path.sep).join('/');
  const lines = fs.readFileSync(absFile, 'utf8').split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    for (const re of [PATH_SHAPE_RE, SEGMENT_SHAPE_RE]) {
      for (const m of lines[i].matchAll(re)) {
        const skill = resolvedSkill(m);
        if (!skill) continue;
        hits.push({ file: rel, skill, line: i + 1, content: lines[i].trim().slice(0, 120) });
      }
    }
  }
  return hits;
}

/** Scan roots under `repoRoot`, returning sorted {file, skill, count} entries. */
function scanEngineBoundary(repoRoot, roots = SCAN_ROOTS) {
  const hits = [];
  for (const root of roots) {
    for (const file of collectCodeFiles(path.join(repoRoot, root))) {
      hits.push(...findSkillReferences(file, repoRoot));
    }
  }
  const counts = new Map();
  for (const h of hits) {
    const key = `${h.file}\u0000${h.skill}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {
    entries: [...counts.entries()]
      .map(([key, count]) => {
        const [file, skill] = key.split('\u0000');
        return { file, skill, count };
      })
      .sort((a, b) => a.file.localeCompare(b.file) || a.skill.localeCompare(b.skill)),
    hits,
  };
}

describe('D8 engine/skill boundary', () => {
  const { entries, hits } = scanEngineBoundary(REPO_ROOT);

  it('scans a non-empty engine surface (sanity floor)', () => {
    const files = collectCodeFiles(path.join(REPO_ROOT, 'scripts')).length;
    expect(files).toBeGreaterThan(20);
  });

  it('reverse references match the allowlist exactly (no additions, no stale entries)', () => {
    // Deep equality both ways: a new coupling fails, and so does an allowlist
    // entry whose reference has already been removed (forcing the ratchet down).
    expect(entries).toEqual(ALLOWLIST);
  });

  it('reports file, line and content for every tracked reference', () => {
    // Keeps the report actionable for whoever burns the allowlist down in P2/P5.
    for (const h of hits) {
      expect(typeof h.line).toBe('number');
      expect(h.content.length).toBeGreaterThan(0);
    }
    expect(hits.length).toBe(ALLOWLIST.reduce((n, e) => n + e.count, 0));
  });

  it('has an empty allowlist — the P5 gate assertion', () => {
    // The formal machine proof that D8 landed: the engine holds ZERO references
    // to a concrete skill directory. Ratcheted 7 → 1 in P2 → 0 in P5.
    //
    // This asserts the CONSTANT, not just the scan result. The scan assertion
    // above compares against ALLOWLIST, so it would keep passing if someone
    // re-added a coupling together with its allowlist entry. Pinning the
    // constant closes that door: no entry can be added without turning this red.
    expect(ALLOWLIST).toEqual([]);
  });

  it('finds no reverse reference anywhere in the engine surface', () => {
    // Stated independently of ALLOWLIST so the zero is readable on its own.
    expect(entries).toEqual([]);
    expect(hits).toEqual([]);
  });
});

describe('D8 detectors (synthetic fixtures)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd8-lint-'));
    fs.mkdirSync(path.join(tmpDir, 'scripts', 'lib'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const write = (rel, content) => {
    const abs = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  it('flags a path-shaped reference to a concrete skill', () => {
    write('scripts/lib/a.js', "require('../../skills/arc-learning/scripts/x.js');\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([
      { file: 'scripts/lib/a.js', skill: 'arc-learning', count: 1 },
    ]);
  });

  it('flags a path.join segment list naming a concrete skill', () => {
    write('scripts/lib/b.js', "path.join(root, 'skills', 'arc-evaluating', 'agents', 'g.md');\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([
      { file: 'scripts/lib/b.js', skill: 'arc-evaluating', count: 1 },
    ]);
  });

  it('allows generic tree access with no literal skill name', () => {
    write('scripts/lib/c.js', "const dir = 'skills/';\npath.join(root, 'skills', name);\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([]);
  });

  it('allows a templated skill segment', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text, not a JS template
    write('scripts/lib/d.js', 'const p = `skills/${name}/SKILL.md`;\n');
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([]);
  });

  it('flags a skill dir hoisted into a variable (no trailing slash)', () => {
    write('scripts/lib/h.js', "const dir = 'skills/arc-learning';\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([
      { file: 'scripts/lib/h.js', skill: 'arc-learning', count: 1 },
    ]);
  });

  it('does not read inject-skills/ as skills/', () => {
    write('scripts/lib/e.js', "run('hooks/inject-skills/main.sh');\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([]);
  });

  it('does not count the contributor-side .claude/skills/ tree', () => {
    write('scripts/lib/f.js', '// see .claude/skills/arc-releasing/SKILL.md\n');
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([]);
  });

  it('excludes test files from the scanned surface', () => {
    write('scripts/lib/g.test.js', "require('../../skills/arc-learning/x.js');\n");
    write('scripts/lib/__tests__/h.js', "require('../../skills/arc-learning/x.js');\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([]);
  });

  it('counts repeated references to the same skill in one file', () => {
    write('scripts/lib/i.js', "'skills/arc-learning/a'\n'skills/arc-learning/b'\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([
      { file: 'scripts/lib/i.js', skill: 'arc-learning', count: 2 },
    ]);
  });

  // --- Bucket layout (P6.5). A bucket segment is generic tree access; the skill
  // name INSIDE a bucket is still the coupling D8 forbids.

  it('allows naming a bucket root, which couples to no skill', () => {
    write('scripts/lib/j.js', "const dir = 'skills/core/';\npath.join(root, 'skills', 'core');\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([]);
  });

  it('flags a concrete skill reached through its bucket', () => {
    write('scripts/lib/k.js', "require('../../skills/core/learning/scripts/x.js');\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([
      { file: 'scripts/lib/k.js', skill: 'learning', count: 1 },
    ]);
  });

  it('flags a path.join segment list naming a skill inside a bucket', () => {
    write('scripts/lib/l.js', "path.join(root, 'skills', 'core', 'evaluating', 'SKILL.md');\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([
      { file: 'scripts/lib/l.js', skill: 'evaluating', count: 1 },
    ]);
  });

  it('allows a templated skill segment under a bucket', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text, not a JS template
    write('scripts/lib/m.js', 'const p = `skills/core/${name}/SKILL.md`;\n');
    write('scripts/lib/n.js', "path.join(root, 'skills', 'core', name);\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([]);
  });

  it('flags a skill in a non-shipping bucket too', () => {
    write('scripts/lib/o.js', "const d = 'skills/deprecated/arc-planning';\n");
    expect(scanEngineBoundary(tmpDir, ['scripts']).entries).toEqual([
      { file: 'scripts/lib/o.js', skill: 'arc-planning', count: 1 },
    ]);
  });
});
