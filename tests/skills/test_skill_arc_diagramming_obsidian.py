from pathlib import Path


SKILL_DIR = Path("skills/arc-diagramming-obsidian")


def _read_skill() -> str:
    return (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")


def _read_agent(name: str) -> str:
    return (SKILL_DIR / "agents" / name).read_text(encoding="utf-8")


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


# === SKILL.md (brain) tests ===


def test_arc_diagramming_obsidian_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)
    assert front.get("name") == "arc-diagramming-obsidian"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024
    assert "@" not in text


def test_arc_diagramming_obsidian_has_pipeline():
    """Skill must define the Build > Validate > Save pipeline."""
    text = _read_skill().lower()
    assert "build" in text
    assert "validate" in text
    assert "save" in text


def test_arc_diagramming_obsidian_has_visual_patterns():
    """Skill must reference the 9 visual patterns."""
    text = _read_skill().lower()
    for pattern in ["fan-out", "convergence", "tree", "timeline", "cycle",
                     "cloud", "assembly", "side-by-side", "gap"]:
        assert pattern in text, f"missing visual pattern: {pattern}"


def test_arc_diagramming_obsidian_has_json_generation():
    """Skill must specify JSON export as part of the build phase."""
    text = _read_skill().lower()
    assert "json" in text
    assert ".excalidraw" in text


def test_arc_diagramming_obsidian_has_render_validate():
    """Skill must have mandatory render-validate loop."""
    text = _read_skill().lower()
    assert "render" in text
    assert "overlap" in text
    assert "3" in text  # max 3 iterations


def test_arc_diagramming_obsidian_has_size_hierarchy():
    """Skill must reason about size via importance — tier table lives in painters-toolkit.md."""
    skill_text = _read_skill().lower()
    assert "hero" in skill_text
    assert "painters-toolkit" in skill_text
    toolkit = (SKILL_DIR / "references" / "painters-toolkit.md").read_text(encoding="utf-8").lower()
    for tier in ("hero", "primary", "secondary"):
        assert tier in toolkit, f"painters-toolkit.md missing size tier: {tier}"


def test_arc_diagramming_obsidian_has_restraint_principle():
    """SOFT layer must teach 'every element serves the concept' over mechanical rules."""
    text = _read_skill().lower()
    assert "serve the concept" in text
    assert "unjustified" in text


def test_arc_diagramming_obsidian_references_color_palette():
    """Skill must reference color-palette.md for all colors."""
    text = _read_skill()
    assert "color-palette" in text


def test_arc_diagramming_obsidian_references_element_templates():
    """Skill must reference element-templates.md for EA API details."""
    text = _read_skill()
    assert "element-templates" in text


def test_arc_diagramming_obsidian_has_playwright_renderer():
    """Skill must use Playwright as primary render method."""
    text = _read_skill().lower()
    assert "render_excalidraw.py" in text


def test_arc_diagramming_obsidian_has_ea_api():
    """Skill must document ExcalidrawAutomate API for building diagrams."""
    text = _read_skill().lower()
    assert "excalidrawautomate" in text
    assert "connectobjects" in text


def test_arc_diagramming_obsidian_has_dark_mode():
    """Skill must support dark mode detection."""
    text = _read_skill().lower()
    assert "dark" in text and ("mode" in text or "theme" in text)


def test_arc_diagramming_obsidian_has_completion_formats():
    """Skill must have standard completion/blocked formats."""
    text = _read_skill()
    assert "\u2705" in text
    assert "\u26a0\ufe0f" in text


def test_arc_diagramming_obsidian_has_mermaid_shortcut():
    """Skill must define Mermaid shortcut path."""
    text = _read_skill().lower()
    assert "mermaid" in text


def test_arc_diagramming_obsidian_has_plan_layout():
    """Skill must reference plan_layout.py for complex diagrams."""
    text = _read_skill()
    assert "plan_layout" in text


def test_arc_diagramming_obsidian_has_post_save_verify():
    """Skill must verify the saved file by re-rendering."""
    text = _read_skill().lower()
    assert "post-save" in text or "diagram-post-save" in text


# === Delegation tests ===


def test_arc_diagramming_obsidian_delegates_to_subagents():
    """Skill must reference subagent delegation as optional accelerator."""
    text = _read_skill().lower()
    assert "subagent" in text
    assert "diagram-builder" in text
    assert "diagram-validator" in text
    assert "diagram-saver" in text


def test_arc_diagramming_obsidian_has_fallback():
    """Skill must work without subagents (self-contained phases)."""
    text = _read_skill().lower()
    assert "self-contained" in text or "follow the phases" in text


def test_arc_diagramming_obsidian_has_quality_gate():
    """Orchestrator must review validator output before saving."""
    text = _read_skill().lower()
    assert "quality gate" in text


# === Agent file tests (self-contained accelerators) ===


def test_arc_diagramming_obsidian_agent_files_exist():
    """All 3 agent files must exist."""
    agents_dir = SKILL_DIR / "agents"
    assert (agents_dir / "diagram-builder.md").is_file()
    assert (agents_dir / "diagram-validator.md").is_file()
    assert (agents_dir / "diagram-saver.md").is_file()


def test_arc_diagramming_obsidian_builder_is_self_contained():
    """Builder agent must have EA API and reference file pointers."""
    builder = _read_agent("diagram-builder.md").lower()
    assert "excalidrawautomate" in builder
    assert "connectobjects" in builder
    assert "element-templates" in builder
    assert "mermaid" in builder


def test_arc_diagramming_obsidian_validator_is_self_contained():
    """Validator agent must have render loop and overlap checking."""
    validator = _read_agent("diagram-validator.md").lower()
    assert "render_excalidraw.py" in validator
    assert "overlap" in validator
    assert "3" in validator  # max iterations


def test_arc_diagramming_obsidian_saver_uses_ea_create():
    """Saver agent must use ea.create() — never manual format construction."""
    saver = _read_agent("diagram-saver.md").lower()
    assert "ea.create" in saver
    assert "never manually construct" in saver or "never manual" in saver


def test_arc_diagramming_obsidian_saver_has_post_save_verify():
    """Saver agent must invoke the post-save verifier script."""
    saver = _read_agent("diagram-saver.md").lower()
    assert "verify_saved_diagram.py" in saver
    assert "post-save" in saver


# === Save-format reference + verify script tests ===


def test_arc_diagramming_obsidian_has_save_format_reference():
    """SKILL.md must point at references/save-format.md for fallback template."""
    text = _read_skill()
    assert "save-format" in text


def test_arc_diagramming_obsidian_has_verify_script_reference():
    """SKILL.md must invoke verify_saved_diagram.py for post-save verification."""
    text = _read_skill()
    assert "verify_saved_diagram.py" in text


def test_arc_diagramming_obsidian_save_format_file_exists():
    """save-format.md must exist and document the canonical manual template."""
    save_format = SKILL_DIR / "references" / "save-format.md"
    assert save_format.is_file()
    content = save_format.read_text(encoding="utf-8")
    assert "excalidraw-plugin: parsed" in content
    assert "tags: [excalidraw]" in content
    assert "Switch to EXCALIDRAW VIEW" in content
    assert "# Excalidraw Data" in content


def test_arc_diagramming_obsidian_verify_script_exists():
    """verify_saved_diagram.py must exist and define the two verification checks."""
    script = SKILL_DIR / "references" / "verify_saved_diagram.py"
    assert script.is_file()
    content = script.read_text(encoding="utf-8")
    assert "check_format_markers" in content
    assert "render_and_compare" in content
    assert "excalidraw-plugin: parsed" in content
