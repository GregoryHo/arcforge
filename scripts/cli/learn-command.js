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
 * This file is the entry and dispatch layer of that front end. Its two
 * siblings hold the halves it coordinates: `learn-candidate-queue.js` reads the
 * queue and the materialization manifests, `learn-candidate-prose.js` turns a
 * card or an engine result into what the reviewer reads. Flag reads stay here —
 * the CLI manifest gate derives the command's live flag set from these files.
 *
 * `--global` is refused for every candidate subcommand: a global-scoped
 * candidate applies to every project on the machine, and the dashboard is its
 * review surface. `--project` means *this* project — see `readProjectCards`
 * for what that matches on.
 */

const { output } = require('./shared');
const { runLearnWorkflowCommand } = require('./learn-workflow-command');
const {
  readProjectCards,
  findProjectCandidate,
  findProjectCard,
  materializationFor,
  draftPathsIn,
  staleDraftsIn,
  draftUnavailableIn,
  draftPathsFor,
  activeTargetFor,
} = require('./learn-candidate-queue');
const {
  ACTION_FOR_VERB,
  STATUS_RANK,
  isMaterializableType,
  isMaterializableName,
  draftUnavailableActions,
  inspectCommandFor,
  nextCommandFor,
  nextActionsFor,
  refusalMessage,
  acceptRefusalMessage,
  acceptNameRefusalMessage,
  staleDraftAcceptMessage,
} = require('./learn-candidate-prose');

// Every action the CLI dispatches is attributed to the CLI, so the audit log
// distinguishes a typed command from a dashboard click.
const CLI_ACTOR = { layer: 6, actor_type: 'cli', reviewer: 'local_user' };

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

/** The scope the candidate subcommands run in: this project. */
function candidateContext(args) {
  return { scope: requireProjectCandidateScope(args) };
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
 * The `safety_ack` Layer 6 gates activation on, supplied by the typed command.
 *
 * A typed `learn activate <id>` is itself the deliberate act, so the CLI prints
 * the two facts the gate names — that behavior changes, and which file is
 * written — to stderr, leaving `--json` stdout clean, and then asserts what the
 * reviewer has just been shown.
 *
 * The target line is the path Layer 8 writes, resolved through Layer 8's own
 * derivation. Naming anything else would make the acknowledgement false: the
 * draft is the source that was reviewed, not the file activation creates or
 * overwrites, so it prints under its own label.
 */
function acknowledgeActivation(card) {
  const draftPaths = draftPathsFor(card.candidate_id);
  console.error(
    `activating ${card.candidate_id} changes how future sessions behave: an active instinct ` +
      'is injected at SessionStart until it is deactivated.',
  );
  console.error(
    `target: ${activeTargetFor(card)} — created, or overwritten with the file currently ` +
      'there kept under .backups/.',
  );
  if (draftPaths.length > 0) {
    console.error(`source: the reviewed draft at ${draftPaths.join(', ')}.`);
  }
  return { reviewer_saw_behavior_change_warning: true, reviewer_saw_target_path_summary: true };
}

/**
 * The whole queue, grouped and ordered.
 *
 * Deliberately says nothing about draft integrity: the inbox prints no paths,
 * and it is the one candidate command that runs over every card, so a manifest
 * read and a draft hash per row would put per-candidate disk work on the
 * cheapest, most-run surface. `drafts` and `inspect` — the two that do print a
 * path — are where that question is answered.
 */
function runInbox({ scope }) {
  const cards = readProjectCards();
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

function runInspect({ scope }, candidateId) {
  const { sanitizeDashboardDetail } = require('../lib/learning-dashboard');
  const card = findProjectCard(candidateId);
  const materialization = materializationFor(card.candidate_id);
  const stale = staleDraftsIn(materialization);
  // The disk fact is reported for every status — it is a fact about disk, not
  // about the lifecycle — but it overrides the prose only of the statuses whose
  // own prose it contradicts. `draftUnavailableActions` owns that choice and
  // returns null for the rest. The predicate is "unavailable", not "stale": a
  // candidate whose manifest is gone has no draft to review either, and reports
  // an empty `draft_paths_stale` because there is no recorded file left to call
  // stale.
  const override = draftUnavailableIn(materialization)
    ? draftUnavailableActions(card, stale)
    : null;
  return {
    scope,
    candidate: sanitizeDashboardDetail(card.candidate_id),
    next_actions: override ?? nextActionsFor(card),
    draft_paths: draftPathsIn(materialization),
    draft_paths_stale: stale,
  };
}

function runDrafts({ scope }) {
  const drafts = readProjectCards()
    .filter((card) => card.lifecycle_status === 'materialized')
    .map((card) => {
      // One manifest lookup per entry answers all three draft questions. The
      // disk work behind them is `staleDraftArtifacts`: once inside
      // `materializationFor` to pick the manifest, then once for the reported
      // list and once inside `draftUnavailableIn`. Small markdown files on the
      // command whose whole subject is the drafts, and cheaper than a local
      // predicate that could drift from Layer 7's.
      const materialization = materializationFor(card.candidate_id);
      const stale = staleDraftsIn(materialization);
      return {
        ...card,
        // `nextCommandFor` is keyed on status and artifact type, so for every
        // entry here it names `activate` — the one action the matrix allows a
        // materialized candidate. Activation refuses on the recorded content
        // hash when a recorded draft is stale, and with `materialization_missing`
        // when no usable manifest is left, so in either case that is a command
        // the CLI would then refuse. Same norm as the artifact-type narrowing:
        // send it to `inspect`, which says why, rather than advertising a step
        // with nothing behind it.
        next_command: draftUnavailableIn(materialization)
          ? inspectCommandFor(card)
          : nextCommandFor(card),
        draft_paths: draftPathsIn(materialization),
        draft_paths_stale: stale,
      };
    });
  return { scope, count: drafts.length, drafts };
}

/**
 * Approve (when still pending) and materialize in one step — never activates.
 *
 * `accept` is the CLI's one compound command, and that is why it — alone —
 * decides the draft writer's deterministic prerequisites itself instead of
 * rendering the curator's refusal. The queue is an append-only event log, so
 * the approve is not rolled back when the materialize is refused. For a
 * transient refusal that is fine: the candidate stays `approved`, which the
 * matrix allows to materialize, so re-running is the recovery. Neither
 * prerequisite checked below is transient — no re-run clears an artifact type
 * the curator cannot render, and none clears a name it cannot write to disk —
 * and the matrix allows an `approved` candidate neither to materialize nor to
 * dismiss, so half-landing strands it in a status with no way out. Refusing
 * before the first dispatch is the only outcome that keeps the command
 * all-or-nothing.
 *
 * Those two are the whole list. Of Layer 7's other pre-write checks,
 * `invalid_lifecycle_status` is already carried by `expected_current_status`;
 * `unsafe_content` cannot fire on a queued record, because `appendCandidate` is
 * the single ingestion gate and it redacts the body before storing it, with an
 * idempotent redactor; and a lock timeout or a write error is transient, which
 * is the class re-running already answers.
 *
 * The guard is on the command, not on the dispatch count: `accept` refuses from
 * every status, including the ones where it would have dispatched materialize
 * alone. One rule for one command name beats a refusal that depends on where
 * the candidate happened to be. `approve`, `materialize` and `activate` are
 * single transitions and keep rendering the curator's own audited refusal — do
 * not add a pre-check to them.
 *
 * The second dispatch carries `expected_current_status` so a concurrent writer
 * is caught rather than overwritten.
 */
function runAccept({ scope }, candidateId) {
  // The record as well as the card: the name policy is enforced against the
  // stored `name`, and the card's is redacted and truncated. See
  // `findProjectCandidate`.
  const { record, card } = findProjectCandidate(candidateId);
  if (!isMaterializableType(card.artifact_type)) throw new Error(acceptRefusalMessage(card));
  if (!isMaterializableName(record.name)) throw new Error(acceptNameRefusalMessage(card));
  if (card.lifecycle_status === 'materialized') {
    // The no-op branch dispatches nothing and reports the draft the candidate
    // already has. Reporting a path that is not there — or one whose file has
    // been edited since the manifest recorded it, or an empty list because the
    // manifest itself is gone — would be success over a draft that activation
    // then refuses, so the report has to be checked even though there is no
    // transition to guard.
    const materialization = materializationFor(candidateId);
    if (draftUnavailableIn(materialization)) {
      throw new Error(staleDraftAcceptMessage(card, staleDraftsIn(materialization)));
    }
    return { scope, candidate: card, draft_paths: draftPathsIn(materialization) };
  }
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
    candidate: findProjectCard(candidateId),
    // The dispatch's own paths, not a second scan: the reuse lookup screens on
    // the candidate hash and the render policy as well as on intact drafts, so
    // re-deriving them here could report one manifest's id beside another
    // manifest's paths.
    draft_paths: result.draft_paths ?? [],
    materialization_id: result.materialization_id,
  };
}

function runTransition({ scope }, verb, candidateId) {
  const card = findProjectCard(candidateId);
  const safetyAck = verb === 'activate' ? acknowledgeActivation(card) : undefined;
  const result = dispatchAction({ verb, card, expectedStatus: card.lifecycle_status, safetyAck });
  return {
    scope,
    candidate: findProjectCard(candidateId),
    action_id: result.action_id,
    next_status: result.next_status,
    ...(result.materialization_id ? { materialization_id: result.materialization_id } : {}),
    ...(result.activation_id ? { activation_id: result.activation_id } : {}),
    // `materialize` reports the paths its own dispatch chose, for the reason in
    // `runAccept`. `activate` has no paths of its own to report, so it keeps the
    // manifest lookup — which is the selector DH-2 activation itself used, so
    // what is printed is what was activated.
    ...(verb === 'materialize' ? { draft_paths: result.draft_paths ?? [] } : {}),
    ...(verb === 'activate' ? { draft_paths: draftPathsFor(candidateId) } : {}),
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
    const { scope } = candidateContext(args);
    const candidates = readProjectCards();
    output({ scope, count: candidates.length, candidates }, asJson);
  } else if (subcommand === 'inbox') {
    output(runInbox(candidateContext(args)), asJson);
  } else if (subcommand === 'inspect') {
    const candidateId = requireCandidateId(args, subcommand);
    output(runInspect(candidateContext(args), candidateId), asJson);
  } else if (subcommand === 'drafts') {
    output(runDrafts(candidateContext(args)), asJson);
  } else if (subcommand === 'analyze') {
    console.error(
      'arc learn analyze is deprecated. The statistical analyzer has been retired; ' +
        'candidate review now lives in the dashboard. Run: arc learn dashboard',
    );
    process.exit(1);
  } else if (subcommand === 'accept') {
    const candidateId = requireCandidateId(args, subcommand);
    output(runAccept(candidateContext(args), candidateId), asJson);
  } else if (Object.hasOwn(ACTION_FOR_VERB, subcommand)) {
    const candidateId = requireCandidateId(args, subcommand);
    output(runTransition(candidateContext(args), subcommand, candidateId), asJson);
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
