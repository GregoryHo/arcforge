// biome-ignore-all lint/suspicious/noTemplateCurlyInString: single-quoted strings intentionally embed literal shell ${VAR} that must reach bash unexpanded
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Codex-unset ARCFORGE_ROOT resolution — the canonical fallback header.
// ---------------------------------------------------------------------------
//
// Claude Code exports ARCFORGE_ROOT from its SessionStart hook. Codex has no
// such hook, so a skill's bash block runs with
// ARCFORGE_ROOT unset. Option (a) puts this exact line at the top of every
// bash block that touches the CLI:
//
//   : "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
//
// These tests pin the mechanism the skill fixes depend on: the header resolves
// the CLI (and the Family-2 SKILL_ROOT chain) against the standard non-Claude
// install layout (~/.agents/arcforge) when ARCFORGE_ROOT is absent.

// Byte-for-byte the string shipped in every skill bash block. Single-quoted so
// the ${...} stays literal in JS and reaches bash verbatim.
const CANONICAL_HEADER = ': "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"';

// Run a bash script (array of lines) under a fake HOME with ARCFORGE_ROOT
// deleted, reproducing the non-Claude condition exactly.
function runUnset(scriptLines, home) {
  const env = { ...process.env, HOME: home };
  delete env.ARCFORGE_ROOT;
  return spawnSync('bash', ['-c', scriptLines.join('\n')], { env, encoding: 'utf8' });
}

describe('canonical header resolves the CLI when ARCFORGE_ROOT is unset', () => {
  let fakeHome;
  let arcforgeRoot;

  beforeEach(() => {
    fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-root-')));
    arcforgeRoot = path.join(fakeHome, '.agents', 'arcforge');
    fs.mkdirSync(path.join(arcforgeRoot, 'scripts'), { recursive: true });
    // Hermetic stub in place of the real CLI: prints a sentinel and exits 0.
    fs.writeFileSync(
      path.join(arcforgeRoot, 'scripts', 'cli.js'),
      "process.stdout.write('CLI_RESOLVED_OK\\n');\n",
    );
  });

  afterEach(() => {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('defaults ARCFORGE_ROOT so node finds the CLI (exit 0 + sentinel)', () => {
    const { status, stdout } = runUnset(
      [CANONICAL_HEADER, 'node "${ARCFORGE_ROOT}/scripts/cli.js" --sentinel'],
      fakeHome,
    );
    expect(status).toBe(0);
    expect(stdout).toContain('CLI_RESOLVED_OK');
  });

  it('Family-2 chain derives SKILL_ROOT under the resolved ARCFORGE_ROOT', () => {
    const { status, stdout } = runUnset(
      [
        CANONICAL_HEADER,
        ': "${SKILL_ROOT:=$ARCFORGE_ROOT/skills/demo}"',
        'printf %s "${SKILL_ROOT}"',
      ],
      fakeHome,
    );
    expect(status).toBe(0);
    expect(stdout).toBe(path.join(arcforgeRoot, 'skills', 'demo'));
  });
});
