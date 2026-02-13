from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-using-worktrees/SKILL.md")
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


def test_arc_using_worktrees_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-using-worktrees"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "⚠️" in text


def test_arc_using_worktrees_contains_required_sections():
    text = _read_skill()

    # Must have .arcforge-epic creation
    assert ".arcforge-epic" in text
    assert 'echo "<epic-name>" > .arcforge-epic' in text

    # Must have auto-detect test command
    assert "Auto-detect" in text
    assert "npm test" in text
    assert "cargo test" in text
    assert "pytest" in text

    # Must have worktree context check
    assert "Worktree Context Check" in text
    assert "Already in a worktree" in text

    # Must have safety verification (.gitignore)
    assert ".gitignore" in text
