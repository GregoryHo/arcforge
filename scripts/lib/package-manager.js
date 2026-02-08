/**
 * Package manager detection and command utilities
 * Detects npm, pnpm, yarn, or bun based on lock files and configuration
 *
 * Detection priority:
 * 1. CLAUDE_PACKAGE_MANAGER environment variable
 * 2. Project .claude/package-manager.json
 * 3. package.json packageManager field
 * 4. Lock file detection
 * 5. Global ~/.claude/package-manager.json
 * 6. Fallback to npm if package.json exists
 *
 * NOTE: This is the canonical location. hooks/lib/package-manager.js should import from here.
 */

const path = require('path');
const fs = require('fs');
const { fileExists, commandExists, readFileSafe } = require('./utils');

/**
 * Package manager configurations
 * Each PM has its lock file and command patterns
 */
const PACKAGE_MANAGERS = {
  pnpm: {
    lockFile: 'pnpm-lock.yaml',
    command: 'pnpm',
    run: ['pnpm'],              // pnpm <script>
    exec: ['pnpm', 'exec'],     // pnpm exec <cmd>
    install: ['pnpm', 'install'],
    test: ['pnpm', 'test'],
    build: ['pnpm', 'build']
  },
  yarn: {
    lockFile: 'yarn.lock',
    command: 'yarn',
    run: ['yarn'],              // yarn <script>
    exec: ['yarn'],             // yarn <cmd>
    install: ['yarn', 'install'],
    test: ['yarn', 'test'],
    build: ['yarn', 'build']
  },
  bun: {
    lockFile: 'bun.lockb',
    command: 'bun',
    run: ['bun', 'run'],        // bun run <script>
    exec: ['bun', 'x'],         // bun x <cmd>
    install: ['bun', 'install'],
    test: ['bun', 'test'],
    build: ['bun', 'run', 'build']
  },
  npm: {
    lockFile: 'package-lock.json',
    command: 'npm',
    run: ['npm', 'run'],        // npm run <script>
    exec: ['npx'],              // npx <cmd>
    install: ['npm', 'install'],
    test: ['npm', 'test'],
    build: ['npm', 'run', 'build']
  }
};

/**
 * Read package.json from a directory
 * @param {string} projectDir - Project directory
 * @returns {Object|null} Parsed package.json or null
 */
function readPackageJson(projectDir) {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const content = readFileSafe(packageJsonPath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Read Claude package manager config
 * @param {string} configPath - Path to config file
 * @returns {string|null} Package manager name or null
 */
function readPackageManagerConfig(configPath) {
  const content = readFileSafe(configPath);
  if (!content) return null;
  try {
    const config = JSON.parse(content);
    return config.packageManager || null;
  } catch {
    return null;
  }
}

/**
 * Detect package manager from lock files in project directory
 * Uses 6-layer detection priority
 * @param {string} projectDir - Project directory (default: cwd)
 * @returns {string|null} Package manager name or null
 */
function detectPackageManager(projectDir = process.cwd()) {
  // Priority 1: CLAUDE_PACKAGE_MANAGER environment variable
  const envPm = process.env.CLAUDE_PACKAGE_MANAGER;
  if (envPm && PACKAGE_MANAGERS[envPm]) {
    if (commandExists(PACKAGE_MANAGERS[envPm].command)) {
      return envPm;
    }
    // Env var set but command not available - fall through
  }

  // Priority 2: Project .claude/package-manager.json
  const projectConfig = path.join(projectDir, '.claude', 'package-manager.json');
  const projectPm = readPackageManagerConfig(projectConfig);
  if (projectPm && PACKAGE_MANAGERS[projectPm] && commandExists(PACKAGE_MANAGERS[projectPm].command)) {
    return projectPm;
  }

  // Priority 3: package.json packageManager field
  const packageJson = readPackageJson(projectDir);
  if (packageJson && packageJson.packageManager) {
    // Format is "pnpm@8.0.0" or just "pnpm"
    const pmName = packageJson.packageManager.split('@')[0];
    if (PACKAGE_MANAGERS[pmName] && commandExists(PACKAGE_MANAGERS[pmName].command)) {
      return pmName;
    }
  }

  // Priority 4: Check lock files in order of specificity (pnpm/yarn/bun before npm)
  for (const [name, config] of Object.entries(PACKAGE_MANAGERS)) {
    const lockPath = path.join(projectDir, config.lockFile);
    if (fileExists(lockPath)) {
      // Also verify the command is available
      if (commandExists(config.command)) {
        return name;
      }
    }
  }

  // Priority 5: Global ~/.claude/package-manager.json
  const os = require('os');
  const globalConfig = path.join(os.homedir(), '.claude', 'package-manager.json');
  const globalPm = readPackageManagerConfig(globalConfig);
  if (globalPm && PACKAGE_MANAGERS[globalPm] && commandExists(PACKAGE_MANAGERS[globalPm].command)) {
    return globalPm;
  }

  // Priority 6: Fallback - check if package.json exists, use npm if available
  const packageJsonPath = path.join(projectDir, 'package.json');
  if (fileExists(packageJsonPath) && commandExists('npm')) {
    return 'npm';
  }

  return null;
}

/**
 * Get commands for a specific package manager
 * Returns the package manager config or null
 */
function getPackageManagerCommands(pmName) {
  return PACKAGE_MANAGERS[pmName] || null;
}

/**
 * Get the command array to run a script
 * e.g., getPmRunCommand('prettier', 'pnpm') => ['pnpm', 'prettier']
 */
function getPmRunCommand(script, pmName) {
  const commands = getPackageManagerCommands(pmName);
  if (!commands) return null;
  return [...commands.run, script];
}

/**
 * Get the command array to execute a binary
 * e.g., getPmExecCommand('prettier', 'npm') => ['npx', 'prettier']
 */
function getPmExecCommand(binary, pmName) {
  const commands = getPackageManagerCommands(pmName);
  if (!commands) return null;
  return [...commands.exec, binary];
}

/**
 * Get run command string for a specific action
 * @param {string} action - Action name (test, build, etc.)
 * @param {Object} options - Options
 * @param {string} options.projectDir - Project directory
 * @returns {string} Command string (e.g., 'pnpm test')
 */
function getRunCommand(action, options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const pmName = detectPackageManager(projectDir);
  if (!pmName) {
    throw new Error('Cannot detect package manager');
  }
  const commands = PACKAGE_MANAGERS[pmName];
  if (commands[action]) {
    return commands[action].join(' ');
  }
  // Fallback to run command
  return [...commands.run, action].join(' ');
}

/**
 * Check if project has a package in dependencies or devDependencies
 */
function hasDependency(packageName, projectDir = process.cwd()) {
  const packageJson = readPackageJson(projectDir);
  if (!packageJson) return false;
  return packageName in (packageJson.devDependencies || {}) ||
         packageName in (packageJson.dependencies || {});
}

/**
 * Check if project has a specific script
 */
function hasScript(scriptName, projectDir = process.cwd()) {
  const packageJson = readPackageJson(projectDir);
  if (!packageJson) return false;
  const scripts = packageJson.scripts || {};
  return scriptName in scripts;
}

/**
 * Get all available scripts from package.json
 */
function getScripts(projectDir = process.cwd()) {
  const packageJson = readPackageJson(projectDir);
  if (!packageJson) return {};
  return packageJson.scripts || {};
}

/**
 * Check if project has a package.json
 */
function hasPackageJson(projectDir = process.cwd()) {
  return fileExists(path.join(projectDir, 'package.json'));
}

/**
 * Check if project has a pyproject.toml (Python project)
 */
function hasPyprojectToml(projectDir = process.cwd()) {
  return fileExists(path.join(projectDir, 'pyproject.toml'));
}

/**
 * Get default test command for a project
 * Auto-detects project type (Node.js or Python)
 * @param {string} projectDir - Project directory
 * @returns {string[]} Command array
 */
function getDefaultTestCommand(projectDir = process.cwd()) {
  if (hasPackageJson(projectDir)) {
    const pmName = detectPackageManager(projectDir);
    if (pmName) {
      return PACKAGE_MANAGERS[pmName].test;
    }
    return ['npm', 'test'];
  }
  if (hasPyprojectToml(projectDir)) {
    return ['pytest', 'tests/', '-v'];
  }
  throw new Error('Cannot detect project type for test command');
}

module.exports = {
  PACKAGE_MANAGERS,
  detectPackageManager,
  getPackageManagerCommands,
  getPmRunCommand,
  getPmExecCommand,
  getRunCommand,
  hasDependency,
  hasDevDependency: hasDependency, // Alias for backwards compatibility
  hasScript,
  getScripts,
  hasPackageJson,
  hasPyprojectToml,
  getDefaultTestCommand,
  readPackageJson
};
