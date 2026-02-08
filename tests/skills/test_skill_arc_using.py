"""Tests for arc-using skill structure."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_arc_using_has_iron_law():
    """Test skill has mandatory routing requirement."""
    skill_path = PROJECT_ROOT / "skills" / "arc-using" / "SKILL.md"
    content = skill_path.read_text()

    # Must have 1% rule or similar forcing mechanism
    assert "MUST" in content or "1%" in content

    # Must have EXTREMELY-IMPORTANT or similar emphasis
    assert "IMPORTANT" in content or "mandatory" in content.lower()


def test_arc_using_has_red_flags():
    """Test skill has red flags against skipping routing."""
    skill_path = PROJECT_ROOT / "skills" / "arc-using" / "SKILL.md"
    content = skill_path.read_text()

    # Red flags table
    assert "## Red Flags" in content or "Red Flags" in content

    # Specific flags against common bypasses
    assert "simple" in content.lower() or "overkill" in content.lower()


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
