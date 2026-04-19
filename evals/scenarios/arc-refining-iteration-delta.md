# Eval: arc-refining-iteration-delta

## Scope

skill

## Target

skills/arc-refining/SKILL.md — accumulating-delta discipline (D3) and terminal-only block behavior (D6) per the 2026-04-19 SDD v2 realignment.

## Scenario

Iterate on the `auth` spec from v2 → v3. The fixture starts with a v2 spec already containing one `<delta version="2">` element (the prior sprint's record). A new design document at `docs/plans/auth/2026-06-01/design.md` describes adding device-trust scoring. Update `specs/auth/spec.xml` (and any detail files) to v3. Do NOT implement any application code — produce the updated spec artifacts only.

This is an evaluation context with no human reviewer available. Work from the information in the design doc. If a structural choice is open (e.g., one device-trust requirement vs. per-signal split), make a defensible decision and document the rationale inside the new `<delta>` element — do not pause for clarification.

## Context

The `specs/auth/` directory contains the current spec.xml (version 2, with a v2 delta already present from the prior iteration). The previous design documents are at `docs/plans/auth/2026-04-01/` and `docs/plans/auth/2026-05-10/`. A validation toolkit is available at `scripts/lib/sdd-utils.js`.

Per the realigned pipeline (D3): `<overview>` accumulates `<delta>` children — the refiner appends a new `<delta version="3">` and MUST preserve the existing `<delta version="2">` verbatim. Per D6: if the refiner blocks for any reason, it writes nothing to disk (no `refiner-report.md`, no half-spec).

You have Read, Write, Edit, Bash, Grep, Glob tools.

## Setup

mkdir -p docs/plans/auth/2026-04-01 docs/plans/auth/2026-05-10 docs/plans/auth/2026-06-01 specs/auth/details scripts/lib
cp $PROJECT_ROOT/scripts/lib/sdd-utils.js scripts/lib/
cp $PROJECT_ROOT/scripts/lib/yaml-parser.js scripts/lib/
cp $PROJECT_ROOT/scripts/lib/models.js scripts/lib/
cp $PROJECT_ROOT/scripts/lib/dag-schema.js scripts/lib/

cat > docs/plans/auth/2026-04-01/design.md << 'DESIGN_V1'
# Auth System

## Problem

The application has no user identity layer. We need per-user authentication.

## Proposed Solution

Stateless JWT-based authentication. Users register with email and password.

## Requirements

Registration, login, logout, email verification, password reset. Auth endpoints rate-limited.

## Scope

Includes: registration, login, logout, email verification, password reset, JWT issuance, rate limiting.
Excludes: OAuth/SSO providers, multi-factor authentication.
DESIGN_V1

cat > docs/plans/auth/2026-05-10/design.md << 'DESIGN_V2'
# Auth System — Iteration 2026-05-10

## Context (from spec v1)

Spec v1 covers registration, login, JWT issuance, and rate-limited auth. Reference: specs/auth/spec.xml v1.

## Change Intent

Add OAuth 2.0 support for Google and GitHub as alternative login providers. OAuth users bypass the email verification step.
DESIGN_V2

cat > docs/plans/auth/2026-06-01/design.md << 'DESIGN_V3'
# Auth System — Iteration 2026-06-01

## Context (from spec v2)

Spec v2 covers email/password and OAuth (Google, GitHub) login flows with shared JWT issuance and rate limiting. Reference: specs/auth/spec.xml v2.

## Change Intent

Add device-trust scoring on each login. The score is computed from request fingerprint (UA, IP geo, last-seen) and is attached to the issued JWT as a claim. Downstream services may use it for adaptive authorization (e.g., require step-up for low-trust devices).

Out of scope: the step-up mechanism itself; this iteration only adds the score.

## Architecture Impact

The login handler emits the score before JWT issuance. The score lives in a new claim `dt_score` on the JWT (integer 0..100). No DB schema changes — score is recomputed each login.
DESIGN_V3

cat > specs/auth/spec.xml << 'SPEC_V2'
<?xml version="1.0" encoding="UTF-8"?>
<spec>
  <overview>
    <spec_id>auth</spec_id>
    <spec_version>2</spec_version>
    <status>active</status>
    <supersedes>auth:v1</supersedes>
    <source>
      <design_path>docs/plans/auth/2026-05-10/design.md</design_path>
      <design_iteration>2026-05-10</design_iteration>
    </source>
    <title>User Authentication</title>
    <description>Per-user JWT authentication with OAuth (Google, GitHub) support added in v2.</description>
    <scope>
      <includes>
        <feature id="registration">User registration with email and password</feature>
        <feature id="login">Login with JWT issuance (email/password and OAuth)</feature>
        <feature id="rate-limit">Rate limiting for auth endpoints</feature>
        <feature id="oauth-google">Google OAuth 2.0 login</feature>
        <feature id="oauth-github">GitHub OAuth 2.0 login</feature>
      </includes>
      <excludes>
        <reason>Multi-factor authentication — deferred</reason>
      </excludes>
    </scope>
    <delta version="2" iteration="2026-05-10">
      <added ref="fr-auth-004" />
      <added ref="fr-auth-005" />
    </delta>
  </overview>
  <details>
    <detail_file path="details/auth-core.xml" />
  </details>
</spec>
SPEC_V2

cat > specs/auth/details/auth-core.xml << 'DETAIL_V2'
<?xml version="1.0" encoding="UTF-8"?>
<detail id="auth-core">
  <title>Authentication Core Flows</title>
  <requirement id="fr-auth-001">
    <title>User Registration</title>
    <description>Users MUST register with email and password.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-001-ac1">Given valid creds when user submits registration then system MUST create user record and send verification email. <trace>REQ-F001</trace></criterion>
    </acceptance_criteria>
  </requirement>
  <requirement id="fr-auth-002">
    <title>JWT Login</title>
    <description>Login MUST return a 15-minute JWT.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-002-ac1">Given verified creds when user logs in then system MUST issue 15-min JWT. <trace>REQ-F002</trace></criterion>
    </acceptance_criteria>
  </requirement>
  <requirement id="fr-auth-003">
    <title>Rate Limiting</title>
    <description>Auth endpoints MUST enforce 10 req/min per IP.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-003-ac1">Given client at &gt;10 req/min when next request arrives then system MUST return 429. <trace>REQ-F003</trace></criterion>
    </acceptance_criteria>
  </requirement>
  <requirement id="fr-auth-004">
    <title>Google OAuth Login</title>
    <description>Users MAY log in via Google OAuth.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-004-ac1">Given valid Google OAuth callback when user completes flow then system MUST issue JWT identical in shape to email/password. <trace>REQ-F004</trace></criterion>
    </acceptance_criteria>
  </requirement>
  <requirement id="fr-auth-005">
    <title>GitHub OAuth Login</title>
    <description>Users MAY log in via GitHub OAuth.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-005-ac1">Given valid GitHub OAuth callback when user completes flow then system MUST issue JWT identical in shape to email/password. <trace>REQ-F005</trace></criterion>
    </acceptance_criteria>
  </requirement>
</detail>
DETAIL_V2

# v2 sprint completed (refiner gate must see all-completed before admitting v3)
cat > specs/auth/dag.yaml << 'DAG_V2'
epics:
  - id: epic-oauth-google
    name: Google OAuth Login
    status: completed
    spec_path: specs/auth/epics/epic-oauth-google/epic.md
    worktree: null
    depends_on: []
    features: []
  - id: epic-oauth-github
    name: GitHub OAuth Login
    status: completed
    spec_path: specs/auth/epics/epic-oauth-github/epic.md
    worktree: null
    depends_on: []
    features: []
blocked: []
DAG_V2

git init -q && git add -A && git commit -q -m "initial state: v2 spec with v2 delta + completed v2 DAG + v3 design doc"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

25

## Assertions

- [tool_called] Write
- [ ] The output `specs/auth/spec.xml` has `<spec_version>3</spec_version>` (incremented from 2).
- [ ] The output `specs/auth/spec.xml` contains `<supersedes>auth:v2</supersedes>`.
- [ ] The output `specs/auth/spec.xml` contains BOTH a `<delta version="2">` element (preserved verbatim from the prior spec) AND a new `<delta version="3">` element. Per D3, refiner must accumulate deltas — never overwrite. The v2 delta MUST still reference `fr-auth-004` and `fr-auth-005`.
- [ ] The new `<delta version="3">` is placed AFTER the existing `<delta version="2">` (ascending order; v3 is the last child of `<overview>`).
- [ ] The new `<delta version="3">` contains at least one `<added>` child whose ref points to a new device-trust requirement id (e.g., `fr-auth-006` or `fr-auth-device-001`).
- [ ] No `refiner-report.md` file was written anywhere in the trial tree. Per D6, refiner block behavior is terminal-only; even on a successful run, the deprecated artifact must not appear.
- [ ] Pre-existing requirements not mentioned by the v3 Change Intent (`fr-auth-001` through `fr-auth-005`) are preserved in the updated spec — they MUST still appear in detail files.

## Grader

mixed

## Grader Config

Inspect the final written `specs/auth/spec.xml` file content and the trial workspace tree.

For `<spec_version>3</spec_version>`: literal element with value `3`. Any other value or missing element fails.

For `<supersedes>auth:v2</supersedes>`: literal element with exact text `auth:v2`. Wrong format fails.

For accumulating deltas: search for `<delta version="2"` AND `<delta version="3"` literal substrings — both MUST appear. Then verify the v2 delta still has `<added ref="fr-auth-004"` and `<added ref="fr-auth-005"`. If the agent rewrote the v2 delta or dropped it, this assertion fails (this is the load-bearing D3 check).

For ordering: confirm the v2 delta appears in source text BEFORE the v3 delta (regex match-position comparison). If v3 appears before v2 in source, fails.

For new `<added>` in v3: inside the v3 delta block, there must be an `<added ref="...">` whose ref is plausibly device-trust-related (id contains `device`, `trust`, `score`, or matches `fr-auth-00[6-9]`). Verified by reading the matching requirement in a detail file.

For refiner-report absence: walk the trial tree; FAIL if any file matching `**/refiner-report.md` exists. The deprecated artifact is forbidden in all paths (per D6).

For pre-existing requirement preservation: detail files must still contain `fr-auth-001` through `fr-auth-005`. None of these are in the v3 Change Intent, so all MUST be preserved.

Each assertion scores 1.0 or 0.0 — no partial credit.

## Trials

5

## Version

2
