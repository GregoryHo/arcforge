/**
 * doc-refs.test.js — doc-reference linter engine (SRH-4).
 *
 * Covers the four rules + the ignore escape hatch, with fixtures that include
 * two real-defect regressions (a renamed engine path; a dangling CLI command)
 * and seeded mutations that each trigger exactly one rule:
 *   - R1 (path): a cited engine path that does not resolve.
 *   - R2 (CLI):  an unknown command + an undeclared flag, validated against the
 *     real cli-manifest.js (no second copy of flag data).
 *   - R3 (field): a `--json` field promise absent from the command's pinned
 *     output shape; plus a NEGATIVE case proving piped-jq selectors validate.
 *   - R4 (skill): a backticked `arc-<name>` that does not resolve to a skill,
 *     hook, or agent — asserted as ERROR severity (GATING as of the SRH-5
 *     R4-flip), plus a good name that produces nothing. The R4-flip regression
 *     proves a genuinely-dangling reference still trips gating after the
 *     false-positive-reducing heuristics were added (hook/agent resolution,
 *     eval-scenario skip, path-component skip) — the analog of the deliberate
 *     broken-commit proof: a hollow gate that exempted everything would fail it.
 *   - ignore: a directive suppresses the matching rule on its line; a
 *     reason-less directive is itself a finding.
 */

const {
  lintDoc,
  R4_SEVERITY,
  findCliInvocations,
  fieldExists,
} = require('../../scripts/lib/doc-refs');
const { CLI_MANIFEST } = require('../../scripts/lib/cli-manifest');

// Default probes: everything "exists" unless a test overrides. Tests that
// exercise R1/R4 pass explicit probes so the fixture controls resolution.
const ALL_EXIST = { pathExists: () => true, skillExists: () => true };

function rulesOf(findings) {
  return findings.map((f) => f.rule).sort();
}

describe('doc-refs engine (SRH-4)', () => {
  describe('R1 — path references', () => {
    test('a cited engine path that does not resolve is a finding (renamed-path defect class)', () => {
      const doc = 'See `scripts/coordinator.js` for the engine.\n';
      const { findings } = lintDoc('skills/x/SKILL.md', doc, {
        pathExists: (p) => p !== 'scripts/coordinator.js',
        skillExists: () => true,
      });
      const r1 = findings.filter((f) => f.rule === 'R1');
      expect(r1).toHaveLength(1);
      expect(r1[0].severity).toBe('error');
      expect(r1[0].message).toContain('scripts/coordinator.js');
    });

    test('a resolving path produces no finding', () => {
      const doc = 'See `scripts/cli.js` for the engine.\n';
      const { findings } = lintDoc('skills/x/SKILL.md', doc, ALL_EXIST);
      expect(findings.filter((f) => f.rule === 'R1')).toHaveLength(0);
    });

    test('illustrative placeholder/glob paths are not asserted', () => {
      const doc = 'Edit `scripts/<name>.js` or `skills/*/SKILL.md` or `docs/plans/my-spec/...`.\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, {
        pathExists: () => false,
        skillExists: () => true,
      });
      expect(findings.filter((f) => f.rule === 'R1')).toHaveLength(0);
    });

    test('paths outside the code surface (specs/, docs/) are not asserted', () => {
      const doc = 'Read `specs/my-spec/dag.yaml` and `docs/plans/my-spec/design.md`.\n';
      const { findings } = lintDoc('skills/x/SKILL.md', doc, {
        pathExists: () => false,
        skillExists: () => true,
      });
      expect(findings.filter((f) => f.rule === 'R1')).toHaveLength(0);
    });
  });

  describe('R2 — CLI commands and flags (against cli-manifest.js)', () => {
    test('an unknown command is a finding (dangling-command defect class)', () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal blessed-invocation form the linter must parse
      const doc = 'Run `node "${ARCFORGE_ROOT}/scripts/cli.js" frobnicate`.\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      const r2 = findings.filter((f) => f.rule === 'R2');
      expect(r2).toHaveLength(1);
      expect(r2[0].message).toContain('frobnicate');
    });

    test('an undeclared flag for a known command is a finding', () => {
      const doc = 'Run `arcforge status --bogus-flag`.\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      const r2 = findings.filter((f) => f.rule === 'R2');
      expect(r2).toHaveLength(1);
      expect(r2[0].message).toContain('--bogus-flag');
    });

    test('a declared flag (incl. subcommand flag) produces nothing', () => {
      const doc = 'Run `arcforge status --json` and `arcforge worktree add --branch x`.\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      expect(findings.filter((f) => f.rule === 'R2')).toHaveLength(0);
    });

    test('prose phrases like "arcforge is a toolkit" are not read as invocations', () => {
      const doc = 'The `arcforge` toolkit ships skills. `arcforge` is a CLI.\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      expect(findings.filter((f) => f.rule === 'R2')).toHaveLength(0);
    });

    test('R2 flag validation reads the live manifest, not a hardcoded copy', () => {
      // Sanity: the manifest is the source the engine consults. A flag the
      // manifest declares must pass; one it does not must fail.
      expect(CLI_MANIFEST.status.flags).toContain('--json');
      const ok = lintDoc('d.md', 'Run `arcforge status --json`.', ALL_EXIST);
      expect(ok.findings.filter((f) => f.rule === 'R2')).toHaveLength(0);
    });
  });

  describe('R3 — --json field promises (against manifest output shapes)', () => {
    test('a field absent from the pinned output shape is a finding', () => {
      const doc = "Get it: `arcforge status --json | jq '.epics[0].nonexistent_field'`.\n";
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      const r3 = findings.filter((f) => f.rule === 'R3');
      expect(r3.length).toBeGreaterThanOrEqual(1);
      expect(r3.some((f) => f.message.includes('nonexistent_field'))).toBe(true);
    });

    test('a piped jq selector resolves relative to its array anchor (no false positive)', () => {
      const doc = '`arcforge status --json | jq -r \'.epics[] | select(.id=="e") | .path\'`\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      // .epics[].path and .epics[].id both exist; .path/.id resolve via the
      // .epics[] anchor — so NO R3 finding.
      expect(findings.filter((f) => f.rule === 'R3')).toHaveLength(0);
    });

    test('a real top-level field promise produces nothing', () => {
      const doc = "`arcforge status --json | jq '.blocked'`\n";
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      expect(findings.filter((f) => f.rule === 'R3')).toHaveLength(0);
    });

    test('commands whose output is not pinned (output:null) skip R3', () => {
      const doc = "`arcforge expand --json | jq '.whatever.deep.field'`\n";
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      expect(findings.filter((f) => f.rule === 'R3')).toHaveLength(0);
    });
  });

  describe('R4 — skill/hook/agent references (GATING since the SRH-5 R4-flip)', () => {
    test('a good skill name (resolves to a skill dir) produces nothing', () => {
      const doc = 'Hand off to `arc-finishing` when done.\n';
      const { findings } = lintDoc('skills/x/SKILL.md', doc, {
        pathExists: () => true,
        skillExists: (name) => name === 'arc-finishing',
      });
      expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
    });

    test('R4-flip: a genuinely-dangling reference is a GATING (error) finding', () => {
      // The deliberate-break proof — the analog of SRH-5's broken-commit gate
      // proof. The false-positive heuristics below must NOT swallow a real one.
      const doc = 'Hand off to `arc-finishing-epic` when done.\n';
      const { findings } = lintDoc('skills/x/SKILL.md', doc, {
        pathExists: () => true,
        skillExists: (name) => name !== 'arc-finishing-epic',
      });
      const r4 = findings.filter((f) => f.rule === 'R4');
      expect(r4).toHaveLength(1);
      expect(r4[0].severity).toBe('error');
      expect(r4[0].severity).toBe(R4_SEVERITY);
      expect(r4[0].message).toContain('arc-finishing-epic');
    });

    test('a name that resolves only as a hook or agent (not a skill) produces nothing', () => {
      // arc-guard/arc-remind are hooks; arc-auditing-spec-* are agents — the
      // caller-supplied probe resolves arc-<name> against all three trees.
      const doc = 'See `arc-guard` and `arc-auditing-spec-internal-consistency`.\n';
      const { findings } = lintDoc('hooks/README.md', doc, {
        pathExists: () => true,
        skillExists: (name) =>
          name === 'arc-guard' || name === 'arc-auditing-spec-internal-consistency',
      });
      expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
    });

    test('an eval-scenario identifier (eval-arc-<name>) is not an R4 finding', () => {
      // `eval-arc-using-harness-isolation` is an eval label, not a claim that a
      // component named arc-using-harness-isolation ships.
      const doc = 'Scenario `eval-arc-using-harness-isolation` covers isolation.\n';
      const { findings } = lintDoc('docs/guide/composable-skill-eval-coverage.md', doc, {
        pathExists: () => true,
        skillExists: () => false,
      });
      expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
    });

    test('arc-<name> embedded in a path is a path component (R1 owns it), not R4', () => {
      // `skills/arc-releasing/SKILL.md` — the arc-releasing segment is a path,
      // not a standalone skill reference, so R4 must not fire on it.
      const doc = 'Target `skills/arc-releasing/SKILL.md`.\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, {
        pathExists: () => true, // path resolves → no R1 either; isolate R4
        skillExists: () => false,
      });
      expect(findings.filter((f) => f.rule === 'R4')).toHaveLength(0);
    });
  });

  describe('ignore escape hatch (reason mandatory)', () => {
    test('an ignore directive suppresses the matching rule on its line', () => {
      const doc =
        'Run `arcforge status --bogus`. <!-- doc-ref-lint: ignore R2 example flag for docs -->\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      expect(findings.filter((f) => f.rule === 'R2')).toHaveLength(0);
    });

    test('an ignore directive on the preceding line suppresses a fenced finding', () => {
      const doc = [
        '<!-- doc-ref-lint: ignore R1 illustrative example path -->',
        '```',
        'see scripts/helper.py',
        '```',
        '',
      ].join('\n');
      const { findings } = lintDoc('docs/guide/x.md', doc, {
        pathExists: () => false,
        skillExists: () => true,
      });
      expect(findings.filter((f) => f.rule === 'R1')).toHaveLength(0);
    });

    test('a reason-less ignore directive is itself a finding', () => {
      const doc = 'Run `arcforge status --bogus`. <!-- doc-ref-lint: ignore R2 -->\n';
      const { findings } = lintDoc('docs/guide/x.md', doc, ALL_EXIST);
      const ig = findings.filter((f) => f.rule === 'ignore');
      expect(ig).toHaveLength(1);
      expect(ig[0].message).toContain('reason');
    });
  });

  describe('seeded-mutation matrix — each rule triggers in isolation', () => {
    const SKILLS = new Set(['arc-finishing', 'arc-using']);
    const PATHS = new Set(['scripts/cli.js']);
    const probes = {
      pathExists: (p) => PATHS.has(p),
      skillExists: (n) => SKILLS.has(n),
    };

    test('R1 mutation: rename scripts/cli.js → scripts/coordinator.js', () => {
      const { findings } = lintDoc('skills/x/SKILL.md', 'See `scripts/coordinator.js`.', probes);
      expect(rulesOf(findings)).toEqual(['R1']);
    });

    test('R2 mutation: dangling command', () => {
      const { findings } = lintDoc(
        'docs/guide/x.md',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal blessed-invocation form the linter must parse
        'Run `node "${ARCFORGE_ROOT}/scripts/cli.js" doesnotexist`.',
        probes,
      );
      expect(rulesOf(findings)).toEqual(['R2']);
    });

    test('R3 mutation: promised --json field that is not in the shape', () => {
      const { findings } = lintDoc(
        'docs/guide/x.md',
        "`arcforge status --json | jq '.epics[0].ghost'`",
        probes,
      );
      expect(rulesOf(findings)).toEqual(['R3']);
    });

    test('R4 mutation: residual arc-finishing-epic reference (gating)', () => {
      const { findings } = lintDoc('skills/x/SKILL.md', 'Then run `arc-finishing-epic`.', probes);
      expect(rulesOf(findings)).toEqual(['R4']);
      expect(findings[0].severity).toBe('error');
    });
  });

  describe('helpers', () => {
    test('findCliInvocations strips quotes and resolves the command token', () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal blessed-invocation form the linter must parse
      const inv = findCliInvocations('node "${ARCFORGE_ROOT}/scripts/cli.js" status --json');
      expect(inv).toEqual([{ command: 'status', flags: ['--json'] }]);
    });

    test('fieldExists walks array element shapes', () => {
      const shape = { epics: [{ id: null, path: null }] };
      expect(fieldExists(shape, ['epics', 'path'])).toBe(true);
      expect(fieldExists(shape, ['epics', 'nope'])).toBe(false);
      expect(fieldExists(shape, ['ghost'])).toBe(false);
    });
  });
});
