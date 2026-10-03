/**
 * Atomic file replacement, shared by every engine module that rewrites a file
 * other processes may read at the same moment.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Temp files `atomicWriteFile` writes in the destination's directory, named by
// the writing process's PID. The name does not carry the destination's: its
// length stays fixed, so it fits wherever the destination's name does.
const ATOMIC_TEMP_PATTERN = /^\.atomic-(\d+)-[0-9a-f]{12}\.tmp$/;

/** Whether `pid` is a process that exists (EPERM: it does, under another user). */
function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Remove temp files left in `dir` by writers that died before finishing. A
 * temp whose writer is alive is in flight and is left to it; one whose PID has
 * been reused by now stays until that process exits.
 */
function removeDeadWriterTemps(dir) {
  for (const name of fs.readdirSync(dir)) {
    const match = ATOMIC_TEMP_PATTERN.exec(name);
    if (!match || Number(match[1]) === process.pid || processExists(Number(match[1]))) continue;
    try {
      fs.rmSync(path.join(dir, name), { force: true });
    } catch {
      // Litter that will not go (a directory by that name, no permission) is not
      // this write's failure: the write never touches that name.
    }
  }
}

/**
 * Atomic write: create a temp file unique to this write in the destination's directory
 * (`.atomic-<pid>-<random>.tmp`), exclusively (`wx` fails rather than follow a link planted
 * there), and rename it over `dest` (replacing a symlink there, not writing through it).
 * Concurrent writers never share a temp file, so a reader sees one complete write or another.
 * The temp is removed on any failure; temps left by writers that died are removed by the next
 * write in the directory. Returns `destPath`.
 */
function atomicWriteFile(destPath, content, options = { encoding: 'utf8' }) {
  const dir = path.dirname(destPath);
  const tmpPath = path.join(
    dir,
    `.atomic-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  fs.mkdirSync(dir, { recursive: true });
  removeDeadWriterTemps(dir);
  let fd;
  try {
    fd = fs.openSync(tmpPath, 'wx');
  } catch (err) {
    throw new Error(`Cannot create temp file ${tmpPath}: ${err.message}`, { cause: err });
  }
  try {
    try {
      fs.writeFileSync(fd, content, options);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
  return destPath;
}

module.exports = { atomicWriteFile };
