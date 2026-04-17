from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-planning/SKILL.md")
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


def test_arc_planning_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-planning"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "⚠️" in text


def test_arc_planning_frontmatter_no_hardcoded_paths():
    """Description must not contain hardcoded file paths (fr-cc-006)."""
    text = _read_skill()
    front = _parse_frontmatter(text)
    description = front.get("description", "")

    assert "specs/" not in description
    assert "spec.xml" not in description
    assert "dag.yaml" not in description


def test_arc_planning_contains_required_sections():
    text = _read_skill()

    # Must have DAG output
    assert "dag.yaml" in text.lower()

    # Must have epic/feature mapping
    assert "epic" in text.lower()
    assert "feature" in text.lower()

    # Must reference spec.xml as input
    assert "spec.xml" in text.lower()

    # Must have traceability
    assert "source_requirement" in text.lower() or "traceability" in text.lower()

    # Must have self-validation (cycle detection)
    assert "circular" in text.lower() or "cycle" in text.lower()


def test_arc_planning_input_validation_sdd_utils():
    """Skill must invoke sdd-utils validateSpecHeader before decomposition (fr-pl-005, fr-cc-if-005-ac4)."""
    text = _read_skill()

    # Must mention validateSpecHeader for input validation
    assert "validateSpecHeader" in text

    # Must mention parseSpecHeader to extract delta scope
    assert "parseSpecHeader" in text

    # Must mention sdd-utils or scripts/lib/sdd-utils
    assert "sdd-utils" in text


def test_arc_planning_sprint_model():
    """Skill must document sprint model — build from scratch each time (fr-pl-001)."""
    text = _read_skill()

    # Must mention sprint or build from scratch
    has_sprint = (
        "sprint" in text.lower()
        or "build from scratch" in text.lower()
        or "derived view" in text.lower()
        or "not incrementally maintained" in text.lower()
    )
    assert has_sprint, "Skill must document sprint model (build DAG from scratch each time)"


def test_arc_planning_delta_scoped_planning():
    """Skill must document delta-scoped planning (fr-pl-001-ac2)."""
    text = _read_skill()

    # Must mention delta
    assert "delta" in text.lower() or "<delta>" in text

    # Must describe scoping behavior (added + modified)
    has_scope_logic = (
        "added" in text.lower()
        or "modified" in text.lower()
        or "delta scope" in text.lower()
        or "scope" in text.lower()
    )
    assert has_scope_logic, "Skill must document delta-scoped planning logic"


def test_arc_planning_removed_requirements_no_epics():
    """Skill must state removed requirements do NOT generate epics (fr-pl-001-ac2)."""
    text = _read_skill()

    # Must mention removed requirements
    has_removed_rule = (
        "removed" in text.lower()
        and (
            "no epic" in text.lower()
            or "skip" in text.lower()
            or "do not generate" in text.lower()
            or "not generate" in text.lower()
        )
    )
    assert has_removed_rule, "Skill must state removed requirements do not generate epics"


def test_arc_planning_dag_completion_gate():
    """Skill must document DAG completion gate before building (fr-pl-007)."""
    text = _read_skill()

    # Must mention completion gate or complete current sprint
    has_gate = (
        "completion gate" in text.lower()
        or "complete current sprint" in text.lower()
        or "incomplete" in text.lower()
    )
    assert has_gate, "Skill must document DAG completion gate"

    # Must cover the three cases: no dag → proceed, all completed → archive, any incomplete → block
    assert "archive" in text.lower(), "Skill must document archiving when all epics are completed"


def test_arc_planning_per_spec_output_path():
    """Skill must use per-spec output path: specs/<spec-id>/dag.yaml (fr-pl-003)."""
    text = _read_skill()

    # Must reference per-spec path
    has_per_spec_path = (
        "specs/<spec-id>/" in text
        or "specs/<spec-id>/dag.yaml" in text
        or ("specs/" in text and "<spec-id>" in text)
    )
    assert has_per_spec_path, "Skill must document per-spec output path (specs/<spec-id>/dag.yaml)"


def test_arc_planning_done_signal():
    """Skill must define done signal: all epics completed = sprint done (fr-pl-004)."""
    text = _read_skill()

    # Must mention done signal or all epics completed
    has_done_signal = (
        "done signal" in text.lower()
        or ("all epics" in text.lower() and "completed" in text.lower())
        or "planning round" in text.lower()
    )
    assert has_done_signal, "Skill must define done signal (all epics completed = sprint done)"


def test_arc_planning_r2_enforcement():
    """Skill must enforce R2 — planner MUST NOT write to spec.xml or details/ (fr-cc-002-ac2)."""
    text = _read_skill()

    # Must mention R2 or unidirectional or must not write
    has_r2 = (
        "r2" in text.lower()
        or "unidirectional" in text.lower()
        or "must not write" in text.lower()
        or "must not modify" in text.lower()
    )
    assert has_r2, "Skill must enforce R2 (planner MUST NOT write to spec.xml or details/)"


def test_arc_planning_no_design_doc_access():
    """Skill must state planner MUST NOT read design doc (fr-cc-if-005-ac4)."""
    text = _read_skill()

    # Must state that planner does not read the design doc
    has_no_design_rule = (
        "must not read design" in text.lower()
        or "not read the design" in text.lower()
        or "three-layer" in text.lower()
        or "works from spec only" in text.lower()
        or "spec only" in text.lower()
    )
    assert has_no_design_rule, "Skill must state planner MUST NOT read design doc"


def test_arc_planning_two_pass_write():
    """Skill must document two-pass write pattern for output (fr-pl-006, fr-cc-val-001)."""
    text = _read_skill()

    has_two_pass = (
        "two-pass" in text.lower()
        or "build in memory" in text.lower()
        or "two pass" in text.lower()
    )
    assert has_two_pass, "Skill must document two-pass write pattern (build → validate → write)"


def test_arc_planning_output_validation():
    """Skill must validate output before writing: epic fields, cycles, refs (fr-pl-006)."""
    text = _read_skill()

    # Must document validation checks
    assert "source_requirement" in text.lower() or "required field" in text.lower()
    assert "circular" in text.lower() or "cycle" in text.lower()
    assert "depends_on" in text.lower()


def test_arc_planning_one_to_one_mapping():
    """Skill must preserve 1:1 mapping table (detail→epic, requirement→feature) (fr-pl-002)."""
    text = _read_skill()

    # Must have 1:1 mapping
    assert "1:1" in text or "1 : 1" in text

    # Must mention detail→epic and requirement→feature mapping
    assert "detail" in text.lower()
    assert "requirement" in text.lower()


def test_arc_planning_routes_to_coordinating_or_implementing():
    """Workflow skill must route to /arc-coordinating or /arc-implementing (skills.md workflow type rule)."""
    text = _read_skill()

    has_next_step = "/arc-coordinating" in text or "/arc-implementing" in text
    assert has_next_step, "Skill must route to /arc-coordinating or /arc-implementing"


def test_arc_planning_infrastructure_commands_preserved():
    """Skill must preserve infrastructure commands (SKILL_ROOT, planner.js schema)."""
    text = _read_skill()

    # SKILL_ROOT setup must be preserved
    assert "SKILL_ROOT" in text

    # planner.js schema command must be preserved
    assert "planner.js" in text
    assert "schema" in text
