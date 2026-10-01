/**
 * learn-instinct-lifecycle.js — `learn instinct deactivate` and `learn instinct restore`.
 *
 * The two `learn instinct` actions that change what may be injected into a
 * future session, so both act on the project they are run in only (`--project`,
 * no value) and refuse `--global`.
 *
 * `deactivate` is a front end onto the canonical transition, exactly as the
 * candidate verbs in `learn-command.js` are: the same scope gate, the same
 * candidate lookup (an unknown id is the engine's audited miss, another
 * project's id the CLI's own unaudited refusal), and `handleDashboardAction`
 * for the matrix, the store lock and the audit record (B-12, B-5). Like
 * `learn activate`, the typed command is the deliberate act: it prints the
 * behavior change to stderr and carries its own acknowledgement.
 *
 * `restore` is the way back from the instinct archive (B-11); the engine half
 * is `scripts/lib/instinct-restore.js`.
 *
 * `learn-command.js` is required lazily: it requires the workflow dispatcher
 * that requires this module.
 */

const { output } = require('./shared');

function runInstinctDeactivate(args, candidateId, asJson) {
  const {
    requireProjectCandidateScope,
    findTransitionCandidate,
    dispatchAction,
  } = require('./learn-command');
  const { findProjectCard, activeTargetFor } = require('./learn-candidate-queue');
  const scope = requireProjectCandidateScope(args);
  const verb = 'instinct deactivate';
  const { card } = findTransitionCandidate(verb, candidateId, 'deactivate');
  if (card.lifecycle_status === 'activated') {
    console.error(
      `deactivating ${card.candidate_id}: future sessions will no longer receive this ` +
        'instinct — it is not injected at SessionStart from now on.',
    );
    console.error(
      `file: ${activeTargetFor(card)} — moved to the deactivation archive (.disabled/), ` +
        `not deleted; arcforge learn activate ${card.candidate_id} --project brings it back.`,
    );
  }
  const result = dispatchAction({
    verb,
    action: 'deactivate',
    card,
    // The status the card was read in, so a move that is not legal from it is
    // the matrix's `policy_violation`, and a concurrent move is `stale_status`.
    expectedStatus: card.lifecycle_status,
    safetyAck: { reviewer_saw_behavior_change_warning: true },
  });
  output(
    {
      scope,
      candidate: findProjectCard(candidateId),
      action_id: result.action_id,
      next_status: result.next_status,
      activation_id: result.activation_id,
      archive_paths: result.archive_paths ?? [],
    },
    asJson,
  );
}

function runInstinctRestore(args, name, asJson) {
  if (args.flags.global) {
    throw new Error(
      'learn instinct restore does not take --global — it restores an instinct of the ' +
        'project it is run in; run it with --project from that project',
    );
  }
  if (!args.flags.project) throw new Error('learn instinct restore requires --project');
  const { restoreInstinct } = require('../lib/instinct-restore');
  const { getProjectName } = require('../lib/utils');
  const { CLI_ACTOR } = require('./learn-command');
  const result = restoreInstinct({ name, project: getProjectName(), actor: CLI_ACTOR });
  if (asJson) {
    output(result, true);
    return;
  }
  console.log(`Restored: ${result.id} → ${result.path}`);
  console.log(
    `  from ${result.from}${result.archive_reason ? ` (archived by ${result.archive_reason})` : ''}`,
  );
  if (!result.injected) {
    console.log(
      '  It is not an activated instinct, so sessions do not receive it. A curator instinct ' +
        `comes back into sessions with: arcforge learn activate ${result.id} --project`,
    );
  }
}

module.exports = { runInstinctDeactivate, runInstinctRestore };
