#!/usr/bin/env node
/**
 * Sessions CLI — save, resume, list, alias, aliases
 *
 * Session management for continuity across conversations.
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
  generateSession,
  listSessions,
  formatSessionBriefing,
  parseSessionSections,
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

  const content = generateSession(session, null, {
    summary: args[1] || '',
    whatWorked: args[2] || '',
    whatFailed: args[3] || '',
    blockers: args[4] || '',
    nextStep: args[5] || '',
  });

  const savedPath = path.join(
    getSessionDir(project, date),
    `session-${alias}.md`,
  );
  writeFileSafe(savedPath, content);

  if (args[0]) {
    const result = setAlias(project, alias, savedPath);
    console.log(
      result.success
        ? `Alias created: ${alias}`
        : `Alias failed: ${result.error}`,
    );
  }

  console.log(`Session saved: ${savedPath}`);
}

function cmdResume(args) {
  const project = getProjectName();
  const arg = args[0];

  let sessionPath;
  if (arg) {
    const resolved = resolveAlias(project, arg);
    sessionPath = resolved ? resolved.sessionPath : arg;
  } else {
    // Find most recent saved session (listSessions already sorts by lastUpdated desc)
    const { sessions } = listSessions(project, { limit: 100 });
    const saved = sessions.find((s) => s.type === 'saved');
    if (saved) {
      sessionPath = path.join(
        os.homedir(), '.claude', 'sessions', project, saved.dateStr, saved.filename,
      );
    }
  }

  if (!sessionPath) {
    console.log('No saved session found. Use /sessions save to create one.');
    process.exit(1);
  }

  let content;
  try {
    content = fs.readFileSync(sessionPath, 'utf-8');
  } catch {
    console.log(`Session not found: ${sessionPath}`);
    process.exit(1);
  }

  console.log(formatSessionBriefing(content, sessionPath));
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) flags.limit = parseInt(args[i + 1], 10);
    if (args[i] === '--date' && args[i + 1]) flags.date = args[i + 1];
    if (args[i] === '--query' && args[i + 1]) flags.query = args[i + 1];
  }
  return flags;
}

function cmdList(args) {
  const project = getProjectName();
  const flags = parseFlags(args);
  const { sessions, total } = listSessions(project, {
    limit: flags.limit || 20,
    date: flags.date || null,
    query: flags.query || null,
  });

  console.log(
    `Sessions for ${project} (showing ${sessions.length} of ${total}):`,
  );
  console.log('');
  console.log('ID              Date        Messages  Tools   Type');
  console.log('────────────────────────────────────────────────────');

  for (const s of sessions) {
    const id = (s.sessionId || '').replace('session-', '').slice(0, 12).padEnd(14);
    const date = (s.dateStr || '').padEnd(12);
    const type = s.type || 'auto';
    if (type === 'saved') {
      console.log(`${id}${date}${'—'.padEnd(10)}${'—'.padEnd(8)}saved`);
    } else {
      const msgs = String(s.userMessages || 0).padEnd(10);
      const tools = String(s.toolCalls || 0).padEnd(8);
      console.log(`${id}${date}${msgs}${tools}auto`);
    }
  }
}

function cmdAlias(args) {
  const project = getProjectName();
  const sessionPath = args[0];
  const alias = args[1];

  if (!sessionPath || !alias) {
    console.log('Usage: /sessions alias <session-path> <name>');
    process.exit(1);
  }

  const result = setAlias(project, alias, sessionPath);
  console.log(
    result.success
      ? `Alias created: ${alias} → ${sessionPath}`
      : `Error: ${result.error}`,
  );
}

function cmdAliases() {
  const project = getProjectName();
  const aliases = listAliases(project);

  if (aliases.length === 0) {
    console.log('No saved sessions. Use /sessions save <name> to create one.');
    process.exit(0);
  }

  console.log(`Saved Sessions (${aliases.length}):`);
  console.log('');
  console.log('Name            Date        Summary');
  console.log('─────────────────────────────────────────────────────');
  for (const a of aliases) {
    const name = a.name.padEnd(14);
    // Extract date from session path (e.g., .../2026-03-17/session-eval.md)
    const dateMatch = (a.sessionPath || '').match(/(\d{4}-\d{2}-\d{2})/);
    const date = (dateMatch ? dateMatch[1] : '').padEnd(12);
    let summary = '';
    try {
      const content = fs.readFileSync(a.sessionPath, 'utf-8');
      const sections = parseSessionSections(content);
      if (sections.summary && !sections.summary.includes('TO BE ENRICHED')) {
        summary = sections.summary.split('\n')[0].slice(0, 60);
        if (sections.summary.length > 60) summary += '...';
      }
    } catch (err) {
      summary = err.code === 'ENOENT' ? '(file missing)' : '(unreadable)';
    }
    console.log(`${name} ${date}${summary}`);
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
      cmdList(rest);
      break;
    case 'alias':
      cmdAlias(rest);
      break;
    case 'aliases':
      cmdAliases();
      break;
    default:
      console.log('Sessions CLI — Session management\n');
      console.log('Usage: sessions.js <command> [options]\n');
      console.log('Commands:');
      console.log('  save [alias] [summary] [whatWorked] [whatFailed] [blockers] [nextStep]');
      console.log('  resume [alias]         Load saved session and show briefing');
      console.log('  list [--limit N] [--date YYYY-MM-DD] [--query id]  List sessions');
      console.log('  alias <path> <name>    Create alias for saved session');
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
