# Epic: Update fr-oi-001 — single-HIGH visual emphasis in Phase 2 Overview

## Source

- Spec requirement: `fr-oi-001` (Phase 2 markdown report with mandatory table layout)
- Detail file: `specs/arc-auditing-spec/details/output-and-interaction.xml`
- Delta entry: `<modified ref="fr-oi-001" />` in spec.xml v2 delta (iteration `2026-04-24-iterate2`)

## Scope

Update the existing fr-oi-001 implementation to satisfy the new `fr-oi-001-ac5` added in v2: when the audit produces exactly one HIGH-severity finding across the full finding set, that row in the Phase 2 Findings Overview table MUST render its Title column with a `⚠️` prefix and markdown-bold Title text. This is the visual emphasis primitive that `fr-oi-002-ac6` (N_HIGH == 1 direct-to-Phase-4) relies on.

Also align `fr-oi-001-ac3`'s trace with the corrected design-history pointer (design 2026-04-24-iterate2 §Context — Defect 2) so that future iteration reads inherit the corrected framing rather than the v1 line-32 contradiction.

## Dependencies

None — first in the v2 update chain.

## Features

- `oi-001-emphasis` — implement ⚠️ prefix + bold Title for single-HIGH Overview row

## Touched artifacts

- `skills/arc-auditing-spec/SKILL.md` (Phase 2 rendering logic)
- `skills/arc-auditing-spec/references/report-templates.md` (Overview row template for single-HIGH case)
