from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-maintaining-obsidian/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def _read_reference(name: str) -> str:
    ref_path = Path(f"skills/arc-maintaining-obsidian/references/{name}")
    return ref_path.read_text(encoding="utf-8")


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


# --- Frontmatter ---


def test_frontmatter_valid():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-maintaining-obsidian"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024
    assert "@" not in text


# --- Three Modes ---


def test_has_three_modes():
    """Skill must define ingest, query, and audit modes."""
    text = _read_skill().lower()
    assert "mode: ingest" in text or "## mode: ingest" in text
    assert "mode: query" in text or "## mode: query" in text
    assert "mode: audit" in text or "## mode: audit" in text


def test_has_mode_selection():
    """Skill must explain how to pick the right mode."""
    text = _read_skill().lower()
    assert "mode selection" in text


# --- Ingest Mode ---


def test_ingest_has_classify_confirm_create_pipeline():
    """Ingest must follow classify > confirm > create > propagate pipeline."""
    text = _read_skill().lower()
    assert "classify" in text
    assert "confirm" in text
    assert "create" in text
    assert "propagate" in text


def test_ingest_has_propagate_step():
    """Ingest must have PROPAGATE for cross-page updates (Karpathy Gap 1)."""
    text = _read_skill().lower()
    assert "propagate" in text
    assert "propose" in text
    assert "10 pages" in text or "cap at 10" in text or "scope guard" in text


def test_ingest_has_contradiction_detection():
    """Ingest PROPAGATE must detect contradictions (Karpathy Gap 2)."""
    text = _read_skill().lower()
    assert "contradiction" in text or "conflict" in text


def test_ingest_has_page_types():
    """Ingest must reference all 6 Karpathy page types."""
    text = _read_skill().lower()
    for page_type in ["source", "entity", "synthesis", "moc", "decision", "log"]:
        assert page_type in text, f"missing page type: {page_type}"


def test_ingest_has_fast_path():
    text = _read_skill().lower()
    assert "fast path" in text or "fast-path" in text


def test_ingest_has_query_as_ingest():
    text = _read_skill().lower()
    assert "query-as-ingest" in text or "file this back" in text


def test_ingest_has_batch_mode():
    text = _read_skill().lower()
    assert "--batch" in text or "batch mode" in text


def test_ingest_batch_skips_propagate():
    """Batch mode must skip PROPAGATE to avoid explosion."""
    text = _read_skill().lower()
    assert "skip propagate" in text or "skip propagat" in text


def test_ingest_has_link_on_create():
    text = _read_skill().lower()
    assert "--link" in text


def test_ingest_has_raw_source_ingest():
    text = _read_skill().lower()
    assert "raw source" in text


def test_ingest_has_three_artifact_tiers():
    text = _read_skill().lower()
    assert "tier 1" in text or "markdown" in text
    assert "canvas" in text
    assert "excalidraw" in text or "arc-diagramming" in text


# --- Query Mode ---


def test_query_has_orient_search_read_synthesize_pipeline():
    text = _read_skill().lower()
    assert "orient" in text
    assert "search" in text
    assert "synthesize" in text


def test_query_has_vault_only_answers():
    text = _read_skill().lower()
    assert "vault-only" in text or "never fall back" in text


def test_query_has_inline_citations():
    text = _read_skill().lower()
    assert "citation" in text and "[[" in text


def test_query_has_file_back():
    text = _read_skill().lower()
    assert "file back" in text or "file-back" in text


def test_query_file_back_triggers_ingest_internally():
    """File back must trigger ingest mode internally, no skill handoff."""
    text = _read_skill().lower()
    assert "internally" in text or "no handoff" in text


def test_query_has_output_diversity():
    """Query must support Marp and Canvas output (Karpathy Gap 3)."""
    text = _read_skill().lower()
    ref = _read_reference("search-strategies.md").lower()
    combined = text + ref
    assert "marp" in combined
    assert "canvas" in combined


# --- Audit Mode ---


def test_audit_has_link_lint_grow_pipeline():
    text = _read_skill().lower()
    assert "link" in text
    assert "lint" in text
    assert "grow" in text


def test_audit_link_resolves_wikilinks():
    text = _read_skill().lower()
    assert "wikilink" in text or "[[" in text


def test_audit_link_has_single_file_mode():
    text = _read_skill().lower()
    assert "--file=" in text or "single-file" in text or "link --file" in text


def test_audit_lint_has_evolve_checks():
    """LINT must include EVOLVE checks for schema evolution (Karpathy Gap 5)."""
    text = _read_skill().lower()
    ref = _read_reference("audit-checks.md").lower()
    combined = text + ref
    assert "evolve" in combined
    assert "field usage" in combined or "type fit" in combined or "tag drift" in combined


def test_audit_lint_generates_index():
    text = _read_skill().lower()
    ref = _read_reference("audit-checks.md").lower()
    combined = text + ref
    assert "index.md" in combined


def test_audit_grow_has_outward_suggestions():
    """GROW must suggest external sources and questions (Karpathy Gap 4)."""
    text = _read_skill().lower()
    ref = _read_reference("audit-checks.md").lower()
    combined = text + ref
    assert "external" in combined
    assert "search term" in combined or "investigate" in combined


def test_audit_grow_never_auto_creates():
    text = _read_skill().lower()
    assert "propose" in text or "never auto-create" in text or "never auto-fetch" in text


def test_audit_has_batch_mode():
    text = _read_skill().lower()
    assert "50" in text and ("recent" in text or "default" in text)
    assert "--all" in text


# --- Shared Context ---


def test_has_session_log():
    text = _read_skill().lower()
    assert "log.md" in text and ("session log" in text or "dual-write" in text)


def test_delegates_to_obsidian_skills():
    text = _read_skill()
    assert "obsidian-markdown" in text or "obsidian:obsidian-markdown" in text
    assert "json-canvas" in text or "obsidian:json-canvas" in text
    assert "obsidian-cli" in text or "obsidian:obsidian-cli" in text


def test_delegates_to_diagramming():
    text = _read_skill()
    assert "arc-diagramming-obsidian" in text


def test_has_obsidian_cli_path_safety():
    text = _read_skill().lower()
    assert "file=" in text and "path=" in text


def test_has_completion_and_blocked_formats():
    text = _read_skill()
    assert "✅" in text
    assert "⚠️" in text


# --- Reference Files Exist ---


def test_reference_page_templates_exists():
    ref = _read_reference("page-templates.md")
    assert "## Source" in ref
    assert "## Entity" in ref
    assert "## Synthesis" in ref
    assert "## MOC" in ref
    assert "## Decision" in ref
    assert "## Log" in ref


def test_reference_audit_checks_exists():
    ref = _read_reference("audit-checks.md")
    assert "## LINK Checks" in ref
    assert "## LINT Checks" in ref
    assert "## GROW Thresholds" in ref


def test_reference_search_strategies_exists():
    ref = _read_reference("search-strategies.md")
    assert "Search Strategy" in ref
    assert "Output Format" in ref
