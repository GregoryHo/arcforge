from pathlib import Path
import re


def _read_skill() -> str:
    skill_path = Path("skills/arc-writing-tasks/SKILL.md")
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


def test_arc_writing_tasks_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-writing-tasks"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "⚠️" in text

    word_count = len(re.findall(r"\b\w+\b", text))
    assert word_count <= 500


def test_arc_writing_tasks_contains_required_sections():
    text = _read_skill()

    # Must have bite-sized task concept
    assert "bite" in text.lower() or "2-5" in text

    # Must mention TDD
    assert "tdd" in text.lower() or "test" in text.lower()

    # Must have exact code requirement
    assert "exact" in text.lower()

    # Must have task format
    assert "task" in text.lower()
