/**
 * dag-schema.js - Single Source of Truth for dag.yaml format
 *
 * This module defines the schema for the DAG (Directed Acyclic Graph) configuration
 * used by arcforge to manage epics and features.
 *
 * Used by:
 * - Coordinator (validation and serialization)
 * - CLI (schema command for Planner)
 */

/**
 * Task status enum values
 */
const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked'
};

/**
 * Schema definition with field descriptions
 * Machine-readable format for documentation
 */
const schema = {
  epics: {
    type: 'array',
    description: 'List of epics (high-level work units)',
    items: {
      id: { type: 'string', required: true, description: 'Unique identifier (e.g., epic-001)' },
      name: { type: 'string', required: true, description: 'Human-readable name' },
      status: {
        type: 'string',
        required: false,
        default: 'pending',
        enum: Object.values(TaskStatus),
        description: 'Current status'
      },
      spec_path: { type: 'string', required: true, description: 'Path to spec document' },
      worktree: {
        type: 'string|null',
        required: false,
        description: 'Path to git worktree (relative to project root)'
      },
      depends_on: {
        type: 'array',
        items: 'string',
        required: false,
        default: [],
        description: 'List of epic IDs this epic depends on'
      },
      features: {
        type: 'array',
        required: false,
        default: [],
        description: 'List of features within this epic',
        items: {
          id: { type: 'string', required: true, description: 'Unique identifier (e.g., feat-001-01)' },
          name: { type: 'string', required: true, description: 'Human-readable name' },
          status: {
            type: 'string',
            required: false,
            default: 'pending',
            enum: Object.values(TaskStatus),
            description: 'Current status'
          },
          depends_on: {
            type: 'array',
            items: 'string',
            required: false,
            default: [],
            description: 'List of feature IDs this feature depends on'
          },
          source_requirement: {
            type: 'string',
            required: false,
            description: 'Optional reference to source requirement (e.g., FR-XXX-NNN)'
          }
        }
      }
    }
  },
  blocked: {
    type: 'array',
    required: false,
    description: 'List of blocked tasks with reasons',
    items: {
      task_id: { type: 'string', required: true, description: 'ID of blocked task' },
      reason: { type: 'string', required: true, description: 'Reason for blocking' },
      blocked_at: { type: 'string', required: true, description: 'ISO 8601 timestamp' },
      attempts: {
        type: 'array',
        required: false,
        default: [],
        description: 'List of resolution attempts',
        items: {
          attempt_at: { type: 'string', description: 'ISO 8601 timestamp' },
          action: { type: 'string', description: 'What was tried' },
          result: { type: 'string', description: 'Outcome of attempt' }
        }
      }
    }
  }
};

/**
 * Example dag.yaml content for reference
 */
const example = {
  epics: [
    {
      id: 'epic-001',
      name: 'User Authentication System',
      status: 'in_progress',
      spec_path: 'docs/specs/epic-001-auth.md',
      worktree: '.worktrees/epic-001',
      depends_on: [],
      features: [
        {
          id: 'feat-001-01',
          name: 'Login API endpoint',
          status: 'completed',
          depends_on: []
        },
        {
          id: 'feat-001-02',
          name: 'Session management',
          status: 'in_progress',
          depends_on: ['feat-001-01']
        },
        {
          id: 'feat-001-03',
          name: 'Password reset flow',
          status: 'pending',
          depends_on: ['feat-001-01'],
          source_requirement: 'FR-AUTH-003'
        }
      ]
    },
    {
      id: 'epic-002',
      name: 'Dashboard UI',
      status: 'pending',
      spec_path: 'docs/specs/epic-002-dashboard.md',
      worktree: null,
      depends_on: ['epic-001'],
      features: [
        {
          id: 'feat-002-01',
          name: 'Dashboard layout',
          status: 'pending',
          depends_on: []
        }
      ]
    }
  ],
  blocked: [
    {
      task_id: 'feat-001-02',
      reason: 'Waiting for Redis configuration',
      blocked_at: '2024-01-15T10:30:00Z',
      attempts: [
        {
          attempt_at: '2024-01-15T11:00:00Z',
          action: 'Contacted DevOps for Redis access',
          result: 'Pending approval'
        }
      ]
    }
  ]
};

/**
 * Convert schema to YAML documentation string
 */
function schemaToYaml() {
  const lines = [];
  lines.push('# dag.yaml Schema');
  lines.push('# This file defines the structure for DAG configuration');
  lines.push('');

  lines.push('epics:  # List of epics (required)');
  lines.push('  - id: string  # Unique identifier (required)');
  lines.push('    name: string  # Human-readable name (required)');
  lines.push(`    status: ${Object.values(TaskStatus).join('|')}  # Current status (default: pending)`);
  lines.push('    spec_path: string  # Path to spec document (required)');
  lines.push('    worktree: string|null  # Git worktree path (optional)');
  lines.push('    depends_on: [string]  # Epic IDs this depends on (default: [])');
  lines.push('    features:  # List of features (optional)');
  lines.push('      - id: string  # Unique identifier (required)');
  lines.push('        name: string  # Human-readable name (required)');
  lines.push(`        status: ${Object.values(TaskStatus).join('|')}  # Current status (default: pending)`);
  lines.push('        depends_on: [string]  # Feature IDs this depends on (default: [])');
  lines.push('        source_requirement: string  # Reference to source requirement (optional)');
  lines.push('');
  lines.push('blocked:  # List of blocked tasks (optional)');
  lines.push('  - task_id: string  # ID of blocked task (required)');
  lines.push('    reason: string  # Reason for blocking (required)');
  lines.push('    blocked_at: string  # ISO 8601 timestamp (required)');
  lines.push('    attempts:  # Resolution attempts (optional)');
  lines.push('      - attempt_at: string  # ISO 8601 timestamp');
  lines.push('        action: string  # What was tried');
  lines.push('        result: string  # Outcome of attempt');

  return lines.join('\n');
}

/**
 * Convert example to YAML string (simple serialization)
 */
function exampleToYaml() {
  return objectToYaml(example);
}

/**
 * Simple YAML serializer for objects (no external dependencies)
 * Only handles the types we need for dag.yaml
 */
function objectToYaml(obj, indent = 0, isArrayItem = false) {
  const spaces = '  '.repeat(indent);
  const lines = [];

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        // Serialize object as array item (first key on same line as -)
        const entries = Object.entries(item);
        if (entries.length > 0) {
          const [firstKey, firstValue] = entries[0];
          if (Array.isArray(firstValue)) {
            if (firstValue.length === 0) {
              lines.push(`${spaces}- ${firstKey}: []`);
            } else {
              lines.push(`${spaces}- ${firstKey}:`);
              lines.push(objectToYaml(firstValue, indent + 2));
            }
          } else if (typeof firstValue === 'object' && firstValue !== null) {
            lines.push(`${spaces}- ${firstKey}:`);
            lines.push(objectToYaml(firstValue, indent + 2));
          } else {
            lines.push(`${spaces}- ${firstKey}: ${formatValue(firstValue)}`);
          }
          // Remaining entries at indent+1
          for (let i = 1; i < entries.length; i++) {
            const [key, value] = entries[i];
            const itemSpaces = '  '.repeat(indent + 1);
            if (Array.isArray(value)) {
              if (value.length === 0) {
                lines.push(`${itemSpaces}${key}: []`);
              } else {
                lines.push(`${itemSpaces}${key}:`);
                lines.push(objectToYaml(value, indent + 2));
              }
            } else if (typeof value === 'object' && value !== null) {
              lines.push(`${itemSpaces}${key}:`);
              lines.push(objectToYaml(value, indent + 2));
            } else {
              lines.push(`${itemSpaces}${key}: ${formatValue(value)}`);
            }
          }
        }
      } else {
        lines.push(`${spaces}- ${formatValue(item)}`);
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    const entries = Object.entries(obj);
    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${spaces}${key}: []`);
        } else {
          lines.push(`${spaces}${key}:`);
          lines.push(objectToYaml(value, indent + 1));
        }
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`${spaces}${key}:`);
        lines.push(objectToYaml(value, indent + 1));
      } else {
        lines.push(`${spaces}${key}: ${formatValue(value)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a scalar value for YAML
 */
function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Quote strings that need it
    if (value.includes(':') || value.includes('#') || value.includes("'") ||
        value.includes('"') || value.includes('\n') || value === '' ||
        value.startsWith(' ') || value.endsWith(' ')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}

/**
 * Validate a dag object against the schema (basic validation)
 * Returns { valid: boolean, errors: string[] }
 */
function validate(dag) {
  const errors = [];

  if (!dag || typeof dag !== 'object') {
    errors.push('DAG must be an object');
    return { valid: false, errors };
  }

  // Validate epics
  if (!Array.isArray(dag.epics)) {
    errors.push('epics must be an array');
  } else {
    const epicIds = new Set();
    for (let i = 0; i < dag.epics.length; i++) {
      const epic = dag.epics[i];
      const prefix = `epics[${i}]`;

      if (!epic.id || typeof epic.id !== 'string') {
        errors.push(`${prefix}.id is required and must be a string`);
      } else {
        if (epicIds.has(epic.id)) {
          errors.push(`${prefix}.id "${epic.id}" is duplicate`);
        }
        epicIds.add(epic.id);
      }

      if (!epic.name || typeof epic.name !== 'string') {
        errors.push(`${prefix}.name is required and must be a string`);
      }

      if (!epic.spec_path || typeof epic.spec_path !== 'string') {
        errors.push(`${prefix}.spec_path is required and must be a string`);
      }

      if (epic.status && !Object.values(TaskStatus).includes(epic.status)) {
        errors.push(`${prefix}.status must be one of: ${Object.values(TaskStatus).join(', ')}`);
      }

      // Validate features
      if (epic.features && !Array.isArray(epic.features)) {
        errors.push(`${prefix}.features must be an array`);
      } else if (epic.features) {
        const featureIds = new Set();
        for (let j = 0; j < epic.features.length; j++) {
          const feat = epic.features[j];
          const featPrefix = `${prefix}.features[${j}]`;

          if (!feat.id || typeof feat.id !== 'string') {
            errors.push(`${featPrefix}.id is required and must be a string`);
          } else {
            if (featureIds.has(feat.id)) {
              errors.push(`${featPrefix}.id "${feat.id}" is duplicate`);
            }
            featureIds.add(feat.id);
          }

          if (!feat.name || typeof feat.name !== 'string') {
            errors.push(`${featPrefix}.name is required and must be a string`);
          }

          if (feat.status && !Object.values(TaskStatus).includes(feat.status)) {
            errors.push(`${featPrefix}.status must be one of: ${Object.values(TaskStatus).join(', ')}`);
          }
        }
      }
    }
  }

  // Validate blocked (optional)
  if (dag.blocked !== undefined) {
    if (!Array.isArray(dag.blocked)) {
      errors.push('blocked must be an array');
    } else {
      for (let i = 0; i < dag.blocked.length; i++) {
        const blocked = dag.blocked[i];
        const prefix = `blocked[${i}]`;

        if (!blocked.task_id || typeof blocked.task_id !== 'string') {
          errors.push(`${prefix}.task_id is required and must be a string`);
        }

        if (!blocked.reason || typeof blocked.reason !== 'string') {
          errors.push(`${prefix}.reason is required and must be a string`);
        }

        if (!blocked.blocked_at || typeof blocked.blocked_at !== 'string') {
          errors.push(`${prefix}.blocked_at is required and must be a string`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  TaskStatus,
  schema,
  example,
  schemaToYaml,
  exampleToYaml,
  objectToYaml,
  formatValue,
  validate
};
