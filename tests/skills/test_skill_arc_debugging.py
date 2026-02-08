"""Tests for arc-debugging skill structure."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_arc_debugging_structure():
    """Test arc-debugging skill has required structure."""
    skill_path = PROJECT_ROOT / "skills" / "arc-debugging" / "SKILL.md"
    assert skill_path.exists()

    content = skill_path.read_text()

    # Frontmatter
    assert "name: arc-debugging" in content
    assert "description:" in content

    # Core sections from systematic-debugging
    assert "## The Iron Law" in content
    assert "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST" in content
    assert "## The Four Phases" in content
    assert "## Red Flags" in content
    assert "## Common Rationalizations" in content

    # Verify supporting file references
    assert "root-cause-tracing.md" in content
    assert "defense-in-depth.md" in content


def test_arc_debugging_supporting_files():
    """Test supporting files exist."""
    base = PROJECT_ROOT / "skills" / "arc-debugging"

    assert (base / "root-cause-tracing.md").exists()
    assert (base / "defense-in-depth.md").exists()
    assert (base / "condition-based-waiting.md").exists()
