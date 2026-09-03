/**
 * learn-command.js - Handler for the `learn` CLI command.
 *
 * The candidate subcommands are a front end onto the canonical Layer-5 queue,
 * not a second store over a second one. Reads replay
 * `<arcforge home>/learning/candidates/queue.jsonl` through
 * `readCurrentCandidates()` and render the dashboard's own allowlisted wire
 * models; transitions dispatch through `handleDashboardAction`, which owns the
 * Action × Status legality matrix, the `safety_ack` gate and the audit log.
 *
 * `--global` is refused for every candidate subcommand: a global-scoped
 * candidate applies to every project on the machine, and the dashboard is its
 * review surface. `--project` means *this* project — see `readProjectCards`
 * for what that matches on.
 */

const path = require('node:path');
const { output } = require('./shared');
const { runLearnWorkflowCommand } = require('./learn-workflow-command');

// Layer 7/8 render and activate the instinct artifact and nothing else. The
// other artifact types the queue schema names have no producer and no renderer
// behind them, so the CLI says which one it can act on rather than failing deep
// inside the curator.
const SUPPORTED_ARTIFACT_TYPE = 'instinct';

// Every action the CLI dispatches is attributed to the CLI, so the audit log
// distinguishes a typed command from a dashboard click.
const CLI_ACTOR = { layer: 6, actor_type: 'cli', reviewer: 'local_user' };

// `reject` is the CLI's long-standing name for the matrix's `dismiss`.
const ACTION_FOR_VERB = {
  approve: 'approve',
  reject: 'dismiss',
  materialize: 'materialize',
  activate: 'activate',
};
const VERB_FOR_ACTION = {
  approve: 'approve',
  dismiss: 'reject',
  materialize: 'materialize',
  activate: 'activate',
};

// Inbox ordering: what is waiting on the reviewer first, terminal states last.
const STATUS_RANK = {
  approved: 0,
  pending_review: 1,
  needs_more_evidence: 2,
  materialized: 3,
  activated: 4,
  deactivated: 5,
  dismissed: 6,
  superseded: 7,
};

// The forward move wins when several actions are legal — `pending_review`
// allows `dismiss` too, but "reject it" is not the suggested next step.
const NEXT_ACTION_PREFERENCE = ['approve', 'materialize', 'activate', 'dismiss'];

const NEXT_ACTIONS = {
  pending_review: ['approve or reject this candidate before any artifact is written'],
  needs_more_evidence: ['reject it, or leave it for the curator to gather more evidence'],
  approved: ['materialize the candidate to write an inactive draft artifact'],
  materialized: [
    'review the draft at draft_paths',
    'activate explicitly when satisfied — activation changes how future sessions behave',
  ],
  activated: ['already active — retire it by deactivating it from the dashboard'],
  deactivated: ['materialize or activate it again, or leave it retired'],
  dismissed: ['dismissed — no action available'],
  superseded: ['superseded by another candidate — no action available'],
};

function requireProjectCandidateScope(args) {
  if (args.flags.project) return 'project';
  if (args.flags.global) {
    throw new Error(
      'only project candidate commands are supported — a global-scoped candidate applies to ' +
        'every project on this machine, and the dashboard is where those are reviewed; run: ' +
        'arcforge learn dashboard',
    );
  }
  throw new Error('learn command requires --project or --global');
}

/** The scope the candidate subcommands run in: this project, named by its root. */
function candidateContext(args, projectRoot) {
  return { scope: requireProjectCandidateScope(args), projectRoot };
}

/** The project name a record's `scope.project` has to equal to be ours. */
function currentProjectName(projectRoot) {
  return path.basename(path.resolve(projectRoot));
}

/**
 * This project's candidates from the canonical queue, as dashboard cards.
 *
 * The canonical queue is home-global, so `--project` has to say *which*
 * project. It matches `scope.project` — the project directory name, which is
 * the identity the rest of the pipeline already keys on
 * (`observations/<name>/`, `instincts/<name>/`) and the only one the sanitized
 * card prints, so a row can be checked against the filter by eye.
 * `scope.project_id` is deliberately not the key: `batch-assembler.js` hashes
 * the absolute project path when an observation carries one and the project
 * name when none does, so matching on it would hide candidates silently.
 *
 * A project-scoped record carrying no `scope.project` at all therefore belongs
 * to no project here and is invisible to the CLI. That is the safe direction —
 * the alternative is showing it from every project — and the dashboard serves
 * the whole queue, so it stays the escape hatch.
 */
function readProjectCards(projectRoot) {
  const { readCurrentCandidates } = require('../lib/learning-curator/queue-writer');
  const { sanitizeDashboardCard } = require('../lib/learning-dashboard');
  const project = currentProjectName(projectRoot);
  return Object.values(readCurrentCandidates())
    .filter((record) => record.scope?.kind === 'project' && record.scope.project === project)
    .map(sanitizeDashboardCard);
}

/**
 * A candidate id is usually copied off the machine-wide dashboard, which shows
 * other projects' candidates and the global ones too — so say which of those it
 * was rather than leaving the user to guess at a bare "not found".
 */
function missingCandidateError(projectRoot, candidateId) {
  const { readCurrentCandidates } = require('../lib/learning-curator/queue-writer');
  const base = `candidate not found among this project's candidates: ${candidateId}`;
  const scope = readCurrentCandidates()[candidateId]?.scope;
  if (scope?.kind === 'project' && scope.project) {
    return new Error(
      `${base} — it belongs to the project "${scope.project}", not to ` +
        `"${currentProjectName(projectRoot)}"; review it from there, or run: ` +
        'arcforge learn dashboard',
    );
  }
  if (scope?.kind === 'global') {
    return new Error(
      `${base} — it is a global-scoped candidate, reviewed in: arcforge learn dashboard`,
    );
  }
  return new Error(`${base} — run: arcforge learn inbox --project`);
}

function findProjectCard(projectRoot, candidateId) {
  const card = readProjectCards(projectRoot).find((c) => c.candidate_id === candidateId);
  if (!card) throw missingCandidateError(projectRoot, candidateId);
  return card;
}

/**
 * Absolute draft paths from the latest materialization manifest.
 *
 * Deliberately not `active_target_hint.target_path_summary`: that string
 * embeds `scope.project_id`, which no CLI or dashboard surface prints.
 */
function draftPathsFor(candidateId) {
  const { findLatestMaterialization } = require('../lib/learning-curator/activate');
  const { getArcforgeHome } = require('../lib/utils');
  const record = findLatestMaterialization(getArcforgeHome(), candidateId);
  if (!record || !Array.isArray(record.draft_artifacts)) return [];
  return record.draft_artifacts.map((artifact) => artifact.draft_path).filter(Boolean);
}

function nextCommandFor(card) {
  const action = NEXT_ACTION_PREFERENCE.find((a) => card.available_actions.includes(a));
  const verb = action ? VERB_FOR_ACTION[action] : 'inspect';
  return `arcforge learn ${verb} ${card.candidate_id} --project`;
}

function nextActionsFor(card) {
  return NEXT_ACTIONS[card.lifecycle_status] || [];
}

function assertSupportedArtifactType(card, verb) {
  if (card.artifact_type === SUPPORTED_ARTIFACT_TYPE) return;
  throw new Error(
    `arcforge learn ${verb} supports ${SUPPORTED_ARTIFACT_TYPE} candidates only — ` +
      `${card.candidate_id} is a ${card.artifact_type} candidate. Materialization and ` +
      'activation run through the curator, which renders the instinct artifact and nothing ' +
      'else today; the other artifact types the queue schema names have no renderer behind ' +
      'them. Leave it queued, or review it in: arcforge learn dashboard',
  );
}

function refusalMessage(result, verb, card) {
  const base = `arcforge learn ${verb} refused: ${result.reason}`;
  if (result.reason === 'policy_violation') {
    const legal = card.available_actions.join(', ') || 'nothing';
    return (
      `${base} — ${card.candidate_id} is ${card.lifecycle_status}, and the canonical ` +
      `Action × Status matrix allows: ${legal}`
    );
  }
  if (result.reason === 'stale_status') {
    return (
      `${base} — ${card.candidate_id} moved to ${result.current} while the command was ` +
      `running (it was ${result.expected}); re-run to act on the current state`
    );
  }
  const detail = result.module_failure?.detail;
  return detail ? `${base} — ${detail}` : base;
}

function dispatchAction({ verb, card, expectedStatus, safetyAck }) {
  const { handleDashboardAction } = require('../lib/learning-dashboard');
  const result = handleDashboardAction({
    action: ACTION_FOR_VERB[verb],
    candidate_id: card.candidate_id,
    expected_current_status: expectedStatus,
    safety_ack: safetyAck,
    actor: CLI_ACTOR,
  });
  if (!result.accepted) throw new Error(refusalMessage(result, verb, card));
  return result;
}

/**
 * The `safety_ack` the dashboard collects from two checkboxes. A typed
 * `learn activate <id>` is the equivalent deliberate act, so the CLI prints
 * both warnings to stderr — leaving `--json` stdout clean — and then asserts
 * what the reviewer has just been shown.
 */
function acknowledgeActivation(card) {
  const draftPaths = draftPathsFor(card.candidate_id);
  console.error(
    `activating ${card.candidate_id} changes how future sessions behave: an active instinct ` +
      'is injected at SessionStart until it is deactivated.',
  );
  console.error(
    draftPaths.length > 0
      ? `target: the draft at ${draftPaths.join(', ')} becomes an active instinct under the ` +
          'arcforge home instincts tree.'
      : 'target: an active instinct under the arcforge home instincts tree.',
  );
  return { reviewer_saw_behavior_change_warning: true, reviewer_saw_target_path_summary: true };
}

function runInbox({ scope, projectRoot }) {
  const cards = readProjectCards(projectRoot);
  const counts = {};
  const groups = { by_status: {}, by_artifact_type: {} };

  for (const card of cards) {
    counts[card.lifecycle_status] = (counts[card.lifecycle_status] || 0) + 1;
    if (!groups.by_status[card.lifecycle_status]) groups.by_status[card.lifecycle_status] = [];
    groups.by_status[card.lifecycle_status].push(card.candidate_id);
    if (!groups.by_artifact_type[card.artifact_type]) {
      groups.by_artifact_type[card.artifact_type] = [];
    }
    groups.by_artifact_type[card.artifact_type].push(card.candidate_id);
  }

  const sorted = cards.slice().sort((a, b) => {
    const rank = (STATUS_RANK[a.lifecycle_status] ?? 99) - (STATUS_RANK[b.lifecycle_status] ?? 99);
    if (rank !== 0) return rank;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  return {
    scope,
    count: cards.length,
    counts,
    groups,
    candidates: sorted.map((card) => ({
      ...card,
      next_command: nextCommandFor(card),
      next_actions: nextActionsFor(card),
    })),
  };
}

function runInspect({ scope, projectRoot }, candidateId) {
  const { sanitizeDashboardDetail } = require('../lib/learning-dashboard');
  const card = findProjectCard(projectRoot, candidateId);
  return {
    scope,
    candidate: sanitizeDashboardDetail(card.candidate_id),
    next_actions: nextActionsFor(card),
    draft_paths: draftPathsFor(card.candidate_id),
  };
}

function runDrafts({ scope, projectRoot }) {
  const drafts = readProjectCards(projectRoot)
    .filter((card) => card.lifecycle_status === 'materialized')
    .map((card) => ({
      ...card,
      next_command: nextCommandFor(card),
      draft_paths: draftPathsFor(card.candidate_id),
    }));
  return { scope, count: drafts.length, drafts };
}

/**
 * Approve (when still pending) and materialize in one step — never activates.
 *
 * The queue is an append-only event log, so a failure after the approve landed
 * is not rolled back: the candidate stays `approved`, which the matrix allows
 * to materialize, so re-running is the recovery. The second dispatch carries
 * `expected_current_status` so a concurrent writer is caught rather than
 * overwritten.
 */
function runAccept({ scope, projectRoot }, candidateId) {
  const card = findProjectCard(projectRoot, candidateId);
  if (card.lifecycle_status === 'materialized') {
    return { scope, candidate: card, draft_paths: draftPathsFor(candidateId) };
  }
  assertSupportedArtifactType(card, 'accept');
  if (card.lifecycle_status === 'pending_review') {
    dispatchAction({ verb: 'approve', card, expectedStatus: 'pending_review' });
  }
  // The status the materialize dispatch will actually meet: `approved` when the
  // approve above just moved it there, otherwise whatever it already was. A
  // literal `'approved'` turned every other starting status into a fabricated
  // `stale_status` race that re-running could never clear — including
  // `deactivated`, which the matrix does allow to materialize.
  const expectedStatus =
    card.lifecycle_status === 'pending_review' ? 'approved' : card.lifecycle_status;
  const result = dispatchAction({ verb: 'materialize', card, expectedStatus });
  return {
    scope,
    candidate: findProjectCard(projectRoot, candidateId),
    draft_paths: draftPathsFor(candidateId),
    materialization_id: result.materialization_id,
  };
}

function runTransition({ scope, projectRoot }, verb, candidateId) {
  const card = findProjectCard(projectRoot, candidateId);
  if (verb === 'materialize' || verb === 'activate') assertSupportedArtifactType(card, verb);
  const safetyAck = verb === 'activate' ? acknowledgeActivation(card) : undefined;
  const result = dispatchAction({ verb, card, expectedStatus: card.lifecycle_status, safetyAck });
  return {
    scope,
    candidate: findProjectCard(projectRoot, candidateId),
    action_id: result.action_id,
    next_status: result.next_status,
    ...(result.materialization_id ? { materialization_id: result.materialization_id } : {}),
    ...(result.activation_id ? { activation_id: result.activation_id } : {}),
    ...(verb === 'materialize' || verb === 'activate'
      ? { draft_paths: draftPathsFor(candidateId) }
      : {}),
  };
}

function requireCandidateId(args, subcommand) {
  const candidateId = args.positional[1];
  if (!candidateId) throw new Error(`learn ${subcommand} requires a candidate id`);
  return candidateId;
}

function runDashboard(args, projectRoot) {
  const { startServer } = require('../lib/learning-dashboard');
  const rawPort = args.options.port;
  const port = rawPort === undefined ? 3334 : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('learn dashboard --port must be an integer from 1 to 65535');
  }
  startServer({ projectRoot, port });
}

function runLearnCommand(args, { projectRoot, asJson }) {
  // The diary/reflect/instinct/recall workflow subgroups own their own dispatch.
  // They are keyed on positional[0], disjoint from the lifecycle subcommands
  // below, so an unhandled group falls straight through.
  if (runLearnWorkflowCommand(args, { projectRoot, asJson })) return;

  const learning = require('../lib/learning');
  const subcommand = args.positional[0];
  const resolveLearningScope = () => {
    if (args.flags.global) return 'global';
    if (args.flags.project) return 'project';
    throw new Error('learn command requires --project or --global');
  };

  if (subcommand === 'dashboard') {
    runDashboard(args, projectRoot);
  } else if (subcommand === 'status') {
    output(learning.readLearningConfig({ projectRoot }), asJson);
  } else if (subcommand === 'enable' || subcommand === 'disable') {
    const scope = resolveLearningScope();
    output(
      learning.setLearningEnabled({
        scope,
        enabled: subcommand === 'enable',
        projectRoot,
      }),
      asJson,
    );
  } else if (subcommand === 'review') {
    const { scope } = candidateContext(args, projectRoot);
    const candidates = readProjectCards(projectRoot);
    output({ scope, count: candidates.length, candidates }, asJson);
  } else if (subcommand === 'inbox') {
    output(runInbox(candidateContext(args, projectRoot)), asJson);
  } else if (subcommand === 'inspect') {
    const candidateId = requireCandidateId(args, subcommand);
    output(runInspect(candidateContext(args, projectRoot), candidateId), asJson);
  } else if (subcommand === 'drafts') {
    output(runDrafts(candidateContext(args, projectRoot)), asJson);
  } else if (subcommand === 'analyze') {
    console.error(
      'arc learn analyze is deprecated. The statistical analyzer has been retired; ' +
        'candidate review now lives in the dashboard. Run: arc learn dashboard',
    );
    process.exit(1);
  } else if (subcommand === 'accept') {
    const candidateId = requireCandidateId(args, subcommand);
    output(runAccept(candidateContext(args, projectRoot), candidateId), asJson);
  } else if (Object.hasOwn(ACTION_FOR_VERB, subcommand)) {
    const candidateId = requireCandidateId(args, subcommand);
    output(runTransition(candidateContext(args, projectRoot), subcommand, candidateId), asJson);
  } else {
    console.error(
      'Usage: arcforge learn [dashboard [--port N]|status|enable|disable] [--project|--global]',
    );
    console.error(
      '       arcforge learn [inbox|review|drafts|inspect <id>|approve <id>|reject <id>|' +
        'accept <id>|materialize <id>|activate <id>] --project',
    );
    console.error(
      "       arcforge learn <diary|reflect|instinct|recall> <action> — run 'learn diary' for that usage",
    );
    process.exit(1);
  }
}

module.exports = { runLearnCommand };
