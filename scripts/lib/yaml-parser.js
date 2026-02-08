/**
 * yaml-parser.js - Simple YAML parser for dag.yaml
 *
 * This is NOT a general-purpose YAML parser. It only handles the specific
 * format used by dag.yaml, which is machine-generated and has a fixed structure.
 *
 * Supported features:
 * - Key-value pairs (key: value)
 * - Lists (- item)
 * - Nested objects
 * - Null values (null, ~, or empty)
 * - Strings (plain, single-quoted, double-quoted)
 * - Numbers and booleans
 * - Comments (# ...)
 *
 * NOT supported (not needed for dag.yaml):
 * - Anchors and aliases
 * - Multi-line strings (|, >)
 * - Complex types
 * - Flow syntax ({}, [])
 */

/**
 * Parse a YAML string into a JavaScript object
 * @param {string} yamlString - The YAML content to parse
 * @returns {Object} Parsed object
 */
function parse(yamlString) {
  const lines = yamlString.split('\n');
  const result = {};

  // Stack tracks: { obj, indent, pendingKey, pendingIndent }
  // pendingKey is set when we see "key:" with no value
  // pendingIndent is the indent where the pending key was declared
  const stack = [{ obj: result, indent: -2, pendingKey: null, pendingIndent: -2 }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    // Calculate indentation
    const indent = line.search(/\S/);
    if (indent < 0) continue;

    const content = line.slice(indent);

    // Handle pending keys first - check if this line is a child
    let handled = false;
    for (let j = stack.length - 1; j >= 0; j--) {
      const frame = stack[j];
      if (frame.pendingKey !== null && indent > frame.pendingIndent) {
        // This line is a child of the pending key
        if (content.startsWith('- ')) {
          // It's an array
          const arr = [];
          frame.obj[frame.pendingKey] = arr;
          // Clear pending and push array frame
          frame.pendingKey = null;
          // Pop any frames above this one
          while (stack.length > j + 1) stack.pop();
          stack.push({ obj: arr, indent: indent - 2, pendingKey: null, pendingIndent: -2, isArray: true });
          // Reprocess this line
          i--;
          handled = true;
          break;
        } else {
          // It's a nested object
          const childObj = {};
          frame.obj[frame.pendingKey] = childObj;
          frame.pendingKey = null;
          // Pop any frames above this one
          while (stack.length > j + 1) stack.pop();
          stack.push({ obj: childObj, indent: indent - 2, pendingKey: null, pendingIndent: -2 });
          // Reprocess this line
          i--;
          handled = true;
          break;
        }
      }
    }
    if (handled) continue;

    // Pop stack to find correct parent level (no pending keys involved)
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (top.pendingKey !== null) {
        // This pending key has no children (same or less indent) - set to null
        top.obj[top.pendingKey] = null;
        top.pendingKey = null;
      }
      if (indent <= top.indent) {
        stack.pop();
      } else {
        break;
      }
    }

    const parent = stack[stack.length - 1];

    // Check if this is an array item
    if (content.startsWith('- ')) {
      const itemContent = content.slice(2).trim();

      if (!Array.isArray(parent.obj)) {
        // This shouldn't happen with well-formed YAML
        continue;
      }

      if (itemContent === '') {
        // Empty array item - push empty object
        const newObj = {};
        parent.obj.push(newObj);
        stack.push({ obj: newObj, indent: indent, pendingKey: null, pendingIndent: -2 });
      } else if (itemContent.includes(':')) {
        // Object item: - key: value
        const colonPos = itemContent.indexOf(':');
        const key = itemContent.slice(0, colonPos).trim();
        const valueStr = itemContent.slice(colonPos + 1).trim();

        const newObj = {};
        parent.obj.push(newObj);

        if (valueStr === '' || valueStr === '[]') {
          if (valueStr === '[]') {
            newObj[key] = [];
            stack.push({ obj: newObj, indent: indent, pendingKey: null, pendingIndent: -2 });
          } else {
            // Empty value - might have children
            stack.push({ obj: newObj, indent: indent, pendingKey: key, pendingIndent: indent });
          }
        } else {
          newObj[key] = parseValue(valueStr);
          stack.push({ obj: newObj, indent: indent, pendingKey: null, pendingIndent: -2 });
        }
      } else {
        // Simple value item: - value
        parent.obj.push(parseValue(itemContent));
      }
    } else if (content.includes(':')) {
      // Key-value pair
      const colonPos = content.indexOf(':');
      const key = content.slice(0, colonPos).trim();
      const valueStr = content.slice(colonPos + 1).trim();

      const targetObj = Array.isArray(parent.obj)
        ? parent.obj[parent.obj.length - 1]
        : parent.obj;

      if (valueStr === '' || valueStr === '[]') {
        if (valueStr === '[]') {
          targetObj[key] = [];
        } else {
          // Empty value - might have children
          if (Array.isArray(parent.obj)) {
            // Inside an array item - need to track pending on the item's frame
            const itemFrame = stack[stack.length - 1];
            itemFrame.pendingKey = key;
            itemFrame.pendingIndent = indent;
          } else {
            parent.pendingKey = key;
            parent.pendingIndent = indent;
          }
        }
      } else {
        targetObj[key] = parseValue(valueStr);
      }
    }
  }

  // Handle any remaining pending keys
  for (const frame of stack) {
    if (frame.pendingKey !== null) {
      frame.obj[frame.pendingKey] = null;
    }
  }

  return result;
}

/**
 * Parse a scalar value from YAML
 * @param {string} str - The value string to parse
 * @returns {*} Parsed value
 */
function parseValue(str) {
  // Already trimmed
  if (str === '' || str === 'null' || str === '~') {
    return null;
  }

  // Empty array
  if (str === '[]') {
    return [];
  }

  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;

  // Quoted string
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    const inner = str.slice(1, -1);
    // Handle escape sequences for double-quoted strings
    if (str.startsWith('"')) {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return inner;
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return str.includes('.') ? parseFloat(str) : parseInt(str, 10);
  }

  // Plain string
  return str;
}

/**
 * Serialize a JavaScript object to YAML string
 * Uses the objectToYaml from dag-schema for consistency
 * @param {Object} obj - Object to serialize
 * @returns {string} YAML string
 */
function stringify(obj) {
  const { objectToYaml } = require('./dag-schema');
  return objectToYaml(obj);
}

/**
 * Parse dag.yaml file content
 * Validates structure according to dag-schema
 * @param {string} content - File content
 * @returns {Object} Parsed DAG object
 */
function parseDagYaml(content) {
  const dag = parse(content);

  // Ensure arrays exist
  if (!dag.epics) dag.epics = [];
  if (!dag.blocked) dag.blocked = [];

  // Fill in defaults for epics
  for (const epic of dag.epics) {
    if (!epic.status) epic.status = 'pending';
    if (!epic.depends_on) epic.depends_on = [];
    if (!epic.features) epic.features = [];
    if (epic.worktree === undefined) epic.worktree = null;

    // Fill in defaults for features
    for (const feature of epic.features) {
      if (!feature.status) feature.status = 'pending';
      if (!feature.depends_on) feature.depends_on = [];
    }
  }

  return dag;
}

/**
 * Serialize DAG object to YAML file content
 * @param {Object} dag - DAG object to serialize
 * @returns {string} YAML string
 */
function stringifyDagYaml(dag) {
  // Clean up undefined values
  const clean = {
    epics: dag.epics.map(epic => ({
      id: epic.id,
      name: epic.name,
      status: epic.status,
      spec_path: epic.spec_path,
      worktree: epic.worktree || null,
      depends_on: epic.depends_on || [],
      features: (epic.features || []).map(feat => {
        const f = {
          id: feat.id,
          name: feat.name,
          status: feat.status,
          depends_on: feat.depends_on || []
        };
        if (feat.source_requirement) {
          f.source_requirement = feat.source_requirement;
        }
        return f;
      })
    }))
  };

  if (dag.blocked && dag.blocked.length > 0) {
    clean.blocked = dag.blocked.map(b => ({
      task_id: b.task_id,
      reason: b.reason,
      blocked_at: b.blocked_at,
      attempts: b.attempts || []
    }));
  }

  return stringify(clean);
}

module.exports = {
  parse,
  parseValue,
  stringify,
  parseDagYaml,
  stringifyDagYaml
};
