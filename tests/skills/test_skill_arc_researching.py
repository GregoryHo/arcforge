from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-researching/SKILL.md")
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


def test_arc_researching_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-researching"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @ symbols in skill content
    assert "@" not in text


def test_arc_researching_has_hypothesis_driven_loop():
    """Test skill documents the autonomous experiment loop."""
    text = _read_skill()

    # Must document hypothesis-driven approach
    assert "hypothes" in text.lower()

    # Must document the experiment loop
    assert "LOOP" in text or "loop" in text.lower()

    # Must document baseline establishment
    assert "baseline" in text.lower()


def test_arc_researching_has_research_config():
    """Test skill documents the research contract."""
    text = _read_skill()

    # Must reference research-config.md
    assert "research-config.md" in text

    # Must reference results tracking
    assert "results.tsv" in text


def test_arc_researching_has_revert_on_failure():
    """Test skill enforces reverting failed experiments."""
    text = _read_skill()

    # Must document revert behavior
    assert "revert" in text.lower() or "reset" in text.lower()

    # Must document decision rules
    assert "improved" in text.lower() or "keep" in text.lower()
    assert "discard" in text.lower() or "worse" in text.lower()


def test_arc_researching_has_stuck_protocol():
    """Test skill documents what to do when stuck."""
    text = _read_skill()

    # Must have stuck/direction-change protocol
    assert "stuck" in text.lower() or "direction" in text.lower()

    # Must mention iron laws or immutable evaluation
    assert "Iron Law" in text or "NEVER modify" in text or "immutable" in text.lower()


def test_arc_researching_has_completion_format():
    """Test skill has structured completion output."""
    text = _read_skill()

    # Must have completion format
    assert "RESEARCH COMPLETE" in text or "Completion Format" in text
