from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-brainstorming/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def _parse_frontmatter(text: str) -> dict:
    if not text.startswith("---\n"):
        raise AssertionError("missing frontmatter start")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise AssertionError("missing frontmatter end")
    front = text[4:end].strip().splitlines()
    data = {}
    for line in front:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def test_arc_brainstorming_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-brainstorming"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @ symbols in skill content
    assert "@" not in text

    # Standardized prompt blocks required
    assert "✅" in text
    assert "⚠️" in text


def test_arc_brainstorming_frontmatter_no_hardcoded_paths():
    """Description must not contain hardcoded file paths (fr-cc-006)."""
    text = _read_skill()
    front = _parse_frontmatter(text)
    description = front.get("description", "")

    # Must not contain literal path patterns
    assert "specs/" not in description
    assert "docs/plans" not in description
    assert "spec.xml" not in description


def test_arc_brainstorming_contains_2_action_rule():
    text = _read_skill()

    # Must mention 2-Action Rule
    assert "2" in text and ("action" in text.lower() or "search" in text.lower())

    # Must mention output location
    assert "docs/plans" in text

    # Must mention design document output
    assert "design" in text.lower()


def test_arc_brainstorming_has_yagni_protection():
    """Test skill has YAGNI protection mechanisms."""
    text = _read_skill()

    # Must have YAGNI as key principle
    assert "YAGNI" in text

    # Must have red flags against feature creep
    assert "## Red Flags" in text or "Red Flags" in text

    # Must have rationalization table
    assert "| Excuse | Reality |" in text or "Rationalization" in text


def test_arc_brainstorming_has_one_question_rule():
    """Test skill enforces one question at a time."""
    text = _read_skill()

    # One question at a time must be explicit
    assert "one question at a time" in text.lower() or "one question per message" in text.lower()


def test_arc_brainstorming_has_sdd_pipeline_features():
    """Test skill has SDD pipeline v2 features (replaces old REFINER_INPUT test).

    Per D5 (2026-04-19 realignment), the Path A / Path B / γ mode labels are
    removed. Brainstorming uses filesystem-state framing instead — "no prior
    spec exists" / "prior spec exists".
    """
    text = _read_skill()

    # 2-Action Rule (arcforge specific)
    assert "2-Action Rule" in text or "2-Action" in text

    # Must NOT have REFINER_INPUT (removed in v2)
    assert "REFINER_INPUT" not in text

    # Mode labels removed per D5 realignment — use filesystem-state framing
    import re
    assert not re.search(r"\bPath A\b", text), "Path A label removed per D5"
    assert not re.search(r"\bPath B\b", text), "Path B label removed per D5"
    assert "gamma mode" not in text.lower(), "gamma mode label removed per D5"

    # New framing required
    has_no_prior_section = (
        "no prior spec" in text.lower() or "no prior spec exists" in text.lower()
    )
    has_prior_section = (
        "prior spec exists" in text.lower() or "iterating on a spec" in text.lower()
    )
    assert has_no_prior_section, "Skill must use 'no prior spec exists' framing (per D5)"
    assert has_prior_section, "Skill must use 'prior spec exists' framing (per D5)"

    # Completion formats
    assert "✅" in text
    assert "⚠️" in text


def test_arc_brainstorming_has_phase_zero_scanning():
    """Test skill documents Phase 0 spec scanning (fr-bs-001)."""
    text = _read_skill()

    # Phase 0 or spec scanning must be present
    # Accept any of these as evidence of scanning behavior
    has_scanning = (
        "Phase 0" in text
        or "scan" in text.lower()
        or "Scan" in text
        or "specs/" in text
    )
    assert has_scanning, "Skill must document spec/ directory scanning"


def test_arc_brainstorming_has_explicit_routing_confirmation():
    """Test skill requires explicit user confirmation about new-vs-iteration target (fr-bs-002).

    Per D5 (2026-04-19 realignment), no Path A/B labels. Routing is now framed
    as "is this a new spec or iteration on an existing one?" with the user
    confirming the target spec-id.
    """
    text = _read_skill()

    # Must mention scanning specs/ for existing spec_ids (Phase 0 behavior)
    assert "specs/" in text or "scan" in text.lower()

    # Must require user confirmation (not auto-detect)
    has_confirmation = (
        "user confirms" in text.lower()
        or "user's explicit confirmation" in text.lower()
        or "confirm the target" in text.lower()
        or "do not auto-detect" in text.lower()
        or "do NOT auto-detect" in text
        or "never infer" in text.lower()
    )
    assert has_confirmation, (
        "Skill must require explicit user confirmation for new-vs-iteration target choice"
    )


def test_arc_brainstorming_references_print_schema_cli():
    """Test skill delegates schema to print-schema.js instead of embedding templates.

    Per fr-sd-011 (schema access via CLI), the skill MUST reference
    scripts/lib/print-schema.js as the canonical way to obtain the
    design-doc schema, and MUST NOT embed hand-authored section templates.
    Replaces the old has_iteration_design_doc_sections test which asserted
    the existence of hand-authored templates — those are exactly what we
    want NOT to exist anymore.
    """
    text = _read_skill()

    # Skill must point at the CLI, not embed schema content.
    assert "print-schema.js" in text, (
        "Skill must reference scripts/lib/print-schema.js as the schema source"
    )

    # Skill must still describe the behavior (Context + Change Intent are named
    # in prose) so the reader knows what to expect — but NOT as code-block templates.
    assert "Context" in text
    assert "Change Intent" in text

    # Specifically forbid the template that caused the 2026-04-19 bug.
    assert "## Context (from spec v" not in text, (
        "Skill must not embed the `## Context (from spec v<N>)` template — "
        "schema content belongs in scripts/lib/sdd-utils.js (DESIGN_DOC_RULES)."
    )


def test_arc_brainstorming_forbids_pre_authored_delta():
    """Test skill explicitly forbids pre-authored ADDED/MODIFIED/REMOVED lists (fr-bs-005-ac4, D3).

    The refiner derives the delta from narrative intent. The design doc carries
    only human-authored prose.
    """
    text = _read_skill()

    has_forbidden_statement = (
        "no pre-authored" in text.lower()
        or "must not contain a pre-authored" in text.lower()
        or "do not write a" in text.lower() and "added / modified / removed" in text.lower()
        or "forbidden" in text.lower() and "delta" in text.lower()
    )
    assert has_forbidden_statement, (
        "Skill must forbid pre-authored ADDED/MODIFIED/REMOVED lists (refiner derives the delta)"
    )


def test_arc_brainstorming_has_per_spec_output_path():
    """Test skill uses new per-spec output path convention (fr-bs-003)."""
    text = _read_skill()

    # New path convention: docs/plans/<spec-id>/<YYYY-MM-DD>/design.md
    # Must have both the nested structure clue and docs/plans
    assert "docs/plans" in text

    # Should reference spec-id-based directory or date-based directory
    has_nested_path = (
        "<spec-id>" in text
        or "spec-id" in text
        or "YYYY-MM-DD" in text
    )
    assert has_nested_path, "Skill must document the per-spec output path convention"


def test_arc_brainstorming_has_same_day_iteration_ux():
    """Test skill describes same-day iteration suffix UX."""
    text = _read_skill()

    # Same-day iteration guidance
    has_suffix_guidance = (
        "-v2" in text
        or "suffix" in text.lower()
        or "same-day" in text.lower()
        or "already exists" in text.lower()
        or "folder exists" in text.lower()
    )
    assert has_suffix_guidance, "Skill must describe same-day iteration suffix UX"


def test_arc_brainstorming_references_sdd_schema():
    """Test skill references sdd-schemas/design.md (fr-cc-if-005-ac1)."""
    text = _read_skill()

    # Must reference the design schema
    assert "sdd-schemas" in text or "design.md" in text or "scripts/lib/sdd-schemas" in text


def test_arc_brainstorming_has_output_validation():
    """Test skill documents output validation before writing (fr-bs-007)."""
    text = _read_skill()

    # Validation must be documented
    has_validation = (
        "validat" in text.lower()
        or "validate" in text.lower()
        or "Validate" in text
        or "ERROR" in text
    )
    assert has_validation, "Skill must document output validation step"


def test_arc_brainstorming_routes_to_arc_refining():
    """Test skill routes to /arc-refining as next step."""
    text = _read_skill()

    # Must reference arc-refining as next step
    assert "/arc-refining" in text or "arc-refining" in text


# ---------------------------------------------------------------------------
# fr-bs-009: Structured decision-log output in Phase 2
# ---------------------------------------------------------------------------


def test_arc_brainstorming_phase2_decision_log_required_fields():
    """fr-bs-009-ac1/ac2: Phase 2 MUST direct production of all four required fields.

    The four fields are defined in DECISION_LOG_RULES.required_fields_per_row.
    Every Q&A row produced by Phase 2 MUST carry exactly these four fields.
    """
    text = _read_skill()

    # All four field names must appear
    assert "q_id" in text, "SKILL.md must mention q_id field (fr-bs-009-ac1)"
    assert "question" in text, "SKILL.md must mention question field (fr-bs-009-ac1)"
    assert "user_answer_verbatim" in text, (
        "SKILL.md must mention user_answer_verbatim field (fr-bs-009-ac2)"
    )
    assert "deferral_signal" in text, (
        "SKILL.md must mention deferral_signal field (fr-bs-009-ac2)"
    )


def test_arc_brainstorming_phase2_decision_log_wire_format():
    """fr-bs-009-ac1: Phase 2 output MUST be YAML (matching parseDecisionLog wire format)."""
    text = _read_skill()

    # Wire format must be specified as YAML
    assert "yaml" in text.lower() or "YAML" in text, (
        "SKILL.md must specify YAML as the wire format for decision-log (fr-bs-009-ac1)"
    )

    # Must use .yml extension (not .md or free-form)
    assert "decision-log.yml" in text, (
        "SKILL.md must specify decision-log.yml as the output file path (fr-bs-009-ac1)"
    )


def test_arc_brainstorming_phase2_decision_log_q_id_stability():
    """fr-bs-009-ac3: Phase 2 instructions MUST direct q_id stability across revisions."""
    text = _read_skill()

    # q_id stability rule must be stated
    has_stability = (
        "stable" in text.lower() and "q_id" in text
        or "q_id" in text and "reassign" in text.lower()
        or "q_id" in text and "persist" in text.lower()
        or "q_id" in text and "sequential" in text.lower()
    )
    assert has_stability, (
        "SKILL.md must direct q_id stability (once assigned, q_id must not change within session)"
    )


def test_arc_brainstorming_phase2_deferral_signal_canonical_phrases():
    """fr-bs-009-ac4: Phase 2 MUST instruct deferral_signal detection for the four canonical phrases."""
    text = _read_skill()

    # All four canonical deferral phrases from DECISION_LOG_RULES must appear
    assert '"use defaults"' in text or "'use defaults'" in text or "use defaults" in text, (
        'SKILL.md must include canonical phrase "use defaults"'
    )
    assert '"covered."' in text or "'covered.'" in text or "covered." in text, (
        'SKILL.md must include canonical phrase "covered."'
    )
    assert '"skip"' in text or "'skip'" in text or "`skip`" in text, (
        'SKILL.md must include canonical phrase "skip"'
    )
    assert '"you decide"' in text or "'you decide'" in text or "you decide" in text, (
        'SKILL.md must include canonical phrase "you decide"'
    )

    # Must reference DECISION_LOG_RULES as the source of truth for canonical phrases
    assert "DECISION_LOG_RULES" in text, (
        "SKILL.md must reference DECISION_LOG_RULES as the source of truth for canonical phrases"
    )


def test_arc_brainstorming_phase2_decision_log_schema_reference():
    """fr-bs-009: Phase 2 must reference the decision-log schema doc."""
    text = _read_skill()

    has_schema_ref = (
        "scripts/lib/sdd-schemas/decision-log.md" in text
        or "sdd-schemas/decision-log" in text
        or "decision-log schema" in text.lower()
    )
    assert has_schema_ref, (
        "SKILL.md must reference scripts/lib/sdd-schemas/decision-log.md schema doc"
    )


def test_arc_brainstorming_phase2_replaces_v1_free_form():
    """fr-bs-009: v1 free-form decision-log.md is REPLACED by structured YAML.

    SKILL.md must state that the structured format replaces the v1 free-form,
    and must NOT describe emitting free-form prose decision-log.md.
    """
    text = _read_skill()

    # Must say v1 free-form is replaced
    has_replacement_notice = (
        "replaced" in text.lower() and "decision-log" in text.lower()
        or "replaces" in text.lower() and "decision-log" in text.lower()
        or "no longer" in text.lower() and "decision-log" in text.lower()
    )
    assert has_replacement_notice, (
        "SKILL.md must state that the v1 free-form decision-log.md is REPLACED by structured YAML"
    )

    # Must NOT instruct brainstorming to emit free-form prose decision-log.md
    # (the old format that the parser cannot consume)
    has_freeform_instruction = (
        "free-form decision-log.md" in text.lower()
        or "prose decision-log" in text.lower()
    )
    assert not has_freeform_instruction, (
        "SKILL.md must NOT instruct emission of free-form prose decision-log.md"
    )
