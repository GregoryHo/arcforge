/**
 * skill-tree.js — shared locator for the shipped skill tree.
 *
 * The contract lints (D1, D8, router bijection, task-list schema) all need the
 * same two anchors: the repo root and the directory the shipped skills live in.
 * They resolve them from here so a layout change is a one-line edit in one file
 * rather than a hunt through every suite.
 *
 * Helper module, not a suite: jest's testMatch only picks up `*.test.js`.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
// Shipped skills live in the `core` lifecycle bucket — the one bucket
// `.claude-plugin/plugin.json` whitelists. `in-progress/` and `deprecated/` are
// on-disk holding areas that never load, so no lint governs them.
const SKILLS_DIR = path.join(REPO_ROOT, 'skills', 'core');

/** @returns {string[]} every skill dir name that ships a SKILL.md. */
function allSkills() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.includes('-workspace'))
    .filter((e) => fs.existsSync(path.join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

module.exports = { REPO_ROOT, SKILLS_DIR, allSkills };
