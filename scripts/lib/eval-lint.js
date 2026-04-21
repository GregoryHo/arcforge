/**
 * eval-lint.js - Validate eval scenario files
 *
 * Hand-rolled validator (no external dependencies) that checks scenario
 * markdown files for required sections and proper assertion shape.
 *
 * Diagnostic format: { file: string, line: number, message: string }
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');

/**
 * Required section headings (## level) that every scenario file must have.
 * Compared case-insensitively against parsed headings.
 */
const REQUIRED_SECTIONS = ['Context', 'Grader Config', 'Assertions'];

/**
 * Regex that matches a valid assertion ID prefix.
 * Assertions must begin with an ID like "A1:", "A2:", etc. OR use a behavioral
 * prefix like "[tool_called]". Blank text is also flagged.
 *
 * Accepted forms (after stripping the checkbox):
 *   A1: some assertion text
 *   A1 - some text  (relaxed form)
 *   [tool_called] ToolName:args
 *   [tool_not_called] ...
 */
const ASSERTION_ID_RE = /^(A\d+\s*[:–-]|\[tool_\w+\])/;

/**
 * Parse a markdown file into lines and collect:
 *   - sections: Map<lowerName, { startLine: number }>
 *   - assertionLines: Array<{ text: string, line: number }>  (inside ## Assertions)
 *
 * @param {string} content - File content
 * @returns {{ sections: Map<string, { startLine: number }>, assertionLines: Array<{ text: string, line: number }> }}
 */
function parseScenarioStructure(content) {
  const lines = content.split('\n');
  const sections = new Map();
  const assertionLines = [];
  let inAssertions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // 1-indexed

    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      const name = headerMatch[1].trim();
      const nameLower = name.toLowerCase();
      sections.set(nameLower, { startLine: lineNumber });
      inAssertions = nameLower === 'assertions';
      continue;
    }

    if (inAssertions) {
      // Capture assertion bullets: - [ ] ... or - [x] ... or - [tool_*] ...
      const bulletMatch = line.match(/^-\s*\[([^\]]*)\]\s*(.*)/);
      if (bulletMatch) {
        const bracketContent = bulletMatch[1].trim();
        const remainder = bulletMatch[2].trim();
        // Behavioral markers like [tool_called] are prefix tokens that
        // ASSERTION_ID_RE expects to find on the assertion text. Checkbox
        // brackets ([ ], [x], [X]) are markdown plumbing and must be stripped.
        const isBehavioralMarker = /^tool_\w+$/.test(bracketContent);
        const text = isBehavioralMarker ? `[${bracketContent}] ${remainder}`.trim() : remainder;
        assertionLines.push({ text, line: lineNumber });
      }
    }
  }

  return { sections, assertionLines };
}

/**
 * Lint a scenario file and return an array of diagnostics.
 * Returns an empty array for a clean file.
 *
 * Checks:
 * 1. All REQUIRED_SECTIONS are present.
 * 2. ## Assertions section contains at least one entry.
 * 3. Each assertion entry has an ID prefix (A1:, [tool_called], etc.) and non-blank text.
 *
 * @param {string} filePath - Absolute path to scenario .md file
 * @returns {Array<{ file: string, line: number, message: string }>} Diagnostics
 */
function lintScenario(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { sections, assertionLines } = parseScenarioStructure(content);

  const diagnostics = [];

  // Check 1: Required sections present
  for (const required of REQUIRED_SECTIONS) {
    const key = required.toLowerCase();
    if (!sections.has(key)) {
      diagnostics.push({
        file: filePath,
        line: 1,
        message: `Missing required section: ## ${required}`,
      });
    }
  }

  // Check 2 & 3: Assertions section has entries with valid IDs
  if (sections.has('assertions')) {
    if (assertionLines.length === 0) {
      const assertLine = sections.get('assertions').startLine;
      diagnostics.push({
        file: filePath,
        line: assertLine,
        message: 'Section ## Assertions has no assertion entries',
      });
    } else {
      for (const entry of assertionLines) {
        // Blank text
        if (!entry.text) {
          diagnostics.push({
            file: filePath,
            line: entry.line,
            message: `Assertion at line ${entry.line} has blank text — add an ID prefix (e.g. A1: description) and assertion text`,
          });
          continue;
        }
        // Missing ID prefix
        if (!ASSERTION_ID_RE.test(entry.text)) {
          diagnostics.push({
            file: filePath,
            line: entry.line,
            message: `Assertion at line ${entry.line} is missing an ID prefix — expected "A1: ..." or "[tool_called] ..." (got: "${entry.text.slice(0, 60)}")`,
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Format diagnostics as file:line:message strings for CLI output.
 * @param {Array<{ file: string, line: number, message: string }>} diagnostics
 * @returns {string[]} Formatted diagnostic lines
 */
function formatDiagnostics(diagnostics) {
  return diagnostics.map((d) => `${d.file}:${d.line}: ${d.message}`);
}

module.exports = {
  lintScenario,
  formatDiagnostics,
  REQUIRED_SECTIONS,
};
