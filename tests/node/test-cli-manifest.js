#!/usr/bin/env node
/**
 * Contract test for scripts/lib/cli-manifest.js.
 *
 * Two structural defenses, both enforced BIDIRECTIONALLY:
 *
 *   1. Label parity — the manifest's top-level keys must exactly match the
 *      `switch (args.command)` case labels in cli.js. A command added to one
 *      side but not the other turns this RED. This is the defense against a
 *      downstream package adding a subcommand without updating the manifest
 *      that SRH-3/SRH-4 share.
 *
 *   2. Shape parity — for every command whose manifest `output` is non-null,
 *      run the live `<cmd> --json` in a deterministic git+dag fixture, reduce
 *      both the live output and the manifest shape to a key skeleton (keys +
 *      nested keys + array-element keys; values ignored), and assert exact set
 *      equality. No missing keys, no extra keys.
 *
 * Per the SRH-2 stop condition: a command whose live --json is environment
 * dependent / unpinnable is `output: null` in the manifest and skipped by the
 * shape layer here — never silently downgraded to a subset comparison.
 */

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT_DIR = path.resolve(__dirname, '../../scripts');
const CLI_PATH = path.join(SCRIPT_DIR, 'cli.js');
const CLI_SOURCE = fs.readFileSync(CLI_PATH, 'utf8');
const { CLI_MANIFEST } = require(path.join(SCRIPT_DIR, 'lib/cli-manifest'));

console.log('Testing cli-manifest.js contract...\n');

// ---------------------------------------------------------------------------
// Layer 1: label parity (manifest top-level keys ≡ cli.js switch case labels)
// ---------------------------------------------------------------------------

function extractCaseLabels(source) {
  const match = source.match(/switch \(args\.command\) \{([\s\S]*?)\n {2}\}/);
  if (!match) throw new Error('Could not locate the command switch block in cli.js');
  return [...match[1].matchAll(/case '([^']+)':/g)].map((m) => m[1]);
}

console.log('  Layer 1: label parity (both directions)...');
const caseLabels = extractCaseLabels(CLI_SOURCE).sort();
const manifestKeys = Object.keys(CLI_MANIFEST).sort();

assert.ok(caseLabels.length > 0, 'expected to find switch case labels in cli.js');

const missingFromManifest = caseLabels.filter((c) => !manifestKeys.includes(c));
const extraInManifest = manifestKeys.filter((k) => !caseLabels.includes(k));

assert.deepStrictEqual(
  missingFromManifest,
  [],
  `cli.js has command(s) absent from CLI_MANIFEST: ${missingFromManifest.join(', ')}`,
);
assert.deepStrictEqual(
  extraInManifest,
  [],
  `CLI_MANIFEST has key(s) with no cli.js command: ${extraInManifest.join(', ')}`,
);
assert.deepStrictEqual(manifestKeys, caseLabels);
console.log(`    ✓ ${caseLabels.length} command labels match exactly (both directions)`);

// ---------------------------------------------------------------------------
// Skeleton reduction: a value → its shape, dropping all leaf values.
//   object   → { key: skeleton(value), ... }
//   array    → [] if empty, else [ skeleton(merged-element) ]
//   scalar   → null  (leaf marker; presence of the key is all that's pinned)
// ---------------------------------------------------------------------------

function skeleton(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    // Merge every element's keys so a non-uniform array still yields the union
    // skeleton — exact equality then catches any element that adds/drops a key.
    return [value.map(skeleton).reduce(mergeSkeleton)];
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = skeleton(value[key]);
    }
    return out;
  }
  return null;
}

function mergeSkeleton(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    return [mergeSkeleton(a[0], b[0])];
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      out[key] = key in a && key in b ? mergeSkeleton(a[key], b[key]) : (a[key] ?? b[key]);
    }
    return out;
  }
  return a;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value), null, 2);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Deterministic fixture: an empty git repo. CLAUDE_PROJECT_DIR points here so
// the live probes below run against a known-clean working tree.
// ---------------------------------------------------------------------------

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-manifest-test-'));

function runCli(argArray, options = {}) {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...argArray], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: testDir },
      cwd: testDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.status || 1,
    };
  }
}

execFileSync('git', ['init'], { cwd: testDir, stdio: 'pipe' });
execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir, stdio: 'pipe' });
execFileSync('git', ['config', 'user.name', 'Test'], { cwd: testDir, stdio: 'pipe' });
execFileSync('git', ['commit', '-m', 'init', '--allow-empty'], { cwd: testDir, stdio: 'pipe' });

// ---------------------------------------------------------------------------
// Layer 2: shape parity for every command with a non-null pinned output.
//
// Each probe is order-independent: `setup` (re)writes the dag and runs any
// state-mutating pre-commands so that the live `<cmd> --json` it then runs has
// every pinned array non-empty (element keys derivable).
// ---------------------------------------------------------------------------

const liveProbes = [
  {
    command: 'worktree',
    // The pinned shape lives on the `list` subcommand; this base-only fixture
    // yields a single kind:base entry with no conditional epic/spec_id keys.
    setup: () => {},
    argsFn: () => ['worktree', 'list', '--json'],
    manifestShapeFor: (entry) => entry.subcommands.list.output,
  },
];

console.log('  Layer 2: shape parity (live --json vs manifest, pinned commands)...');

// Guard: the set of commands the manifest pins (output !== null, or a pinned
// subcommand output) must equal the set we live-probe — no pinned shape is
// allowed to go un-exercised, and no probe is allowed without a pinned shape.
const pinnedCommands = manifestKeys.filter((cmd) => {
  const entry = CLI_MANIFEST[cmd];
  if (entry.output !== null) return true;
  if (entry.subcommands) {
    return Object.values(entry.subcommands).some((s) => s.output != null);
  }
  return false;
});
const probedCommands = liveProbes.map((p) => p.command).sort();
assert.deepStrictEqual(
  probedCommands,
  pinnedCommands.sort(),
  `every pinned command must be live-probed: pinned=${pinnedCommands} probed=${probedCommands}`,
);

for (const probe of liveProbes) {
  const entry = CLI_MANIFEST[probe.command];
  const manifestShape = probe.manifestShapeFor ? probe.manifestShapeFor(entry) : entry.output;
  const expected = stableStringify(skeleton(manifestShape));

  probe.setup();
  const result = runCli(probe.argsFn());
  assert.strictEqual(
    result.exitCode,
    0,
    `live '${probe.command}' --json exited ${result.exitCode}: ${result.stderr || ''}`,
  );

  let live;
  try {
    live = JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`live '${probe.command}' --json was not valid JSON: ${err.message}`);
  }
  const actual = stableStringify(skeleton(live));

  assert.strictEqual(
    actual,
    expected,
    `shape mismatch for '${probe.command}':\n--- manifest ---\n${expected}\n--- live ---\n${actual}`,
  );
  console.log(`    ✓ ${probe.command} live --json shape matches manifest`);
}

// Cleanup
fs.rmSync(testDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Layer 3: flag COMPLETENESS (live ⊆ manifest, per command).
//
// Layers 1–2 pin the command set and the --json shapes but NOT the flag list,
// so a live flag absent from a command's manifest `flags` (e.g. `loop --reset`)
// went undetected. This layer derives each command's live flag
// set STATICALLY from the handlers' actual `args.flags.X` / `args.options['X']`
// reads (the parser turns any `--x` into flags.x/options.x, so there is no
// declarative flag list to read — what a handler READS is what it accepts) and
// asserts every live command-specific flag appears in that command's manifest
// `flags`. One-directional (live ⊆ manifest): extra manifest entries are not the
// concern here; a live flag missing from the manifest is.
//
// One ambient read is handled explicitly so it does not produce false
// positives or escape enforcement: the META flags `--json` and `--help`/`-h`
// are global, listed selectively (never `--help`/`-h`), and excluded from the
// live set.
// ---------------------------------------------------------------------------

console.log('  Layer 3: flag completeness (live reads ⊆ manifest flags)...');

const CLI_DIR = path.join(SCRIPT_DIR, 'cli');
const LIB_DIR = path.join(SCRIPT_DIR, 'lib');

// Global meta flags — read in cli.js (lines 93, 104), apply to every command,
// and are listed selectively (or never, for --help/-h). Excluded from the
// derived live set so they never force a manifest entry.
const META_FLAGS = new Set(['--json', '--help', '-h']);

// Scan a source string for every flag a handler READS and return them as a Set
// of `--flag` strings, minus the meta flags. Matches both boolean reads
// (args.flags.X / args.flags['X']) and value reads (args.options.X /
// args.options['X']). Aliased reads (e.g. `const o = args.options; o['x']`) are
// NOT resolved — a file that only reads via an alias yields an empty set, which
// is trivially ⊆ manifest (sound, just under-covered); sdd-gate is such a file
// and is reported as scoped-out below.
function liveFlagsFromSource(source) {
  const flags = new Set();
  const re = /args\.(?:flags|options)(?:\.([a-zA-Z_$][\w$]*)|\['([^']+)'\])/g;
  for (const m of source.matchAll(re)) {
    const name = m[1] || m[2];
    const flag = `--${name}`;
    if (!META_FLAGS.has(flag)) flags.add(flag);
  }
  return flags;
}

const evalSource = fs.readFileSync(path.join(CLI_DIR, 'eval-command.js'), 'utf8');
const learnSource = fs.readFileSync(path.join(CLI_DIR, 'learn-command.js'), 'utf8');
const loopSource = fs.readFileSync(path.join(CLI_DIR, 'loop-command.js'), 'utf8');
const obsidianSource = fs.readFileSync(path.join(CLI_DIR, 'obsidian-command.js'), 'utf8');
const worktreeSource = fs.readFileSync(path.join(LIB_DIR, 'worktree-generic.js'), 'utf8');

// Derive the live flag set per command. Every shipped command is derivable
// from a literal `args.flags.X` / `args.options.X` scan, so nothing is
// scoped out.
const SCOPED_OUT = new Set([]);

const liveFlagSets = {};
liveFlagSets.eval = liveFlagsFromSource(evalSource);
liveFlagSets.learn = liveFlagsFromSource(learnSource);
// `loop` is not a DAG command: its handler lives in cli/loop-command.js and it
// reads no --spec-id (its task source is a task-list file, not a spec DAG).
liveFlagSets.loop = liveFlagsFromSource(loopSource);
liveFlagSets.obsidian = liveFlagsFromSource(obsidianSource);
liveFlagSets.worktree = liveFlagsFromSource(worktreeSource);

// Manifest allowed set per command. For commands with pinned subcommands
// (worktree), a live flag may legitimately live on a subcommand's flags, so the
// allowed set is the union of top-level flags + every subcommand's flags.
function manifestAllowedFlags(entry) {
  const allowed = new Set(entry.flags || []);
  if (entry.subcommands) {
    for (const sub of Object.values(entry.subcommands)) {
      for (const f of sub.flags || []) allowed.add(f);
    }
  }
  return allowed;
}

// Every command must be either derived (in liveFlagSets) or explicitly scoped
// out — no command may silently escape this layer.
const uncovered = manifestKeys.filter((c) => !(c in liveFlagSets) && !SCOPED_OUT.has(c));
assert.deepStrictEqual(
  uncovered,
  [],
  `command(s) neither flag-derived nor scoped-out of the completeness check: ${uncovered.join(', ')}`,
);

const gaps = [];
for (const [cmd, live] of Object.entries(liveFlagSets)) {
  const allowed = manifestAllowedFlags(CLI_MANIFEST[cmd]);
  for (const flag of live) {
    if (!allowed.has(flag)) gaps.push(`${cmd} ${flag}`);
  }
}
assert.deepStrictEqual(
  gaps.sort(),
  [],
  `live CLI flag(s) missing from CLI_MANIFEST: ${gaps.join(', ')}`,
);
console.log(
  `    ✓ ${Object.keys(liveFlagSets).length} commands: every live flag is in the manifest`,
);

console.log('\n✅ All cli-manifest contract tests passed!\n');
