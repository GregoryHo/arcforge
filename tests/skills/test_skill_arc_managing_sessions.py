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
    assert set(front.keys()) == {"name", "description"}

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
    assert "~/.arcforge/sessions" in text or ".arcforge/sessions" in text

    # Must reference aliases.json
    assert "aliases.json" in text


def test_arc_managing_sessions_has_wait_rule():
    """Test skill enforces waiting for user confirmation after resume."""
    text = _read_skill()

    # Must explicitly say to wait after resume
    assert "wait" in text.lower() and "confirm" in text.lower()


def test_arc_managing_sessions_documents_handover():
    """Handover command must be a lean, file-writing primary path — no modes."""
    text = _read_skill().lower()

    # Old mode vocabulary must be gone — handover is now a single command, not three modes.
    assert "quick handover" not in text, "old mode label 'quick handover' must be removed"
    assert "full context summary" not in text, "old mode label 'full context summary' must be removed"
    assert "tail handover" not in text, "old mode label 'tail handover' must be removed"
    assert "continue-from-here" not in text, "old mode label 'continue-from-here' must be removed"
    assert "archive snapshot" not in text, "old mode label 'archive snapshot' must be removed"

    # Required new content: the handover artifact and command surface.
    assert "# handover:" in text, "missing example handover artifact title"
    assert "## what to do next" in text, "missing 'What to do next' section in handover artifact"
    assert "--next-step" in text, "missing --next-step CLI flag in docs"
    assert "--focus" in text, "missing --focus CLI flag in docs"
    assert "handover-{slug}.md" in text, "missing handover file naming convention"

    # Framing principle: handover is the frequent path, archive (save) is the rare one.
    assert "default = handover, not archive" in text


def test_arc_managing_sessions_distinguishes_handover_from_archive():
    """Archive should be reserved for durable future value, not every handoff."""
    text = _read_skill().lower()

    assert "handover is for immediate continuity" in text
    assert "archive is for durable future reference" in text
    assert "archive when" in text
    assert "do not archive when" in text
    assert "archive recommendation" in text


def test_arc_managing_sessions_archive_heuristics_cover_important_cases():
    """Archive heuristics should cover explicit requests, decisions, operations, and learning value."""
    text = _read_skill().lower()

    for phrase in [
        "user explicitly asks",
        "high decision density",
        "high operational value",
        "long-running multi-session work",
        "learning value",
    ]:
        assert phrase in text
