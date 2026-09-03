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

const { output } = require('./shared');
const { runLearnWorkflowCommand } = require('./learn-workflow-command');

// Layer 7/8 render and activate the instinct artifact and nothing else, and
// `materialize.js` is where that narrowing is enforced — it refuses any other
// artifact type with `artifact_type_mismatch`. The CLI reads that module's own
// list rather than keeping a second copy, and uses it to describe the
// narrowing: which commands are worth suggesting, and what to say when the
// engine refuses one. Every single-transition command dispatches and renders
// the engine's refusal; `accept` is the one exception, and `runAccept` says
// why. The other types do have a producer — the dashboard's `evolve` action
// writes a `skill` record into the same queue — so this is a live branch, not
// a defensive one.
//
// Lazily required, like every other `../lib` import in this file: a `learn
// diary` run should not pay for the curator's module graph.
function supportedArtifactTypes() {
  return require('../lib/learning-curator/materialize').FIRST_SLICE_SUPPORTED_TYPES;
}

function isMaterializableType(artifactType) {
  return supportedArtifactTypes().includes(artifactType);
}

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

// The statuses whose prose above names a materialize or activate step, and so
// the only ones the artifact-type narrowing has anything to say about. Every
// other status's prose is true whatever the candidate's type, and overriding it
// would lose information — a dismissed candidate is not "leave it queued".
const STATUSES_NAMING_A_BUILD = new Set(['approved', 'materialized', 'deactivated']);

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

/**
 * The project slug a record's `scope.project` has to equal to be ours.
 *
 * `getProjectName()` in the engine's utils is the single owner of that
 * derivation — every producer in the pipeline goes through it, so the CLI
 * calls it rather than re-deriving from the project root it was handed.
 * A local `path.basename(projectRoot)` was the same string only for a project
 * directory that needs no sanitizing; anything else (`My Project` →
 * `My-Project`) matched no record at all and emptied the whole front end.
 */
function currentProjectName() {
  const { getProjectName } = require('../lib/utils');
  return getProjectName();
}

/**
 * This project's candidates from the canonical queue, as dashboard cards.
 *
 * The canonical queue is home-global, so `--project` has to say *which*
 * project. It matches `scope.project` — the sanitized project slug, which is
 * the identity the rest of the pipeline already keys on
 * (`observations/<slug>/`, `instincts/<slug>/`) and the only one the sanitized
 * card prints, so a row can be checked against the filter by eye.
 *
 * `scope.project_id` is deliberately not the key. `batch-assembler.js` takes it
 * from the *first* observation in the batch that carries one and falls back to
 * hashing the project name when none does, so a candidate carries whichever
 * value that batch happened to see — matching on it would hide candidates
 * silently. Activation keys its instinct output on `scope.project` too, so the
 * slug is the identity that is actually enforced downstream. Two project roots
 * whose basenames sanitize to the same slug are one project to the entire
 * pipeline — observation store, instincts tree, and this filter alike — and
 * that is decided upstream of the CLI, not here.
 *
 * A project-scoped record carrying no `scope.project` at all therefore belongs
 * to no project here and is invisible to the CLI. That is the safe direction —
 * the alternative is showing it from every project — and the dashboard serves
 * the whole queue, so it stays the escape hatch.
 */
function readProjectCards() {
  const { readCurrentCandidates } = require('../lib/learning-curator/queue-writer');
  const { sanitizeDashboardCard } = require('../lib/learning-dashboard');
  const project = currentProjectName();
  return Object.values(readCurrentCandidates())
    .filter((record) => record.scope?.kind === 'project' && record.scope.project === project)
    .map(sanitizeDashboardCard);
}

/**
 * A candidate id is usually copied off the machine-wide dashboard, which shows
 * other projects' candidates and the global ones too — so say which of those it
 * was rather than leaving the user to guess at a bare "not found".
 */
function missingCandidateError(candidateId) {
  const { readCurrentCandidates } = require('../lib/learning-curator/queue-writer');
  const base = `candidate not found among this project's candidates: ${candidateId}`;
  const scope = readCurrentCandidates()[candidateId]?.scope;
  if (scope?.kind === 'project' && scope.project) {
    return new Error(
      `${base} — it belongs to the project "${scope.project}", not to ` +
        `"${currentProjectName()}"; review it from there, or run: ` +
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

function findProjectCard(candidateId) {
  const card = readProjectCards().find((c) => c.candidate_id === candidateId);
  if (!card) throw missingCandidateError(candidateId);
  return card;
}

/**
 * The newest materialization manifest for a candidate, or `null`.
 *
 * Both draft questions the CLI asks — which paths, and which of them are
 * stale — are answered from this one record, so the surfaces that ask both
 * resolve it once and read it twice rather than scanning the manifest
 * directory per question.
 */
function latestMaterializationFor(candidateId) {
  const { findLatestMaterialization } = require('../lib/learning-curator/activate');
  const { getArcforgeHome } = require('../lib/utils');
  return findLatestMaterialization(getArcforgeHome(), candidateId);
}

/**
 * Absolute draft paths from a materialization manifest.
 *
 * Deliberately not `active_target_hint.target_path_summary`: that string
 * embeds `scope.project_id`, which no CLI or dashboard surface prints.
 */
function draftPathsIn(record) {
  if (!record || !Array.isArray(record.draft_artifacts)) return [];
  return record.draft_artifacts.map((artifact) => artifact.draft_path).filter(Boolean);
}

/**
 * The recorded drafts that are no longer what the manifest describes — deleted,
 * or edited since it was written.
 *
 * `findLatestMaterialization` picks the newest manifest by `created_at` and
 * checks nothing about the files it names, so every surface that prints
 * `draft_paths` can print a path that does not resolve. Layer 7 already owns
 * the comparison — `staleDraftArtifacts` is the same predicate the reuse branch
 * screens manifests with — so this asks it rather than re-hashing here.
 */
function staleDraftsIn(record) {
  if (!record) return [];
  const { staleDraftArtifacts } = require('../lib/learning-curator/materialize');
  return staleDraftArtifacts(record);
}

/** The one-question form, for the callers that ask only about the paths. */
function draftPathsFor(candidateId) {
  return draftPathsIn(latestMaterializationFor(candidateId));
}

/** The one-question form, for the callers that ask only about staleness. */
function staleDraftsFor(candidateId) {
  return staleDraftsIn(latestMaterializationFor(candidateId));
}

/** Each stale draft named with what went wrong with it. */
function describeStaleDrafts(stale) {
  return stale
    .map(
      (entry) =>
        `${entry.draft_path} ${entry.reason === 'missing' ? 'is missing' : 'has changed since it was written'}`,
    )
    .join('; ');
}

/**
 * The two prose lines `inspect` prints in place of the `materialized` status
 * prose, which says "review the draft at draft_paths" — the draft it names is
 * not there to review. Layered over `nextActionsFor` at the call site, exactly
 * as `unsupportedTypeActions` is: `nextActionsFor` is pure, and this answer
 * comes off disk.
 *
 * `materialized` is the only status this may replace, for the same reason
 * `STATUSES_NAMING_A_BUILD` exists: it is the only one whose prose names the
 * draft, so it is the only one a stale draft contradicts. Every other status's
 * prose is true whatever became of the recorded draft, and printing this
 * instead would replace it with something false — a `deactivated` candidate
 * can still be materialized afresh (the matrix allows it, and `accept` does
 * exactly that), and an `activated` one is already live, its draft only ever
 * read and never removed by activation.
 */
function staleDraftActions(stale) {
  return [
    `the recorded draft is not what was written: ${describeStaleDrafts(stale)}`,
    'activation refuses on the recorded content hash, so there is nothing to activate — ' +
      'review the queue in: arcforge learn dashboard',
  ];
}

/**
 * The subset of a card's legal actions the CLI will actually carry out.
 *
 * `available_actions` comes straight from the Action × Status matrix, which is
 * keyed on status alone and knows nothing about artifact types. The CLI's reach
 * is narrower on two axes: it has verbs for four of the seven actions
 * (`promote`, `evolve` and `deactivate` are dashboard-only), and
 * `materialize`/`activate` run through the curator, which renders the instinct
 * artifact and nothing else. Suggesting anything outside this intersection
 * advertises a command the curator then refuses — and a non-instinct candidate
 * is reachable, since the dashboard's `evolve` action
 * writes a project-scoped `skill` record into the same canonical queue.
 */
function cliActionsFor(card) {
  return card.available_actions.filter((action) => {
    if (!Object.hasOwn(VERB_FOR_ACTION, action)) return false;
    if (action !== 'materialize' && action !== 'activate') return true;
    return isMaterializableType(card.artifact_type);
  });
}

function nextCommandFor(card) {
  const runnable = cliActionsFor(card);
  const action = NEXT_ACTION_PREFERENCE.find((a) => runnable.includes(a));
  const verb = action ? VERB_FOR_ACTION[action] : 'inspect';
  return `arcforge learn ${verb} ${card.candidate_id} --project`;
}

/**
 * The `NEXT_ACTIONS` prose for the three statuses in `STATUSES_NAMING_A_BUILD`
 * names the build step that status allows. For a candidate type the curator
 * cannot render, that step does not exist, so the narrowing itself is what is
 * worth printing — the same fact the curator's refusal states when one of those
 * commands is typed. Nothing else is left for the CLI to run from
 * those three statuses (besides the build step the matrix allows only `promote`
 * and `evolve`, both dashboard-only), so the second line says where the
 * candidate can still be looked at.
 */
function unsupportedTypeActions(card) {
  return [
    `arcforge materializes ${supportedArtifactTypes().join(', ')} candidates only, so this ` +
      `${card.artifact_type} candidate has no materialize or activate step`,
    'leave it queued — the whole queue is reviewable in: arcforge learn dashboard',
  ];
}

function nextActionsFor(card) {
  const unbuildable =
    !isMaterializableType(card.artifact_type) && STATUSES_NAMING_A_BUILD.has(card.lifecycle_status);
  if (unbuildable) return unsupportedTypeActions(card);
  return NEXT_ACTIONS[card.lifecycle_status] || [];
}

/**
 * The instinct-only narrowing, in the words the CLI has always used for it.
 *
 * The narrowing belongs to Layer 7: `materialize.js` refuses any other artifact
 * type with `artifact_type_mismatch`, which the shared action handler turns into
 * an audited rejection. For a single-transition command all the CLI does is
 * render that reason in reviewer-facing prose instead of the engine's internal
 * detail string — a pre-check there would be a second copy of a gate the engine
 * already owns, and it would refuse before the audit log ever saw the request.
 * `accept` is the documented exception: it is two transitions, so it has to
 * decide before the first one lands (see `runAccept`). This function supplies
 * the prose for both, and reads the curator's list for the type it names.
 */
function narrowingMessage(card) {
  return (
    `supports ${supportedArtifactTypes().join(', ')} candidates only — ${card.candidate_id} is a ` +
    `${card.artifact_type} candidate. Materialization and activation run through the ` +
    'curator, which renders the instinct artifact and nothing else today; the other ' +
    'artifact types the queue schema names have no renderer behind them. Leave it queued, ' +
    'or review it in: arcforge learn dashboard'
  );
}

function refusalMessage(result, verb, card) {
  const base = `arcforge learn ${verb} refused: ${result.reason}`;
  if (result.reason === 'artifact_type_mismatch') {
    return `${base} — ${narrowingMessage(card)}`;
  }
  if (result.reason === 'policy_violation') {
    const legal = card.available_actions.join(', ') || 'nothing';
    const matrix =
      `${base} — ${card.candidate_id} is ${card.lifecycle_status}, and the canonical ` +
      `Action × Status matrix allows: ${legal}`;
    // The matrix is keyed on status alone, so for a candidate the curator cannot
    // build it can name a `materialize` that refuses in turn — and `activate` on
    // such a candidate is illegal from every status, because nothing ever
    // materializes it. Say the narrowing too rather than sending the reviewer
    // around that loop. Prose on an already-audited refusal, not a second gate.
    const narrowed =
      (verb === 'materialize' || verb === 'activate') && !isMaterializableType(card.artifact_type);
    return narrowed ? `${matrix}. arcforge learn ${verb} also ${narrowingMessage(card)}` : matrix;
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
  const materialization = latestMaterializationFor(card.candidate_id);
  const stale = staleDraftsIn(materialization);
  // The staleness fact is reported for every status — it is a fact about disk,
  // not about the lifecycle — but it only overrides the prose of the one
  // status that names the draft. See `staleDraftActions`.
  const overrideProse = stale.length > 0 && card.lifecycle_status === 'materialized';
  return {
    scope,
    candidate: sanitizeDashboardDetail(card.candidate_id),
    next_actions: overrideProse ? staleDraftActions(stale) : nextActionsFor(card),
    draft_paths: draftPathsIn(materialization),
    draft_paths_stale: stale,
  };
}

function runDrafts({ scope }) {
  const drafts = readProjectCards()
    .filter((card) => card.lifecycle_status === 'materialized')
    .map((card) => {
      // One manifest read per entry answers both draft questions, so the
      // staleness check adds one stat and one hash per recorded draft — worth
      // it on the command whose whole subject is the drafts.
      const materialization = latestMaterializationFor(card.candidate_id);
      return {
        ...card,
        next_command: nextCommandFor(card),
        draft_paths: draftPathsIn(materialization),
        draft_paths_stale: staleDraftsIn(materialization),
      };
    });
  return { scope, count: drafts.length, drafts };
}

/**
 * The refusal `accept` prints instead of dispatching, when the curator has no
 * renderer for the candidate's artifact type.
 *
 * It names the type, states that nothing was applied, and offers the two moves
 * that still exist: leave it queued (the dashboard reviews the whole queue) or
 * record the approval on its own. It deliberately does not claim the candidate
 * is otherwise ready — a `dismissed` or `activated` candidate has a nearer
 * obstacle, and this message would be the wrong one to answer it with.
 */
function acceptRefusalMessage(card) {
  return (
    `arcforge learn accept refused, and nothing was applied — no approval, no draft, ` +
    `${card.candidate_id} is unchanged. It ${narrowingMessage(card)}. ` +
    'To record the approval on its own, run: ' +
    `arcforge learn approve ${card.candidate_id} --project`
  );
}

/**
 * The refusal `accept` prints instead of re-reporting a draft that is not there.
 *
 * An already-`materialized` candidate is `accept`'s no-op: it dispatches
 * nothing and hands back the draft it already has. So "nothing was applied" is
 * literally true here — the refusal replaces a report, not a transition.
 *
 * It names no recovery command on purpose. `materialized` allows only
 * `activate`, and activation refuses on the recorded content hash, so every
 * command the CLI has would refuse in turn; inventing one would send the
 * reviewer around that loop. The dashboard is where the queue is reviewable,
 * so that is what it points at.
 */
function staleDraftAcceptMessage(card, stale) {
  return (
    `arcforge learn accept refused, and nothing was applied — ${card.candidate_id} is ` +
    `already materialized and is unchanged. Its recorded draft is no longer what was ` +
    `written: ${describeStaleDrafts(stale)}. There is nothing left to hand back: the canonical ` +
    'Action × Status matrix allows a materialized candidate only to activate, and activation ' +
    'refuses on the recorded content hash. Review the queue in: arcforge learn dashboard'
  );
}

/**
 * Approve (when still pending) and materialize in one step — never activates.
 *
 * `accept` is the CLI's one compound command, and that is why it — alone —
 * decides the artifact-type narrowing itself instead of rendering the curator's
 * refusal. The queue is an append-only event log, so the approve is not rolled
 * back when the materialize is refused. For a transient refusal that is fine:
 * the candidate stays `approved`, which the matrix allows to materialize, so
 * re-running is the recovery. The artifact-type narrowing is not transient — no
 * re-run clears it — and the matrix allows an `approved` candidate neither to
 * materialize nor to dismiss, so half-landing strands it in a status with no
 * way out. Refusing before the first dispatch is the only outcome that keeps
 * the command all-or-nothing.
 *
 * The guard is on the command, not on the dispatch count: `accept` refuses an
 * unbuildable type from every status, including the ones where it would have
 * dispatched materialize alone. One rule for one command name beats a refusal
 * that depends on where the candidate happened to be. `approve`, `materialize`
 * and `activate` are single transitions and keep rendering the curator's own
 * audited refusal — do not add a pre-check to them.
 *
 * The second dispatch carries `expected_current_status` so a concurrent writer
 * is caught rather than overwritten.
 */
function runAccept({ scope }, candidateId) {
  const card = findProjectCard(candidateId);
  if (!isMaterializableType(card.artifact_type)) throw new Error(acceptRefusalMessage(card));
  if (card.lifecycle_status === 'materialized') {
    // The no-op branch dispatches nothing and reports the draft the candidate
    // already has. Reporting a path that is not there — or one whose file has
    // been edited since the manifest recorded it — would be success over a
    // draft that activation then refuses, so the report has to be checked even
    // though there is no transition to guard.
    const stale = staleDraftsFor(candidateId);
    if (stale.length > 0) throw new Error(staleDraftAcceptMessage(card, stale));
    return { scope, candidate: card, draft_paths: draftPathsFor(candidateId) };
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
    draft_paths: draftPathsFor(candidateId),
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
