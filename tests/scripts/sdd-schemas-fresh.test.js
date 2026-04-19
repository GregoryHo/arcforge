const fs = require('node:fs');
const path = require('node:path');

const { renderDesignMarkdown, renderSpecMarkdown } = require('../../scripts/lib/print-schema');

// ---------------------------------------------------------------------------
// sdd-schemas/*.md freshness — OpenSpec-style two-phase layer (fr-sd-011).
// ---------------------------------------------------------------------------
//
// scripts/lib/sdd-schemas/design.md and spec.md are the human-oriented VIEWS
// of DESIGN_DOC_RULES / SPEC_HEADER_RULES in sdd-utils.js. They are committed
// so humans browsing the tree find them at conventional paths, but they are
// generated from the rule constants and MUST stay in sync.
//
// This test reproduces the CLI output in-memory and asserts it matches the
// committed file. Divergence means either (a) someone edited the file by hand
// (do not — edit DESIGN_DOC_RULES instead), or (b) a rule change was made but
// the committed view wasn't regenerated.
//
// Remediation in either case:
//   node scripts/lib/print-schema.js design --markdown > scripts/lib/sdd-schemas/design.md
//   node scripts/lib/print-schema.js spec   --markdown > scripts/lib/sdd-schemas/spec.md

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DESIGN_MD = path.join(REPO_ROOT, 'scripts', 'lib', 'sdd-schemas', 'design.md');
const SPEC_MD = path.join(REPO_ROOT, 'scripts', 'lib', 'sdd-schemas', 'spec.md');

// The CLI appends a trailing newline to stdout; renderer output does not.
// Normalize both sides by trimming trailing whitespace before comparison.
function norm(s) {
  return s.replace(/[\s\uFEFF\xA0]+$/, '');
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

describe('sdd-schemas markdown views are in sync with DESIGN_DOC_RULES / SPEC_HEADER_RULES', () => {
  it('scripts/lib/sdd-schemas/design.md matches `print-schema.js design --markdown`', () => {
    const committed = fs.readFileSync(DESIGN_MD, 'utf8');
    const generated = renderDesignMarkdown();
    if (norm(committed) !== norm(generated)) {
      throw new Error(
        'design.md is out of sync with DESIGN_DOC_RULES.\n\n' +
          'To fix, run:\n' +
          '  node scripts/lib/print-schema.js design --markdown > scripts/lib/sdd-schemas/design.md\n\n' +
          'First diverging lines:\n' +
          diffHint(generated, committed),
      );
    }
  });

  it('scripts/lib/sdd-schemas/spec.md matches `print-schema.js spec --markdown`', () => {
    const committed = fs.readFileSync(SPEC_MD, 'utf8');
    const generated = renderSpecMarkdown();
    if (norm(committed) !== norm(generated)) {
      throw new Error(
        'spec.md is out of sync with SPEC_HEADER_RULES.\n\n' +
          'To fix, run:\n' +
          '  node scripts/lib/print-schema.js spec --markdown > scripts/lib/sdd-schemas/spec.md\n\n' +
          'First diverging lines:\n' +
          diffHint(generated, committed),
      );
    }
  });

  it('committed markdown files start with the AUTO-GENERATED header', () => {
    // Belt-and-suspenders: if someone copy-pastes the file out and edits it
    // without running the regenerator, they at least see the warning.
    const design = fs.readFileSync(DESIGN_MD, 'utf8');
    const spec = fs.readFileSync(SPEC_MD, 'utf8');
    expect(design).toMatch(/^<!--\s*\n\s*AUTO-GENERATED/);
    expect(spec).toMatch(/^<!--\s*\n\s*AUTO-GENERATED/);
  });
});
