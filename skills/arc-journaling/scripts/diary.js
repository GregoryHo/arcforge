#!/usr/bin/env node
// skills/arc-journaling/scripts/diary.js

const { getDiaryPath, saveDiary } = require('../../../scripts/lib/session-utils');

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

if (command === 'save') {
  const { project, date, session, content } = parseArgs(args.slice(1));
  if (!project || !date || !session || !content) {
    console.error('Error: Missing required arguments');
    console.log('Usage: diary.js save --project X --date Y --session Z --content "..."');
    process.exit(1);
  }
  const filePath = getDiaryPath(project, date, session);
  if (saveDiary(filePath, content)) {
    console.log(`✓ Diary saved: ${filePath}`);
  } else {
    console.error('✗ Failed to save diary');
    process.exit(1);
  }
} else if (command === 'path') {
  const { project, date, session } = parseArgs(args.slice(1));
  if (!project || !date || !session) {
    console.error('Error: Missing required arguments');
    console.log('Usage: diary.js path --project X --date Y --session Z');
    process.exit(1);
  }
  console.log(getDiaryPath(project, date, session));
} else {
  console.log('Usage: diary.js <save|path> --project X --date Y --session Z [--content "..."]');
  process.exit(1);
}
