# Feature: PENDING_CONFLICT_RULES constant + schema doc

## Source
- Requirement: `fr-sd-012`
- Detail: `details/sdd-schemas.xml`

## Dependencies
- (none — foundational within the sprint)

## Acceptance Criteria

See `specs/spec-driven-refine/details/sdd-schemas.xml#fr-sd-012` for canonical ACs.

Summary:
- [ ] `scripts/lib/sdd-utils.js` exports a frozen `PENDING_CONFLICT_RULES` object with: `canonical_path` (`specs/<spec-id>/_pending-conflict.md`), `required_fields` (axis_fired, conflict_description with cited line ranges + q_ids, `candidate_resolutions` len 1..=3, user_action_prompt), `lifecycle` ephemeral.
- [ ] Schema MUST forbid persistent / versioned variants — file is non-authoritative ephemeral by design.
- [ ] Schema doc under `scripts/lib/sdd-schemas/` includes valid example (axis 1 fired, 2 candidates) and invalid example (no candidates) with error message "_pending-conflict.md MUST contain at least one candidate resolution".
