# Spec Identity Header Schema

Defines the format that pipeline skills (arc-refining, arc-planning) produce and consume for `spec.xml` identity headers. Deterministic enforcement is delegated to `sdd-utils.js`.

---

## Overview Element (fr-sd-005)

Every `specs/<spec-id>/spec.xml` MUST contain an `<overview>` element as its first child. The `<overview>` is the identity header — it tells the planner and any downstream consumer what the spec is, where it came from, and what changed.

### Always-Required Fields

All seven fields are required. Missing any field is ERROR.

| Field | Type | Rule |
|---|---|---|
| `spec_id` | string | kebab-case; MUST match the folder name under `specs/` |
| `spec_version` | positive integer | starts at 1, increments for each iteration |
| `status` | enum | MUST be `"active"` |
| `title` | string | human-readable name for the spec |
| `description` | string | strategic purpose — why this spec exists (see Description Field below) |
| `source/design_path` | string | valid file path to the design doc that produced this version |
| `source/design_iteration` | identifier | ISO date prefix (YYYY-MM-DD) + optional `-`-separated suffix; mirrors the design doc folder name (see [Raw Source Identifier Format](#design_iteration--raw-source-identifier-format)) |

### Conditionally-Required Field

| Field | Condition | Format | Rule |
|---|---|---|---|
| `supersedes` | spec_version > 1 | `<spec-id>:v<N>` | MUST be present for v2+; missing is ERROR |

`supersedes` records the identity of the spec version this one replaces. For v1, the field is omitted — its absence signals "first version, no prior spec."

### Scope Element

The `<scope>` element is always required inside `<overview>`.

- `<includes>` — list of `<feature>` elements, each with an `id` attribute and a text description. Always required. Empty `<includes>` is WARNING.
- `<excludes>` — list of `<reason>` elements explaining what is deliberately out of scope. Recommended; not required.

### Description Field — Strategic Purpose

The `<description>` field MUST state **why this spec exists** — the strategic
motivation, not a scope summary. It answers: "What problem does this spec solve,
and why does it need to be formalized?"

Good:
- "Convert the one-shot brainstorming-refiner-planner pipeline into an iterable
  workflow so design docs become immutable raw sources and specs become live
  contracts."
- "Provide per-user authentication to replace the shared-password model that
  prevents audit trails and per-user access control."

Bad:
- "This spec covers registration, login, logout." (scope summary — not purpose)
- "JWT authentication system." (too terse — no reason why)

Rule of thumb: if the description can be replaced by reading `scope/includes`,
it is not a purpose — rewrite it.

### `design_iteration` — Raw Source Identifier Format

`design_iteration` is a mirror of the design doc folder name. It is a
**human-chosen identifier for a raw source artifact**, not a pure date.

**Format contract** (validated):
- MUST start with an ISO date in YYYY-MM-DD form
- MAY include an optional suffix, separated from the date by a single `-`
- Suffix content is unconstrained — humans choose what is meaningful

**Examples of valid identifiers:**

| Identifier | Meaning |
|---|---|
| `2026-04-16` | First (or only) iteration on that date |
| `2026-04-16-v2` | Second same-date iteration, numeric disambiguator |
| `2026-04-16-rework` | Same-date iteration, descriptive disambiguator |
| `2026-04-16-oauth-pivot` | Intent-tagged iteration |

**Examples of invalid identifiers (ERROR):**

| Identifier | Reason |
|---|---|
| `april-16` | No ISO date prefix |
| `2026-04-116` | Malformed date |
| `v2-2026-04-16` | Date not at start (breaks lexicographic ordering) |
| `2026-04-16v2` | Missing `-` between date and suffix |

**Why this shape:**
Raw sources are human-authored artifacts (Karpathy three-layer model, R1 —
immutable). The human chooses the identifier. Schema validates only what
it needs for ordering and provenance (the date prefix); suffix semantics
are a human convention outside schema scope.

**Ordering note:** Lexicographic comparison of identifiers correctly
orders across different dates (`2026-04-16-*` < `2026-04-17-*`). Within
the same date, ordering is best-effort (`2026-04-16-v2` < `2026-04-16-v3`
happens to work; `2026-04-16-rework` vs `2026-04-16-v2` depends on
character codes). Treat same-date ordering as advisory, not authoritative.

---

## Detail File Structure (fr-sd-006)

`spec.xml` references detail files via `<detail_file>` elements inside a `<details>` block. Each detail file is a separate XML document containing `<requirement>` elements.

### Referencing Detail Files

```xml
<details>
  <detail_file path="details/authentication.xml" />
  <detail_file path="details/session.xml" />
</details>
```

Each path is relative to the spec directory (`specs/<spec-id>/`).

### Requirement Element Structure

Every `<requirement>` in a detail file requires:

| Element / Attribute | Rule |
|---|---|
| `id` attribute | Unique across all detail files; format `fr-<domain>-NNN` (e.g., `fr-bs-001`) |
| `<title>` | Short name for the requirement |
| `<description>` | What the system must do |
| `<acceptance_criteria>` | Container for at least one `<criterion>` |
| `<criterion id="...">` | Each criterion MUST have a unique `id` attribute |
| `<trace>` inside criterion | References the source requirement (e.g., `REQ-F010`); MUST be present |

### Criterion Text — BDD Pattern

Criterion text MUST follow a Given/When/Then pattern expressed in natural language:

- **Given** a precondition or state
- **when** an actor performs an action
- **then** the system MUST / SHOULD / MAY produce an expected outcome

Example:

```xml
<criterion id="fr-bs-001-ac1">
    Given a specs/ directory containing auth/spec.xml and payments/spec.xml,
    when brainstorming starts elicitation,
    then the system MUST present both spec_ids to the user before proceeding.
    <trace>REQ-F001</trace>
</criterion>
```

Free-form prose is acceptable as long as the Given/When/Then structure is
identifiable. No sub-elements are required — this is a writing convention,
not a schema rule.

---

## Requirement Language (RFC 2119)

Requirement descriptions and criterion text MUST use RFC 2119 keywords to
express normativity. Non-normative language ("should usually", "maybe",
"could potentially") is ERROR — use the keyword that matches actual intent.

| Keyword | Meaning |
|---|---|
| MUST / SHALL | Absolute requirement |
| MUST NOT / SHALL NOT | Absolute prohibition |
| SHOULD / RECOMMENDED | Strong recommendation; exceptions require documented justification |
| SHOULD NOT / NOT RECOMMENDED | Strong discouragement |
| MAY / OPTIONAL | Truly optional |

Good:
- "The system MUST reject requests without a valid JWT."
- "The cache SHOULD expire stale entries within 30 seconds."

Bad:
- "The system should probably handle invalid tokens." (vague — use MUST or MAY)
- "Sessions usually expire after 15 minutes." (non-normative — use MUST)

---

## Delta Element (fr-sd-005, iteration specs)

When the refiner updates an existing spec (spec_version > 1), it writes a `<delta>` element as the **last child of `<overview>`**. The delta records what changed in this version.

Placement is deliberate: `<delta>` is identity metadata, not separate content. It is tightly coupled to `<spec_version>`, `<supersedes>`, and `<source/design_iteration>` — all of which live in `<overview>`. `delta.version` MUST match `spec_version`; `delta.iteration` MUST match `source/design_iteration`.

```xml
<delta version="N" iteration="YYYY-MM-DD">
  <added ref="req-id" />
  <modified ref="req-id" />
  <removed ref="req-id">
    <reason>Why this requirement was removed</reason>
    <migration>How existing consumers transition (optional)</migration>
  </removed>
  <renamed ref_old="old-id" ref_new="new-id">
    <reason>Why the rename (optional for clean renames)</reason>
  </renamed>
</delta>
```

| Attribute / Element | Rule |
|---|---|
| `version` | MUST match the new `spec_version` |
| `iteration` | MUST match the new `source/design_iteration` |
| `<added ref="...">` | ref MUST correspond to a real requirement id in a detail file |
| `<modified ref="...">` | ref MUST correspond to a real requirement id |
| `<removed ref="...">` | ref MUST correspond to a requirement id that existed in the prior version; MUST contain a `<reason>` child element |
| `<removed>/<reason>` | MUST be present; explains why the requirement was removed |
| `<removed>/<migration>` | Optional; explains how existing consumers transition. Omit when no migration path exists |
| `<renamed ref_old="..." ref_new="...">` | `ref_old` MUST correspond to a requirement id in the previous version; `ref_new` MUST correspond to a requirement id in the current detail files |
| `<renamed>/<reason>` | Optional; clean renames need no justification |

For v1 specs: no `<delta>` element. Its absence signals "plan all requirements."

The planner reads the latest `<delta>` to scope its sprint — only requirements listed in the delta are planned. For v1, the planner plans all requirements (no delta = full scope).

Renamed requirements are NOT planned as new work — the planner treats them as existing requirements with updated identifiers.

For backward compatibility, `sdd-utils.js` accepts two legacy `<removed>` formats:
- Self-closing `<removed ref="x" />` — parsed with empty reason (validator flags this as ERROR)
- Text content `<removed ref="x">Free text</removed>` — text treated as the reason

---

## Valid Examples (fr-sd-007)

### Valid v1 — auth-system initial spec

```xml
<?xml version="1.0" encoding="UTF-8"?>
<spec>
  <overview>
    <spec_id>auth-system</spec_id>
    <spec_version>1</spec_version>
    <status>active</status>
    <source>
      <design_path>docs/plans/auth-system/2026-04-10/design.md</design_path>
      <design_iteration>2026-04-10</design_iteration>
    </source>
    <title>User Authentication System</title>
    <description>
      JWT-based stateless authentication covering registration, login, logout,
      email verification, and password reset. Provides the identity foundation
      that all downstream features depend on.
    </description>
    <scope>
      <includes>
        <feature id="registration">Email and password registration with bcrypt hashing</feature>
        <feature id="login">JWT issuance with 15-minute access tokens and 30-day refresh cookies</feature>
        <feature id="logout">Session invalidation propagating within 60 seconds</feature>
        <feature id="email-verification">Required before first login; token delivered by email</feature>
        <feature id="password-reset">Time-limited single-use reset tokens delivered by email</feature>
        <feature id="rate-limiting">10 requests per minute per IP on all auth endpoints</feature>
      </includes>
      <excludes>
        <reason>OAuth/SSO providers — deferred until base layer is stable</reason>
        <reason>Multi-factor authentication — not in scope for initial release</reason>
        <reason>Admin impersonation — requires separate access control spec</reason>
      </excludes>
    </scope>
  </overview>

  <details>
    <detail_file path="details/auth-core.xml" />
    <detail_file path="details/auth-flows.xml" />
  </details>
</spec>
```

No `<supersedes>` — this is v1. No `<delta>` — planner plans all requirements.

---

### Valid v2+ — auth-system OAuth iteration

```xml
<?xml version="1.0" encoding="UTF-8"?>
<spec>
  <overview>
    <spec_id>auth-system</spec_id>
    <spec_version>2</spec_version>
    <status>active</status>
    <supersedes>auth-system:v1</supersedes>
    <source>
      <design_path>docs/plans/auth-system/2026-05-10/design.md</design_path>
      <design_iteration>2026-05-10</design_iteration>
    </source>
    <title>User Authentication System</title>
    <description>
      Extends the JWT authentication base (v1) with OAuth 2.0 support for Google
      and GitHub. OAuth users bypass email verification; the existing email/password
      flow is unchanged.
    </description>
    <scope>
      <includes>
        <feature id="registration">Email and password registration with bcrypt hashing</feature>
        <feature id="login">JWT issuance with 15-minute access tokens and 30-day refresh cookies</feature>
        <feature id="logout">Session invalidation propagating within 60 seconds</feature>
        <feature id="email-verification">Required before first login for email/password users</feature>
        <feature id="password-reset">Time-limited single-use reset tokens delivered by email</feature>
        <feature id="rate-limiting">10 requests per minute per IP on all auth endpoints</feature>
        <feature id="oauth-google">Google OAuth 2.0 login flow with standard JWT issuance on callback</feature>
        <feature id="oauth-github">GitHub OAuth 2.0 login flow with standard JWT issuance on callback</feature>
      </includes>
      <excludes>
        <reason>Multi-factor authentication — not in scope for this iteration</reason>
        <reason>Admin impersonation — requires separate access control spec</reason>
        <reason>Additional OAuth providers (Apple, Microsoft) — deferred</reason>
      </excludes>
    </scope>
    <delta version="2" iteration="2026-05-10">
      <added ref="fr-as-007" />
      <added ref="fr-as-008" />
      <modified ref="fr-as-002" />
    </delta>
  </overview>

  <details>
    <detail_file path="details/auth-core.xml" />
    <detail_file path="details/auth-flows.xml" />
    <detail_file path="details/auth-oauth.xml" />
  </details>
</spec>
```

`supersedes` is set to `auth-system:v1`. The `<delta>` tells the planner to plan only `fr-as-007`, `fr-as-008`, and `fr-as-002` — the two new OAuth requirements plus the modified email verification requirement.

---

## Invalid Examples (fr-sd-007)

### Missing spec_version

```xml
<overview>
  <spec_id>auth-system</spec_id>
  <!-- spec_version omitted -->
  <status>active</status>
  <source>
    <design_path>docs/plans/auth-system/2026-04-10/design.md</design_path>
    <design_iteration>2026-04-10</design_iteration>
  </source>
  <title>User Authentication System</title>
  <description>JWT-based authentication system.</description>
  <scope>
    <includes>
      <feature id="login">JWT login flow</feature>
    </includes>
  </scope>
</overview>
```

**Error:** `spec_id: auth-system — missing required field: spec_version`

---

### Broken design_path

```xml
<overview>
  <spec_id>auth-system</spec_id>
  <spec_version>1</spec_version>
  <status>active</status>
  <source>
    <design_path>docs/plans/auth-system/2026-03-01/design.md</design_path>
    <design_iteration>2026-03-01</design_iteration>
  </source>
  <title>User Authentication System</title>
  <description>JWT-based authentication system.</description>
  <scope>
    <includes>
      <feature id="login">JWT login flow</feature>
    </includes>
  </scope>
</overview>
```

**Error:** `spec_id: auth-system — design_path does not exist: docs/plans/auth-system/2026-03-01/design.md`

The path must point to a file that exists on disk. The check is deterministic.

---

### Missing supersedes for v2+

```xml
<overview>
  <spec_id>auth-system</spec_id>
  <spec_version>2</spec_version>
  <status>active</status>
  <!-- supersedes omitted — ERROR for spec_version > 1 -->
  <source>
    <design_path>docs/plans/auth-system/2026-05-10/design.md</design_path>
    <design_iteration>2026-05-10</design_iteration>
  </source>
  <title>User Authentication System</title>
  <description>Extends v1 with OAuth support.</description>
  <scope>
    <includes>
      <feature id="oauth-google">Google OAuth 2.0 login</feature>
    </includes>
  </scope>
</overview>
```

**Error:** `spec_id: auth-system — spec_version 2 requires supersedes field`

---

### Empty scope includes

```xml
<overview>
  <spec_id>auth-system</spec_id>
  <spec_version>1</spec_version>
  <status>active</status>
  <source>
    <design_path>docs/plans/auth-system/2026-04-10/design.md</design_path>
    <design_iteration>2026-04-10</design_iteration>
  </source>
  <title>User Authentication System</title>
  <description>JWT-based authentication system.</description>
  <scope>
    <includes />
  </scope>
</overview>
```

**Warning:** `spec_id: auth-system — scope/includes is empty; the planner will have no requirements to plan`

This is a WARNING, not an ERROR. The spec is structurally valid and the pipeline continues, but an empty scope likely indicates an incomplete spec.

---

## Validation Summary (fr-sd-005, fr-sd-006, fr-sd-007)

| Check | Type | Severity |
|---|---|---|
| `spec_id` present | Deterministic | ERROR |
| `spec_id` is kebab-case and matches folder name | Deterministic | ERROR |
| `spec_version` present | Deterministic | ERROR |
| `spec_version` is a positive integer | Deterministic | ERROR |
| `status` present and equals `"active"` | Deterministic | ERROR |
| `title` present and non-empty | Deterministic | ERROR |
| `description` present and non-empty | Deterministic | ERROR |
| `source/design_path` present | Deterministic | ERROR |
| `source/design_path` points to an existing file | Deterministic | ERROR |
| `source/design_iteration` present | Deterministic | ERROR |
| `source/design_iteration` starts with YYYY-MM-DD (optional suffix allowed) | Deterministic | ERROR |
| `supersedes` present when spec_version > 1 | Deterministic | ERROR |
| `supersedes` matches `<spec-id>:v<N>` format | Deterministic | ERROR |
| `scope/includes` present | Deterministic | ERROR |
| `scope/includes` contains at least one `<feature>` | Deterministic | WARNING |
| `delta/version` matches `spec_version` (when delta present) | Deterministic | ERROR |
| `delta/iteration` matches `design_iteration` (when delta present) | Deterministic | ERROR |
| All `<detail_file>` paths resolve to existing files | Deterministic | ERROR |
| Each `<requirement>` has unique `id` across all detail files | Deterministic | ERROR |
| Each `<criterion>` has `id` attribute | Deterministic | ERROR |
| Each `<criterion>` contains a `<trace>` element | Deterministic | ERROR |

**Severity meanings:**
- ERROR — blocks the pipeline stage; no output produced until resolved
- WARNING — continues but alerts the user; may indicate incomplete or stub spec
