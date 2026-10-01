/**
 * doc-command-refs.js — R2's command-shaped references for the doc-reference
 * linter (doc-refs.js runs the rule; this module parses and resolves).
 *
 *   arcforge invocations — `findCliInvocations` parses `arcforge <cmd> …` /
 *       `node …/cli.js <cmd> …` into command, flags, and positional tokens;
 *       `subcommandFindings` checks the positional path against the manifest's
 *       `subcommands` tree (`eval report`, `learn instinct status`).
 *   npm run <script> — must be a script in the repo's package.json. Skill docs
 *       are exempt: their `npm run` addresses the user's project, not this
 *       package.json.
 *   eval scenario ids — a standalone `eval-<name>` token must have a file in
 *       evals/scenarios/.
 *
 * Reads cli-manifest.js; holds no copy of its data. Library tier: pure.
 * Existence comes from caller-supplied probes.
 */

const { CLI_MANIFEST } = require('./cli-manifest');

// `npm run [flags…] <script>`. The script class excludes `<` so a placeholder
// (`npm run <script>`) is never read as a name.
const NPM_RUN_RE = /\bnpm run\s+(?:-\S+\s+)*([A-Za-z0-9][\w:.-]*)/g;

function makeFinding(file, line, message) {
  return { rule: 'R2', severity: 'error', file, line, message };
}

// --- npm scripts ------------------------------------------------------------

/**
 * @param {string} file - Doc path (relative to repo root), for findings
 * @param {{ text: string, line: number }[]} spans - Code spans (doc-refs.extractCodeSpans)
 * @param {(name: string) => boolean} npmScriptExists
 */
function scanNpmScripts(file, spans, npmScriptExists) {
  if (file.startsWith('skills/')) return [];
  const findings = [];
  for (const { text, line } of spans) {
    for (const m of text.matchAll(NPM_RUN_RE)) {
      const name = m[1].replace(/[.,;:]+$/, '');
      if (npmScriptExists(name)) continue;
      findings.push(makeFinding(file, line, `npm script ${name} is not in package.json`));
    }
  }
  return findings;
}

// --- arcforge invocations ---------------------------------------------------

/** Tokens that are CLI command names per the manifest. */
function manifestCommands() {
  return new Set(Object.keys(CLI_MANIFEST));
}

/**
 * Collect every flag valid for a command, folding in subcommand flags so a
 * doc that writes `worktree add --branch x` is not flagged.
 */
function flagsForCommand(cmd) {
  const entry = CLI_MANIFEST[cmd];
  if (!entry) return null;
  const flags = new Set(entry.flags || []);
  if (entry.subcommands) {
    for (const sub of Object.values(entry.subcommands)) {
      for (const f of sub.flags || []) flags.add(f);
    }
  }
  return flags;
}

/**
 * Extract CLI invocations from a code span. Recognizes:
 *   node "…cli.js" <cmd> [flags…]
 *   node …/cli.js <cmd> [flags…]
 *   arcforge <cmd> [flags…]
 *   arc <cmd> [flags…]   (only when followed by a manifest-shaped token)
 * Returns [{ command, flags: string[], positional: string[] }]. The command is
 * the first non-flag token after the invocation head. Flags are the `--xxx`
 * tokens; `positional` is the first two non-flag tokens after the command (the
 * subcommand and, for a learn workflow group, its action).
 */
function findCliInvocations(text) {
  const results = [];
  const commands = manifestCommands();

  // Tokenize on whitespace; we walk the token stream looking for heads.
  const tokens = text.split(/\s+/).filter(Boolean);
  // Command-token positions already emitted, so `node …/cli.js status` is not
  // double-counted by both the `node` head and the `cli.js` head.
  const seen = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const isCliJs = /cli\.js"?$/.test(tok.replace(/^["']/, ''));
    const prev = i > 0 ? tokens[i - 1] : '';
    const isArcforge = tok === 'arcforge' || tok === 'arc';
    // A `cli.js` token preceded by `node` was already handled by the node head.
    const isNode = tok === 'node';

    let cmdIdx = -1;
    if (isCliJs && prev !== 'node') {
      cmdIdx = i + 1;
    } else if (isNode) {
      // find the cli.js token that follows, then the command after it
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j].replace(/^["']/, '').replace(/["']$/, '');
        if (/cli\.js$/.test(t)) {
          cmdIdx = j + 1;
          break;
        }
        if (t.startsWith('-')) break; // a flag before cli.js → not our shape
      }
    } else if (isArcforge) {
      cmdIdx = i + 1;
    }

    if (cmdIdx < 0 || cmdIdx >= tokens.length) continue;
    if (seen.has(cmdIdx)) continue;
    seen.add(cmdIdx);
    const command = tokens[cmdIdx].replace(/^["']/, '').replace(/["']$/, '');
    if (command.startsWith('-')) continue;
    // Skip placeholder command tokens (`<cmd>`, `{name}`) — doc templates, not
    // real invocations.
    if (/[<>{}]/.test(command)) continue;

    // For the bare `arc`/`arcforge` head, only treat it as an invocation when
    // the candidate command is actually a manifest command — `arcforge is a
    // toolkit` must never be read as a CLI call. node/cli.js heads are
    // unambiguous, so an unknown command there is a real R2 finding.
    if (isArcforge && !commands.has(command)) continue;

    // Collect flags belonging to this invocation (until the next head token).
    const flags = [];
    const positional = [];
    for (let k = cmdIdx + 1; k < tokens.length; k++) {
      const t = tokens[k];
      if (t === 'node' || t === 'arcforge' || t === 'arc') break;
      if (/cli\.js"?$/.test(t.replace(/^["']/, ''))) break;
      if (!t.startsWith('-') && flags.length === 0 && positional.length < 2) {
        positional.push(t);
      }
      if (t.startsWith('--')) {
        // --flag=value → --flag; strip trailing quotes/brackets/punctuation
        // that leak in from prose like `arcforge status --json>`.
        const flag = t.split('=')[0].replace(/[>"'.,;:)\]}]+$/, '');
        if (/[<{}]/.test(flag)) continue; // placeholder flag → skip
        flags.push(flag);
      }
    }
    results.push({ command, flags, positional });
  }

  return results;
}

// A positional token that names a subcommand: a plain word, or `a|b` alternation.
// Anything else (`<name>`, `"..."`, `~/vault`, `#`) is an argument or prose and
// ends the subcommand walk without a finding.
const SUBCOMMAND_TOKEN_RE = /^[a-z][a-z-]*(?:\|[a-z][a-z-]*)*$/;

/**
 * R2 findings for the subcommand path of one invocation. Walks the manifest's
 * `subcommands` tree one positional per level; a command (or subcommand) that
 * declares none takes free arguments and is not checked further.
 *
 * @param {string} file
 * @param {number} line
 * @param {{ command: string, positional?: string[] }} inv - from findCliInvocations
 */
function subcommandFindings(file, line, inv) {
  const findings = [];
  let node = CLI_MANIFEST[inv.command];
  const pathSoFar = [inv.command];
  for (const raw of inv.positional || []) {
    if (!node || !node.subcommands) break;
    const tok = raw.replace(/[.,;:)\]}]+$/, '');
    if (!SUBCOMMAND_TOKEN_RE.test(tok)) break;
    const names = tok.split('|');
    for (const name of names) {
      if (Object.hasOwn(node.subcommands, name)) continue;
      const full = [...pathSoFar, name].join(' ');
      findings.push(makeFinding(file, line, `subcommand "${full}" is not in the manifest`));
    }
    // Only a single, known name descends; an alternation's branches may differ.
    if (names.length !== 1 || !Object.hasOwn(node.subcommands, names[0])) break;
    node = node.subcommands[names[0]];
    pathSoFar.push(names[0]);
  }
  return findings;
}

// --- eval scenario ids ------------------------------------------------------

// `eval-<name>` as a standalone token. The lookbehind rejects a token embedded
// in a path, a filename, or a script name (`/eval-system.md`,
// `test-eval-graders.js`, `check:eval-targets`, `.eval-trials`); the lookahead
// rejects a filename extension or a directory (`eval-command.js`, `eval-dashboard/`).
const SCENARIO_ID_RE = /(?<![\w./:*-])eval-[a-z0-9]+(?:-[a-z0-9]+)*(?![\w/-]|\.\w)/g;

/**
 * @param {string} file
 * @param {{ text: string, line: number }[]} spans
 * @param {(id: string) => boolean} scenarioExists - evals/scenarios/<id>.md exists
 */
function scanScenarioIds(file, spans, scenarioExists) {
  const findings = [];
  for (const { text, line } of spans) {
    for (const m of text.matchAll(SCENARIO_ID_RE)) {
      if (scenarioExists(m[0])) continue;
      findings.push(
        makeFinding(file, line, `eval scenario ${m[0]} has no evals/scenarios/${m[0]}.md`),
      );
    }
  }
  return findings;
}

module.exports = {
  findCliInvocations,
  flagsForCommand,
  manifestCommands,
  scanNpmScripts,
  scanScenarioIds,
  subcommandFindings,
};
