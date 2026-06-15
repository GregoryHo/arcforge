/**
 * coordinator-worktree-ops.js — worktree lifecycle and sync methods for the
 * Coordinator class.
 *
 * Split from coordinator.js (decomposition per file-size limits). This module
 * exports a plain object of methods written with `this`; coordinator-core.js
 * attaches them to Coordinator.prototype via Object.assign. It must never
 * require coordinator-core back — methods that need a sibling Coordinator
 * instance construct one via `new this.constructor(...)` so the dependency
 * stays one-directional (core → ops).
 */

const fs = require('node:fs');
const path = require('node:path');
const { SyncResult, TaskStatus } = require('./models');
const { getDefaultTestCommand, getDefaultInstallCommand } = require('./package-manager');
const { objectToYaml, normalizeStatus } = require('./dag-schema');
const { getWorktreeRoot, getWorktreePath, getEpicBranchName } = require('./worktree-paths');

// Lock timeouts for DAG transactions that include slow git operations.
// Default withLock timeout is 5s; these accommodate heavier workloads.
const EXPAND_LOCK_TIMEOUT = 30000; // git worktree add + fs ops
const MERGE_LOCK_TIMEOUT = 60000; // git merge can be slow on large repos

module.exports = {
  /**
   * Expand worktrees for ready epics, or a single epic when epicId is supplied.
   *
   * Worktrees are created at the canonical location computed by
   * worktree-paths.js (~/.arcforge/worktrees/<project>-<hash>-<epic>/).
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

    // Ensure the .arcforge-epic marker can never enter git staging in
    // any worktree this project has or will have. Idempotent — no-op
    // if already excluded. Must happen before any worktree creates a
    // marker file, so teammate `git add -A` / `git add .` patterns
    // never pick it up.
    this._ensureArcforgeExcluded();

    // Phase 1: DAG mutation + worktree creation under a single lock.
    // Two concurrent expansions on different epics would otherwise race:
    // both load the dag, both set their own epic.worktree/epic.status,
    // and the second save clobbers the first.
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

          const worktreePath = getWorktreePath(this.projectRoot, this.specId, epic.id);
          const branchName = getEpicBranchName(this.specId, epic.id);
          const result = this._runGit(['worktree', 'add', worktreePath, '-b', branchName]);
          if (result.exitCode !== 0) {
            throw new Error(`Failed to create worktree for ${epic.id}: ${result.stderr.trim()}`);
          }

          // Create .arcforge-epic marker (spec_id lets sync/merge reconnect
          // the worktree to the correct per-spec dag.yaml at the base.)
          const epicData = {
            epic: epic.id,
            spec_id: this.specId,
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
      { timeout: EXPAND_LOCK_TIMEOUT },
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
  },

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

    // If not in base, delegate to base coordinator (inherit specId so
    // the base-side load targets the correct per-spec dag.yaml).
    if (basePath !== this.projectRoot) {
      const baseCoord = new this.constructor(basePath, this.specId);
      return baseCoord._mergeEpicsInBase(baseBranch, resolvedEpicIds);
    }

    return this._mergeEpicsInBase(baseBranch, resolvedEpicIds);
  },

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
          const branchName = getEpicBranchName(this.specId, epic.id);
          const result = this._runGit([
            'merge',
            '--no-ff',
            branchName,
            '-m',
            `feat: integrate ${epic.id} epic`,
          ]);
          if (result.exitCode !== 0) {
            throw new Error(`Failed to merge ${epic.id}: ${result.stderr.trim()}`);
          }
          epic.status = TaskStatus.COMPLETED;

          // Update the worktree's .arcforge-epic marker so that subsequent
          // sync propagates the correct status. Without this, the marker
          // retains the stale 'in_progress' from expand time, and sync
          // overwrites the DAG's correct 'completed' back to 'in_progress'.
          if (epic.worktree) {
            const wtPath = this._resolveWorktreePath(epic.worktree);
            const markerPath = path.join(wtPath, '.arcforge-epic');
            try {
              const marker = this._readAgenticEpic(markerPath);
              if (!marker.local) marker.local = {};
              marker.local.status = TaskStatus.COMPLETED;
              this._writeAgenticEpic(marker, markerPath);
            } catch {
              // Marker missing or unreadable — skip silently. The DAG
              // status is already correct; the marker is best-effort.
            }
          }

          merged.push(epic);
        }

        return merged;
      },
      { timeout: MERGE_LOCK_TIMEOUT },
    );
  },

  /**
   * Abort an in-progress merge in the BASE checkout.
   *
   * A merge conflict during epic finishing leaves the BASE checkout (not the
   * worktree) in a half-merged state — `mergeEpics` checks out the base branch
   * in the base worktree before merging, so the unmerged index lives there. The
   * agent that hit the conflict is in the epic worktree, so this method finds the
   * base worktree (same delegation as mergeEpics) and runs `git merge --abort`
   * there, returning the base to a clean state on its current branch.
   *
   * Idempotent-friendly: if there is no merge to abort, git's `MERGE_HEAD`
   * check yields exit 128; we surface that as a no-op result rather than a
   * throw, so calling --abort when already clean is safe.
   *
   * @returns {{ aborted: boolean, base: string }} aborted=false when there was
   *   no merge in progress
   */
  abortMerge() {
    const basePath = this._findBaseWorktree();
    if (!basePath) {
      throw new Error('Base worktree not found via git worktree list');
    }

    const result = this._runGit(['merge', '--abort'], basePath);
    if (result.exitCode === 0) {
      return { aborted: true, base: basePath };
    }

    // `git merge --abort` exits non-zero (128) when there is no merge to abort
    // ("fatal: There is no merge to abort"). That is the no-op case, not an
    // error — report it as such. Any other failure is a real git error.
    if (/no merge to abort/i.test(result.stderr)) {
      return { aborted: false, base: basePath };
    }
    throw new Error(`Failed to abort merge in ${basePath}: ${result.stderr.trim()}`);
  },

  /**
   * Clean up worktrees for completed epics
   * @param {Object} options - Cleanup options
   * @param {string[]} [options.epicIds] - Specific epic IDs to clean
   * @returns {string[]} List of removed worktree paths
   */
  cleanupWorktrees(options = {}) {
    const { epicIds } = options;

    // Find base worktree
    const basePath = this._findBaseWorktree();
    if (!basePath) {
      throw new Error('Base worktree not found via git worktree list');
    }

    // If not in base, delegate to the base coordinator (same delegation as
    // mergeEpics). A worktree's local dag copy carries `worktree: null` for
    // every epic, so running cleanup from a worktree cwd would otherwise be
    // a silent no-op.
    if (basePath !== this.projectRoot) {
      const baseCoord = new this.constructor(basePath, this.specId);
      return baseCoord._cleanupWorktreesInBase(epicIds);
    }

    return this._cleanupWorktreesInBase(epicIds);
  },

  _cleanupWorktreesInBase(epicIds) {
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
  },

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
  },

  /**
   * Pull epic statuses from the base DAG into the local dag.yaml.
   * No-op when not in a worktree or when base is unreachable.
   * @returns {boolean} Whether any statuses were updated
   */
  syncEpicStatusesFromBase() {
    if (!this._isInWorktree()) return false;

    const basePath = this._findBaseWorktree();
    if (!basePath) return false;

    const baseCoord = new this.constructor(basePath, this.specId);

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
  },

  _syncWorktree(direction) {
    const epicFile = this._readAgenticEpic();
    const basePath = this._findBaseWorktree();
    if (!basePath) {
      throw new Error('Cannot find base worktree');
    }

    const result = new SyncResult({ epic_id: epicFile.epic });

    if (direction === 'from_base' || direction === 'both') {
      const baseCoord = new this.constructor(basePath, this.specId);
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
      const baseCoord = new this.constructor(basePath, this.specId);
      const local = epicFile.local || {};
      if (local.status) {
        const validStatus = normalizeStatus(local.status);
        // Resolve the target epic inside the base's transaction so we
        // act on the fresh-loaded state, not the pre-transaction cache.
        const pushed = baseCoord._dagTransaction(() => {
          const dagEpic = baseCoord.dag.getEpic(epicFile.epic);
          if (dagEpic && validStatus !== dagEpic.status) {
            dagEpic.status = validStatus;
            return true;
          }
          return false;
        });
        if (pushed) result.pushed = true;
      }
    }

    this._writeAgenticEpic(epicFile);
    return result;
  },

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
          const validStatus = normalizeStatus(local.status);
          const oldStatus = epic.status;
          if (validStatus !== oldStatus) {
            epic.status = validStatus;
            result.updates.push({
              epic: epicData.epic,
              old_status: oldStatus,
              new_status: validStatus,
            });
          }
        }

        result.scanned++;
      }

      return result;
    });
  },

  _getDependencyStatuses(dag, epic) {
    const statuses = {};
    for (const depId of epic.depends_on) {
      const depEpic = dag.getEpic(depId);
      if (depEpic) {
        statuses[depId] = depEpic.status;
      }
    }
    return statuses;
  },

  _getBlockedBy(dag, epic) {
    return epic.depends_on.filter((depId) => {
      const depEpic = dag.getEpic(depId);
      return depEpic && depEpic.status !== TaskStatus.COMPLETED;
    });
  },

  _getDependents(dag, epic) {
    return dag.epics.filter((e) => e.depends_on.includes(epic.id)).map((e) => e.id);
  },

  /**
   * Add `.arcforge-epic` to the main repo's git info/exclude so the
   * worktree marker never gets staged by any teammate's `git add -A`
   * or `git add .` patterns.
   *
   * Linked worktrees share their exclude configuration with the main
   * repo via the `commondir` file — writing to a per-worktree
   * `info/exclude` path does NOT work (verified empirically). The only
   * path that git consults for all linked worktrees is the main repo's
   * common gitdir, which `git rev-parse --git-common-dir` resolves to
   * regardless of which worktree the command runs from.
   *
   * Idempotent: no-op if the marker rule is already present.
   */
  _ensureArcforgeExcluded() {
    const result = this._runGit(['rev-parse', '--git-common-dir']);
    if (result.exitCode !== 0) return;

    // git-common-dir can be relative to cwd (older git versions); resolve
    // against projectRoot so we always get an absolute path.
    const commonDir = path.resolve(this.projectRoot, result.stdout.trim());
    const infoDir = path.join(commonDir, 'info');
    const excludePath = path.join(infoDir, 'exclude');
    const marker = '.arcforge-epic';

    const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';

    // Match the exact line (not a substring) to avoid re-adding if the
    // rule already exists, while still tolerating comments and other
    // entries around it.
    if (current.split('\n').includes(marker)) return;

    fs.mkdirSync(infoDir, { recursive: true });
    const needsNewline = current.length > 0 && !current.endsWith('\n');
    const prefix = needsNewline ? '\n' : '';
    fs.appendFileSync(excludePath, `${prefix}# arcforge worktree marker (auto-added)\n${marker}\n`);
  },
};
