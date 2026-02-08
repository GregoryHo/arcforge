/**
 * coordinator.js - Core coordinator for arcforge DAG
 *
 * Manages the DAG lifecycle: task scheduling, status tracking,
 * worktree management, and synchronization.
 *
 * Mirrors Python coordinator.py functionality.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DAG, Epic, Feature, BlockedItem, SyncResult, TaskStatus } = require('./models');
const { parseDagYaml, stringifyDagYaml } = require('./yaml-parser');
const { withLock } = require('./locking');
const { getDefaultTestCommand } = require('./package-manager');
const { objectToYaml } = require('./dag-schema');

/**
 * Coordinator class - manages DAG operations
 */
class Coordinator {
  /**
   * @param {string} projectRoot - Project root directory
   */
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot);
    this.dagPath = path.join(this.projectRoot, 'dag.yaml');
    this._dag = null;
  }

  /**
   * Get the DAG, loading from file if needed
   * @returns {DAG} The DAG instance
   */
  get dag() {
    if (this._dag === null) {
      this._dag = this._loadDag();
    }
    return this._dag;
  }

  /**
   * Get status of all epics and blocked items
   * @param {Object} options - Status options
   * @param {boolean} [options.blockedOnly=false] - Only show blocked items
   * @returns {Object} Status object
   */
  status(options = {}) {
    const { blockedOnly = false } = options;

    const epics = [];
    for (const epic of this.dag.epics) {
      if (blockedOnly && epic.status !== TaskStatus.BLOCKED) {
        continue;
      }
      epics.push({
        id: epic.id,
        name: epic.name,
        status: epic.status,
        progress: epic.completionRatio(),
        worktree: epic.worktree,
        features: epic.features.map(f => ({
          id: f.id,
          name: f.name,
          status: f.status
        }))
      });
    }

    return {
      epics,
      blocked: this.dag.blocked.map(b => ({
        task_id: b.task_id,
        reason: b.reason
      }))
    };
  }

  /**
   * Get the next task to work on
   * Priority: in-progress feature > ready feature > ready epic
   * @returns {Feature|Epic|null} The next task or null
   */
  nextTask() {
    const completedEpics = this.dag.getCompletedEpics();

    // First, check for in-progress features
    for (const epic of this.dag.epics) {
      if (epic.status === TaskStatus.IN_PROGRESS) {
        for (const feature of epic.features) {
          if (feature.status === TaskStatus.IN_PROGRESS) {
            return feature;
          }
        }
      }
    }

    // Second, check for ready features in in-progress epics
    for (const epic of this.dag.epics) {
      if (epic.status === TaskStatus.IN_PROGRESS) {
        const completedFeatures = this.dag.getCompletedFeatures(epic.id);
        for (const feature of epic.features) {
          if (feature.status === TaskStatus.PENDING && feature.isReady(completedFeatures)) {
            return feature;
          }
        }
      }
    }

    // Third, check for ready epics
    for (const epic of this.dag.epics) {
      if (epic.status === TaskStatus.PENDING && epic.isReady(completedEpics)) {
        return epic;
      }
    }

    return null;
  }

  /**
   * Get all epics that can be worked on in parallel
   * @returns {Epic[]} List of ready epics
   */
  parallelTasks() {
    const completedEpics = this.dag.getCompletedEpics();
    return this.dag.epics.filter(
      epic => epic.status === TaskStatus.PENDING && epic.isReady(completedEpics)
    );
  }

  /**
   * Mark a task as completed
   * @param {string} taskId - Task ID to complete
   */
  completeTask(taskId) {
    const task = this.dag.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = TaskStatus.COMPLETED;

    // If feature, check if epic is now complete
    if (task instanceof Feature) {
      for (const epic of this.dag.epics) {
        if (epic.features.some(f => f.id === taskId)) {
          if (epic.features.every(f => f.status === TaskStatus.COMPLETED)) {
            epic.status = TaskStatus.COMPLETED;
          }
          break;
        }
      }
    }

    this._saveDag();
  }

  /**
   * Mark a task as blocked
   * @param {string} taskId - Task ID to block
   * @param {string} reason - Reason for blocking
   */
  blockTask(taskId, reason) {
    const task = this.dag.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = TaskStatus.BLOCKED;
    this.dag.blocked.push(new BlockedItem({
      task_id: taskId,
      reason: reason,
      blocked_at: new Date()
    }));
    this._saveDag();
  }

  /**
   * Get newly available tasks after completing a task
   * @param {string} completedTaskId - The just-completed task ID
   * @returns {(Feature|Epic)[]} List of newly available tasks
   */
  getNewlyAvailable(completedTaskId) {
    const available = [];
    const completedEpics = this.dag.getCompletedEpics();

    // Check for ready epics
    for (const epic of this.dag.epics) {
      if (epic.status === TaskStatus.PENDING && epic.isReady(completedEpics)) {
        available.push(epic);
      }
    }

    // Check for ready features in in-progress epics
    for (const epic of this.dag.epics) {
      if (epic.status === TaskStatus.IN_PROGRESS) {
        const completedFeatures = this.dag.getCompletedFeatures(epic.id);
        for (const feature of epic.features) {
          if (
            feature.status === TaskStatus.PENDING &&
            feature.isReady(completedFeatures) &&
            feature.depends_on.includes(completedTaskId)
          ) {
            available.push(feature);
          }
        }
      }
    }

    return available;
  }

  /**
   * Expand worktrees for ready epics
   * @param {Object} options - Expand options
   * @param {boolean} [options.verify=false] - Run tests after creation
   * @param {string[]} [options.verifyCommand] - Custom test command
   * @returns {Epic[]} List of epics with newly created worktrees
   */
  expandWorktrees(options = {}) {
    const { verify = false, verifyCommand } = options;

    const completedEpics = this.dag.getCompletedEpics();
    const readyEpics = this.dag.epics.filter(
      epic => epic.status === TaskStatus.PENDING && epic.isReady(completedEpics)
    );

    const created = [];
    const createdPaths = [];

    if (readyEpics.length === 0) {
      return created;
    }

    this._ensureWorktreesIgnored();
    const worktreesDir = path.join(this.projectRoot, '.worktrees');
    fs.mkdirSync(worktreesDir, { recursive: true });

    for (const epic of readyEpics) {
      if (epic.worktree) {
        continue;
      }

      const worktreePath = path.join(worktreesDir, epic.id);
      const result = this._runGit(['worktree', 'add', worktreePath, '-b', epic.id]);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to create worktree for ${epic.id}: ${result.stderr.trim()}`);
      }

      fs.mkdirSync(worktreePath, { recursive: true });

      // Create .arcforge-epic marker
      const epicData = {
        epic: epic.id,
        base_worktree: this.projectRoot,
        base_branch: this._currentBranch(),
        local: {
          status: TaskStatus.IN_PROGRESS,
          started_at: new Date().toISOString()
        },
        synced: null
      };
      fs.writeFileSync(
        path.join(worktreePath, '.arcforge-epic'),
        objectToYaml(epicData)
      );

      epic.worktree = path.join('.worktrees', epic.id);
      epic.status = TaskStatus.IN_PROGRESS;
      created.push(epic);
      createdPaths.push({ epic, worktreePath });
    }

    if (created.length > 0) {
      this._saveDag();
    }

    // Verify with tests if requested
    if (verify) {
      const command = verifyCommand || getDefaultTestCommand(this.projectRoot);
      for (const { epic, worktreePath } of createdPaths) {
        const result = this._runTestCommand(worktreePath, command);
        if (result.exitCode !== 0) {
          const output = (result.stdout || '') + (result.stderr || '');
          throw new Error(`Baseline tests failed for ${epic.id}:\n${output.trim()}`);
        }
      }
    }

    return created;
  }

  /**
   * Merge completed epics back to base branch
   * @param {Object} options - Merge options
   * @param {string} [options.baseBranch] - Target branch (default: current)
   * @param {string[]} [options.epicIds] - Specific epic IDs to merge
   * @returns {Epic[]} List of merged epics
   */
  mergeEpics(options = {}) {
    const { baseBranch, epicIds } = options;

    // Try to infer epic ID if in worktree
    let resolvedEpicIds = epicIds;
    const inferredEpic = this._inferEpicIdFromWorktree();
    if (!resolvedEpicIds && inferredEpic) {
      resolvedEpicIds = [inferredEpic];
    }

    // Find base worktree
    const basePath = this._findBaseWorktree();
    if (!basePath) {
      throw new Error('Base worktree not found via git worktree list');
    }

    // If not in base, delegate to base coordinator
    if (basePath !== this.projectRoot) {
      const baseCoord = new Coordinator(basePath);
      return baseCoord._mergeEpicsInBase(baseBranch, resolvedEpicIds);
    }

    return this._mergeEpicsInBase(baseBranch, resolvedEpicIds);
  }

  _mergeEpicsInBase(baseBranch, epicIds) {
    let epics;
    if (epicIds) {
      epics = this.dag.epics.filter(e => epicIds.includes(e.id));
      const missing = epicIds.filter(id => !epics.some(e => e.id === id));
      if (missing.length > 0) {
        throw new Error(`Epic not found: ${missing.join(', ')}`);
      }
    } else {
      epics = this.dag.epics.filter(e => e.status === TaskStatus.COMPLETED);
    }

    if (epics.length === 0) {
      return [];
    }

    const resolvedBranch = baseBranch || this._currentBranch();
    const checkout = this._runGit(['checkout', resolvedBranch]);
    if (checkout.exitCode !== 0) {
      throw new Error(`Failed to checkout ${resolvedBranch}: ${checkout.stderr.trim()}`);
    }

    const merged = [];
    for (const epic of epics) {
      const result = this._runGit([
        'merge', '--no-ff', epic.id,
        '-m', `feat: integrate ${epic.id} epic`
      ]);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to merge ${epic.id}: ${result.stderr.trim()}`);
      }
      epic.status = TaskStatus.COMPLETED;
      merged.push(epic);
    }

    if (merged.length > 0) {
      this._saveDag();
    }

    return merged;
  }

  /**
   * Clean up worktrees for completed epics
   * @param {Object} options - Cleanup options
   * @param {string[]} [options.epicIds] - Specific epic IDs to clean
   * @returns {string[]} List of removed worktree paths
   */
  cleanupWorktrees(options = {}) {
    const { epicIds } = options;

    let epics;
    if (epicIds) {
      epics = this.dag.epics.filter(e => epicIds.includes(e.id));
      const missing = epicIds.filter(id => !epics.some(e => e.id === id));
      if (missing.length > 0) {
        throw new Error(`Epic not found: ${missing.join(', ')}`);
      }
    } else {
      epics = this.dag.epics.filter(e => e.status === TaskStatus.COMPLETED);
    }

    const removed = [];
    for (const epic of epics) {
      if (!epic.worktree) {
        continue;
      }

      const worktreePath = this._resolveWorktreePath(epic.worktree);
      const result = this._runGit(['worktree', 'remove', worktreePath]);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to remove worktree for ${epic.id}: ${result.stderr.trim()}`);
      }

      // Force remove if still exists
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }

      removed.push(worktreePath);
      epic.worktree = null;
    }

    if (removed.length > 0) {
      this._saveDag();
    }

    return removed;
  }

  /**
   * Reboot context - get summary for new session
   * @returns {Object} Context summary
   */
  rebootContext() {
    let completed = 0;
    let remaining = 0;

    for (const epic of this.dag.epics) {
      for (const feature of epic.features) {
        if (feature.status === TaskStatus.COMPLETED) {
          completed++;
        } else {
          remaining++;
        }
      }
    }

    return {
      current_task: null,
      remaining_count: remaining,
      completed_count: completed,
      blocked_count: this.dag.blocked.length,
      project_goal: 'Build a skill-based autonomous agent pipeline system',
      research_files: []
    };
  }

  /**
   * Synchronize state between worktree and base DAG
   * @param {Object} options - Sync options
   * @param {string} [options.direction] - 'from_base', 'to_base', 'both', 'scan'
   * @returns {SyncResult} Sync result
   */
  sync(options = {}) {
    let { direction } = options;

    // Auto-detect direction
    if (!direction) {
      direction = this._isInWorktree() ? 'both' : 'scan';
    }

    if (this._isInWorktree()) {
      if (direction === 'scan') {
        throw new Error(
          'Cannot use --direction scan in worktree. ' +
          'Use --direction from-base, to-base, or both (or omit for auto-detect).'
        );
      }
      return this._syncWorktree(direction);
    } else {
      if (['from_base', 'to_base', 'both'].includes(direction)) {
        throw new Error(
          'Cannot use --direction from-base/to-base/both in base project. ' +
          "Run 'arcforge sync' without --direction to scan all worktrees."
        );
      }
      return this._syncBase();
    }
  }

  _syncWorktree(direction) {
    const epicFile = this._readAgenticEpic();
    const basePath = this._findBaseWorktree();
    if (!basePath) {
      throw new Error('Cannot find base worktree');
    }

    const result = new SyncResult({ epic_id: epicFile.epic });

    if (direction === 'from_base' || direction === 'both') {
      const baseCoord = new Coordinator(basePath);
      const dagEpic = baseCoord.dag.getEpic(epicFile.epic);
      if (dagEpic) {
        epicFile.synced = {
          last_sync: new Date().toISOString(),
          dependencies: this._getDependencyStatuses(baseCoord.dag, dagEpic),
          dependents: this._getDependents(baseCoord.dag, dagEpic),
          blocked_by: this._getBlockedBy(baseCoord.dag, dagEpic),
          dag_status: dagEpic.status
        };
        result.blocked_by = epicFile.synced.blocked_by;
        result.dependents = epicFile.synced.dependents;
        result.pulled = true;
      }
    }

    if (direction === 'to_base' || direction === 'both') {
      const baseCoord = new Coordinator(basePath);
      const local = epicFile.local || {};
      if (local.status) {
        const dagEpic = baseCoord.dag.getEpic(epicFile.epic);
        if (dagEpic && local.status !== dagEpic.status) {
          dagEpic.status = local.status;
          baseCoord._saveDag();
          result.pushed = true;
        }
      }
    }

    this._writeAgenticEpic(epicFile);
    return result;
  }

  _syncBase() {
    const worktreesDir = path.join(this.projectRoot, '.worktrees');
    if (!fs.existsSync(worktreesDir)) {
      return new SyncResult({ scanned: 0 });
    }

    const result = new SyncResult({ scanned: 0, updates: [] });

    const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const worktreePath = path.join(worktreesDir, entry.name);
      const epicFilePath = path.join(worktreePath, '.arcforge-epic');
      if (!fs.existsSync(epicFilePath)) continue;

      const epicData = this._readAgenticEpic(epicFilePath);
      const local = epicData.local || {};

      const dagEpic = this.dag.getEpic(epicData.epic);
      if (dagEpic && local.status) {
        const oldStatus = dagEpic.status;
        if (local.status !== oldStatus) {
          dagEpic.status = local.status;
          result.updates.push({
            epic: epicData.epic,
            old_status: oldStatus,
            new_status: local.status
          });
        }
      }

      result.scanned++;
    }

    if (result.updates.length > 0) {
      this._saveDag();
    }

    return result;
  }

  _getDependencyStatuses(dag, epic) {
    const statuses = {};
    for (const depId of epic.depends_on) {
      const depEpic = dag.getEpic(depId);
      if (depEpic) {
        statuses[depId] = depEpic.status;
      }
    }
    return statuses;
  }

  _getBlockedBy(dag, epic) {
    return epic.depends_on.filter(depId => {
      const depEpic = dag.getEpic(depId);
      return depEpic && depEpic.status !== TaskStatus.COMPLETED;
    });
  }

  _getDependents(dag, epic) {
    return dag.epics
      .filter(e => e.depends_on.includes(epic.id))
      .map(e => e.id);
  }

  // ==================== Private Methods ====================

  _runGit(args, cwd = null) {
    const workdir = cwd || this.projectRoot;
    try {
      const stdout = execFileSync('git', args, {
        cwd: workdir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.status || 1
      };
    }
  }

  _runTestCommand(workdir, command) {
    try {
      const [cmd, ...args] = Array.isArray(command) ? command : command.split(' ');
      const stdout = execFileSync(cmd, args, {
        cwd: workdir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.status || 1
      };
    }
  }

  _resolveWorktreePath(worktreePath) {
    if (path.isAbsolute(worktreePath)) {
      return worktreePath;
    }
    return path.join(this.projectRoot, worktreePath);
  }

  _inferEpicIdFromWorktree() {
    const marker = path.join(this.projectRoot, '.arcforge-epic');
    if (!fs.existsSync(marker)) {
      return null;
    }
    const content = fs.readFileSync(marker, 'utf8');
    const data = parseDagYaml(content);
    return data.epic || null;
  }

  _isInWorktree() {
    return fs.existsSync(path.join(this.projectRoot, '.arcforge-epic'));
  }

  _writeAgenticEpic(data) {
    const filePath = path.join(this.projectRoot, '.arcforge-epic');
    fs.writeFileSync(filePath, objectToYaml(data));
  }

  _readAgenticEpic(filePath = null) {
    const target = filePath || path.join(this.projectRoot, '.arcforge-epic');
    const content = fs.readFileSync(target, 'utf8');
    return parseDagYaml(content);
  }

  _findBaseWorktree() {
    const result = this._runGit(['worktree', 'list', '--porcelain']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list worktrees: ${result.stderr.trim()}`);
    }

    const paths = [];
    for (const line of result.stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        paths.push(line.slice(9));
      }
    }

    // Find path not in .worktrees
    for (const p of paths) {
      if (!p.includes('.worktrees')) {
        return p;
      }
    }
    return null;
  }

  _currentBranch() {
    const result = this._runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to detect base branch: ${result.stderr.trim()}`);
    }
    const branch = result.stdout.trim();
    if (!branch || branch === 'HEAD') {
      throw new Error('Base branch could not be inferred from git');
    }
    return branch;
  }

  _ensureWorktreesIgnored() {
    const result = this._runGit(['check-ignore', '-q', '.worktrees']);
    if (result.exitCode === 0) {
      return; // Already ignored
    }

    const ignorePath = path.join(this.projectRoot, '.gitignore');
    let lines = [];
    if (fs.existsSync(ignorePath)) {
      lines = fs.readFileSync(ignorePath, 'utf8').split('\n');
    }

    if (!lines.includes('.worktrees')) {
      lines.push('.worktrees');
      fs.writeFileSync(ignorePath, lines.join('\n') + '\n');

      const addResult = this._runGit(['add', '.gitignore']);
      if (addResult.exitCode !== 0) {
        throw new Error(`Failed to stage .gitignore: ${addResult.stderr.trim()}`);
      }

      const commitResult = this._runGit(['commit', '-m', 'chore: ignore .worktrees directory']);
      if (commitResult.exitCode !== 0) {
        throw new Error(`Failed to commit .gitignore: ${commitResult.stderr.trim()}`);
      }
    }
  }

  _loadDag() {
    if (!fs.existsSync(this.dagPath)) {
      throw new Error(`dag.yaml not found at ${this.dagPath}`);
    }
    const content = fs.readFileSync(this.dagPath, 'utf8');
    const data = parseDagYaml(content);
    return DAG.fromObject(data);
  }

  _saveDag() {
    withLock(this.projectRoot, () => {
      const content = stringifyDagYaml(this.dag.toObject());
      fs.writeFileSync(this.dagPath, content);
    });
  }
}

module.exports = { Coordinator };
