#!/usr/bin/env node
// skills/arc-agent-driven/scripts/task-brief.js
//
// Assemble a per-task brief (task text + acceptance criteria + base SHA) into a
// file the implementer reads, so the brief is a stable handoff artifact in the
// .arcforge/sdd/ workspace rather than living only in the controller's context.
//
// Usage: task-brief.js --task <text> --base <sha> [--acceptance <text>]
//                      [--number <N>] [--out <file>]
//   env fallback: SDD_TASK, SDD_ACCEPTANCE, SDD_BASE, SDD_TASK_NUMBER, SDD_OUT
// Output file (default): <repo>/.arcforge/sdd/task-<N>-brief.md
//   (or task-brief.md when --number is omitted).
// Prints the written brief path to stdout.

const fs = require('node:fs');
const path = require('node:path');
const { ensureWorkspace } = require('./sdd-workspace');

/**
 * Parse `--key value` flags into an object.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

/**
 * Assemble and write a task brief.
 * @param {object} opts
 * @param {string} opts.task - full task text (required).
 * @param {string} opts.base - base SHA / ref (required).
 * @param {string} [opts.acceptance] - acceptance criteria text.
 * @param {string} [opts.number] - task number, used in the default filename.
 * @param {string} [opts.out] - explicit output file path.
 * @param {string} [opts.cwd] - working directory (defaults to process.cwd()).
 * @returns {{ outPath: string }}
 */
function buildTaskBrief({ task, base, acceptance, number, out, cwd = process.cwd() }) {
  if (!task || !task.trim()) {
    throw new Error('--task is required (the full task text).');
  }
  if (!base || !base.trim()) {
    throw new Error('--base is required (the pre-implementer BASE SHA).');
  }

  let outPath = out;
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  } else {
    const dir = ensureWorkspace(cwd);
    outPath = path.join(dir, number ? `task-${number}-brief.md` : 'task-brief.md');
  }

  const body = [
    number ? `# Task Brief: Task ${number}` : '# Task Brief',
    '',
    '## Base SHA',
    '',
    base,
    '',
    '## Task',
    '',
    task,
    '',
    '## Acceptance Criteria',
    '',
    acceptance && acceptance.trim() ? acceptance : '(see task text)',
    '',
  ].join('\n');

  fs.writeFileSync(outPath, body);
  return { outPath };
}

function main(argv) {
  const args = parseArgs(argv);
  const { outPath } = buildTaskBrief({
    task: args.task || process.env.SDD_TASK,
    base: args.base || process.env.SDD_BASE,
    acceptance: args.acceptance || process.env.SDD_ACCEPTANCE,
    number: args.number || process.env.SDD_TASK_NUMBER,
    out: args.out || process.env.SDD_OUT,
  });
  process.stdout.write(`${outPath}\n`);
}

module.exports = { buildTaskBrief, parseArgs };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}
