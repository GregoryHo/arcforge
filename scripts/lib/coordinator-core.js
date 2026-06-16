/**
 * coordinator-core.js — the Coordinator class: DAG scheduling, status
 * tracking, and private plumbing.
 *
 * Split from coordinator.js (decomposition per file-size limits). Worktree
 * lifecycle and sync methods live in coordinator-worktree-ops.js and are
 * attached to Coordinator.prototype at the bottom of this file, so the class
 * is complete no matter which module constructs it. Callers import via the
 * coordinator.js facade.
 *
 * Mirrors Python coordinator.py functionality.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DAG, Feature, BlockedItem, TaskStatus } = require('./models');
const { parseDagYaml, stringifyDagYaml } = require('./yaml-parser');
const { withLock } = require('./locking');
const { objectToYaml } = require('./dag-schema');
const { getWorktreePath, parseWorktreePath } = require('./worktree-paths');
const { readArcforgeMarker } = require('./marker');
const { parseSpecHeader } = require('./sdd-spec-header');
const { readFileSafe } = require('./utils');

/**
 * Coordinator class - manages DAG operations for a single spec
 *
 * Each Coordinator instance is scoped to exactly one spec. The dag.yaml
 * path is lazy-resolved on first access via priority: explicit specId →
 * `.arcforge-epic` marker in cwd → throw with actionable message.
 *
 * Cross-spec aggregations (multi-spec sync / reboot) are module-level
 * functions (syncAllSpecs, rebootAllSpecs in coordinator-multi-spec.js)
 * rather than instance methods, because they deliberately do not belong
 * to a single-spec scope.
 */
class Coordinator {
  /**
   * @param {string} projectRoot - Project root directory
   * @param {string|null} [specId=null] - Spec id. When null, resolved lazily
   *   from `.arcforge-epic` marker on first dagPath/DAG access.
   */
  constructor(projectRoot, specId = null) {
    this.projectRoot = path.resolve(projectRoot);
    this.specId = specId;
    this._dagPath = null; // lazy — resolved on first access
    this._dag = null;
  }

  /**
   * Lazy dag.yaml path. Resolves on first access and caches the result.
   * Resolution priority:
   *   1. Explicit specId from constructor → `specs/<specId>/dag.yaml`
   *   2. `.arcforge-epic` marker in projectRoot → spec_id field (also
   *      populates this.specId as a side-effect so subsequent reads of
   *      `coord.specId` return the inferred value)
   *   3. Throw with migration guidance.
   *
   * Kept lazy so pure utilities (_findBaseWorktree, _isInWorktree,
   * multi-spec CLI probes) that never touch the DAG don't force a throw.
   */
  get dagPath() {
    if (this._dagPath !== null) return this._dagPath;
    if (!this.specId) {
      const marker = readArcforgeMarker(this.projectRoot);
      if (marker?.spec_id) this.specId = marker.spec_id;
    }
    if (!this.specId) {
      throw new Error(
        'Cannot resolve dag.yaml path: no specId provided and .arcforge-epic has no spec_id. ' +
          'Pass --spec-id <id> or run the command from inside a worktree that carries a spec_id marker.',
      );
    }
    this._dagPath = path.join(this.projectRoot, 'specs', this.specId, 'dag.yaml');
    return this._dagPath;
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
        // Absolute worktree path, derived at read time from the stored
        // worktree value (additive — `worktree` keeps the raw dag value).
        // null when the epic has not been expanded; always null when read
        // from a worktree's local dag copy, where every worktree is null.
        path: epic.worktree ? this._resolveWorktreePath(epic.worktree) : null,
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
   * Get all features that can be worked on in parallel within in-progress
   * epics. Feature-level analog of parallelTasks (epic-level): a feature is
   * ready when its epic is in progress, the feature is pending, and every one
   * of its intra-epic dependencies is completed.
   * @param {string|null} [epicId=null] - If set, only consider this epic
   * @returns {Array<{id: string, name: string, epic: string}>} Ready features
   *   tagged with their parent epic id.
   */
  parallelFeatures(epicId = null) {
    const epics = epicId
      ? this.dag.epics.filter((e) => e.id === epicId)
      : this.dag.epics.filter((e) => e.status === TaskStatus.IN_PROGRESS);
    const ready = [];
    for (const epic of epics) {
      if (epic.status !== TaskStatus.IN_PROGRESS) continue;
      const completedFeatures = epic.getCompletedFeatures();
      for (const feature of epic.features) {
        if (feature.status === TaskStatus.PENDING && feature.isReady(completedFeatures)) {
          ready.push({ id: feature.id, name: feature.name, epic: epic.id });
        }
      }
    }
    return ready;
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
   * Reboot context - post-compaction handover summary for a new session.
   *
   * Counts are kept cheap and additive (rebootAllSpecs aggregates them
   * across specs). The remaining fields are derived from data the
   * Coordinator already scopes: `project_goal` from the spec header,
   * `current_task` via the existing nextTask priority (in-progress
   * feature > ready feature > ready epic), `research_files` from the
   * spec directory's documentation artifacts.
   *
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

    const next = this.nextTask();

    return {
      current_task: next
        ? {
            id: next.id,
            name: next.name,
            type: next instanceof Feature ? 'feature' : 'epic',
            status: next.status,
          }
        : null,
      remaining_count: remaining,
      completed_count: completed,
      blocked_count: this.dag.blocked.length,
      project_goal: this._projectGoalFromSpec(),
      research_files: this._enumerateResearchFiles(),
    };
  }

  /**
   * Derive the project goal from the spec header (`specs/<id>/spec.xml`
   * `<title>`). Returns null when the spec id is unresolved, spec.xml is
   * absent, or the header carries no title — reboot must stay useful for
   * dag-only projects, so a missing goal degrades to null rather than
   * throwing (title is a required header field; its absence is a spec
   * problem the validator reports, not a reboot failure).
   *
   * @returns {string|null}
   */
  _projectGoalFromSpec() {
    if (!this.specId) return null;
    const specXmlPath = path.join(this.projectRoot, 'specs', this.specId, 'spec.xml');
    const content = readFileSafe(specXmlPath);
    if (!content) return null;
    const header = parseSpecHeader(content);
    return header?.title ? header.title : null;
  }

  /**
   * Enumerate handover reading material in the spec directory: top-level
   * documentation artifacts (vision.md, spec.xml, decisions.yml) plus
   * `details/*.xml`, as paths relative to the project root. dag.yaml is
   * excluded — it is live state the reboot output already summarizes,
   * not research. Empty array when the spec id is unresolved or no
   * artifacts exist.
   *
   * @returns {string[]}
   */
  _enumerateResearchFiles() {
    if (!this.specId) return [];
    const specDir = path.join(this.projectRoot, 'specs', this.specId);
    const files = [];
    for (const name of ['vision.md', 'spec.xml', 'decisions.yml']) {
      if (fs.existsSync(path.join(specDir, name))) {
        files.push(path.relative(this.projectRoot, path.join(specDir, name)));
      }
    }
    const detailsDir = path.join(specDir, 'details');
    if (fs.existsSync(detailsDir)) {
      for (const entry of fs.readdirSync(detailsDir).sort()) {
        if (entry.endsWith('.xml')) {
          files.push(path.relative(this.projectRoot, path.join(detailsDir, entry)));
        }
      }
    }
    return files;
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
    // epic-id (no separators) → derive via helper. The hash now folds
    // specId in so same-epic-id across specs produces distinct paths.
    if (!worktreeValue.includes('/') && !worktreeValue.includes(path.sep)) {
      return getWorktreePath(this.projectRoot, this.specId, worktreeValue);
    }
    // Legacy relative path (pre-migration fixture) — resolve against project root.
    return path.join(this.projectRoot, worktreeValue);
  }

  _inferEpicIdFromWorktree() {
    const data = readArcforgeMarker(this.projectRoot);
    if (!data) return null;
    // Side-effect: cache spec_id so any subsequent dagPath access
    // doesn't re-read the marker file.
    if (data.spec_id && !this.specId) this.specId = data.spec_id;
    return data.epic || null;
  }

  _isInWorktree() {
    return fs.existsSync(path.join(this.projectRoot, '.arcforge-epic'));
  }

  _writeAgenticEpic(data, filePath = null) {
    const target = filePath || path.join(this.projectRoot, '.arcforge-epic');
    fs.writeFileSync(target, objectToYaml(data));
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
   * the second save overwrites the first.
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
        const original = fs.readFileSync(this.dagPath, 'utf8');
        this._dag = DAG.fromObject(parseDagYaml(original));
        const result = fn();
        // Only write if the DAG actually changed — avoids unnecessary
        // disk I/O and reduces lock hold time on no-mutation paths.
        const content = stringifyDagYaml(this.dag.toObject());
        if (content !== original) {
          fs.writeFileSync(this.dagPath, content);
        }
        return result;
      },
      options,
    );
  }
}

// Attach worktree lifecycle + sync methods here (not in the facade) so the
// class is complete no matter which module constructs it —
// coordinator-multi-spec.js constructs instances directly.
Object.assign(Coordinator.prototype, require('./coordinator-worktree-ops'));

module.exports = {
  Coordinator,
};
