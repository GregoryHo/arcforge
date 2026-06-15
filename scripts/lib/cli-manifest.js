/**
 * cli-manifest.js — frozen contract for the arcforge CLI surface.
 *
 * This is the single shared source of truth for two structural defenses
 * against the "broken seam" defect class (a doc or downstream consumer
 * promising a CLI flag/field the engine never emits):
 *   - SRH-3 deterministic pipeline smoke reads it to assert the seam chain.
 *   - SRH-4 doc-reference linter reads `flags` (R2) and the `--json` field
 *     promises (R3) — it is FORBIDDEN a second copy of this data.
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
 *   - spawns/serves/is interactive (loop, ratify, research, eval dashboards)
 *   - reads global ~/.arcforge state (learn, obsidian, eval list)
 *   - needs a fake HOME + populated worktrees to exercise (expand, merge,
 *     cleanup, sync) — that fixture machinery is SRH-3's explicit charter
 *     (mkdtemp repo + fake HOME), so pinning a shape here that this test
 *     cannot live-verify would be worse than null (looks verified, isn't).
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
  status: {
    flags: ['--blocked', '--json', '--spec-id'],
    output: {
      epics: [
        {
          id: null,
          name: null,
          status: null,
          progress: null,
          worktree: null,
          path: null,
          features: [{ id: null, name: null, status: null }],
        },
      ],
      blocked: [{ task_id: null, reason: null }],
    },
  },

  next: {
    flags: ['--json', '--spec-id'],
    output: { id: null, name: null, type: null },
  },

  complete: {
    flags: ['--json', '--spec-id'],
    output: { success: null, task_id: null },
  },

  block: {
    flags: ['--json', '--spec-id'],
    output: { success: null, task_id: null },
  },

  parallel: {
    // --features switches the JSON shape to feature-level readiness
    // ({ count, features: [...] }); without it, the default epic-level shape
    // below is what the contract test live-probes.
    flags: ['--features', '--json', '--spec-id'],
    output: { count: null, epics: [{ id: null, name: null }] },
  },

  // Needs a fake HOME + ready epic to create real worktrees → SRH-3 charter.
  expand: {
    flags: ['--epic', '--project-setup', '--verify', '--verify-cmd', '--json', '--spec-id'],
    output: null,
  },

  // Needs populated worktrees to merge → SRH-3 charter.
  merge: {
    flags: ['--base', '--json', '--spec-id'],
    output: null,
  },

  // Needs populated worktrees to remove → SRH-3 charter.
  cleanup: {
    flags: ['--json', '--spec-id'],
    output: null,
  },

  // Data-moving directions need a fake HOME + worktree context → SRH-3 charter.
  sync: {
    flags: ['--direction', '--json', '--spec-id'],
    output: null,
  },

  reboot: {
    flags: ['--json', '--spec-id'],
    output: {
      // null when no task is in flight; the object shape when one exists.
      // The contract fixture always has a current task, so the object shape
      // is what gets live-verified.
      current_task: { id: null, name: null, type: null, status: null },
      remaining_count: null,
      completed_count: null,
      blocked_count: null,
      project_goal: null,
      research_files: [],
    },
  },

  // Spawns claude sessions — no JSON contract.
  loop: {
    flags: [
      '--pattern',
      '--max-runs',
      '--max-cost',
      '--epic',
      '--max-parallel',
      '--no-project-setup',
      '--spec-id',
      '--task-timeout',
      '--permission-mode',
      '--allowed-tools',
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

  // `schema --json` is a deterministic serialization of the dag.yaml schema
  // definition (scripts/lib/dag-schema.js). Fully pinnable — drift in either
  // direction (engine adds a schema field, or this manifest goes stale) is the
  // RED the contract test exists to produce. SRH-3 lists dag-schema among the
  // seven seams; SRH-4 R3 verifies doc field-promises against it.
  schema: {
    flags: ['--json', '--example'],
    output: {
      epics: {
        type: null,
        description: null,
        items: {
          id: { type: null, required: null, description: null },
          name: { type: null, required: null, description: null },
          status: { type: null, required: null, enum: [null], default: null, description: null },
          spec_path: { type: null, required: null, description: null },
          worktree: { type: null, required: null, description: null },
          depends_on: { type: null, items: null, required: null, default: [], description: null },
          features: {
            type: null,
            required: null,
            default: [],
            description: null,
            items: {
              id: { type: null, required: null, description: null },
              name: { type: null, required: null, description: null },
              status: {
                type: null,
                required: null,
                enum: [null],
                default: null,
                description: null,
              },
              source_requirement: { type: null, required: null, description: null },
              depends_on: {
                type: null,
                items: null,
                required: null,
                default: [],
                description: null,
              },
            },
          },
        },
      },
      blocked: {
        type: null,
        required: null,
        description: null,
        items: {
          task_id: { type: null, required: null, description: null },
          reason: { type: null, required: null, description: null },
          blocked_at: { type: null, required: null, description: null },
          attempts: {
            type: null,
            required: null,
            default: [],
            description: null,
            items: {
              action: { type: null, description: null },
              attempt_at: { type: null, description: null },
              result: { type: null, description: null },
            },
          },
        },
      },
    },
  },

  // eval list reads project evals/; subcommands spawn/serve → no JSON contract.
  eval: {
    flags: [
      '--k',
      '--model',
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

  // Serves an HTTP dashboard → no JSON contract.
  research: {
    flags: ['--results', '--config', '--port'],
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

  // Interactive informed-confirm flow → no JSON contract.
  ratify: {
    flags: [],
    output: null,
  },
  // Stages need spec fixtures + a draft on stdin to exercise; a deterministic
  // full-key-set live --json belongs to SRH-3's fixture charter, so output is
  // deliberately not pinned here (see the null criterion in the header).
  'sdd-gate': {
    flags: ['--spec-id', '--design', '--decision-log', '--draft'],
    output: null,
  },
};

module.exports = { CLI_MANIFEST };
