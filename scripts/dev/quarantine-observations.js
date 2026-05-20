#!/usr/bin/env node
/**
 * Quarantine the observation backlog before adopting the 3.1 learning pivot.
 *
 * For each project under ~/.arcforge/observations/, rename
 *   observations.jsonl
 * to
 *   observations.jsonl.quarantine.<UTC compact timestamp>
 *
 * Quarantined files are chmod'd to 600 and moved out of the default reader
 * glob. Nothing is deleted — re-mate by renaming the quarantine file back.
 *
 * Usage:
 *   node scripts/dev/quarantine-observations.js              # dry-run (default)
 *   node scripts/dev/quarantine-observations.js --apply      # perform renames
 *   node scripts/dev/quarantine-observations.js --root DIR   # override observations root
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function defaultRoot() {
  return path.join(os.homedir(), '.arcforge', 'observations');
}

function compactTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function listProjectObservationFiles(root) {
  if (!fs.existsSync(root)) return [];
  const projects = fs.readdirSync(root, { withFileTypes: true });
  const out = [];
  for (const entry of projects) {
    if (!entry.isDirectory()) continue;
    const obsPath = path.join(root, entry.name, 'observations.jsonl');
    if (!fs.existsSync(obsPath)) continue;
    const stat = fs.statSync(obsPath);
    out.push({ project: entry.name, path: obsPath, size: stat.size });
  }
  return out;
}

function quarantineFile(srcPath, ts) {
  const target = `${srcPath}.quarantine.${ts}`;
  fs.renameSync(srcPath, target);
  fs.chmodSync(target, 0o600);
  return target;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function parseArgs(argv) {
  const opts = { apply: false, root: defaultRoot() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opts.apply = true;
    else if (argv[i] === '--root') opts.root = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') opts.help = true;
    else if (argv[i].startsWith('--')) {
      console.error(`Unknown flag: ${argv[i]}`);
      process.exit(1);
    }
  }
  return opts;
}

function printHelp() {
  console.log(
    [
      'Usage: node scripts/dev/quarantine-observations.js [--apply] [--root DIR]',
      '',
      'Rename ~/.arcforge/observations/<project>/observations.jsonl to',
      '  observations.jsonl.quarantine.<ts> (chmod 600) for every project.',
      '',
      '  --apply       perform the renames (default is dry-run)',
      '  --root DIR    use DIR instead of ~/.arcforge/observations',
      '  --help        show this message',
    ].join('\n'),
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const files = listProjectObservationFiles(opts.root);
  if (files.length === 0) {
    console.log(`No observations.jsonl found under ${opts.root}.`);
    return;
  }

  const ts = compactTimestamp();
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const mode = opts.apply ? 'APPLY' : 'DRY-RUN';

  console.log(`[${mode}] Quarantine plan for ${opts.root}`);
  console.log(`  Projects: ${files.length}`);
  console.log(`  Total:    ${formatBytes(totalBytes)}`);
  if (opts.apply) console.log(`  Suffix:   .quarantine.${ts}`);
  console.log('');

  let quarantined = 0;
  let bytesMoved = 0;
  for (const file of files) {
    const targetSuffix = `.quarantine.${ts}`;
    if (opts.apply) {
      try {
        const target = quarantineFile(file.path, ts);
        console.log(`  ✓ ${file.project} (${formatBytes(file.size)}) → ${path.basename(target)}`);
        quarantined++;
        bytesMoved += file.size;
      } catch (err) {
        console.error(`  ✗ ${file.project}: ${err.message}`);
      }
    } else {
      console.log(
        `  • ${file.project} (${formatBytes(file.size)}) → observations.jsonl${targetSuffix}`,
      );
    }
  }

  console.log('');
  if (opts.apply) {
    console.log(`Quarantined ${quarantined}/${files.length} files (${formatBytes(bytesMoved)}).`);
  } else {
    console.log('Dry-run only. Re-run with --apply to perform renames.');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  defaultRoot,
  compactTimestamp,
  listProjectObservationFiles,
  quarantineFile,
  formatBytes,
  parseArgs,
};
