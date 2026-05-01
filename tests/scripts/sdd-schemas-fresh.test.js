const fs = require('node:fs');
const path = require('node:path');

const {
  renderDesignMarkdown,
  renderSpecMarkdown,
  renderDecisionLog,
  renderPendingConflict,
} = require('../../scripts/lib/print-schema');

// ---------------------------------------------------------------------------
// sdd-schemas/*.md freshness — extends fr-sd-011 to all four schemas (fr-sd-016).
// ---------------------------------------------------------------------------
//
// scripts/lib/sdd-schemas/{design,spec,decision-log,pending-conflict}.md are the
// human-oriented VIEWS of the four rule constants in scripts/lib/sdd-utils.js
// (DESIGN_DOC_RULES, SPEC_HEADER_RULES) and scripts/lib/sdd-rules.js
// (DECISION_LOG_RULES, PENDING_CONFLICT_RULES). They are committed so humans
// browsing the tree find them at conventional paths, but they are generated
// from the rule constants and MUST stay in sync.
//
// This test reproduces the renderer output in-memory and asserts it matches
// the committed file. Divergence means either (a) someone edited the file by
// hand (do not — edit the rule constant instead), or (b) a rule change was
// made but the committed view wasn't regenerated.
//
// Remediation in either case (run from repo root):
//   node scripts/lib/print-schema.js design           --markdown > scripts/lib/sdd-schemas/design.md
//   node scripts/lib/print-schema.js spec             --markdown > scripts/lib/sdd-schemas/spec.md
//   node scripts/lib/print-schema.js decision-log     --markdown > scripts/lib/sdd-schemas/decision-log.md
//   node scripts/lib/print-schema.js pending-conflict --markdown > scripts/lib/sdd-schemas/pending-conflict.md

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'sdd-schemas');

// Each entry: target name (used in CLI + in error messages) → committed file path
// + renderer function (no args; markdown=true is implicit via the *Markdown alias
// or via {markdown: true} for the new renderers).
const SCHEMAS = [
  {
    target: 'design',
    file: path.join(SCHEMAS_DIR, 'design.md'),
    render: () => renderDesignMarkdown(),
    sourceConstant: 'DESIGN_DOC_RULES',
  },
  {
    target: 'spec',
    file: path.join(SCHEMAS_DIR, 'spec.md'),
    render: () => renderSpecMarkdown(),
    sourceConstant: 'SPEC_HEADER_RULES',
  },
  {
    target: 'decision-log',
    file: path.join(SCHEMAS_DIR, 'decision-log.md'),
    render: () => renderDecisionLog({ markdown: true }),
    sourceConstant: 'DECISION_LOG_RULES',
  },
  {
    target: 'pending-conflict',
    file: path.join(SCHEMAS_DIR, 'pending-conflict.md'),
    render: () => renderPendingConflict({ markdown: true }),
    sourceConstant: 'PENDING_CONFLICT_RULES',
  },
];

// The CLI appends a trailing newline to stdout; renderer output does not.
// Normalize both sides by trimming trailing whitespace before comparison.
function norm(s) {
  return s.replace(/[\s﻿\xA0]+$/, '');
}

function diffHint(expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  const firstDiff = [];
  for (let i = 0; i < maxLines; i++) {
    if (expectedLines[i] !== actualLines[i]) {
      firstDiff.push(`line ${i + 1}:`);
      firstDiff.push(`  committed: ${JSON.stringify(actualLines[i] ?? '<EOF>')}`);
      firstDiff.push(`  generated: ${JSON.stringify(expectedLines[i] ?? '<EOF>')}`);
      if (firstDiff.length >= 9) break;
    }
  }
  return firstDiff.join('\n');
}

describe('sdd-schemas markdown views are in sync with their rule constants (fr-sd-016)', () => {
  for (const { target, file, render, sourceConstant } of SCHEMAS) {
    const relPath = path.relative(REPO_ROOT, file);
    it(`${relPath} matches \`print-schema.js ${target} --markdown\``, () => {
      const committed = fs.readFileSync(file, 'utf8');
      const generated = render();
      if (norm(committed) !== norm(generated)) {
        throw new Error(
          `${relPath} is out of sync with ${sourceConstant}.\n\n` +
            `To fix, run:\n` +
            `  node scripts/lib/print-schema.js ${target} --markdown > ${relPath}\n\n` +
            'First diverging lines:\n' +
            diffHint(generated, committed),
        );
      }
    });
  }

  it('every committed markdown file starts with the AUTO-GENERATED header', () => {
    // Belt-and-suspenders: if someone copy-pastes the file out and edits it
    // without running the regenerator, they at least see the warning.
    for (const { file } of SCHEMAS) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).toMatch(/^<!--\s*\n\s*AUTO-GENERATED/);
    }
  });
});
