/**
 * hooks-schema validator tests — scripts/check-hooks-schema.js.
 *
 * Proves the shipped hooks/claude-code.json passes the schema linter, and that
 * the linter actually catches the failure classes it exists to guard (unknown
 * event, duplicate id, missing ${CLAUDE_PLUGIN_ROOT}, and an async guard
 * sneaking onto the blocking path).
 *
 * Also proves the registration-path half, which is the leak guard: the Claude
 * Code manifest declares exactly `./hooks/claude-code.json` (the only thing that
 * loads the registry now that it is off the conventional name), the Codex
 * manifest declares nothing, and neither `hooks.json` nor `hooks/hooks.json`
 * exists for Codex to auto-discover.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateHooksJson,
  validateManifestHooks,
  findCodexDiscoverablePaths,
  validateNoCodexDiscoverablePaths,
  MANIFESTS,
  CODEX_DISCOVERED_PATHS,
} = require('../../scripts/check-hooks-schema');

// The literal placeholder every valid command must contain. Kept in one const so
// the noTemplateCurlyInString lint suppression lives in a single place.
// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture uses the literal ${CLAUDE_PLUGIN_ROOT} placeholder
const CMD = '${CLAUDE_PLUGIN_ROOT}/x';

function group(id, extra = {}) {
  return { id, matcher: '.*', hooks: [{ type: 'command', command: CMD, ...extra }] };
}

describe('check-hooks-schema', () => {
  it('the shipped hook registry is valid (zero violations)', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'claude-code.json'), 'utf-8'),
    );
    assert.deepStrictEqual(validateHooksJson(config), []);
  });

  it('rejects an unknown event name', () => {
    const errors = validateHooksJson({ hooks: { NotARealEvent: [group('x')] } });
    assert.ok(errors.some((e) => e.includes('unknown hook event')));
  });

  it('rejects duplicate ids', () => {
    const errors = validateHooksJson({
      hooks: { PreToolUse: [group('dup')], PostToolUse: [group('dup')] },
    });
    assert.ok(errors.some((e) => e.includes('duplicate id')));
  });

  it('rejects a command that omits the plugin-root placeholder', () => {
    const errors = validateHooksJson({
      hooks: {
        Stop: [{ id: 'x', matcher: '.*', hooks: [{ type: 'command', command: 'node end.js' }] }],
      },
    });
    assert.ok(errors.some((e) => e.includes('CLAUDE_PLUGIN_ROOT')));
  });

  it('rejects a blocking event with no single synchronous dispatcher entry', () => {
    const errors = validateHooksJson({
      hooks: {
        PreToolUse: [group('only-async', { async: true })],
        PostToolUse: [group('ok')],
      },
    });
    assert.ok(errors.some((e) => e.includes('PreToolUse') && e.includes('synchronous')));
  });
});

describe('check-hooks-schema — the registration path', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  it('both shipped manifests declare exactly what they owe', () => {
    const reads = MANIFESTS.map(({ file, expectedHooks }) => ({
      file,
      expectedHooks,
      status: 'ok',
      manifest: JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf-8')),
    }));
    assert.deepStrictEqual(validateManifestHooks(reads), []);
  });

  it('pins the Claude Code manifest to the renamed registry and the Codex one to silence', () => {
    assert.deepStrictEqual(MANIFESTS, [
      { file: '.claude-plugin/plugin.json', expectedHooks: './hooks/claude-code.json' },
      { file: '.codex-plugin/plugin.json', expectedHooks: null },
    ]);
  });

  it('rejects a Claude Code manifest that stops declaring the registry', () => {
    const errors = validateManifestHooks([
      {
        file: '.claude-plugin/plugin.json',
        expectedHooks: './hooks/claude-code.json',
        status: 'ok',
        manifest: {},
      },
    ]);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes('only thing that loads'));
  });

  it('rejects a Claude Code manifest pointing at the conventional name', () => {
    const errors = validateManifestHooks([
      {
        file: '.claude-plugin/plugin.json',
        expectedHooks: './hooks/claude-code.json',
        status: 'ok',
        manifest: { hooks: './hooks/hooks.json' },
      },
    ]);
    assert.strictEqual(errors.length, 1);
  });

  it('rejects a Codex manifest that declares a hooks key', () => {
    const errors = validateManifestHooks([
      {
        file: '.codex-plugin/plugin.json',
        expectedHooks: null,
        status: 'ok',
        manifest: { hooks: './hooks/claude-code.json' },
      },
    ]);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes('must stay silent'));
  });

  it('reports a missing manifest rather than passing vacuously', () => {
    const errors = validateManifestHooks([
      { file: '.codex-plugin/plugin.json', expectedHooks: null, status: 'missing' },
    ]);
    assert.ok(errors.some((e) => e.includes('manifest missing')));
  });

  it('reports an unparseable manifest', () => {
    const errors = validateManifestHooks([
      {
        file: '.claude-plugin/plugin.json',
        expectedHooks: './hooks/claude-code.json',
        status: 'unreadable',
        error: 'Unexpected token',
      },
    ]);
    assert.ok(errors.some((e) => e.includes('cannot read/parse')));
  });

  it('guards both paths Codex auto-discovers hooks at', () => {
    assert.deepStrictEqual(CODEX_DISCOVERED_PATHS, ['hooks.json', 'hooks/hooks.json']);
  });

  it('neither Codex-discovered path exists in the shipped tree', () => {
    assert.deepStrictEqual(findCodexDiscoverablePaths(repoRoot), []);
  });

  // The discovery step is the half a typo silently disables: get the join wrong
  // and it matches nothing, leaving the linter and every assertion above green
  // while the leak guard is dead. So drive it against a tree that really does
  // carry both files, rather than re-deriving the expression in the test body.
  it('finds a planted file at each Codex-discovered path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-codex-leak-'));
    try {
      fs.mkdirSync(path.join(root, 'hooks'));
      fs.writeFileSync(path.join(root, 'hooks.json'), '{}');
      fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), '{}');
      assert.deepStrictEqual(findCodexDiscoverablePaths(root), ['hooks.json', 'hooks/hooks.json']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports nothing for a tree with neither file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-codex-clean-'));
    try {
      fs.mkdirSync(path.join(root, 'hooks'));
      fs.writeFileSync(path.join(root, 'hooks', 'claude-code.json'), '{}');
      assert.deepStrictEqual(findCodexDiscoverablePaths(root), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a re-introduced hooks/hooks.json even though nothing references it', () => {
    const errors = validateNoCodexDiscoverablePaths(['hooks/hooks.json']);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes('leaks'));
  });
});
