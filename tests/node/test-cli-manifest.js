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
 *   3. Flag parity and 4. subcommand parity — see those layers below.
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
// Layer 3: flag PARITY (live ≡ manifest, per command, both directions).
//
// Layers 1–2 pin the command set and the --json shapes but NOT the flag list.
// This layer derives each command's live flag set STATICALLY from what its
// handlers READ — `args.flags.X` / `args.options['X']` (the parser turns any
// `--x` into flags.x/options.x, so there is no declarative flag list to read)
// — and asserts it equals the union of the command's manifest `flags` and its
// subcommands' `flags`:
//   live ⊆ manifest — a flag the CLI accepts is declared (e.g. `loop --reset`);
//   manifest ⊆ live — a declared flag is one the CLI actually reads.
//
// `--json` is parsed once in cli.js into `asJson` and handed to the handlers,
// so a command reads `--json` when its handler source USES `asJson` (a
// parameter declaration alone does not count). `--help`/`-h` are global,
// handled before dispatch, and never listed per command.
// ---------------------------------------------------------------------------

console.log('  Layer 3: flag parity (live reads ≡ manifest flags, both directions)...');

const CLI_DIR = path.join(SCRIPT_DIR, 'cli');
const LIB_DIR = path.join(SCRIPT_DIR, 'lib');

const META_FLAGS = new Set(['--help', '-h']);

// Every flag a source READS, as `--flag` strings. Aliased reads (e.g.
// `const o = args.options; o['x']`) are NOT resolved — keep reads literal.
function liveFlagsFromSource(source) {
  const flags = new Set();
  const re = /args\.(?:flags|options)(?:\.([a-zA-Z_$][\w$]*)|\['([^']+)'\])/g;
  for (const m of source.matchAll(re)) {
    const flag = `--${m[1] || m[2]}`;
    if (!META_FLAGS.has(flag)) flags.add(flag);
  }
  // `asJson` in a function signature only receives the flag; any other
  // occurrence acts on it.
  const withoutSignatures = source.replace(/^.*\bfunction\b.*\basJson\b.*$/gm, '');
  if (/\basJson\b/.test(withoutSignatures)) flags.add('--json');
  return flags;
}

// The body of `case '<cmd>':` in cli.js's dispatch switch — where a command
// whose handler returns data (worktree) applies `--json` itself.
function cliCaseBody(cmd) {
  const m = CLI_SOURCE.match(new RegExp(`case '${cmd}': \\{([\\s\\S]*?)\\n {6}\\}`));
  if (!m) throw new Error(`Could not locate case '${cmd}' in cli.js`);
  return m[1];
}

const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');

// `learn` is spread over every `learn-*.js` file in scripts/cli/ — the
// entry/dispatch layer, the candidate-queue halves it coordinates, and the
// diary/reflect/instinct/recall workflow subgroups. The derivation reads them
// all, found by glob so a new sibling cannot be missed: a flag read living in
// an unscanned file would shrink the derived set and escape the gate.
const LEARN_FILES = fs.readdirSync(CLI_DIR).filter((f) => /^learn-.*\.js$/.test(f));
assert.ok(
  LEARN_FILES.includes('learn-workflow-command.js'),
  `learn flag scan must cover learn-workflow-command.js, found: ${LEARN_FILES.join(', ')}`,
);

const liveFlagSets = {
  eval: liveFlagsFromSource(read(CLI_DIR, 'eval-command.js')),
  learn: liveFlagsFromSource(LEARN_FILES.map((f) => read(CLI_DIR, f)).join('\n')),
  loop: liveFlagsFromSource(read(CLI_DIR, 'loop-command.js')),
  obsidian: liveFlagsFromSource(read(CLI_DIR, 'obsidian-command.js')),
  session: liveFlagsFromSource(read(CLI_DIR, 'session-command.js')),
  worktree: liveFlagsFromSource(
    `${read(LIB_DIR, 'worktree-generic.js')}\n${cliCaseBody('worktree')}`,
  ),
};

// A live flag may legitimately live on a subcommand's flags, so the manifest
// set is the union of top-level flags + every subcommand's flags.
function manifestFlagSet(entry) {
  const declared = new Set(entry.flags || []);
  for (const sub of Object.values(entry.subcommands || {})) {
    for (const f of sub.flags || []) declared.add(f);
  }
  return declared;
}

// Every command must be derived — none may silently escape this layer.
const uncovered = manifestKeys.filter((c) => !(c in liveFlagSets));
assert.deepStrictEqual(uncovered, [], `command(s) not flag-derived: ${uncovered.join(', ')}`);

const undeclared = [];
const unread = [];
for (const [cmd, live] of Object.entries(liveFlagSets)) {
  const declared = manifestFlagSet(CLI_MANIFEST[cmd]);
  for (const flag of live) if (!declared.has(flag)) undeclared.push(`${cmd} ${flag}`);
  for (const flag of declared) if (!live.has(flag)) unread.push(`${cmd} ${flag}`);
}
assert.deepStrictEqual(
  undeclared.sort(),
  [],
  `live CLI flag(s) missing from CLI_MANIFEST: ${undeclared.join(', ')}`,
);
console.log(`    ✓ ${manifestKeys.length} commands: every live flag is in the manifest`);
assert.deepStrictEqual(
  unread.sort(),
  [],
  `CLI_MANIFEST flag(s) no handler reads: ${unread.join(', ')}`,
);
console.log(`    ✓ ${manifestKeys.length} commands: every manifest flag is read by the CLI`);

// ---------------------------------------------------------------------------
// Layer 4: subcommand PARITY (live dispatch ≡ manifest `subcommands`, both
// directions). check:docs validates `arcforge <cmd> <sub> [<action>]` against
// the manifest's subcommand names, so a name the manifest lacks would fail a
// correct doc and a name the CLI dropped would pass a stale one.
//
// The live set is derived from each dispatcher's literal comparisons —
// `sub === 'x'` / `subcommand === 'x'` / `action === 'x'` — plus, for `learn`,
// the verb table and the workflow group set the dispatcher reads.
// ---------------------------------------------------------------------------

console.log('  Layer 4: subcommand parity (live dispatch ≡ manifest, both directions)...');

function dispatchedNames(source, variable) {
  const re = new RegExp(`\\b${variable} === '([a-z][a-z-]*)'`, 'g');
  return [...source.matchAll(re)].map((m) => m[1]);
}

// The body of `function <name>(` up to the next top-level function.
function functionBody(source, name) {
  const m = source.match(
    new RegExp(`\\nfunction ${name}\\(([\\s\\S]*?)\\n(?:function |module\\.)`),
  );
  if (!m) throw new Error(`Could not locate function ${name}`);
  return m[1];
}

const { ACTION_FOR_VERB } = require(path.join(CLI_DIR, 'learn-candidate-prose'));
const { WORKFLOW_GROUPS } = require(path.join(CLI_DIR, 'learn-workflow-command'));
const WORKFLOW_SOURCE = read(CLI_DIR, 'learn-workflow-command.js');
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

const liveSubcommands = {
  worktree: dispatchedNames(read(LIB_DIR, 'worktree-generic.js'), 'sub'),
  eval: dispatchedNames(read(CLI_DIR, 'eval-command.js'), 'subcommand'),
  obsidian: dispatchedNames(read(CLI_DIR, 'obsidian-command.js'), 'subcommand'),
  session: dispatchedNames(read(CLI_DIR, 'session-command.js'), 'subcommand'),
  learn: [
    ...dispatchedNames(read(CLI_DIR, 'learn-command.js'), 'subcommand'),
    ...Object.keys(ACTION_FOR_VERB),
    ...WORKFLOW_GROUPS,
  ],
};
const liveActions = Object.fromEntries(
  [...WORKFLOW_GROUPS].map((g) => [
    `learn ${g}`,
    dispatchedNames(functionBody(WORKFLOW_SOURCE, `run${capitalize(g)}`), 'action'),
  ]),
);

const uniqSorted = (names) => [...new Set(names)].sort();

for (const cmd of manifestKeys) {
  const declared = uniqSorted(Object.keys(CLI_MANIFEST[cmd].subcommands || {}));
  assert.deepStrictEqual(
    declared,
    uniqSorted(liveSubcommands[cmd] || []),
    `${cmd}: CLI_MANIFEST subcommands differ from the live dispatcher`,
  );
}
console.log(`    ✓ ${manifestKeys.length} commands: subcommand names match the dispatchers`);

for (const [key, live] of Object.entries(liveActions)) {
  const group = key.split(' ')[1];
  const declared = uniqSorted(Object.keys(CLI_MANIFEST.learn.subcommands[group].subcommands || {}));
  assert.ok(live.length > 0, `${key}: no live actions derived`);
  assert.deepStrictEqual(declared, uniqSorted(live), `${key}: manifest actions differ from live`);
}
console.log(`    ✓ ${WORKFLOW_GROUPS.size} learn workflow groups: action names match`);

const sessionAliasActions = dispatchedNames(
  functionBody(read(CLI_DIR, 'session-command.js'), 'runAlias'),
  'action',
);
assert.deepStrictEqual(
  uniqSorted(Object.keys(CLI_MANIFEST.session.subcommands.alias.subcommands)),
  uniqSorted(sessionAliasActions),
  'session alias: manifest actions differ from live',
);
console.log('    ✓ session alias: action names match');

console.log('\n✅ All cli-manifest contract tests passed!\n');
