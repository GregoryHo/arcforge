---
name: arc-diagramming-obsidian
description: Use when the user wants an Excalidraw diagram or any visual representation — architecture, flowchart, mind map — including casual "draw this" / "show me how this works visually". Also use when arc-maintaining-obsidian delegates Synthesis visuals beyond embedded Mermaid.
---

# arc-diagramming-obsidian

Diagrams should ARGUE, not DISPLAY. A diagram is a visual argument — structure mirrors concept, shape carries meaning. If removing all text leaves a meaningless grid of boxes, the diagram has failed.

## Pipeline

```
DESIGN → BUILD → VALIDATE → SAVE
```

You own the full workflow. For complex diagrams, delegate mechanical phases (Build, Validate, Save) to subagents that read from `agents/` to keep context clean; for simple diagrams or when subagents aren't available, execute each phase yourself. The instructions below are self-contained either way.

Guidance splits into two layers, both applying across all four phases: **HARD** — physical/mechanical invariants the tools verify or that silently corrupt output; non-negotiable. **SOFT** — concept judgments that depend on what you're drawing; reasoning, not rules.

---

## HARD: Invariants That Must Hold

### Process Invariants

1. **Detect theme before building.** Choosing the wrong palette silently produces an unreadable diagram (dark palette on light background = pale washout; light palette on dark = near-invisible text). The Playwright renderer happily renders whatever colors you picked — no feedback loop to catch this.

   ```bash
   obsidian eval code="document.body.classList.contains('theme-dark') ? 'dark' : 'light'"
   ```

   If no response within 5 seconds, pick a palette from prompt signals ("dark mode" in the request, time of day) and state the assumption in your completion output. Never silently assume.

2. **Every Validate iteration must render AND view PNG.** You cannot judge composition, readability, or hierarchy from JSON alone. The overlap checker catches bounding-box overlaps but not visual problems — arrows crossing unrelated elements at acute angles, text too small to read, hierarchy failing because the hero doesn't dominate. View `/tmp/diagram.png` with the Read tool every iteration.

3. **Save must be verified.** Both `ea.create()` and the manual-fallback write path can silently produce format corruption — the canvas renders, markdown text bleeds through, and the Playwright renderer cannot detect this. Always run `verify_saved_diagram.py` after save.

### Mechanical Invariants

- **`ea.reset()` at the start of every EA invocation** — without it, elements accumulate from previous calls and appear in the output invisibly
- **Never change an element's `id`** — this orphans connected arrows (they lose the shape they were bound to)
- **`addText` with `box` returns the BOX id**, not the text id — use the returned value for `connectObjects`
- **`viewBackgroundColor` matches the detected theme** — `#1e1e1e` for dark, `#ffffff` for light
- **Save format is byte-exact** for the manual fallback path — any deviation (wrong frontmatter spacing, list-style tags instead of inline array, missing warning line) causes silent corruption. See `references/save-format.md`

### Layout Trap Audit (Physical Collisions)

Four arrow-path collisions that recur across diagrams. Each is a rendered-pixel overlap, detectable by `check_overlaps.py` *after* build, but cheaper to prevent at design time by tracing arrow paths mentally.

- **Trap 1:** Converging arrows (multiple arrows merging into one target) travel through the corridor below the source elements. Annotations placed directly below source boxes get crossed.
- **Trap 2:** Back-edges (an arrow from a later zone returning to an earlier one) routed horizontally at the Y-midpoint of a zone they *pass through* will cross that zone's elements.
- **Trap 3:** Decision-diamond "yes" / "no" labels placed at the bottom of the diamond sit directly in the fan-out exit path of any arrow leaving from the bottom.
- **Trap 4:** Back-edge labels (free text describing the arrow) placed at the arrow's own vertical-run X-coordinate sit on top of the arrow line.

Mentally trace every planned arrow from source to target before writing EA code. If the path crosses an unrelated element, reposition *before* building. For fix strategies (arrow routing, anchor distribution, waypoint planning), read `references/layout-heuristics.md` Part 2.

---

## SOFT: The Design Space

HARD keeps the diagram valid. SOFT is where you make it *good* — concept judgments that depend on what you're drawing.

**Think first, draw second.** For each major concept, answer before reaching for shapes: what does it DO (the verb)? What relationships and core transformation (input → output, state A → state B)? What would someone need to SEE to understand it?

**Every element serves the concept.** Before adding anything, ask: *what does this communicate that labels alone don't?* If "nothing", it's noise; if "this is where flow starts / a zone boundary / the concept is symmetric", it's doing work. Match two registers — **language** (monolingual prompt → monolingual labels, no bilingual subtitles unless asked) and **conceptual** (symmetric concept → equal-sized peers; don't fabricate a hero the concept doesn't claim).

**Scale reflects real importance.** Size the genuine hero (a convergence point, the concept the diagram is *about*) larger; size genuine peers equally. Size ranges in `references/painters-toolkit.md` are suggestions, not tiers.

**Isomorphism self-check.** Before building, ask: with all text removed, would the structure alone communicate the concept? A fan-out says "one source, many outputs"; a convergence says "many inputs, one result"; a cycle says "feedback". If the structure is just labeled boxes and arrows with no isomorphism, revisit. This is a check, not a gate — sometimes "A connects to B" is genuinely the concept.

**Brushes** — shape variety, subtitles, zone labels, accents, separators, containers, footers — are a vocabulary to pick from, not a menu to copy. See `references/painters-toolkit.md`. For pattern inspiration (fan-out, convergence, tree, timeline, cycle, assembly line, side-by-side, gap) see `references/visual-patterns.md`; if two adjacent sections look structurally identical, redesign one — visual monotony kills comprehension.

**Depth and layout:** for comprehensive/technical depth (research, multi-zoom, evidence artifacts) see `references/depth-enhancements.md`; for 20+ elements use `references/plan_layout.py` to compute coordinates automatically (systematic spacing + two-column separation that prevents common overlaps).

---

## Phase 1: Build with ExcalidrawAutomate

Create elements using the EA API via `obsidian eval`. EA handles text sizing and arrow binding automatically. The build ends by exporting all elements as a `.excalidraw` JSON file to `/tmp/diagram.excalidraw`.

Before writing EA code, read `references/layout-heuristics.md` Part 1 for grid-based coordinate planning.

### Core Pattern

```javascript
(async () => {
  const ea = window.ExcalidrawAutomate;
  ea.reset();
  const s = ea.style;
  s.roughness = 0; s.opacity = 100; s.fillStyle = 'solid';
  s.fontFamily = 3; s.roundness = {type: 3};

  // --- Style BEFORE each element ---
  s.strokeColor = '#e2e8f0'; s.backgroundColor = '#1e40af'; s.fontSize = 16;
  const boxA = ea.addText(200, 50, 'Label', {
    box: 'rectangle', boxPadding: 20, boxStrokeColor: '#60a5fa'
  });

  // --- Arrows ---
  s.strokeColor = '#475569';
  ea.connectObjects(boxA, 'bottom', boxB, 'top', { endArrowHead: 'arrow' });

  // --- Free text + structural lines ---
  s.strokeColor = '#93c5fd'; s.fontSize = 20;
  ea.addText(40, 210, 'SECTION TITLE');

  // --- Export ---
  const els = ea.getElements();
  const json = {
    type: 'excalidraw', version: 2, source: 'https://excalidraw.com',
    elements: els,
    appState: { viewBackgroundColor: '#1e1e1e', gridSize: 20 },
    files: {}
  };
  require('fs').writeFileSync('/tmp/diagram.excalidraw', JSON.stringify(json, null, 2));
  return els.length + ' elements exported';
})()
```

Beyond the Mechanical Invariants above: **style before element** (`ea.style.*` applies to the NEXT element created); **stagger anchors** when multiple arrows leave one shape (left/bottom/right, not all bottom); **diamond text ≤ 12 chars** (diamonds have ~50% less usable area than rectangles).

Read `references/element-templates.md` for the full EA API reference, raw JSON templates for Phase 2 fixes, and the binding checklist.

**Mermaid shortcut:** For simple flowcharts under 10 elements, use `ea.addMermaid()` instead. Only flowchart type produces native editable elements — other Mermaid types fall back to SVG images.

---

## Phase 2: Validate (Mandatory)

After building, render to PNG, view it, fix defects. Up to 3 iterations — then save and report remaining issues.

```
ITERATION (repeat up to 3×):
  1. CHECK  — : "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
              cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
                uv run python check_overlaps.py /tmp/diagram.excalidraw
  2. RENDER — : "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
              cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
                uv run python render_excalidraw.py /tmp/diagram.excalidraw \
                --output /tmp/diagram.png --scale 2
              View /tmp/diagram.png with the Read tool — HARD, every iteration.
  3. JUDGE  — Apply SOFT judgment. Design intent: correct patterns? Hero
              dominant (if concept claims one)? Brushes from Painter's Toolkit
              serving the concept? Defects: overlaps, crossings, uneven
              spacing, text too small?
  4. FIX    — Edit .excalidraw JSON directly (Read → find element → Edit x/y).
              Moving shapes does NOT break arrow binding (Excalidraw recalculates
              from binding data, not coordinates).
              Never change element IDs — this orphans connected arrows.
              → Next iteration, or proceed to Save if clean.
```

Read `references/layout-heuristics.md` Part 2 for fix strategies.

**First-time setup** (if renderer fails with missing deps):
```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
  uv sync && uv run playwright install chromium
```

**When to rebuild vs. JSON-edit:** Positional fixes (move, resize, spacing) → edit JSON. Structural changes (add/remove elements, change connections) → rebuild from Phase 1 with `ea.reset()`.

---

## Phase 3: Save to Vault

Two paths — prefer `ea.create()`, fall back to manual write only if EA is unreachable.

### Preferred: `ea.create()` via obsidian eval

```javascript
(async () => {
  const ea = window.ExcalidrawAutomate;
  ea.reset();
  const json = JSON.parse(require('fs').readFileSync('/tmp/diagram.excalidraw', 'utf8'));
  json.elements.forEach(el => { ea.elementsDict[el.id] = el; });
  ea.setView('new');
  await ea.create({
    filename: '<name>', foldername: '<folder>',
    onNewPane: false, silent: true
  });
  return 'Saved to vault';
})()
```

### Fallback: Manual Canonical Format

Only use when `obsidian eval code="typeof window.ExcalidrawAutomate"` returns empty (EA plugin unavailable). Obsidian checks format heuristics — any deviation causes silent corruption. Read `references/save-format.md` for the byte-exact template.

### Post-Save Verification (Mandatory)

```bash
: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"
cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
  uv run python verify_saved_diagram.py <vault-path>/<name>.excalidraw.md
```

Exits non-zero on format corruption or render mismatch. For the manual-fallback path, also compares the re-rendered PNG against `/tmp/diagram.png` to catch JSON corruption. If verification fails, regenerate using the canonical template from `references/save-format.md` — not the file you just wrote.

### Embed in Wiki Notes

Embed with `![[diagram-name]]`, placed outside bilingual callouts (diagrams are language-neutral).

---

## Delegation (Optional)

For complex diagrams, spawn a subagent per mechanical phase to keep context clean. Pass the design spec and relevant context; each subagent reads its instructions and the reference files it needs:

- **Build** — pass the design spec (theme, zones, elements, connections, brushes chosen); read `agents/diagram-builder.md`. Output: `/tmp/diagram.excalidraw` + element count.
- **Validate** — pass the diagram path and a 1-2 sentence design intent; read `agents/diagram-validator.md`. Output: validated `.excalidraw` + PNG at `/tmp/diagram.png` + issues report.
- **Save** — pass the diagram path, filename, folder, and embed target; read `agents/diagram-saver.md`. Output: vault path.

**Quality gate:** After validation returns, view the PNG yourself before Save. If it doesn't match your design intent, revise the spec and re-run Build, or give a new Validate pass specific fixes.

Do yourself: element generation, PNG render, overlap/layout checks (`check_overlaps.py`, `plan_layout.py`), direct `.excalidraw.md` vault write (or `ea.create()`). Delegate to `obsidian:obsidian-cli`: theme detection, vault-path/note search, embedding in a wiki note, reloading a changed diagram.

### Reference Files (Read on Demand)

- `references/color-palette.md` — Semantic colors for light + dark mode
- `references/visual-patterns.md` — 9 patterns with layout guidance
- `references/painters-toolkit.md` — Shape variety, subtitles, zone labels, containers, accents, separators, footers, size suggestions
- `references/element-templates.md` — Full EA API reference + raw JSON templates
- `references/layout-heuristics.md` — Grid planning (Part 1) + fix strategies (Part 2)
- `references/depth-enhancements.md` — Research, Multi-Zoom, Evidence (comprehensive only)
- `references/save-format.md` — Manual `.excalidraw.md` canonical template (fallback save path)
- `references/plan_layout.py` — Automatic coordinate computation for 20+ elements
- `references/verify_saved_diagram.py` — Post-save verification (format markers + render check)

---

## Completion Format

```
✅ Created diagram → [vault-path/filename.excalidraw]
   Pattern: [visual patterns used]
   Elements: [count]
   Validated: [iterations completed]
```

## Blocked Format

```
⚠️ Diagramming blocked
Issue: [what went wrong]
To resolve: [specific action needed]
```
