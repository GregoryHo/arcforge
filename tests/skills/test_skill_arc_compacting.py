from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-compacting/SKILL.md")
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


def test_arc_compacting_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-compacting"
    assert front.get("description", "").startswith("Guide for")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @ symbols in skill content
    assert "@" not in text


def test_arc_compacting_has_phase_boundary_guidance():
    """Test skill guides compaction at workflow phase boundaries."""
    text = _read_skill()

    # Must reference phase transitions
    assert "phase" in text.lower()

    # Must have decision guide for when to compact
    assert "Decision Guide" in text or "When to Use" in text

    # Must mention what persists vs what's lost
    assert "Persists" in text or "Survives" in text


def test_arc_compacting_has_pre_post_compact_steps():
    """Test skill has before/during/after compacting guidance."""
    text = _read_skill()

    # Must mention running diary before compacting
    assert "/diary" in text or "diary" in text.lower()

    # Must mention arcforge reboot after compacting
    assert "arcforge reboot" in text

    # Must mention saving/persisting state before compact
    assert "commit" in text.lower() or "persist" in text.lower()


def test_arc_compacting_references_related_skills():
    """Test skill references relevant arcforge components."""
    text = _read_skill()

    # Must reference compact-suggester hook
    assert "compact-suggester" in text

    # Must reference at least one other skill
    assert "arc-agent-driven" in text or "arc-planning" in text
