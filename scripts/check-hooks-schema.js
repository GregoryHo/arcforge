#!/usr/bin/env node

/**
 * check-hooks-schema.js — static validation of the hook registry and of the
 * registration path the two plugin manifests point at.
 *
 * The hook registry is load-bearing and silently fails: a typo'd command, an
 * unknown event name, or an async guard leaves the session running with a hook
 * disabled and no error. The e2e suite spawns entry files directly, so it can
 * never catch a broken registration. This linter is the only guard on the
 * registration wiring itself. Fits the scripts/check-*.js linter family.
 *
 * Validates hooks/claude-code.json:
 *   - every event key is a known Claude Code hook event;
 *   - every matcher-group has a stable string `id`, a valid-regex `matcher`,
 *     and a non-empty `hooks` array;
 *   - `id`s are unique across the whole file;
 *   - every command hook uses `type: "command"` and references
 *     `${CLAUDE_PLUGIN_ROOT}`;
 *   - the sync-guard rule: PreToolUse and PostToolUse each expose EXACTLY ONE
 *     synchronous (non-async) matcher-group — the dispatcher — so the blocking
 *     path is a single sync process and the async observers cannot creep onto it.
 *
 * And validates where each manifest points, which is a two-host contract:
 *   - `.claude-plugin/plugin.json` must declare exactly
 *     `"hooks": "./hooks/claude-code.json"`. Claude Code honours a manifest
 *     `hooks` path, and that declaration is the ONLY thing loading arcforge's
 *     hooks — the registry deliberately does not sit at the conventional name.
 *   - `.codex-plugin/plugin.json` must declare no `hooks` key. arcforge's hooks
 *     speak Claude Code's protocol and have nothing to say to Codex, whose
 *     plugin validator rejects the field anyway.
 *   - Nothing may sit at `hooks.json` or `hooks/hooks.json`. Those are the paths
 *     Codex auto-discovers plugin hooks at whether or not a manifest names them:
 *     a plugin whose manifest was silent still fired every hook it declared at
 *     `hooks/hooks.json`. Keeping both paths empty is what makes that leak
 *     structurally impossible instead of merely unlikely, so re-introducing
 *     either file is a finding even if nothing references it.
 *
 * CLI tier: prints a report and exits 0 (valid) / 1 (invalid).
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const HOOKS_REGISTRY = path.join(repoRoot, 'hooks', 'claude-code.json');

// Each shipped plugin manifest and the exact `hooks` value it must carry —
// `null` meaning "must declare no hooks key at all". Both are shipped files, so
// a missing one is a finding rather than a skipped check.
const MANIFESTS = [
  { file: '.claude-plugin/plugin.json', expectedHooks: './hooks/claude-code.json' },
  { file: '.codex-plugin/plugin.json', expectedHooks: null },
];

// The paths Codex auto-discovers plugin hooks at. Both must stay empty; see the
// header for why an unreferenced file at either one is still a leak.
const CODEX_DISCOVERED_PATHS = ['hooks.json', 'hooks/hooks.json'];

// Known Claude Code hook events (see .claude/rules/plugin.md).
const ALLOWED_EVENTS = new Set([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PreCompact',
  'Stop',
  'SubagentStop',
  'SubagentStart',
  'SessionEnd',
  'PermissionRequest',
  'Notification',
  'TeammateIdle',
  'TaskCompleted',
]);

// Events whose sync entry blocks the tool call — they must collapse to exactly
// one synchronous dispatcher entry (the async observers are the only exception).
const SINGLE_SYNC_EVENTS = ['PreToolUse', 'PostToolUse'];

/**
 * Validate the parsed hook registry object. Pure — returns a list of error strings
 * (empty = valid). Never throws on a structurally-broken config.
 *
 * @param {object} config - Parsed hooks/claude-code.json.
 * @returns {string[]} error messages
 */
function validateHooksJson(config) {
  const errors = [];

  if (!config || typeof config !== 'object' || !config.hooks || typeof config.hooks !== 'object') {
    return ['hooks/claude-code.json must have a top-level "hooks" object'];
  }

  const seenIds = new Set();

  for (const [event, groups] of Object.entries(config.hooks)) {
    if (!ALLOWED_EVENTS.has(event)) {
      errors.push(`unknown hook event: "${event}"`);
    }
    if (!Array.isArray(groups)) {
      errors.push(`event "${event}" must map to an array of matcher-groups`);
      continue;
    }

    for (const [i, group] of groups.entries()) {
      const where = `${event}[${i}]`;

      if (typeof group?.id !== 'string' || !group.id.trim()) {
        errors.push(`${where}: missing stable string "id"`);
      } else if (seenIds.has(group.id)) {
        errors.push(`${where}: duplicate id "${group.id}"`);
      } else {
        seenIds.add(group.id);
      }

      if (typeof group?.matcher !== 'string') {
        errors.push(`${where}: "matcher" must be a string`);
      } else {
        try {
          new RegExp(group.matcher);
        } catch {
          errors.push(`${where}: invalid matcher regex "${group.matcher}"`);
        }
      }

      if (!Array.isArray(group?.hooks) || group.hooks.length === 0) {
        errors.push(`${where}: "hooks" must be a non-empty array`);
        continue;
      }
      for (const [j, hook] of group.hooks.entries()) {
        if (hook?.type !== 'command') {
          errors.push(`${where}.hooks[${j}]: only "command" hooks are supported`);
        }
        // biome-ignore lint/suspicious/noTemplateCurlyInString: matching the literal ${CLAUDE_PLUGIN_ROOT} placeholder text
        if (typeof hook?.command !== 'string' || !hook.command.includes('${CLAUDE_PLUGIN_ROOT}')) {
          errors.push(`${where}.hooks[${j}]: command must reference \${CLAUDE_PLUGIN_ROOT}`);
        }
      }
    }
  }

  // Sync-guard rule: exactly one synchronous matcher-group per blocking event.
  for (const event of SINGLE_SYNC_EVENTS) {
    const groups = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    const syncGroups = groups.filter(
      (g) => Array.isArray(g?.hooks) && g.hooks.every((h) => h?.async !== true),
    );
    if (syncGroups.length !== 1) {
      errors.push(
        `${event}: expected exactly 1 synchronous (non-async) matcher-group, found ${syncGroups.length}`,
      );
    }
  }

  return errors;
}

/**
 * Assert each plugin manifest declares exactly the `hooks` value it owes: the
 * Claude Code manifest points at the renamed registry, the Codex one stays
 * silent. Pure over the read results — returns a list of error strings.
 *
 * @param {{file: string, expectedHooks: string|null, status: 'ok'|'missing'|'unreadable', manifest?: object, error?: string}[]} reads
 * @returns {string[]} error messages
 */
function validateManifestHooks(reads) {
  const errors = [];
  for (const read of reads) {
    if (read.status === 'missing') {
      errors.push(`${read.file}: manifest missing — it is a shipped file`);
      continue;
    }
    if (read.status === 'unreadable') {
      errors.push(`${read.file}: cannot read/parse — ${read.error}`);
      continue;
    }
    const declared = Object.hasOwn(read.manifest, 'hooks') ? read.manifest.hooks : undefined;
    if (read.expectedHooks === null) {
      if (declared !== undefined) {
        errors.push(
          `${read.file}: declares "hooks": ${JSON.stringify(declared)} — this manifest must stay silent about hooks (see this file's header)`,
        );
      }
      continue;
    }
    if (declared !== read.expectedHooks) {
      errors.push(
        `${read.file}: "hooks" must be exactly ${JSON.stringify(read.expectedHooks)}, found ${JSON.stringify(declared)} — it is the only thing that loads the hook registry`,
      );
    }
  }
  return errors;
}

/**
 * Assert nothing sits at a path Codex auto-discovers plugin hooks at. Pure —
 * takes the subset of CODEX_DISCOVERED_PATHS that exist on disk.
 *
 * @param {string[]} present - discovered-path repo-relative paths that exist
 * @returns {string[]} error messages
 */
function validateNoCodexDiscoverablePaths(present) {
  return present.map(
    (file) =>
      `${file}: exists — Codex auto-discovers plugin hooks here with or without a manifest key, so this file leaks arcforge's Claude Code hooks into Codex sessions (see this file's header)`,
  );
}

/** Read one manifest into the shape validateManifestHooks consumes. */
function readManifest({ file, expectedHooks }) {
  const abs = path.join(repoRoot, file);
  if (!fs.existsSync(abs)) {
    return { file, expectedHooks, status: 'missing' };
  }
  try {
    return {
      file,
      expectedHooks,
      status: 'ok',
      manifest: JSON.parse(fs.readFileSync(abs, 'utf8')),
    };
  } catch (err) {
    return { file, expectedHooks, status: 'unreadable', error: err.message };
  }
}

function main() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(HOOKS_REGISTRY, 'utf8'));
  } catch (err) {
    console.error(`hooks-schema linter — cannot read/parse hooks/claude-code.json: ${err.message}`);
    process.exit(1);
  }

  const present = CODEX_DISCOVERED_PATHS.filter((f) => fs.existsSync(path.join(repoRoot, f)));
  const errors = [
    ...validateHooksJson(config),
    ...validateManifestHooks(MANIFESTS.map(readManifest)),
    ...validateNoCodexDiscoverablePaths(present),
  ];
  const eventCount = Object.keys(config.hooks || {}).length;
  const groupCount = Object.values(config.hooks || {}).reduce(
    (n, g) => n + (Array.isArray(g) ? g.length : 0),
    0,
  );

  console.log(
    `hooks-schema linter — ${eventCount} events / ${groupCount} matcher-groups in ` +
      `hooks/claude-code.json, ${MANIFESTS.length} manifests checked for their "hooks" value, ` +
      `${CODEX_DISCOVERED_PATHS.length} Codex-discovered paths checked for absence\n`,
  );

  if (errors.length === 0) {
    console.log(
      'hooks/claude-code.json is valid, each manifest declares what it owes, and no ' +
        'Codex-discovered hooks path exists.',
    );
    process.exit(0);
  }

  console.error(`hook registry has ${errors.length} violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

module.exports = {
  validateHooksJson,
  validateManifestHooks,
  validateNoCodexDiscoverablePaths,
  ALLOWED_EVENTS,
  MANIFESTS,
  CODEX_DISCOVERED_PATHS,
};

if (require.main === module) {
  main();
}
