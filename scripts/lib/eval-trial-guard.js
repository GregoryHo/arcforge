/**
 * eval-trial-guard.js - Detect a trial that wrote outside its own directory
 *
 * Trial isolation is advisory, not a sandbox: the agent runs with the
 * operator's filesystem permissions and can edit anything it can reach. What
 * the runner CAN do is notice afterwards. A trial that changed the repository
 * it was launched from measured a different environment than its arm
 * describes, and may have altered what the next trial sees (a diagramming
 * treatment edited a shipped template this way). So the runner snapshots the
 * repository around every trial and reports whatever changed.
 *
 * The snapshot is path → (mtime, size, mode) for every file, taken with lstat and
 * never following symlinks. Skipped: `.git`, `node_modules`, the trial dirs
 * under `.eval-trials/`, the results tree `evals/results/` (the runner's own
 * output), and any nested directory that holds its own `.git` entry (another
 * repository or worktree, not this one). An edit the operator makes in the
 * same repository while a trial runs is indistinguishable from the trial's
 * and is reported the same way.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');

const SKIP_NAMES = new Set(['.git', 'node_modules', '.eval-trials']);
const SKIP_RELATIVE = new Set([path.join('evals', 'results')]);
/** Walk budget per root: past this, the snapshot is marked incomplete. */
const MAX_ENTRIES = 50000;

/**
 * Snapshot a directory tree.
 * @param {string} root - Absolute directory to walk
 * @param {number} [maxEntries=MAX_ENTRIES] - Files to record before giving up
 * @returns {{ files: Map<string, string>, complete: boolean }} rel path → "mtimeMs:size:mode"
 */
function snapshotTree(root, maxEntries = MAX_ENTRIES) {
  const files = new Map();
  const stack = [''];
  let complete = true;
  while (stack.length > 0) {
    const rel = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue; // unreadable or vanished directory: nothing to compare in it
    }
    if (rel && entries.some((e) => e.name === '.git')) continue; // nested repository
    for (const entry of entries) {
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      if (SKIP_NAMES.has(entry.name) || SKIP_RELATIVE.has(childRel)) continue;
      if (entry.isDirectory()) {
        stack.push(childRel);
        continue;
      }
      if (files.size >= maxEntries) {
        complete = false;
        return { files, complete };
      }
      try {
        const st = fs.lstatSync(path.join(root, childRel));
        files.set(childRel, `${st.mtimeMs}:${st.size}:${st.mode}`);
      } catch {
        /* vanished between readdir and lstat: absent from this snapshot */
      }
    }
  }
  return { files, complete };
}

/**
 * Paths added, changed or removed between two snapshots of the same root.
 * @param {Map<string, string>} before
 * @param {Map<string, string>} after
 * @returns {string[]} Sorted relative paths
 */
function diffSnapshots(before, after) {
  const changed = [];
  for (const [rel, sig] of after) if (before.get(rel) !== sig) changed.push(rel);
  for (const rel of before.keys()) if (!after.has(rel)) changed.push(rel);
  return changed.sort();
}

/**
 * Start watching repository roots for writes; call the returned function after
 * the trial to get what changed. Every distinct root is walked on its own: a
 * plugin dir nested in the project may sit under a skipped name or hold its own
 * `.git` (a separate checkout), and the project walk would then never see it.
 * A path both walks cover is reported once.
 * @param {string[]} roots - Directories the trial must leave untouched
 * @param {{ maxEntries?: number }} [opts] - Walk budget per root
 * @returns {() => { changed: string[], incomplete: Array<{ root: string, seen: number }> }}
 *   changed paths are absolute; a root past the budget is listed in incomplete
 *   with the number of files seen, and its changes are unknown
 */
function watchForWrites(roots, { maxEntries = MAX_ENTRIES } = {}) {
  const resolved = [...new Set(roots.filter(Boolean).map((r) => path.resolve(r)))];
  const before = resolved.map((root) => ({ root, snap: snapshotTree(root, maxEntries) }));
  return () => {
    const changed = new Set();
    const incomplete = [];
    for (const { root, snap } of before) {
      const after = snapshotTree(root, maxEntries);
      if (!snap.complete || !after.complete) {
        incomplete.push({ root, seen: Math.max(snap.files.size, after.files.size) });
        continue;
      }
      for (const rel of diffSnapshots(snap.files, after.files)) changed.add(path.join(root, rel));
    }
    return { changed: [...changed].sort(), incomplete };
  };
}

module.exports = { snapshotTree, diffSnapshots, watchForWrites, MAX_ENTRIES };
