/**
 * learning-opt-in-period.js — the arithmetic of the effective learning opt-in
 * (learning B-19): each scope's latest authorized period, and the start of the
 * stretch of them that reaches the present.
 *
 * Pure. `learning.js` owns the opt-in config, reads it, and hands in each
 * scope's legacy start — its `updated_at`, else the file's mtime, else 0 — so
 * nothing here touches the filesystem.
 *
 * Two kinds of bad input get two answers. A bad stamp INSIDE a config is data —
 * a hand edit, another engine — and yields no period, the conservative
 * direction. A bad ARGUMENT is a caller bug and throws with context: a NaN
 * start would otherwise flow out as the effective opt-in, silencing the
 * stale-draft warning and handing the curator an invalid date.
 *
 * Every ambiguity resolves the same way: when the stored stamps cannot show
 * that authorization was continuous, the instant moves LATER, never earlier.
 * Too late only hides a stale-draft warning; too early would let the curator
 * analyze what was recorded before an opt-out (learning B-1, D-023).
 */

function assertScopeArgs(name, config, legacyStart) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${name}: config must be an object (got ${JSON.stringify(config)})`);
  }
  if (typeof legacyStart !== 'number' || !Number.isFinite(legacyStart)) {
    throw new Error(`${name}: legacyStart must be a finite number (got ${String(legacyStart)})`);
  }
}

function assertPeriod(period, index) {
  if (period === null) return;
  const ok =
    typeof period === 'object' &&
    Number.isFinite(period.start) &&
    (period.end === Infinity || Number.isFinite(period.end)) &&
    period.end >= period.start;
  if (!ok) {
    throw new Error(
      `effectiveOptIn: period ${index} must be null or { start, end } with a finite start ` +
        `and an end at or after it (got ${JSON.stringify(period)})`,
    );
  }
}

/** Epoch ms of a string stamp; NaN for anything else, a number included. */
function parseStamp(value) {
  return typeof value === 'string' ? Date.parse(value) : Number.NaN;
}

/**
 * Whether an ENABLED scope's period starts at its `enabled_at` rather than at
 * its legacy start. Every engine stamps `updated_at` on the enable that starts a
 * period, and 6.3 stamps `enabled_at` alike, so the later of the two is never
 * earlier than the real start. The earlier one can be stale: an enable recorded
 * by an engine that predates `enabled_at` (6.1.2–6.2.x) leaves an older
 * period's start behind, and reading it would reach back across the opt-out
 * between the two periods.
 *
 * @param {Object} config - the scope's config
 * @param {number} legacyStart - its `updated_at`, else mtime, else 0, in epoch ms
 * @returns {boolean}
 */
function startsAtEnabledAt(config, legacyStart) {
  assertScopeArgs('startsAtEnabledAt', config, legacyStart);
  const enabledAt = parseStamp(config.enabled_at);
  return !Number.isNaN(enabledAt) && enabledAt >= legacyStart;
}

/**
 * One scope's latest authorized period as `{ start, end }` in epoch ms — `end`
 * is Infinity while the scope is enabled — or null when it has none the
 * engine can vouch for.
 *
 * A disabled scope's period is `enabled_at` up to its disable, and it is
 * trusted only when `disabled_at` equals `updated_at`. A 6.3 disable writes
 * both from the same instant; an engine that predates the marker stamps
 * `updated_at` on every transition and leaves `disabled_at` behind, and the
 * oldest engines drop both keys. A mismatch, a missing marker, an unusable
 * stamp, or an `enabled_at` later than the disable (clock skew) therefore
 * means a transition 6.3 did not record, so the period is unproven and
 * contributes nothing.
 *
 * @param {Object} config - the scope's config, `enabled` already a boolean
 * @param {number} legacyStart - its `updated_at`, else mtime, else 0, in epoch ms
 * @returns {{ start: number, end: number }|null}
 * @throws when `config` is not an object or `legacyStart` is not finite
 */
function scopePeriod(config, legacyStart) {
  assertScopeArgs('scopePeriod', config, legacyStart);
  if (config.enabled === true) {
    const start = startsAtEnabledAt(config, legacyStart)
      ? parseStamp(config.enabled_at)
      : legacyStart;
    return { start, end: Infinity };
  }
  if (typeof config.disabled_at !== 'string' || config.disabled_at !== config.updated_at) {
    return null;
  }
  const start = parseStamp(config.enabled_at);
  const end = parseStamp(config.updated_at);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return { start, end };
}

/**
 * The start of the stretch of authorization that reaches the present, from the
 * periods of the scopes that can authorize, or null when none is enabled.
 *
 * The floor is the earliest live start, pulled back to a disabled period that
 * ended strictly AFTER it began. A disable stamped at the very instant the
 * floor began leaves the same state whichever came first, so it cannot show an
 * overlap and is read as a lapse. There are two scopes and at least one is
 * live, so at most one period has ended and a single pass is exact.
 *
 * @param {Array<{ start: number, end: number }|null>} periods
 * @returns {number|null}
 * @throws when `periods` is not an array or holds a malformed period
 */
function effectiveOptIn(periods) {
  if (!Array.isArray(periods)) {
    throw new Error(`effectiveOptIn: periods must be an array (got ${typeof periods})`);
  }
  periods.forEach(assertPeriod);
  const known = periods.filter(Boolean);
  const live = known.filter((period) => period.end === Infinity);
  if (live.length === 0) return null;
  let floor = Math.min(...live.map((period) => period.start));
  for (const { start, end } of known) {
    if (start < floor && end > floor) floor = start;
  }
  return floor;
}

module.exports = { effectiveOptIn, scopePeriod, startsAtEnabledAt };
