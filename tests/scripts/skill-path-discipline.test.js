const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// cc-005 Cross-Component Plugin Path Discipline — CI lint (fr-cc-pl-001).
// ---------------------------------------------------------------------------
//
// Scope (per fr-cc-pl-001-ac1):
//   skills/**/SKILL.md, skills/**/references/**/*.md, templates/**/*.md,
//   agents/**/*.md.
//
// Detection (per fr-cc-pl-001-ac1):
//   P2: node -e "...require('./scripts/lib/...')..." cwd-relative invocations.
//   P3: any scripts/lib/ reference in prose not prefixed exactly with
//       ${ARCFORGE_ROOT}/ on the same logical token.
//
// Exclusions (per fr-cc-pl-001-ac3):
//   - scripts/lib/ itself, tests/, hooks/ (each has a separate, correct
//     mechanism for cross-project safety).
//   - skill-local files under skills/<name>/scripts/ or skills/<name>/agents/
//     (those are JS / agent definitions, not LLM-facing prose).
//   - skills/*-workspace/ (eval workspaces, not shipped surface).
//   - The fenced Anti-patterns example block in arc-writing-skills only;
//     those WRONG examples are deliberately invalid teaching material.
//
// Reporting (per fr-cc-pl-001-ac2):
//   Each violation reports file path, line number, offending line content
//   (truncated to 120 chars), and the corrective form. Test failure blocks
//   CI. There is no bypass annotation, no skip marker, no allowlist for
//   individual lines — fix the path, do not annotate around the lint.

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ARCFORGE_ROOT_TOKEN = `${'${'}ARCFORGE_ROOT}/`;
const ARCFORGE_ROOT_PREFIX = `${ARCFORGE_ROOT_TOKEN}scripts/lib/`;
const ARC_WRITING_SKILLS_PATH = path.join(REPO_ROOT, 'skills', 'arc-writing-skills', 'SKILL.md');

// Recursively collect markdown files under a base dir, with include/exclude
// rules. Returns absolute paths.
function collectMarkdown(baseDir, opts = {}) {
  const { onlyName, excludeDirNames = [], excludeDirSubstrings = [] } = opts;
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirNames.includes(entry.name)) continue;
        if (excludeDirSubstrings.some((s) => entry.name.includes(s))) continue;
        walk(full);
      } else if (entry.isFile()) {
        if (!entry.name.endsWith('.md')) continue;
        if (onlyName && entry.name !== onlyName) continue;
        out.push(full);
      }
    }
  }
  walk(baseDir);
  return out;
}

function collectScopedFiles() {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const templatesDir = path.join(REPO_ROOT, 'templates');
  const agentsDir = path.join(REPO_ROOT, 'agents');

  // Within skills/, collect SKILL.md files and any markdown under references/.
  const skillFiles = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.includes('-workspace')) continue;
    const skillDir = path.join(skillsDir, entry.name);
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (fs.existsSync(skillMd)) skillFiles.push(skillMd);
    const referencesDir = path.join(skillDir, 'references');
    if (fs.existsSync(referencesDir)) {
      skillFiles.push(...collectMarkdown(referencesDir));
    }
  }

  const templateFiles = collectMarkdown(templatesDir);
  const agentFiles = collectMarkdown(agentsDir);

  return [...skillFiles, ...templateFiles, ...agentFiles];
}

// Pattern P2: node -e block invoking require('./scripts/lib/...').
// We scan line-by-line so the regex stays simple and per-line addressable.
// The cwd-relative require is wrong regardless of whether it's inside a
// node -e wrapper, so we flag any line containing require('./scripts/lib/.
const P2_PATTERN = /require\(\s*['"`]\.\/scripts\/lib\//;

// Pattern P3: every scripts/lib/ token in LLM-facing prose must be prefixed
// exactly with ${ARCFORGE_ROOT}/. Other prefixes (${SKILL_ROOT}/, absolute
// paths, or project-root variables) are violations for plugin shared library
// content because they do not resolve reliably from user-project cwd.
const P3_PATTERN = /scripts\/lib\//g;

function truncate(s, n) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function relativizeToRepo(absPath) {
  return path.relative(REPO_ROOT, absPath);
}

function isArcWritingSkillsAntiPatternExample(absPath, lines, index) {
  if (absPath !== ARC_WRITING_SKILLS_PATH) return false;

  let inAntiPatternsSection = false;
  let inFence = false;
  for (let i = 0; i <= index; i++) {
    const line = lines[i];
    if (line.startsWith('### ') && line !== '### Anti-patterns') {
      inAntiPatternsSection = false;
    }
    if (line === '### Anti-patterns') {
      inAntiPatternsSection = true;
      inFence = false;
      continue;
    }
    if (inAntiPatternsSection && line.startsWith('```')) {
      inFence = !inFence;
    }
  }
  return inAntiPatternsSection && inFence;
}

function hasRequiredArcforgeRootPrefix(line, matchIndex) {
  return line.slice(0, matchIndex).endsWith(ARCFORGE_ROOT_TOKEN);
}

function findViolations(absPath) {
  const content = fs.readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isArcWritingSkillsAntiPatternExample(absPath, lines, i)) continue;

    if (P2_PATTERN.test(line)) {
      out.push({
        file: relativizeToRepo(absPath),
        line: i + 1,
        kind: 'P2',
        content: truncate(line, 120),
        corrective: `use require('${ARCFORGE_ROOT_PREFIX}<module>') so the path resolves regardless of cwd`,
      });
      continue; // P2 already implies a scripts/lib/ reference; do not double-report as P3
    }

    for (const match of line.matchAll(P3_PATTERN)) {
      if (hasRequiredArcforgeRootPrefix(line, match.index)) continue;
      out.push({
        file: relativizeToRepo(absPath),
        line: i + 1,
        kind: 'P3',
        content: truncate(line, 120),
        corrective: `prefix the reference with ${ARCFORGE_ROOT_PREFIX}`,
      });
    }
  }
  return out;
}

describe('cc-005 plugin path discipline lint (fr-cc-pl-001)', () => {
  const scopedFiles = collectScopedFiles();

  it('lint scope is non-empty (sanity check)', () => {
    expect(scopedFiles.length).toBeGreaterThan(0);
  });

  it('no bare scripts/lib/ references or cwd-relative requires in LLM-facing prose', () => {
    const allViolations = [];
    for (const f of scopedFiles) {
      allViolations.push(...findViolations(f));
    }

    if (allViolations.length === 0) return;

    // Format report — fr-cc-pl-001-ac2: file, line, content, corrective form.
    const report = ['', `Found ${allViolations.length} cc-005 violation(s):`, ''];
    for (const v of allViolations) {
      report.push(`  [${v.kind}] ${v.file}:${v.line}`);
      report.push(`    line: ${v.content}`);
      report.push(`    fix:  ${v.corrective}`);
      report.push('');
    }
    report.push('No bypass annotation exists. Fix the paths; do not annotate around the lint.');
    report.push('Reference: arc-writing-skills SKILL.md "Path Resolution" section.');
    throw new Error(report.join('\n'));
  });
});
