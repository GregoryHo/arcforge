const fs = require('node:fs');
const path = require('node:path');

const { SKILLS_DIR, allSkills } = require('./skill-tree');

// ---------------------------------------------------------------------------
// Router bijection contract.
// ---------------------------------------------------------------------------
//
// `skills/core/using/` is the router: a table mapping a slash invocation to the
// situation it serves. The failure mode it guards against is drift in BOTH
// directions — a shipped skill nobody can find, and a row that routes to a
// skill that no longer exists. So the contract is a bijection, checked both
// ways: every shipped skill has a row, and every row resolves to a shipped
// skill. `using` itself is excluded, as the router cannot route to itself.
//
// Adding or removing a skill therefore means editing the table in the same
// commit; this test bites the moment the two sides disagree.

// Router identity comes from tests/router-skill.json — the single source both
// this suite and tests/skills/test_skill_structure.py read. Hardcoding it in
// both would let the pytest side keep exempting a Skill Map that this side no
// longer recognized as the router, with neither suite noticing.
const ROUTER_MANIFEST = path.join(__dirname, '..', 'router-skill.json');
const { router_skill: ROUTER_SKILL, skill_map_heading: SKILL_MAP_HEADING } = readRouterManifest();
const ROUTER_PATH = path.join(SKILLS_DIR, ROUTER_SKILL, 'SKILL.md');

/**
 * Load the router manifest, failing loudly on a missing or malformed field —
 * a silently-undefined router name would make every assertion below vacuous.
 * @returns {{router_skill: string, skill_map_heading: string}}
 */
function readRouterManifest() {
  const data = JSON.parse(fs.readFileSync(ROUTER_MANIFEST, 'utf8'));
  for (const key of ['router_skill', 'skill_map_heading']) {
    if (typeof data[key] !== 'string' || !data[key]) {
      throw new Error(`${ROUTER_MANIFEST}: "${key}" must be a non-empty string`);
    }
  }
  return data;
}

// A table row whose first cell is a slash invocation, with or without backticks:
//   | `/finishing` | wrapping up work |
const ROW_RE = /^\|\s*`?\/([a-z0-9][a-z0-9-]*)`?\s*\|/;
// The `| --- | --- |` alignment row that makes it a table rather than prose.
const SEPARATOR_RE = /^\|[\s:|-]*-[\s:|-]*\|\s*$/;

/**
 * Extract the `/name` values from the Skill Map table.
 * @param {string} content router SKILL.md content
 * @returns {string[]} skill names in table order
 * @throws when the Skill Map section or its table header is absent
 */
function parseSkillMap(content) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === SKILL_MAP_HEADING);
  if (start === -1) {
    throw new Error(`router is missing its "${SKILL_MAP_HEADING}" section`);
  }

  const rows = [];
  let sawHeader = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) break; // next section ends the table
    if (SEPARATOR_RE.test(line)) sawHeader = true;
    const m = line.match(ROW_RE);
    if (m) rows.push(m[1]);
  }
  if (!sawHeader) {
    throw new Error(`router "${SKILL_MAP_HEADING}" section has no markdown table`);
  }
  return rows;
}

describe('router contract — skills/using', () => {
  it('the router skill exists and ships', () => {
    expect(fs.existsSync(ROUTER_PATH)).toBe(true);
    expect(allSkills()).toContain(ROUTER_SKILL);
  });

  const content = fs.readFileSync(ROUTER_PATH, 'utf8');

  it('the Skill Map section carries a parseable markdown table', () => {
    expect(() => parseSkillMap(content)).not.toThrow();
    expect(Array.isArray(parseSkillMap(content))).toBe(true);
  });

  it('every shipped skill (except the router) has a row', () => {
    const rows = new Set(parseSkillMap(content));
    const routable = allSkills().filter((n) => n !== ROUTER_SKILL);
    const missing = routable.filter((n) => !rows.has(n));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('every row resolves to a shipped skill', () => {
    const routable = new Set(allSkills().filter((n) => n !== ROUTER_SKILL));
    const dangling = parseSkillMap(content).filter((n) => !routable.has(n));
    expect({ dangling }).toEqual({ dangling: [] });
  });

  it('no row is listed twice', () => {
    const rows = parseSkillMap(content);
    expect(rows.length).toBe(new Set(rows).size);
  });
});

describe('router bijection logic (fixtures)', () => {
  // The assertions above only fire when the real table drifts. These prove the
  // bijection logic itself, so it cannot rot into a no-op that passes silently.
  const table = (rows) =>
    ['# R', '', SKILL_MAP_HEADING, '', '| Skill | Use when |', '| --- | --- |', ...rows, ''].join(
      '\n',
    );

  it('parses backticked and bare slash rows alike', () => {
    const doc = table(['| `/finishing` | wrapping up |', '| /tdd | writing tests |']);
    expect(parseSkillMap(doc)).toEqual(['finishing', 'tdd']);
  });

  it('ignores the header and separator rows', () => {
    expect(parseSkillMap(table([]))).toEqual([]);
  });

  it('stops at the next section heading', () => {
    const doc = `${table(['| `/tdd` | tests |'])}\n## Sync Contract\n\n| \`/ghost\` | no |\n`;
    expect(parseSkillMap(doc)).toEqual(['tdd']);
  });

  it('throws when the Skill Map section is missing', () => {
    expect(() => parseSkillMap('# R\n\n## Other\n')).toThrow(/Skill Map/);
  });

  it('throws when the section has no table', () => {
    expect(() => parseSkillMap(`# R\n\n${SKILL_MAP_HEADING}\n\nprose only\n`)).toThrow(
      /no markdown table/,
    );
  });

  it('detects a skill with no row (missing direction)', () => {
    const rows = new Set(parseSkillMap(table(['| `/tdd` | tests |'])));
    const shipped = ['tdd', 'debugging'];
    expect(shipped.filter((n) => !rows.has(n))).toEqual(['debugging']);
  });

  it('detects a row with no skill (dangling direction)', () => {
    const rows = parseSkillMap(table(['| `/tdd` | tests |', '| `/ghost` | nothing |']));
    const shipped = new Set(['tdd']);
    expect(rows.filter((n) => !shipped.has(n))).toEqual(['ghost']);
  });
});
