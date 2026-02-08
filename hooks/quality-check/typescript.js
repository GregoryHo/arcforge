/**
 * TypeScript type-checking module for quality-check hook
 * Uses execCommand from utils.js (which uses execFileSync, not exec)
 */

const path = require('path');
const { execCommand, fileExists, findUpwards } = require('../lib/utils');
const { getPmExecCommand } = require('../lib/package-manager');

/**
 * Run TypeScript compiler on project (noEmit mode)
 * Filters errors to only show those from the edited file
 * Returns { errors: string[], warnings: string[] }
 */
function runTypeCheck(filePath, pmName) {
  if (!fileExists(filePath)) {
    return { errors: ['File not found'], warnings: [] };
  }

  const pmExecCmd = getPmExecCommand('tsc', pmName);
  if (!pmExecCmd) {
    return { errors: [], warnings: ['Could not determine package manager command'] };
  }

  const [cmd, ...baseArgs] = pmExecCmd;
  // Use --noEmit to check without generating output
  // Use --pretty false for parseable output
  const args = [...baseArgs, '--noEmit', '--pretty', 'false'];

  // Find tsconfig.json by walking up from file directory
  const fileDir = path.dirname(filePath);
  const tsconfigPath = findUpwards('tsconfig.json', fileDir);
  if (tsconfigPath) {
    args.push('--project', tsconfigPath);
  }

  // execCommand uses execFileSync internally (safe)
  const result = execCommand(cmd, args, { timeout: 30000 });

  if (result.exitCode === 0) {
    return { errors: [], warnings: [] };
  }

  // Parse TypeScript output and filter to edited file only
  const output = result.stdout + result.stderr;
  const errors = [];
  const warnings = [];

  // TypeScript error format: filename(line,col): error TSxxxx: message
  const errorRegex = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/gm;
  const absolutePath = path.resolve(filePath);
  const basename = path.basename(filePath);

  let match;
  while ((match = errorRegex.exec(output)) !== null) {
    const [, errorFile, line, col, severity, code, message] = match;

    // Check if error is from our edited file
    const errorFilePath = path.resolve(errorFile);
    if (errorFilePath === absolutePath || errorFile.endsWith(basename)) {
      const formattedError = `Line ${line}: ${message} (${code})`;
      if (severity === 'warning') {
        warnings.push(formattedError);
      } else {
        errors.push(formattedError);
      }
    }
  }

  // Limit output to first 15 errors
  return {
    errors: errors.slice(0, 15),
    warnings: warnings.slice(0, 15)
  };
}

module.exports = {
  runTypeCheck
};
