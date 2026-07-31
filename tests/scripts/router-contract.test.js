const fs = require('node:fs');
const path = require('node:path');

const { SKILLS_DIR, governedSkills } = require('./v6-legacy-skills');

// ---------------------------------------------------------------------------
// Router bijection contract (v6).
// ---------------------------------------------------------------------------
//
// `skills/using/` is the router: a table mapping a slash invocation to the
// situation it serves. The failure mode it guards against is drift in BOTH
// directions — a shipped skill nobody can find, and a row that routes to a
// skill that no longer exists. So the contract is a bijection, checked both
// ways, added in P1 (before any v6 skill exists) so every later phase inherits
// it instead of retrofitting it.
//
// Grandfathering: legacy v5 skills (docs/plans/v6/legacy-skills.json) are not
// in the table — they are being deleted or rewritten, and listing them would
// make the router advertise a surface v6 is dismantling. `using` itself is
// excluded as the router cannot route to itself.
//
// In P1 both sides are empty, so the live assertion is structural: the table
// exists, is parseable, and the bijection logic runs (proved against fixtures
// below). Each later phase adds skills and rows together, and this test starts
// biting the moment they disagree.

const ROUTER_SKILL = 'using';
const ROUTER_PATH = path.join(SKILLS_DIR, ROUTER_SKILL, 'SKILL.md');
const SKILL_MAP_HEADING = '## Skill Map';

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
  it('the router skill exists and is not grandfathered', () => {
    expect(fs.existsSync(ROUTER_PATH)).toBe(true);
    expect(governedSkills()).toContain(ROUTER_SKILL);
  });

  const content = fs.readFileSync(ROUTER_PATH, 'utf8');

  it('the Skill Map section carries a parseable markdown table', () => {
    expect(() => parseSkillMap(content)).not.toThrow();
    expect(Array.isArray(parseSkillMap(content))).toBe(true);
  });

  it('every governed skill (except the router) has a row', () => {
    const rows = new Set(parseSkillMap(content));
    const routable = governedSkills().filter((n) => n !== ROUTER_SKILL);
    const missing = routable.filter((n) => !rows.has(n));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('every row resolves to a shipped, governed skill', () => {
    const routable = new Set(governedSkills().filter((n) => n !== ROUTER_SKILL));
    const dangling = parseSkillMap(content).filter((n) => !routable.has(n));
    expect({ dangling }).toEqual({ dangling: [] });
  });

  it('no row is listed twice', () => {
    const rows = parseSkillMap(content);
    expect(rows.length).toBe(new Set(rows).size);
  });
});

describe('router bijection logic (fixtures)', () => {
  // The live table is empty in P1, so the bijection is proved here instead —
  // otherwise the assertions above are vacuously true and could rot unnoticed.
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
