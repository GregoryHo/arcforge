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
    """Batch mode must skip Index and PROPAGATE to avoid explosion."""
    text = _read_skill().lower()
    assert "skip" in text and "propagate" in text


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


def test_ingest_pipeline_includes_visuals_step():
    """Ingest pipeline must include Visuals step between Create and Index."""
    text = _read_skill()
    pipeline_line = [l for l in text.splitlines() if "Classify" in l and "Index" in l]
    assert pipeline_line, "pipeline diagram line must exist"
    assert "Visuals" in pipeline_line[0], "pipeline must include Visuals step"


def test_ingest_visuals_has_decision_tree():
    """Visuals step must have a decision framework, not just tier labels."""
    text = _read_skill().lower()
    assert "decision tree" in text or "q1:" in text or "q2:" in text
    assert "3+ named entities" in text or "3+ entities" in text


def test_ingest_visuals_has_conservative_default():
    """Visuals must default to skipping — noise diagrams are worse than none."""
    text = _read_skill().lower()
    assert "conservative" in text or "skip visuals" in text or "when in doubt" in text


def test_ingest_visuals_embed_is_deterministic():
    """Image embedding must be deterministic — no LLM judgment for embeds."""
    text = _read_skill().lower()
    assert "deterministic" in text or "no judgment" in text


def test_ingest_visuals_excalidraw_needs_confirmation():
    """Excalidraw must be a suggestion, not auto-generated."""
    text = _read_skill().lower()
    assert "suggest" in text and "excalidraw" in text
    assert "not auto-create" in text or "do not auto-create" in text or "suggest to user" in text


def test_page_templates_have_visual_guidance():
    """Each standalone page type in page-templates must have Visual Guidance."""
    ref = _read_reference("page-templates.md")
    for page_type in ["Source", "Paper", "Entity", "Synthesis", "MOC", "Decision", "Log"]:
        assert f"Visual Guidance — {page_type}" in ref, (
            f"page-templates.md must have Visual Guidance for {page_type}"
        )


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


# --- LINT Operational Robustness ---


def test_lint_has_verify_before_fix():
    """LINT must require verification of findings before applying fixes."""
    text = _read_skill().lower()
    has_verify = "verify before fix" in text or "verify" in text and "before fix" in text
    assert has_verify, "LINT must warn to verify findings before acting on them"


def test_lint_warns_about_yaml_multiline_format():
    """LINT must warn about YAML multi-line list format false positives."""
    ref = _read_reference("audit-checks.md").lower()
    has_yaml_warning = "multi-line" in ref or "multiline" in ref or "block" in ref
    has_indent_note = "indent" in ref or "  -" in ref
    assert has_yaml_warning, "audit-checks must warn about YAML multi-line format"
    assert has_indent_note, "audit-checks must show indented list syntax"


def test_lint_has_broken_link_resolution_strategy():
    """LINT must provide decision criteria for broken wikilinks."""
    text = _read_skill().lower()
    has_raw_source_check = "raw source" in text and ("backing" in text or "backed" in text)
    has_plain_text_option = "plain text" in text or "convert to plain" in text
    assert has_raw_source_check, "broken link resolution must check for Raw Source backing"
    assert has_plain_text_option, "broken link resolution must offer plain text conversion"


def test_lint_prohibits_unsourced_stub_entities():
    """LINT must not create entity notes without source backing."""
    text = _read_skill().lower()
    has_prohibition = (
        "never create stub" in text
        or "without source backing" in text
        or "unsourced stub" in text
        or "anti-pattern" in text
    )
    assert has_prohibition, "LINT must prohibit creating stub entities without sources"


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


# --- Bilingual Format ---


def test_page_templates_has_bilingual_format():
    """Page templates must define bilingual format rules."""
    ref = _read_reference("page-templates.md")
    assert "langs: [en, zh]" in ref, "universal frontmatter must include langs"
    assert "## Bilingual Format" in ref, "must have bilingual format section"
    assert "multi-lang-en" in ref, "must define English callout"
    assert "multi-lang-zh" in ref, "must define Chinese callout"


def test_page_templates_bilingual_in_universal_frontmatter():
    """langs field must be in the Universal Frontmatter section, not buried later."""
    ref = _read_reference("page-templates.md")
    universal_section_end = ref.find("## Source")
    universal_section = ref[:universal_section_end]
    assert "langs: [en, zh]" in universal_section, "langs must be in Universal Frontmatter, not a per-type afterthought"


def test_all_standalone_page_type_templates_have_bilingual():
    """Every standalone page type template must include callout structure.
    Log is excluded — it appends to daily notes, not a standalone file."""
    ref = _read_reference("page-templates.md")
    for page_type in ["Source", "Entity", "Synthesis", "MOC", "Decision"]:
        section_start = ref.find(f"## {page_type}")
        assert section_start != -1, f"missing section for {page_type}"
        next_section = ref.find("\n## ", section_start + 1)
        section = ref[section_start:next_section] if next_section != -1 else ref[section_start:]
        assert "multi-lang-en" in section, f"{page_type} template must have English callout"
        assert "multi-lang-zh" in section, f"{page_type} template must have Chinese callout"


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
    assert "Route Selection" in ref
    assert "QMD Route" in ref
    assert "Fallback Route" in ref
    assert "Output Format" in ref


# --- Multi-Vault Support (Vault Resolution + Registry Maintenance) ---


def _frontmatter_block(text: str) -> str:
    """Return raw frontmatter body (between the two --- fences)."""
    if not text.startswith("---\n"):
        raise AssertionError("missing frontmatter start")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise AssertionError("missing frontmatter end")
    return text[4:end]


def test_argument_hint_lists_registry_subcommands():
    """argument-hint must advertise the 5 registry maintenance subcommands."""
    text = _read_skill()
    front = _frontmatter_block(text)
    for sub in ["register", "list-vaults", "unregister", "set-default", "init-vault"]:
        assert sub in front, f"argument-hint must mention `{sub}` subcommand"


def test_argument_hint_mentions_vault_flag():
    """argument-hint must surface the --vault override flag."""
    text = _read_skill()
    front = _frontmatter_block(text)
    assert "--vault" in front, "argument-hint must mention --vault override flag"


def test_skill_has_vault_resolution_section():
    """SKILL.md must define vault resolution (replaces old 'Vault Path' section)."""
    text = _read_skill()
    assert "## Vault Resolution" in text or "### Vault Resolution" in text, (
        "SKILL.md must have a 'Vault Resolution' section documenting the multi-vault cascade"
    )


def test_vault_resolution_documents_cascade():
    """Vault Resolution must document the explicit override → active → session → default → ask cascade."""
    text = _read_skill().lower()
    assert "--vault" in text, "resolution must mention explicit override"
    assert "active obsidian" in text or "obsidian-cli vault" in text, (
        "resolution must mention active Obsidian detection"
    )
    assert "default" in text and "ask" in text, (
        "resolution must mention default fallback and ask-the-user fallback"
    )


def test_skill_has_registry_maintenance_section():
    """SKILL.md must document the registry maintenance subcommands."""
    text = _read_skill()
    assert "## Registry Maintenance" in text or "### Registry Maintenance" in text, (
        "SKILL.md must have a 'Registry Maintenance' section"
    )


def test_registry_path_documented():
    """SKILL.md must point at ~/.arcforge/obsidian-vaults.json registry location."""
    text = _read_skill()
    assert "obsidian-vaults.json" in text, "SKILL.md must reference the registry file"
    assert ".arcforge" in text, "SKILL.md must reference the ~/.arcforge/ location"


def test_registry_never_hand_edited():
    """SKILL.md must state the registry is skill-managed, not hand-edited."""
    text = _read_skill().lower()
    assert "never" in text and ("hand-edit" in text or "hand edit" in text or "skill-managed" in text or "managed by" in text), (
        "SKILL.md must state the registry is not hand-edited"
    )


def test_init_vault_documented():
    """init-vault is the headline 'fast adopt' command — must be documented."""
    text = _read_skill().lower()
    assert "init-vault" in text
    assert "starter" in text or "template" in text or "agents-md-template" in text


def test_agents_md_template_reference_exists():
    """The starter AGENTS.md template must exist as a reference file."""
    ref = _read_reference("agents-md-template.md")
    assert "<YYYY-MM-DD>" in ref, "template must contain date placeholder"
    assert "<Vault Name>" in ref, "template must contain vault name placeholder"
    assert "<TODO" in ref, "template must contain TODO markers for user customization"


def test_agents_md_template_has_three_layer_structure():
    """Template must mirror Karpathy's 3-layer pattern."""
    ref = _read_reference("agents-md-template.md")
    assert "Layer 1" in ref and "Raw Sources" in ref
    assert "Layer 2" in ref and "Wiki" in ref
    assert "Layer 3" in ref and "Schema" in ref


def test_agents_md_template_lists_default_note_types():
    """Template must list default note types so adopters know the starting set."""
    ref = _read_reference("agents-md-template.md")
    for note_type in ["Source", "Entity", "Synthesis", "MOC", "Decision", "Log"]:
        assert note_type in ref, f"template must mention `{note_type}` note type"


def test_agents_md_template_invites_divergence():
    """Template must explicitly invite users to customize / diverge."""
    ref = _read_reference("agents-md-template.md").lower()
    assert "edit" in ref or "diverge" in ref or "customize" in ref or "extend" in ref
