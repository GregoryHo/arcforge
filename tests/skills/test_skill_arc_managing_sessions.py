from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-managing-sessions/SKILL.md")
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


def test_arc_managing_sessions_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-managing-sessions"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @ symbols in skill content
    assert "@" not in text


def test_arc_managing_sessions_has_subcommands():
    """Test skill documents save, resume, list, and alias operations."""
    text = _read_skill()

    # Must document all four operations
    assert "save" in text.lower()
    assert "resume" in text.lower()
    assert "list" in text.lower()
    assert "alias" in text.lower()


def test_arc_managing_sessions_has_enrichment():
    """Test skill requires enrichment content, not mechanical script execution."""
    text = _read_skill()

    # Must mention enrichment or reflection
    assert "enrich" in text.lower() or "reflect" in text.lower()

    # Must mention what worked / what failed
    assert "What Worked" in text or "what worked" in text.lower()
    assert "What Failed" in text or "what failed" in text.lower()


def test_arc_managing_sessions_has_session_paths():
    """Test skill documents session file storage layout."""
    text = _read_skill()

    # Must reference session storage path
    assert "~/.claude/sessions" in text or ".claude/sessions" in text

    # Must reference aliases.json
    assert "aliases.json" in text


def test_arc_managing_sessions_has_wait_rule():
    """Test skill enforces waiting for user confirmation after resume."""
    text = _read_skill()

    # Must explicitly say to wait after resume
    assert "wait" in text.lower() and "confirm" in text.lower()
