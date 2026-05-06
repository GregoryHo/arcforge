# Completion + Blocked Output Formats

Templates for the final user-facing message of every mode. Print these
verbatim with substitutions filled in. The shapes are stable so users
can scan many sessions quickly.

## Completion

### Ingest

```
✅ Created [type] note → [path]
   Propagated: updated N existing pages
```

### Query

```
✅ Query answered — cited N notes
```

### Audit

```
✅ Audit complete → [audit-report-path]
- LINK: resolved N relationships
- LINT: found N issues (M Source Drift)
- GROW: N suggestions (P internal, Q external)
```

### Bare invoke (orient response)

```
Operating on: [vault name]
Scope: [one-line]
Types: [list]
Last activity: [latest log entry]
Available: ingest, query, audit. What would you like to do?
```

### init-vault

```
✅ Bootstrapped [vault name] (preset: [preset])
   Registered at: [path]
   QMD collection: [collection name] (or "not configured")
   Next: ingest a source, run query, or check capabilities via bare invoke.
```

## Blocked

```
⚠️ [Mode] blocked
Issue: [what went wrong]
To resolve: [specific action needed]
```

Use Blocked when Domain Contract Orientation can't proceed (missing
AGENTS.md / SCHEMA.md), when search routes all fail, when a vault path
no longer exists, or when LINT/GROW would mutate state without consent.
