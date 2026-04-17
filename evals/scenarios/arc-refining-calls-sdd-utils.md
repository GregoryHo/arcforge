# Eval: arc-refining-calls-sdd-utils

## Scope

skill

## Target

skills/arc-refining/SKILL.md

## Scenario

Refine the design doc at `docs/plans/auth/2026-05-10/design.md` into a structured XML spec at `specs/auth/`. The design doc is already written and committed. Produce `specs/auth/spec.xml` and any needed detail files following arcforge's SDD pipeline conventions. Do NOT implement any application code — only the spec artifacts.

## Context

This is a Path A (new spec) scenario — no existing `specs/auth/spec.xml`. The project has a validation toolkit at `scripts/lib/sdd-utils.js` and schema guidance at `scripts/lib/sdd-schemas/`. The validation toolkit exports:

- `parseDesignDoc(filePath)` + `validateDesignDoc(parsed)` for input validation (checks the design doc has required structure)
- `parseSpecHeader(xmlContent)` + `validateSpecHeader(parsed)` for output validation (checks the produced spec.xml identity header is valid)

You have Read, Write, Edit, Bash, Grep, Glob tools.

## Setup

mkdir -p docs/plans/auth/2026-05-10 specs scripts/lib
cp -r $PROJECT_ROOT/scripts/lib/sdd-utils.js scripts/lib/
cp -r $PROJECT_ROOT/scripts/lib/sdd-schemas scripts/lib/
cat > docs/plans/auth/2026-05-10/design.md << 'DESIGN_EOF'
# Auth System

## Problem

The application currently has no user identity layer. Every request is anonymous, making it impossible to personalize content, audit actions, or enforce access control. We need a foundation that all other features can build on.

## Proposed Solution

Implement a stateless JWT-based authentication system. Users register with email and password; successful login returns a short-lived access token (15 min) and a long-lived refresh token (30 days, stored as httpOnly cookie). Token refresh is automatic and transparent.

Password storage uses bcrypt (cost factor 12). Email verification is required before first login. Password reset flow uses time-limited single-use tokens delivered by email.

## Requirements

The system must support registration, login, logout, email verification, and password reset flows. The token refresh mechanism must be transparent. Passwords must be hashed with bcrypt. All auth endpoints must be rate-limited (10 req/min per IP). Session invalidation must propagate within 60 seconds.

## Scope

Includes: registration, login, logout, email verification, password reset, JWT issuance and refresh, rate limiting, session invalidation.

Excludes: OAuth/SSO providers, multi-factor authentication, admin impersonation, cross-tenant auth. These are deferred until the base layer is stable.
DESIGN_EOF
git init -q && git add -A && git commit -q -m "initial"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

20

## Assertions

- [tool_called] Bash:node
- [ ] Agent invokes sdd-utils programmatically for INPUT validation (runs a Bash command like `node -e "...parseDesignDoc..."` or `node -e "...validateDesignDoc..."` that uses the sdd-utils module to validate the design doc before formalization)
- [ ] Agent invokes sdd-utils programmatically for OUTPUT validation (runs a Bash command like `node -e "...parseSpecHeader..."` or `node -e "...validateSpecHeader..."` that uses the sdd-utils module to validate the produced spec before writing, or to verify the written spec is correct)
- [ ] Final spec.xml is written to `specs/auth/spec.xml` (per-spec path, NOT the legacy `specs/spec.xml`)

## Grader

mixed

## Grader Config

For the behavioral assertion `[tool_called] Bash:node`: code-graded. The agent must invoke at least one `node` Bash command. This is a loose prerequisite.

For the three text assertions (sdd-utils INPUT validation, sdd-utils OUTPUT validation, correct output path): model-graded.

Inspect the transcript for Bash tool calls. For INPUT validation, look for a `node -e` (or similar) invocation that imports from `scripts/lib/sdd-utils` (or the `./sdd-utils` relative path) and calls `parseDesignDoc` or `validateDesignDoc`. Merely mentioning sdd-utils in text without actually running it does NOT count. The call must be executed, not just described.

For OUTPUT validation, look for a similar `node -e` invocation that calls `parseSpecHeader` or `validateSpecHeader` — either on the spec content built in memory, or on the written spec.xml file. Either is acceptable.

For the output path assertion, verify the final spec.xml was written to `specs/auth/spec.xml` (Write/Edit tool call targeting that path). Writing to `specs/spec.xml` (legacy location without per-spec subdirectory) scores 0 for this assertion.

Score each text assertion 1.0 (pass) or 0.0 (fail). No partial credit — either the behavior was observed or not.

## Trials

3

## Version

1
