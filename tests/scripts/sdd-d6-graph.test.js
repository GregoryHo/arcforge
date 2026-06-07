/**
 * sdd-d6-graph.test.js — Tests for D6 P2: checkSpecDecisionGraph.
 *
 * checkSpecDecisionGraph({ specXmlContent, ledger, productVision, specVision })
 * returns { valid: boolean, errors: string[] }.
 *
 * Three checks:
 *   (a) Every <added>/<modified> delta item with decision="D-NNN" → D-NNN exists in ledger.
 *   (b) Every ledger entry's principle_ref (when present) → resolves to a P-n in productVision.
 *   (c) Delegates to validateDecisionLedger(ledger, null) for structural checks
 *       (monotonic/unique D-id, required fields). null skips git-based immutability.
 *
 * No-op semantics: absent ledger/vision → valid:true.
 */

const { checkSpecDecisionGraph } = require('../../scripts/lib/sdd-utils');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPEC_WITH_DECISION = `<spec><overview>
  <spec_id>my-spec</spec_id>
  <spec_version>2</spec_version>
  <status>active</status>
  <title>My Spec</title>
  <description>A test spec.</description>
  <source>
    <design_path>docs/plans/my-spec/2026-06-07/design.md</design_path>
    <design_iteration>2026-06-07</design_iteration>
  </source>
  <scope><includes></includes></scope>
  <delta version="v1→v2" iteration="2026-06-07">
    <added ref="FR-10" decision="D-001">New requirement.</added>
    <modified ref="FR-05" decision="D-002">Updated requirement.</modified>
  </delta>
</overview></spec>`;

const SPEC_WITH_UNKNOWN_DECISION = `<spec><overview>
  <spec_id>my-spec</spec_id>
  <spec_version>2</spec_version>
  <status>active</status>
  <title>My Spec</title>
  <description>A test spec.</description>
  <source>
    <design_path>docs/plans/my-spec/2026-06-07/design.md</design_path>
    <design_iteration>2026-06-07</design_iteration>
  </source>
  <scope><includes></includes></scope>
  <delta version="v1→v2" iteration="2026-06-07">
    <added ref="FR-10" decision="D-999">New requirement.</added>
  </delta>
</overview></spec>`;

const SPEC_NO_DECISIONS = `<spec><overview>
  <spec_id>my-spec</spec_id>
  <spec_version>1</spec_version>
  <status>active</status>
  <title>My Spec</title>
  <description>A test spec.</description>
  <source>
    <design_path>docs/plans/my-spec/2026-06-07/design.md</design_path>
    <design_iteration>2026-06-07</design_iteration>
  </source>
  <scope><includes></includes></scope>
</overview></spec>`;

const LEDGER_D001_D002 = [
  {
    'D-id': 'D-001',
    date: '2026-06-06',
    spec_version: 'v2',
    status: 'proposed',
    decision: 'Use JWT for authentication.',
    why: 'Stateless, widely supported.',
    authorized_values: [],
  },
  {
    'D-id': 'D-002',
    date: '2026-06-07',
    spec_version: 'v2',
    status: 'proposed',
    decision: 'Use Redis for session cache.',
    why: 'Low latency.',
    authorized_values: [],
  },
];

const LEDGER_D001_ONLY = [
  {
    'D-id': 'D-001',
    date: '2026-06-06',
    spec_version: 'v2',
    status: 'proposed',
    decision: 'Use JWT.',
    why: 'Stateless.',
    authorized_values: [],
  },
];

// Ledger with principle_ref pointing to an existing P-n.
const LEDGER_WITH_VALID_PRINCIPLE_REF = [
  {
    'D-id': 'D-001',
    date: '2026-06-06',
    spec_version: 'v2',
    status: 'proposed',
    decision: 'Use JWT.',
    why: 'Stateless.',
    authorized_values: [],
    principle_ref: 'P-1',
  },
];

// Ledger with principle_ref pointing to a nonexistent P-n.
const LEDGER_WITH_BAD_PRINCIPLE_REF = [
  {
    'D-id': 'D-001',
    date: '2026-06-06',
    spec_version: 'v2',
    status: 'proposed',
    decision: 'Use JWT.',
    why: 'Stateless.',
    authorized_values: [],
    principle_ref: 'P-99',
  },
];

// Ledger with duplicate D-id (structural violation).
const LEDGER_DUPLICATE_DID = [
  {
    'D-id': 'D-001',
    date: '2026-06-06',
    spec_version: 'v2',
    status: 'proposed',
    decision: 'Use JWT.',
    why: 'Stateless.',
    authorized_values: [],
  },
  {
    'D-id': 'D-001',
    date: '2026-06-07',
    spec_version: 'v2',
    status: 'proposed',
    decision: 'Duplicate.',
    why: 'Structural violation.',
    authorized_values: [],
  },
];

const PRODUCT_VISION_P1_P2 = { type: 'product', principles: ['P-1', 'P-2'] };

// ---------------------------------------------------------------------------
// Check (a): delta item decision attribute → D-id must exist in ledger
// ---------------------------------------------------------------------------

describe('checkSpecDecisionGraph — check (a): delta decision links', () => {
  it('passes when all delta decision refs exist in ledger', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: SPEC_WITH_DECISION,
      ledger: LEDGER_D001_D002,
      productVision: PRODUCT_VISION_P1_P2,
      specVision: null,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when delta item references D-NNN not in ledger', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: SPEC_WITH_UNKNOWN_DECISION,
      ledger: LEDGER_D001_ONLY,
      productVision: PRODUCT_VISION_P1_P2,
      specVision: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('D-999'))).toBe(true);
  });

  it('errors once per missing D-id reference', () => {
    const specWithTwo = `<spec><overview>
  <spec_id>s</spec_id>
  <spec_version>2</spec_version>
  <status>active</status>
  <title>S</title>
  <description>Spec S.</description>
  <source>
    <design_path>docs/plans/s/2026-06-07/design.md</design_path>
    <design_iteration>2026-06-07</design_iteration>
  </source>
  <scope><includes></includes></scope>
  <delta version="v1→v2" iteration="2026-06-07">
    <added ref="FR-1" decision="D-998">x.</added>
    <modified ref="FR-2" decision="D-997">y.</modified>
  </delta>
</overview></spec>`;
    const result = checkSpecDecisionGraph({
      specXmlContent: specWithTwo,
      ledger: LEDGER_D001_ONLY,
      productVision: null,
      specVision: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('D-998'))).toBe(true);
    expect(result.errors.some((e) => e.includes('D-997'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Check (b): ledger entry principle_ref → must resolve to P-n in productVision
// ---------------------------------------------------------------------------

describe('checkSpecDecisionGraph — check (b): principle_ref resolution', () => {
  it('passes when ledger principle_ref resolves to a product P-n', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: SPEC_NO_DECISIONS,
      ledger: LEDGER_WITH_VALID_PRINCIPLE_REF,
      productVision: PRODUCT_VISION_P1_P2,
      specVision: null,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when ledger principle_ref does not resolve to product P-n', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: SPEC_NO_DECISIONS,
      ledger: LEDGER_WITH_BAD_PRINCIPLE_REF,
      productVision: PRODUCT_VISION_P1_P2,
      specVision: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('P-99'))).toBe(true);
  });

  it('skips check (b) when productVision is absent (null)', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: SPEC_NO_DECISIONS,
      ledger: LEDGER_WITH_BAD_PRINCIPLE_REF,
      productVision: null,
      specVision: null,
    });
    // No product vision to check against — check (b) is a no-op.
    // Only (c) structural checks run; LEDGER_WITH_BAD_PRINCIPLE_REF is structurally valid.
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Check (c): structural validation (delegated to validateDecisionLedger(ledger, null))
// ---------------------------------------------------------------------------

describe('checkSpecDecisionGraph — check (c): structural ledger validation', () => {
  it('errors when ledger has duplicate D-ids', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: SPEC_NO_DECISIONS,
      ledger: LEDGER_DUPLICATE_DID,
      productVision: null,
      specVision: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No-op semantics — absent inputs
// ---------------------------------------------------------------------------

describe('checkSpecDecisionGraph — no-op when artifacts absent', () => {
  it('returns valid:true when ledger is null', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: SPEC_WITH_DECISION,
      ledger: null,
      productVision: PRODUCT_VISION_P1_P2,
      specVision: null,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid:true when specXmlContent is null', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: null,
      ledger: LEDGER_D001_ONLY,
      productVision: PRODUCT_VISION_P1_P2,
      specVision: null,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid:true when all inputs are absent', () => {
    const result = checkSpecDecisionGraph({
      specXmlContent: null,
      ledger: null,
      productVision: null,
      specVision: null,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
