from pathlib import Path
import re


def _read_skill() -> str:
    skill_path = Path("skills/arc-implementing/SKILL.md")
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


def test_arc_implementing_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-implementing"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "⚠️" in text

    word_count = len(re.findall(r"\b\w+\b", text))
    assert word_count <= 500


def test_arc_implementing_contains_required_sections():
    text = _read_skill()

    # Must be an orchestrator that delegates
    assert "orchestrator" in text.lower() or "呼叫" in text.lower()
    
    # Must delegate to agent-driven (which handles TDD + two-stage review)
    assert "arc-agent-driven" in text.lower() or "agent-driven" in text.lower()
    
    # Must delegate to writing-tasks (for task breakdown)
    assert "arc-writing-tasks" in text.lower() or "writing-tasks" in text.lower()

    # Must have feature-by-feature flow
    assert "feature" in text.lower()

    # Must reference skills it delegates to
    assert "skills" in text.lower() or "delegate" in text.lower()
