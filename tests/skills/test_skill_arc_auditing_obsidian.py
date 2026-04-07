from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-auditing-obsidian/SKILL.md")
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


def test_arc_auditing_obsidian_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-auditing-obsidian"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024
    assert "@" not in text


def test_arc_auditing_obsidian_has_three_operations():
    """Auditor must define LINK, LINT, and GROW operations."""
    text = _read_skill().upper()
    assert "LINK" in text
    assert "LINT" in text
    assert "GROW" in text


def test_arc_auditing_obsidian_link_resolves_wikilinks():
    """LINK operation must resolve plain text to wikilinks."""
    text = _read_skill().lower()
    assert "wikilink" in text or "[[" in text


def test_arc_auditing_obsidian_lint_checks_schema():
    """LINT must check frontmatter schema compliance."""
    text = _read_skill().lower()
    assert "schema" in text or "frontmatter" in text
    assert "orphan" in text


def test_arc_auditing_obsidian_grow_proposes_only():
    """GROW must propose, never auto-create."""
    text = _read_skill().lower()
    assert "propose" in text or "suggest" in text


def test_arc_auditing_obsidian_has_invocation_commands():
    """Auditor must define invocation subcommands."""
    text = _read_skill().lower()
    assert "link" in text and "lint" in text and "grow" in text


def test_arc_auditing_obsidian_delegates_to_obsidian_cli():
    """Auditor must use obsidian-cli for vault operations."""
    text = _read_skill()
    assert "obsidian-cli" in text or "obsidian:obsidian-cli" in text


def test_arc_auditing_obsidian_has_batch_mode():
    """Auditor must support batching for large vaults."""
    text = _read_skill().lower()
    assert "batch" in text or "recent" in text


def test_arc_auditing_obsidian_has_completion_formats():
    """Auditor must have standard completion/blocked formats."""
    text = _read_skill()
    assert "✅" in text
    assert "⚠️" in text


def test_arc_auditing_obsidian_has_single_file_link():
    """Auditor must support single-file LINK mode for post-creation linking."""
    text = _read_skill().lower()
    assert "--file" in text and "single" in text.replace("single-file", "single file") or "--file" in text


def test_arc_auditing_obsidian_has_index_generation():
    """LINT must generate/update index.md for vault navigation."""
    text = _read_skill().lower()
    assert "index.md" in text and "index" in text


def test_arc_auditing_obsidian_has_log_validation():
    """LINT must validate log.md consistency."""
    text = _read_skill().lower()
    assert "log.md" in text and "log" in text


def test_arc_auditing_obsidian_grow_uses_link_failures():
    """GROW must use unresolved LINK mentions as entity candidates."""
    text = _read_skill().lower()
    assert "link failure" in text or "link couldn" in text or "unresolved" in text
