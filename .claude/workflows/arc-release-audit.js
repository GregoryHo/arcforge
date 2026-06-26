export const meta = {
  name: 'arc-release-audit',
  description:
    'Read-only release audit engine for arcforge: verify pre-flight gates, fan out per-commit CHANGELOG narrative, adversarially audit shipped doc surface. Produces a release report; performs NO mutations and runs NO live evals.',
  whenToUse:
    'Run during an arc-releasing bump (after the benchmark is fresh) to generate a reference-grade CHANGELOG draft + a verified doc-audit before the human applies the version bump, commit, and tag. args: { version, prevTag, prevVersion, date }.',
  phases: [
    { title: 'Preflight', detail: 'gates: range/tag, benchmark freshness, version-sync — verify, never execute' },
    { title: 'Narrative', detail: 'one reader per commit → synthesize CHANGELOG section' },
    { title: 'Audit', detail: 'parallel doc-surface axes → findings' },
    { title: 'Verify', detail: 'adversarially confirm each finding is real and in-scope' },
  ],
};

// ---------------------------------------------------------------------------
// Inputs (args). Reusable across releases — nothing is hardcoded to 3.2.0.
// ---------------------------------------------------------------------------
// The runtime serializes the Workflow `args` value, so it arrives here as a JSON
// string (not the object literal passed at the call site). Coerce before reading.
const a = ((v) => {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === 'object' ? v : {};
})(args);
const version = a.version || 'UNKNOWN';
const prevTag = a.prevTag || '';
const prevVersion = a.prevVersion || (prevTag ? prevTag.replace(/^v/, '') : '');
const date = a.date || 'YYYY-MM-DD'; // Date.now() is unavailable in scripts

// ---------------------------------------------------------------------------
// Schemas — structured output forces clean, parseable agent returns.
// ---------------------------------------------------------------------------
const SETUP_SCHEMA = {
  type: 'object',
  required: ['commits', 'evalSurfaceChanged', 'benchmarkFresh', 'versionSynced', 'currentVersion', 'checks'],
  properties: {
    commits: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sha', 'subject'],
        properties: { sha: { type: 'string' }, subject: { type: 'string' } },
      },
    },
    evalSurfaceChanged: { type: 'boolean' },
    benchmarkFresh: { type: 'boolean' },
    versionSynced: { type: 'boolean' },
    currentVersion: { type: 'string' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'status', 'detail'],
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['pass', 'fail', 'warn'] },
          detail: { type: 'string' },
        },
      },
    },
  },
};

const COMMIT_SCHEMA = {
  type: 'object',
  required: ['sha', 'type', 'headline', 'fixed', 'changed', 'added', 'removed'],
  properties: {
    sha: { type: 'string' },
    pr: { type: 'string' },
    type: { type: 'string' },
    headline: { type: 'string' },
    fixed: { type: 'array', items: { type: 'string' } },
    changed: { type: 'array', items: { type: 'string' } },
    added: { type: 'array', items: { type: 'string' } },
    removed: { type: 'array', items: { type: 'string' } },
  },
};

const CHANGELOG_SCHEMA = {
  type: 'object',
  required: ['markdown'],
  properties: { markdown: { type: 'string' } },
};

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'severity', 'issue', 'suggestion'],
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'warn', 'nit'] },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['isReal', 'reason'],
  properties: { isReal: { type: 'boolean' }, reason: { type: 'string' } },
};

// ---------------------------------------------------------------------------
// Phase 1 — Preflight gates (one agent batches the deterministic bash checks).
// GATE, not executor: it reads check-benchmark-freshness's verdict; it never
// runs `arc eval report` or live trials (that would rubber-stamp staleness).
// ---------------------------------------------------------------------------
phase('Preflight');
const setup = await agent(
  `You are the pre-flight gate for an arcforge release audit. Release version: ${version}. Previous tag: ${prevTag}.
Run these READ-ONLY checks from the repo root and report structured results. Do NOT modify, stage, or commit anything. Do NOT run any eval trials or \`arc eval report\`.

1. \`git log ${prevTag}..HEAD --oneline\` — the commit list for this release (return each as {sha, subject}). Strip the leading PR-merge noise but keep the (#NN) suffix.
2. Eval surface: \`git diff --name-only ${prevTag} HEAD | grep -E '^(skills/|evals/scenarios/|evals/fixtures/)'\` — evalSurfaceChanged = true if any output.
3. Benchmark freshness: \`node scripts/check-benchmark-freshness.js\` — benchmarkFresh = (exit code 0). Include its stdout in the matching check detail.
4. Version sync: \`npm run check:versions\` — versionSynced = (exit code 0). Capture the location→version table into the check detail.
5. CLI consumers: \`npm run check:cli-consumers\` — read-only. Capture its stdout into the check detail. The linter is warn-mode today (always exits 0): record status 'warn' if it lists any zero-consumer command, else 'pass'. Do NOT treat a nonzero list as a hard fail while warn-mode is in effect.
6. currentVersion: the top-level "version" in package.json.

Return JSON per schema. 'checks' must contain one row per check above (name, status pass/fail/warn, detail).`,
  { schema: SETUP_SCHEMA, label: 'preflight-gates', phase: 'Preflight' },
);

log(
  `Preflight: ${setup.commits.length} commits · benchmarkFresh=${setup.benchmarkFresh} · evalSurfaceChanged=${setup.evalSurfaceChanged} · versionSynced=${setup.versionSynced} · current=${setup.currentVersion}`,
);

// ---------------------------------------------------------------------------
// Phase 2 — CHANGELOG narrative: one reader per commit, then synthesize.
// ---------------------------------------------------------------------------
phase('Narrative');
const summaries = (
  await parallel(
    setup.commits.map((c) => () =>
      agent(
        `Read commit ${c.sha} ("${c.subject}") in the arcforge repo (READ-ONLY).
Run \`git show ${c.sha} --stat\` and \`git log -1 ${c.sha} --format=%B\`, and inspect specific diffs (\`git show ${c.sha} -- <path>\`) where the intent is unclear.
Produce a REFERENCE-GRADE, changelog-oriented summary — what a reader six months from now needs, NOT a file list:
  - fixed: what broke, why it broke, how the fix works
  - changed: what changed and the user-visible impact
  - added: what is new and what it now enables
  - removed: what was removed and the replacement/migration
Each bullet is one tight sentence. Empty arrays are fine. Extract the PR number (#NN) from the subject into 'pr'. Return JSON per schema.`,
        { schema: COMMIT_SCHEMA, label: `read:${c.sha.slice(0, 7)}`, phase: 'Narrative' },
      ),
    ),
  )
).filter(Boolean);

const changelog = await agent(
  `Write the CHANGELOG entry for arcforge ${version}, dated ${date}, from these per-commit summaries:

${JSON.stringify(summaries, null, 2)}

Rules:
- Header: \`## [${version}] - ${date}\`
- Sections in this order, omit any that are empty: ### Fixed, ### Changed, ### Added, ### Removed
- MERGE and DEDUPLICATE related items across commits into coherent narrative bullets (not one bullet per commit). Reference-grade prose — this text is extracted verbatim into the GitHub Release body, so it is user-facing.
- Do NOT claim new eval coverage: for this release the benchmark was RE-AGGREGATED from existing results, not a fresh run of newly-added gate scenarios. If you mention evals, say only that the freshness gate / benchmark tooling shipped.
Return JSON {markdown: "<the section, starting at the ## header>"}.`,
  { schema: CHANGELOG_SCHEMA, label: 'changelog-synth', phase: 'Narrative' },
);

// ---------------------------------------------------------------------------
// Phase 3+4 — Doc-surface audit (parallel axes), each verified as it lands.
// ---------------------------------------------------------------------------
const AXES = [
  {
    key: 'install-surface',
    prompt: `Audit arcforge's six install-surface files (READ-ONLY): .codex/INSTALL.md, .gemini/INSTALL.md, .opencode/INSTALL.md, docs/README.codex.md, docs/README.gemini.md, docs/README.opencode.md.
Flag, with the exact file: (1) hardcoded skill/symlink/agent COUNTS that drift across releases (e.g. "24 symlinks") — should be invariants; (2) stale path references; (3) install commands that look broken; (4) unintended sibling divergence between the platform docs (Windows shell variants being uneven is usually real drift; a missing Codex Tool-Mapping table is intentional — do not flag that). Return JSON per schema (empty findings is a valid result).`,
  },
  {
    key: 'stale-patterns',
    prompt: `Search arcforge shipped surface (skills/, docs/guide/, .claude-plugin/, hooks/, commands/, agents/, templates/) for stale strings (READ-ONLY).
Specifically: (1) the OLD version string "${prevVersion}" hardcoded anywhere outside canonical version locations; (2) references to removed/renamed helpers or deprecated paths. Use \`grep -rn\`. Do NOT flag: docs/plans/*, .claude/rules/*, or tests that deliberately blacklist an old pattern (those SHOULD keep the old string). Return JSON per schema.`,
  },
  {
    key: 'version-locations',
    prompt: `Verify the 9 canonical version locations for arcforge (READ-ONLY) and report each one's CURRENT value so the bump can target them precisely:
package.json (version), .claude-plugin/plugin.json (version), .claude-plugin/marketplace.json (plugins[0].version), .opencode/plugins/arcforge.js (version:), README.md (shields.io badge URL), website/page/hero.jsx (vX.Y.Z label), website/page/sections.jsx (footer vX.Y.Z), website/page/hero.js (built), website/page/sections.js (built).
For each, emit a finding with severity 'nit', file = "<path> — current: <value>", issue describing whether it equals ${prevVersion} (expected pre-bump) or is anomalous, and suggestion = the bump target ${version}. Also run \`grep -rn "${prevVersion}" package.json .claude-plugin/ .opencode/plugins/arcforge.js README.md website/page/\` and note the hit count. Return JSON per schema.`,
  },
];

const auditResults = await pipeline(
  AXES,
  (axis) => agent(axis.prompt, { schema: AUDIT_SCHEMA, label: `audit:${axis.key}`, phase: 'Audit' }),
  (review, axis) =>
    parallel(
      (review && review.findings ? review.findings : []).map((f) => () =>
        agent(
          `Adversarially verify this arcforge release-audit finding from the "${axis.key}" axis. Read the actual file and confirm. Reject (isReal=false) if: it is a false positive, out of scope (docs/plans, .claude/rules, blacklist tests), or already correct. Be skeptical — default to isReal=false when uncertain.
Finding: ${JSON.stringify(f)}`,
          { schema: VERDICT_SCHEMA, label: `verify:${axis.key}`, phase: 'Verify' },
        ).then((v) => ({ ...f, axis: axis.key, verdict: v })),
      ),
    ),
);

const flat = auditResults.flat().filter(Boolean);
const realFindings = flat.filter((f) => f.verdict && f.verdict.isReal);

log(`Audit: ${realFindings.length} confirmed / ${flat.length} raw findings`);

// ---------------------------------------------------------------------------
// Return the release report. The orchestrating session applies it.
// ---------------------------------------------------------------------------
return {
  version,
  prevTag,
  date,
  preflight: {
    commits: setup.commits,
    benchmarkFresh: setup.benchmarkFresh,
    evalSurfaceChanged: setup.evalSurfaceChanged,
    versionSynced: setup.versionSynced,
    currentVersion: setup.currentVersion,
    checks: setup.checks,
  },
  changelogDraft: changelog.markdown,
  auditFindings: realFindings,
  rawFindingCount: flat.length,
};
