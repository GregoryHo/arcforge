# Eval: arc-refining-iteration-delta

## Scope

skill

## Target

skills/arc-refining/SKILL.md

## Scenario

Iterate on the `auth` spec. A new design document has been added at `docs/plans/auth/2026-05-10/design.md` describing changes to the authentication system. Update `specs/auth/spec.xml` (and any detail files) to reflect the new design. Do NOT implement any application code — produce the updated spec artifacts only.

## Context

The `specs/auth/` directory contains the current spec.xml (version 1). The previous design document is at `docs/plans/auth/2026-04-01/design.md`. A validation toolkit is available at `scripts/lib/sdd-utils.js`. Follow arcforge conventions.

You have Read, Write, Edit, Bash, Grep, Glob tools.

## Setup

mkdir -p docs/plans/auth/2026-04-01 docs/plans/auth/2026-05-10 specs/auth/details scripts/lib
cp $PROJECT_ROOT/scripts/lib/sdd-utils.js scripts/lib/

cat > docs/plans/auth/2026-04-01/design.md << 'DESIGN_V1'
# Auth System

## Problem

The application has no user identity layer. Every request is anonymous. We need per-user authentication.

## Proposed Solution

Stateless JWT-based authentication. Users register with email and password; successful login returns a 15-minute access token and a 30-day refresh cookie. Password storage uses bcrypt.

## Requirements

The system must support registration, login, logout, email verification, and password reset. All auth endpoints are rate-limited to 10 req/min per IP.

## Scope

Includes: registration, login, logout, email verification, password reset, JWT issuance and refresh, rate limiting.
Excludes: OAuth/SSO providers, multi-factor authentication.
DESIGN_V1

cat > specs/auth/spec.xml << 'SPEC_V1'
<?xml version="1.0" encoding="UTF-8"?>
<spec>
  <overview>
    <spec_id>auth</spec_id>
    <spec_version>1</spec_version>
    <status>active</status>
    <source>
      <design_path>docs/plans/auth/2026-04-01/design.md</design_path>
      <design_iteration>2026-04-01</design_iteration>
    </source>
    <title>User Authentication</title>
    <description>Per-user JWT authentication replacing the anonymous request model. Enables audit trails and per-user revocation.</description>
    <scope>
      <includes>
        <feature id="registration">User registration with email and password</feature>
        <feature id="login">Login with JWT issuance</feature>
        <feature id="session-mgmt">Session management via refresh tokens</feature>
        <feature id="rate-limit">Rate limiting for auth endpoints</feature>
      </includes>
      <excludes>
        <reason>OAuth/SSO — deferred pending base layer stability</reason>
        <reason>Multi-factor authentication — deferred to Phase 2</reason>
      </excludes>
    </scope>
  </overview>
  <details>
    <detail_file path="details/auth-core.xml" />
  </details>
</spec>
SPEC_V1

cat > specs/auth/details/auth-core.xml << 'DETAIL_V1'
<?xml version="1.0" encoding="UTF-8"?>
<detail id="auth-core">
  <title>Authentication Core Flows</title>

  <requirement id="fr-auth-001">
    <title>User Registration</title>
    <description>Users MUST register with email and password.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-001-ac1">
        Given an unregistered email and a valid password, when the user submits the registration form, then the system MUST create a user record and send a verification email.
        <trace>REQ-F001</trace>
      </criterion>
    </acceptance_criteria>
  </requirement>

  <requirement id="fr-auth-002">
    <title>JWT Login</title>
    <description>Login MUST return a 15-minute JWT access token.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-002-ac1">
        Given a verified user with valid credentials, when the user submits login, then the system MUST return a JWT access token with 15-minute expiration.
        <trace>REQ-F002</trace>
      </criterion>
    </acceptance_criteria>
  </requirement>

  <requirement id="fr-auth-003">
    <title>Rate Limiting</title>
    <description>Auth endpoints MUST enforce 10 req/min per IP.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-003-ac1">
        Given a client IP making authentication requests, when the rate exceeds 10 per minute, then the system MUST reject further requests with HTTP 429 until the next minute.
        <trace>REQ-F003</trace>
      </criterion>
    </acceptance_criteria>
  </requirement>
</detail>
DETAIL_V1

cat > docs/plans/auth/2026-05-10/design.md << 'DESIGN_V2'
# Auth System — Iteration 2026-05-10

## Context

The auth spec (v1, active) covers registration, login, logout, email verification, password reset, and rate-limited JWT issuance. Reference: `specs/auth/spec.xml` v1.

## Change Intent

Add OAuth 2.0 support for Google and GitHub as alternative login providers. OAuth users bypass the email verification step — their identity is already verified by the provider. The existing email/password flow remains unchanged; OAuth is additive.

Rationale: A significant portion of prospective users drop off at the registration form. OAuth reduces friction without disturbing the existing path.

## Architecture Impact

OAuth callbacks share the JWT issuance layer with email/password login. Downstream session management is unaffected. A new `oauth_provider` field is added to the user model (nullable; null for email/password users).
DESIGN_V2

git init -q && git add -A && git commit -q -m "initial state: v1 spec + iteration design doc"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

20

## Assertions

- [tool_called] Write
- [ ] The output `specs/auth/spec.xml` has `<spec_version>2</spec_version>` (incremented from 1)
- [ ] The output `specs/auth/spec.xml` contains a `<supersedes>auth:v1</supersedes>` element
- [ ] The output `specs/auth/spec.xml` contains a `<delta>` element recording the change
- [ ] The `<delta>` element is placed as a child of `<overview>` (i.e., nested inside `<overview>...</overview>`, NOT as a sibling outside)
- [ ] The `<delta>` element contains at least one `<added>` child whose `ref` attribute points to a new OAuth-related requirement id
- [ ] Pre-existing requirements not mentioned by the Change Intent (registration, login, rate-limit) are preserved in the updated spec — they MUST still appear in detail files and the spec still references them

## Grader

mixed

## Grader Config

Inspect the final written `specs/auth/spec.xml` file content (search Write/Edit tool calls in the transcript for the final spec.xml body).

For `<spec_version>2</spec_version>`: check the literal element is present with value `2`. Any other value or missing element fails.

For `<supersedes>auth:v1</supersedes>`: check the literal element is present with the exact text `auth:v1`. Missing element OR wrong format (e.g., `auth-v1`, `auth:1`) fails.

For `<delta>` presence: search for the literal string `<delta` in the spec.xml. If absent, fails.

For `<delta>` placement inside `<overview>`: analyze the XML structure. The `<delta>` tag must appear between the `<overview>` opening tag and its matching `</overview>` closing tag. If `<delta>` is outside `<overview>` (e.g., after `</overview>` as a sibling), this assertion fails.

For `<added>` child with OAuth ref: inside the `<delta>` element, there must be an `<added ref="...">` where the ref points to a requirement id related to OAuth (e.g., `fr-auth-oauth-001`, `fr-oauth-001`, or similar). The exact id name is not prescribed, but the requirement it references must be OAuth-related (verified by reading the matching requirement in a detail file).

For pre-existing requirements preservation: the detail files must still contain `fr-auth-001` (registration), `fr-auth-002` (login), and `fr-auth-003` (rate-limit). These are not in the Change Intent, so they MUST be preserved unchanged. If any are deleted, renamed, or substantively altered, this assertion fails.

Each assertion scores 1.0 or 0.0 — no partial credit.

## Trials

3

## Version

1
