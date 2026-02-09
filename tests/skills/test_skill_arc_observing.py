# tests/skills/test_skill_arc_observing.py

from pathlib import Path

import pytest


def _read_skill():
    """Read the arc-observing SKILL.md file."""
    skill_path = Path("skills/arc-observing/SKILL.md")
    assert skill_path.exists(), f"SKILL.md not found at {skill_path}"
    return skill_path.read_text()


class TestArcObservingSkill:
    """Tests for arc-observing skill definition."""

    def test_skill_exists(self):
        """SKILL.md exists at expected path."""
        assert Path("skills/arc-observing/SKILL.md").exists()

    def test_has_frontmatter(self):
        """Has valid YAML frontmatter with required fields."""
        content = _read_skill()
        assert content.startswith("---\n"), "Must start with frontmatter delimiter"
        end_idx = content.index("\n---\n", 4)
        frontmatter = content[4:end_idx]

        assert "name: arc-observing" in frontmatter
        assert "description:" in frontmatter

    def test_description_starts_with_use_when(self):
        """Description follows arcforge convention: starts with 'Use when'."""
        content = _read_skill()
        end_idx = content.index("\n---\n", 4)
        frontmatter = content[4:end_idx]

        for line in frontmatter.split("\n"):
            if line.startswith("description:"):
                desc = line.split(":", 1)[1].strip()
                assert desc.startswith("Use when"), (
                    f"Description must start with 'Use when', got: {desc[:50]}"
                )
                break

    def test_has_quick_reference(self):
        """Has Quick Reference section with CLI commands."""
        content = _read_skill()
        assert "## Quick Reference" in content

    def test_has_instinct_cli_commands(self):
        """References instinct.js commands."""
        content = _read_skill()
        assert "instinct.js" in content
        assert "status" in content
        assert "confirm" in content
        assert "contradict" in content

    def test_has_daemon_commands(self):
        """References observer-daemon.sh commands."""
        content = _read_skill()
        assert "observer-daemon.sh" in content
        assert "start" in content
        assert "stop" in content

    def test_has_confidence_lifecycle(self):
        """Documents the confidence lifecycle."""
        content = _read_skill()
        assert "0.7" in content or "Auto-loaded" in content
        assert "0.15" in content or "Archived" in content or "archived" in content.lower()

    def test_has_observation_flow(self):
        """Documents how observations work."""
        content = _read_skill()
        assert "observations.jsonl" in content or "observation" in content.lower()

    def test_has_instinct_format(self):
        """Shows instinct file format."""
        content = _read_skill()
        assert "frontmatter" in content.lower() or "confidence:" in content

    def test_has_storage_section(self):
        """Documents storage structure."""
        content = _read_skill()
        assert "## Storage" in content or "~/.claude/" in content

    def test_has_when_to_use(self):
        """Has When to Use and When NOT to Use sections."""
        content = _read_skill()
        assert "## When to Use" in content
        assert "## When NOT to Use" in content

    def test_scripts_exist(self):
        """All referenced scripts exist."""
        scripts_dir = Path("skills/arc-observing/scripts")
        assert scripts_dir.exists(), "scripts/ directory must exist"

        expected_scripts = [
            "observer-daemon.sh",
            "observer-prompt.md",
            "instinct.js",
        ]
        for script in expected_scripts:
            assert (scripts_dir / script).exists(), f"Missing script: {script}"

    def test_daemon_is_executable(self):
        """observer-daemon.sh is executable."""
        daemon = Path("skills/arc-observing/scripts/observer-daemon.sh")
        assert daemon.exists()
        import os
        assert os.access(str(daemon), os.X_OK), "observer-daemon.sh must be executable"
