/**
 * v6-legacy-skills.js — shared loader for the v6 grandfather list.
 *
 * `docs/plans/v6/legacy-skills.json` is the SINGLE source of truth for which
 * skills are exempt from v6-era enforcement (frozen frontmatter schema, D1
 * self-containment, router bijection). Every new lint reads it from here — a
 * second copy of the list is forbidden.
 *
 * Helper module, not a suite: jest's testMatch only picks up `*.test.js`.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LEGACY_JSON = path.join(REPO_ROOT, 'docs', 'plans', 'v6', 'legacy-skills.json');
// Shipped skills live in the `core` lifecycle bucket (P6.5) — the one bucket
// `.claude-plugin/plugin.json` whitelists. `in-progress/` and `deprecated/` are
// on-disk holding areas that never load, so no lint governs them.
const SKILLS_DIR = path.join(REPO_ROOT, 'skills', 'core');

/** @returns {string[]} skill dir names grandfathered out of v6 enforcement. */
function legacySkills() {
  const raw = fs.readFileSync(LEGACY_JSON, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.legacy)) {
    throw new Error(`${LEGACY_JSON}: expected a "legacy" array, got ${typeof data.legacy}`);
  }
  return data.legacy;
}

/** @returns {string[]} every skill dir name that ships a SKILL.md. */
function allSkills() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.includes('-workspace'))
    .filter((e) => fs.existsSync(path.join(SKILLS_DIR, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

/** @returns {string[]} skills subject to full v6 enforcement (non-grandfathered). */
function governedSkills() {
  const legacy = new Set(legacySkills());
  return allSkills().filter((name) => !legacy.has(name));
}

module.exports = { REPO_ROOT, SKILLS_DIR, LEGACY_JSON, legacySkills, allSkills, governedSkills };
