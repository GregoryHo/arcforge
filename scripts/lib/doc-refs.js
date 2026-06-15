/**
 * doc-refs.js — doc-reference linter engine (SRH-4).
 *
 * Catches the "broken seam" defect class: a shipped doc that promises a file
 * path, a CLI command/flag, a `--json` output field, or a skill name that the
 * engine does not actually provide. Four rules:
 *
 *   R1  paths   — a repo-relative path in a code span/block under a known
 *                 top-level dir, with a recognized extension, must resolve to
 *                 an existing file or directory.
 *   R2  CLI     — a CLI invocation (`node …cli.js <cmd>` or backticked
 *                 `arcforge <cmd>` / `arc <cmd>`) must name a command in
 *                 cli-manifest.js, and every `--flag` it uses must be declared
 *                 for that command (or a subcommand) in the manifest.
 *   R3  fields  — a `--json` output field promise (jq path or a doc `.field`
 *                 promise tied to a command) must exist in that command's
 *                 manifest `output` shape (only checked for commands whose
 *                 shape is pinned — `output !== null`).
 *   R4  skills  — a backticked `arc-<name>` skill reference must resolve to an
 *                 existing `skills/<name>/` directory. SHIPPED WARN-ONLY in this
 *                 PR: WT-6 (the finishing-twin merge that deletes
 *                 skills/arc-finishing-epic/) has not landed yet, so gating R4
 *                 now would false-positive on the live tree and on sibling
 *                 Wave-3 branches that still reference the old name. R4 flips to
 *                 gating (severity 'error') in the SRH-5 CI follow-up once WT-6
 *                 has merged. See R4_SEVERITY below.
 *
 * The manifest (scripts/lib/cli-manifest.js) is the SINGLE source of truth for
 * R2 flags and R3 field promises — this engine reads it and is FORBIDDEN a
 * second copy of that data (per the manifest header and SRH-4's stop
 * condition: needing a flag the manifest lacks means extending the manifest +
 * its contract test, never hardcoding here).
 *
 * Escape hatch: a line carrying `<!-- doc-ref-lint: ignore <rule> <reason> -->`
 * suppresses findings for that rule on the SAME line. The reason is MANDATORY —
 * an ignore directive with no reason is itself a finding (rule 'ignore').
 *
 * Library tier: pure, no I/O of its own beyond the caller-supplied existence
 * probe; throws with context on contract violations.
 */

const { CLI_MANIFEST } = require('./cli-manifest');

// R4 ships warn-only this PR; flips to 'error' (gating) after WT-6 lands.
const R4_SEVERITY = 'warn';

// Top-level dirs whose paths we are willing to assert exist. Restricted to the
// engine/agent/skill/hook/template CODE surface — the layers whose paths are a
// real shipping contract. Deliberately EXCLUDES `specs/`, `docs/`, and `evals/`:
// those trees carry per-project / per-spec placeholders by design (e.g.
// `specs/my-spec/dag.yaml`, `docs/plans/my-spec/.../design.md`), so asserting
// their existence would flood with false positives, not catch defects. Paths in
// docs are additionally resolved relative to the doc's own directory (many skill
// docs cite `agents/foo.md` meaning the skill-local `agents/` dir), so a path is
// only a finding when it resolves against NEITHER the repo root NOR the doc dir.
const PATH_PREFIXES = ['scripts/', 'skills/', 'hooks/', 'templates/', 'agents/', '.claude-plugin/'];

// Extensions that mark a token as a concrete file reference (vs. a directory
// fragment or a glob). Directory references are handled separately.
const PATH_EXT_RE = /\.(js|jsx|ts|md|ya?ml|json|py|sh|xml|html|txt)$/;

// A code span is `...` (single backtick, no embedded backtick). A fenced block
// is ``` ... ``` across lines. We collect both as (text, line) spans.
const INLINE_CODE_RE = /`([^`\n]+)`/g;

// Ignore directive: `<!-- doc-ref-lint: ignore <rule> <reason> -->`
const IGNORE_RE = /<!--\s*doc-ref-lint:\s*ignore\b([^>]*)-->/i;

/**
 * Parse a doc into code spans with their 1-based line numbers. Both fenced
 * code blocks (line-by-line) and inline code spans are returned so the rules
 * only ever inspect code, never prose.
 *
 * @param {string} content
 * @returns {{ text: string, line: number }[]}
 */
function extractCodeSpans(content) {
  const lines = content.split('\n');
  const spans = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const fenceToggle = /^\s*```/.test(line);

    if (fenceToggle) {
      inFence = !inFence;
      continue; // the fence delimiter line itself carries no reference
    }

    if (inFence) {
      // Entire line is code.
      if (line.trim()) spans.push({ text: line, line: lineNo });
      continue;
    }

    // Outside a fence: collect inline code spans only.
    for (const m of line.matchAll(INLINE_CODE_RE)) {
      spans.push({ text: m[1], line: lineNo });
    }
  }

  return spans;
}

/**
 * Parse the ignore directives present on a given source line.
 * Returns { rules: Set<string>|'all', reason: string|null } or null when no
 * directive is present. A directive with no reason yields reason=null, which
 * the caller flags.
 *
 * @param {string} line
 */
function parseIgnore(line) {
  const m = line.match(IGNORE_RE);
  if (!m) return null;
  const body = m[1].trim();
  // First whitespace-separated token is the rule (or 'all'); the remainder is
  // the reason.
  const parts = body.split(/\s+/);
  const ruleToken = parts.shift() || '';
  const reason = parts.join(' ').trim();
  const rules = ruleToken && ruleToken.toLowerCase() !== 'all' ? new Set([ruleToken]) : 'all';
  return { rules, reason: reason || null, ruleToken };
}

function makeFinding(rule, severity, file, line, message) {
  return { rule, severity, file, line, message };
}

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
 * Walk a manifest `output` skeleton along a dotted/indexed field path and
 * report whether the path exists. Array elements are described by a
 * one-element array `[shape]`; an index (`[0]`) or a bare `[]` both descend
 * into that shape. Returns true when the field resolves, false otherwise.
 *
 * @param {*} shape - manifest output skeleton (or sub-shape)
 * @param {string[]} segments - field segments, e.g. ['epics','path']
 */
function fieldExists(shape, segments) {
  let node = shape;
  for (const seg of segments) {
    if (node === null || node === undefined) return false;
    if (Array.isArray(node)) {
      // Descend into the element shape; an empty array pins no sub-shape, so
      // we cannot assert the field and treat it as present (conservative).
      if (node.length === 0) return true;
      node = node[0];
    }
    if (typeof node !== 'object' || Array.isArray(node)) return false;
    if (!(seg in node)) return false;
    node = node[seg];
  }
  return true;
}

/**
 * Split a jq-style or doc field path into clean segments, stripping array
 * subscripts. `'.epics[0].path'` → ['epics','path']; `'.epics[].id'` →
 * ['epics','id'].
 */
function fieldSegments(raw) {
  return raw
    .replace(/\[\d*\]/g, '') // drop [0], []
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ----------------------------------------------------------------------------
// Per-rule scanners. Each takes the parsed code spans + an `exists(relPath)`
// probe and returns an array of findings (before ignore-filtering).
// ----------------------------------------------------------------------------

function scanR1Paths(file, spans, exists) {
  const findings = [];
  // A path token: starts with a known prefix, no spaces, optionally has an
  // extension. We match whitespace-delimited tokens inside the code text.
  for (const { text, line } of spans) {
    for (const rawTok of text.split(/[\s"'`()]+/)) {
      const tok = rawTok.replace(/[.,;:]+$/, ''); // strip trailing punctuation
      if (!tok) continue;
      if (!PATH_PREFIXES.some((p) => tok.startsWith(p))) continue;
      // Skip globs, placeholders, and literal ellipsis fragments — these are
      // illustrative, not literal references.
      if (/[*<>{}]/.test(tok) || tok.includes('...')) continue;
      // Only assert tokens that look like files (have a known extension) or
      // are a pure directory path under a known prefix. A bare prefix word
      // like `scripts/` (trailing slash) is a directory reference.
      const isFile = PATH_EXT_RE.test(tok);
      const isDir = tok.endsWith('/');
      if (!isFile && !isDir) continue;
      // `exists(tok)` resolves against BOTH the repo root and the doc's own
      // directory (skill docs cite skill-local paths like `agents/foo.md`).
      if (!exists(tok)) {
        findings.push(
          makeFinding('R1', 'error', file, line, `path does not resolve to a repo file: ${tok}`),
        );
      }
    }
  }
  return findings;
}

function scanR2AndR3Cli(file, spans, manifest) {
  const findings = [];
  const commands = manifestCommands();

  for (const { text, line } of spans) {
    const invocations = findCliInvocations(text);
    for (const inv of invocations) {
      const { command, flags } = inv;
      // R2 — unknown command.
      if (!commands.has(command)) {
        findings.push(
          makeFinding('R2', 'error', file, line, `CLI command not in manifest: ${command}`),
        );
        continue;
      }
      // R2 — unknown flag for this command.
      const valid = flagsForCommand(command);
      for (const flag of flags) {
        if (valid && !valid.has(flag)) {
          findings.push(
            makeFinding(
              'R2',
              'error',
              file,
              line,
              `flag ${flag} is not declared for command "${command}" in the manifest`,
            ),
          );
        }
      }
    }

    // R3 — jq field promises tied to a command shape. A jq program may pipe
    // through an array context (`.epics[] | select(...) | .path`), so a trailing
    // selector like `.path` is valid when it resolves EITHER from root OR
    // appended after any array anchor present in the same program.
    const promise = findJqFieldPromises(text);
    if (promise) {
      const entry = manifest[promise.command];
      if (entry && entry.output !== null) {
        const anchors = promise.anchors.map((a) => fieldSegments(a));
        for (const field of promise.fields) {
          const segs = fieldSegments(field);
          if (segs.length === 0) continue;
          const fromRoot = fieldExists(entry.output, segs);
          const fromAnchor = anchors.some((a) => fieldExists(entry.output, [...a, ...segs]));
          if (!fromRoot && !fromAnchor) {
            findings.push(
              makeFinding(
                'R3',
                'error',
                file,
                line,
                `--json field ${field} is not in the "${promise.command}" output shape`,
              ),
            );
          }
        }
      }
    }
  }

  return findings;
}

/**
 * Extract CLI invocations from a code span. Recognizes:
 *   node "…cli.js" <cmd> [flags…]
 *   node …/cli.js <cmd> [flags…]
 *   arcforge <cmd> [flags…]
 *   arc <cmd> [flags…]   (only when followed by a manifest-shaped token)
 * Returns [{ command, flags: string[] }]. The command is the first
 * non-flag token after the invocation head. Flags are the `--xxx` tokens.
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
    for (let k = cmdIdx + 1; k < tokens.length; k++) {
      const t = tokens[k];
      if (t === 'node' || t === 'arcforge' || t === 'arc') break;
      if (/cli\.js"?$/.test(t.replace(/^["']/, ''))) break;
      if (t.startsWith('--')) {
        // --flag=value → --flag; strip trailing quotes/brackets/punctuation
        // that leak in from prose like `arcforge status --json>`.
        const flag = t.split('=')[0].replace(/[>"'.,;:)\]}]+$/, '');
        if (/[<{}]/.test(flag)) continue; // placeholder flag → skip
        flags.push(flag);
      }
    }
    results.push({ command, flags });
  }

  return results;
}

/**
 * Find jq field promises in a code span. R3 only fires when a span contains
 * both a `jq` call and exactly one manifest command name (unambiguous
 * attribution). Returns null when there is no jq, or no/ambiguous command.
 *
 * Returns { command, fields, anchors }:
 *   - fields  — every `.a.b` dotted selector in the span (to validate)
 *   - anchors — the subset of fields that index into an array (`.epics[]`),
 *     stripped to their dotted path; the caller resolves trailing piped
 *     selectors relative to these.
 *
 * @param {string} text
 */
function findJqFieldPromises(text) {
  if (!/\bjq\b/.test(text)) return null;
  const commands = manifestCommands();
  const present = [...commands].filter((c) => {
    const re = new RegExp(`(^|\\s|["'/])${c}(\\s|["']|$)`);
    return re.test(text);
  });
  // Ambiguous (0 or >1 commands in the span) → skip, don't guess.
  if (present.length !== 1) return null;
  const command = present[0];

  const fields = [];
  const anchors = [];
  // Capture .a.b[0].c shaped selectors. The full match includes any [..].
  const re = /\.([A-Za-z_][\w]*(?:(?:\[\d*\])?\.[A-Za-z_][\w]*)*)((?:\[\d*\])?)/g;
  for (const m of text.matchAll(re)) {
    const dotted = `.${m[1]}`;
    fields.push(dotted);
    // A selector ending in `[..]` (or whose body contains `[..].`) anchors an
    // array context. Record the leading array path as a possible anchor.
    if (m[2] || /\[\d*\]/.test(m[1])) {
      anchors.push(dotted);
    }
  }
  return { command, fields, anchors };
}

function scanR4Skills(file, spans, skillExists) {
  const findings = [];
  // arc-<name> as a whole backtick-quoted token (already inside a code span).
  const re = /\barc-[a-z0-9-]+\b/g;
  for (const { text, line } of spans) {
    for (const m of text.matchAll(re)) {
      const name = m[0];
      if (!skillExists(name)) {
        findings.push(
          makeFinding(
            'R4',
            R4_SEVERITY,
            file,
            line,
            `skill reference does not resolve to skills/${name}/ (warn-only until WT-6; flips to gating in SRH-5)`,
          ),
        );
      }
    }
  }
  return findings;
}

/**
 * Lint a single doc.
 *
 * @param {string} file - display path for findings (relative to repo root)
 * @param {string} content - file contents
 * @param {Object} probes
 * @param {(relPath: string, docDir: string) => boolean} probes.pathExists -
 *   true when relPath resolves to a repo file/dir. `docDir` is the linted
 *   file's directory (relative to repo root) so the probe can also try
 *   doc-relative resolution (skill docs cite skill-local paths).
 * @param {(skillName: string) => boolean} probes.skillExists - skill dir exists
 * @returns {{ findings: Object[] }}
 */
function lintDoc(file, content, probes = {}) {
  if (typeof content !== 'string') {
    throw new TypeError(`lintDoc requires string content for ${file}`);
  }
  const docDir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  const rawPathExists = probes.pathExists || (() => true);
  const pathExists = (relPath) => rawPathExists(relPath, docDir);
  const skillExists = probes.skillExists || (() => true);

  const spans = extractCodeSpans(content);
  const lines = content.split('\n');

  let findings = [
    ...scanR1Paths(file, spans, pathExists),
    ...scanR2AndR3Cli(file, spans, CLI_MANIFEST),
    ...scanR4Skills(file, spans, skillExists),
  ];

  // Build a per-line suppression map: line number → ignore directive. A
  // directive suppresses findings on (a) its own line, (b) the immediately
  // following content line, and (c) — when it sits directly above a fenced
  // code block — every line inside that block (the directive cannot live
  // inside the fence without becoming code).
  const suppress = new Map(); // line (1-based) → ignore directive
  for (let i = 0; i < lines.length; i++) {
    const ig = parseIgnore(lines[i]);
    if (!ig) continue;
    const directiveLine = i + 1;
    suppress.set(directiveLine, ig);
    if (directiveLine + 1 <= lines.length) suppress.set(directiveLine + 1, ig);
    // Directive directly above a fence opener → cover the whole block.
    if (/^\s*```/.test(lines[i + 1] || '')) {
      for (let j = i + 2; j < lines.length; j++) {
        if (/^\s*```/.test(lines[j])) break; // closing fence
        suppress.set(j + 1, ig);
      }
    }
  }

  const ignoreFindings = [];
  findings = findings.filter((f) => {
    const ig = suppress.get(f.line);
    if (!ig) return true;
    const matchesRule = ig.rules === 'all' || ig.rules.has(f.rule);
    return !matchesRule; // suppressed when the rule matches
  });

  // Independently, every ignore directive in the file must carry a reason.
  for (let i = 0; i < lines.length; i++) {
    const ig = parseIgnore(lines[i]);
    if (ig && !ig.reason) {
      ignoreFindings.push(
        makeFinding(
          'ignore',
          'error',
          file,
          i + 1,
          'doc-ref-lint ignore directive is missing a mandatory reason',
        ),
      );
    }
  }

  return { findings: [...findings, ...ignoreFindings] };
}

module.exports = {
  lintDoc,
  extractCodeSpans,
  parseIgnore,
  fieldExists,
  fieldSegments,
  findCliInvocations,
  R4_SEVERITY,
  PATH_PREFIXES,
};
