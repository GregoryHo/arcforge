from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-agent-driven/SKILL.md")
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


def test_arc_agent_driven_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-agent-driven"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text


def test_arc_agent_driven_contains_required_sections():
    text = _read_skill()

    # Must have process flowchart
    assert "digraph process" in text

    # Must have prompt template references
    assert "implementer-prompt.md" in text
    assert "spec-reviewer-prompt.md" in text
    assert "code-quality-reviewer-prompt.md" in text

    # Must have max review cycles guidance
    assert "Max review cycles" in text

    # Must reference two-stage review
    assert "spec compliance" in text.lower()
    assert "code quality" in text.lower()

    # Must reference subagent dispatch
    assert "subagent" in text.lower()
