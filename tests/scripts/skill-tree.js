/**
 * skill-tree.js — shared locator for the shipped skill tree.
 *
 * The contract lints (D1, D8, router bijection, task-list schema) all need the
 * same anchors: the repo root, the directory the shipped skills live in, and the
 * lifecycle buckets a skill dir can sit in.
 * They resolve them from here so a layout change is a one-line edit in one file
 * rather than a hunt through every suite.
 *
 * Helper module, not a suite: jest's testMatch only picks up `*.test.js`.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
// The lifecycle buckets come from tests/skill-buckets.json, the single source
// pytest reads too. Shipped skills live in the `shipped` bucket — the one
// `.claude-plugin/plugin.json` whitelists. The others are on-disk holding areas
// that never load, so no lint governs them.
const BUCKET_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'tests', 'skill-buckets.json'), 'utf8'),
);
const SKILL_BUCKETS = BUCKET_MANIFEST.buckets;
const SKILLS_DIR = path.join(REPO_ROOT, 'skills', BUCKET_MANIFEST.shipped);

/** @returns {string[]} every skill dir name that ships a SKILL.md. */
function allSkills() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.includes('-workspace'))
    .filter((e) => fs.existsSync(path.join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

module.exports = { REPO_ROOT, SKILLS_DIR, SKILL_BUCKETS, allSkills };
