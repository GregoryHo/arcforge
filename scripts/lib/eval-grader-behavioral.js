/**
 * eval-grader-behavioral.js - Deterministic behavioral-assertion grading
 *
 * Parses and grades [tool_*] behavioral assertions against an action log.
 * No LLM calls, no shared I/O — a self-contained leaf alongside eval-grader-io.
 * Imported by the eval-graders dispatcher. Never imports eval-graders back.
 *
 * Zero external dependencies — Node.js standard library only.
 */

// ============================================================
// Behavioral Assertions — Parse, Classify, Grade
// ============================================================

/**
 * Parse a tool reference of the form "ToolName:args_pattern".
 * @param {string} ref - e.g. "Skill:arc-verifying" or "Bash:npm test"
 * @returns {{ name: string, pattern: string }}
 */
function parseToolRef(ref) {
  const colonIdx = ref.indexOf(':');
  if (colonIdx === -1) return { name: ref.trim(), pattern: '' };
  return { name: ref.slice(0, colonIdx).trim(), pattern: ref.slice(colonIdx + 1).trim() };
}

/**
 * Parse a behavioral assertion string into a structured object.
 * Recognized prefixes: [tool_called], [tool_not_called], [tool_before],
 * [tool_count], [tool_adjacent].
 *
 * Returns null for non-behavioral assertions (e.g. "[ ] text" or plain text).
 *
 * @param {string} assertion - Raw assertion string
 * @returns {{ operator: string, [key: string]: any }|null}
 */
function parseBehavioralAssertion(assertion) {
  if (!assertion || typeof assertion !== 'string') return null;
  const str = assertion.trim();

  // Match [tool_<operator>] prefix
  const prefixMatch = str.match(/^\[tool_(\w+)\]\s+(.*)/);
  if (!prefixMatch) return null;

  const operator = `tool_${prefixMatch[1]}`;
  const body = prefixMatch[2].trim();

  switch (operator) {
    case 'tool_called':
    case 'tool_not_called': {
      const { name, pattern } = parseToolRef(body);
      return { operator, name, pattern };
    }

    case 'tool_before': {
      // "A < B" — split on " < "
      const parts = body.split(/\s+<\s+/);
      if (parts.length !== 2) return null;
      return { operator, a: parseToolRef(parts[0]), b: parseToolRef(parts[1]) };
    }

    case 'tool_count': {
      // "ToolName:pattern >= N"
      const countMatch = body.match(/^(.+?)\s*>=\s*(\d+)$/);
      if (!countMatch) return null;
      const { name, pattern } = parseToolRef(countMatch[1]);
      return { operator, name, pattern, min: parseInt(countMatch[2], 10) };
    }

    case 'tool_adjacent': {
      // "A ~ B" — split on " ~ "
      const parts = body.split(/\s+~\s+/);
      if (parts.length !== 2) return null;
      return { operator, a: parseToolRef(parts[0]), b: parseToolRef(parts[1]) };
    }

    default:
      return null;
  }
}

/**
 * Classify a list of assertion strings into behavioral and text groups.
 * Preserves original indices for score reassembly in mixed grading.
 *
 * @param {string[]} assertions - Raw assertion strings
 * @returns {{ behavioral: Array<{originalIndex: number, parsed: Object, assertion: string}>,
 *             text: Array<{originalIndex: number, assertion: string}> }}
 */
function classifyAssertions(assertions) {
  const behavioral = [];
  const text = [];
  for (let i = 0; i < assertions.length; i++) {
    const parsed = parseBehavioralAssertion(assertions[i]);
    if (parsed) {
      behavioral.push({ originalIndex: i, parsed, assertion: assertions[i] });
    } else {
      text.push({ originalIndex: i, assertion: assertions[i] });
    }
  }
  return { behavioral, text };
}

/**
 * Compile a `re:<pattern>` argument matcher, or null when the pattern is a
 * plain substring. A substring cannot express a command whose parts are
 * separated by arguments (`git -C <path> merge`), so a regex form is needed for
 * assertions that must survive equivalent spellings of the same command.
 *
 * The opt-in `re:` marker is deliberate: bare-slash patterns like `Write:/test/`
 * already exist as substrings, and inferring a regex from the delimiter would
 * silently re-interpret them.
 *
 * An unparseable regex falls back to substring matching rather than throwing —
 * a malformed assertion must not crash grading.
 * @param {string} pattern - Raw pattern from the tool reference
 * @returns {RegExp|null} Compiled regex, or null for substring matching
 */
function compileArgsPattern(pattern) {
  if (!pattern.startsWith('re:')) return null;
  try {
    return new RegExp(pattern.slice(3));
  } catch {
    return null;
  }
}

/**
 * Check whether a single action matches a tool reference (name + args pattern).
 * The args pattern is a substring by default, or a regex when prefixed with
 * `re:` (e.g. `Bash:re:\bgit\b.*\bmerge\b`).
 * @param {Object} action - Action from the action log
 * @param {string} name - Tool name to match
 * @param {string} pattern - Substring, or `re:<regex>`, to match in args
 * @returns {boolean}
 */
function actionMatches(action, name, pattern) {
  if (action.type !== 'tool') return false;
  if (action.name !== name) return false;
  if (!pattern) return true;
  const args = action.args || '';
  const re = compileArgsPattern(pattern);
  return re ? re.test(args) : args.includes(pattern);
}

/**
 * Grade a single parsed behavioral assertion against an action log.
 * Returns 1 (pass) or 0 (fail). No LLM calls — purely deterministic.
 *
 * @param {Object} parsed - Parsed assertion from parseBehavioralAssertion
 * @param {Array<{type: string, name?: string, args?: string, index: number}>} actions
 * @returns {0|1}
 */
function gradeBehavioralAssertion(parsed, actions) {
  switch (parsed.operator) {
    case 'tool_called': {
      return actions.some((a) => actionMatches(a, parsed.name, parsed.pattern)) ? 1 : 0;
    }

    case 'tool_not_called': {
      return actions.some((a) => actionMatches(a, parsed.name, parsed.pattern)) ? 0 : 1;
    }

    case 'tool_before': {
      const aIdx = actions.findIndex((a) => actionMatches(a, parsed.a.name, parsed.a.pattern));
      const bIdx = actions.findIndex((a) => actionMatches(a, parsed.b.name, parsed.b.pattern));
      if (aIdx === -1 || bIdx === -1) return 0;
      return aIdx < bIdx ? 1 : 0;
    }

    case 'tool_count': {
      const count = actions.filter((a) => actionMatches(a, parsed.name, parsed.pattern)).length;
      return count >= parsed.min ? 1 : 0;
    }

    case 'tool_adjacent': {
      const aIdx = actions.findIndex((a) => actionMatches(a, parsed.a.name, parsed.a.pattern));
      const bIdx = actions.findIndex((a) => actionMatches(a, parsed.b.name, parsed.b.pattern));
      if (aIdx === -1 || bIdx === -1) return 0;
      const lo = Math.min(aIdx, bIdx);
      const hi = Math.max(aIdx, bIdx);
      // Check no tool actions between them (text entries are allowed)
      for (let i = lo + 1; i < hi; i++) {
        if (actions[i].type === 'tool') return 0;
      }
      return 1;
    }

    default:
      return 0;
  }
}

/**
 * Grade all parsed behavioral assertions against an action log.
 * @param {Object[]} parsedAssertions - Array of parsed assertions
 * @param {Object[]} actions - Action log
 * @returns {number[]} Array of 0|1 scores
 */
function gradeAllBehavioral(parsedAssertions, actions) {
  return parsedAssertions.map((p) => gradeBehavioralAssertion(p, actions));
}

module.exports = {
  parseToolRef,
  parseBehavioralAssertion,
  classifyAssertions,
  actionMatches,
  gradeBehavioralAssertion,
  gradeAllBehavioral,
};
