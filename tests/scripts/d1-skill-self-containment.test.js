const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { REPO_ROOT, SKILLS_DIR, legacySkills, governedSkills } = require('./v6-legacy-skills');

// ---------------------------------------------------------------------------
// D1 — skill self-containment lint (v6).
// ---------------------------------------------------------------------------
//
// D1 (unrevisable decision): a skill is a black box. Its executable files NEVER
// require/import/source anything outside their own `skills/<name>/` directory,
// and its prose NEVER names engine internals. Engine functionality is reached
// exactly one way: a subprocess call to the bare `arcforge` CLI (plugin bin/ on PATH, D9).
//
// This file REPLACES tests/scripts/skill-path-discipline.test.js, which enforced
// the exact inverse (cc-005 demanded an `${ARCFORGE_ROOT}/scripts/lib/` prefix on
// engine references; cc-006 demanded an `ARCFORGE_ROOT` fallback header inside
// every skill bash block). Both are D1 violations by construction, so the file
// was deleted rather than amended.
//
// Two rules:
//   D1-A  executable files (.js/.sh/.py) under skills/<name>/ must not: reference
//         a path that escapes skills/<name>/; mention ARCFORGE_ROOT; load code
//         (require/import/source) from outside; mention CLAUDE_PLUGIN_ROOT (D9:
//         SUBPROCESS calls only; or name the engine lib path in any spelling.
//   D1-B  markdown under skills/<name>/ must not contain `scripts/lib/` or
//         `ARCFORGE_ROOT` — engine internals are not part of a skill's prose.
//
// GRANDFATHERING: skills listed in docs/plans/v6/legacy-skills.json are exempt
// wholesale (whole directory). They are v5 skills that will be deleted or
// rewritten in P2–P6; rewriting them now is out of scope for P1. Every other
// skill is fully governed. The ratchet below keeps the exemption honest.

const ARCFORGE_ROOT_TOKEN = 'ARCFORGE_ROOT';
const ENGINE_PATH_TOKEN = 'scripts/lib/';
const EXECUTABLE_EXTS = new Set(['.js', '.mjs', '.cjs', '.sh', '.py']);

/** Recursively collect files under dir (skips node_modules/.venv/dot-dirs). */
function walkFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

function truncate(s, n = 120) {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

// A quoted (or bare, for `source x`) path literal that walks up from the file's
// own directory. This single detector covers every escape shape we care about:
//   require('../../scripts/lib/x')   import x from '../../x'
//   path.join(__dirname, '../../x')  source ../../lib/x.sh
//   sys.path.insert(0, '../../x')
// because they all encode the escape as a `../`-leading relative literal
// resolved against the file's directory.
const RELATIVE_LITERAL_RE = /['"`](\.\.[^'"`\n]*)['"`]/g;
const SHELL_SOURCE_RE = /^\s*(?:source|\.)\s+(\S+)/;

// D9 (spike-verified): CLAUDE_PLUGIN_ROOT is exported to hooks only and is
// UNSET in skill-triggered Bash. The blessed engine call from a skill is the
// bare `arcforge` CLI — Claude Code puts every loaded plugin's bin/ on PATH.
// Any CLAUDE_PLUGIN_ROOT mention in a skill is therefore a runtime lie.
const PLUGIN_ROOT_TOKEN = 'CLAUDE_PLUGIN_ROOT';
// `'scripts', 'lib'` — the engine path spelled as separate join() segments.
const ENGINE_SEGMENT_RE = /['"]scripts['"]\s*,\s*['"]lib['"]/;

/**
 * Find D1-A violations in one executable file.
 * @param {string} absFile
 * @param {string} skillDir absolute path of the owning skills/<name>/ dir
 */
function findExecutableViolations(absFile, skillDir) {
  const out = [];
  const lines = fs.readFileSync(absFile, 'utf8').split('\n');
  const fileDir = path.dirname(absFile);
  const rel = path.relative(REPO_ROOT, absFile);

  const flag = (lineNo, line, message) =>
    out.push({ rule: 'D1-A', file: rel, line: lineNo, content: truncate(line), message });

  const flagEscape = (spec, lineNo, line) => {
    const resolved = path.resolve(fileDir, spec.replace(/["'`]/g, ''));
    if (!path.relative(skillDir, resolved).startsWith('..')) return; // inside — fine
    flag(lineNo, line, `reference escapes its skill directory: ${spec}`);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    const before = out.length;
    for (const m of line.matchAll(RELATIVE_LITERAL_RE)) flagEscape(m[1], lineNo, line);

    const src = line.match(SHELL_SOURCE_RE);
    if (src?.[1].startsWith('..')) flagEscape(src[1], lineNo, line);

    // Engine-reach family — at most one finding per line, most specific first,
    // and skipped entirely when the line already reported a concrete escape.
    if (out.length > before) continue;
    if (line.includes(ARCFORGE_ROOT_TOKEN)) {
      flag(
        lineNo,
        line,
        `mentions ${ARCFORGE_ROOT_TOKEN}; reach the engine via the bare \`arcforge\` CLI (plugin bin/ is on PATH, D9)`,
      );
    } else if (line.includes(PLUGIN_ROOT_TOKEN)) {
      // D9 ground truth: CLAUDE_PLUGIN_ROOT is provided to hooks only — it is
      // UNSET in skill-triggered Bash. Any use in a skill is a runtime lie; the
      // blessed engine call is the bare `arcforge` CLI via the plugin bin/ PATH.
      flag(
        lineNo,
        line,
        `mentions ${PLUGIN_ROOT_TOKEN}; that variable is unset in skill Bash (hooks-only) — call the bare \`arcforge\` CLI instead (D9)`,
      );
    } else if (line.includes(ENGINE_PATH_TOKEN) || ENGINE_SEGMENT_RE.test(line)) {
      // Also catches the segmented form that walks up one component at a time —
      // os.path.join(dirname(__file__), '..', '..', 'scripts', 'lib') — where
      // every single '..' resolves inside the skill and the escape only exists
      // in aggregate. The engine-path name is the tell, so match on that.
      flag(
        lineNo,
        line,
        `names engine internals (${ENGINE_PATH_TOKEN}); a skill must not know the engine's layout`,
      );
    }
  }
  return out;
}

/** Find D1-B violations in one markdown file. */
function findProseViolations(absFile) {
  const out = [];
  const lines = fs.readFileSync(absFile, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const token of [ENGINE_PATH_TOKEN, ARCFORGE_ROOT_TOKEN, PLUGIN_ROOT_TOKEN]) {
      if (!line.includes(token)) continue;
      out.push({
        rule: 'D1-B',
        file: path.relative(REPO_ROOT, absFile),
        line: i + 1,
        content: truncate(line),
        message: `skill prose names engine internals (${token}); a skill must not know the engine's layout`,
      });
    }
  }
  return out;
}

/** Scan one skills/<name>/ directory under both rules. */
function scanSkillDir(skillDir) {
  const violations = [];
  for (const file of walkFiles(skillDir)) {
    const ext = path.extname(file);
    if (EXECUTABLE_EXTS.has(ext)) violations.push(...findExecutableViolations(file, skillDir));
    else if (ext === '.md') violations.push(...findProseViolations(file));
  }
  return violations;
}

function formatReport(violations) {
  const report = ['', `Found ${violations.length} D1 violation(s):`, ''];
  for (const v of violations) {
    report.push(`  [${v.rule}] ${v.file}:${v.line}`);
    report.push(`    line: ${v.content}`);
    report.push(`    why:  ${v.message}`);
    report.push('');
  }
  report.push('D1: a skill is a black box — it never reaches outside its own directory.');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell ${VAR}, not a JS template
  report.push('Engine functionality goes through a ${CLAUDE_PLUGIN_ROOT} CLI subprocess.');
  return report.join('\n');
}

// ---------------------------------------------------------------------------
// Ratchet: the grandfather list may only shrink, and may never name a ghost.
// ---------------------------------------------------------------------------

describe('v6 legacy-skills.json ratchet', () => {
  it('every grandfathered entry still exists as skills/<name>/', () => {
    const missing = legacySkills().filter(
      (name) => !fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')),
    );
    expect({ missing }).toEqual({ missing: [] });
  });

  it('the list has no duplicates', () => {
    const list = legacySkills();
    expect(list.length).toBe(new Set(list).size);
  });
});

// ---------------------------------------------------------------------------
// Real-corpus enforcement.
// ---------------------------------------------------------------------------

describe('D1 skill self-containment (governed skills)', () => {
  it('governed-skill enumeration is computable (scope sanity)', () => {
    // Deliberately NOT a >0 floor: P1 ships exactly one governed skill and the
    // set is empty by design until the rewrite lands. What must hold is that the
    // legacy list is a strict subset of the shipped skills — enforced by the
    // ratchet above — so this only guards the loader itself.
    expect(Array.isArray(governedSkills())).toBe(true);
  });

  it('no governed skill escapes its own directory or names engine internals', () => {
    const violations = [];
    for (const name of governedSkills()) {
      violations.push(...scanSkillDir(path.join(SKILLS_DIR, name)));
    }
    if (violations.length > 0) throw new Error(formatReport(violations));
  });
});

// ---------------------------------------------------------------------------
// Detector fixtures — the governed corpus is small in P1, so the detectors are
// verified against synthetic skills. Without these the lint could silently rot
// into a no-op and nobody would notice until a real violation shipped.
// ---------------------------------------------------------------------------

describe('D1 detectors (synthetic fixtures)', () => {
  let tmpDir;
  let skillDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd1-lint-'));
    skillDir = path.join(tmpDir, 'skills', 'sample');
    fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const write = (rel, content) => {
    const abs = path.join(skillDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return abs;
  };

  it('flags a require() that escapes the skill directory', () => {
    write('scripts/run.js', "const x = require('../../../scripts/lib/utils');\n");
    const v = scanSkillDir(skillDir);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('D1-A');
    expect(v[0].message).toMatch(/escapes its skill directory/);
  });

  it('flags a path.join(__dirname, ...) that escapes the skill directory', () => {
    write('scripts/run.js', "const p = path.join(__dirname, '../../../scripts/cli.js');\n");
    expect(scanSkillDir(skillDir)).toHaveLength(1);
  });

  it('flags a shell source of a file outside the skill directory', () => {
    write('scripts/run.sh', 'source ../../../hooks/lib/common.sh\n');
    expect(scanSkillDir(skillDir)).toHaveLength(1);
  });

  it('flags ARCFORGE_ROOT in an executable file', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture shell source, not a JS template
    write('scripts/run.sh', 'node "${ARCFORGE_ROOT}/scripts/cli.js" status\n');
    const v = scanSkillDir(skillDir);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/bare `arcforge` CLI/);
  });

  it('flags the plugin-root variable used to require engine code', () => {
    write('scripts/run.js', "const t = require(process.env.CLAUDE_PLUGIN_ROOT + '/scripts/x');\n");
    const v = scanSkillDir(skillDir);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/unset in skill Bash/);
  });

  it('flags the plugin-root variable used to source a shell library', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture shell source, not a JS template
    write('scripts/run.sh', 'source "${CLAUDE_PLUGIN_ROOT}/scripts/lib/common.sh"\n');
    const v = scanSkillDir(skillDir);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/unset in skill Bash/);
  });

  it('flags the plugin-root variable even in subprocess position (D9: unset at runtime)', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture shell source, not a JS template
    write('scripts/call.sh', 'node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.js" eval list --json\n');
    const v = scanSkillDir(skillDir);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/unset in skill Bash/);
  });

  it('flags a bare scripts/lib/ literal in an executable', () => {
    write('scripts/run.js', "const p = base + 'scripts/lib/task-list.js';\n");
    const v = scanSkillDir(skillDir);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/names engine internals/);
  });

  it('flags the segmented engine path that walks up one component at a time', () => {
    write(
      'scripts/run.py',
      "p = os.path.join(os.path.dirname(__file__), '..', '..', 'scripts', 'lib')\n",
    );
    const v = scanSkillDir(skillDir);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/names engine internals/);
  });

  it('allows a relative reference that stays inside the skill directory', () => {
    write('scripts/run.js', "const x = require('../references/data.js');\n");
    write('references/data.js', 'module.exports = {};\n');
    expect(scanSkillDir(skillDir)).toEqual([]);
  });

  it('allows a bare module require and a bare arcforge CLI subprocess (D9)', () => {
    write('scripts/run.js', "const fs = require('node:fs');\n");
    write('scripts/call.sh', 'arcforge worktree list --json\n');
    expect(scanSkillDir(skillDir)).toEqual([]);
  });

  it('flags scripts/lib/ and ARCFORGE_ROOT in skill prose', () => {
    write('SKILL.md', 'Read scripts/lib/loop.js first.\nThen set ARCFORGE_ROOT.\n');
    const v = scanSkillDir(skillDir);
    expect(v.map((x) => x.rule)).toEqual(['D1-B', 'D1-B']);
    expect(v[0].line).toBe(1);
    expect(v[1].line).toBe(2);
  });

  it('allows prose that names no engine internals', () => {
    write('SKILL.md', '# Sample\n\nRun the arcforge CLI through the plugin root.\n');
    expect(scanSkillDir(skillDir)).toEqual([]);
  });

  it('formats a report naming file, line, content and reason', () => {
    write('SKILL.md', 'see scripts/lib/x.js\n');
    const report = formatReport(scanSkillDir(skillDir));
    expect(report).toMatch(/SKILL\.md:1/);
    expect(report).toMatch(/see scripts\/lib\/x\.js/);
    expect(report).toMatch(/black box/);
  });
});
