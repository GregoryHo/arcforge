from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-finishing/SKILL.md")
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


def test_arc_finishing_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-finishing"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text


def test_arc_finishing_contains_required_sections():
    text = _read_skill()

    # Must present exactly 4 options
    assert "1. Merge" in text
    assert "2. Push and create a Pull Request" in text or "2. Create PR" in text
    assert "3. Keep" in text
    assert "4. Discard" in text

    # Must require typed "discard" confirmation
    assert "Type 'discard' to confirm" in text

    # Must have Quick Reference table
    assert "## Quick Reference" in text

    # Must have check/warning markers in Quick Reference
    assert "✓" in text

    # No cleanup for Option 2 (keep worktree)
    assert "Keep worktree until PR merged" in text

    # Must not use this for epic worktrees
    assert ".arcforge-epic" in text
