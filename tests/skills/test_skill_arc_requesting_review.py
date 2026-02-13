from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-requesting-review/SKILL.md")
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


def test_arc_requesting_review_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-requesting-review"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text


def test_arc_requesting_review_contains_required_sections():
    text = _read_skill()

    # Must have review request format with placeholders
    assert "{WHAT_WAS_IMPLEMENTED}" in text
    assert "{BASE_SHA}" in text
    assert "{HEAD_SHA}" in text

    # Must reference arc-receiving-review
    assert "arc-receiving-review" in text

    # Must have review frequency guidance
    assert "review after EACH task" in text or "review after each" in text.lower()

    # Must reference code-reviewer dispatch
    assert "code-reviewer" in text
