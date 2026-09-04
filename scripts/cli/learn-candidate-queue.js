/**
 * learn-candidate-queue.js — what the `learn` candidate subcommands read.
 *
 * Everything those commands learn from disk lives here: which of the
 * machine-wide Layer-5 queue's records belong to this project, which candidate
 * an id names, and what the newest materialization manifest says about a
 * candidate's drafts. Rendering those facts is `learn-candidate-prose.js`;
 * dispatching on them is `learn-command.js`.
 *
 * Every `../lib` import stays inside the function that needs it, as in
 * `learn-command.js`: a `learn diary` run should not pay for the curator's
 * module graph.
 */

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
function readProjectCandidates() {
  const { readCurrentCandidates } = require('../lib/learning-curator/queue-writer');
  const project = currentProjectName();
  return Object.values(readCurrentCandidates()).filter(
    (record) => record.scope?.kind === 'project' && record.scope.project === project,
  );
}

function readProjectCards() {
  const { sanitizeDashboardCard } = require('../lib/learning-dashboard');
  return readProjectCandidates().map(sanitizeDashboardCard);
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

/**
 * One candidate, as both the queue record and the card the CLI prints.
 *
 * Almost every surface wants only the card — the sanitized wire model is what
 * may be printed. The exception is a check the engine will run against the
 * stored record itself: `sanitizeDashboardCard` redacts `name` and truncates it
 * to 120 characters, so a precheck reading `card.name` would be judging a
 * different string than the engine judges, and a name whose offending character
 * sat inside a redacted span would pass here and be refused there. Those checks
 * read `record`; everything printed still comes from `card`.
 *
 * Both come out of one queue pass, so a caller that needs both does not read
 * the store twice.
 */
function findProjectCandidate(candidateId) {
  const { sanitizeDashboardCard } = require('../lib/learning-dashboard');
  const record = readProjectCandidates().find((r) => r.candidate_id === candidateId);
  if (!record) throw missingCandidateError(candidateId);
  return { record, card: sanitizeDashboardCard(record) };
}

function findProjectCard(candidateId) {
  return findProjectCandidate(candidateId).card;
}

/**
 * The materialization manifest a candidate's draft resolves to, or `null`.
 *
 * The engine's own selection — the newest manifest with its drafts intact, else
 * the newest — so what the CLI prints is what activation will consume.
 *
 * Both draft questions the CLI asks — which paths, and which of them are
 * stale — are answered from this one record, so the surfaces that ask both
 * resolve it once and read it twice rather than scanning the manifest
 * directory per question.
 */
function materializationFor(candidateId) {
  const { findUsableMaterialization } = require('../lib/learning-curator/activate');
  const { getArcforgeHome } = require('../lib/utils');
  return findUsableMaterialization(getArcforgeHome(), candidateId);
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
 * `findUsableMaterialization` prefers a manifest whose drafts are intact but
 * falls back to the newest when none is, so a surface that prints
 * `draft_paths` can still print a path that does not resolve. Layer 7 already
 * owns the comparison — `staleDraftArtifacts` is the same predicate the reuse
 * branch screens manifests with — so this asks it rather than re-hashing here.
 */
function staleDraftsIn(record) {
  if (!record) return [];
  const { staleDraftArtifacts } = require('../lib/learning-curator/materialize');
  return staleDraftArtifacts(record);
}

/**
 * Whether the candidate has no reviewable draft behind its manifest at all.
 *
 * `staleDraftsIn` cannot answer this. It is a per-recorded-file question, and a
 * manifest that is absent, unparseable or structurally empty names no file to
 * call stale — `findUsableMaterialization` returns `null` when the drafts
 * directory is gone and silently skips a manifest it cannot parse, so an empty
 * stale list means either "every recorded draft is intact" or "there is no
 * record to check", which are opposite answers to the only question the draft
 * surfaces ask.
 *
 * `draftArtifactsIntact` is Layer 7's own answer to "is there a reviewable
 * draft" — it is the predicate the reuse branch screens manifests with, and it
 * is false for a missing, empty or pathless record as well as a stale one — so
 * this asks it rather than adding a second predicate here.
 */
function draftUnavailableIn(record) {
  const { draftArtifactsIntact } = require('../lib/learning-curator/materialize');
  return !draftArtifactsIntact(record);
}

/** The one-question form, for the callers that ask only about the paths. */
function draftPathsFor(candidateId) {
  return draftPathsIn(materializationFor(candidateId));
}

/**
 * The file activation will create or overwrite.
 *
 * Layer 8's own derivation, not a second one: `buildActiveInstinctPath` is what
 * `activate()` computes its write target with, and `getArcforgeHome()` is the
 * root the dashboard handler hands it, so this resolves to the same path the
 * write lands on rather than to a CLI-local guess at it.
 *
 * Safe to print where `active_target_hint.target_path_summary` is not: that
 * string embeds `scope.project_id`, while this keys on `scope.project`, the
 * slug the sanitized card already carries and prints. Layer 8 falls back to
 * `getProjectName()` when `scope.project` is absent, which cannot diverge from
 * the real target here — `readProjectCandidates` yields only records whose
 * `scope.project` is that same slug.
 */
function activeTargetFor(card) {
  const { buildActiveInstinctPath } = require('../lib/learning-curator/activate');
  const { getArcforgeHome } = require('../lib/utils');
  return buildActiveInstinctPath(getArcforgeHome(), card);
}

module.exports = {
  readProjectCards,
  findProjectCandidate,
  findProjectCard,
  materializationFor,
  draftPathsIn,
  staleDraftsIn,
  draftUnavailableIn,
  draftPathsFor,
  activeTargetFor,
};
