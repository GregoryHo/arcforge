from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-writing-obsidian/SKILL.md")
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


def test_arc_writing_obsidian_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-writing-obsidian"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024
    assert "@" not in text


def test_arc_writing_obsidian_has_page_types():
    """Writer must define all 6 Karpathy page types."""
    text = _read_skill()
    for page_type in ["source", "entity", "synthesis", "moc", "decision", "log"]:
        assert page_type.lower() in text.lower(), f"missing page type: {page_type}"


def test_arc_writing_obsidian_has_classify_confirm_create_pipeline():
    """Writer must follow classify > confirm > create pipeline."""
    text = _read_skill().lower()
    assert "classify" in text
    assert "confirm" in text
    assert "create" in text or "template" in text


def test_arc_writing_obsidian_has_fast_path():
    """Writer must support fast path for unambiguous classification."""
    text = _read_skill().lower()
    assert "fast path" in text or "fast-path" in text


def test_arc_writing_obsidian_has_frontmatter_schema():
    """Writer must define opinionated frontmatter templates."""
    text = _read_skill()
    assert "type:" in text
    assert "created:" in text
    assert "tags:" in text


def test_arc_writing_obsidian_delegates_to_obsidian_skills():
    """Writer must delegate to kepano's obsidian skills."""
    text = _read_skill()
    assert "obsidian-markdown" in text or "obsidian:obsidian-markdown" in text
    assert "json-canvas" in text or "obsidian:json-canvas" in text


def test_arc_writing_obsidian_has_completion_formats():
    """Writer must have standard completion/blocked formats."""
    text = _read_skill()
    assert "✅" in text
    assert "⚠️" in text


def test_arc_writing_obsidian_no_vault_awareness():
    """Writer must NOT resolve wikilinks — that's the auditor's job."""
    text = _read_skill().lower()
    assert "plain text" in text and "relationship" in text
