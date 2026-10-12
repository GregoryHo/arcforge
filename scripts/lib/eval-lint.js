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
const { parseScenario, reservedNameError, scenarioSections } = require('./eval-scenario');
const { environmentLines, parseEnvironment } = require('./eval-trial-environment');

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
 * Collect what the checks below read, from the sections the trial itself parses
 * (a heading inside a code fence or a heredoc is not a section):
 *   - sections: Map<lowerName, { startLine: number, lines: string[] }>
 *   - assertionLines: Array<{ text: string, line: number }>  (inside ## Assertions)
 *   - environmentLines: Array<{ text: string, line: number }>  (inside ## Environment)
 *
 * @param {string} content - File content
 * @returns {{ sections: Map<string, { startLine: number, lines: string[] }>, assertionLines: Array<{ text: string, line: number }>, environmentLines: Array<{ text: string, line: number }> }}
 */
function parseScenarioStructure(content) {
  const sections = scenarioSections(content);
  const assertionLines = [];
  const assertions = sections.get('assertions') || { startLine: 0, lines: [] };

  assertions.lines.forEach((line, offset) => {
    // Capture assertion bullets: - [ ] ... or - [x] ... or - [tool_*] ...
    const bulletMatch = line.match(/^-\s*\[([^\]]*)\]\s*(.*)/);
    if (!bulletMatch) return;
    const bracketContent = bulletMatch[1].trim();
    const remainder = bulletMatch[2].trim();
    // Behavioral markers like [tool_called] are prefix tokens that
    // ASSERTION_ID_RE expects to find on the assertion text. Checkbox
    // brackets ([ ], [x], [X]) are markdown plumbing and must be stripped.
    const isBehavioralMarker = /^tool_\w+$/.test(bracketContent);
    const text = isBehavioralMarker ? `[${bracketContent}] ${remainder}`.trim() : remainder;
    assertionLines.push({ text, line: assertions.startLine + 1 + offset });
  });

  const environment = sections.get('environment') || { startLine: 0, lines: [] };
  return {
    sections,
    assertionLines,
    environmentLines: environmentLines(environment.lines).map(({ text, offset }) => ({
      text,
      line: environment.startLine + 1 + offset,
    })),
  };
}

/**
 * Lint a scenario file and return an array of diagnostics.
 * Returns an empty array for a clean file.
 *
 * Checks:
 * 1. All REQUIRED_SECTIONS are present.
 * 2. ## Assertions section contains at least one entry.
 * 3. Each assertion entry has an ID prefix (A1:, [tool_called], etc.) and non-blank text.
 * 4. The scenario name does not end in a reserved condition suffix.
 * 5. Each ## Environment line is a declaration the trial will accept.
 *
 * @param {string} filePath - Absolute path to scenario .md file
 * @param {string} [projectRoot] - Project root the scenario's trials run under
 *   (defaults to the working directory)
 * @returns {Array<{ file: string, line: number, message: string }>} Diagnostics
 */
function lintScenario(filePath, projectRoot = process.cwd()) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { sections, assertionLines, environmentLines: declared } = parseScenarioStructure(content);

  const diagnostics = [];

  // Check 4: the name is not one the result store reads as a condition
  const reserved = reservedNameError(parseScenario(filePath).name);
  if (reserved) {
    const nameLine = content.split('\n').findIndex((l) => /^#\s+Eval:/.test(l));
    diagnostics.push({ file: filePath, line: nameLine + 1 || 1, message: reserved });
  }

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

  // Check 5: ## Environment declarations — the trial refuses what this reports
  const declarations = declared.map((d) => d.text);
  for (const { index, message } of parseEnvironment(declarations, projectRoot).errors) {
    diagnostics.push({
      file: filePath,
      line: declared[index].line,
      message: `## Environment line ${declared[index].line}: ${message}`,
    });
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
