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
    """Test skill has SDD pipeline v2 features (replaces old REFINER_INPUT test)."""
    text = _read_skill()

    # 2-Action Rule (arcforge specific)
    assert "2-Action Rule" in text or "2-Action" in text

    # Must NOT have REFINER_INPUT (removed in v2)
    assert "REFINER_INPUT" not in text

    # Path A and Path B routing must be explicit
    assert "Path A" in text
    assert "Path B" in text

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


def test_arc_brainstorming_has_explicit_path_routing():
    """Test skill requires explicit user confirmation for path choice (fr-bs-002)."""
    text = _read_skill()

    # Explicit confirmation requirement
    assert "Path A" in text
    assert "Path B" in text

    # Must require user confirmation (not auto-detect)
    has_confirmation = (
        "confirm" in text.lower()
        or "explicit" in text.lower()
        or "must not auto" in text.lower()
        or "user confirms" in text.lower()
        or "ask" in text.lower()
    )
    assert has_confirmation, "Skill must require explicit user confirmation for path choice"


def test_arc_brainstorming_has_gamma_mode_sections():
    """Test skill documents gamma mode for Path B (fr-bs-005)."""
    text = _read_skill()

    # Gamma mode section names
    assert "Context" in text
    assert "Change Intent" in text

    # Architecture Impact is optional but should be mentioned
    assert "Architecture Impact" in text or "architecture impact" in text.lower()


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
