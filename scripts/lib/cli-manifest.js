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
 *   3. Flag parity: each command's `flags` (with its subcommands' flags) equal
 *      the flags its handlers read — no undeclared flag, no unread entry.
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
 * `subcommands` names every subcommand the command dispatches (and, for the
 * `learn` workflow groups, every action under one) — check:docs rejects a doc
 * that names any other, and Layer 4 of the contract test pins the names to
 * the live dispatchers in both directions.
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

/**
 * Subcommands that carry no flags or output of their own — their flags are
 * declared on the command, because the handler reads them there.
 * @param {...string} list
 * @returns {Object<string, {}>}
 */
function names(...list) {
  return Object.fromEntries(list.map((name) => [name, {}]));
}

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

  // eval list reads project evals/; subcommands spawn/serve → no pinned JSON
  // contract. `eval report --json` prints the benchmark object, unpinned.
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
      '--json',
    ],
    subcommands: names(
      'list',
      'run',
      'preflight',
      'lint',
      'ab',
      'compare',
      'report',
      'history',
      'audit',
      'dashboard',
    ),
    output: null,
  },

  // Reads global ~/.arcforge learning state → not deterministic here.
  //
  // Two flag families share this command. The lifecycle subcommands take
  // `--project`/`--global` as bare SCOPE selectors; the diary/reflect/instinct/
  // recall workflow subgroups take `--project <name>` as a VALUE. The two
  // subcommand sets are disjoint, so the overload never has to be disambiguated.
  learn: {
    flags: [
      '--project',
      '--global',
      '--json',
      '--port',
      // diary
      '--date',
      '--session',
      '--content',
      '--draft',
      // reflect
      '--diaries',
      '--reflection',
      '--summary',
      // instinct
      '--trigger',
      '--action',
      '--domain',
      '--evidence',
      '--evidence-count',
      '--source',
      // recall
      '--query',
      '--instinct-ids',
    ],
    subcommands: {
      ...names(
        'status',
        'enable',
        'disable',
        'analyze',
        'inbox',
        'review',
        'drafts',
        'inspect',
        'approve',
        'reject',
        'accept',
        'materialize',
        'activate',
        'dashboard',
      ),
      // The workflow subgroups take an action as their second positional.
      diary: { subcommands: names('path', 'save', 'finalize') },
      reflect: { subcommands: names('scan', 'record') },
      instinct: {
        subcommands: names(
          'status',
          'check',
          'save',
          'confirm',
          'contradict',
          'deactivate',
          'restore',
        ),
      },
      recall: { subcommands: names('record') },
    },
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
    subcommands: names('register', 'unregister', 'set-default', 'list-vaults'),
    output: null,
  },
};

module.exports = { CLI_MANIFEST };
