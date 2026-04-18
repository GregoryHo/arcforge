# Eval: arc-brainstorming-gamma-mode-structure

## Scope

workflow

## Target
arc-brainstorming Path B (gamma mode): when iterating on an existing spec with a user-provided change request, the skill guides the agent to produce a design doc that follows gamma mode structure — a `## Context` section naming the prior spec + a `## Change Intent` section describing what changes. This structure is load-bearing for arc-refining's iteration-mode validation downstream.

## Scenario

The existing `specs/auth/spec.xml` (v1) covers registration, login, and rate-limited JWT issuance. A product decision was just made:

> "Add OAuth 2.0 login with Google as an alternative to email+password. OAuth users should skip email verification since the provider already verified. We want this to be additive — existing email/password path stays unchanged."

Produce the design document for this iteration at the correct arcforge location. No clarifying questions — make reasonable assumptions and write the doc. Do not modify `specs/auth/spec.xml` or write any implementation code; only produce the design doc.

## Context

This is an arcforge project using the SDD v2 pipeline. The current spec is at `specs/auth/spec.xml`. Design iterations are stored per-spec under `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md`. You have Read, Write, Edit, Bash, Grep, Glob tools.

## Setup

mkdir -p specs/auth/details docs/plans/auth

cat > specs/auth/spec.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<spec>
  <overview>
    <spec_id>auth</spec_id>
    <spec_version>1</spec_version>
    <status>active</status>
    <source>
      <design_path>docs/plans/auth/2026-03-01/design.md</design_path>
      <design_iteration>2026-03-01</design_iteration>
    </source>
    <title>User Authentication</title>
    <description>JWT-based authentication replacing anonymous requests.</description>
    <scope>
      <includes>
        <feature id="registration">Email/password registration with verification</feature>
        <feature id="login">Login with JWT issuance</feature>
        <feature id="rate-limit">Rate limiting on auth endpoints</feature>
      </includes>
    </scope>
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
    <description>Users register with email and password. Email verification required before login.</description>
  </requirement>
  <requirement id="fr-auth-002">
    <title>JWT Login</title>
    <description>Successful login returns a 15-minute JWT access token.</description>
  </requirement>
  <requirement id="fr-auth-003">
    <title>Rate Limiting</title>
    <description>Auth endpoints enforce 10 req/min per IP.</description>
  </requirement>
</detail>
EOF

git init -q && git add -A && git commit -q -m "fixture: v1 auth spec"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

12

## Assertions

- [tool_called] Write:docs/plans/auth
- [ ] The design doc lives at `docs/plans/auth/<YYYY-MM-DD>/design.md` with a real date (not literal `<YYYY-MM-DD>`).
- [ ] The design doc contains a `## Context` section that references the existing v1 spec (mentions "fr-auth-001", "fr-auth-002", OR the spec path `specs/auth/spec.xml`).
- [ ] The design doc contains a `## Change Intent` section describing the OAuth addition.
- [ ] The design doc does NOT contain "TODO" or "TBD" or placeholder text where real content should be.

## Grader

mixed

## Grader Config

Behavioral assertion confirms the agent wrote under `docs/plans/auth/` (not, for example, `specs/auth/design-v2.md` or root `design.md`). Text assertions check for the gamma-mode structural markers (`## Context`, `## Change Intent`) that arc-refining's iteration mode depends on. A baseline agent without the arc-brainstorming skill may produce a document that lacks those section headers or writes to a non-canonical path.

## Trials

3

## Version

1
