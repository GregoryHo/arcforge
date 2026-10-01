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

describe('website page copy (.jsx)', () => {
  const probes = {
    ...PROBES,
    skillExists: (name) => name === 'using',
    scenarioExists: (id) => id === 'eval-tdd-test-first-gate',
  };
  const findings = (jsx) => lintDoc('website/page/sections.jsx', jsx, probes).findings;

  it('reads JSX text and string literals as spans', () => {
    const jsx = [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal JSX source the linter must parse
      '<div style={{border:`1px solid ${t.line}`}}>$ arcforge eval run eval-made-up --k 3</div>',
      "{name:'x',cmd:'arcforge learn instinct purge x'}",
      '<div><span>$ </span>/arcforge:ghost</div>',
    ].join('\n');
    expect(
      findings(jsx)
        .map((f) => `${f.rule}:${f.line}`)
        .sort(),
    ).toEqual(['R2:1', 'R2:2', 'R4:3']);
  });

  it('passes the real shapes: a known scenario, a known slash skill, prose naming the CLI', () => {
    const jsx = [
      '<div>$ arcforge eval run eval-tdd-test-first-gate --k 3</div>',
      '<div><span>$ </span>/arcforge:using</div>',
      "{note:'The other 7 shell out to the arcforge CLI, and those steps fail.'}",
    ].join('\n');
    expect(findings(jsx)).toEqual([]);
  });

  it('does not read a codex plugin command naming arcforge@… as an arcforge invocation', () => {
    const jsx =
      "{cmd:['codex plugin marketplace add GregoryHo/arcforge','codex plugin add arcforge@arcforge-dev']}";
    expect(findings(jsx)).toEqual([]);
  });
});

describe('R2 — subcommands against cli-manifest.js', () => {
  it.each([
    '`arcforge eval report --json`',
    '`arcforge learn instinct status --json`',
    '`arcforge obsidian register --path ~/v --name v`',
    '`arcforge worktree add feat-x --branch feat-x`',
    '`arcforge learn approve|reject <candidate-id> --project`',
    '`arcforge eval run <name>`',
    '`arcforge learn <group> <action>`',
    '`arcforge eval`',
    '`arcforge loop --tasks TASKS.md`',
  ])('passes %s', (span) => {
    expect(r2('docs/guide/x.md', span)).toEqual([]);
  });

  it('flags a subcommand the command does not dispatch', () => {
    const findings = r2('docs/guide/x.md', '`arcforge eval reprot`');
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/subcommand "eval reprot" is not in the manifest/);
  });

  it('flags an action a learn workflow group does not dispatch', () => {
    const findings = r2('README.md', '```\narcforge learn instinct purge x\n```');
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/"learn instinct purge"/);
  });

  it('checks each half of an a|b subcommand', () => {
    expect(r2('README.md', '`arcforge learn approve|ghost <id>`')).toHaveLength(1);
  });

  it('checks the node …/cli.js head too', () => {
    expect(r2('CLAUDE.md', '`node scripts/cli.js obsidian unregistr v`')).toHaveLength(1);
  });
});

describe('R2 — eval scenario ids against evals/scenarios/', () => {
  const scenarios = new Set(['eval-tdd-test-first-gate']);
  const probes = { ...PROBES, scenarioExists: (id) => scenarios.has(id) };
  const scen = (content) =>
    lintDoc('docs/guide/x.md', content, probes).findings.filter((f) =>
      f.message.startsWith('eval scenario'),
    );

  it('passes a scenario that exists', () => {
    expect(scen('Run `arcforge eval ab eval-tdd-test-first-gate --k 5`.')).toEqual([]);
  });

  it('flags a scenario id that does not exist', () => {
    const findings = scen('See `eval-tdd-made-up-scenario`.');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toMatch(/eval-tdd-made-up-scenario/);
  });

  it.each([
    '`scripts/cli/eval-command.js`',
    '`docs/guide/eval-system.md`',
    '`npm run check:eval-targets`',
    '`.eval-trials/`',
    '`test-eval-graders.js`',
    'prose eval-ghost outside code',
  ])('does not read %s as a scenario id', (content) => {
    expect(scen(content)).toEqual([]);
  });
});
