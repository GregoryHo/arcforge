# The SDD Pipeline & Attended Mode

> How a design document becomes verified, ratified, shipped work — and where
> a human steps in. This guide explains the spec-driven development (SDD)
> pipeline, the difference between **attended** and **unattended** mode, how to
> opt a project into attended mode, and how to ratify a proposed decision from
> the terminal. It also records the trust boundary so you know exactly what the
> engine enforces and what it does not.

CLI invocation in this guide follows the [CLI Invocation
Convention](./cli-invocation.md): always `node "${ARCFORGE_ROOT}/scripts/cli.js"
<cmd>`. See section (d) for how to resolve `ARCFORGE_ROOT` under a plugin
install.

## (a) The pipeline chain

SDD turns a design doc into a contract, then into tasks, then into merged code.
Each stage is a skill that hands off to the next; the artifact each stage
produces is what the next stage reads.

| Stage | Skill | Real engine artifact | Hands off to |
|-------|-------|----------------------|--------------|
| **brainstorm** | `arc-brainstorming` | `docs/plans/<date>/...`, `specs/<spec-id>/decisions.yml` | `arc-refining` |
| **refine** | `arc-refining` | `specs/<spec-id>/spec.xml`, `details/*.xml` | `arc-planning` |
| **tasks** | `arc-planning` | `specs/<spec-id>/dag.yaml`, `specs/<spec-id>/epics/<epic-id>/` | `arc-coordinating` / `arc-implementing` |
| **build** | `arc-coordinating` / `arc-implementing` | git branches, merged code | review |

The **tasks** stage is `arc-planning`. Its real output is the DAG
(`specs/<spec-id>/dag.yaml`) plus the per-epic directories
(`specs/<spec-id>/epics/<epic-id>/`); from there work is handed to
`arc-coordinating` (DAG orchestration across epics) and `arc-implementing`
(a single epic in its worktree). There is **no separate "tasks" skill** — the
pipeline is exactly the four stages above, each backed by a concrete on-disk
artifact. Do not look for a fifth pipeline skill; if a stage has no engine
artifact behind it, it is not a pipeline stage.

## (b) Attended vs unattended mode

`ARCFORGE_MODE` controls one thing: whether the refiner may converge a deferred
or qualitative decision via **draft-then-ratify**, and whether `arcforge ratify`
will mint an authorization.

- **Unattended** (the default — `ARCFORGE_MODE` unset or any value other than
  `attended`): the refiner never invents a concrete MUST for a deferred or
  unbound axis. Its only legal moves are downgrade, leave-unbound, or block.
  `arcforge ratify` refuses to mint. This is the safe default for any session
  where no human is at the terminal.
- **Attended** (`ARCFORGE_MODE=attended`): the refiner may **draft** a
  `status: proposed` decision and instruct the human to ratify it, instead of
  inventing a value. A ratified decision becomes the Iron Law's third
  authorization source. This path assumes a human is present to review and
  confirm.

**The autonomous loop always runs unattended.** The loop (`arcforge loop`,
including DAG mode) spawns headless task sessions, and those sessions never
inherit attended mode. The loop **scrubs `ARCFORGE_MODE` from the spawn
environment** (`scripts/lib/loop-session.js` sets `ARCFORGE_MODE: ''` for every
spawned child), so even if the launching shell had a `.arcforge-attended` marker
or an exported `ARCFORGE_MODE=attended`, the loop-spawned session sees neither.
This is deliberate: an unattended session must not draft a proposed decision and
then stop waiting for a human who is not there. The opt-in marker and the
exported variable described in section (c) apply **only** to interactive
sessions — never to loop-spawned ones.

## (c) Opting a project into attended mode

Attended mode is opt-in per project. Drop an empty marker file at the project
root:

```bash
touch .arcforge-attended
```

On Claude Code, the SessionStart hook (`inject-skills`) checks for this marker
and, when present, appends `export ARCFORGE_MODE=attended` to the session's
environment — alongside the always-present `export ARCFORGE_ROOT=...`. New
interactive sessions in that project then start in attended mode automatically.

The marker is the **only** opt-in mechanism on Claude Code. It is a deliberate,
human-placed file: you are stating "a human will be at the terminal for sessions
in this project." On platforms without a SessionStart hook (Codex, Gemini CLI,
OpenCode), set the variable yourself in the shell you launch the session from
(`export ARCFORGE_MODE=attended`).

Loop-spawned sessions do not consult the marker (see section (b)); the scrub
happens in the spawn environment, downstream of whatever the marker set.

## (d) Ratifying a proposed decision

When the refiner drafts a `status: proposed` decision in attended mode, it stops
and asks you to ratify it. Ratification is an interactive, human-at-the-terminal
operation: `arcforge ratify` walks you value-by-value through the decision's
`authorized_values` and mints `status: accepted` with a `ratified_by` marker
only after you confirm.

### Resolving the CLI under a plugin install

When arcforge is installed as a Claude Code plugin (or cloned for another
platform), there is no `arcforge` binary on your `PATH` — the package is not
published to npm. You invoke the CLI through its absolute path, which you resolve
once:

1. **Inside a Claude Code session**, print the path the plugin exported:

   ```bash
   echo "$ARCFORGE_ROOT"
   ```

   (If `ARCFORGE_ROOT` is empty — e.g. you are in a plain terminal, not a
   plugin session — find the install directory with `claude plugin list --json`
   and read the `installPath` field of the arcforge entry. Plain
   `claude plugin list` prints only name/version/scope/status, not the path.)

2. **In your terminal**, run ratify against the resolved path, in attended mode:

   ```bash
   ARCFORGE_MODE=attended node "<that path>/scripts/cli.js" ratify <spec-id> <D-id>
   ```

   Replace `<that path>` with the value from step 1, and `<spec-id>` / `<D-id>`
   with the decision you are ratifying.

This inline `ARCFORGE_MODE=attended` is valid here because it precedes a
**literal** path, not a `${ARCFORGE_ROOT}` expansion — it is not the forbidden
same-command inline-assignment form (which only fails when it assigns the very
variable it expands; see the [CLI Invocation Convention](./cli-invocation.md)).

### The human-at-the-terminal rule

`ratify` is a human gate, not an automatable step. **The model must never pipe
answers into `arcforge ratify`.** The command reads your confirmation
interactively for a reason: it is the anti-rubber-stamp boundary between "an
agent drafted a value" and "a human authorized it."

The piped branch exists only for tests, and its two behaviors make the design
explicit:

- **Closed stdin** (no terminal) → empty input is read as a silent cancel; no
  decision is minted.
- **Piped `yes`** → punches straight through the value-by-value confirmation,
  defeating the anti-rubber-stamp design.

Piping `yes` (or any scripted answer) into ratify is exactly the rubber-stamp
the gate exists to prevent. Running ratify yourself, at a real terminal,
confirming each value, **is** the human review the north star converges on.

## (e) The autonomous loop and the SDD pipeline

The overnight loop is the unattended half of the pipeline: it runs the build
stage across a DAG of epics without a human present. Proposed decisions are
**not** produced by the loop — an unattended session cannot draft-then-ratify
(section (b)).

The end-to-end shape of an attended-then-unattended package is therefore:

1. **Attended (pre-loop) session.** A human refines the spec in attended mode.
   Where the design defers a decision, the refiner drafts a `status: proposed`
   entry in `decisions.yml`. These proposed entries are created here, by the
   attended session — before the loop ever starts.
2. **Unattended loop.** The loop builds the planned epics in isolated worktrees,
   merging each successful epic back to the base branch. It never drafts new
   proposed decisions.
3. **Morning review.** When you return, the morning review queue (section (f))
   surfaces both what the loop landed and the decisions still awaiting
   ratification.

The morning ratify-pending count reflects the proposed entries authored in the
**attended pre-loop session**, not anything the loop drafted. The loop is a
producer of merged code and a blocked/completed report — not of proposed
decisions.

## (f) After the loop: the morning review queue

The north star is that a human's overnight work converges to **review**. When an
interactive session starts, the SessionStart context injection (`inject-context`)
renders any queued morning-review items:

- **Loop finished** — what the overnight loop landed: `N merged on <branch>,
  M blocked`, total cost, and each blocked epic with its reason. This is the
  loop's outcome surface; it is queued by `finalizeLoop` and consumed once.
- **Decisions pending ratification** — proposed decisions awaiting your
  confirmation, with a directly runnable invocation:

  ```bash
  ARCFORGE_MODE=attended node "$ARCFORGE_ROOT/scripts/cli.js" ratify <spec-id> <D-id>
  ```

  and a pointer back to this guide.

### The ratify-pending notification is lifecycle-aware

The notification points at a command that will actually succeed. `arcforge
ratify` refuses to mint while a **live** loop is running (so an unattended loop
cannot self-ratify). That check is lifecycle-aware, not existence-only: the loop
sentinel (`.arcforge-loop.json`) is read for its status and heartbeat, not merely
its presence. A sentinel in a terminal state (or one whose heartbeat has gone
stale past the configured window) is treated as **not live**, so once the loop
has finished, the morning notification points at a `ratify` command that the
engine gate will let through. The sentinel file is never deleted to "unblock"
ratify — its lifecycle state is what gates, so resume-after-pause stays intact.

These morning-review items are isolated from loop-spawned and enricher sessions:
a session arcforge spawned itself does not consume the user's pending actions, so
the detached children of an overnight run cannot eat the notifications before
your next interactive session sees them.

## (g) Trust boundary

What the engine enforces vs. what is advisory. Be precise about this so you do
not over-trust a layer that can be bypassed.

| Control | Layer | Enforcement |
|---------|-------|-------------|
| `arcforge ratify` refuses to mint unless `ARCFORGE_MODE=attended` and no live loop sentinel | Engine (CLI) | **Hard** — in-engine; does not rely on the harness |
| Refiner draft-then-ratify (no invention of concrete MUSTs without authorization) | Engine (mechanical authorization check at Phase 6) | **Hard** — `mechanicalAuthorizationCheck` blocks on unauthorized values |
| Loop scrubs `ARCFORGE_MODE` from spawn env | Engine (loop-session) | **Hard** — spawned sessions are always unattended |
| `sdd-ratify-guard` PreToolUse deny of agent-run ratify | Harness hook (Claude Code only) | **Best-effort** — a defense-in-depth Bash deny; can be weakened by `--dangerously-skip-permissions` |
| General Bash commands the agent runs | Harness | **Bash is unfenced** — there is no general Bash permission fence; `arc-guard` only denies a narrow set of commands (raw `git merge`, loop launch) and *only* inside an epic worktree. Outside that, Bash runs unchecked. |

The engine-side gates (the first three rows) are the load-bearing controls: they
hold even if the harness hooks are disabled or bypassed. The harness hooks are
hardening on top, not the primary boundary. **Do not assume Bash is fenced** —
the agent can run arbitrary shell; the engine-side `ratify` mode gate, not a
Bash fence, is what keeps unattended ratification from happening.

## See also

- [CLI Invocation Convention](./cli-invocation.md) — the one blessed way to call the CLI on all platforms.
- [Worktree Workflow](./worktree-workflow.md) — how epics run in isolated worktrees during the build stage.
- `arc-refining` (skill) — the attended draft-then-ratify path and the Iron Law's three authorization sources.
