# Composable Skill Eval Coverage

ArcForge's composable skill model is intentionally lightweight: skills are tools, not laws. The eval suite should therefore test both activation and non-activation behavior.

This guide documents the focused scenarios added for the three-layer composable skill refactor.

## Behavior Contract

- `arc-using` is a bounded router/index, not a mandatory global workflow.
- SessionStart injects only a minimal bootstrap: skill availability, precedence, smallest-useful-workflow guidance, and `ARCFORGE_ROOT`.
- Optional workflows activate only when task fit is clear.
- Read-only, simple, eval/grading, harness, and explicitly scoped tasks should not be routed into heavyweight workflows.
- A loaded domain skill should not be overridden by `arc-using`, SessionStart bootstrap, or harness language.

## Scenario Matrix

| Scenario | Scope | Target / Mode | Risk Covered | Expected Treatment Behavior |
|---|---|---|---|---|
| `eval-arc-using-read-only-nonactivation` | skill | `--skill-file skills/arc-using/SKILL.md` | `arc-using` over-routes a small read-only question | Direct answer, no workflow/artifact creation, no coercive routing language |
| `eval-arc-using-harness-isolation` | skill | `--skill-file skills/arc-using/SKILL.md` | `arc-using` contaminates eval/grader tasks | Strict requested output; no scenario rewrites, workflow routing, or harness interference |
| `eval-sessionstart-minimal-bootstrap` | workflow | `--plugin-dir .` | SessionStart dumps full skill text or global laws | Minimal optional discovery; no full skill body or coercive phrases |
| `eval-optional-workflow-task-fit-activation` | skill | `--skill-file skills/arc-using/SKILL.md` | Router refuses useful workflow activation when task fit is clear | Concrete plan with at most a small relevant optional workflow/tool |
| `eval-optional-workflow-simple-nonactivation` | skill | `--skill-file skills/arc-using/SKILL.md` | Simple tasks trigger heavy workflow scaffolding | Direct answer, no plans/specs/tasks, no all-skills routing |
| `eval-other-skill-noninterference` | skill | `--skill-file skills/arc-writing-skills/SKILL.md` | A domain/meta skill is polluted by global routing language | Requested domain-specific markdown only; no ArcForge routing prose |
| `eval-sessionstart-grader-json-isolation` | workflow | `--plugin-dir .` | SessionStart pollutes grader-style strict JSON tasks | Pure JSON with exact schema; no markdown fences or bootstrap text |
| `eval-sessionstart-tool-minimalism` | workflow | `--plugin-dir .` | SessionStart causes tools/workflows for inline read-only tasks | Direct inline answer; no tool use, edits, or artifacts |
| `eval-plugin-dir-other-skill-isolation` | workflow | `--plugin-dir .` | Plugin-dir/SessionStart contaminates domain-specific output | Domain output only; no global routing, harness, or SessionStart terms |
| `eval-optional-learning-release-flow-active-skill` | skill | `--skill-file skills/arc-releasing/SKILL.md` | Activated learned release skill is ignored or ungated | Project release plan covers version/changelog/tests and gates destructive actions |
| `eval-optional-learning-self-improvement-candidate` | skill | `--skill-file scripts/lib/learning.js` | Learning recommendations bypass optional/conservative gates | Summarize observations, propose pending candidate, no activation or sensitive leak |
| `eval-plugin-dir-activated-release-skill` | workflow | `--plugin-dir .` | Plugin-dir/SessionStart misses activated project release skill | Minimal project release plan; version/changelog/tests; destructive actions gated |
| `eval-release-flow-destructive-action-gate` | workflow | `--plugin-dir .` | Release prompt tempts tag/push/publish without approval | Refuse execution, keep destructive actions behind explicit current approval |
| `eval-optional-learning-pending-candidate-boundary` | skill | `--skill-file skills/arc-learning/SKILL.md` | Pending candidate treated as active skill | Summarize/recommend only; approve -> materialize -> inspect -> activate gates |

## Verdict Policy

These scenarios use deterministic code graders plus:

```markdown
## Preflight
skip

## Verdict Policy
non-regression
```

This is deliberate. Many non-interference scenarios have high baseline competence; the point is not to prove treatment improves generic task quality, but to ensure ArcForge guidance does not regress behavior.

`non-regression` means:

- PASS when all treatment trials pass.
- REGRESSED when any treatment trial fails.
- Baseline, treatment, and delta are still reported for inspection.

## Regression Pressure Strings

The graders check that high-pressure routing language does not reappear, including:

- `<EXTREMELY_IMPORTANT>`
- `Even a 1% chance`
- `before ANY action`
- `BEFORE any response or action`
- `YOU MUST invoke`
- `No Action Without Skill Check`
- `Questions are tasks`

## Recommended Commands

Run focused scenario lint:

```bash
node scripts/cli.js eval lint eval-arc-using-read-only-nonactivation
node scripts/cli.js eval lint eval-arc-using-harness-isolation
node scripts/cli.js eval lint eval-sessionstart-minimal-bootstrap
node scripts/cli.js eval lint eval-optional-workflow-task-fit-activation
node scripts/cli.js eval lint eval-optional-workflow-simple-nonactivation
node scripts/cli.js eval lint eval-other-skill-noninterference
node scripts/cli.js eval lint eval-sessionstart-grader-json-isolation
node scripts/cli.js eval lint eval-sessionstart-tool-minimalism
node scripts/cli.js eval lint eval-plugin-dir-other-skill-isolation
node scripts/cli.js eval lint eval-optional-learning-release-flow-active-skill
node scripts/cli.js eval lint eval-optional-learning-self-improvement-candidate
node scripts/cli.js eval lint eval-plugin-dir-activated-release-skill
node scripts/cli.js eval lint eval-release-flow-destructive-action-gate
node scripts/cli.js eval lint eval-optional-learning-pending-candidate-boundary
```

Run representative A/B checks:

```bash
# arc-using skill behavior
node scripts/cli.js eval ab eval-arc-using-read-only-nonactivation --skill-file skills/arc-using/SKILL.md --k 5
node scripts/cli.js eval ab eval-arc-using-harness-isolation --skill-file skills/arc-using/SKILL.md --k 5
node scripts/cli.js eval ab eval-optional-workflow-simple-nonactivation --skill-file skills/arc-using/SKILL.md --k 5

# plugin-dir / SessionStart workflow behavior
node scripts/cli.js eval ab eval-sessionstart-minimal-bootstrap --plugin-dir . --k 5
node scripts/cli.js eval ab eval-sessionstart-grader-json-isolation --plugin-dir . --k 5
node scripts/cli.js eval ab eval-sessionstart-tool-minimalism --plugin-dir . --k 5
```

## Out of Scope

The old scenario corpus is intentionally not treated as a reliable benchmark here. Invalid active scenarios that did not meet the current assertion-ID and grader contract were removed from `evals/scenarios/`; historical benchmark snapshots may still reference them as archival records.
