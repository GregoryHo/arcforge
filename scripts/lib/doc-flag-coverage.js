/**
 * doc-flag-coverage.js — R2's reverse direction for the doc-reference linter.
 *
 * R2 in doc-refs.js checks that every flag a doc USES is declared in the CLI
 * manifest. This module checks the other way: a doc section headed
 * `## \`<command>\`` is that command's reference, so every flag the manifest
 * declares for the command (subcommand flags included) must appear in the
 * section's code. A flag added to the engine and the manifest but never
 * documented then fails `check:docs` instead of going unnoticed.
 *
 * Reads the manifest; holds no copy of its data. Library tier: pure.
 */

const { CLI_MANIFEST } = require('./cli-manifest');

const SECTION_HEADING_RE = /^## `([a-z][a-z-]*)`\s*$/;
const ANY_TOP_HEADING_RE = /^#{1,2} /;
const FENCE_RE = /^\s*```/;

function manifestFlags(cmd) {
  const entry = CLI_MANIFEST[cmd];
  const flags = new Set(entry.flags || []);
  for (const sub of Object.values(entry.subcommands || {})) {
    for (const flag of sub.flags || []) flags.add(flag);
  }
  return flags;
}

/**
 * The `## \`<command>\`` sections of a doc, as 1-based line ranges. A section
 * runs to the next level-1 or level-2 heading outside a code fence.
 * @param {string} content
 * @returns {{ cmd: string, heading: number, end: number }[]}
 */
function commandSections(content) {
  const lines = content.split('\n');
  const sections = [];
  let current = null;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) inFence = !inFence;
    if (inFence || !ANY_TOP_HEADING_RE.test(lines[i])) continue;
    if (current) sections.push({ ...current, end: i });
    const m = lines[i].match(SECTION_HEADING_RE);
    current = m && CLI_MANIFEST[m[1]] ? { cmd: m[1], heading: i + 1 } : null;
  }
  if (current) sections.push({ ...current, end: lines.length });
  return sections;
}

function mentionsFlag(text, flag) {
  return text.split(/[^\w-]+/).includes(flag);
}

/**
 * @param {string} file - Doc path, for findings
 * @param {string} content - Doc text
 * @param {{ text: string, line: number }[]} spans - Code spans (doc-refs.extractCodeSpans)
 * @returns {{ rule: string, severity: string, file: string, line: number, message: string }[]}
 */
function scanFlagCoverage(file, content, spans) {
  const findings = [];
  for (const { cmd, heading, end } of commandSections(content)) {
    const code = spans
      .filter((s) => s.line > heading && s.line <= end)
      .map((s) => s.text)
      .join('\n');
    for (const flag of manifestFlags(cmd)) {
      if (mentionsFlag(code, flag)) continue;
      findings.push({
        rule: 'R2',
        severity: 'error',
        file,
        line: heading,
        message: `manifest flag ${flag} is not documented in the \`${cmd}\` section`,
      });
    }
  }
  return findings;
}

module.exports = { scanFlagCoverage, commandSections };
