from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-tdd/SKILL.md")
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


def test_arc_tdd_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-tdd"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text


def test_arc_tdd_contains_required_sections():
    text = _read_skill()

    # Must have RED/GREEN/REFACTOR cycle
    assert "## Red-Green-Refactor" in text
    assert "### RED" in text
    assert "### GREEN" in text or "### Verify GREEN" in text
    assert "### REFACTOR" in text

    # Must have test-first mandate (The Iron Law)
    assert "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST" in text

    # Must have verification checklist
    assert "Verification Checklist" in text

    # Must have common rationalizations
    assert "Common Rationalizations" in text

    # Must reference TDD cycle diagram
    assert "digraph tdd_cycle" in text
