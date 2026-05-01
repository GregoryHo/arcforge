"""Tests for arc-using skill structure."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_arc_using_is_bounded_router_not_iron_law():
    """Test skill is a bounded router, not a global mandatory policy."""
    skill_path = PROJECT_ROOT / "skills" / "arc-using" / "SKILL.md"
    content = skill_path.read_text()

    forbidden = [
        "Even a 1% chance",
        "1% rule",
        "BEFORE any response or action",
        "checks routing table before ANY action",
        "<EXTREMELY-IMPORTANT>",
    ]
    for phrase in forbidden:
        assert phrase not in content

    assert "smallest useful workflow" in content.lower()
    assert "higher-priority instructions" in content.lower()


def test_arc_using_has_non_activation_guidance():
    """Test skill states when a workflow should not be forced."""
    skill_path = PROJECT_ROOT / "skills" / "arc-using" / "SKILL.md"
    content = skill_path.read_text()

    assert "## When Not to Route" in content
    for phrase in ["simple", "read-only", "eval", "grading"]:
        assert phrase in content.lower()


def test_arc_using_has_routing_table():
    """Test skill has arcforge routing table."""
    skill_path = PROJECT_ROOT / "skills" / "arc-using" / "SKILL.md"
    content = skill_path.read_text()

    # Routing guidance structure
    assert "Skill Priority" in content or "priority" in content.lower()

    # arcforge specific routes
    assert "arc-brainstorming" in content
    assert "arc-planning" in content or "planner" in content
    assert "arc-refining" in content or "refiner" in content


def test_arc_using_has_flowchart():
    """Test skill has decision flowchart."""
    skill_path = PROJECT_ROOT / "skills" / "arc-using" / "SKILL.md"
    content = skill_path.read_text()

    # Graphviz flowchart
    assert "```dot" in content or "digraph" in content


def test_arc_using_routing_table_has_arc_evaluating_row():
    """Test the routing table includes arc-evaluating as a discipline skill (fr-vr-002)."""
    skill_path = PROJECT_ROOT / "skills" / "arc-using" / "SKILL.md"
    content = skill_path.read_text()

    # The row must appear in the Discipline Skills routing table
    assert "arc-evaluating" in content

    # The evaluating row must mention INSUFFICIENT_DATA
    assert "INSUFFICIENT_DATA" in content

    # The condition must mention shipping/merging/completing
    assert "ship" in content.lower() or "merge" in content.lower() or "complete" in content.lower()


def test_arc_using_file_artifacts_are_per_spec():
    """SDD v2: the "File artifacts = truth" block must name per-spec paths.

    The v1 layout (root dag.yaml, root specs/spec.xml) is a migration
    hazard — arc-using is loaded into every session, so it is the
    authoritative billboard for where truth lives.
    """
    skill_path = PROJECT_ROOT / "skills" / "arc-using" / "SKILL.md"
    content = skill_path.read_text()

    # Must name the per-spec paths for all three artifact types
    assert "docs/plans/<spec-id>/" in content
    assert "specs/<spec-id>/spec.xml" in content
    assert "specs/<spec-id>/dag.yaml" in content
    assert "specs/<spec-id>/epics/" in content

    # Must NOT advertise the legacy root-level paths (they have been removed)
    lines = content.splitlines()
    # find the "File artifacts" block and assert no bare root-level dag.yaml
    block_lines = [l for l in lines if "dag.yaml" in l and "File artifacts" not in l]
    legacy_root = [l for l in block_lines if "specs/<spec-id>/dag.yaml" not in l and "dag.yaml" in l.strip().lstrip("`").rstrip("`")]
    # Any remaining hit must not be a top-level bullet declaring "dag.yaml" as truth
    for line in block_lines:
        # The legacy form was `` `dag.yaml` + `epics/` → Implementation plans ``
        assert "`dag.yaml` + `epics/`" not in line
