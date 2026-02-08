/**
 * models.js - Data models for arcforge DAG
 *
 * Mirrors Python models.py but using plain JavaScript objects/classes.
 * Uses dag-schema.js for TaskStatus enum.
 */

const { TaskStatus } = require('./dag-schema');

/**
 * Feature class - represents a work unit within an epic
 */
class Feature {
  /**
   * @param {Object} data - Feature data
   * @param {string} data.id - Unique identifier
   * @param {string} data.name - Human-readable name
   * @param {string} [data.status='pending'] - Current status
   * @param {string[]} [data.depends_on=[]] - List of feature IDs this depends on
   * @param {string} [data.source_requirement] - Optional source requirement reference
   */
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.status = data.status || TaskStatus.PENDING;
    this.depends_on = data.depends_on || [];
    this.source_requirement = data.source_requirement || null;
  }

  /**
   * Check if this feature is ready to start
   * @param {Set<string>} completedFeatures - Set of completed feature IDs
   * @returns {boolean} True if all dependencies are completed
   */
  isReady(completedFeatures) {
    return this.depends_on.every(dep => completedFeatures.has(dep));
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    const obj = {
      id: this.id,
      name: this.name,
      status: this.status,
      depends_on: this.depends_on
    };
    if (this.source_requirement) {
      obj.source_requirement = this.source_requirement;
    }
    return obj;
  }
}

/**
 * Epic class - represents a high-level work unit containing features
 */
class Epic {
  /**
   * @param {Object} data - Epic data
   * @param {string} data.id - Unique identifier
   * @param {string} data.name - Human-readable name
   * @param {string} data.spec_path - Path to spec document
   * @param {string} [data.status='pending'] - Current status
   * @param {string|null} [data.worktree=null] - Path to git worktree
   * @param {string[]} [data.depends_on=[]] - List of epic IDs this depends on
   * @param {Feature[]|Object[]} [data.features=[]] - List of features
   */
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.spec_path = data.spec_path;
    this.status = data.status || TaskStatus.PENDING;
    this.worktree = data.worktree || null;
    this.depends_on = data.depends_on || [];
    this.features = (data.features || []).map(f =>
      f instanceof Feature ? f : new Feature(f)
    );
  }

  /**
   * Check if this epic is ready to start
   * @param {Set<string>} completedEpics - Set of completed epic IDs
   * @returns {boolean} True if all dependencies are completed
   */
  isReady(completedEpics) {
    return this.depends_on.every(dep => completedEpics.has(dep));
  }

  /**
   * Calculate completion ratio of features
   * @returns {number} Ratio between 0 and 1
   */
  completionRatio() {
    if (this.features.length === 0) {
      return 0.0;
    }
    const completed = this.features.filter(f => f.status === TaskStatus.COMPLETED).length;
    return completed / this.features.length;
  }

  /**
   * Get set of completed feature IDs within this epic
   * @returns {Set<string>} Set of completed feature IDs
   */
  getCompletedFeatures() {
    return new Set(
      this.features
        .filter(f => f.status === TaskStatus.COMPLETED)
        .map(f => f.id)
    );
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      spec_path: this.spec_path,
      worktree: this.worktree,
      depends_on: this.depends_on,
      features: this.features.map(f => f.toObject())
    };
  }
}

/**
 * BlockedItem class - represents a blocked task with reason
 */
class BlockedItem {
  /**
   * @param {Object} data - BlockedItem data
   * @param {string} data.task_id - ID of the blocked task
   * @param {string} data.reason - Reason for blocking
   * @param {string|Date} data.blocked_at - When the task was blocked
   * @param {Object[]} [data.attempts=[]] - Resolution attempts
   */
  constructor(data) {
    this.task_id = data.task_id;
    this.reason = data.reason;
    this.blocked_at = data.blocked_at instanceof Date
      ? data.blocked_at
      : new Date(data.blocked_at);
    this.attempts = data.attempts || [];
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      task_id: this.task_id,
      reason: this.reason,
      blocked_at: this.blocked_at.toISOString(),
      attempts: this.attempts
    };
  }
}

/**
 * SyncResult class - result of a sync operation
 */
class SyncResult {
  /**
   * @param {Object} [data={}] - SyncResult data
   * @param {string|null} [data.epic_id=null] - Epic being synced
   * @param {boolean} [data.pulled=false] - Whether pulled from base
   * @param {boolean} [data.pushed=false] - Whether pushed to base
   * @param {number} [data.scanned=0] - Number of worktrees scanned
   * @param {Object[]} [data.updates=[]] - List of updates made
   * @param {string[]} [data.blocked_by=[]] - List of blocking dependencies
   * @param {string[]} [data.dependents=[]] - List of dependent epics
   */
  constructor(data = {}) {
    this.epic_id = data.epic_id || null;
    this.pulled = data.pulled || false;
    this.pushed = data.pushed || false;
    this.scanned = data.scanned || 0;
    this.updates = data.updates || [];
    this.blocked_by = data.blocked_by || [];
    this.dependents = data.dependents || [];
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      epic_id: this.epic_id,
      pulled: this.pulled,
      pushed: this.pushed,
      scanned: this.scanned,
      updates: this.updates,
      blocked_by: this.blocked_by,
      dependents: this.dependents
    };
  }
}

/**
 * DAG class - the full directed acyclic graph of epics and features
 */
class DAG {
  /**
   * @param {Object} [data={}] - DAG data
   * @param {Epic[]|Object[]} [data.epics=[]] - List of epics
   * @param {BlockedItem[]|Object[]} [data.blocked=[]] - List of blocked items
   */
  constructor(data = {}) {
    this.epics = (data.epics || []).map(e =>
      e instanceof Epic ? e : new Epic(e)
    );
    this.blocked = (data.blocked || []).map(b =>
      b instanceof BlockedItem ? b : new BlockedItem(b)
    );
  }

  /**
   * Get a task (feature or epic) by ID
   * @param {string} taskId - Task ID to find
   * @returns {Feature|Epic|null} The task or null if not found
   */
  getTask(taskId) {
    for (const epic of this.epics) {
      if (epic.id === taskId) {
        return epic;
      }
      for (const feature of epic.features) {
        if (feature.id === taskId) {
          return feature;
        }
      }
    }
    return null;
  }

  /**
   * Get an epic by ID
   * @param {string} epicId - Epic ID to find
   * @returns {Epic|null} The epic or null if not found
   */
  getEpic(epicId) {
    return this.epics.find(e => e.id === epicId) || null;
  }

  /**
   * Get set of completed epic IDs
   * @returns {Set<string>} Set of completed epic IDs
   */
  getCompletedEpics() {
    return new Set(
      this.epics
        .filter(e => e.status === TaskStatus.COMPLETED)
        .map(e => e.id)
    );
  }

  /**
   * Get set of completed feature IDs within an epic
   * @param {string} epicId - Epic ID
   * @returns {Set<string>} Set of completed feature IDs
   */
  getCompletedFeatures(epicId) {
    const epic = this.getEpic(epicId);
    if (!epic) return new Set();
    return epic.getCompletedFeatures();
  }

  /**
   * Find the epic containing a feature
   * @param {string} featureId - Feature ID to find
   * @returns {Epic|null} The containing epic or null
   */
  findEpicByFeature(featureId) {
    for (const epic of this.epics) {
      if (epic.features.some(f => f.id === featureId)) {
        return epic;
      }
    }
    return null;
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object} Plain object representation
   */
  toObject() {
    const obj = {
      epics: this.epics.map(e => e.toObject())
    };
    if (this.blocked.length > 0) {
      obj.blocked = this.blocked.map(b => b.toObject());
    }
    return obj;
  }

  /**
   * Create DAG from parsed YAML object
   * @param {Object} data - Parsed dag.yaml content
   * @returns {DAG} New DAG instance
   */
  static fromObject(data) {
    return new DAG(data);
  }
}

module.exports = {
  TaskStatus,
  Feature,
  Epic,
  BlockedItem,
  SyncResult,
  DAG
};
