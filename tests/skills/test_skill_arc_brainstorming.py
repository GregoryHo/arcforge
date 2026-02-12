from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-brainstorming/SKILL.md")
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


def test_arc_brainstorming_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-brainstorming"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @ symbols in skill content
    assert "@" not in text

    # Standardized prompt blocks required
    assert "✅" in text
    assert "⚠️" in text



def test_arc_brainstorming_contains_2_action_rule():
    text = _read_skill()

    # Must mention 2-Action Rule
    assert "2" in text and ("action" in text.lower() or "search" in text.lower())

    # Must mention output location
    assert "docs/plans" in text

    # Must mention design document output
    assert "design" in text.lower()


def test_arc_brainstorming_has_yagni_protection():
    """Test skill has YAGNI protection mechanisms."""
    text = _read_skill()

    # Must have YAGNI as key principle
    assert "YAGNI" in text

    # Must have red flags against feature creep
    assert "## Red Flags" in text or "Red Flags" in text

    # Must have rationalization table
    assert "| Excuse | Reality |" in text or "Rationalization" in text


def test_arc_brainstorming_has_one_question_rule():
    """Test skill enforces one question at a time."""
    text = _read_skill()

    # One question at a time must be explicit
    assert "one question at a time" in text.lower() or "one question per message" in text.lower()


def test_arc_brainstorming_has_arcforge_features():
    """Test skill has arcforge specific features."""
    text = _read_skill()

    # 2-Action Rule (arcforge specific)
    assert "2-Action Rule" in text or "2-Action" in text

    # REFINER_INPUT template
    assert "REFINER_INPUT" in text

    # Completion formats
    assert "✅" in text
    assert "⚠️" in text
