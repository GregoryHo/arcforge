/**
 * coordinator.js - Core coordinator facade for arcforge DAG
 *
 * Manages the DAG lifecycle: task scheduling, status tracking,
 * worktree management, and synchronization. Implementations live in
 * sibling modules:
 *   - coordinator-core.js          Coordinator class + private plumbing
 *   - coordinator-worktree-ops.js  worktree lifecycle + sync methods
 *                                  (attached to the prototype by core)
 *   - coordinator-multi-spec.js    cross-spec module-level operations
 *
 * This module re-exports the full coordinator surface so existing importers
 * (cli.js, loop.js, tests) keep resolving every name from here. It never
 * imports those callers back.
 */

const { Coordinator } = require('./coordinator-core');
const { listSpecDagPaths, syncAllSpecs, rebootAllSpecs } = require('./coordinator-multi-spec');
const { readArcforgeMarker } = require('./marker');

module.exports = {
  Coordinator,
  listSpecDagPaths,
  syncAllSpecs,
  rebootAllSpecs,
  readArcforgeMarker,
};
