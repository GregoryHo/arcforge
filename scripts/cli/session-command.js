/**
 * session-command.js - Handler for the `session` CLI command (cli B-9).
 *
 * save <alias> [--file <path>]   archive the five handover sections (stdin when no --file)
 * resume <alias|path>            print an archive or a .handovers/ file
 * list [--limit N] [--json]      the project's archives, newest first
 * alias set|remove|list          manage the project's alias index
 */

const fs = require('node:fs');
const path = require('node:path');
const { output } = require('./shared');
const { getProjectName } = require('../lib/utils');
const {
  saveArchive,
  listArchives,
  resolveSessionRef,
  readHandover,
  formatSessionBriefing,
} = require('../lib/session-utils');
const { setAlias, deleteAlias, listAliases } = require('../lib/session-aliases');

function usage(line) {
  console.error(`Usage: arcforge session ${line}`);
  process.exit(1);
}

function readInput(file) {
  if (file) return fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');
  if (process.stdin.isTTY) {
    usage('save <alias> [--file <path>]  (pipe the five sections on stdin, or pass --file)');
  }
  return fs.readFileSync(0, 'utf-8');
}

function parseLimit(raw) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--limit must be a positive integer, got "${raw}"`);
  }
  return n;
}

function runSave(args, project) {
  const alias = args.positional[1];
  if (!alias) usage('save <alias> [--file <path>]');
  const result = saveArchive(project, alias, readInput(args.options.file));
  console.log(
    `Saved session archive: ${result.path} (alias "${result.alias}", ${result.isNew ? 'new' : 'updated'})`,
  );
}

function runResume(args, project) {
  const ref = args.positional[1];
  if (!ref) usage('resume <alias|path>');
  const file = resolveSessionRef(project, ref, process.cwd());
  console.log(formatSessionBriefing(fs.readFileSync(file, 'utf-8'), file));
}

function runList(args, project, asJson) {
  const archives = listArchives(project, { limit: parseLimit(args.options.limit) });
  if (asJson) {
    output({ project, archives }, true);
  } else if (archives.length === 0) {
    console.log(`No session archives for project "${project}". Run: arcforge session save <alias>`);
  } else {
    for (const a of archives) {
      console.log(`  ${a.date}  ${a.aliases.join(', ') || '-'}  ${a.title || ''}  ${a.path}`);
    }
  }
}

function runAlias(args, project, asJson) {
  const action = args.positional[1];
  const name = args.positional[2];

  if (action === 'set') {
    const target = args.positional[3];
    if (!name || !target) usage('alias set <name> <alias|path>');
    const file = resolveSessionRef(project, target, process.cwd());
    const { title } = readHandover(fs.readFileSync(file, 'utf-8'), file);
    const result = setAlias(project, name, file, title);
    if (!result.success) throw new Error(`alias "${name}": ${result.error}`);
    console.log(`Alias "${name}" → ${file}`);
    return;
  }

  if (action === 'remove') {
    if (!name) usage('alias remove <name>');
    const result = deleteAlias(project, name);
    if (!result.success) throw new Error(result.error);
    console.log(`Removed alias "${name}"`);
    return;
  }

  if (action === 'list') {
    const aliases = listAliases(project);
    if (asJson) {
      output({ project, aliases }, true);
    } else if (aliases.length === 0) {
      console.log(`No session aliases for project "${project}".`);
    } else {
      for (const a of aliases) console.log(`  ${a.name} → ${a.sessionPath}`);
    }
    return;
  }

  usage('alias <set|remove|list> [...args]');
}

function runSessionCommand(args, { asJson }) {
  const subcommand = args.positional[0];
  const project = getProjectName();

  if (subcommand === 'save') return runSave(args, project);
  if (subcommand === 'resume') return runResume(args, project);
  if (subcommand === 'list') return runList(args, project, asJson);
  if (subcommand === 'alias') return runAlias(args, project, asJson);

  usage('<save|resume|list|alias> [...args]');
}

module.exports = { runSessionCommand };
