# Layer 2 — Sanitization + Derived Semantic View

**Parent index**: [`../../2026-05-09-learning-curator-schema-contracts.md`](../../2026-05-09-learning-curator-schema-contracts.md)

## Responsibility

Layer 2 transforms Layer 1's in-memory observation skeleton plus transient hook payload fields into safe evidence fields and derived views.

Layer 2 does not collect events. It owns the privacy and persistence policy for tool-payload-derived evidence:

```text
Which payload fields are safe to persist?
Which fields must be redacted?
Which fields must be omitted?
Which semantic labels can be derived from safe evidence?
```

Layer 2 is deterministic. It does not judge whether behavior is useful, does not call an LLM, does not produce candidates, and does not affect Claude runtime behavior.

## Responsible actor

```text
Observation Collector
→ Evidence Sanitizer
→ composed observation record
```

Conceptual component names:

```text
Evidence Sanitizer
Semantic View Deriver
```

Conceptual functions:

```text
sanitizeEvidence()
deriveSemanticView()
```

Layer 2 may be implemented in shared code so the hook path, curator batch assembly, and dashboard backend use the same sanitizer and derivation contract.

## Inputs

Layer 2 receives two inputs in memory.

### 1. Layer 1 observation skeleton

```ts
type ObservationSkeleton = {
  schema_version: 1;
  ts: string;
  event: "tool_start" | "tool_end";
  session: string;
  project: string;
  project_id: string;
  tool: string;
  source: {
    collector: "hooks/observe/main.js";
    phase: "pre" | "post";
  };
};
```

### 2. Transient hook payload subset

For PreToolUse, Layer 2 may inspect the relevant allowlisted subset of `tool_input` to decide whether safe evidence can be produced.

Example Bash input:

```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test"
  }
}
```

Example Edit input:

```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "src/foo.js",
    "old_string": "...",
    "new_string": "..."
  }
}
```

The transient hook payload must never be persisted wholesale.

## Primary output A — Safe evidence patch

Layer 2 produces a safe evidence patch. This patch is composed with the Layer 1 observation skeleton before appending to `observations.jsonl`.

```ts
type EvidenceStatus =
  | "present"
  | "omitted_no_input"
  | "omitted_unsupported_tool"
  | "omitted_safety";

type SafeEvidencePatch = {
  evidence_status: EvidenceStatus;

  // Sanitized, bounded, tool-specific evidence fields.
  input?: string;
  path?: string;
  pattern?: string;
  glob?: string;
  url?: string;
  domain?: string;
  operation_kind?:
    | "shell"
    | "read"
    | "write"
    | "edit"
    | "search"
    | "glob"
    | "skill"
    | "network"
    | "other";
  skill?: string;
};
```

`evidence_status` meanings:

| Status | Meaning |
|---|---|
| `present` | Safe evidence fields were added. |
| `omitted_no_input` | No input existed or input was irrelevant to this event. |
| `omitted_unsupported_tool` | Tool class is not yet supported by the allowlist. |
| `omitted_safety` | Payload existed, but Layer 2 refused to persist any of it for safety reasons. |

## Composed persisted observation record

Layer 2 does not write a separate default-production-path file. The default production durable record is composed as:

```text
Layer 1 observation skeleton
+ Layer 2 safe evidence patch
```

and appended to:

```text
~/.arcforge/observations/<project>/observations.jsonl
```

There is no raw observation file and no separate sanitized observation file in the default production path.

Forbidden default-production-path stores:

- `raw-observations.jsonl`
- `collector.jsonl`
- `sanitized-observations.jsonl`
- `semantic.jsonl`
- `layer2.jsonl`

No durable observation append may happen before the Layer 2 safety decision.

## Examples

### Bash safe evidence

Layer 1 skeleton:

```json
{
  "schema_version": 1,
  "ts": "2026-05-09T03:30:00.000Z",
  "event": "tool_start",
  "session": "abc123",
  "project": "arcforge",
  "project_id": "a1b2c3d4e5f6a7b8",
  "tool": "Bash",
  "source": {
    "collector": "hooks/observe/main.js",
    "phase": "pre"
  }
}
```

Layer 2 safe evidence patch:

```json
{
  "evidence_status": "present",
  "input": "npm test",
  "operation_kind": "shell"
}
```

Composed persisted observation:

```json
{
  "schema_version": 1,
  "ts": "2026-05-09T03:30:00.000Z",
  "event": "tool_start",
  "session": "abc123",
  "project": "arcforge",
  "project_id": "a1b2c3d4e5f6a7b8",
  "tool": "Bash",
  "evidence_status": "present",
  "input": "npm test",
  "operation_kind": "shell",
  "source": {
    "collector": "hooks/observe/main.js",
    "phase": "pre"
  }
}
```

### Bash with secret-like content

Transient input:

```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "curl -H 'Authorization: Bearer abc123' https://api.example.com"
  }
}
```

Layer 2 safe evidence patch:

```json
{
  "evidence_status": "present",
  "input": "curl -H 'Authorization: Bearer ***' https://api.example.com",
  "operation_kind": "shell"
}
```

Raw secret-like values must never be persisted as fallback.

### Edit safe evidence

Transient input:

```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "src/foo.js",
    "old_string": "full old code...",
    "new_string": "full new code..."
  }
}
```

Layer 2 safe evidence patch:

```json
{
  "evidence_status": "present",
  "path": "src/foo.js",
  "operation_kind": "edit"
}
```

The following are not persisted:

- `old_string`
- `new_string`
- full patch body
- file contents

### Skill safe evidence

Transient input:

```json
{
  "tool_name": "Skill",
  "tool_input": {
    "skill": "test-driven-development",
    "args": {
      "some": "payload"
    }
  }
}
```

Layer 2 safe evidence patch:

```json
{
  "evidence_status": "present",
  "skill": "test-driven-development",
  "operation_kind": "skill"
}
```

Skill args payload is not persisted.

### Unsupported tool

If the tool is not supported by the allowlist, Layer 2 may preserve the event skeleton and mark evidence as omitted:

```json
{
  "schema_version": 1,
  "ts": "2026-05-09T03:30:00.000Z",
  "event": "tool_start",
  "session": "abc123",
  "project": "arcforge",
  "project_id": "a1b2c3d4e5f6a7b8",
  "tool": "UnknownTool",
  "evidence_status": "omitted_unsupported_tool",
  "source": {
    "collector": "hooks/observe/main.js",
    "phase": "pre"
  }
}
```

This preserves workflow sequence without persisting unsupported payload content.

## Per-tool persistence contract

| Tool class | Persisted evidence | Explicitly not persisted |
|---|---|---|
| `Bash` | sanitized command, operation kind | environment dumps, unredacted secrets |
| `Read` | sanitized target path, operation kind | file contents |
| `Grep` | sanitized pattern/path/glob, operation kind | matched file contents |
| `Glob` | sanitized glob/path, operation kind | file contents |
| `Edit` | sanitized target path, operation kind | `old_string`, `new_string`, full patch body |
| `Write` | sanitized target path, operation kind | file content |
| `NotebookEdit` | sanitized target path/cell reference if safe, operation kind | cell contents |
| `Skill` | skill name only, operation kind | skill args payload |
| Web/network-like tools | sanitized URL/domain, operation kind | cookies, auth headers, request body, response body |
| `PostToolUse` | outcome, output byte count | raw response body |

## Layer 2 output B — Derived semantic view

Layer 2 also defines a derived semantic view for consumers that need coarse labels. This view is computed from safe evidence, not from raw hook payload.

Derived semantic view is not primary persisted observation data. It is a read-time or runtime view used by later deterministic components.

```ts
type DerivedSemanticView = {
  tool: string;

  operation?:
    | "shell"
    | "read"
    | "write"
    | "edit"
    | "search"
    | "glob"
    | "skill"
    | "network"
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

Examples:

```json
{
  "tool": "Bash",
  "operation": "shell",
  "command_kind": "test"
}
```

```json
{
  "tool": "Read",
  "operation": "read",
  "path_class": "docs",
  "file_kind": "md"
}
```

## Observation consumer contract

`observations.jsonl` is a deterministic backend evidence store. It is not an LLM prompt, not a dashboard browser payload, and not runtime context.

Downstream consumers may stream `observations.jsonl`, but each consumer must use an explicit allowlisted view. Reading or streaming the file for deterministic processing does not authorize passing the whole record set or all fields to another boundary.

### Layer 3 — Curator Evidence View

Layer 3 may read composed observations and produce a bounded curator batch. It should use only fields needed for evidence selection, grouping, and summarization.

```ts
type CuratorEvidenceView = {
  ts: string;
  event: "tool_start" | "tool_end";
  session: string;
  project: string;
  tool: string;

  evidence_status: EvidenceStatus;

  operation_kind?: string;
  input_summary?: string;
  path_summary?: string;
  skill?: string;

  outcome?: "success" | "error" | "unknown";
  output_bytes?: number;

  derived?: DerivedSemanticView;
};
```

Layer 3 must not pass `observations.jsonl` wholesale to the LLM curator. It must produce a bounded batch first.

### Layer 4 — LLM Curator Analysis

Layer 4 does not directly read `observations.jsonl`. It receives the bounded curator batch produced by Layer 3.

```text
observations.jsonl
→ Layer 3 bounded curator batch
→ Layer 4 LLM curator
```

### Layer 6 — Dashboard Evidence View

Layer 6 backend may read selected observation records to produce dashboard-safe evidence summaries. The browser must receive an allowlisted dashboard view, not raw observation records and not the entire JSONL file.

```ts
type DashboardEvidenceView = {
  ts: string;
  event: "tool_start" | "tool_end";
  tool: string;
  operation_kind?: string;
  evidence_status: EvidenceStatus;

  outcome?: "success" | "error" | "unknown";

  derived?: {
    command_kind?: string;
    path_class?: string;
    file_kind?: string;
  };

  display_summary: string;
};
```

Dashboard browser payloads should prefer summaries, chips, counts, and references over full safe-evidence text.

## Layer-by-layer observation usage

| Layer | Reads `observations.jsonl`? | Usage |
|---|---:|---|
| 1 | No | Produces in-memory observation skeleton. |
| 2 | No | Processes transient payload and writes composed safe record. Does not read raw observations from disk. |
| 3 | Yes | Streams/filter/groups/bounds composed observations into a curator batch. |
| 4 | No direct read | Receives only the Layer 3 bounded curator batch. |
| 5 | Usually no | Stores candidate records with evidence pointers/summaries. |
| 6 | Backend may read selected records | Produces dashboard-safe evidence views. Browser does not receive whole observations. |
| 7 | No direct dependency | Materializes reviewed candidate drafts. |
| 8 | No | Runtime influence surface does not read observations. |

## Fail-closed rule

Layer 2 must fail closed:

```text
If a field cannot be proven safe, Layer 2 must not persist that field.
```

Allowed outcomes:

1. Persist redacted/sanitized field.
2. Drop unsafe subfield.
3. Persist skeleton-only record with `evidence_status = "omitted_safety"`.
4. Skip append entirely only if even the skeleton context is considered unsafe.

Raw payload fallback is forbidden.

## Quarantine relationship

Layer 2 distinguishes live unsafe payload handling from legacy/incompatible data quarantine.

### Live current event with unsafe payload

For a current hook event, Layer 2 should redact or omit unsafe fields and append a composed observation record with an appropriate `evidence_status` in the default production path.

This is not automatically quarantine.

### Legacy 3.0 / incompatible historical data

Legacy 3.0 observation backlogs, statistical candidate queues, or incompatible historical payloads should be moved outside default production reader globs and excluded from Layer 3 / Layer 4 default production processing.

```text
legacy / incompatible data
→ quarantine path
→ not read by default production curator pipeline
```

## Forbidden behavior in Layer 2

Layer 2 must not:

- collect new events;
- create a standalone default-production-path evidence store;
- persist raw hook envelopes;
- persist full `tool_input`;
- persist full `tool_response`;
- persist file contents;
- persist `Edit` / `Write` content bodies;
- call an LLM;
- rank evidence quality;
- infer durable habits;
- generate candidates;
- write candidate queue records;
- write dashboard lifecycle state;
- materialize artifacts;
- activate runtime behavior;
- inject observations into Claude context.

## Flow diagram mapping

Layer 2 maps to the current flow diagram's Privacy Boundary `Sanitizer` node and its outgoing edges:

```text
Collector
  → Sanitizer
  → Observations
```

and, for incompatible historical data:

```text
Sanitizer
  → Quarantine
```

Recommended diagram correction after Layer 1 and Layer 2 are locked:

```text
Collector
  Layer 1: event skeleton

Sanitizer
  Layer 2: allowlist + redact + derive view

Observations
  Layer 1 skeleton + Layer 2 safe evidence
```

The current diagram text `Collector — normalize + classify` should be revised because classification belongs to Layer 2's derived semantic view, not Layer 1 collection.

## Acceptance criteria for Layer 2 contract

1. Layer 2 does not collect events and does not read a raw observation file from disk.
2. There is no default-production-path raw observation file.
3. Layer 2 produces safe evidence patches from transient hook payloads.
4. `observations.jsonl` stores only composed safe records.
5. Derived semantic view is read-time/runtime view, not primary persisted observation data.
6. Every downstream consumer uses an explicit allowlisted view.
7. Layer 4 never receives `observations.jsonl` wholesale.
8. Dashboard browser payloads never receive `observations.jsonl` wholesale.
9. Unsafe fields fail closed by redaction, omission, skeleton-only record, or skip; never raw fallback.
10. Per-tool allowlist rules cover Bash, Read, Grep, Glob, Edit, Write, NotebookEdit, Skill, web/network-like tools, and PostToolUse.

---
