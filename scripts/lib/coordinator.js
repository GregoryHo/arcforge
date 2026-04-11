/**
 * coordinator.js - Core coordinator for arcforge DAG
 *
 * Manages the DAG lifecycle: task scheduling, status tracking,
 * worktree management, and synchronization.
 *
 * Mirrors Python coordinator.py functionality.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DAG, Feature, BlockedItem, SyncResult, TaskStatus } = require('./models');
const { parseDagYaml, stringifyDagYaml } = require('./yaml-parser');
const { withLock } = require('./locking');
const { getDefaultTestCommand, getDefaultInstallCommand } = require('./package-manager');
const { objectToYaml } = require('./dag-schema');
const { getWorktreeRoot, getWorktreePath, parseWorktreePath } = require('./worktree-paths');

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
        features: epic.features.map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
        })),
      });
    }

    return {
      epics,
      blocked: this.dag.blocked.map((b) => ({
        task_id: b.task_id,
        reason: b.reason,
      })),
    };
  }

  /**
   * Get the next task to work on
   * Priority: in-progress feature > ready feature > ready epic
   * @returns {Feature|Epic|null} The next task or null
   */
  nextTask(epicId = null) {
    const completedEpics = this.dag.getCompletedEpics();
    const epics = epicId ? this.dag.epics.filter((e) => e.id === epicId) : this.dag.epics;

    // First, check for in-progress features
    for (const epic of epics) {
      if (epic.status === TaskStatus.IN_PROGRESS) {
        for (const feature of epic.features) {
          if (feature.status === TaskStatus.IN_PROGRESS) {
            return feature;
          }
        }
      }
    }

    // Second, check for ready features in in-progress epics
    for (const epic of epics) {
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
    for (const epic of epics) {
      if (epic.status === TaskStatus.PENDING && epic.isReady(completedEpics)) {
        return epic;
      }
    }

    return null;
  }

  /**
   * Get all epics that can be worked on in parallel
   * @param {string|null} [epicId=null] - If set, only consider this epic
   * @returns {Epic[]} List of ready epics
   */
  parallelTasks(epicId = null) {
    const completedEpics = this.dag.getCompletedEpics();
    return this.dag.epics.filter(
      (epic) =>
        epic.status === TaskStatus.PENDING &&
        epic.isReady(completedEpics) &&
        (epicId === null || epic.id === epicId),
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

    // If feature, update parent epic status
    if (task instanceof Feature) {
      for (const epic of this.dag.epics) {
        if (epic.features.some((f) => f.id === taskId)) {
          if (epic.features.every((f) => f.status === TaskStatus.COMPLETED)) {
            epic.status = TaskStatus.COMPLETED;
          } else if (epic.status === TaskStatus.PENDING) {
            epic.status = TaskStatus.IN_PROGRESS;
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
    this.dag.blocked.push(
      new BlockedItem({
        task_id: taskId,
        reason: reason,
        blocked_at: new Date(),
      }),
    );
    this._saveDag();
  }

  /**
   * Expand worktrees for ready epics, or a single epic when epicId is supplied.
   *
   * Worktrees are created at the canonical location computed by
   * worktree-paths.js (~/.arcforge-worktrees/<project>-<hash>-<epic>/).
   *
   * @param {Object} options - Expand options
   * @param {string} [options.epicId] - Single-epic mode: only expand this epic
   * @param {boolean} [options.verify=false] - Run tests after creation
   * @param {string[]} [options.verifyCommand] - Custom test command
   * @param {boolean} [options.projectSetup=false] - Auto-detect and run installer
   * @returns {Epic[]} List of epics with newly created worktrees
   */
  expandWorktrees(options = {}) {
    const { epicId, verify = false, verifyCommand, projectSetup = false } = options;

    // Phase 1: DAG mutation + worktree creation under a single lock.
    // Two concurrent expansions on different epics would otherwise race:
    // both load the dag, both set their own epic.worktree/epic.status,
    // and the second save clobbers the first. Same pattern as the merge
    // race fixed in the previous commit.
    const { created, createdPaths } = this._dagTransaction(
      () => {
        const completedEpics = this.dag.getCompletedEpics();

        let readyEpics;
        if (epicId) {
          const epic = this.dag.getEpic(epicId);
          if (!epic) {
            throw new Error(`Epic not found: ${epicId}`);
          }
          if (epic.status !== TaskStatus.PENDING || !epic.isReady(completedEpics)) {
            const blocking = epic.depends_on.filter((depId) => !completedEpics.has(depId));
            const reason = blocking.length
              ? `waiting on ${blocking.join(', ')}`
              : `status is ${epic.status}`;
            throw new Error(`Epic ${epicId} is not ready to expand: ${reason}`);
          }
          readyEpics = [epic];
        } else {
          readyEpics = this.dag.epics.filter(
            (e) => e.status === TaskStatus.PENDING && e.isReady(completedEpics),
          );
        }

        const createdLocal = [];
        const createdPathsLocal = [];

        if (readyEpics.length === 0) {
          return { created: createdLocal, createdPaths: createdPathsLocal };
        }

        fs.mkdirSync(getWorktreeRoot(), { recursive: true });

        for (const epic of readyEpics) {
          if (epic.worktree) {
            continue;
          }

          const worktreePath = getWorktreePath(this.projectRoot, epic.id);
          const result = this._runGit(['worktree', 'add', worktreePath, '-b', epic.id]);
          if (result.exitCode !== 0) {
            throw new Error(`Failed to create worktree for ${epic.id}: ${result.stderr.trim()}`);
          }

          // Create .arcforge-epic marker
          const epicData = {
            epic: epic.id,
            base_worktree: this.projectRoot,
            base_branch: this._currentBranch(),
            local: {
              status: TaskStatus.IN_PROGRESS,
              started_at: new Date().toISOString(),
            },
            synced: null,
          };
          fs.writeFileSync(path.join(worktreePath, '.arcforge-epic'), objectToYaml(epicData));

          epic.worktree = epic.id;
          epic.status = TaskStatus.IN_PROGRESS;
          createdLocal.push(epic);
          createdPathsLocal.push({ epic, worktreePath });
        }

        return { created: createdLocal, createdPaths: createdPathsLocal };
      },
      { timeout: 30000 },
    );

    // Phase 2: long-running project setup / test verification OUTSIDE
    // the lock. `npm install` and full test suites can take minutes;
    // holding the DAG lock across them would block every concurrent
    // dispatch operation (merge, sync, expand) for the full duration.
    if (projectSetup) {
      for (const { epic, worktreePath } of createdPaths) {
        const installCmd = getDefaultInstallCommand(worktreePath);
        if (!installCmd) continue;
        const setupResult = this._runSubprocess(worktreePath, installCmd);
        if (setupResult.exitCode !== 0) {
          throw new Error(
            `Project setup failed for ${epic.id} (see output above). Command: ${installCmd.join(' ')}`,
          );
        }
      }
    }

    // Verify with tests if requested
    if (verify) {
      const command = verifyCommand || getDefaultTestCommand(this.projectRoot);
      for (const { epic, worktreePath } of createdPaths) {
        const result = this._runSubprocess(worktreePath, command);
        if (result.exitCode !== 0) {
          throw new Error(
            `Baseline tests failed for ${epic.id} (see output above). Command: ${(Array.isArray(command) ? command : [command]).join(' ')}`,
          );
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
    // Serialize the whole read-merge-write under one lock. Git ops can
    // take several seconds on large repos, so bump the lock timeout
    // beyond the 5s default — concurrent teammates will queue cleanly.
    return this._dagTransaction(
      () => {
        let epics;
        if (epicIds) {
          epics = this.dag.epics.filter((e) => epicIds.includes(e.id));
          const missing = epicIds.filter((id) => !epics.some((e) => e.id === id));
          if (missing.length > 0) {
            throw new Error(`Epic not found: ${missing.join(', ')}`);
          }
        } else {
          epics = this.dag.epics.filter((e) => e.status === TaskStatus.COMPLETED);
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
            'merge',
            '--no-ff',
            epic.id,
            '-m',
            `feat: integrate ${epic.id} epic`,
          ]);
          if (result.exitCode !== 0) {
            throw new Error(`Failed to merge ${epic.id}: ${result.stderr.trim()}`);
          }
          epic.status = TaskStatus.COMPLETED;
          merged.push(epic);
        }

        return merged;
      },
      { timeout: 60000 },
    );
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
      epics = this.dag.epics.filter((e) => epicIds.includes(e.id));
      const missing = epicIds.filter((id) => !epics.some((e) => e.id === id));
      if (missing.length > 0) {
        throw new Error(`Epic not found: ${missing.join(', ')}`);
      }
    } else {
      epics = this.dag.epics.filter((e) => e.status === TaskStatus.COMPLETED);
    }

    // Remove the directories directly, then prune git's registry once.
    // `git worktree remove` refuses on the untracked `.arcforge-epic` marker
    // we authored, and `--force` per-epic plus a fallback was fragile. A
    // filesystem remove + single `git worktree prune` is cheaper (O(1) git
    // invocations instead of N) and has the same net effect on git state.
    const removed = [];
    for (const epic of epics) {
      if (!epic.worktree) continue;
      const worktreePath = this._resolveWorktreePath(epic.worktree);
      fs.rmSync(worktreePath, { recursive: true, force: true });
      removed.push(worktreePath);
      epic.worktree = null;
    }

    if (removed.length > 0) {
      const pruneResult = this._runGit(['worktree', 'prune']);
      if (pruneResult.exitCode !== 0) {
        throw new Error(`git worktree prune failed: ${pruneResult.stderr.trim()}`);
      }
      this._saveDag();
    }

    return removed;
  }

  /**
   * Build a self-contained task context for spawned sessions (e.g., autonomous loops).
   * @param {string} taskId - Task ID to build context for
   * @returns {Object} Task context
   */
  taskContext(taskId) {
    const task = this.dag.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const context = {
      task_id: task.id,
      task_name: task.name,
      task_type: task instanceof Feature ? 'feature' : 'epic',
      status: task.status,
      project_root: this.projectRoot,
    };

    if (task.depends_on && task.depends_on.length > 0) {
      context.dependencies = task.depends_on.map((depId) => {
        const dep = this.dag.getTask(depId);
        return {
          id: depId,
          name: dep ? dep.name : depId,
          status: dep ? dep.status : TaskStatus.BLOCKED,
        };
      });
    }

    const parentEpic = this.dag.findEpicByFeature(taskId);
    if (parentEpic) {
      context.parent_epic = {
        id: parentEpic.id,
        name: parentEpic.name,
        progress: parentEpic.completionRatio(),
      };
      context.sibling_tasks = parentEpic.features.map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status,
      }));
    }

    return context;
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
      project_goal: 'Build a skill-based autonomous agent toolkit',
      research_files: [],
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
            'Use --direction from-base, to-base, or both (or omit for auto-detect).',
        );
      }
      return this._syncWorktree(direction);
    } else {
      if (['from_base', 'to_base', 'both'].includes(direction)) {
        throw new Error(
          'Cannot use --direction from-base/to-base/both in base project. ' +
            "Run 'arcforge sync' without --direction to scan all worktrees.",
        );
      }
      return this._syncBase();
    }
  }

  /**
   * Pull epic statuses from the base DAG into the local dag.yaml.
   * No-op when not in a worktree or when base is unreachable.
   * @returns {boolean} Whether any statuses were updated
   */
  syncEpicStatusesFromBase() {
    if (!this._isInWorktree()) return false;

    const basePath = this._findBaseWorktree();
    if (!basePath) return false;

    const baseCoord = new Coordinator(basePath);

    return this._dagTransaction(() => {
      let updated = false;
      for (const localEpic of this.dag.epics) {
        const baseEpic = baseCoord.dag.getEpic(localEpic.id);
        if (baseEpic && baseEpic.status !== localEpic.status) {
          localEpic.status = baseEpic.status;
          updated = true;
        }
      }
      return updated;
    });
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
          dag_status: dagEpic.status,
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
        // Resolve the target epic inside the base's transaction so we
        // act on the fresh-loaded state, not the pre-transaction cache.
        const pushed = baseCoord._dagTransaction(() => {
          const dagEpic = baseCoord.dag.getEpic(epicFile.epic);
          if (dagEpic && local.status !== dagEpic.status) {
            dagEpic.status = local.status;
            return true;
          }
          return false;
        });
        if (pushed) result.pushed = true;
      }
    }

    this._writeAgenticEpic(epicFile);
    return result;
  }

  _syncBase() {
    return this._dagTransaction(() => {
      const result = new SyncResult({ scanned: 0, updates: [] });

      // Only scan worktrees that belong to this project, keyed by the path hash.
      for (const epic of this.dag.epics) {
        if (!epic.worktree) continue;

        const worktreePath = this._resolveWorktreePath(epic.worktree);
        const epicFilePath = path.join(worktreePath, '.arcforge-epic');
        if (!fs.existsSync(epicFilePath)) continue;

        const epicData = this._readAgenticEpic(epicFilePath);
        const local = epicData.local || {};

        if (local.status) {
          const oldStatus = epic.status;
          if (local.status !== oldStatus) {
            epic.status = local.status;
            result.updates.push({
              epic: epicData.epic,
              old_status: oldStatus,
              new_status: local.status,
            });
          }
        }

        result.scanned++;
      }

      return result;
    });
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
    return epic.depends_on.filter((depId) => {
      const depEpic = dag.getEpic(depId);
      return depEpic && depEpic.status !== TaskStatus.COMPLETED;
    });
  }

  _getDependents(dag, epic) {
    return dag.epics.filter((e) => e.depends_on.includes(epic.id)).map((e) => e.id);
  }

  // ==================== Private Methods ====================

  _runGit(args, cwd = null) {
    const workdir = cwd || this.projectRoot;
    try {
      const stdout = execFileSync('git', args, {
        cwd: workdir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.status || 1,
      };
    }
  }

  _runSubprocess(workdir, command) {
    // stdio: 'inherit' streams install/test output directly to the parent
    // terminal. This avoids execFileSync's default 1 MB maxBuffer, which
    // `npm install` / `cargo build` can exceed and incorrectly report as
    // ENOBUFS even on success. The user sees progress live; on failure the
    // output is already on their screen, so we don't need to capture it.
    try {
      const [cmd, ...args] = Array.isArray(command) ? command : command.split(' ');
      execFileSync(cmd, args, { cwd: workdir, stdio: 'inherit' });
      return { exitCode: 0 };
    } catch (err) {
      return { exitCode: err.status || 1, error: err };
    }
  }

  _resolveWorktreePath(worktreeValue) {
    if (!worktreeValue) return null;
    if (path.isAbsolute(worktreeValue)) {
      return worktreeValue;
    }
    // epic-id (no separators) → derive via helper.
    if (!worktreeValue.includes('/') && !worktreeValue.includes(path.sep)) {
      return getWorktreePath(this.projectRoot, worktreeValue);
    }
    // Legacy relative path (pre-migration fixture) — resolve against project root.
    return path.join(this.projectRoot, worktreeValue);
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

    for (const p of paths) {
      if (parseWorktreePath(p) === null) {
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

  /**
   * Run a DAG mutation under a single exclusive lock covering both read
   * and write. This closes the read-modify-write race where two Coordinator
   * instances load the dag concurrently, each mutate different epics, and
   * the second save overwrites the first. See `fix: serialize merge dag
   * transaction` commit for the qmd dispatch incident that exposed this.
   *
   * Usage: wrap any body that mutates `this.dag` and would have ended in
   * `this._saveDag()`. Do NOT call `_saveDag()` inside `fn` — it would
   * deadlock (withLock is not re-entrant).
   *
   * @param {Function} fn - Mutation body; return value is forwarded
   * @param {Object} [options] - withLock options (e.g. { timeout })
   * @returns {*} Return value of fn
   */
  _dagTransaction(fn, options = {}) {
    return withLock(
      this.projectRoot,
      () => {
        // Fresh read under lock — any previously-cached DAG state
        // is stale the moment a concurrent writer acquired the lock.
        this._dag = this._loadDag();
        const result = fn();
        // Write under the already-held lock; bypass _saveDag (it would
        // try to re-acquire and deadlock).
        const content = stringifyDagYaml(this.dag.toObject());
        fs.writeFileSync(this.dagPath, content);
        return result;
      },
      options,
    );
  }
}

module.exports = { Coordinator };
