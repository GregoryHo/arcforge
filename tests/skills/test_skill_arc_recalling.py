"""Tests for arc-recalling skill (manual instinct creation)."""
from pathlib import Path


SKILL_PATH = Path("skills/arc-recalling/SKILL.md")


def _read_skill():
    return SKILL_PATH.read_text()


class TestArcRecallingSkill:
    """Verify arc-recalling skill structure and content."""

    def test_skill_exists(self):
        """SKILL.md exists."""
        assert SKILL_PATH.exists(), "skills/arc-recalling/SKILL.md must exist"

    def test_has_frontmatter(self):
        """Has valid YAML frontmatter."""
        content = _read_skill()
        assert content.startswith("---\n")
        assert "\nname: arc-recalling" in content
        assert "\ndescription: " in content

    def test_description_starts_with_use_when(self):
        """Description follows convention."""
        content = _read_skill()
        lines = content.split("\n")
        for line in lines:
            if line.startswith("description: "):
                desc = line.replace("description: ", "")
                assert desc.startswith("Use when"), f"Description must start with 'Use when': {desc}"
                break

    def test_has_quick_reference(self):
        """Has Quick Reference table."""
        content = _read_skill()
        assert "## Quick Reference" in content

    def test_references_recall_script(self):
        """References recall.js script."""
        content = _read_skill()
        assert "recall.js" in content

    def test_has_workflow_steps(self):
        """Documents the workflow."""
        content = _read_skill()
        # Should have steps for: receive input, infer fields, preview, confirm, save
        assert "trigger" in content.lower()
        assert "domain" in content.lower()
        assert "instinct" in content.lower()

    def test_uses_instinct_writer(self):
        """References instinct-writer or saveInstinct."""
        content = _read_skill()
        assert "instinct-writer" in content or "saveInstinct" in content or "save" in content.lower()

    def test_has_when_to_use(self):
        """Has When to Use section."""
        content = _read_skill()
        assert "## When to Use" in content

    def test_has_when_not_to_use(self):
        """Has When NOT to Use section."""
        content = _read_skill()
        assert "## When NOT to Use" in content or "NOT" in content

    def test_mentions_confidence(self):
        """Mentions starting confidence."""
        content = _read_skill()
        assert "0.50" in content or "confidence" in content.lower()

    def test_scripts_dir_exists(self):
        """Scripts directory exists."""
        scripts_dir = Path("skills/arc-recalling/scripts")
        assert scripts_dir.exists(), "scripts/ directory must exist"

    def test_recall_script_exists(self):
        """recall.js exists."""
        script = Path("skills/arc-recalling/scripts/recall.js")
        assert script.exists(), "recall.js must exist"
