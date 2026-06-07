/**
 * sdd-d6-delta.test.js — Tests for T5: parseDeltaItems decision attribute capture.
 *
 * T5: parseDeltaItems (sdd-utils.js:401-411) .ref extraction stays byte-identical
 * (regression). Add a capture path so the decision="D-NNN" attribute on
 * <added>/<modified> is readable (for P2 audit). Old deltas without the attribute
 * parse unchanged.
 *
 * parseSpecHeader takes XML string content (not a file path).
 */

const { parseSpecHeader } = require('../../scripts/lib/sdd-utils');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPEC_WITH_DECISION_ATTR = `<spec><overview>
  <spec_id>auth</spec_id>
  <spec_version>2</spec_version>
  <status>active</status>
  <title>Auth System</title>
  <description>Auth with OAuth</description>
  <source>
    <design_path>docs/plans/auth/2026-06-06/design.md</design_path>
    <design_iteration>2026-06-06</design_iteration>
  </source>
  <scope>
    <includes>
      <feature id="login">User login</feature>
    </includes>
  </scope>
  <delta version="2" iteration="2026-06-06">
    <added ref="fr-auth-007" decision="D-014" />
    <modified ref="fr-auth-002" decision="D-015" />
    <added ref="fr-auth-008" />
  </delta>
</overview></spec>`;

const SPEC_WITHOUT_DECISION_ATTR = `<spec><overview>
  <spec_id>auth</spec_id>
  <spec_version>2</spec_version>
  <status>active</status>
  <title>Auth System</title>
  <description>Auth with OAuth</description>
  <source>
    <design_path>docs/plans/auth/2026-06-06/design.md</design_path>
    <design_iteration>2026-06-06</design_iteration>
  </source>
  <scope>
    <includes>
      <feature id="login">User login</feature>
    </includes>
  </scope>
  <delta version="2" iteration="2026-06-06">
    <added ref="fr-auth-007" />
    <modified ref="fr-auth-002" />
  </delta>
</overview></spec>`;

// ---------------------------------------------------------------------------
// T5 — decision attribute captured
// ---------------------------------------------------------------------------

describe('parseDeltaItems — decision attribute capture (T5)', () => {
  it('captures decision attribute on <added> when present', () => {
    const result = parseSpecHeader(SPEC_WITH_DECISION_ATTR);
    expect(result).not.toBeNull();
    const delta = result.latest_delta;
    expect(delta).not.toBeNull();
    const addedWithDecision = delta.added.find((a) => a.ref === 'fr-auth-007');
    expect(addedWithDecision).toBeDefined();
    expect(addedWithDecision.decision).toBe('D-014');
  });

  it('captures decision attribute on <modified> when present', () => {
    const result = parseSpecHeader(SPEC_WITH_DECISION_ATTR);
    const delta = result.latest_delta;
    const modifiedWithDecision = delta.modified.find((m) => m.ref === 'fr-auth-002');
    expect(modifiedWithDecision).toBeDefined();
    expect(modifiedWithDecision.decision).toBe('D-015');
  });

  it('decision is undefined when attribute is absent', () => {
    const result = parseSpecHeader(SPEC_WITH_DECISION_ATTR);
    const delta = result.latest_delta;
    // fr-auth-008 has no decision attribute
    const addedNoDecision = delta.added.find((a) => a.ref === 'fr-auth-008');
    expect(addedNoDecision).toBeDefined();
    expect(addedNoDecision.decision).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T5 — regression: .ref extraction byte-identical for old deltas
// ---------------------------------------------------------------------------

describe('parseDeltaItems — ref regression (T5)', () => {
  it('.ref is still correctly parsed without decision attribute', () => {
    const result = parseSpecHeader(SPEC_WITHOUT_DECISION_ATTR);
    expect(result).not.toBeNull();
    const delta = result.latest_delta;
    expect(delta.added[0].ref).toBe('fr-auth-007');
    expect(delta.modified[0].ref).toBe('fr-auth-002');
  });

  it('no decision property when attribute absent (old-format delta)', () => {
    const result = parseSpecHeader(SPEC_WITHOUT_DECISION_ATTR);
    const delta = result.latest_delta;
    expect(delta.added[0].decision).toBeUndefined();
    expect(delta.modified[0].decision).toBeUndefined();
  });

  it('ref with slash is parsed correctly (slash-in-ref regression)', () => {
    const specWithSlashRef = `<spec><overview>
  <spec_id>auth</spec_id>
  <spec_version>2</spec_version>
  <status>active</status>
  <title>Auth</title>
  <description>Auth</description>
  <source>
    <design_path>docs/plans/auth/2026-06-06/design.md</design_path>
    <design_iteration>2026-06-06</design_iteration>
  </source>
  <scope><includes><feature id="x">x</feature></includes></scope>
  <delta version="2" iteration="2026-06-06">
    <added ref="fr-auth/sub-001" />
  </delta>
</overview></spec>`;
    const result = parseSpecHeader(specWithSlashRef);
    expect(result).not.toBeNull();
    const delta = result.latest_delta;
    expect(delta.added).toHaveLength(1);
    expect(delta.added[0].ref).toBe('fr-auth/sub-001');
  });
});
