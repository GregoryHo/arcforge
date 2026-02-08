"""Tests for arc-writing-skills skill.

This skill provides the methodology for writing and maintaining skills
in the arcforge system, based on TDD principles.
"""
from pathlib import Path
import re


def _read_skill() -> str:
    skill_path = Path("skills/arc-writing-skills/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def _parse_frontmatter(text: str) -> dict:
    """Minimal YAML frontmatter parser for name/description only."""
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


class TestFrontmatterAndBasicRules:
    """Test YAML frontmatter and basic skill conventions."""

    def test_frontmatter_name_is_correct(self):
        text = _read_skill()
        front = _parse_frontmatter(text)
        assert front.get("name") == "arc-writing-skills"

    def test_description_starts_with_use_when(self):
        text = _read_skill()
        front = _parse_frontmatter(text)
        assert front.get("description", "").startswith("Use when")

    def test_frontmatter_under_1024_chars(self):
        text = _read_skill()
        front = _parse_frontmatter(text)
        total = len(front.get("name", "") + front.get("description", ""))
        assert total < 1024

    def test_no_at_syntax_in_skill(self):
        """Ensure no @ force-loading syntax in skill content."""
        text = _read_skill()
        assert "@" not in text

    def test_word_count_appropriate(self):
        """Meta-skill about writing skills can be comprehensive.

        Note: 500 word limit applies to pipeline skills, not to this meta-skill
        which needs comprehensive methodology content. Heavy reference still
        goes to supporting files.
        """
        text = _read_skill()
        word_count = len(re.findall(r"\b\w+\b", text))
        # Writing-skills is comprehensive by design, but should still be reasonable
        assert word_count <= 2500, f"Word count {word_count} exceeds 2500 limit"


class TestTDDMethodology:
    """Test that core TDD concepts are present."""

    def test_iron_law_present(self):
        """The Iron Law: NO SKILL WITHOUT A FAILING TEST FIRST."""
        text = _read_skill()
        lowered = text.lower()
        # Must mention the core principle about testing first
        assert "test" in lowered and "first" in lowered

    def test_red_green_refactor_cycle(self):
        """TDD cycle must be explained."""
        text = _read_skill()
        lowered = text.lower()
        assert "red" in lowered
        assert "green" in lowered
        assert "refactor" in lowered

    def test_tdd_mapping_for_skills(self):
        """Must explain how TDD maps to skill creation."""
        text = _read_skill()
        lowered = text.lower()
        # Skills equivalent: test case = pressure scenario, code = SKILL.md
        assert "pressure" in lowered or "scenario" in lowered or "baseline" in lowered


class TestCSOGuidelines:
    """Test Claude Search Optimization guidelines are present."""

    def test_description_guidelines(self):
        """CSO: description should describe WHEN to use, not WHAT it does."""
        text = _read_skill()
        lowered = text.lower()
        # Must mention the critical CSO principle
        assert "when" in lowered and "description" in lowered


class TestCrossReferenceConvention:
    """Test cross-reference patterns are documented."""

    def test_required_markers_documented(self):
        """Must document REQUIRED SUB-SKILL or REQUIRED BACKGROUND pattern."""
        text = _read_skill()
        # Must explain the cross-reference pattern
        assert "REQUIRED" in text

    def test_no_at_syntax(self):
        """Never use @ syntax (burns context)."""
        text = _read_skill()
        # Validates the skill itself doesn't use @
        assert "@" not in text


class TestSkillCreationChecklist:
    """Test that skill creation checklist is present."""

    def test_checklist_present(self):
        """Must include checklist for skill creation workflow."""
        text = _read_skill()
        lowered = text.lower()
        assert "checklist" in lowered or ("[ ]" in text)
