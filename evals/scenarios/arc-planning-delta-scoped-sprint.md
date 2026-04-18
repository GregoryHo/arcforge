# Eval: arc-planning-delta-scoped-sprint

## Scope

workflow

## Target
arc-planning sprint model + delta-scoped planning: when the spec has a `<delta>` element and an existing `dag.yaml` with all epics completed, the skill guides the agent to (a) archive the old DAG, (b) rebuild a new DAG containing ONLY epics for the delta's added + modified requirements — not all historical requirements.

## Scenario

The auth spec has been iterated to v2. The v2 spec includes a `<delta>` element listing what changed. The previous sprint's DAG (`specs/auth/dag.yaml`) has all 3 epics marked completed.

Plan the next sprint. Produce the new `specs/auth/dag.yaml` covering the right scope for this iteration. Do NOT write any implementation code; only produce the DAG + associated epic/feature files under `specs/auth/epics/`.

## Context

This is an arcforge SDD v2 project. The planner rebuilds the DAG from scratch each sprint and scopes it based on the spec's `<delta>` metadata. The previous sprint is archived, not discarded — users want to trace what was planned in each iteration.

## Setup

mkdir -p specs/auth/details specs/auth/epics

# v2 spec with delta — added OAuth login, modified rate limiting
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
    <description>JWT-based authentication with OAuth addition.</description>
    <scope>
      <includes>
        <feature id="registration">Email/password registration</feature>
        <feature id="login">Login with JWT issuance (email/password + OAuth)</feature>
        <feature id="rate-limit">Tighter rate limiting on auth endpoints</feature>
        <feature id="oauth">OAuth 2.0 login via Google</feature>
      </includes>
    </scope>
    <delta version="2" iteration="2026-04-01">
      <added ref="fr-auth-004">OAuth login — Google provider</added>
      <modified ref="fr-auth-003">Tighter rate limit — 5 req/min per IP, was 10</modified>
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
  </requirement>
  <requirement id="fr-auth-002">
    <title>JWT Login</title>
    <description>Successful login returns a 15-minute JWT.</description>
  </requirement>
  <requirement id="fr-auth-003">
    <title>Rate Limiting</title>
    <description>Auth endpoints enforce 5 req/min per IP (tightened from 10).</description>
  </requirement>
  <requirement id="fr-auth-004">
    <title>OAuth Login</title>
    <description>Users can log in via Google OAuth; JWT is issued as for email/password.</description>
  </requirement>
</detail>
EOF

# Previous sprint's DAG — all epics completed
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

git init -q && git add -A && git commit -q -m "fixture: v2 spec with delta + completed v1 DAG"

## Plugin Dir

${PROJECT_ROOT}

## Max Turns

15

## Assertions

- [tool_called] Bash:dag.yaml.archive
- [ ] A file matching `specs/auth/dag.yaml.archive.*` exists after the run (the previous DAG was archived, not overwritten).
- [ ] The new `specs/auth/dag.yaml` contains an epic corresponding to `fr-auth-004` (OAuth — the ADDED requirement).
- [ ] The new `specs/auth/dag.yaml` contains an epic corresponding to `fr-auth-003` (rate-limit — the MODIFIED requirement).
- [ ] The new `specs/auth/dag.yaml` does NOT contain epics for `fr-auth-001` or `fr-auth-002` (these were not in the delta and should be excluded from this sprint).

## Grader

mixed

## Grader Config

Behavioral assertion ensures the agent archived the old DAG via a `mv`/`cp`/rename involving `dag.yaml.archive`. Text assertions verify the rebuilt DAG respects the `<delta>` scope: included the added + modified refs, excluded everything else. A baseline agent without arc-planning's sprint model may rebuild the DAG to cover ALL current requirements (ignoring delta), or may overwrite the old DAG without archiving.

## Trials

3

## Version

1
