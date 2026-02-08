#!/usr/bin/env node
// skills/arc-reflecting/scripts/reflect.js

const {
  getProcessedLogPath,
  scanDiaries,
  determineReflectStrategy,
  updateProcessedLog
} = require('../../../scripts/lib/session-utils');

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = args[i + 1];
      i++;
    }
  }
  return result;
}

if (command === 'strategy') {
  const { project } = parseArgs(args.slice(1));
  if (!project) {
    console.error('Error: Missing required argument --project');
    console.log('Usage: reflect.js strategy --project X');
    process.exit(1);
  }
  const logPath = getProcessedLogPath(project);
  console.log(determineReflectStrategy(project, logPath));

} else if (command === 'scan') {
  const { project, strategy } = parseArgs(args.slice(1));
  if (!project || !strategy) {
    console.error('Error: Missing required arguments');
    console.log('Usage: reflect.js scan --project X --strategy Y');
    process.exit(1);
  }
  const logPath = getProcessedLogPath(project);
  const diaries = scanDiaries(project, strategy, logPath);
  diaries.forEach(d => console.log(d));

} else if (command === 'update-log') {
  const { project, diaries, reflection } = parseArgs(args.slice(1));
  if (!project || !diaries || !reflection) {
    console.error('Error: Missing required arguments');
    console.log('Usage: reflect.js update-log --project X --diaries "a,b,c" --reflection Z');
    process.exit(1);
  }
  const logPath = getProcessedLogPath(project);
  const diaryFiles = diaries.split(',');
  updateProcessedLog(logPath, diaryFiles, reflection);
  console.log(`✓ Updated processed.log with ${diaryFiles.length} entries`);

} else {
  console.log('Usage: reflect.js <strategy|scan|update-log> --project X [--strategy Y] [--diaries "a,b,c"] [--reflection Z]');
  process.exit(1);
}
