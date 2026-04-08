from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-diagramming-obsidian/SKILL.md")
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


def test_arc_diagramming_obsidian_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)
    assert front.get("name") == "arc-diagramming-obsidian"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024
    assert "@" not in text


def test_arc_diagramming_obsidian_has_pipeline():
    """Skill must define the Understand > Pattern > Generate > Validate > Save pipeline."""
    text = _read_skill().lower()
    assert "understand" in text
    assert "pattern" in text
    assert "generate" in text
    assert "validate" in text


def test_arc_diagramming_obsidian_has_visual_patterns():
    """Skill must reference the 9 visual patterns."""
    text = _read_skill().lower()
    for pattern in ["fan-out", "convergence", "tree", "timeline", "cycle", "cloud", "assembly", "side-by-side", "gap"]:
        assert pattern in text, f"missing visual pattern: {pattern}"


def test_arc_diagramming_obsidian_has_json_generation():
    """Skill must specify JSON direct write as generation method."""
    text = _read_skill().lower()
    assert "json" in text
    assert "section-by-section" in text or "section by section" in text


def test_arc_diagramming_obsidian_has_render_validate():
    """Skill must have mandatory render-validate loop."""
    text = _read_skill().lower()
    assert "render" in text
    assert "validate" in text or "validation" in text
    assert "mandatory" in text or "must" in text


def test_arc_diagramming_obsidian_has_size_hierarchy():
    """Skill must define size hierarchy (Hero, Primary, Secondary, Small)."""
    text = _read_skill().lower()
    assert "hero" in text
    assert "primary" in text
    assert "secondary" in text


def test_arc_diagramming_obsidian_has_container_discipline():
    """Skill must enforce <30% container rule."""
    text = _read_skill()
    assert "30%" in text or "30 %" in text


def test_arc_diagramming_obsidian_references_color_palette():
    """Skill must reference color-palette.md for all colors."""
    text = _read_skill()
    assert "color-palette" in text


def test_arc_diagramming_obsidian_references_element_templates():
    """Skill must reference element-templates.md for JSON templates."""
    text = _read_skill()
    assert "element-templates" in text


def test_arc_diagramming_obsidian_has_rendering_flexibility():
    """Skill must support any Chrome access, not just Playwright."""
    text = _read_skill().lower()
    assert "chrome" in text or "browser" in text
    assert "playwright" not in text or ("chrome" in text and "playwright" in text)


def test_arc_diagramming_obsidian_has_dark_mode():
    """Skill must support dark mode."""
    text = _read_skill().lower()
    assert "dark mode" in text or "dark-mode" in text


def test_arc_diagramming_obsidian_has_completion_formats():
    """Skill must have standard completion/blocked formats."""
    text = _read_skill()
    assert "✅" in text
    assert "⚠️" in text


def test_arc_diagramming_obsidian_has_shortcut_paths():
    """Skill must define Mermaid and elkjs shortcut paths."""
    text = _read_skill().lower()
    assert "mermaid" in text
    assert "elkjs" in text or "elk" in text
