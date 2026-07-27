#!/usr/bin/env node

/**
 * check-hooks-schema.js — static validation of hooks/hooks.json.
 *
 * The hook registry is load-bearing and silently fails: a typo'd command, an
 * unknown event name, or an async guard leaves the session running with a hook
 * disabled and no error. The e2e suite spawns entry files directly, so it can
 * never catch a broken registration. This linter is the only guard on the
 * hooks.json wiring itself. Fits the scripts/check-*.js linter family.
 *
 * Validates:
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
 * CLI tier: prints a report and exits 0 (valid) / 1 (invalid).
 */

const fs = require('node:fs');
const path = require('node:path');

const HOOKS_JSON = path.resolve(__dirname, '..', 'hooks', 'hooks.json');

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
 * Validate the parsed hooks.json object. Pure — returns a list of error strings
 * (empty = valid). Never throws on a structurally-broken config.
 *
 * @param {object} config - Parsed hooks.json.
 * @returns {string[]} error messages
 */
function validateHooksJson(config) {
  const errors = [];

  if (!config || typeof config !== 'object' || !config.hooks || typeof config.hooks !== 'object') {
    return ['hooks.json must have a top-level "hooks" object'];
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

function main() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  } catch (err) {
    console.error(`hooks-schema linter — cannot read/parse hooks.json: ${err.message}`);
    process.exit(1);
  }

  const errors = validateHooksJson(config);
  const eventCount = Object.keys(config.hooks || {}).length;
  const groupCount = Object.values(config.hooks || {}).reduce(
    (n, g) => n + (Array.isArray(g) ? g.length : 0),
    0,
  );

  console.log(
    `hooks-schema linter — ${eventCount} events / ${groupCount} matcher-groups in hooks.json\n`,
  );

  if (errors.length === 0) {
    console.log('hooks.json is valid.');
    process.exit(0);
  }

  console.error(`hooks.json has ${errors.length} schema violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

module.exports = { validateHooksJson, ALLOWED_EVENTS };

if (require.main === module) {
  main();
}
