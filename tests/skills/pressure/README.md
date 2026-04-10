# Pressure Scenarios — Manual Regression Fixtures

> These scenarios validate skill changes against **behavioral invariants** under
> realistic user pressure. They complement (not replace) the automated pytest
> files under `tests/skills/`.

## Why these exist

The automated pytest files check **structural invariants** in skill text — e.g.,
"does the skill contain a Red Flags section", "does this phrase appear inside a
fenced code block". Those checks are fast and run in CI, but they can't answer
the important question: **does the skill actually change agent behavior under
pressure?**

The arc-writing-skills Iron Law says:

> No skill without a failing test first. This applies to NEW skills AND EDITS
> to existing skills.

Pressure scenarios are the "failing test" for skill edits. Before editing a
skill, you run the scenario WITHOUT the skill (or without your edit) to
establish the **RED baseline** — what the agent does with no guidance. Then you
run it WITH the edit to verify the **GREEN treatment** — the agent now behaves
correctly.

If the baseline agent already behaves correctly, your edit is **confirmatory**
(defense-in-depth, not corrective). That's still valuable but changes the story
you tell about the edit.

## Layout

```
tests/skills/pressure/
├── README.md                                  # This file
├── arc-using-worktrees-cli-failure.md         # Scenario A
├── arc-using-path-reconstruction.md           # Scenario B
└── arc-finishing-epic-completion-format.md    # Scenario C
```

Each scenario file contains:

1. **Metadata** — skill under test, invariant, capture date, status
2. **Prompt** — the exact user request to paste into a subagent
3. **Baseline configuration** — how to run WITHOUT the skill/edit
4. **Treatment configuration** — how to run WITH the skill/edit
5. **Pass criteria** — assertions a reviewer checks against the output
6. **Frozen baseline output** — verbatim subagent response from the last run
7. **Frozen treatment output** — verbatim subagent response from the last run
8. **Verdict** — pass/fail per assertion, with notes on behavioral delta

## How to re-run a scenario

Pressure scenarios are not part of `npm test`. They require spawning a subagent
with a specific prompt, so they cost real tokens and take ~30 seconds each. Run
them manually when:

- You're about to edit a skill that has a saved scenario
- You want to verify an edit didn't regress behavior
- You're adding a new scenario for a new skill edit

### Option 1: Claude Code Agent tool

From a Claude Code session in this repo, paste the scenario prompt into an
Agent tool call. Use `general-purpose` subagent type. Compare the output to
the frozen output in the scenario file.

### Option 2: Headless `claude -p`

```bash
claude -p < tests/skills/pressure/<scenario-file>.md
```

This reads the file as a prompt and returns the subagent's response to stdout.

## When to update the frozen outputs

Update a frozen output **only** when you intentionally change the expected
behavior — e.g., you add a new step to a skill, or rewrite a Red Flag. In that
case:

1. Run the scenario WITH the new edit
2. Paste the new output into the **Frozen treatment output** section
3. Update the capture date and note what changed
4. **Do not** update the frozen baseline unless you're also changing the
   baseline configuration (e.g., "without skill" → "with old skill version")

When the baseline stops failing the invariant (the scenario becomes purely
confirmatory), either:

- Retire the scenario (if the baseline behavior is now a robust Claude default)
- Note the confirmatory status and keep it as defense-in-depth

## Adding a new scenario

Copy one of the existing scenarios as a template. Fill in:

1. A realistic user request that exerts the pressure you care about
2. The invariant your edit is supposed to enforce
3. Pass criteria written as objective assertions a reviewer can check
4. Run both configurations and paste the verbatim outputs

Name the file `<skill-name>-<short-description>.md`.

## Current scenario inventory

| Scenario | Skill under test | Invariant | Status |
|---------|-----------------|-----------|--------|
| [A: CLI failure](arc-using-worktrees-cli-failure.md) | `arc-using-worktrees` | Refuse manual `git worktree add` bypass under CLI failure + deadline pressure | Confirmatory |
| [B: Path reconstruction](arc-using-path-reconstruction.md) | `arc-using` (Worktree Rule) | Query `arcforge status --json` instead of confirming or hand-deriving a guessed path | Corrective |
| [C: Completion format](arc-finishing-epic-completion-format.md) | `arc-finishing-epic` (Step 4.6) | Query `status --json` for the actual worktree path before emitting the completion format | Corrective |
