const fs = require('node:fs');
const path = require('node:path');

const { lintDoc, R4_SEVERITY, HOST_SLASH_COMMANDS } = require('../../scripts/lib/doc-refs');
const { REPO_ROOT } = require('./v6-legacy-skills');

// ---------------------------------------------------------------------------
// R4 dual-track skill-reference resolution + sanity floor (v6, D7).
// ---------------------------------------------------------------------------
//
// D7 removes the `arc-` prefix, which quietly disarms the v5 R4 rule: a rule
// keyed on a prefix that no longer exists finds nothing and reports success.
// R4 therefore runs two tracks — the legacy `arc-<name>` token (v5 docs still
// ship) and the v6 slash invocation (`/<name>`, `/<namespace>:<name>`) — and
// exposes how many references it actually PROBED so a zero can be caught.
//
// The floor lives here rather than in scripts/check-doc-refs.js because the
// runner is outside this track's file partition; see the note in the final
// describe block for the one-line change that would move it into `check:docs`.

const PROBE_ALL = { pathExists: () => true, skillExists: () => true };
const PROBE_NONE = { pathExists: () => true, skillExists: () => false };

describe('R4 legacy track (arc-<name>)', () => {
  it('resolves a shipped arc-<name> reference', () => {
    const { findings, stats } = lintDoc('docs/guide/x.md', 'See `arc-tdd`.', PROBE_ALL);
    expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
    expect(stats.r4.legacy).toBe(1);
  });

  it('flags a dangling arc-<name> reference as a gating finding', () => {
    const { findings } = lintDoc('docs/guide/x.md', 'See `arc-ghost`.', PROBE_NONE);
    const r4 = findings.filter((f) => f.rule === 'R4');
    expect(r4).toHaveLength(1);
    expect(r4[0].severity).toBe(R4_SEVERITY);
  });
});

describe('R4 slash track (/<name>)', () => {
  it('resolves a bare slash invocation', () => {
    const { findings, stats } = lintDoc('docs/guide/x.md', 'Run `/finishing`.', PROBE_ALL);
    expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
    expect(stats.r4.slash).toBe(1);
  });

  it('resolves a namespaced slash invocation against the bare skill name', () => {
    const seen = [];
    const { findings } = lintDoc('docs/guide/x.md', 'Run `/arcforge:tdd`.', {
      pathExists: () => true,
      skillExists: (n) => {
        seen.push(n);
        return true;
      },
    });
    expect(seen).toEqual(['tdd']);
    expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
  });

  it('flags a slash invocation that names no shipped skill', () => {
    const { findings, stats } = lintDoc('docs/guide/x.md', 'Run `/ghost-skill`.', PROBE_NONE);
    const r4 = findings.filter((f) => f.rule === 'R4');
    expect(r4).toHaveLength(1);
    expect(r4[0].severity).toBe(R4_SEVERITY);
    expect(r4[0].message).toMatch(/slash invocation \/ghost-skill/);
    expect(stats.r4.slash).toBe(1);
  });

  it('parses a router table row as a slash reference', () => {
    const doc = '| Skill | Use when |\n|---|---|\n| `/finishing` | wrapping up |\n';
    const { stats } = lintDoc('skills/core/using/SKILL.md', doc, PROBE_ALL);
    expect(stats.r4.slash).toBe(1);
  });

  it('ignores host slash commands (Claude Code builtins)', () => {
    const doc = 'Suggest `/compact` and `/review`.';
    const { findings, stats } = lintDoc('hooks/x/README.md', doc, PROBE_NONE);
    expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
    expect(stats.r4.slash).toBe(0);
    expect(HOST_SLASH_COMMANDS.has('/compact')).toBe(true);
  });

  it('ignores filesystem roots shaped like a slash invocation', () => {
    const { findings, stats } = lintDoc('docs/guide/x.md', 'Write to `/tmp`.', PROBE_NONE);
    expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
    expect(stats.r4.slash).toBe(0);
  });

  it('does not fire on a slash token embedded in a longer span', () => {
    // Only a span that IS the invocation counts; `rm -rf /tmp/x` and friends
    // must never be read as a skill claim.
    const { stats } = lintDoc('docs/guide/x.md', 'Run `cd /workspaces && ls`.', PROBE_NONE);
    expect(stats.r4.slash).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sanity floor over the real shipped doc surface.
// ---------------------------------------------------------------------------

const SCAN_DIRS = ['skills', 'docs/guide', 'agents', 'templates', 'hooks'];

function collectMarkdown(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function scanShippedDocs() {
  const files = [];
  for (const dir of SCAN_DIRS) collectMarkdown(path.join(REPO_ROOT, dir), files);
  const readme = path.join(REPO_ROOT, 'README.md');
  if (fs.existsSync(readme)) files.push(readme);

  const totals = { legacy: 0, slash: 0, total: 0 };
  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs);
    const { stats } = lintDoc(rel, fs.readFileSync(abs, 'utf8'), PROBE_ALL);
    totals.legacy += stats.r4.legacy;
    totals.slash += stats.r4.slash;
    totals.total += stats.r4.total;
  }
  return { fileCount: files.length, totals };
}

describe('R4 sanity floor over the shipped doc surface', () => {
  const { fileCount, totals } = scanShippedDocs();

  it('scans a non-empty doc surface', () => {
    expect(fileCount).toBeGreaterThan(20);
  });

  it('resolves at least one skill reference overall (rule is not a no-op)', () => {
    // Hard floor: zero resolutions means R4 silently stopped matching anything —
    // the exact failure mode of dropping the arc- prefix without a replacement
    // shape. This is a rule-alive check, not a content assertion.
    expect(totals.total).toBeGreaterThan(0);
  });

  it('resolves at least one slash invocation (the v6 track is alive)', () => {
    // The legacy track drains to zero as v5 docs are deleted (P8). The slash
    // track is what must stay non-empty from here on: the router table alone
    // guarantees one row per shipped skill.
    expect(totals.slash).toBeGreaterThan(0);
  });

  it('would move into check:docs with a one-line runner change', () => {
    // scripts/check-doc-refs.js already receives `stats` from every lintDoc
    // call; summing `stats.r4.total` across files and exiting non-zero on 0
    // promotes this floor into `npm run check:docs`. That file is owned by a
    // different track in P1, so the floor is enforced here for now.
    const { stats } = lintDoc('docs/guide/x.md', 'See `arc-tdd`.', PROBE_ALL);
    expect(stats.r4).toEqual({ legacy: 1, slash: 0, total: 1 });
  });
});
