#!/usr/bin/env node
/**
 * Reflect CLI — strategy, scan, update-log, auto-check, save-instinct
 *
 * Diary reflection and pattern extraction from session history.
 */

const {
  getProcessedLogPath,
  scanDiaries,
  determineReflectStrategy,
  updateProcessedLog
} = require('../../../scripts/lib/session-utils');
const { saveInstinct } = require('../../../scripts/lib/instinct-writer');
const { REFLECT_MAX_CONFIDENCE } = require('../../../scripts/lib/confidence');

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

function cmdStrategy(flags) {
  const { project } = flags;
  if (!project) {
    console.error('Error: Missing required argument --project');
    console.log('Usage: reflect.js strategy --project X');
    process.exit(1);
  }
  const logPath = getProcessedLogPath(project);
  console.log(determineReflectStrategy(project, logPath));
}

function cmdScan(flags) {
  const { project, strategy } = flags;
  if (!project || !strategy) {
    console.error('Error: Missing required arguments');
    console.log('Usage: reflect.js scan --project X --strategy Y');
    process.exit(1);
  }
  const logPath = getProcessedLogPath(project);
  const diaries = scanDiaries(project, strategy, logPath);
  diaries.forEach(d => console.log(d));
}

function cmdUpdateLog(flags) {
  const { project, diaries, reflection } = flags;
  if (!project || !diaries || !reflection) {
    console.error('Error: Missing required arguments');
    console.log('Usage: reflect.js update-log --project X --diaries "a,b,c" --reflection Z');
    process.exit(1);
  }
  const logPath = getProcessedLogPath(project);
  const diaryFiles = diaries.split(',');
  updateProcessedLog(logPath, diaryFiles, reflection);
  console.log(`✓ Updated processed.log with ${diaryFiles.length} entries`);
}

function cmdAutoCheck(flags) {
  const { project } = flags;
  if (!project) {
    console.error('Error: Missing required argument --project');
    console.log('Usage: reflect.js auto-check --project X');
    process.exit(1);
  }
  const logPath = getProcessedLogPath(project);
  const strategy = determineReflectStrategy(project, logPath);
  const diaries = scanDiaries(project, strategy, logPath);
  const status = diaries.length >= 3 ? 'ready' : 'not-ready';
  console.log(`${status}|${strategy}|${diaries.length}`);
}

function cmdSaveInstinct(flags) {
  const { project, id, trigger, action, domain, evidence } = flags;
  const evidenceCount = parseInt(flags['evidence-count'], 10) || 1;

  if (!project || !id || !trigger || !action) {
    console.error('Error: Missing required arguments');
    console.log('Usage: reflect.js save-instinct --project X --id Y --trigger "..." --action "..." [--domain D] [--evidence "..."] [--evidence-count N]');
    process.exit(1);
  }

  const result = saveInstinct({
    id,
    trigger,
    action,
    project,
    domain: domain || 'reflection',
    source: 'reflection',
    evidence: evidence || '',
    maxConfidence: REFLECT_MAX_CONFIDENCE,
    evidenceCount
  });

  if (result.isNew) {
    console.log(`Created instinct: ${result.path} (confidence: ${result.confidence.toFixed(2)})`);
  } else {
    console.log(`Updated instinct: ${result.path} (confidence: ${result.confidence.toFixed(2)})`);
  }
}

function main() {
  const { command, flags } = parseArgs(process.argv);

  switch (command) {
    case 'strategy':
      cmdStrategy(flags);
      break;
    case 'scan':
      cmdScan(flags);
      break;
    case 'update-log':
      cmdUpdateLog(flags);
      break;
    case 'auto-check':
      cmdAutoCheck(flags);
      break;
    case 'save-instinct':
      cmdSaveInstinct(flags);
      break;
    default:
      console.log('Usage: reflect.js <strategy|scan|update-log|auto-check|save-instinct> --project X [--strategy Y] [--diaries "a,b,c"] [--reflection Z]');
      process.exit(1);
  }
}

// Export for testing
module.exports = {
  parseArgs,
  cmdStrategy,
  cmdScan,
  cmdUpdateLog,
  cmdAutoCheck,
  cmdSaveInstinct
};

if (require.main === module) {
  main();
}
