from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-receiving-review/SKILL.md")
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


def test_arc_receiving_review_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-receiving-review"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text


def test_arc_receiving_review_contains_required_sections():
    text = _read_skill()

    # Must have technical rigor mandate
    assert "technical rigor" in text.lower() or "Technical correctness" in text

    # Must have verification-first rule
    assert "Verify before implementing" in text

    # Must have forbidden responses
    assert "Forbidden Responses" in text

    # Must have pushback guidance
    assert "When To Push Back" in text

    # Must reference YAGNI
    assert "YAGNI" in text
