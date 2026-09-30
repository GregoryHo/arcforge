/**
 * curator-invocation.js — what the curator's model run could reach (B-9, D-023).
 *
 * The observer daemon runs `claude` over the curator batch and hands the same
 * argv to `ingest-proposal`, so the run manifest's `invocation.tool_access`
 * describes the run that happened instead of asserting a constant.
 */

/**
 * Values of the last `--tools` option, as the `claude` CLI reads it: a
 * variadic list that runs until the next dash-prefixed token, or the
 * `--tools=<list>` form. Returns null when the option is absent.
 */
function lastToolsValue(argv) {
  let tools = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--tools=')) {
      tools = [arg.slice('--tools='.length)];
      continue;
    }
    if (arg !== '--tools') continue;
    tools = [];
    while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
      i += 1;
      tools.push(argv[i]);
    }
  }
  return tools;
}

/** True when the argv loads no MCP server: strict config, and every given config is empty. */
function mcpCleared(argv) {
  if (!argv.includes('--strict-mcp-config')) return false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--mcp-config') continue;
    let parsed;
    try {
      parsed = JSON.parse(argv[i + 1]);
    } catch {
      return false;
    }
    const servers = parsed && typeof parsed === 'object' ? parsed.mcpServers : undefined;
    if (servers && Object.keys(servers).length > 0) return false;
  }
  return true;
}

/**
 * Whether a `claude` run with this argv had any tool at all.
 *
 * Tool-less means the built-in set was emptied (`--tools ""`) and no MCP
 * server can load (`--strict-mcp-config` with an empty `--mcp-config`). An
 * absent `--tools` is the default set; any named tool, or `default`, is access.
 *
 * @param {string[]|undefined|null} argv - the argv, or nothing when none was recorded
 * @returns {boolean|null} false when tool-less, true otherwise, null when unrecorded
 */
function toolAccessFromArgv(argv) {
  if (argv === undefined || argv === null) return null;
  if (!Array.isArray(argv) || argv.some((a) => typeof a !== 'string')) {
    throw new Error(`curator argv must be an array of strings (got ${JSON.stringify(argv)})`);
  }
  const tools = lastToolsValue(argv);
  const builtIns = tools === null || tools.some((t) => t.split(/[\s,]+/).some(Boolean));
  return builtIns || !mcpCleared(argv);
}

module.exports = { toolAccessFromArgv };
