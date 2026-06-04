/**
 * learn-command.js - Handler for the `learn` CLI command.
 */

const { output } = require('./shared');

function runLearnCommand(args, { projectRoot, asJson }) {
  const learning = require('../lib/learning');
  const subcommand = args.positional[0];
  const resolveLearningScope = () => {
    if (args.flags.global) return 'global';
    if (args.flags.project) return 'project';
    throw new Error('learn command requires --project or --global');
  };

  if (subcommand === 'dashboard') {
    const { startServer } = require('../lib/learning-dashboard');
    const rawPort = args.options.port;
    const port = rawPort === undefined ? 3334 : Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('learn dashboard --port must be an integer from 1 to 65535');
    }
    startServer({ projectRoot, port });
    return;
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
    const scope = resolveLearningScope();
    const candidates = learning.loadCandidates({ scope, projectRoot });
    output({ scope, count: candidates.length, candidates }, asJson);
  } else if (subcommand === 'inbox') {
    const scope = resolveLearningScope();
    output(learning.listLearningInbox({ scope, projectRoot }), asJson);
  } else if (subcommand === 'inspect') {
    const candidateId = args.positional[1];
    if (!candidateId) throw new Error('learn inspect requires a candidate id');
    const scope = resolveLearningScope();
    output(learning.inspectCandidate(candidateId, { scope, projectRoot }), asJson);
  } else if (subcommand === 'drafts') {
    const scope = resolveLearningScope();
    output(learning.listMaterializedDrafts({ scope, projectRoot }), asJson);
  } else if (subcommand === 'analyze') {
    console.error(
      'arc learn analyze is deprecated. The statistical analyzer has been retired; ' +
        'candidate review now lives in the dashboard. Run: arc learn dashboard',
    );
    process.exit(1);
  } else if (subcommand === 'materialize') {
    const candidateId = args.positional[1];
    if (!candidateId) throw new Error('learn materialize requires a candidate id');
    const scope = resolveLearningScope();
    output(learning.materializeCandidate(candidateId, { scope, projectRoot }), asJson);
  } else if (subcommand === 'accept') {
    const candidateId = args.positional[1];
    if (!candidateId) throw new Error('learn accept requires a candidate id');
    const scope = resolveLearningScope();
    output(learning.acceptCandidate(candidateId, { scope, projectRoot }), asJson);
  } else if (subcommand === 'activate') {
    const candidateId = args.positional[1];
    if (!candidateId) throw new Error('learn activate requires a candidate id');
    const scope = resolveLearningScope();
    output(learning.activateCandidate(candidateId, { scope, projectRoot }), asJson);
  } else if (subcommand === 'approve' || subcommand === 'reject') {
    const candidateId = args.positional[1];
    if (!candidateId) throw new Error(`learn ${subcommand} requires a candidate id`);
    const scope = resolveLearningScope();
    output(
      learning.transitionCandidate(
        candidateId,
        subcommand === 'approve' ? 'approved' : 'rejected',
        {
          scope,
          projectRoot,
        },
      ),
      asJson,
    );
  } else {
    console.error(
      'Usage: arc learn [dashboard [--port N]|status|enable|disable|inbox|review|drafts|inspect <id>|approve <id>|reject <id>|accept <id>|materialize <id>|activate <id>] [--project|--global]',
    );
    process.exit(1);
  }
}

module.exports = { runLearnCommand };
