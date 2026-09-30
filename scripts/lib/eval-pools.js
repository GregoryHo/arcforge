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
 * A comparison pairs its arms on the same conditions (pairArms); the plugin
 * dir alone may differ, since loading it is the treatment.
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
 * The conditions both arms of a comparison must share. pluginDir is left out:
 * loading the plugin is the treatment itself, so it may differ between arms.
 */
const PAIR_FIELDS = CONDITION_FIELDS.filter((field) => field !== 'pluginDir');

/** Identity of a row's conditions as far as arm pairing is concerned. */
function pairKey(row) {
  return JSON.stringify(PAIR_FIELDS.map((field) => row?.[field] ?? null));
}

/** Group rows by full condition key; returns [{ key, pair, rows, latest }]. */
function poolsOf(rows) {
  const pools = new Map();
  for (const row of rows) {
    const key = conditionKey(row);
    if (!pools.has(key)) pools.set(key, { key, pair: pairKey(row), rows: [], latest: '' });
    const pool = pools.get(key);
    pool.rows.push(row);
    if (row.timestamp > pool.latest) pool.latest = row.timestamp;
  }
  return [...pools.values()];
}

/**
 * Choose the pools an A/B comparison is judged on: the newest pair of pools,
 * one per arm, that ran under the same model, effort, ceiling and turn budget
 * (B-8). Each arm's newest pool on its own is not enough: a fresh baseline
 * paired with an older treatment run under other conditions compares two
 * instruments, not two arms. A pair counts from when its later-starting arm
 * existed (the older of the two pools' latest rows). Every pool not chosen is
 * listed in `unpaired`; with no common pair at all, `error` says so.
 * @param {Object[]} baselineRows
 * @param {Object[]} treatmentRows
 * @returns {{ baseline: Object[], treatment: Object[], conditions: Object|null, unpaired: Array<{ arm: string, conditions: Object, rows: number }>, error?: string }}
 */
function pairArms(baselineRows, treatmentRows) {
  const bPools = poolsOf(baselineRows);
  const tPools = poolsOf(treatmentRows);
  let best = null;
  for (const b of bPools) {
    for (const t of tPools) {
      if (b.pair !== t.pair) continue;
      const since = b.latest < t.latest ? b.latest : t.latest;
      if (!best || since > best.since) best = { b, t, since };
    }
  }
  const list = (arm, pools) =>
    pools
      .filter((p) => p !== best?.b && p !== best?.t)
      .sort((x, y) => y.latest.localeCompare(x.latest))
      .map((p) => ({ arm, conditions: conditionOf(p.rows[0]), rows: p.rows.length }));
  const unpaired = [...list('baseline', bPools), ...list('treatment', tPools)];
  if (!best) {
    return {
      baseline: [],
      treatment: [],
      conditions: null,
      unpaired,
      error:
        'The baseline and treatment arms have no run conditions in common (model, effort, ceiling, turn budget), so no comparison is valid. Rerun eval ab so both arms run under the same conditions.',
    };
  }
  return {
    baseline: best.b.rows,
    treatment: best.t.rows,
    conditions: conditionOf(best.t.rows[0]),
    unpaired,
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
  pairKey,
  pairArms,
  describeCondition,
  otherPoolLines,
};
