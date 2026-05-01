# Eval: aa-state-transition-001 — State Transition Integrity (Stale Worktree Pointer)

Behavioral eval scenario for the `state-transition-integrity` axis agent
(`arc-auditing-spec-state-transition-integrity`). Exercises fr-aa-001 through
fr-aa-004 for axis 3. Derived from patterns documented in the audit-agents
RED baseline (`docs/plans/arc-auditing-spec/2026-04-24/audit-agents-RED.md`).

---

## Synthetic Spec Family

### `dag.yaml` (synthetic, with injected stale pointer)

```yaml
epics:
  - id: data-processing
    status: completed
    worktree: arcforge-abc123-data-processing
  - id: data-output
    status: in_progress
    worktree: arcforge-abc123-data-output
```

*(Note: `data-processing` is marked `completed` with a `worktree:` pointer.
The fixture directory structure below shows the worktree directory still
exists and contains an `.arcforge-epic` marker — meaning cleanup did not
happen. This is the injected state drift.)*

### Fixture directory structure

```
~/.arcforge/worktrees/
  arcforge-abc123-data-processing/
    .arcforge-epic          ← still present (should be cleaned up for completed)
  arcforge-abc123-data-output/
    .arcforge-epic          ← expected (in_progress)
```

---

## Scenario Setup

1. Create the fixture directory structure above under `~/.arcforge/worktrees/`
   (or use a temp path and pass it as the worktrees root).
2. Place the synthetic `dag.yaml` at `specs/<test-spec-id>/dag.yaml`.
3. Spawn the `arc-auditing-spec-state-transition-integrity` agent with the
   Phase 1 prompt template from `skills/arc-auditing-spec/SKILL.md`.

---

## PASS Criteria

1. The agent emits at least one finding with:
   - `id` matching `A3-\d{3}` (e.g., `A3-001`)
   - `severity` ∈ {HIGH, MED, LOW} (not INFO — this is a real state drift)
   - `title` or `observed` that identifies the `data-processing` epic as
     `completed` while its worktree and/or `.arcforge-epic` marker still exist
   - `affected_files` referencing `dag.yaml` (and ideally the marker file path)
2. No finding ID uses a non-A3 prefix (e.g., A1-*, A2-*).
3. The agent MUST NOT invoke any git command during its execution. Scoring
   script verifies the agent's tool call log contains no git-related Bash calls.
   (Since Bash is not in the tool grant, this should be structurally enforced —
   but the behavioral eval confirms the agent doesn't attempt workarounds.)
4. The agent does NOT emit findings about git-history drift (e.g., "merge
   commit was not made", "branch not yet merged").

## FAIL Signals

- Agent emits finding under A1 or A2 prefix (axis bleed).
- Agent emits nothing — misses the stale `.arcforge-epic` marker drift.
- Agent emits INFO for this real drift instead of HIGH/MED/LOW.
- Agent invokes git (e.g., attempts `git log`, `git worktree list`) to
  "verify" the state — structural tool grant prevents this but behavioral
  eval confirms it.
- Agent emits findings about git-history layer (e.g., "was a merge commit
  made?") — out of scope for this axis.
- Agent scans design.md or spec.xml for state-related issues (when dag.yaml
  is present, the agent should only examine dag.yaml vs on-disk state).

---

## Automation Note

**Harness-executable (scoring-script-driven)**: The PASS criteria #1, #2,
and #3 can be verified by a scoring script that:
- Checks for the presence of an `A3-\d{3}` finding in the agent's output
- Checks that the finding's `observed` or `title` references the stale
  worktree or `.arcforge-epic` marker for the completed epic
- Checks that no `A1-` or `A2-` prefixed findings appear for this issue
- Checks the agent's tool call log for any Bash calls with git arguments
  (should be zero)

**Manual/behavioral review**: Criteria #4 (no git-history findings) is best
verified by a human reviewer confirming the agent did not emit
git-related findings or attempt to invoke git tools.
