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
  ])('scans %s', (rel) => {
    expect(scanned).toContain(rel);
  });
});
