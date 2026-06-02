/**
 * obsidian-command.js - Handler for the `obsidian` CLI command.
 */

const { output } = require('./shared');

function runObsidianCommand(args, { asJson }) {
  const subcommand = args.positional[0];
  const registry = require('../lib/obsidian-registry');

  if (subcommand === 'register') {
    const name = args.options.name;
    const vaultPath = args.options.path;
    if (!name || !vaultPath) {
      console.error(
        'Usage: arc obsidian register --name <n> --path <p> [--default] [--preset <p>] [--scope "..."]',
      );
      process.exit(1);
    }
    const search = {};
    if (args.options['search-preferred']) {
      search.preferred = args.options['search-preferred'];
    }
    if (args.options['qmd-collection']) {
      search.qmd_collection = args.options['qmd-collection'];
      if (!search.preferred) search.preferred = 'qmd';
    }
    const result = registry.addVault(
      {
        name,
        path: vaultPath,
        preset: args.options.preset || '',
        scope: args.options.scope || '',
        ...(Object.keys(search).length ? { search } : {}),
      },
      { makeDefault: !!args.flags.default },
    );
    output(
      {
        registered: result.entry.name,
        path: result.entry.path,
        becameDefault: result.becameDefault,
      },
      asJson,
    );
    return;
  }

  if (subcommand === 'unregister') {
    const name = args.positional[1];
    if (!name) {
      console.error('Usage: arc obsidian unregister <name>');
      process.exit(1);
    }
    const result = registry.removeVault(name);
    output({ removed: result.removedName, clearedDefault: result.clearedDefault }, asJson);
    return;
  }

  if (subcommand === 'set-default') {
    const name = args.positional[1];
    if (!name) {
      console.error('Usage: arc obsidian set-default <name>');
      process.exit(1);
    }
    const result = registry.setDefault(name);
    output({ default: result.defaultName }, asJson);
    return;
  }

  if (subcommand === 'list-vaults') {
    const reg = registry.readRegistry();
    if (asJson) {
      output(reg, true);
    } else if (reg.vaults.length === 0) {
      console.log('No vaults registered. Run: arc obsidian register --name X --path Y');
    } else {
      for (const v of reg.vaults) {
        const tag = reg.default === v.name ? ' (default)' : '';
        const preset = v.preset ? ` [${v.preset}]` : '';
        console.log(`  ${v.name}${tag}${preset} → ${v.path}`);
      }
    }
    return;
  }

  console.error('Usage: arc obsidian <register|unregister|set-default|list-vaults> [...args]');
  process.exit(1);
}

module.exports = { runObsidianCommand };
