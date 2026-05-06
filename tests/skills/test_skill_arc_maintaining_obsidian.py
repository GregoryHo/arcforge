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


def test_skill_does_not_ship_single_schema_template():
    """The single legacy schema-md-template.md was replaced by per-preset SCHEMA.md starters."""
    p = Path("skills/arc-maintaining-obsidian/references/schema-md-template.md")
    assert not p.exists(), (
        "references/schema-md-template.md must not exist — types live in "
        "per-preset SCHEMA.md under presets/<name>/SCHEMA.md"
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


# (schema-md-template removed — bilingual + per-type templates are vault-specific.)


# --- Reference Files Exist ---


def test_reference_page_templates_exists():
    """page-templates.md is now the generic Raw Source primitives reference."""
    ref = _read_reference("page-templates.md")
    assert "Raw Source" in ref, "page-templates must document Raw Source ingest"
    assert "sha256" in ref, "page-templates must document sha256 hashing"


def test_reference_audit_checks_exists():
    """audit-checks.md ships only mechanical primitives — LINK / LINT / GROW
    pattern detection. Thresholds and domain choices live in vault AGENTS.md."""
    ref = _read_reference("audit-checks.md")
    assert "## LINK" in ref, "audit-checks must document LINK mechanism"
    assert "## LINT" in ref, "audit-checks must document LINT mechanism"
    assert "## GROW" in ref, "audit-checks must document GROW pattern detection"
    # Confirm the "mechanism vs domain" framing is explicit
    assert "mechanism" in ref.lower() or "vault-declared" in ref.lower(), (
        "audit-checks must signal mechanism / vault-declared split"
    )


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


# --- Preset system: 4 paired starters under presets/ ---


PRESETS = ["minimal", "llm-wiki", "news", "project-tracker"]


def _read_preset(preset: str, file: str) -> str:
    p = Path(f"skills/arc-maintaining-obsidian/presets/{preset}/{file}")
    return p.read_text(encoding="utf-8")


def test_presets_directory_has_index_readme():
    p = Path("skills/arc-maintaining-obsidian/presets/README.md")
    assert p.exists(), "presets/README.md (index) must exist"
    text = p.read_text(encoding="utf-8")
    for preset in PRESETS:
        assert preset in text, f"presets/README.md must list `{preset}`"


def test_each_preset_has_agents_and_schema():
    """Each preset ships paired AGENTS.md + SCHEMA.md."""
    for preset in PRESETS:
        agents = Path(f"skills/arc-maintaining-obsidian/presets/{preset}/AGENTS.md")
        schema = Path(f"skills/arc-maintaining-obsidian/presets/{preset}/SCHEMA.md")
        assert agents.exists(), f"presets/{preset}/AGENTS.md must exist"
        assert schema.exists(), f"presets/{preset}/SCHEMA.md must exist"


def test_each_preset_has_substitution_placeholders():
    """init-vault substitutes <YYYY-MM-DD>, <Vault Name>, etc. before writing."""
    for preset in PRESETS:
        for fname in ("AGENTS.md", "SCHEMA.md"):
            ref = _read_preset(preset, fname)
            assert "<YYYY-MM-DD>" in ref, (
                f"presets/{preset}/{fname} must contain date placeholder"
            )
            assert "<Vault Name>" in ref, (
                f"presets/{preset}/{fname} must contain vault name placeholder"
            )


def test_each_preset_agents_has_schema_authority_baseline():
    """Every preset's AGENTS.md must ship the Schema Authority baseline rules."""
    required_phrases = [
        "Schema Authority",
        "schema_path",
        "Read SCHEMA.md before mutating",
        "Do not invent new note types",
        "conflict",
        "log entry",
    ]
    for preset in PRESETS:
        agents = _read_preset(preset, "AGENTS.md")
        for phrase in required_phrases:
            assert phrase in agents, (
                f"presets/{preset}/AGENTS.md must contain Schema Authority rule mentioning `{phrase}`"
            )


def _extract_schema_authority(text: str) -> str:
    """Pull the `## Schema Authority` block (until next H2) from a preset AGENTS.md."""
    import re
    m = re.search(r"(## Schema Authority\n.*?)\n## ", text, re.DOTALL)
    assert m is not None, "Schema Authority section must be followed by another H2"
    return m.group(1).strip()


def test_schema_authority_section_byte_identical_across_presets():
    """The Schema Authority baseline is the stable contract that governs how
    agents treat SCHEMA.md. It MUST be byte-identical across all 4 presets so
    that a contributor changing one wording cannot silently leave the others
    out of sync. If you want to change it, change all 4 files in the same diff."""
    sections = {
        preset: _extract_schema_authority(_read_preset(preset, "AGENTS.md"))
        for preset in PRESETS
    }
    canonical_preset = "minimal"
    canonical = sections[canonical_preset]
    drift = {
        preset: section
        for preset, section in sections.items()
        if section != canonical
    }
    assert not drift, (
        "Schema Authority drift detected — these presets diverged from minimal:\n"
        + "\n\n".join(f"--- {p} ---\n{s}" for p, s in drift.items())
    )


def test_each_preset_agents_has_preset_field_in_frontmatter():
    """Each preset's AGENTS.md frontmatter declares which preset bootstrapped the vault."""
    for preset in PRESETS:
        agents = _read_preset(preset, "AGENTS.md")
        front = _frontmatter_block(agents)
        assert f"preset: {preset}" in front, (
            f"presets/{preset}/AGENTS.md frontmatter must declare `preset: {preset}`"
        )


def test_minimal_preset_is_scaffold_with_todo():
    """Minimal preset is intentionally TODO-heavy — no preloaded types or thresholds."""
    schema = _read_preset("minimal", "SCHEMA.md")
    agents = _read_preset("minimal", "AGENTS.md")
    assert "<TODO" in schema, "minimal/SCHEMA.md must be TODO-driven"
    assert "<TODO" in agents, "minimal/AGENTS.md must be TODO-driven"


def test_llm_wiki_preset_declares_six_canonical_types():
    """llm-wiki preset's SCHEMA.md must define the Karpathy 6 types."""
    schema = _read_preset("llm-wiki", "SCHEMA.md")
    for note_type in ["Source", "Entity", "Synthesis", "MOC", "Decision", "Log"]:
        assert f"## {note_type}" in schema, (
            f"presets/llm-wiki/SCHEMA.md must define `## {note_type}` type"
        )


def test_llm_wiki_preset_has_paper_variant():
    schema = _read_preset("llm-wiki", "SCHEMA.md")
    assert "Paper Variant" in schema or "Paper variant" in schema, (
        "llm-wiki/SCHEMA.md must document the Source Paper variant"
    )


def test_llm_wiki_preset_adopts_raw_source_pattern():
    agents = _read_preset("llm-wiki", "AGENTS.md")
    front = _frontmatter_block(agents)
    assert "raw_source: adopted" in front, (
        "llm-wiki/AGENTS.md frontmatter must declare raw_source: adopted"
    )


def test_llm_wiki_preset_has_bilingual_callout_structure():
    schema = _read_preset("llm-wiki", "SCHEMA.md")
    assert "multi-lang-en" in schema, "llm-wiki/SCHEMA.md must define English callout"
    assert "multi-lang-zh" in schema, "llm-wiki/SCHEMA.md must define Chinese callout"


def test_news_preset_declares_news_types():
    schema = _read_preset("news", "SCHEMA.md")
    for note_type in ["Article", "DailyAggregate", "WeeklyAggregate", "Topic"]:
        assert f"## {note_type}" in schema, (
            f"presets/news/SCHEMA.md must define `## {note_type}` type"
        )


def test_news_preset_adopts_raw_source_pattern():
    agents = _read_preset("news", "AGENTS.md")
    front = _frontmatter_block(agents)
    assert "raw_source: adopted" in front, (
        "news/AGENTS.md frontmatter must declare raw_source: adopted"
    )


def test_project_tracker_preset_declares_project_types():
    schema = _read_preset("project-tracker", "SCHEMA.md")
    for note_type in ["Task", "Milestone", "Decision", "Sprint", "Project"]:
        assert f"## {note_type}" in schema, (
            f"presets/project-tracker/SCHEMA.md must define `## {note_type}` type"
        )


def test_project_tracker_preset_does_not_adopt_raw_source():
    agents = _read_preset("project-tracker", "AGENTS.md")
    front = _frontmatter_block(agents)
    assert "raw_source: not-adopted" in front, (
        "project-tracker/AGENTS.md must declare raw_source: not-adopted "
        "(work items are authored, not ingested from external originals)"
    )


def test_old_agents_md_template_no_longer_in_references():
    """The single-template agents-md-template.md was replaced by the presets system."""
    p = Path("skills/arc-maintaining-obsidian/references/agents-md-template.md")
    assert not p.exists(), (
        "references/agents-md-template.md must not exist — replaced by per-preset starters under presets/"
    )


# --- Domain Contract Orientation (AGENTS.md + SCHEMA.md dual-contract model) ---


def test_skill_has_domain_contract_orientation_section():
    """SKILL.md must define a Domain Contract Orientation gate after vault resolution."""
    text = _read_skill()
    assert "Domain Contract Orientation" in text, (
        "SKILL.md must have a Domain Contract Orientation section that runs after Vault Resolution"
    )


def test_domain_contract_reads_agents_and_schema():
    """Orientation must read AGENTS.md and (when referenced) SCHEMA.md."""
    text = _read_skill()
    assert "AGENTS.md" in text and "SCHEMA.md" in text, (
        "Domain Contract Orientation must mention both AGENTS.md and SCHEMA.md"
    )


def test_domain_contract_reads_recent_log_entries():
    """Orientation must read recent log.md entries (last 20-30) to load context."""
    text = _read_skill().lower()
    assert "20-30" in text or "last 20" in text or "last 30" in text, (
        "Domain Contract Orientation must specify reading the last 20-30 log entries"
    )


def _find_agents_missing_block(text: str) -> int:
    """Find the index of the AGENTS.md-missing handling block in SKILL.md."""
    lower = text.lower()
    for needle in ("agents.md is missing", "missing agents.md", "agents.md missing"):
        idx = lower.find(needle)
        if idx != -1:
            return idx
    return -1


def test_missing_agents_md_blocks_mutating_modes():
    """When AGENTS.md is missing, ingest and audit must be blocked."""
    text = _read_skill()
    idx = _find_agents_missing_block(text)
    assert idx != -1, "SKILL.md must discuss the AGENTS.md missing scenario"
    block = text[idx:idx + 1200].lower()
    assert "block" in block, "missing AGENTS.md must block at least one mode"
    assert "ingest" in block, "missing AGENTS.md handling must mention ingest"
    assert "audit" in block, "missing AGENTS.md handling must mention audit"


def test_missing_agents_md_allows_readonly_with_warning():
    """Read-only modes (query/help/bare invoke) must still run with warning."""
    text = _read_skill()
    # Anchor at the H3 heading so we get the Orientation section body, not an
    # earlier reference in the Mode Selection prose.
    dco_idx = text.find("### Domain Contract Orientation")
    if dco_idx == -1:
        dco_idx = text.find("## Domain Contract Orientation")
    assert dco_idx != -1, "Domain Contract Orientation section heading must exist"
    block = text[dco_idx:dco_idx + 4000].lower()
    assert "query" in block, (
        "Domain Contract Orientation must mention query as a mode that degrades gracefully"
    )
    assert "warn" in block, (
        "missing AGENTS.md must trigger a warning rather than a hard error for read-only modes"
    )
    assert "agents.md missing" in block or "agents.md is missing" in block, (
        "AGENTS.md missing scenario must be in the Orientation section"
    )


def test_missing_schema_md_blocks_mutating_modes():
    """When SCHEMA.md is missing, ingest and audit must also be blocked.
    AGENTS.md + SCHEMA.md form a paired contract; both are required for mutation."""
    text = _read_skill()
    # The orientation table covers both files; check SCHEMA.md missing guidance
    assert "SCHEMA.md missing" in text or "SCHEMA.md is missing" in text, (
        "SKILL.md must document SCHEMA.md missing scenario (paired contract)"
    )
    # Find Domain Contract Orientation block and check for SCHEMA.md blocking
    dco_idx = text.find("Domain Contract Orientation")
    assert dco_idx != -1
    block = text[dco_idx:dco_idx + 4000].lower()
    assert "schema.md" in block and ("block" in block or "ingest" in block), (
        "SCHEMA.md missing scenario must indicate mutating-mode behavior"
    )


# --- Command Split: Registry-level vs Vault-level ---


def test_argument_hint_does_not_advertise_orient_only_modes():
    """status / capabilities / describe-vault have been collapsed into bare-invoke
    orientation. The skill exposes only ingest / query / audit as vault-level modes,
    plus the 5 registry-level subcommands."""
    text = _read_skill()
    front = _frontmatter_block(text)
    for removed in ["status", "capabilities", "describe-vault"]:
        assert removed not in front, (
            f"argument-hint must not advertise `{removed}` — that role is served "
            "by bare invocation + Domain Contract Orientation."
        )


def test_skill_documents_three_universal_modes_only():
    """Mode Selection table must list exactly ingest / query / audit, not status/capabilities."""
    text = _read_skill()
    ms_idx = text.find("## Mode Selection")
    assert ms_idx != -1
    # Read until the next H2
    next_h2 = text.find("\n## ", ms_idx + 1)
    section = text[ms_idx:next_h2] if next_h2 != -1 else text[ms_idx:]
    assert "**ingest**" in section
    assert "**query**" in section
    assert "**audit**" in section
    assert "**status**" not in section, "Mode Selection must not list status"
    assert "**capabilities**" not in section, "Mode Selection must not list capabilities"


def test_bare_invoke_orient_response_documented():
    """Bare invocation must trigger Domain Contract Orientation and an orient response."""
    text = _read_skill().lower()
    assert "bare invoke" in text or "bare invocation" in text, (
        "SKILL.md must document the bare-invoke (no mode arg) behavior"
    )
    # Must explicitly tie bare invoke to Orientation, not to asking the user
    bare_idx = text.find("bare invoc")
    if bare_idx == -1:
        bare_idx = text.find("bare invoke")
    assert bare_idx != -1
    nearby = text[bare_idx:bare_idx + 600]
    assert "orient" in nearby, "bare invoke must run Domain Contract Orientation"


def test_help_section_splits_registry_and_vault_level():
    """Help section must split commands into Registry-level vs Vault-level groups."""
    text = _read_skill()
    assert "REGISTRY-LEVEL" in text or "Registry-level" in text, (
        "Help section must label the registry-level command group"
    )
    assert "VAULT-LEVEL" in text or "Vault-level" in text, (
        "Help section must label the vault-level command group"
    )


# --- Init-vault dual-write (AGENTS.md + SCHEMA.md) ---


def test_init_vault_writes_both_agents_and_schema_from_preset():
    """init-vault writes paired AGENTS.md + SCHEMA.md from the chosen preset."""
    text = _read_skill()
    bs_idx = text.find("init-vault Bootstrap")
    assert bs_idx != -1, "SKILL.md must document the init-vault Bootstrap workflow"
    block = text[bs_idx:]
    # Both files written
    assert "AGENTS.md" in block, "Bootstrap must mention writing AGENTS.md"
    assert "SCHEMA.md" in block, "Bootstrap must mention writing SCHEMA.md"
    # Preset-driven
    assert "preset" in block.lower(), "Bootstrap must mention preset selection"
    # All four canonical preset names appear somewhere in SKILL.md
    for preset in ["minimal", "llm-wiki", "news", "project-tracker"]:
        assert preset in text, f"SKILL.md must surface preset `{preset}`"


def test_argument_hint_includes_preset_flag():
    """init-vault argument-hint must advertise --preset=<name>."""
    text = _read_skill()
    front = _frontmatter_block(text)
    assert "--preset" in front, (
        "argument-hint must advertise --preset=<name> for init-vault"
    )


def test_skill_points_to_bootstrap_reference():
    """SKILL.md's init-vault section must point at references/bootstrap-workflow.md
    for the full 11-step workflow."""
    text = _read_skill()
    bs_idx = text.find("### init-vault Bootstrap")
    assert bs_idx != -1, "init-vault Bootstrap section heading must exist"
    end_idx = text.find("\n### ", bs_idx + len("### init-vault Bootstrap"))
    block = text[bs_idx:end_idx if end_idx != -1 else len(text)]
    assert "references/bootstrap-workflow.md" in block, (
        "SKILL.md init-vault Bootstrap section must point at references/bootstrap-workflow.md"
    )


def test_bootstrap_workflow_reference_documents_full_workflow():
    """references/bootstrap-workflow.md owns the full 11-step bootstrap; verify all phases are documented."""
    ref = _read_reference("bootstrap-workflow.md").lower()
    for phase in ["validate", "preset", "register", "log.md", "qmd", "agents.md", "schema.md"]:
        assert phase in ref, (
            f"references/bootstrap-workflow.md must document the `{phase}` step"
        )


def test_bootstrap_workflow_reference_authors_not_copies():
    """Bootstrap workflow must frame preset use as 'author from guidance', not 'copy + substitute'."""
    ref = _read_reference("bootstrap-workflow.md").lower()
    assert "author" in ref, (
        "bootstrap-workflow.md must use 'author' (LLM authors vault contract from preset guidance)"
    )
    assert (
        "one-shot" in ref
        or "not a template to copy" in ref
        or "not stamping templates" in ref
    ), (
        "bootstrap-workflow.md must clarify presets are one-shot authoring guidance, not stamping templates"
    )


def test_bootstrap_workflow_reference_has_worked_example():
    """The 'author from preset' framing is hard to internalize from rules alone — it needs a concrete worked example."""
    ref = _read_reference("bootstrap-workflow.md").lower()
    assert "worked example" in ref, (
        "bootstrap-workflow.md must include a worked example showing 'author from preset' concretely"
    )


# --- Raw Source sha256 hashing ---


def test_page_templates_raw_source_has_sha256_field():
    ref = _read_reference("page-templates.md")
    assert "sha256" in ref, "page-templates must declare sha256 in Raw Source frontmatter"
    assert "ingested" in ref, "page-templates must declare ingested date in Raw Source frontmatter"


def test_page_templates_documents_hashing_rule():
    ref = _read_reference("page-templates.md").lower()
    assert "hash" in ref and ("after frontmatter" in ref or "after the frontmatter" in ref), (
        "page-templates must explain that the body is hashed after the frontmatter is stripped"
    )


def test_skill_mentions_raw_source_hashing():
    text = _read_skill().lower()
    assert "hash" in text and "frontmatter" in text and "sha256" in text, (
        "SKILL.md must mention the hash-body-after-frontmatter rule and sha256"
    )


# --- Audit: Source Drift + vault-declared LINT extensibility ---


def test_audit_checks_has_source_drift():
    ref = _read_reference("audit-checks.md").lower()
    assert "source drift" in ref or "drift check" in ref, (
        "audit-checks must document a Source Drift check"
    )
    assert "sha256" in ref, "Source Drift check must rely on sha256 comparison"


def test_audit_checks_documents_vault_declared_lint():
    """Audit pipeline must read vault AGENTS.md and apply declared LINT thresholds."""
    ref = _read_reference("audit-checks.md").lower()
    assert "vault-declared" in ref or "declared in" in ref or "vault declares" in ref, (
        "audit-checks must document vault-declared LINT extensibility"
    )
    assert "agents.md" in ref, "audit-checks must reference reading vault AGENTS.md for thresholds"


# --- llm-wiki preset operational policy (the wiki-specific rules now live here) ---


def test_llm_wiki_preset_has_operational_policy_sections():
    """Wiki-specific operational policy must live in llm-wiki/AGENTS.md, not in skill core."""
    agents = _read_preset("llm-wiki", "AGENTS.md")
    required_sections = [
        "Audit Thresholds",
        "Tag Taxonomy",
        "Entity Creation Rules",
        "Split & Archive",
        "Synthesis Citation",
        "Language Policy",
    ]
    for section in required_sections:
        assert section in agents, (
            f"presets/llm-wiki/AGENTS.md must include `{section}` section "
            "(moved from skill core in the preset refactor)"
        )


# --- New vault-level modes (status, capabilities) ---


def test_skill_does_not_define_status_or_capabilities_modes():
    """status and capabilities are not separate modes — they collapse into bare-invoke orient."""
    text = _read_skill()
    assert "## Mode: Status" not in text, "status must not be a separate mode"
    assert "## Mode: Capabilities" not in text, "capabilities must not be a separate mode"
