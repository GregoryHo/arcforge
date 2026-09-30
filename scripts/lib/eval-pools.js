/**
 * eval-pools.js - Group result rows by the conditions they ran under
 *
 * A pool is a scenario version plus its run conditions: model, effort, the
 * per-trial ceiling, the turn budget and whether a plugin dir was loaded (B-8).
 * Rows measured under different conditions answered different questions, so a
 * reader never combines them. It judges the newest condition's pool and lists
 * the others beside it (D-021: pools measured on another instrument stay on
 * record, reported as such).
 *
 * Pure functions, no I/O. Zero external dependencies — Node.js standard library only.
 */

/** The row fields that make up a pool's run conditions. */
const CONDITION_FIELDS = ['model', 'effort', 'trialTimeoutMs', 'maxTurns', 'pluginDir'];

/**
 * The run conditions a row recorded; null for a field the row predates.
 * @param {Object} row - Result row
 * @returns {{ model: *, effort: *, trialTimeoutMs: *, maxTurns: *, pluginDir: * }}
 */
function conditionOf(row) {
  const conditions = {};
  for (const field of CONDITION_FIELDS) conditions[field] = row?.[field] ?? null;
  return conditions;
}

/** Stable identity of a row's conditions. */
function conditionKey(row) {
  return JSON.stringify(CONDITION_FIELDS.map((field) => row?.[field] ?? null));
}

/**
 * Split rows into pools by condition. The pool whose latest row is newest is
 * `current`, the one every verdict is computed over; `others` lists the rest
 * with their conditions and row counts, newest first.
 * @param {Object[]} rows - Result rows (already version-filtered)
 * @returns {{ current: Object[], conditions: Object|null, others: Array<{ conditions: Object, rows: number }> }}
 */
function splitPools(rows) {
  const pools = new Map();
  for (const row of rows) {
    const key = conditionKey(row);
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(row);
  }
  const latest = (pool) => pool.reduce((max, r) => (r.timestamp > max ? r.timestamp : max), '');
  const ordered = [...pools.values()].sort((a, b) => latest(b).localeCompare(latest(a)));
  const [current = [], ...rest] = ordered;
  return {
    current,
    conditions: current.length > 0 ? conditionOf(current[0]) : null,
    others: rest.map((pool) => ({ conditions: conditionOf(pool[0]), rows: pool.length })),
  };
}

/**
 * One-line description of a pool's conditions.
 * @param {Object} conditions - From conditionOf
 * @returns {string}
 */
function describeCondition(conditions) {
  const show = (value) => (value === null || value === undefined ? 'unrecorded' : value);
  const plugin =
    conditions.pluginDir === null || conditions.pluginDir === undefined
      ? 'unrecorded'
      : conditions.pluginDir
        ? 'yes'
        : 'no';
  return [
    `model ${show(conditions.model)}`,
    `effort ${show(conditions.effort)}`,
    `ceiling ${show(conditions.trialTimeoutMs)} ms`,
    `max turns ${conditions.maxTurns === null && conditions.pluginDir !== null ? 'none' : show(conditions.maxTurns)}`,
    `plugin dir ${plugin}`,
  ].join(', ');
}

/**
 * Lines naming the pools a verdict did not use, for printing beside it.
 * @param {Array<{ conditions: Object, rows: number }>} others
 * @param {string} [label] - Which arm, e.g. 'baseline'
 * @returns {string[]}
 */
function otherPoolLines(others, label) {
  return others.map(
    (p) =>
      `Not combined${label ? ` (${label})` : ''}: ${p.rows} row(s) under ${describeCondition(p.conditions)}`,
  );
}

module.exports = {
  CONDITION_FIELDS,
  conditionOf,
  conditionKey,
  splitPools,
  describeCondition,
  otherPoolLines,
};
