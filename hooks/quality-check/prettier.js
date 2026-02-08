/**
 * Prettier formatting module for quality-check hook
 */

const { execCommand, fileExists } = require('../lib/utils');
const { getPmExecCommand } = require('../lib/package-manager');

/**
 * Run Prettier on a file with --write flag
 * Returns { formatted: boolean, error?: string }
 */
function runPrettier(filePath, pmName) {
  if (!fileExists(filePath)) {
    return { formatted: false, error: 'File not found' };
  }

  const execCmd = getPmExecCommand('prettier', pmName);
  if (!execCmd) {
    return { formatted: false, error: 'Could not determine package manager command' };
  }

  // execCmd is e.g. ['npx', 'prettier'] or ['pnpm', 'exec', 'prettier']
  const [cmd, ...baseArgs] = execCmd;
  const args = [...baseArgs, '--write', filePath];

  const result = execCommand(cmd, args, { timeout: 15000 });

  if (result.exitCode === 0) {
    return { formatted: true };
  }

  // Prettier returns exit code 2 for check failures (formatting needed)
  // but with --write it auto-fixes, so exitCode 0 is expected on success
  return {
    formatted: false,
    error: result.stderr || 'Prettier failed'
  };
}

/**
 * Check if file would be formatted (without writing)
 * Returns { needsFormatting: boolean, error?: string }
 */
function checkPrettier(filePath, pmName) {
  if (!fileExists(filePath)) {
    return { needsFormatting: false, error: 'File not found' };
  }

  const execCmd = getPmExecCommand('prettier', pmName);
  if (!execCmd) {
    return { needsFormatting: false, error: 'Could not determine package manager command' };
  }

  const [cmd, ...baseArgs] = execCmd;
  const args = [...baseArgs, '--check', filePath];

  const result = execCommand(cmd, args, { timeout: 15000 });

  // Exit code 0 = already formatted, 1 = needs formatting
  return {
    needsFormatting: result.exitCode !== 0,
    error: result.exitCode > 1 ? result.stderr : undefined
  };
}

module.exports = {
  runPrettier,
  checkPrettier
};
