# Layer 1 — Observation Collection

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 1 captures Claude Code tool lifecycle facts as an observation event skeleton.

This layer is a deterministic collector. It records the event identity and boundary fields needed to understand that a Claude Code tool lifecycle event happened: timestamp, phase, session, project, project id, tool name, and collector source.

Layer 1 does not own the privacy policy for tool payload persistence. Any tool input/output content that may become durable evidence must pass through Layer 2 before it is appended to the observation store.

This layer does not judge whether a behavior is useful, does not call an LLM, does not produce candidates, and does not change Claude behavior.

## Responsible actor

```text
Claude Code hook event
→ Observation Collector
→ in-memory observation skeleton
```

Current named component:

```text
hooks/observe/main.js
```

Expected hook phases:

```text
PreToolUse  → tool_start observation
PostToolUse → tool_end observation
```

## Inputs

Layer 1 receives Claude Code hook envelopes. The envelope is input-only; it must not be persisted wholesale.

```ts
type ClaudeHookInput = {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;

  tool_name?: string;
  tool?: string;

  // Present on PreToolUse.
  tool_input?: unknown;

  // Present on PostToolUse. `tool_output` is tolerated for older payloads.
  tool_response?: unknown;
  tool_output?: unknown;
};
```

Example PreToolUse input:

```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm run test:scripts -- learning-dashboard"
  }
}
```

Example PostToolUse input:

```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_response": {
    "is_error": false,
    "output": "... large stdout ..."
  }
}
```

## Primary output — observation skeleton

Layer 1 produces an in-memory observation skeleton. This skeleton is not independently persisted.

```ts
type ObservationSkeleton = {
  schema_version: 1;

  ts: string;              // ISO timestamp
  event: "tool_start" | "tool_end";

  session: string;
  project: string;
  project_id: string;

  tool: string;            // Bash | Read | Edit | Write | Grep | Glob | Skill | unknown

  source: {
    collector: "hooks/observe/main.js";
    phase: "pre" | "post";
  };
};
```

Layer 1 may attach structural PostToolUse telemetry (`outcome`, `output_bytes`) because those fields describe the lifecycle event result and do not require storing response bodies.

Tool-input-derived fields, such as sanitized command text, sanitized paths, operation kinds, and Skill names, are Layer 2 safe-evidence fields. They may appear in the final composed observation record only after the Layer 2 contract approves them.

## Storage contract

Layer 1 does not own a standalone persisted store.

The Observation Collector produces an in-memory observation skeleton. That skeleton becomes durable only after Layer 2 has applied the sanitization contract and produced safe evidence fields.

The only default production durable output for Layer 1 + Layer 2 composed observations is:

```text
~/.arcforge/observations/<project>/observations.jsonl
```

Each JSONL line is a complete observation record:

```text
Layer 1 event skeleton
+ Layer 2 sanitized evidence fields
```

There must not be separate default-production-path stores such as:

- `collector.jsonl`
- `raw-observations.jsonl`
- `sanitized-observations.jsonl`

No durable observation append may happen before the Layer 2 safety decision. JSONL append failure must not block the Claude Code tool call.

## Composed persisted `tool_start` record

This is the durable record after Layer 1 has produced the event skeleton and Layer 2 has approved any safe evidence fields.

```ts
type ToolStartObservation = ObservationSkeleton & {
  event: "tool_start";

  // Layer 2 safe-evidence field: sanitized, truncated representation of allowlisted tool input.
  input?: string;

  // Layer 2 safe-evidence field for Skill invocations: only skill name is persisted; args are not persisted.
  skill?: string;
};
```

Example:

```json
{
  "schema_version": 1,
  "ts": "2026-05-09T03:30:00.000Z",
  "event": "tool_start",
  "session": "abc123",
  "project": "arcforge",
  "project_id": "a1b2c3d4e5f6a7b8",
  "tool": "Bash",
  "input": "{\"command\":\"npm run test:scripts -- learning-dashboard\"}",
  "source": {
    "collector": "hooks/observe/main.js",
    "phase": "pre"
  }
}
```

Skill tool example:

```json
{
  "schema_version": 1,
  "ts": "2026-05-09T03:31:00.000Z",
  "event": "tool_start",
  "session": "abc123",
  "project": "arcforge",
  "project_id": "a1b2c3d4e5f6a7b8",
  "tool": "Skill",
  "skill": "test-driven-development",
  "input": "{\"skill\":\"test-driven-development\"}",
  "source": {
    "collector": "hooks/observe/main.js",
    "phase": "pre"
  }
}
```

## Composed persisted `tool_end` record

This is the durable record after Layer 1 has produced the event skeleton. It stores only structural outcome telemetry; it does not persist response bodies.

```ts
type ToolEndObservation = ObservationSkeleton & {
  event: "tool_end";

  outcome: "success" | "error" | "unknown";
  output_bytes: number;
};
```

Example:

```json
{
  "schema_version": 1,
  "ts": "2026-05-09T03:31:20.000Z",
  "event": "tool_end",
  "session": "abc123",
  "project": "arcforge",
  "project_id": "a1b2c3d4e5f6a7b8",
  "tool": "Bash",
  "outcome": "success",
  "output_bytes": 18432,
  "source": {
    "collector": "hooks/observe/main.js",
    "phase": "post"
  }
}
```

## What Layer 1 collects

Layer 1 collects the event skeleton for local agent activity traces:

1. Tool ordering and coarse workflow sequence, for example `Bash → Read → Edit → Bash`.
2. Tool type, for example `Bash`, `Read`, `Edit`, `Write`, `Grep`, `Glob`, `Skill`.
3. Event phase: `tool_start` from PreToolUse or `tool_end` from PostToolUse.
4. Timestamp, session id, project, and project id.
5. Collector source metadata.
6. Structural PostToolUse result: `success | error | unknown` and output byte size.

Layer 1 may pass raw hook payload fields to Layer 2 for safety evaluation, but Layer 1 does not itself decide which tool-input-derived fields are durable evidence.

## What Layer 1 does not collect

Layer 1 must not persist:

- full transcript contents;
- raw response bodies;
- full file contents;
- unsanitized secret-like values;
- candidate lifecycle internals;
- dashboard draft paths;
- evidence reasons intended only for internal curator records.

## Forbidden behavior in Layer 1

Layer 1 must not:

- generate candidates;
- rank candidate quality;
- infer durable habits by itself;
- call an LLM;
- run the retired 3.0 statistical analyzer;
- promote project-local patterns to global scope;
- materialize or activate artifacts;
- inject observations into Claude context.

## Relationship to deterministic semantic analysis

Layer 1 may feed Layer 2 and later deterministic semantic summarizers, but semantic summaries are derived views, not Layer 1 output fields.

The composed persisted record may keep Layer 2-approved sanitized evidence. Components that need coarse buckets should derive them at read time, for example:

```ts
type DerivedSemanticView = {
  tool: string;
  payload_saved: false;

  operation?:
    | "shell"
    | "read"
    | "write"
    | "edit"
    | "search"
    | "glob"
    | "skill"
    | "other";

  command_kind?:
    | "test"
    | "lint"
    | "build"
    | "package"
    | "git"
    | "inspect"
    | "run"
    | "network"
    | "other"
    | "unknown";

  path_class?:
    | "test"
    | "docs"
    | "config"
    | "script"
    | "source"
    | "other"
    | "unknown";

  file_kind?:
    | "js"
    | "ts"
    | "tsx"
    | "py"
    | "md"
    | "json"
    | "yaml"
    | "sh"
    | "txt"
    | "other"
    | "none"
    | "unknown";

  skill_name?: string;
};
```

This derived view supports dashboard hints and curator batch assembly. It is not sufficient to produce learning candidates by itself.

## Flow diagram mapping

Layer 1 maps to the collection edge immediately after the Layer 0 enablement/scope gate:

```text
Layer 0 allow decision
→ Claude Code hook lifecycle event
→ Observation Collector
→ in-memory observation skeleton
→ Layer 2 sanitization + derived semantic view
```

Label:

```text
Layer 1: collect event identity only; no raw durable payload
```

Blocked shortcuts:

```text
Hook Envelope → observations.jsonl        BLOCKED until Layer 2 safety decision
Hook Envelope → Candidate Queue           BLOCKED
Hook Envelope → LLM Curator               BLOCKED
Observation Skeleton → Claude Runtime     BLOCKED
```

## Acceptance criteria for Layer 1 contract

1. Learning disabled means Layer 1 does not produce an observation skeleton.
2. Eval trial directories are never admitted into Layer 1.
3. Daemon self-analysis runs with an observation skip guard, for example `ARCFORGE_SKIP_OBSERVE=1`, to prevent self-loop learning.
4. Layer 1 produces only the event skeleton plus structural PostToolUse telemetry.
5. No durable observation append happens before the Layer 2 safety decision.
6. PreToolUse tool-input-derived fields appear in `observations.jsonl` only as Layer 2-approved safe evidence.
7. PostToolUse writes only structural outcome and `output_bytes`; raw response bodies are never persisted.
8. The retired 3.0 statistical analyzer is not part of Layer 1.
9. Observation write errors never block the Claude Code tool call.
10. Every JSONL line is independently parseable.
11. Tests cover disabled learning, skip paths, no standalone Layer 1 store, no pre-sanitization append, no auto-analyze, Skill arg omission, and PostToolUse response-body omission.

## Known implementation blocker before Layer 1 can be trusted

Current branch contains a syntax error in `hooks/observe/main.js` around the `Authorization: Bearer` redaction replacement string. This must be fixed before implementing or testing Layer 1 behavior.

The broken shape is:

```js
.replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,}]+/gi, 'Authorization: Bearer ***
```

The implementation must repair this as part of the Layer 1 / Layer 2 redaction work.

---
