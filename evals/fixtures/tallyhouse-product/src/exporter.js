'use strict';

/**
 * Export a stored run. Formatting only — an exporter never re-executes the
 * query behind the run (spec reports.md B-3).
 */

const FORMATS = ['json'];

function formatFor(kind, run) {
  if (kind === 'json') return toJson(run);
  throw new Error(`unsupported export kind: ${kind}`);
}

function toJson(run) {
  const rows = run.rows.map((row) => {
    const ordered = {};
    for (const column of run.columns) ordered[column] = row[column];
    return ordered;
  });
  return JSON.stringify({ runId: run.id, columns: run.columns, rows }, null, 2);
}

function availableFormats() {
  return FORMATS.slice();
}

module.exports = { formatFor, toJson, availableFormats };
