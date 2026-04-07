from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-querying-obsidian/SKILL.md")
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


def test_arc_querying_obsidian_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-querying-obsidian"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024
    assert "@" not in text


def test_arc_querying_obsidian_has_pipeline():
    """Querier must define Orient > Search > Read > Synthesize > File Back pipeline."""
    text = _read_skill().lower()
    assert "orient" in text
    assert "search" in text
    assert "synthesize" in text
    assert "file back" in text


def test_arc_querying_obsidian_reads_index_first():
    """Querier must read index.md for vault orientation before searching."""
    text = _read_skill().lower()
    assert "index.md" in text
    assert "orient" in text


def test_arc_querying_obsidian_uses_inline_citations():
    """Querier must cite wiki pages using [[wikilinks]] inline."""
    text = _read_skill()
    assert "[[" in text
    assert "citation" in text.lower()


def test_arc_querying_obsidian_vault_only_answers():
    """Querier must only answer from vault — no general knowledge fallback."""
    text = _read_skill().lower()
    assert "vault-only" in text or "only answer from vault" in text
    assert "gap" in text


def test_arc_querying_obsidian_delegates_to_obsidian_cli():
    """Querier must use obsidian-cli for vault operations."""
    text = _read_skill()
    assert "obsidian-cli" in text or "obsidian:obsidian-cli" in text


def test_arc_querying_obsidian_file_back_delegates_to_writer():
    """File-back must delegate to arc-writing-obsidian Query-as-Ingest."""
    text = _read_skill().lower()
    assert "arc-writing-obsidian" in text
    assert "query-as-ingest" in text


def test_arc_querying_obsidian_has_session_log():
    """Querier must append query activity to log.md."""
    text = _read_skill().lower()
    assert "log.md" in text
    assert "query" in text


def test_arc_querying_obsidian_has_search_strategies():
    """Querier must define search strategies for different question types."""
    text = _read_skill().lower()
    assert "what do i know" in text or "topic" in text
    assert "relate" in text or "relationship" in text
    assert "latest" in text or "recent" in text


def test_arc_querying_obsidian_has_output_formats():
    """Querier must adapt output format to question type."""
    text = _read_skill().lower()
    assert "table" in text
    assert "timeline" in text or "chronological" in text


def test_arc_querying_obsidian_has_completion_formats():
    """Querier must have standard completion/blocked formats."""
    text = _read_skill()
    assert "✅" in text
    assert "⚠️" in text


def test_arc_querying_obsidian_suggests_ingest_on_gaps():
    """When vault has no results, querier must suggest ingesting via writer."""
    text = _read_skill().lower()
    assert "no notes about" in text or "no relevant notes" in text
    assert "ingest" in text or "arc-writing-obsidian" in text
