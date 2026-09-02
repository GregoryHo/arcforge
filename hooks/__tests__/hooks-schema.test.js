/**
 * hooks-schema validator tests — scripts/check-hooks-schema.js.
 *
 * Proves the shipped hooks.json passes the schema linter, and that the linter
 * actually catches the failure classes it exists to guard (unknown event,
 * duplicate id, missing ${CLAUDE_PLUGIN_ROOT}, and an async guard sneaking onto
 * the blocking path).
 *
 * Also proves the manifest half: neither shipped plugin manifest declares a
 * `hooks` key, and the validator catches one that does. That guard exists
 * because Codex's manifest schema rejects the field outright and a `hooks`
 * entry cannot suppress its hook discovery anyway — the tempting "fix" for the
 * leak breaks the manifest without closing it.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateHooksJson,
  validateManifestsHaveNoHooks,
  MANIFESTS,
} = require('../../scripts/check-hooks-schema');

// The literal placeholder every valid command must contain. Kept in one const so
// the noTemplateCurlyInString lint suppression lives in a single place.
// biome-ignore lint/suspicious/noTemplateCurlyInString: fixture uses the literal ${CLAUDE_PLUGIN_ROOT} placeholder
const CMD = '${CLAUDE_PLUGIN_ROOT}/x';

function group(id, extra = {}) {
  return { id, matcher: '.*', hooks: [{ type: 'command', command: CMD, ...extra }] };
}

describe('check-hooks-schema', () => {
  it('the shipped hooks.json is valid (zero violations)', () => {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks.json'), 'utf-8'));
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

describe('check-hooks-schema — plugin manifests declare no hooks', () => {
  it('both shipped manifests exist and are silent about hooks', () => {
    const repoRoot = path.join(__dirname, '..', '..');
    const reads = MANIFESTS.map((file) => ({
      file,
      status: 'ok',
      manifest: JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf-8')),
    }));
    assert.deepStrictEqual(validateManifestsHaveNoHooks(reads), []);
  });

  it('covers both the Claude Code and the Codex manifest', () => {
    assert.deepStrictEqual(MANIFESTS, ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']);
  });

  it('rejects a manifest that declares a hooks key', () => {
    const errors = validateManifestsHaveNoHooks([
      { file: '.codex-plugin/plugin.json', status: 'ok', manifest: { hooks: './hooks.json' } },
    ]);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes('declares a "hooks" key'));
  });

  it('rejects a hooks key even when it points at an empty neutralizer', () => {
    const errors = validateManifestsHaveNoHooks([
      {
        file: '.codex-plugin/plugin.json',
        status: 'ok',
        manifest: { hooks: './.codex-plugin/no-hooks.json' },
      },
    ]);
    assert.strictEqual(errors.length, 1);
  });

  it('reports a missing manifest rather than passing vacuously', () => {
    const errors = validateManifestsHaveNoHooks([
      { file: '.codex-plugin/plugin.json', status: 'missing' },
    ]);
    assert.ok(errors.some((e) => e.includes('manifest missing')));
  });

  it('reports an unparseable manifest', () => {
    const errors = validateManifestsHaveNoHooks([
      { file: '.claude-plugin/plugin.json', status: 'unreadable', error: 'Unexpected token' },
    ]);
    assert.ok(errors.some((e) => e.includes('cannot read/parse')));
  });
});
