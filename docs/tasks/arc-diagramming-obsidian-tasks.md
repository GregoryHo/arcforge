# arc-diagramming-obsidian Tasks

> **Goal:** Create a skill that generates high-quality Excalidraw diagrams from natural language, using coleam00's design methodology + any-Chrome rendering + Obsidian vault integration.
> **Architecture:** Independent skill delegated from arc-writing-obsidian. JSON direct write for generation. Render-validate loop via any available Chrome access.
> **Tech Stack:** Excalidraw JSON format, coleam00 methodology, obsidian-cli for vault ops

> **For Claude:** Use arc-agent-driven or arc-executing-tasks to implement.

## Context

Design doc: `docs/plans/2026-04-07-arc-diagramming-obsidian-design.md`
Research: `docs/research/excalidraw-diagramming-research.md`
coleam00 reference: `~/GitHub/AI/excalidraw-diagram-skill/` (especially SKILL.md and references/)

## Tasks

### Task 1: Write failing tests for arc-diagramming-obsidian

**Files:**
- Create: `tests/skills/test_skill_arc_diagramming_obsidian.py`

**Step 1: Write tests**
```python
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
```

**Step 2: Run tests**
Run: `npm run test:skills -- -k test_skill_arc_diagramming_obsidian -v`
Expected: ALL FAIL (skill doesn't exist yet)

**Step 3: Commit**
`git commit -m "test(skills): add arc-diagramming-obsidian test suite (RED)"`

---

### Task 2: Create SKILL.md — frontmatter + pipeline + methodology

**Files:**
- Create: `skills/arc-diagramming-obsidian/SKILL.md`

**Step 1: Write SKILL.md**

Write the main SKILL.md with these sections. Content should follow the design doc (`docs/plans/2026-04-07-arc-diagramming-obsidian-design.md`) and adapt coleam00's methodology from `~/GitHub/AI/excalidraw-diagram-skill/SKILL.md`.

Required sections:
1. **Frontmatter** — `name: arc-diagramming-obsidian`, description starting with "Use when"
2. **Intro** — "Diagrams should ARGUE, not DISPLAY" philosophy
3. **Pipeline** — Understand → Pattern → Generate → Validate → Save
4. **Design Process** — Assess depth → Research (if technical) → Map to patterns → Generate → Validate
5. **9 Visual Patterns** — Table with all 9 patterns + when to use each
6. **Layout Rules** — Size hierarchy (Hero/Primary/Secondary/Small), whitespace, container discipline (<30%)
7. **Generation Engine** — JSON direct write as default, Mermaid shortcut for simple flowcharts, elkjs shortcut for 50+ element graphs
8. **Section-by-Section Strategy** — Namespaced seeds, descriptive IDs, cross-section bindings
9. **Render-Validate Loop** — Mandatory. Tool detection (any Chrome > Playwright > report). Max 3 iterations.
10. **Dark Mode** — Read user preference, adjust viewBackgroundColor and palette
11. **Delegation** — References to color-palette.md, visual-patterns.md, element-templates.md
12. **Completion/Blocked formats** — Standard ✅/⚠️ format

Keep SKILL.md under 500 lines. Heavy reference content goes in `references/` files.

**Step 2: Run tests**
Run: `npm run test:skills -- -k test_skill_arc_diagramming_obsidian -v`
Expected: ALL PASS

**Step 3: Commit**
`git commit -m "feat(skills): add arc-diagramming-obsidian SKILL.md (GREEN)"`

---

### Task 3: Create references/color-palette.md

**Files:**
- Create: `skills/arc-diagramming-obsidian/references/color-palette.md`

**Step 1: Write color palette**

Two modes: Light and Dark. Same hue families (ice blue, teal, warm yellow), adjusted for contrast.

Light mode values from design doc. Dark mode: invert approach — darker fills with lighter strokes, adjusted for readability on `#1e1e1e` canvas.

Must include:
- Shape colors table (semantic → fill/stroke) for both light and dark
- Text colors (title, body, detail) for both modes
- Arrow colors for both modes
- Evidence artifact colors (code snippets, JSON examples) for both modes
- Canvas background per mode
- Rule: "Do not invent new colors"

Reference: `~/GitHub/AI/excalidraw-diagram-skill/references/color-palette.md` for structure.

**Step 2: Verify**
Run: `npm run test:skills -- -k test_skill_arc_diagramming_obsidian -v`
Expected: Still PASS (SKILL.md references this file)

**Step 3: Commit**
`git commit -m "feat(skills): add cool minimal color palette (light + dark)"`

---

### Task 4: Create references/visual-patterns.md

**Files:**
- Create: `skills/arc-diagramming-obsidian/references/visual-patterns.md`

**Step 1: Write visual patterns reference**

Expand the 9 patterns from the design doc with:
- ASCII sketch of each pattern's layout structure
- When to use / when NOT to use
- Typical element count and size tier
- Example: what concept maps to this pattern

Also include:
- Shape meaning table (concept type → shape → why)
- Container vs free-floating text decision matrix
- Lines as structure (timelines, trees, dividers) — not just arrows

Reference: coleam00's SKILL.md "Visual Pattern Library" section for detail level.

**Step 2: Verify**
Run: `npm run test:skills -- -k test_skill_arc_diagramming_obsidian -v`
Expected: Still PASS

**Step 3: Commit**
`git commit -m "feat(skills): add visual patterns reference for diagramming"`

---

### Task 5: Create references/element-templates.md

**Files:**
- Create: `skills/arc-diagramming-obsidian/references/element-templates.md`

**Step 1: Write element templates**

Copy-paste ready JSON templates for each Excalidraw element type. Use cool minimal palette placeholders. Must include:
- Free-floating text (no container)
- Rectangle (with roundness)
- Diamond
- Ellipse
- Arrow (with startBinding/endBinding)
- Line (structural, not arrow)
- Small marker dot (10-20px ellipse)
- Text centered in shape (with containerId)

Each template must be complete — every required JSON property present. Use descriptive IDs and comments.

Reference: `~/GitHub/AI/excalidraw-diagram-skill/references/element-templates.md` for exact JSON structure.

**Step 2: Verify**
Run: `npm run test:skills -- -k test_skill_arc_diagramming_obsidian -v`
Expected: Still PASS

**Step 3: Commit**
`git commit -m "feat(skills): add Excalidraw JSON element templates"`

---

### Task 6: Update arc-writing-obsidian delegation

**Files:**
- Modify: `skills/arc-writing-obsidian/SKILL.md`

**Step 1: Add delegation to arc-diagramming-obsidian**

In the Delegation section, add:
```markdown
- Excalidraw diagrams → invoke `arc-diagramming-obsidian`
```

In the Artifact Tiers section, add Tier 3:
```markdown
**Tier 3 (visual argument):** Excalidraw diagrams. Use when the user explicitly asks for a diagram, architecture visualization, or when a Synthesis note needs a relationship diagram more complex than Mermaid can express. Delegate to `arc-diagramming-obsidian`.
```

**Step 2: Verify**
Run: `npm run test:skills -v`
Expected: ALL 181+ tests PASS (no regressions)

**Step 3: Commit**
`git commit -m "feat(skills): add arc-diagramming-obsidian delegation to writing skill"`

---

### Task 7: Final validation + cleanup

**Step 1: Run full test suite**
Run: `npm test`
Expected: All 4 runners pass (skill tests 181+ passed)

**Step 2: Clean up temp files**
Remove any remaining test Excalidraw files from vault:
```bash
obsidian files 2>&1 | grep -E "test|style-|color-|mermaid-|ea-"
```
Delete any found.

**Step 3: Remove TODO-Excalidraw-Ingest from vault root (move to proper location if needed)**

**Step 4: Final commit**
`git commit -m "chore: clean up test artifacts and finalize diagramming skill"`
