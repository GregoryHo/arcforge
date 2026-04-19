# Eval: arc-planning-delta-scoped-sprint

## Scope

workflow

## Target
arc-planning sprint model + delta-scoped planning per the 2026-04-19 SDD v2 realignment. When the spec has a `<delta>` element and an existing `dag.yaml` from a prior sprint, the skill guides the agent to (a) **overwrite** the old DAG (no archive — D1), (b) rebuild a new DAG containing one epic per child of the current sprint's `<delta>` (added/modified/removed/renamed — D4), excluding requirements that are not in the delta.

## Scenario

The auth spec has been iterated to v2. The v2 spec includes a `<delta>` element listing what changed. The previous sprint's DAG (`specs/auth/dag.yaml`) has all 3 epics marked completed (the refiner already certified the prior sprint complete and admitted v2 — planner trusts that and does not re-check).

Plan the next sprint. Produce the new `specs/auth/dag.yaml` covering the right scope for this iteration. Do NOT write any implementation code; only produce the DAG + associated epic/feature files under `specs/auth/epics/`.

## Context

This is an arcforge SDD v2 project. The planner is a pure function `(spec + delta) → (dag.yaml + epics/)`. The DAG is rebuilt from scratch each sprint and overwrites the previous file — no archive, no state preservation. Every child of the current sprint's `<delta>` (added, modified, removed, renamed) generates exactly one epic. Historical traceability lives in the spec's accumulated `<delta>` elements and in `docs/plans/<spec-id>/<iteration>/design.md`, not in DAG archive files.

## Setup

mkdir -p specs/auth/details specs/auth/epics

# v2 spec with delta — added OAuth login, modified rate limiting, removed legacy session endpoint
cat > specs/auth/spec.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<spec>
  <overview>
    <spec_id>auth</spec_id>
    <spec_version>2</spec_version>
    <status>active</status>
    <supersedes>auth:v1</supersedes>
    <source>
      <design_path>docs/plans/auth/2026-04-01/design.md</design_path>
      <design_iteration>2026-04-01</design_iteration>
    </source>
    <title>User Authentication</title>
    <description>JWT-based authentication with OAuth addition; legacy session endpoint removed.</description>
    <scope>
      <includes>
        <feature id="registration">Email/password registration</feature>
        <feature id="login">Login with JWT issuance (email/password + OAuth)</feature>
        <feature id="rate-limit">Tighter rate limiting on auth endpoints</feature>
        <feature id="oauth">OAuth 2.0 login via Google</feature>
      </includes>
    </scope>
    <delta version="2" iteration="2026-04-01">
      <added ref="fr-auth-004" />
      <modified ref="fr-auth-003" />
      <removed ref="fr-auth-099">
        <reason>Legacy session-cookie endpoint replaced by JWT in v1; no migration needed</reason>
      </removed>
    </delta>
  </overview>
  <details>
    <detail_file path="details/auth-core.xml" />
  </details>
</spec>
EOF

cat > specs/auth/details/auth-core.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<detail id="auth-core">
  <requirement id="fr-auth-001">
    <title>Email Registration</title>
    <description>Users register with email and password.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-001-ac1">Given valid credentials when user submits registration then system MUST create the user record. <trace>REQ-F001</trace></criterion>
    </acceptance_criteria>
  </requirement>
  <requirement id="fr-auth-002">
    <title>JWT Login</title>
    <description>Successful login returns a 15-minute JWT.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-002-ac1">Given valid creds when user logs in then system MUST issue a 15-min JWT. <trace>REQ-F002</trace></criterion>
    </acceptance_criteria>
  </requirement>
  <requirement id="fr-auth-003">
    <title>Rate Limiting</title>
    <description>Auth endpoints enforce 5 req/min per IP (tightened from 10).</description>
    <acceptance_criteria>
      <criterion id="fr-auth-003-ac1">Given a client IP at &gt;5 req/min when next request arrives then system MUST return 429. <trace>REQ-F003</trace></criterion>
    </acceptance_criteria>
  </requirement>
  <requirement id="fr-auth-004">
    <title>OAuth Login</title>
    <description>Users can log in via Google OAuth; JWT is issued as for email/password.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-004-ac1">Given valid OAuth callback when user completes flow then system MUST issue a JWT identical in shape to email/password. <trace>REQ-F004</trace></criterion>
    </acceptance_criteria>
  </requirement>
</detail>
EOF

# Previous sprint's DAG — all epics completed (the refiner gate already certified this on the way to v2)
cat > specs/auth/dag.yaml << 'EOF'
epics:
  - id: epic-registration
    name: Email Registration
    status: completed
    spec_path: specs/auth/epics/epic-registration/epic.md
    worktree: null
    depends_on: []
    features:
      - id: feat-reg-1
        name: Register endpoint
        status: completed
  - id: epic-login
    name: JWT Login
    status: completed
    spec_path: specs/auth/epics/epic-login/epic.md
    worktree: null
    depends_on: []
    features:
      - id: feat-login-1
        name: Login endpoint
        status: completed
  - id: epic-rate-limit
    name: Rate Limiting
    status: completed
    spec_path: specs/auth/epics/epic-rate-limit/epic.md
    worktree: null
    depends_on: []
    features:
      - id: feat-rl-1
        name: Enforce 10 req/min
        status: completed
blocked: []
EOF

# Capture the v1 dag.yaml byte-content so the assertion can verify the planner overwrote (D1) — no copy should remain.
sha1sum specs/auth/dag.yaml > /tmp/v1-dag-sha.txt 2>/dev/null || shasum -a 1 specs/auth/dag.yaml > /tmp/v1-dag-sha.txt

git init -q && git add -A && git commit -q -m "fixture: v2 spec with delta + completed v1 DAG"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

25

## Assertions

- [ ] The `specs/auth/dag.yaml` file at end of run was OVERWRITTEN — its content differs from the v1 fixture content. (Detect by parsing the new YAML and confirming it contains an epic for `fr-auth-004`, which the v1 DAG did not.)
- [ ] No archive copy of the v1 dag.yaml exists anywhere under `specs/auth/`. Specifically: there must be NO file matching the patterns `specs/auth/dag.yaml.*`, `specs/auth/*.archive*`, `specs/auth/archive/**`, `specs/auth/.dag.yaml.bak*`, or any other sibling/child file/dir whose content matches the v1 YAML. The git history of `dag.yaml` is the only allowed retroactive trace. FAIL if any archive-style copy is created (per D1 — overwrite, never archive).
- [ ] The new `specs/auth/dag.yaml` contains an epic corresponding to `fr-auth-004` (OAuth — the ADDED requirement).
- [ ] The new `specs/auth/dag.yaml` contains an epic corresponding to `fr-auth-003` (rate-limit — the MODIFIED requirement).
- [ ] The new `specs/auth/dag.yaml` contains a teardown epic corresponding to `fr-auth-099` (the REMOVED requirement). Per D4, `<removed>` generates an epic — not a skip. The epic may be named with a "teardown" / "remove" / "cleanup" prefix and its `source_requirement` references `fr-auth-099`.
- [ ] The new `specs/auth/dag.yaml` does NOT contain epics for `fr-auth-001` or `fr-auth-002` (these were not in the v2 delta and are out of scope for this sprint).

## Grader

mixed

## Grader Config

Assertions verify the planner respects the realigned contract:

- **Overwrite, no archive (D1):** the trial workspace must contain exactly one DAG file at `specs/auth/dag.yaml`. Walk the `specs/auth/` tree and FAIL if any file/dir matches an archive pattern (`*.archive*`, `*.bak`, `archive/`, etc.). The skill explicitly forbids archive sibling files; a baseline agent unaware of the realignment may still issue `mv specs/auth/dag.yaml specs/auth/dag.yaml.archive.YYYY-MM-DD` and that should now fail.
- **Delta-scoped epics (added + modified + removed):** parse the new dag.yaml and confirm the three expected epics are present (one each for the delta's three children) and that the two out-of-scope requirements (`fr-auth-001`, `fr-auth-002`) are NOT planned. The teardown epic for `fr-auth-099` is the load-bearing new behavior — per D4, `<removed>` no longer translates to "skip"; it now generates a teardown epic that references the removed id (the implementer LLM greps the codebase for `fr-auth-099` and removes tied code). A pre-realignment skill may still skip `<removed>` and lose this assertion.
- The version from the prior fixture (k=3) bumps to k=5 alignment in this realignment iteration; assertions are intentionally tighter to discriminate D1+D4 compliance.

Each assertion scores 1.0 or 0.0 — no partial credit.

## Trials

5

## Version

2
