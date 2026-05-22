#!/usr/bin/env node
/**
 * Recall CLI — save, check-duplicate, save-record
 *
 * Manual instinct creation from user session context.
 */

const { saveInstinct, checkInstinctDuplicate } = require('../../../scripts/lib/instinct-writer');
const { saveRecallRecord } = require('../../../scripts/lib/recall-record-writer');

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      flags[key] = value;
    }
  }

  return { command, flags };
}

function cmdSave(flags) {
  const { id, trigger, action, domain, project, evidence } = flags;
  const evidenceCount = parseInt(flags['evidence-count'], 10) || 1;

  if (!id || !trigger || !action || !project) {
    console.error('Usage: recall.js save --id X --trigger "..." --action "..." --project P [--domain D] [--evidence "..."] [--evidence-count N]');
    process.exit(1);
  }

  const result = saveInstinct({
    id,
    trigger,
    action,
    project,
    domain: domain || 'uncategorized',
    source: 'manual',
    evidence: evidence || '',
    maxConfidence: undefined, // Uses default MAX_CONFIDENCE (0.9)
    evidenceCount
  });

  if (result.isNew) {
    console.log(`Created instinct: ${result.path} (confidence: ${result.confidence.toFixed(2)})`);
  } else {
    console.log(`Updated instinct: ${result.path} (confidence: ${result.confidence.toFixed(2)})`);
  }
}

function cmdSaveRecord(flags) {
  const { project, session, summary } = flags;
  const recallId = flags['recall-id'];
  const query = flags['query'] || flags['recall-query'];
  const homeDir = flags['home-dir'];
  const returnedIds = flags['instinct-ids'];

  if (!project || !recallId) {
    console.error('Error: Missing required arguments');
    console.log('Usage: recall.js save-record --project X --recall-id Y [--session Z] [--query "..."] [--summary "..."] [--instinct-ids "a,b,c"] [--home-dir DIR]');
    process.exit(1);
  }

  const returnedInstinctIds = returnedIds ? returnedIds.split(',').filter(Boolean) : [];

  saveRecallRecord({
    recall_id: recallId,
    project,
    project_id: flags['project-id'] || '',
    session: session || '',
    created_at: new Date().toISOString(),
    recall_query: query || '',
    returned_instinct_ids: returnedInstinctIds,
    summary: summary || '',
    homeDir,
  });

  console.log(`✓ Saved recall record: ${recallId}`);
}

function cmdCheckDuplicate(flags) {
  const { id, project } = flags;

  if (!id || !project) {
    console.error('Usage: recall.js check-duplicate --id X --project P');
    process.exit(1);
  }

  console.log(checkInstinctDuplicate(id, project));
}

function main() {
  const { command, flags } = parseArgs(process.argv);

  switch (command) {
    case 'save':
      cmdSave(flags);
      break;
    case 'check-duplicate':
      cmdCheckDuplicate(flags);
      break;
    case 'save-record':
      cmdSaveRecord(flags);
      break;
    default:
      console.log('Recall CLI — Manual instinct creation\n');
      console.log('Usage: recall.js <command> [options]\n');
      console.log('Commands:');
      console.log('  save                  Save a new instinct');
      console.log('  check-duplicate       Check if instinct name exists\n');
      console.log('Options:');
      console.log('  --id <name>           Instinct ID (kebab-case)');
      console.log('  --trigger "..."       When to apply');
      console.log('  --action "..."        What to do');
      console.log('  --project <name>      Project name');
      console.log('  --domain <name>       Category (default: uncategorized)');
      console.log('  --evidence "..."      Supporting context');
      console.log('  --evidence-count <N>  Number of times observed (default: 1)');
      break;
  }
}

// Export for testing
module.exports = {
  parseArgs,
  cmdSave,
  cmdCheckDuplicate,
  cmdSaveRecord,
};

if (require.main === module) {
  main();
}
