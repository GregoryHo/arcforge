# Layer 0 — Enablement / Scope Gate

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 0 decides whether a Claude Code session, project, path, and current execution mode are eligible to enter the learning pipeline.

This layer does not collect evidence. It only answers:

```text
Should this event be allowed into learning at all?
```

## Responsible actor

```text
Deterministic scope gate
```

Conceptually, this gate runs before observation collection. It is owned by the learning entrypoint / hook path, but its design responsibility is separate from Layer 1 collection.

## Inputs

Layer 0 receives only the minimal context needed to make an allow/skip decision:

```ts
type ScopeGateInput = {
  project_root?: string;
  cwd?: string;
  hook_phase?: "pre" | "post" | "session_start" | "session_end" | string;
  session_id?: string;

  learning_config: {
    project_enabled?: boolean;
    global_enabled?: boolean;
  };

  environment?: {
    explicit_skip?: boolean;
    observer_self_analysis?: boolean;
  };

  // Canonical env var names that map into the above structured fields.
  // `ARCFORGE_OBSERVE_EXPLICIT_SKIP=1` sets environment.explicit_skip = true.
  // `ARCFORGE_OBSERVE_SELF_ANALYSIS=1` sets environment.observer_self_analysis = true.
  // These two are the only environment-driven scope toggles; reject any other
  // env-driven kill switches as out-of-contract.

  path_context?: {
    is_eval_trial?: boolean;
    is_legacy_quarantine?: boolean;
  };
};
```

Layer 0 must not inspect full tool inputs, file contents, transcript bodies, candidate bodies, or dashboard data.

## Output

Layer 0 outputs a deterministic decision:

```ts
type ScopeDecision = {
  allowed: boolean;
  reason:
    | "project_learning_enabled"
    | "global_learning_enabled"
    | "learning_disabled"
    | "eval_trial_path"
    | "daemon_self_observation"
    | "legacy_quarantine_path"
    | "explicit_skip_env"
    | "unknown";
  scope?: "project" | "global";
};
```

Examples:

```json
{
  "allowed": true,
  "reason": "project_learning_enabled",
  "scope": "project"
}
```

```json
{
  "allowed": false,
  "reason": "eval_trial_path"
}
```

## Persisted artifacts

Layer 0 does not produce learning evidence and persists nothing in the default production path.

If debug logging is later added, it must be explicitly marked diagnostic and must not be consumed as learning evidence by Layer 3 or Layer 4.

## Consumers

The only direct consumer is Layer 1.

```text
Layer 0 allowed=true  → Layer 1 may collect an observation skeleton
Layer 0 allowed=false → Layer 1 is skipped
```

## Forbidden behavior

Layer 0 must not:

- create observations;
- inspect full tool input payloads;
- redact or sanitize content;
- derive semantic labels;
- call an LLM;
- generate candidates;
- write dashboard state;
- materialize or activate artifacts;
- influence Claude runtime behavior.

## Flow diagram mapping

The current flow diagram should treat Layer 0 as the first gate before collection.

Recommended diagram correction:

```text
Claude Runtime
  → Scope Gate
  → Hooks
  → Collector
```

or, if the diagram keeps the Privacy Boundary lane:

```text
Privacy Boundary:
  Scope Gate → Hooks → Collector → Sanitizer
```

Layer 0 is not the sanitizer. It does not process payload content; it only decides whether learning may proceed.

## Open questions

1. Should scope decisions be visible in dashboard diagnostics, or remain invisible unless debug mode is enabled?
2. Should skipped eval / quarantine paths be counted in aggregate health metrics without becoming learning evidence?

---
