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

// The draft writer's other deterministic prerequisite: L7-12 refuses a name it
// cannot use as a filename. Read from the same module for the same reason as
// the type list — the rule belongs to Layer 7, and a second copy here would
// drift from the branch that enforces it.
function isMaterializableName(name) {
  return require('../lib/learning-curator/materialize').isMaterializableName(name);
}

function namePolicySummary() {
  return require('../lib/learning-curator/materialize').NAME_POLICY_SUMMARY;
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
 * not there to review.
 *
 * Two arms, because there are two ways to have no draft and they refuse
 * differently: recorded files that no longer match (activation refuses on the
 * content hash) and no usable record at all (activation refuses with
 * `materialization_missing`). The empty-list arm is not cosmetic —
 * `describeStaleDrafts([])` would leave a dangling colon naming nothing.
 *
 * Neither arm names a recovery command, because from `materialized` there is
 * none: the matrix allows only `activate`, and activation is exactly what
 * refuses. That is what separates this from `retiredDraftActions` below, where
 * the matrix still allows a `materialize` that runs.
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
 * The two prose lines `inspect` prints in place of the `deactivated` status
 * prose, which says "materialize or activate it again". Half of that stays
 * true: `materialize` from `deactivated` writes a fresh draft and succeeds with
 * the recorded one deleted, edited, or its whole manifest gone. The `activate`
 * half does not — activation reads the recorded draft, so it refuses on the
 * content hash when a recorded file no longer matches it, and with
 * `materialization_missing` when no usable record is left.
 *
 * Two arms for the same two ways to have no draft as `staleDraftActions`, and
 * the empty-list arm is not cosmetic there for the same reason. Unlike that
 * one, both arms end in a command, because here there is one that runs.
 *
 * It names the stale path as evidence, never as something to go read: naming a
 * draft to review is what the `materialized` prose does, and a lost draft is
 * what makes that false.
 */
function retiredDraftActions(stale) {
  if (stale.length === 0) {
    return [
      'no usable materialization record remains, so activating it again refuses',
      'materialize it again to write a fresh draft, or leave it retired',
    ];
  }
  return [
    `the recorded draft is not what was written: ${describeStaleDrafts(stale)}, so activating ` +
      'it again refuses on the recorded content hash',
    'materialize it again to write a fresh draft, or leave it retired',
  ];
}

/**
 * `inspect`'s prose when the candidate has no reviewable draft on disk, or
 * `null` when that disk fact changes nothing about what to say.
 *
 * Layered over `nextActionsFor` at the call site, exactly as
 * `unsupportedTypeActions` is: `nextActionsFor` is pure over a card, and this
 * answer comes off disk. `inspect` is the surface that carries it — `inbox`
 * runs over every card and deliberately does no per-card disk work at all (see
 * `runInbox`), so a `deactivated` entry there still reads "materialize or
 * activate it again", whose first move is also the `next_command` it prints.
 *
 * Two statuses name the recorded draft, and a lost draft makes each wrong in a
 * different way, so each gets its own replacement. Every other status is left
 * alone: an `activated` candidate is already live and its draft was only ever
 * read, an `approved` one has written none yet, and a terminal status names no
 * draft at all — replacing their prose would say something false.
 *
 * The artifact-type narrowing outranks the disk fact, exactly as it does in
 * `nextActionsFor`: for a type the curator cannot render there is no
 * materialize or activate step for a missing draft to qualify, and both
 * replacements name one. Nothing materializes a non-instinct candidate today,
 * so no such candidate reaches either status — this is the precedence
 * `STATUSES_NAMING_A_BUILD` already encodes for them, kept in the one other
 * place that overrides the same prose, not a live branch.
 */
function draftUnavailableActions(card, stale) {
  if (!isMaterializableType(card.artifact_type)) return null;
  if (card.lifecycle_status === 'materialized') return staleDraftActions(stale);
  if (card.lifecycle_status === 'deactivated') return retiredDraftActions(stale);
  return null;
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
 * It names the type and states that nothing was applied. It deliberately does
 * not claim the candidate is otherwise ready — a `dismissed` or `activated`
 * candidate has a nearer obstacle, and this message would be the wrong one to
 * answer it with. For the same reason the recovery it names is conditional:
 * `approve` is legal only from `pending_review`, so from any other status
 * naming it would send the reviewer at a command the matrix refuses with
 * `policy_violation`. `approved` is the sharp case — the dashboard's `evolve`
 * writes a project-scoped `skill` record, `learn approve` moves it, and from
 * there `materialize` refuses on the type while `approve` refuses on the
 * matrix. Dropped, the message still ends in `narrowingMessage`'s own "leave it
 * queued, or review it in: arcforge learn dashboard", so it names no command
 * rather than pointing at the dashboard twice.
 *
 * It deliberately does not fall back to `reject` the way its sibling below
 * does, so `needs_more_evidence` — the one status where `dismiss` is legal and
 * `approve` is not — falls through to the dashboard with a legal command left
 * unnamed. Not because rejecting is wrong there: `NEXT_ACTIONS` names it for
 * that status, and `inspect` still prints that for this very card, since the
 * narrowing does not reach a status that names no build step. It is not this
 * refusal's business. `dismiss` is a verdict on the candidate's merit, and the
 * narrowing says nothing about merit — only that the type has no renderer yet,
 * which is why it ends in "leave it queued" rather than pushing the reviewer to
 * discard something a later renderer could build.
 *
 * The asymmetry with the sibling below is temporal, not about stranding. Both
 * obstacles strand the candidate in the CLI's own terms: from `approved` the
 * matrix allows `materialize`, `promote` and `evolve`, and the CLI can run none
 * of them — `materialize` meets the type refusal, the other two are
 * dashboard-only — so the approval this message recommends is the last CLI move
 * either candidate has. It is still worth recommending here and not there,
 * because the type's obstacle can lift: a renderer arrives, and the approval is
 * already recorded (and until then the dashboard still has `promote` and
 * `evolve`, and the approval is a verdict on merit worth holding on its own).
 * Nothing the CLI offers ever renames a candidate, so the name's obstacle never
 * lifts — an approval there buys nothing a later release redeems, which is why
 * declining really is the only way out for the sibling.
 */
function acceptRefusalMessage(card) {
  const recovery = card.available_actions.includes('approve')
    ? ' To record the approval on its own, run: ' +
      `arcforge learn approve ${card.candidate_id} --project`
    : '';
  return (
    `arcforge learn accept refused, and nothing was applied — no approval, no draft, ` +
    `${card.candidate_id} is unchanged. It ${narrowingMessage(card)}.${recovery}`
  );
}

/**
 * The refusal `accept` prints instead of dispatching, when the draft writer
 * cannot use the candidate's name as a filename.
 *
 * Like its sibling above it does not claim the candidate is otherwise ready —
 * a `dismissed` or `activated` candidate has a nearer obstacle — and for the
 * same reason the recovery it names is conditional: `dismiss` is legal only
 * from `pending_review` and `needs_more_evidence`, so a candidate the matrix
 * would refuse to dismiss is sent to the dashboard rather than at a command
 * that would refuse in turn. Unlike its sibling it offers no "approve it on its
 * own" either. Not because approving is the move that strands the candidate and
 * approving there is not: the `approved` row leaves both of them with no CLI
 * move, as the sibling's comment sets out. It is because this obstacle is the
 * one that never lifts — nothing the CLI offers renames a candidate, so an
 * approval recorded here is a decision no later release redeems, while the
 * sibling's is one a renderer eventually makes good on.
 *
 * It deliberately never echoes the name. The card redacts and truncates that
 * field for a reason, and the raw queue value — which is what was checked — is
 * the one string here that has never been through the sanitizer.
 */
function acceptNameRefusalMessage(card) {
  const recovery = card.available_actions.includes('dismiss')
    ? `the way out is to decline it: arcforge learn reject ${card.candidate_id} --project`
    : 'review it in: arcforge learn dashboard';
  return (
    `arcforge learn accept refused, and nothing was applied — no approval, no draft, ` +
    `${card.candidate_id} is unchanged. Its name is not one the draft writer can use: ` +
    `${namePolicySummary()}. Nothing the CLI offers renames a candidate, so ${recovery}`
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
  isMaterializableName,
  draftUnavailableActions,
  inspectCommandFor,
  nextCommandFor,
  nextActionsFor,
  refusalMessage,
  acceptRefusalMessage,
  acceptNameRefusalMessage,
  staleDraftAcceptMessage,
};
