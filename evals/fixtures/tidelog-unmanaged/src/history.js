'use strict';

/**
 * Read deploy-hook events back out of the log, oldest first.
 * @param {Array<{kind: string, at: string, message: string}>} events
 * @param {{kind?: string}} [options]
 */
function filterEvents(events, options = {}) {
  const { kind } = options;
  return events
    .filter((event) => kind === undefined || event.kind === kind)
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

module.exports = { filterEvents };
