/**
 * cli-manifest.js — frozen contract for the arcforge CLI surface.
 *
 * This is the single shared source of truth for the structural defense
 * against the "broken seam" defect class (a doc or downstream consumer
 * promising a CLI flag/field the engine never emits): the SRH-4
 * doc-reference linter reads `flags` (R2) and the `--json` field promises
 * (R3) — it is FORBIDDEN a second copy of this data.
 *
 * The contract test (tests/node/test-cli-manifest.js) enforces this file
 * BIDIRECTIONALLY against the live CLI:
 *   1. Label parity: the top-level keys here ≡ cli.js's `switch (args.command)`
 *      case labels (both directions, exhaustively). A downstream package that
 *      adds a subcommand without updating this manifest turns the test RED —
 *      by design.
 *   2. Shape parity: for every command whose `output` is non-null, the test
 *      runs the live `<cmd> --json` in a deterministic fixture and asserts the
 *      key skeleton (keys + nested keys + array-element keys; values ignored)
 *      matches `output` EXACTLY — no missing keys, no extra keys.
 *
 * `output: null` means "shape deliberately not pinned by the live contract
 * test", NOT "shape unknown". A command is null'd when the contract test
 * cannot produce a deterministic live `--json` AND do a FULL key-set
 * comparison without machinery that belongs to another task:
 *   - spawns/serves/is interactive (loop, eval dashboards)
 *   - reads global ~/.arcforge state (learn, obsidian, eval list)
 *
 * Pinning a shape MUST NOT require changing cli.js output — that belongs to a
 * capability package, not this contract.
 *
 * Skeleton conventions for the `output` value (matching the comparator in
 * the contract test):
 *   - an object literal describes an object's keys
 *   - a one-element array `[ <shape> ]` describes a non-empty array whose
 *     elements all match `<shape>`
 *   - an empty array `[]` describes an array whose element shape is not
 *     pinned (e.g. always-empty in the fixture, or heterogeneous values)
 *   - `null` as a leaf value pins only the key's presence, not a sub-shape
 *     (the live value may legitimately be null or a scalar)
 */

const CLI_MANIFEST = {
  // Spawns claude sessions — no JSON contract.
  loop: {
    flags: [
      '--tasks',
      '--max-runs',
      '--max-cost',
      '--task-timeout',
      '--model',
      '--permission-mode',
      '--allowed-tools',
      '--verify-cmd',
      '--verifier',
      '--max-retries',
      '--reset',
    ],
    output: null,
  },

  worktree: {
    flags: ['--branch', '--from', '--setup', '--force', '--json'],
    subcommands: {
      add: { flags: ['--branch', '--from', '--setup'] },
      list: {
        flags: ['--json'],
        output: { count: null, worktrees: [{ path: null, branch: null, head: null, kind: null }] },
      },
      remove: { flags: ['--force'] },
    },
    // The top-level `worktree` command itself has no single --json shape;
    // the pinned shape lives on the `list` subcommand.
    output: null,
  },

  // eval list reads project evals/; subcommands spawn/serve → no JSON contract.
  eval: {
    flags: [
      '--k',
      '--model',
      '--effort',
      '--no-isolate',
      '--plugin-dir',
      '--max-turns',
      '--since',
      '--top',
      '--port',
      '--skill-file',
      '--interleave',
    ],
    output: null,
  },

  // Reads global ~/.arcforge learning state → not deterministic here.
  learn: {
    flags: ['--project', '--global', '--json', '--port'],
    output: null,
  },

  // Reads global ~/.arcforge vault registry → not deterministic here.
  obsidian: {
    flags: [
      '--path',
      '--name',
      '--default',
      '--preset',
      '--scope',
      '--search-preferred',
      '--qmd-collection',
      '--json',
    ],
    output: null,
  },
};

module.exports = { CLI_MANIFEST };
