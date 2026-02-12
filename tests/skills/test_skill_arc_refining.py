from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-refining/SKILL.md")
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


def test_arc_refining_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    # Frontmatter validation
    assert front.get("name") == "arc-refining"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @-syntax file loading
    assert "@" not in text

    # Standardized completion/blocked markers
    assert "✅" in text
    assert "⚠️" in text



def test_arc_refining_contains_required_sections():
    text = _read_skill()

    # Must have quality checklist (replaced quality dimensions)
    assert "checklist" in text.lower()
    assert "acceptance criteria" in text.lower()

    # Must have workflow guidance (replaced hard iteration requirements)
    assert "workflow guidance" in text.lower() or "clarifying questions" in text.lower()

    # Must specify output format
    assert "spec.xml" in text.lower()
    assert "specs/details" in text.lower() or "details/*.xml" in text.lower()

    # Must have self-validation
    assert "validation" in text.lower() or "validate" in text.lower()

    # Must emphasize Source of Truth
    assert "source of truth" in text.lower()
