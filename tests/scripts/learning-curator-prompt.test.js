// tests/scripts/learning-curator-prompt.test.js
//
// Slice E.1 — observer-prompt.md content tests.
// Verifies the prompt contains required policy constraints.

const fs = require('node:fs');
const path = require('node:path');

const PROMPT_PATH = path.resolve(
  __dirname,
  '../../skills/arc-observing/scripts/observer-prompt.md',
);

let promptContent;

beforeAll(() => {
  promptContent = fs.readFileSync(PROMPT_PATH, 'utf8');
});

// ---------------------------------------------------------------------------
// E.1: Prompt restricts to artifact_type=instinct
// ---------------------------------------------------------------------------

describe('observer-prompt.md — artifact_type restriction', () => {
  test('prompt mentions "instinct" as allowed artifact type', () => {
    expect(promptContent).toContain('instinct');
  });

  test('prompt explicitly states ONLY instinct is allowed', () => {
    // Must contain a statement that only instinct is permitted
    expect(promptContent).toMatch(
      /only.*instinct|instinct.*only|allowed.*instinct.*ONLY|instinct.*ONLY/i,
    );
  });

  test('prompt does not grant permission for skill artifact type from daemon', () => {
    // The prompt must NOT instruct the LLM to output skill/command/agent
    // It should mention those types are NOT allowed in daemon curator path.
    // The prompt may mention them in a "Do NOT propose X" context.
    // This test ensures the prompt doesn't say "artifact_type: skill" as an allowed type.
    // Pattern: allowed_artifact_types should only mention "instinct"
    const allowedSection = promptContent.match(/allowed.*artifact.*types[^`]*`([^`]+)`/is);
    if (allowedSection) {
      // If there's a code block showing allowed types, it must only contain instinct
      const codeContent = allowedSection[1];
      expect(codeContent).not.toMatch(/\bskill\b/);
      expect(codeContent).not.toMatch(/\bcommand\b/);
      expect(codeContent).not.toMatch(/\bagent\b/);
    }
    // Also ensure the output JSON example schema only shows "instinct" as the artifact_type
    expect(promptContent).toContain('"artifact_type": "instinct"');
  });
});

// ---------------------------------------------------------------------------
// E.1: Prompt instructs LLM not to write files
// ---------------------------------------------------------------------------

describe('observer-prompt.md — no file writes', () => {
  test('prompt tells LLM not to write files', () => {
    // The prompt's "You must NOT" list should include write-files prohibition
    expect(promptContent).toMatch(/write.*file|file.*write|filesystem/i);
    // And it must be in a negative context (NOT, do not, must not)
    expect(promptContent).toMatch(/must\s+NOT|do\s+NOT|You\s+must\s+NOT/i);
  });
});

// ---------------------------------------------------------------------------
// E.1: Prompt instructs LLM not to assign candidate_id / lifecycle
// ---------------------------------------------------------------------------

describe('observer-prompt.md — Layer 5 boundary', () => {
  test('prompt says not to assign candidate_id', () => {
    expect(promptContent).toMatch(
      /do not assign.*candidate_id|candidate_id.*layer 5|not.*candidate_id/i,
    );
  });

  test('prompt instructs to output JSON only via stdout', () => {
    // Prompt must say output JSON, no preamble
    expect(promptContent).toMatch(
      /output.*only.*JSON|only.*JSON|JSON.*only|no.*explanation|no.*markdown.*code.*block|no.*preamble/i,
    );
  });
});

// ---------------------------------------------------------------------------
// E.1: Prompt requires evidence citation
// ---------------------------------------------------------------------------

describe('observer-prompt.md — evidence citation contract', () => {
  test('prompt says to cite only evidence_ids from the batch', () => {
    expect(promptContent).toMatch(/cite.*evidence_id|evidence_id.*cite|only.*evidence_id/i);
  });

  test('prompt has a placeholder for EVIDENCE_ITEMS', () => {
    expect(promptContent).toContain('{{EVIDENCE_ITEMS}}');
  });

  test('prompt has placeholders for batch_id and batch_hash', () => {
    expect(promptContent).toContain('{{BATCH_ID}}');
    expect(promptContent).toContain('{{BATCH_HASH}}');
  });

  test('prompt has a placeholder for diary context', () => {
    expect(promptContent).toContain('{{DIARY_CONTEXT}}');
  });
});

// ---------------------------------------------------------------------------
// E.1: CandidateProposalPayload structure in prompt
// ---------------------------------------------------------------------------

describe('observer-prompt.md — CandidateProposalPayload structure', () => {
  test('prompt includes schema_version field in output example', () => {
    expect(promptContent).toContain('"schema_version"');
  });

  test('prompt includes source block with layer:4 and curator:llm', () => {
    expect(promptContent).toContain('"layer": 4');
    expect(promptContent).toContain('"curator": "llm"');
  });

  test('prompt includes proposals array in output schema', () => {
    expect(promptContent).toContain('"proposals"');
  });

  test('prompt includes evidence_refs in proposal schema', () => {
    expect(promptContent).toContain('evidence_refs');
  });

  test('prompt specifies body_source must be llm_curator', () => {
    expect(promptContent).toContain('"llm_curator"');
  });
});
