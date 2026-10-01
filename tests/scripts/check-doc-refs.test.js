const fs = require('node:fs');
const path = require('node:path');

const { gatherFiles } = require('../../scripts/check-doc-refs');
const { REPO_ROOT } = require('./skill-tree');

// The runner's scan set. A doc outside it can name a renamed command or a
// deleted path and stay green, so the contributor surfaces that quote commands
// — the releasing skill and the contributor agents — are in it on purpose.
describe('check:docs scan set', () => {
  const scanned = gatherFiles().map((abs) => path.relative(REPO_ROOT, abs));

  it.each([
    '.claude/skills/releasing/SKILL.md',
    '.claude/agents/qa.md',
    '.claude/agents/pm.md',
    '.claude/agents/README.md',
    'website/page/sections.jsx',
    'website/page/hero.jsx',
  ])('scans %s', (rel) => {
    expect(scanned).toContain(rel);
  });

  it('leaves the compiled website .js out (generated from the .jsx)', () => {
    expect(scanned.filter((rel) => rel.startsWith('website/') && rel.endsWith('.js'))).toEqual([]);
  });
});

// The runner ships under scripts/; tests/ does not. It reads the bucket list
// from tests/skill-buckets.json as data, never by requiring a test helper.
describe('check:docs dependencies', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-doc-refs.js'), 'utf8');

  it('requires nothing under tests/', () => {
    expect(source).not.toMatch(/require\(['"][^'"]*tests\//);
  });

  it('reads the bucket list from tests/skill-buckets.json', () => {
    expect(source).toMatch(/'skill-buckets\.json'/);
  });
});
