/**
 * doc-command-refs.js — R2's command-shaped references beyond a top-level
 * `arcforge <cmd> --flag` (doc-refs.js owns that).
 *
 *   npm run <script> — must be a script in the repo's package.json. Skill docs
 *                      are exempt: their `npm run` addresses the user's project,
 *                      not this package.json.
 *
 * Library tier: pure. Existence comes from caller-supplied probes.
 */

// `npm run [flags…] <script>`. The script class excludes `<` so a placeholder
// (`npm run <script>`) is never read as a name.
const NPM_RUN_RE = /\bnpm run\s+(?:-\S+\s+)*([A-Za-z0-9][\w:.-]*)/g;

function makeFinding(file, line, message) {
  return { rule: 'R2', severity: 'error', file, line, message };
}

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

module.exports = { scanNpmScripts };
