# Design Doc Schema

Defines the format that pipeline skills (arc-brainstorming, arc-refining) produce and consume for design docs. Deterministic enforcement is delegated to `sdd-utils.js`.

---

## Location and Metadata (fr-sd-001)

Design docs live at:

```
docs/plans/<spec-id>/<YYYY-MM-DD>/design.md
```

- `spec-id` — kebab-case identifier derived from the directory name
- iteration date — derived from the `<YYYY-MM-DD>` directory name

**Mode detection rule:** check the filesystem, not the design doc.

| Filesystem State | Mode |
|---|---|
| `specs/<spec-id>/spec.xml` exists | Iteration (Path B) |
| `specs/<spec-id>/spec.xml` does not exist | Initial (Path A) |

Mode is determined at runtime from filesystem state. The design doc does not declare its mode.

---

## Path A — Initial Design Doc (fr-sd-002)

Used when no existing spec exists for this `spec-id`.

### Minimum Content

No fixed section headings are required. The refiner extracts requirements from prose. The doc MUST contain all four elements:

1. **Problem description / motivation** — what problem this solves and why it matters
2. **Proposed solution / architecture** — how the problem is solved, key design decisions
3. **Identifiable requirements** — things the system must do, discoverable in prose (not stubs)
4. **Scope declaration** — what is included and what is explicitly excluded

### Valid Example

```markdown
# User Authentication System

## Problem

The application currently has no user identity layer. Every request is anonymous,
making it impossible to personalize content, audit actions, or enforce access control.
We need a foundation that all other features can build on.

## Proposed Solution

Implement a stateless JWT-based authentication system. Users register with email and
password; successful login returns a short-lived access token (15 min) and a
long-lived refresh token (30 days, stored as httpOnly cookie). Token refresh is
automatic and transparent to the user.

Password storage uses bcrypt (cost factor 12). Email verification is required before
first login. Password reset flow uses time-limited single-use tokens delivered by email.

## Requirements

The system must support registration, login, logout, email verification, and password
reset flows. The token refresh mechanism must be transparent. Passwords must be hashed
with bcrypt. All auth endpoints must be rate-limited (10 req/min per IP). Session
invalidation must propagate within 60 seconds.

## Scope

Includes: registration, login, logout, email verification, password reset, JWT
issuance and refresh, rate limiting, session invalidation.

Excludes: OAuth/SSO providers, multi-factor authentication, admin impersonation,
cross-tenant auth. These are deferred until the base layer is stable.
```

### Invalid Example

```markdown
# Auth System

TODO: fill in later
```

**Error:** `design doc has no substantive content`

---

## Path B — Iteration Design Doc / Gamma Mode (fr-sd-003)

Used when `specs/<spec-id>/spec.xml` exists. The refiner reads this doc alongside the existing spec to determine what changed — the doc describes intent, the refiner does the diff.

### Required Sections

Both sections are required. Missing either is ERROR.

**Context** — current spec state summary (2-3 sentences), with a reference to the spec version.

**Change Intent** — what is changing and why. This is the primary input for the refiner.

### Recommended Section

**Architecture Impact** — how the changes interact with existing design. Optional for simple changes; recommended for cross-cutting changes.

### Valid Example

```markdown
# auth-system — Iteration 2026-05-10

## Context (from spec v1)

Spec v1 covers registration, login, logout, email verification, password reset, and
JWT issuance with 15-minute access tokens and 30-day refresh tokens. All auth state
is stateless; tokens are validated on every request.

Reference: specs/auth-system/spec.xml v1

## Change Intent

Add OAuth 2.0 support for Google and GitHub as login providers. Users who authenticate
via OAuth bypass the email verification requirement. The existing email/password flow
is unchanged — OAuth is additive, not a replacement.

Motivation: a significant portion of prospective users drop off at the registration
form. OAuth reduces friction without removing the existing path.

## Architecture Impact

OAuth login shares the token issuance layer with email/password login: on successful
OAuth callback, the system issues a standard JWT pair and sets the refresh cookie.
The downstream auth validation logic (middleware, session invalidation) is unaffected.

New: OAuth provider configuration (client ID, secret, redirect URIs) added to
environment config. New callback endpoints per provider. Rate limiting rules apply
to callback endpoints at a higher threshold (providers may retry).
```

### Invalid Examples

**Missing Context section:**

```markdown
# auth-system — Iteration 2026-05-10

## Change Intent

Add OAuth 2.0 support for Google and GitHub.
```

**Error:** `iteration design doc missing required Context section`

---

**Missing Change Intent section:**

```markdown
# auth-system — Iteration 2026-05-10

## Context (from spec v1)

Spec v1 covers registration, login, logout, email verification, and JWT auth.

Reference: specs/auth-system/spec.xml v1
```

**Error:** `iteration design doc missing required Change Intent section`

---

## Validation Summary (fr-sd-004)

| Check | Type | Severity | Path A | Path B |
|---|---|---|---|---|
| File exists at canonical path | Deterministic | ERROR | yes | yes |
| Substantive content (not empty or stub) | Deterministic | ERROR | yes | yes |
| `Context` heading present | Deterministic | ERROR | — | yes |
| `Change Intent` heading present | Deterministic | ERROR | — | yes |
| Iteration date newer than spec's `design_iteration` | Deterministic | WARNING | — | yes |
| Requirements identifiable in prose | LLM judgment | ERROR | yes | — |
| Scope declared (includes/excludes) | LLM judgment | ERROR | yes | — |

**Severity meanings:**
- ERROR — blocks the pipeline stage; no output produced until resolved
- WARNING — continues but alerts the user; may indicate stale input

**Stale date check:** WARNING fires when the design doc's date directory (`YYYY-MM-DD`) is less than or equal to the `design_iteration` recorded in `specs/<spec-id>/spec.xml`. This detects accidentally re-run or duplicated iterations.
