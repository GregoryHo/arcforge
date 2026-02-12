from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-verifying/SKILL.md")
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


def test_arc_verifying_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-verifying"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "❌" in text


def test_arc_verifying_contains_required_sections():
    text = _read_skill()

    # Must have evidence-first verification (The Iron Law)
    assert "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE" in text

    # Must have the gate function
    assert "The Gate Function" in text

    # Must have completion criteria patterns
    assert "Common Failures" in text

    # Must have rationalization prevention
    assert "Rationalization Prevention" in text

    # Must be a mindset, not a procedure
    assert "MINDSET" in text

    # Must have key patterns with correct/incorrect examples
    assert "Key Patterns" in text
