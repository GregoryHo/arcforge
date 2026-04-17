# Eval: arc-refining-iteration-reliability

## Scope

agent

## Target

skills/arc-refining/SKILL.md — reliability of Path B iteration output (delta metadata, supersedes, version increment)

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
The application has no user identity layer. We need per-user authentication.

## Proposed Solution
Stateless JWT-based authentication. Users register with email and password; successful login returns a 15-minute access token and a 30-day refresh cookie.

## Requirements
Registration, login, logout, email verification, password reset. Auth endpoints rate-limited to 10 req/min per IP.

## Scope
Includes: registration, login, session management, rate limiting.
Excludes: OAuth/SSO, multi-factor authentication.
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
    <description>Per-user JWT authentication replacing the anonymous request model.</description>
    <scope>
      <includes>
        <feature id="registration">User registration with email/password</feature>
        <feature id="login">Login with JWT issuance</feature>
        <feature id="rate-limit">Rate limiting for auth endpoints</feature>
      </includes>
      <excludes>
        <reason>OAuth/SSO — deferred</reason>
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
        Given an unregistered email, when the user submits registration, then the system MUST create a user record.
        <trace>REQ-F001</trace>
      </criterion>
    </acceptance_criteria>
  </requirement>

  <requirement id="fr-auth-002">
    <title>JWT Login</title>
    <description>Login MUST return a 15-minute JWT access token.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-002-ac1">
        Given valid credentials, when the user submits login, then the system MUST return a JWT with 15-minute expiration.
        <trace>REQ-F002</trace>
      </criterion>
    </acceptance_criteria>
  </requirement>

  <requirement id="fr-auth-003">
    <title>Rate Limiting</title>
    <description>Auth endpoints MUST enforce 10 req/min per IP.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-003-ac1">
        Given rate exceeds 10 per minute, the system MUST reject with HTTP 429.
        <trace>REQ-F003</trace>
      </criterion>
    </acceptance_criteria>
  </requirement>
</detail>
DETAIL_V1

cat > docs/plans/auth/2026-05-10/design.md << 'DESIGN_V2'
# Auth System — Iteration 2026-05-10

## Context

The auth spec (v1, active) covers registration, login, rate-limited JWT issuance. Reference: `specs/auth/spec.xml` v1.

## Change Intent

Add OAuth 2.0 support for Google and GitHub as alternative login providers. OAuth users bypass email verification. Existing email/password flow remains unchanged.

## Architecture Impact

OAuth callbacks share the JWT issuance layer. User model gains optional `oauth_provider` field.
DESIGN_V2

git init -q && git add -A && git commit -q -m "initial: v1 spec + iteration design"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

20

## Assertions

- [tool_called] Write
- [ ] The output `specs/auth/spec.xml` correctly reflects the iteration: it has spec_version=2, a supersedes element pointing to auth:v1, and a delta element (inside overview) recording the OAuth addition
- [ ] Pre-existing requirements (fr-auth-001, fr-auth-002, fr-auth-003) are preserved in the detail files

## Grader

mixed

## Grader Config

After the agent completes, locate the final written `specs/auth/spec.xml` content (search the transcript for the last Write or Edit targeting `specs/auth/spec.xml`).

Assertion 1 (iteration correctness): Check that the spec.xml contains ALL of these:
- `<spec_version>2</spec_version>` (exactly value 2)
- `<supersedes>auth:v1</supersedes>` (exact format)
- A `<delta>` element that is placed INSIDE `<overview>...</overview>` (not outside as sibling)
- The `<delta>` element contains at least one `<added>` or `<modified>` child whose `ref` attribute references an OAuth-related requirement (in id or text, mentions oauth/OAuth/Google/GitHub)

ALL four conditions must hold for this assertion to pass. Score 1.0 or 0.0.

Assertion 2 (preservation): Check the detail files still contain requirements with ids `fr-auth-001`, `fr-auth-002`, and `fr-auth-003`. If any are deleted or their ids changed, fail. If a rename delta was used correctly, that's OK (the id still exists under the new name). Score 1.0 or 0.0.

## Trials

5

## Version

1
