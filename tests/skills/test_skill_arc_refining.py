from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-refining/SKILL.md")
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


def test_arc_refining_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    # Frontmatter validation
    assert front.get("name") == "arc-refining"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @-syntax file loading
    assert "@" not in text

    # Standardized completion/blocked markers
    assert "✅" in text
    assert "⚠️" in text

    # Description must not hardcode paths (fr-cc-006)
    description = front.get("description", "")
    assert "specs/" not in description
    assert "specs/<spec-id>" not in description


def test_arc_refining_contains_required_sections():
    text = _read_skill()

    # Must have quality checklist
    assert "checklist" in text.lower()
    assert "acceptance criteria" in text.lower()

    # Must have workflow guidance
    assert "workflow guidance" in text.lower() or "clarifying questions" in text.lower()

    # Must specify output format — per-spec directory (not root-level specs/details)
    assert "spec.xml" in text.lower()
    assert "specs/<spec-id>" in text or "specs/<spec_id>" in text

    # Must have validation steps
    assert "validation" in text.lower() or "validate" in text.lower()

    # Must emphasize Source of Truth
    assert "source of truth" in text.lower()


def test_arc_refining_sdd_utils_input_validation():
    """Skill must invoke sdd-utils for input validation (fr-cc-if-005-ac2)."""
    text = _read_skill()

    # Must mention parseDesignDoc and/or sdd-utils for input validation
    assert "parseDesignDoc" in text or "sdd-utils" in text

    # Must mention validateDesignDoc for input validation
    assert "validateDesignDoc" in text


def test_arc_refining_sdd_utils_output_validation():
    """Skill must invoke sdd-utils for output validation (fr-cc-if-005-ac3)."""
    text = _read_skill()

    # Must mention parseSpecHeader and validateSpecHeader for output validation
    assert "parseSpecHeader" in text
    assert "validateSpecHeader" in text


def test_arc_refining_filesystem_mode_detection():
    """Skill must detect mode from filesystem, not explicit parameter (fr-rf-005, fr-rf-009)."""
    text = _read_skill()

    # Both modes must be documented
    assert "iteration mode" in text.lower()
    assert "initial mode" in text.lower()

    # Mode detection must reference spec.xml existence
    assert "spec.xml" in text


def test_arc_refining_two_pass_write():
    """Skill must document two-pass write pattern (fr-rf-010, fr-cc-val-001)."""
    text = _read_skill()

    assert "two-pass" in text.lower() or "build in memory" in text.lower() or "two pass" in text.lower()


def test_arc_refining_delta_metadata():
    """Skill must document delta element output (fr-rf-011)."""
    text = _read_skill()

    # Delta element must be mentioned
    assert "<delta>" in text or "delta metadata" in text.lower() or "delta element" in text.lower()

    # Delta placement — last child of overview
    assert "last child" in text.lower() or "last child of" in text.lower() or "<overview>" in text


def test_arc_refining_refiner_report():
    """Skill must document block behavior and refiner-report.md (fr-rf-002)."""
    text = _read_skill()

    assert "refiner-report.md" in text


def test_arc_refining_supersedes():
    """Skill must document version increment and supersedes field (fr-rf-007)."""
    text = _read_skill()

    assert "supersedes" in text


def test_arc_refining_r2_enforcement():
    """Skill must enforce R2 — refiner MUST NOT write to docs/plans/ except the report."""
    text = _read_skill()

    # Must mention R2 or unidirectional rule
    assert "r2" in text.lower() or "unidirectional" in text.lower() or "must not write" in text.lower()


def test_arc_refining_routes_to_arc_planning():
    """Workflow skill must route to /arc-planning after completion (skills.md workflow type rule)."""
    text = _read_skill()

    assert "/arc-planning" in text or "arc-planning" in text


def test_arc_refining_no_refiner_input_check():
    """REFINER_INPUT check must be completely removed (replaced by full design doc consumption)."""
    text = _read_skill()

    assert "REFINER_INPUT" not in text
