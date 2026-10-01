const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, SKILLS_DIR, SKILL_BUCKETS } = require('./skill-tree');

// The bucket list has ONE source, tests/skill-buckets.json. skill-tree.js reads
// it for the jest consumers, check-doc-refs.js reads it directly, and
// test_skill_structure.py reads it for pytest. A second hardcoded copy would let a new bucket be
// recognized by one guard and silently ignored by another.
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'tests', 'skill-buckets.json'), 'utf8'),
);

// A literal list of bucket names: `'core', 'in-progress'` (JS) or
// `core/|in-progress/` (a regex alternation, as the pytest once spelled it).
const HARDCODED_LIST_RE = /['"]core['"]\s*,\s*['"]in-progress['"]|core\/\|in-progress\//;

const CONSUMERS = [
  'scripts/check-doc-refs.js',
  'tests/scripts/d8-engine-boundary.test.js',
  'tests/skills/test_skill_structure.py',
];

describe('skill bucket list — single source', () => {
  it('skill-tree.js exports the manifest bucket list', () => {
    expect(SKILL_BUCKETS).toEqual(MANIFEST.buckets);
  });

  it('the shipped bucket is one of the buckets and anchors SKILLS_DIR', () => {
    expect(MANIFEST.buckets).toContain(MANIFEST.shipped);
    expect(SKILLS_DIR).toBe(path.join(REPO_ROOT, 'skills', MANIFEST.shipped));
  });

  it.each(CONSUMERS)('%s carries no hardcoded bucket list', (rel) => {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    expect(source).not.toMatch(HARDCODED_LIST_RE);
  });
});
