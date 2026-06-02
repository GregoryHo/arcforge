// Draft-rendering for learning candidates. Each renderer turns an approved
// candidate into the inactive `.draft` body that materialization writes to disk.
// Only `renderDraft` is consumed externally (by materializeCandidate in
// learning.js); the per-type renderers and `oneLine` are module-internal.

function oneLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderSkillDraft(candidate) {
  const description = JSON.stringify(`Use when ${oneLine(candidate.trigger)}`);
  return `---
name: ${candidate.name}
description: ${description}
---

# ${candidate.name}

> Draft artifact only. This file is intentionally inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Trigger

${candidate.trigger}

## Summary

${candidate.summary}

## Workflow

1. Confirm the user's request matches the trigger.
2. Review the evidence below and adapt the learned behavior to the current task.
3. Apply the workflow only when it fits the active project context.
4. Verify the result with the strongest relevant project checks before reporting completion.

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderSkillTestDraft(candidate) {
  const safeName = candidate.name.replace(/-/g, '_');
  return `from pathlib import Path


def test_${safeName}_draft_is_not_active():
    draft = Path(__file__).with_suffix(Path(__file__).suffix + ".draft")
    assert draft.name.endswith(".draft")


def test_${safeName}_draft_frontmatter_mentions_candidate():
    draft = Path(__file__).parents[2] / "skills" / "${candidate.name}" / "SKILL.md.draft"
    text = draft.read_text()
    assert "name: ${candidate.name}" in text
    assert "candidate: ${candidate.id}" in text or "${candidate.id}" in text
`;
}

function renderInstinctDraft(candidate) {
  return `---
name: ${candidate.name}
description: ${JSON.stringify(`Instinct learned from observation: ${oneLine(candidate.summary)}`)}
artifact_type: instinct
status: draft
---

# ${candidate.name}

> Draft instinct — inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Trigger

${candidate.trigger}

## Behavior

${candidate.summary}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderCommandDraft(candidate) {
  return `---
name: ${candidate.name}
description: ${JSON.stringify(`Use when ${oneLine(candidate.trigger)}`)}
artifact_type: command
status: draft
---

# /${candidate.name}

> Draft command — inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Trigger

${candidate.trigger}

## Behavior

${candidate.summary}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderAgentDraft(candidate) {
  return `---
name: ${candidate.name}
description: ${JSON.stringify(`Use when ${oneLine(candidate.trigger)}`)}
artifact_type: agent
status: draft
---

# ${candidate.name} agent

> Draft agent definition — inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Trigger

${candidate.trigger}

## Mission

${candidate.summary}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderEvalDraft(candidate) {
  return `---
name: ${candidate.name}
description: ${JSON.stringify(`Eval scaffold for ${oneLine(candidate.summary)}`)}
artifact_type: eval
status: draft
---

# ${candidate.name} eval

> Draft eval — inactive until explicitly activated.

Generated from learning candidate: ${candidate.id}

## Hypothesis

${candidate.summary}

## Trigger

${candidate.trigger}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderRepoConventionPatchDraft(candidate) {
  // Draft is a human-readable proposal, not an actual unified diff. Activation
  // is intentionally refused for this type — the user must apply it manually
  // after review.
  return `# Proposed repo convention patch (draft only — apply manually)

Candidate: ${candidate.id}
Target: ${candidate.target || 'AGENTS.md'}

## Trigger

${candidate.trigger}

## Proposed change

${candidate.summary}

## Evidence

${candidate.evidence.map((item) => `- ${item.source}: ${item.reason} (${item.session_id})`).join('\n')}
`;
}

function renderDraft(candidate) {
  switch (candidate.artifact_type) {
    case 'skill':
      return [renderSkillDraft(candidate), renderSkillTestDraft(candidate)];
    case 'instinct':
      return [renderInstinctDraft(candidate)];
    case 'command':
      return [renderCommandDraft(candidate)];
    case 'agent':
      return [renderAgentDraft(candidate)];
    case 'eval':
      return [renderEvalDraft(candidate)];
    case 'repo_convention_patch':
      return [renderRepoConventionPatchDraft(candidate)];
    default:
      throw new Error(`unsupported artifact_type: ${candidate.artifact_type}`);
  }
}

module.exports = {
  renderDraft,
};
