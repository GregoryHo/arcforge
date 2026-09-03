/**
 * learn-candidate-prose.js — what the `learn` candidate subcommands say.
 *
 * The vocabulary of the front end: the CLI verb ↔ matrix action mapping, the
 * inbox's ordering, the per-status "what to do next" prose, and every refusal
 * message. Pure functions over a sanitized dashboard card and an engine result —
 * nothing here reads disk (that is `learn-candidate-queue.js`) or dispatches
 * anything (that is `learn-command.js`).
 */

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
// Lazily required, like every other `../lib` import across the candidate front
// end: a `learn diary` run should not pay for the curator's module graph.
function supportedArtifactTypes() {
  return require('../lib/learning-curator/materialize').FIRST_SLICE_SUPPORTED_TYPES;
}

function isMaterializableType(artifactType) {
  return supportedArtifactTypes().includes(artifactType);
}

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
 * Two arms, because there are two ways to have no draft and they refuse
 * differently: recorded files that no longer match (activation refuses on the
 * content hash) and no usable record at all (activation refuses with
 * `materialization_missing`). The empty-list arm is not cosmetic —
 * `describeStaleDrafts([])` would leave a dangling colon naming nothing.
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
  if (stale.length === 0) {
    return [
      'no usable materialization record remains for this candidate, so there is no draft to review',
      'activation refuses without a usable record, so there is nothing to activate — ' +
        'review the queue in: arcforge learn dashboard',
    ];
  }
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

/**
 * Where a card is sent when no transition is worth advertising: `inspect` runs
 * from every status, and it is the surface that says why the step the status
 * would otherwise name is not on offer.
 */
function inspectCommandFor(card) {
  return `arcforge learn inspect ${card.candidate_id} --project`;
}

function nextCommandFor(card) {
  const runnable = cliActionsFor(card);
  const action = NEXT_ACTION_PREFERENCE.find((a) => runnable.includes(a));
  if (!action) return inspectCommandFor(card);
  return `arcforge learn ${VERB_FOR_ACTION[action]} ${card.candidate_id} --project`;
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
  // `materialization_missing` has two origins and only one of them wants this
  // prose, so the guard is the absence of a module failure rather than the
  // reason alone. The shared handler rejects with it when nothing resolved at
  // all, and puts its detail at the top level of the result where the
  // `module_failure` fallback below never sees it — the bare reason string is
  // what a reviewer would otherwise read. Layer 8 fails with the same reason
  // for a manifest that DID resolve but does not describe this candidate's
  // draft; that one arrives with a real `module_failure.detail` saying which,
  // and printing "no usable materialization record remains" over it would
  // assert something false about a record still on disk.
  //
  // The handler arm is reachable by typing the command the guide documents for
  // a materialized candidate, so it gets reviewer prose like the other
  // handler-level refusals above, not a `result.detail` fallback, which would
  // change how every other one renders.
  if (result.reason === 'materialization_missing' && !result.module_failure) {
    return (
      `${base} — no usable materialization record remains for ${card.candidate_id}, so there ` +
      'is no recorded draft to activate. Review the queue in: arcforge learn dashboard'
    );
  }
  const detail = result.module_failure?.detail;
  return detail ? `${base} — ${detail}` : base;
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
 * `activate`, and activation refuses on the recorded content hash — or with
 * `materialization_missing` when no usable manifest is left — so every command
 * the CLI has would refuse in turn; inventing one would send the reviewer
 * around that loop. The dashboard is where the queue is reviewable, so that is
 * what it points at.
 *
 * `stale` is empty when the manifest itself is absent, unparseable or names no
 * draft: there is no recorded file left to call stale, so the cause clause says
 * there is no usable record rather than emitting a colon with nothing after it.
 * "Usable", not "gone", because a manifest whose `draft_artifacts` list is
 * empty or pathless is still on disk — `draftArtifactsIntact` is false for it
 * all the same, and it is Layer 8 that then names the specific defect.
 */
function staleDraftAcceptMessage(card, stale) {
  const cause =
    stale.length > 0
      ? `Its recorded draft is no longer what was written: ${describeStaleDrafts(stale)}.`
      : 'No usable materialization record remains for it, so there is no draft to hand back.';
  return (
    `arcforge learn accept refused, and nothing was applied — ${card.candidate_id} is ` +
    `already materialized and is unchanged. ${cause} There is nothing left to hand back: the ` +
    'canonical Action × Status matrix allows a materialized candidate only to activate, and ' +
    'activation refuses without an intact recorded draft. Review the queue in: ' +
    'arcforge learn dashboard'
  );
}

module.exports = {
  ACTION_FOR_VERB,
  STATUS_RANK,
  isMaterializableType,
  staleDraftActions,
  inspectCommandFor,
  nextCommandFor,
  nextActionsFor,
  refusalMessage,
  acceptRefusalMessage,
  staleDraftAcceptMessage,
};
