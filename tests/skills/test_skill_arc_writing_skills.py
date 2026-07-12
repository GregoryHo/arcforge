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


class TestEvaluationOwnedByArcEvaluating:
    """Eval/measurement is owned by arc-evaluating, not arc-writing-skills.

    The grading/comparison/analysis agents and eval-schemas were consolidated into
    skills/arc-evaluating/ — this skill must point there for structured evaluation
    and must not re-host its own eval agent templates.
    """

    def test_no_local_eval_agents(self):
        """arc-writing-skills must not carry its own eval agent templates."""
        assert not (SKILL_DIR / "agents").exists(), "eval agents should live in arc-evaluating"

    def test_points_to_arc_evaluating(self):
        """SKILL.md must direct structured evaluation to arc-evaluating."""
        assert "arc-evaluating" in _read_skill()

    def test_skill_grader_moved_to_arc_evaluating(self):
        """The discipline-skill rationalization grader now lives in arc-evaluating."""
        assert (Path("skills/arc-evaluating/agents/skill-grader.md")).exists()


class TestMatchFormToFailure:
    """The failure-to-form taxonomy must precede and scope the Bulletproofing toolbox."""

    def test_taxonomy_section_present(self):
        """SKILL.md must carry the 'Match the Form to the Failure' section."""
        assert "## Match the Form to the Failure" in _read_skill()

    def test_taxonomy_covers_shaping_form(self):
        """The taxonomy must map wrong-shaped output to a positive recipe/contract, not a prohibition."""
        text = _read_skill()
        assert "Positive recipe/contract" in text
        assert "Prohibition list" in text

    def test_two_form_rules_present(self):
        """Both form rules (no nuance clauses; exemptions don't scope) must be stated."""
        text = _read_skill()
        assert "No nuance clauses" in text
        assert "An exemption clause can't narrow scope" in text

    def test_empirical_prohibition_warning(self):
        """The counterintuitive result: a prohibition on a shaping failure is worse than no guidance."""
        assert "produces MORE of the unwanted" in _read_skill()

    def test_taxonomy_precedes_bulletproofing(self):
        """Taxonomy is placed before Bulletproofing so the toolbox reads as one row of it."""
        text = _read_skill()
        assert text.index("## Match the Form to the Failure") < text.index(
            "## Bulletproofing a Discipline Skill Against Rationalization"
        )

    def test_bulletproofing_scoped_to_discipline_row(self):
        """Bulletproofing must explicitly scope itself to the rule-skipping failure."""
        assert "This toolbox is for exactly one row of the table above" in _read_skill()


class TestMicroTestWordingTier:
    """The authoring-time wording micro-test tier sits before the full pressure-scenario eval."""

    def test_micro_test_section_present(self):
        """SKILL.md must carry the 'Micro-Test Wording Before Full Scenarios' section."""
        assert "### Micro-Test Wording Before Full Scenarios" in _read_skill()

    def test_no_guidance_control_mandatory(self):
        """The mandatory no-guidance control must be documented."""
        text = _read_skill()
        assert "no-guidance control" in text
        assert "5+ reps" in text

    def test_micro_test_does_not_replace_ship_gate(self):
        """Micro-test is authoring-time; arc-evaluating's k>=5 A/B remains the ship gate."""
        text = _read_skill()
        assert "does not replace the pressure scenarios or the ship gate" in text
        assert "A/B comparison (k ≥ 5) is the ship gate" in text


class TestGuidanceFormReferenceAndChecklist:
    """New reference file and GREEN-checklist items for both mechanisms."""

    def test_reference_file_exists(self):
        """The deep-dive reference file must exist as a sibling of SKILL.md."""
        assert (SKILL_DIR / "guidance-form-and-wording-tests.md").exists()

    def test_reference_pointer_in_skill(self):
        """SKILL.md must point to the reference file (sibling convention, not @-load)."""
        assert "guidance-form-and-wording-tests.md" in _read_skill()

    def test_green_checklist_form_item(self):
        """GREEN checklist must include the guidance-form-matches-failure item."""
        assert (
            "- [ ] Guidance form matches the failure type (see Match the Form to the Failure)"
            in _read_skill()
        )

    def test_green_checklist_micro_test_item(self):
        """GREEN checklist must include the wording micro-test item."""
        assert "micro-tested against a no-guidance control before the full eval" in _read_skill()
