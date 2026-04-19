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


def test_arc_refining_filesystem_behavior_detection():
    """Skill must detect behavior from filesystem state, not from a mode parameter
    (fr-rf-005, fr-rf-009; D5 — no Path A/B/γ/initial/iteration mode labels).
    """
    text = _read_skill()

    # Detection must reference spec.xml existence (the filesystem signal)
    assert "spec.xml" in text

    # Both contexts must be documented as filesystem states, not mode labels
    has_no_prior = (
        "no prior spec" in text.lower()
        or "first formalization" in text.lower()
        or "specs/<spec-id>/spec.xml" in text and "does not exist" in text.lower()
    )
    has_prior = (
        "prior spec exists" in text.lower()
        or "iteration on prior spec" in text.lower()
        or "prior spec" in text.lower()
    )
    assert has_no_prior, "Skill must describe the no-prior-spec context"
    assert has_prior, "Skill must describe the prior-spec context"

    # The deprecated mode labels must be GONE (D5 realignment)
    # Use word-boundary checks so we don't false-trigger on harmless phrases.
    import re
    assert not re.search(r"\bPath A\b", text), "Path A label removed per D5"
    assert not re.search(r"\bPath B\b", text), "Path B label removed per D5"
    assert "gamma mode" not in text.lower(), "gamma mode label removed per D5"
    assert "γ mode" not in text, "γ mode label removed per D5"


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


def test_arc_refining_no_refiner_report_artifact():
    """Per D6 (2026-04-19 realignment), refiner block writes NO files.
    Any mention of refiner-report.md must be in a negation context.
    """
    text = _read_skill()

    # The skill may mention refiner-report.md only to negate it (e.g., "No refiner-report.md")
    # The forbidden pattern: a positive instruction to PRODUCE the file.
    forbidden = [
        "produce a refiner-report",
        "write a refiner-report",
        "writes a refiner-report",
        "writes refiner-report.md",
        "produce refiner-report.md",
    ]
    for f in forbidden:
        assert f not in text.lower(), (
            f"Skill must not instruct producing a refiner-report (found: {f!r}) — D6 forbids any block-time artifact"
        )

    # Skill MUST explicitly state block behavior is terminal-only / no files
    has_terminal_only = (
        "terminal-only" in text.lower()
        or "no files" in text.lower()
        or "writes nothing" in text.lower()
        or "write no files" in text.lower()
        or "no refiner-report" in text.lower()
    )
    assert has_terminal_only, (
        "Skill must explicitly document terminal-only block behavior (no report file written)"
    )


def test_arc_refining_dag_completion_gate():
    """Per D2 (2026-04-19 realignment), refiner owns the DAG completion gate (fr-rf-012)."""
    text = _read_skill()

    # Must invoke checkDagStatus or document the gate behavior
    has_gate = (
        "checkDagStatus" in text
        or "dag completion gate" in text.lower()
        or "complete current sprint before iterating" in text.lower()
    )
    assert has_gate, "Skill must document the DAG completion gate (per D2/fr-rf-012)"


def test_arc_refining_no_escape_hatch():
    """Per D7 (2026-04-19 realignment), there is no escape hatch from the gate."""
    text = _read_skill()

    has_escape_hatch_disclaimer = (
        "no escape hatch" in text.lower()
        or "no --force" in text.lower()
        or "no force flag" in text.lower()
        or "no `--force`" in text.lower()
    )
    assert has_escape_hatch_disclaimer, (
        "Skill must explicitly state there is no escape hatch (no --force, no abandoned status)"
    )


def test_arc_refining_delta_accumulation():
    """Per D3 (2026-04-19 realignment), refiner appends new <delta> and preserves prior deltas verbatim."""
    text = _read_skill()

    # Must mention preserving prior deltas (not overwriting)
    has_preserve = (
        "preserve every prior" in text.lower()
        or "preserve all prior" in text.lower()
        or "verbatim" in text.lower()
        or "never overwrite" in text.lower()
        or ("append" in text.lower() and "prior" in text.lower())
    )
    assert has_preserve, (
        "Skill must document that prior <delta> elements are preserved verbatim (per D3)"
    )


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
