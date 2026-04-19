# Eval: arc-refining-dag-completion-gate

## Scope

skill

## Target

skills/arc-refining/SKILL.md — DAG completion gate (D2 / fr-rf-012) per the 2026-04-19 SDD v2 realignment. Refiner MUST block when a prior spec exists and its `dag.yaml` has any epic not in `"completed"` status. The block is terminal-only: no `spec.xml`, no `details/`, no `refiner-report.md`, exit non-zero.

## Scenario

A v1 spec already exists at `specs/auth/spec.xml` and the v1 sprint is **in progress** — its `dag.yaml` has one of two epics still in `"in_progress"` status. A new design doc at `docs/plans/auth/2026-05-10/design.md` describes adding OAuth (intended v2 iteration).

Run the refiner on this design doc. The refiner MUST detect the incomplete prior sprint and block. Expected behavior: print the incomplete epic to terminal, exit non-zero, write nothing to disk. No spec changes, no report file.

This is an evaluation context. Do not paper over the block by manually marking the epic completed or by force-iterating; the gate is the load-bearing behavior under test.

## Context

The realigned pipeline places the DAG completion gate in the refiner (not the planner). The refiner uses `checkDagStatus(dagYamlPath)` from `scripts/lib/sdd-utils.js` to inspect the prior sprint's completion. There is no escape hatch — no `--force` flag, no environment override, no "abandoned" status. The two legitimate paths forward are: (a) complete the remaining epics, or (b) delete `specs/<spec-id>/` and start over.

You have Read, Write, Edit, Bash, Grep, Glob tools.

## Setup

mkdir -p docs/plans/auth/2026-04-01 docs/plans/auth/2026-05-10 specs/auth/details scripts/lib
cp $PROJECT_ROOT/scripts/lib/sdd-utils.js scripts/lib/
cp $PROJECT_ROOT/scripts/lib/yaml-parser.js scripts/lib/
cp $PROJECT_ROOT/scripts/lib/models.js scripts/lib/
cp $PROJECT_ROOT/scripts/lib/dag-schema.js scripts/lib/

cat > docs/plans/auth/2026-04-01/design.md << 'DESIGN_V1'
# Auth System

## Problem

The application has no user identity layer. Every request is anonymous.

## Proposed Solution

Stateless JWT-based authentication. Users register with email and password.

## Requirements

Registration, login, JWT issuance, rate limiting.

## Scope

Includes: registration, login, JWT issuance, rate limiting.
Excludes: OAuth, MFA.
DESIGN_V1

cat > docs/plans/auth/2026-05-10/design.md << 'DESIGN_V2'
# Auth System — Iteration 2026-05-10

## Context (from spec v1)

Spec v1 covers registration, login, and rate-limited JWT issuance. Reference: specs/auth/spec.xml v1.

## Change Intent

Add OAuth 2.0 support for Google. OAuth users bypass email verification. Existing email/password flow unchanged.
DESIGN_V2

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
    <description>Per-user JWT authentication.</description>
    <scope>
      <includes>
        <feature id="registration">Email/password registration</feature>
        <feature id="login">Login with JWT issuance</feature>
        <feature id="rate-limit">Rate limiting on auth endpoints</feature>
      </includes>
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
  <requirement id="fr-auth-001">
    <title>Email Registration</title>
    <description>Users register with email and password.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-001-ac1">Given valid creds when user registers then system MUST create user record. <trace>REQ-F001</trace></criterion>
    </acceptance_criteria>
  </requirement>
  <requirement id="fr-auth-002">
    <title>JWT Login</title>
    <description>Login returns a 15-minute JWT.</description>
    <acceptance_criteria>
      <criterion id="fr-auth-002-ac1">Given valid creds when user logs in then system MUST issue 15-min JWT. <trace>REQ-F002</trace></criterion>
    </acceptance_criteria>
  </requirement>
</detail>
DETAIL_V1

# v1 sprint: epic-registration COMPLETED, epic-login still IN_PROGRESS — gate must block
cat > specs/auth/dag.yaml << 'DAG_V1'
epics:
  - id: epic-registration
    name: Email Registration
    status: completed
    spec_path: specs/auth/epics/epic-registration/epic.md
    worktree: null
    depends_on: []
    features: []
  - id: epic-login
    name: JWT Login
    status: in_progress
    spec_path: specs/auth/epics/epic-login/epic.md
    worktree: null
    depends_on: []
    features: []
blocked: []
DAG_V1

# Capture initial spec.xml content so the assertion can verify it was NOT modified.
cp specs/auth/spec.xml /tmp/spec-v1-initial.xml
cp specs/auth/details/auth-core.xml /tmp/auth-core-v1-initial.xml

git init -q && git add -A && git commit -q -m "fixture: v1 spec + in-progress v1 DAG + v2 design doc"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

15

## Assertions

- [ ] The refiner BLOCKED — terminal output contains the phrase "Complete current sprint" OR mentions the specific incomplete epic id `epic-login`.
- [ ] The file `specs/auth/spec.xml` was NOT modified — its content equals the initial v1 fixture (still `<spec_version>1</spec_version>`, no `<delta>`, no `<supersedes>`). The byte content matches `/tmp/spec-v1-initial.xml`.
- [ ] The file `specs/auth/details/auth-core.xml` was NOT modified — content matches `/tmp/auth-core-v1-initial.xml`.
- [ ] No `refiner-report.md` file exists anywhere in the trial tree (per D6 — block writes no artifact).
- [ ] No new files were created under `specs/auth/` during the run (no `details/auth-oauth.xml`, no `epics/`, etc.). The only legal post-state is the unchanged v1 fixture.
- [ ] The agent did NOT bypass the gate by manually editing `dag.yaml` to mark `epic-login` as `completed`. The dag.yaml at end of run still shows `epic-login: in_progress`.

## Grader

mixed

## Grader Config

The load-bearing assertion is "refiner blocked AND wrote nothing". This eval is intentionally adversarial against:
- Pre-realignment skills that placed the gate in the planner (refiner would happily write v2 spec, planner would block later — too late, inconsistent state).
- Skills that wrote a `refiner-report.md` on block (the deprecated D6 behavior).
- Agents that "helpfully" mark `epic-login` as completed to push past the block (D7 — no escape hatch; the agent must surface the block to the user, not bypass it).

For terminal block message: search the agent transcript / tool output for "Complete current sprint" OR `epic-login` mentioned in a blocking context.

For unmodified spec: byte-compare `specs/auth/spec.xml` to `/tmp/spec-v1-initial.xml`. Any diff is FAIL.

For no refiner-report: walk the trial tree; any `**/refiner-report.md` match is FAIL.

For no new files under specs/: directory listing must contain only the original two files (`specs/auth/spec.xml`, `specs/auth/details/auth-core.xml`) and `specs/auth/dag.yaml`.

For no gate bypass: `specs/auth/dag.yaml` parsed — `epic-login.status` MUST equal `in_progress` at end of run.

Each assertion scores 1.0 or 0.0 — no partial credit.

## Trials

5

## Version

1
