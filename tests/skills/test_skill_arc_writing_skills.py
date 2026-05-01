"""Tests for arc-writing-skills skill.

This skill provides the methodology for writing and maintaining skills
in the arcforge system, based on TDD principles.
"""
from pathlib import Path

SKILL_DIR = Path("skills/arc-writing-skills")


def _read_skill() -> str:
    skill_path = SKILL_DIR / "SKILL.md"
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

    def test_positioned_as_arcforge_project_level_meta_skill(self):
        """arc-writing-skills is for maintaining ArcForge, not ordinary product work."""
        text = _read_skill()
        lowered = text.lower()
        assert "project-level meta skill" in lowered
        assert "maintaining arcforge" in lowered
        assert "not a general promoted/user-facing core skill" in lowered
        assert "ordinary product work" in lowered

    def test_no_at_syntax_in_skill(self):
        """Ensure no @ force-loading syntax in skill content."""
        text = _read_skill()
        assert "@" not in text


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


class TestEvaluationAgents:
    """Test that evaluation agent templates exist and are properly structured."""

    AGENT_FILES = [
        "agents/skill-grader.md",
        "agents/skill-comparator.md",
        "agents/skill-analyzer.md",
        "agents/description-tester.md",
    ]

    def test_agent_files_exist(self):
        """All 4 agent templates must exist."""
        for agent_file in self.AGENT_FILES:
            path = SKILL_DIR / agent_file
            assert path.exists(), f"Missing agent template: {agent_file}"

    def test_agent_files_have_role_section(self):
        """Each agent template must define its Role."""
        for agent_file in self.AGENT_FILES:
            content = (SKILL_DIR / agent_file).read_text(encoding="utf-8")
            assert "## Role" in content, f"{agent_file} missing ## Role section"

    def test_agent_files_have_process_section(self):
        """Each agent template must define its Process."""
        for agent_file in self.AGENT_FILES:
            content = (SKILL_DIR / agent_file).read_text(encoding="utf-8")
            assert "## Process" in content, f"{agent_file} missing ## Process section"

    def test_agent_files_have_output_or_guidelines(self):
        """Each agent template must define output format or guidelines."""
        for agent_file in self.AGENT_FILES:
            content = (SKILL_DIR / agent_file).read_text(encoding="utf-8")
            has_output = "## Output" in content or "## Guidelines" in content
            assert has_output, f"{agent_file} missing ## Output or ## Guidelines section"

    def test_eval_schemas_exist(self):
        """Evaluation schemas reference file must exist."""
        path = SKILL_DIR / "references/eval-schemas.md"
        assert path.exists(), "Missing references/eval-schemas.md"

    def test_eval_schemas_has_required_schemas(self):
        """Schemas file must define evals, grading, benchmark, and comparison."""
        content = (SKILL_DIR / "references/eval-schemas.md").read_text(encoding="utf-8")
        for schema in ["evals.json", "grading.json", "benchmark.json", "comparison.json"]:
            assert schema in content, f"Missing schema definition: {schema}"


class TestSupportingFilesReferenced:
    """Test that all supporting files are referenced in SKILL.md."""

    def test_agent_templates_referenced(self):
        """All agent templates must be listed in Supporting Files."""
        text = _read_skill()
        for agent in ["skill-grader.md", "skill-comparator.md",
                       "skill-analyzer.md", "description-tester.md"]:
            assert agent in text, f"Agent {agent} not referenced in SKILL.md"

    def test_eval_schemas_referenced(self):
        """Eval schemas must be referenced in Supporting Files."""
        text = _read_skill()
        assert "eval-schemas.md" in text
