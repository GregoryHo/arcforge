/**
 * TypeScript type-checking module for quality-check hook
 * Uses execCommand from utils.js (which uses execFileSync, not exec)
 */

const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execCommand, fileExists, findUpwards } = require('../../scripts/lib/utils');
const { getPmExecCommand } = require('../../scripts/lib/package-manager');

// Where the cross-invocation incremental build cache lives. A stable,
// per-project path (not a fresh mktemp) is what lets the *second* run reuse
// the first run's `.tsbuildinfo` and skip re-checking unchanged files.
const TSBUILDINFO_DIR = path.join(os.tmpdir(), 'arcforge-tsc-cache');

/**
 * Derive a stable `.tsbuildinfo` path for a project. Keyed on the resolved
 * tsconfig path (or the file directory when no tsconfig) so each project gets
 * its own cache file that persists across hook invocations.
 * @returns {string} absolute path inside the OS tmpdir
 */
function buildInfoPathFor(key) {
  const hash = crypto.createHash('sha1').update(path.resolve(key)).digest('hex').slice(0, 16);
  return path.join(TSBUILDINFO_DIR, `${hash}.tsbuildinfo`);
}

/**
 * Construct the tsc argument vector (pure — no I/O).
 * @param {string[]} baseArgs - leading args from the package-manager exec command
 * @param {object} opts
 * @param {string|null} opts.tsconfigPath - resolved tsconfig.json path, or null
 * @param {string|null} opts.buildInfoPath - incremental cache path, or null to disable incremental
 * @param {string|null} opts.filePath - edited file path, used as a fallback input
 *   when no ancestor tsconfig.json was found (mutually exclusive with --project)
 * @returns {string[]} the full argv (excluding the executable itself)
 */
function buildTscArgs(
  baseArgs,
  { tsconfigPath = null, buildInfoPath = null, filePath = null } = {},
) {
  // --noEmit: type-check only. --pretty false: parseable output.
  const args = [...baseArgs, '--noEmit', '--pretty', 'false'];

  if (buildInfoPath) {
    // --incremental needs an explicit --tsBuildInfoFile under --noEmit /
    // single-file mode (otherwise TS5074). Passing both is the supported
    // combination and is what lets the second run skip unchanged files.
    args.push('--incremental', '--tsBuildInfoFile', buildInfoPath);
  }

  if (tsconfigPath) {
    args.push('--project', tsconfigPath);
  } else if (filePath) {
    // No ancestor tsconfig.json: fall back to a single-file standalone check,
    // so tsc never runs with zero input files and silently "passes".
    args.push(filePath);
  }

  return args;
}

/**
 * Detect a tsc invocation that failed because it rejected the `--incremental`
 * flag itself (an older or differently-configured compiler), as opposed to a
 * genuine type error in the source. Such rejections are CLI/config errors that
 * name the option and carry no `file(line,col):` source position.
 *
 * Covers:
 *   - TS5023 "Unknown compiler option '--incremental'." (old tsc)
 *   - TS5074 "Option '--incremental' can only be specified ..."
 *   - generic "Unknown option" text mentioning incremental
 *
 * @returns {boolean} true when the run should be retried without --incremental
 */
function isIncrementalFlagRejected(output) {
  if (!output) return false;
  const mentionsIncremental = /incremental|tsbuildinfofile/i.test(output);
  if (!mentionsIncremental) return false;
  return (
    /TS5023\b/.test(output) || // Unknown compiler option
    /TS5074\b/.test(output) || // --incremental can only be specified ...
    /unknown (compiler )?option/i.test(output)
  );
}

/**
 * Run TypeScript compiler on project (noEmit mode)
 * Filters errors to only show those from the edited file
 * Returns { errors: string[], warnings: string[], standalone: boolean } —
 * standalone is true when no ancestor tsconfig.json was found, so the check
 * ran with tsc's bare default options rather than the project's real
 * configuration
 *
 * Cost bound: uses --incremental with a stable per-project .tsbuildinfo so the
 * second and later runs reuse cached results. If the installed tsc rejects the
 * flag, the run BACKS OFF and retries without it — type-checking is never
 * silently dropped, only the speedup.
 *
 * @param {string} filePath - the edited file
 * @param {string} pmName - detected package manager
 * @param {{ run?: function, execCommand?: string }} [inject] - test seam
 */
function runTypeCheck(filePath, pmName, inject = {}) {
  if (!fileExists(filePath)) {
    return { errors: ['File not found'], warnings: [] };
  }

  const pmExecCmd = inject.execCommand ? [inject.execCommand] : getPmExecCommand('tsc', pmName);
  if (!pmExecCmd) {
    return { errors: [], warnings: ['Could not determine package manager command'] };
  }

  const [cmd, ...baseArgs] = pmExecCmd;

  // Find tsconfig.json by walking up from file directory
  const fileDir = path.dirname(filePath);
  const findTsconfig = inject.findUpwards || findUpwards;
  const tsconfigPath = findTsconfig('tsconfig.json', fileDir);
  const absolutePath = path.resolve(filePath);
  const buildInfoPath = buildInfoPathFor(tsconfigPath || absolutePath);

  // injectable runner for tests; defaults to the safe execCommand wrapper.
  const run = inject.run || ((c, a) => execCommand(c, a, { timeout: 30000 }));

  // First attempt: incremental (the fast path).
  let result = run(
    cmd,
    buildTscArgs(baseArgs, { tsconfigPath, buildInfoPath, filePath: absolutePath }),
  );

  // BACK OFF: if tsc rejected --incremental, retry without it so we never
  // silently lose type-checking on a compiler that lacks the flag.
  if (result.exitCode !== 0 && isIncrementalFlagRejected(result.stdout + result.stderr)) {
    result = run(
      cmd,
      buildTscArgs(baseArgs, { tsconfigPath, buildInfoPath: null, filePath: absolutePath }),
    );
  }

  const standalone = !tsconfigPath;

  if (result.exitCode === 0) {
    return { errors: [], warnings: [], standalone };
  }

  // Parse TypeScript output and filter to edited file only
  const output = result.stdout + result.stderr;
  const errors = [];
  const warnings = [];

  // TypeScript error format: filename(line,col): error TSxxxx: message
  const errorRegex = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/gm;
  const basename = path.basename(filePath);

  let match;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((match = errorRegex.exec(output)) !== null) {
    const [, errorFile, line, _col, severity, code, message] = match;

    // Check if error is from our edited file
    const errorFilePath = path.resolve(errorFile);
    if (errorFilePath === absolutePath || path.basename(errorFile) === basename) {
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
    warnings: warnings.slice(0, 15),
    standalone,
  };
}

module.exports = {
  runTypeCheck,
  buildTscArgs,
  buildInfoPathFor,
  isIncrementalFlagRejected,
};
