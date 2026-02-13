from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-dispatching-parallel/SKILL.md")
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


def test_arc_dispatching_parallel_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-dispatching-parallel"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "⚠️" in text


def test_arc_dispatching_parallel_contains_required_sections():
    text = _read_skill()

    # Must have "The Pattern" section
    assert "## The Pattern" in text

    # Must have "DAG-Based Workflow" section
    assert "## DAG-Based Workflow" in text

    # Must have independence checks
    assert "Independence checks" in text
    assert "No shared dependencies" in text

    # Must have conflict guidance
    assert "conflicts found" in text.lower()

    # Must have "Without DAG" section
    assert "Without DAG" in text
