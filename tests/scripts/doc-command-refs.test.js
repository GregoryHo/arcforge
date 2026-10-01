/**
 * doc-command-refs.test.js — the command-shaped references R2 validates beyond
 * a top-level `arcforge <cmd> --flag`: `npm run <script>` against package.json.
 */

const { lintDoc } = require('../../scripts/lib/doc-refs');

const SCRIPTS = new Set(['test', 'check:docs', 'check:product']);
const PROBES = {
  pathExists: () => true,
  skillExists: () => true,
  npmScriptExists: (name) => SCRIPTS.has(name),
};

function r2(file, content, probes = PROBES) {
  return lintDoc(file, content, probes).findings.filter((f) => f.rule === 'R2');
}

describe('R2 — npm run <script> against package.json', () => {
  it('passes a script package.json declares', () => {
    expect(r2('CONTRIBUTING.md', 'Run `npm run check:product`.')).toEqual([]);
  });

  it('flags a script package.json does not declare', () => {
    const findings = r2('.claude/skills/releasing/SKILL.md', '```bash\nnpm run check:prodcut\n```');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toMatch(/npm script check:prodcut/);
  });

  it('reads past npm flags to the script name', () => {
    expect(r2('CLAUDE.md', '`npm run -s check:ghost`')).toHaveLength(1);
  });

  it('checks every invocation on a chained line', () => {
    const line = '`npm run check:docs && npm run check:ghost && npm run check:product`';
    expect(r2('CLAUDE.md', line).map((f) => f.message)).toEqual([
      expect.stringMatching(/check:ghost/),
    ]);
  });

  it('leaves skill docs alone — they address the user project, not this package.json', () => {
    expect(r2('skills/core/tdd/SKILL.md', '`npm run build`')).toEqual([]);
  });

  it('ignores prose and placeholders', () => {
    expect(r2('README.md', 'npm run check:ghost in prose, `npm run <script>`')).toEqual([]);
  });
});
