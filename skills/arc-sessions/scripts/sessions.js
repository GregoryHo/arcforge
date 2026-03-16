#!/usr/bin/env node
/**
 * Sessions CLI — save, resume, list, alias, aliases
 *
 * Session checkpoint management for continuity across conversations.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  getProjectName,
  getSessionId,
  getDateString,
  getSessionDir,
  loadSession,
  writeFileSafe,
} = require('../../../scripts/lib/utils');
const {
  generateCheckpoint,
  listSessions,
  formatSessionBriefing,
} = require('../../../scripts/lib/session-utils');
const {
  setAlias,
  resolveAlias,
  listAliases,
} = require('../../../scripts/lib/session-aliases');

function cmdSave(args) {
  const project = getProjectName();
  const date = getDateString();
  const sessionId = getSessionId();
  const session = loadSession() || { sessionId, project, date };
  const alias = args[0] || sessionId.replace('session-', '').slice(0, 8);

  const checkpoint = generateCheckpoint(session, null, {
    summary: args[1] || '',
    whatWorked: args[2] || '',
    whatFailed: args[3] || '',
    blockers: args[4] || '',
    nextStep: args[5] || '',
  });

  const checkpointPath = path.join(
    getSessionDir(project, date),
    `checkpoint-${alias}.md`,
  );
  writeFileSafe(checkpointPath, checkpoint);

  if (args[0]) {
    const result = setAlias(project, alias, checkpointPath);
    console.log(
      result.success
        ? `Alias created: ${alias}`
        : `Alias failed: ${result.error}`,
    );
  }

  console.log(`Checkpoint saved: ${checkpointPath}`);
}

function cmdResume(args) {
  const project = getProjectName();
  const arg = args[0];

  let checkpointPath;
  if (arg) {
    const resolved = resolveAlias(project, arg);
    checkpointPath = resolved ? resolved.checkpointPath : arg;
  } else {
    const { sessions } = listSessions(project, { limit: 100 });
    for (const s of sessions) {
      const dir = path.dirname(
        path.join(
          os.homedir(),
          '.claude',
          'sessions',
          project,
          s.dateStr,
          s.filename,
        ),
      );
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => f.startsWith('checkpoint-'))
        : [];
      if (files.length > 0) {
        checkpointPath = path.join(dir, files.sort().reverse()[0]);
        break;
      }
    }
  }

  if (!checkpointPath) {
    console.log('No checkpoint found. Use /sessions save to create one.');
    process.exit(1);
  }

  const content = fs.existsSync(checkpointPath)
    ? fs.readFileSync(checkpointPath, 'utf-8')
    : null;
  if (!content) {
    console.log(`Checkpoint not found: ${checkpointPath}`);
    process.exit(1);
  }

  console.log(formatSessionBriefing(content, checkpointPath));
}

function cmdList() {
  const project = getProjectName();
  const { sessions, total } = listSessions(project, { limit: 20 });
  const aliases = listAliases(project);
  const aliasMap = {};
  for (const a of aliases) aliasMap[a.checkpointPath] = a.name;

  console.log(
    `Sessions for ${project} (showing ${sessions.length} of ${total}):`,
  );
  console.log('');
  console.log('ID              Date        Messages  Tools   Alias');
  console.log('────────────────────────────────────────────────────');

  for (const s of sessions) {
    const id = (s.sessionId || '').replace('session-', '').slice(0, 12).padEnd(14);
    const date = (s.dateStr || '').padEnd(12);
    const msgs = String(s.userMessages || 0).padEnd(10);
    const tools = String(s.toolCalls || 0).padEnd(8);
    const alias =
      Object.entries(aliasMap).find(([p]) => p.includes(s.sessionId)) || [];
    console.log(`${id}${date}${msgs}${tools}${alias[1] || ''}`);
  }
}

function cmdAlias(args) {
  const project = getProjectName();
  const checkpointPath = args[0];
  const alias = args[1];

  if (!checkpointPath || !alias) {
    console.log('Usage: /sessions alias <checkpoint-path> <name>');
    process.exit(1);
  }

  const result = setAlias(project, alias, checkpointPath);
  console.log(
    result.success
      ? `Alias created: ${alias} → ${checkpointPath}`
      : `Error: ${result.error}`,
  );
}

function cmdAliases() {
  const project = getProjectName();
  const aliases = listAliases(project);

  if (aliases.length === 0) {
    console.log('No aliases found. Use /sessions save <name> to create one.');
    process.exit(0);
  }

  console.log(`Session Aliases (${aliases.length}):`);
  console.log('');
  console.log('Name            Updated              Title');
  console.log('─────────────────────────────────────────────────────');
  for (const a of aliases) {
    const name = a.name.padEnd(14);
    const updated = (a.updatedAt || a.createdAt || '').slice(0, 19).padEnd(21);
    const title = a.title || '';
    console.log(`${name} ${updated} ${title}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  switch (command) {
    case 'save':
      cmdSave(rest);
      break;
    case 'resume':
      cmdResume(rest);
      break;
    case 'list':
      cmdList();
      break;
    case 'alias':
      cmdAlias(rest);
      break;
    case 'aliases':
      cmdAliases();
      break;
    default:
      console.log('Sessions CLI — Session checkpoint management\n');
      console.log('Usage: sessions.js <command> [options]\n');
      console.log('Commands:');
      console.log('  save [alias] [summary] [whatWorked] [whatFailed] [blockers] [nextStep]');
      console.log('  resume [alias]         Load checkpoint and show briefing');
      console.log('  list                   List recent sessions');
      console.log('  alias <path> <name>    Create alias for checkpoint');
      console.log('  aliases                List all aliases');
      break;
  }
}

module.exports = {
  cmdSave,
  cmdResume,
  cmdList,
  cmdAlias,
  cmdAliases,
};

if (require.main === module) {
  main();
}
