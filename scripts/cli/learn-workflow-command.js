/**
 * learn-workflow-command.js — the `learn diary|reflect|instinct|recall` subgroups.
 *
 * These are the operations a human drives while reviewing what the learning
 * subsystem captured. The candidate-lifecycle subcommands (status, enable,
 * dashboard, approve, materialize, activate, …) stay in learn-command.js.
 *
 * Convention across this whole surface: the entity id is POSITIONAL, everything
 * else is a flag. `learn instinct confirm <id>`, `learn reflect record <id>`.
 */

const path = require('node:path');

const { output } = require('./shared');
const { getDateString } = require('../lib/utils');

const WORKFLOW_GROUPS = new Set(['diary', 'reflect', 'instinct', 'recall']);

const USAGE = [
  'Usage: arcforge learn <group> <action> [id] [options]',
  '',
  '  diary path      --project P --date D --session S [--draft]',
  '  diary save      --project P --date D --session S --content "..."',
  '  diary finalize  --project P --date D --session S',
  '',
  '  reflect scan    --project P [--json]',
  '  reflect record  <reflect-id> --project P [--diaries "a,b"] [--reflection FILE]',
  '                  [--summary "..."] [--session S]',
  '',
  '  instinct status      [--project P] [--json]',
  '  instinct check       <id> [--project P]',
  '  instinct save        <id> --trigger "..." --action "..." [--project P]',
  '                       [--source manual|reflection] [--domain D] [--evidence "..."]',
  '                       [--evidence-count N]',
  '  instinct confirm     <id> [--project P]',
  '  instinct contradict  <id> [--project P]',
  '',
  '  recall record   <recall-id> --project P [--query "..."] [--instinct-ids "a,b"]',
  '                  [--summary "..."] [--session S]',
  '',
  '--date defaults to today; --session defaults to $CLAUDE_SESSION_ID;',
  '--project defaults to the current project directory name.',
].join('\n');

/** Split a comma-separated option into a clean list. */
function splitList(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireOption(value, name, hint) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required${hint ? ` — ${hint}` : ''}`);
  }
  return value;
}

/**
 * Resolve the {project, date, session} triple every diary command needs.
 * Session has no safe fallback: guessing it silently targets the wrong diary,
 * so an absent value is an error rather than a derived default.
 */
function resolveDiaryKey(args, project) {
  const date = args.options.date || getDateString();
  const session = args.options.session || process.env.CLAUDE_SESSION_ID;
  if (!session) {
    throw new Error('--session is required (CLAUDE_SESSION_ID is not set in this environment)');
  }
  return { project, date, session };
}

function runDiary(action, args, project) {
  const workflow = require('../lib/learning-workflow');

  if (action === 'path') {
    const key = resolveDiaryKey(args, project);
    console.log(workflow.resolveDiaryPath({ ...key, draft: Boolean(args.flags.draft) }));
    return;
  }
  if (action === 'save') {
    const key = resolveDiaryKey(args, project);
    const content = requireOption(args.options.content, '--content', 'the diary body to write');
    const result = workflow.writeDiary({ ...key, content });
    console.log(`Diary saved: ${result.path}`);
    return;
  }
  if (action === 'finalize') {
    const key = resolveDiaryKey(args, project);
    const result = workflow.finalizeDiaryDraft(key);
    console.log(`Finalized: ${result.path}`);
    return;
  }
  throw new Error(`Unknown 'learn diary' action: ${action}`);
}

function runReflect(action, args, project, asJson) {
  const workflow = require('../lib/learning-workflow');

  if (action === 'scan') {
    const result = workflow.scanForReflection(project);
    if (asJson) {
      output(result, true);
    } else {
      console.log(`strategy: ${result.strategy}`);
      console.log(`diaries: ${result.count}`);
      console.log(`ready: ${result.ready}`);
      for (const diary of result.diaries) console.log(diary);
    }
    return;
  }
  if (action === 'record') {
    const reflectId = requireOption(
      args.positional[2],
      'A reflection id',
      'pass it positionally, e.g. `learn reflect record reflect-2026-08-13`',
    );
    const result = workflow.recordReflection({
      project,
      reflectId,
      diaries: splitList(args.options.diaries),
      reflection: args.options.reflection,
      summary: args.options.summary || '',
      session: args.options.session || '',
    });
    output(result, asJson);
    return;
  }
  throw new Error(`Unknown 'learn reflect' action: ${action}`);
}

const INSTINCT_ACTIONS = new Set(['status', 'check', 'save', 'confirm', 'contradict']);

function runInstinct(action, args, project, asJson) {
  const feedback = require('../lib/instinct-feedback');

  // Validate the action before the id, so a typo'd action reports itself rather
  // than complaining about a missing id.
  if (!INSTINCT_ACTIONS.has(action)) {
    throw new Error(`Unknown 'learn instinct' action: ${action}`);
  }

  if (action === 'status') {
    const status = feedback.collectInstinctStatus(project);
    if (asJson) output(status, true);
    else console.log(feedback.renderInstinctStatus(status));
    return;
  }

  const instinctId = requireOption(
    args.positional[2],
    'An instinct id',
    `pass it positionally, e.g. \`learn instinct ${action} always-run-tests\``,
  );

  if (action === 'check') {
    const { checkInstinctDuplicate } = require('../lib/instinct-writer');
    console.log(checkInstinctDuplicate(instinctId, project));
    return;
  }
  if (action === 'save') {
    const { saveInstinct } = require('../lib/instinct-writer');
    const { MAX_CONFIDENCE, REFLECT_MAX_CONFIDENCE } = require('../lib/confidence');
    const source = args.options.source || 'manual';
    if (source !== 'manual' && source !== 'reflection') {
      throw new Error(`--source must be 'manual' or 'reflection' (got '${source}')`);
    }
    const result = saveInstinct({
      id: instinctId,
      trigger: requireOption(args.options.trigger, '--trigger', 'when this instinct applies'),
      action: requireOption(args.options.action, '--action', 'what to do when it applies'),
      project,
      domain: args.options.domain || (source === 'reflection' ? 'reflection' : 'uncategorized'),
      source,
      evidence: args.options.evidence || '',
      maxConfidence: source === 'reflection' ? REFLECT_MAX_CONFIDENCE : MAX_CONFIDENCE,
      evidenceCount: Number.parseInt(args.options['evidence-count'], 10) || 1,
    });
    console.log(
      `${result.isNew ? 'Created' : 'Updated'} instinct: ${result.path} ` +
        `(confidence: ${result.confidence.toFixed(2)})`,
    );
    return;
  }
  if (action === 'confirm' || action === 'contradict') {
    const result =
      action === 'confirm'
        ? feedback.confirmInstinct(instinctId, project)
        : feedback.contradictInstinct(instinctId, project);
    if (asJson) {
      output(result, true);
      return;
    }
    console.log(
      result.archived
        ? `Contradicted & archived: ${result.id}`
        : `${action === 'confirm' ? 'Confirmed' : 'Contradicted'}: ${result.id}`,
    );
    console.log(feedback.formatConfidenceChange(result.oldConfidence, result.confidence));
    if (result.archived) {
      console.log(`  Confidence below ${feedback.ARCHIVE_THRESHOLD} — moved to archived/`);
    } else if (action === 'confirm') {
      console.log(`  Confirmations: ${result.confirmations}`);
    } else {
      console.log(`  Contradictions: ${result.contradictions}`);
    }
  }
}

function runRecall(action, args, project, asJson) {
  const workflow = require('../lib/learning-workflow');

  if (action === 'record') {
    const recallId = requireOption(
      args.positional[2],
      'A recall id',
      'pass it positionally, e.g. `learn recall record recall-2026-08-13`',
    );
    const result = workflow.recordRecall({
      project,
      recallId,
      query: args.options.query || '',
      instinctIds: splitList(args.options['instinct-ids']),
      summary: args.options.summary || '',
      session: args.options.session || '',
    });
    output(result, asJson);
    return;
  }
  throw new Error(`Unknown 'learn recall' action: ${action}`);
}

/**
 * Dispatch a `learn <group> <action>` workflow command.
 * @returns {boolean} true when handled; false when the group is not a workflow group
 */
function runLearnWorkflowCommand(args, { projectRoot, asJson }) {
  const group = args.positional[0];
  if (!WORKFLOW_GROUPS.has(group)) return false;

  const action = args.positional[1];
  if (!action) {
    console.error(USAGE);
    process.exit(1);
  }

  const project = args.options.project || path.basename(projectRoot);

  if (group === 'diary') runDiary(action, args, project);
  else if (group === 'reflect') runReflect(action, args, project, asJson);
  else if (group === 'instinct') runInstinct(action, args, project, asJson);
  else runRecall(action, args, project, asJson);

  return true;
}

module.exports = { runLearnWorkflowCommand, WORKFLOW_GROUPS, USAGE };
