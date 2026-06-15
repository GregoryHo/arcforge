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
// Deterministic fixture: a git repo with a per-spec dag.yaml. CLAUDE_PROJECT_DIR
// points here so the coordinator commands resolve the single spec.
// ---------------------------------------------------------------------------

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-manifest-test-'));
const dagDir = path.join(testDir, 'specs', 'test-spec');
const dagPath = path.join(dagDir, 'dag.yaml');

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

function writeDag(yaml) {
  fs.mkdirSync(dagDir, { recursive: true });
  fs.writeFileSync(dagPath, yaml);
  execFileSync('git', ['add', '-A'], { cwd: testDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'dag', '--allow-empty'], { cwd: testDir, stdio: 'pipe' });
}

execFileSync('git', ['init'], { cwd: testDir, stdio: 'pipe' });
execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir, stdio: 'pipe' });
execFileSync('git', ['config', 'user.name', 'Test'], { cwd: testDir, stdio: 'pipe' });

// Two epics: epic-001 in_progress (one done + one pending feature), epic-002
// pending and ready once epic-001 completes. Variants of this dag drive each
// probe so every pinned array is non-empty when its command is exercised.
function dag({ epic001Status, feat001Status, feat002Status, epic002Status, feat00201Status }) {
  return `epics:
  - id: epic-001
    name: Test Epic
    status: ${epic001Status}
    spec_path: docs/spec.md
    worktree: null
    depends_on: []
    features:
      - id: feat-001
        name: Feature 1
        status: ${feat001Status}
        depends_on: []
      - id: feat-002
        name: Feature 2
        status: ${feat002Status}
        depends_on: []
  - id: epic-002
    name: Second Epic
    status: ${epic002Status}
    spec_path: docs/spec2.md
    worktree: null
    depends_on:
      - epic-001
    features:
      - id: feat-002-01
        name: Feature 2.1
        status: ${feat00201Status}
        depends_on: []
`;
}

const IN_PROGRESS_DAG = dag({
  epic001Status: 'in_progress',
  feat001Status: 'completed',
  feat002Status: 'pending',
  epic002Status: 'pending',
  feat00201Status: 'pending',
});

// epic-001 fully complete → epic-002 becomes a ready parallel candidate, and
// `next` resolves to the epic (type: epic). Used by parallel/next.
const EPIC001_DONE_DAG = dag({
  epic001Status: 'completed',
  feat001Status: 'completed',
  feat002Status: 'completed',
  epic002Status: 'pending',
  feat00201Status: 'pending',
});

// ---------------------------------------------------------------------------
// Layer 2: shape parity for every command with a non-null pinned output.
//
// Each probe is order-independent: `setup` (re)writes the dag and runs any
// state-mutating pre-commands so that the live `<cmd> --json` it then runs has
// every pinned array non-empty (element keys derivable).
// ---------------------------------------------------------------------------

const liveProbes = [
  {
    command: 'status',
    // Block a feature so `blocked` is non-empty alongside the epics list.
    setup: () => {
      writeDag(IN_PROGRESS_DAG);
      runCli(['block', 'feat-002', 'waiting on review']);
    },
    argsFn: () => ['status', '--json'],
  },
  {
    command: 'next',
    setup: () => writeDag(IN_PROGRESS_DAG),
    argsFn: () => ['next', '--json'],
  },
  {
    command: 'complete',
    setup: () => writeDag(IN_PROGRESS_DAG),
    argsFn: () => ['complete', 'feat-002', '--json'],
  },
  {
    command: 'block',
    setup: () => writeDag(IN_PROGRESS_DAG),
    argsFn: () => ['block', 'feat-002', 'waiting', '--json'],
  },
  {
    command: 'parallel',
    // epic-002 ready → epics array non-empty.
    setup: () => writeDag(EPIC001_DONE_DAG),
    argsFn: () => ['parallel', '--json'],
  },
  {
    command: 'reboot',
    setup: () => writeDag(IN_PROGRESS_DAG),
    argsFn: () => ['reboot', '--json'],
  },
  {
    command: 'schema',
    setup: () => {},
    argsFn: () => ['schema', '--json'],
  },
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

console.log('\n✅ All cli-manifest contract tests passed!\n');
