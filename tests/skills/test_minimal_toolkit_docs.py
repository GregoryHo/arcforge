"""Tests for minimal composable ArcForge documentation posture."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _read(path: str) -> str:
    return (PROJECT_ROOT / path).read_text(encoding="utf-8")


def test_architecture_describes_arc_using_as_bounded_router():
    """Architecture rules must not reintroduce always-on 1% routing pressure."""
    content = _read(".claude/rules/architecture.md")

    assert "1% rule" not in content
    assert "always in context" not in content.lower()
    assert "bounded router" in content.lower()
    assert "smallest useful workflow" in content.lower()
    assert "harness" in content.lower() and "eval" in content.lower()


def test_readme_positions_arcforge_as_minimal_composable_toolkit():
    """README should present ArcForge as a toolkit, not an enforced workflow OS."""
    content = _read("README.md")

    assert "minimal, composable" in content.lower()
    assert "skills are tools, not laws" in content.lower()
    assert "workflow is enforced" not in content.lower()
    assert "skills trigger automatically" not in content.lower()


def test_skills_reference_has_bounded_arc_using_and_meta_only_writing_skills():
    """Public skill reference should match the new routing and meta-skill model."""
    content = _read("docs/guide/skills-reference.md")

    assert "even 1% chance" not in content
    assert "even if 1% chance" not in content
    assert "before ANY action" not in content
    assert "start here, always" not in content
    assert "always first" not in content
    assert "must be invoked first" not in content
    assert "No Action Without Skill Check" not in content
    assert "non-negotiable across all arcforge workflows" not in content
    assert "arc-learning --> arc-writing-skills" not in content
    assert "bounded router" in content.lower()
    assert "project-level meta" in content.lower()
    assert "arc-writing-skills" in content


def test_active_specs_do_not_require_global_1_percent_routing():
    """Current source-of-truth specs must not require the old global router model."""
    content = _read("specs/arc-evaluating-v2/details/verdict-and-routing.xml")

    assert "1% rule" not in content
    assert "bounded router" in content.lower()
    assert "not a global always-on invocation rule" in content.lower()
