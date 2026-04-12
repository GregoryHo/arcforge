---
name: arc-diagramming-obsidian
description: Use when the user wants to create an Excalidraw diagram, architecture visualization, flowchart, mind map, or any visual representation of concepts and relationships. Trigger on mentions of drawing, diagramming, visualizing, mapping, or illustrating ideas. Also trigger when arc-maintaining-obsidian delegates for Synthesis visuals that need more than embedded Mermaid. Even if the user just says "show me how this works visually" or "can you draw that?" — this skill applies.
---

# arc-diagramming-obsidian

Diagrams should ARGUE, not DISPLAY. A diagram is a visual argument — structure mirrors concept, shape carries meaning. If removing all text leaves a meaningless grid of boxes, the diagram has failed.

## Pipeline

Every invocation follows four phases:

```
BUILD (EA API) → EXPORT (.excalidraw JSON) → VALIDATE (Playwright render) → SAVE (vault)
```

1. **Build** — Create elements programmatically using ExcalidrawAutomate. It handles text sizing, container binding, and arrow routing automatically.
2. **Export** — Extract elements as portable `.excalidraw` JSON for rendering.
3. **Validate** — Render to PNG with Playwright, visually inspect, fix JSON directly. Mandatory — up to 3 iterations.
4. **Save** — Convert to `.excalidraw.md` format and write to vault.

## Design Process (Before Building)

### Step 0: Assess Depth

Determine what level of detail this diagram needs:

**Simple/Conceptual** — Abstract shapes for mental models. This is the default. The main pipeline handles it entirely.

**Comprehensive/Technical** — Concrete examples for real systems. Read `references/depth-enhancements.md` for additional steps: Research Mandate, Multi-Zoom Architecture, Evidence Artifacts. These enhance the main pipeline — they don't replace it.

### Step 1: Understand Deeply

For each concept ask: What does it DO? What relationships exist? What's the core transformation? What would someone need to SEE to understand this?

### Step 2: Map Concepts to Visual Patterns

| Pattern | Use Case | Structure |
|---------|----------|-----------|
| **Fan-Out** | One-to-many (sources, hubs) | Central element + radiating arrows |
| **Convergence** | Many-to-one (aggregation) | Multiple inputs merging |
| **Tree** | Hierarchy (org charts, taxonomies) | Lines + free-floating text (no boxes) |
| **Timeline** | Sequences of steps | Line + small dots + labels |
| **Spiral/Cycle** | Feedback loops, iteration | Elements with arrow returning to start |
| **Cloud** | Abstract state (context, memory) | Overlapping ellipses, varied sizes |
| **Assembly Line** | Transformation (before → after) | Input → Process → Output |
| **Side-by-Side** | Comparison, trade-offs | Two parallel structures |
| **Gap/Break** | Phase boundaries | Visual whitespace or barrier |

Each major concept uses a different pattern. No uniform card grids — that's a list, not a diagram.

Read `references/visual-patterns.md` for detailed layout guidance, ASCII sketches, and shape meaning tables.

### Step 3: Ensure Variety

If two adjacent sections look the same (both rectangular grids, both simple chains), redesign one. Visual monotony kills comprehension.

### Step 4: Sketch the Flow

Mentally trace how the eye moves through the diagram. There should be a clear visual story — not a scattered collection of shapes.

## Layout Rules

### Size Hierarchy

Use size to communicate importance — the viewer's eye goes to the largest element first:

- **Hero**: 300×150 — visual anchor, most important concept
- **Primary**: 180×90 — major components
- **Secondary**: 120×60 — supporting elements
- **Small**: 60×40 — markers, minor nodes

### Whitespace = Importance

The most important element gets 200px+ of empty space around it. Crowded elements feel equally weighted.

### Container Discipline

Less than 30% of text elements should be inside containers. Default to free-floating text — add containers only when the shape itself carries meaning (a process box, a decision diamond, a start/end ellipse).

**Container test:** For each boxed element, ask "Would this work as free-floating text?" If yes, remove the container.

## Colors

All colors come from `references/color-palette.md`. Two hue families — ice blue (flow) and teal (action). Decision uses pale yellow as the sole warm breakpoint.

### Dark Mode Detection

Read the user's Obsidian theme before generating:

```
obsidian eval code="document.body.classList.contains('theme-dark') ? 'dark' : 'light'"
```

- Dark mode: set `viewBackgroundColor` to `#1e1e1e`, use dark mode palette
- Light mode: set `viewBackgroundColor` to `#ffffff`, use light mode palette

**Rule:** Do not invent new colors. If a concept doesn't fit an existing semantic category, use Primary.

## Phase 1: Build with ExcalidrawAutomate

Use the EA API via `obsidian eval` to create elements programmatically. EA handles the two hardest problems automatically: text measurement (sizing containers to fit text) and bidirectional arrow binding (arrows that snap to shape edges).

Read `references/element-templates.md` for the complete EA API reference with examples.

### Core Pattern

```javascript
(async () => {
  const ea = window.ExcalidrawAutomate;
  ea.reset();
  const s = ea.style;
  s.roughness = 0;          // clean modern aesthetic
  s.opacity = 100;
  s.fillStyle = 'solid';
  s.fontFamily = 3;         // monospace
  s.roundness = {type: 3};  // rounded corners

  // --- Shapes: addText with box option ---
  // Returns the BOX id (not text id) — use this for arrow binding
  s.strokeColor = '#e2e8f0';           // text color
  s.backgroundColor = '#1e40af';       // box fill
  s.fontSize = 16;
  const boxA = ea.addText(200, 50, 'Lead Session', {
    box: 'rectangle',
    boxPadding: 20,
    boxStrokeColor: '#60a5fa'          // box stroke (separate from text)
  });

  // --- Arrows: connectObjects for bound arrows ---
  s.strokeColor = '#475569';           // arrow color
  ea.connectObjects(boxA, 'bottom', boxB, 'top', {
    endArrowHead: 'arrow'
  });

  // --- Structural: lines and free-floating text ---
  s.strokeColor = '#64748b';
  s.strokeStyle = 'dashed';
  ea.addLine([[30, 200], [800, 200]]); // separator

  s.strokeColor = '#93c5fd';
  s.fontSize = 20;
  ea.addText(40, 210, 'SECTION TITLE'); // free-floating, no box

  // --- Export ---
  const els = ea.getElements();
  const json = {
    type: 'excalidraw', version: 2,
    source: 'https://excalidraw.com',
    elements: els,
    appState: { viewBackgroundColor: '#1e1e1e', gridSize: 20 },
    files: {}
  };
  require('fs').writeFileSync('/tmp/diagram.excalidraw', JSON.stringify(json, null, 2));
  return els.length + ' elements exported';
})()
```

### Key API Methods

| Method | Returns | Use |
|--------|---------|-----|
| `ea.addText(x, y, text, {box: "rectangle"})` | box ID | Text-in-shape with auto sizing. Also supports `"diamond"`, `"ellipse"` |
| `ea.connectObjects(idA, anchorA, idB, anchorB, opts)` | arrow ID | Bound arrow between shapes. Anchors: `"top"`, `"bottom"`, `"left"`, `"right"`, or `null` (auto) |
| `ea.addText(x, y, text)` | text ID | Free-floating label (no container) |
| `ea.addLine([[x1,y1], [x2,y2]])` | line ID | Structural lines (separators, timelines) |
| `ea.addEllipse(x, y, w, h)` | ellipse ID | Marker dots, start/end nodes |
| `ea.getElements()` | element[] | Extract all elements as clean JSON objects |

### Style Control

Set `ea.style.*` properties BEFORE each `addX()` call. Key properties:

- `strokeColor` — for text: text color; for shapes: not used (use `boxStrokeColor` instead)
- `backgroundColor` — box fill color
- `fontSize`, `fontFamily` — text properties
- `strokeWidth`, `strokeStyle` — line/arrow properties (`"solid"`, `"dashed"`)
- `roughness` — `0` (clean) or `1` (hand-drawn)

### Section-by-Section (Mandatory for Large Diagrams)

For diagrams with 20+ elements, build one section per `obsidian eval` call:

1. First call: set up EA, build Section 1, export to `/tmp/diagram.excalidraw`
2. Subsequent calls: read the JSON, parse `elements` array, add new section elements via EA, merge arrays, write back
3. Use descriptive IDs: `"lead_rect"`, `"gate_arrow"` (not numeric)

### Shortcut: Mermaid (simple flowcharts)

For flowcharts under 10 elements, use `ea.addMermaid()` via `obsidian eval`. Only flowcharts produce native editable elements — other Mermaid types fall back to SVG images.

## Phase 2: Export

Phase 1 already writes the `.excalidraw` file. This phase is embedded in the build script — the last lines export `ea.getElements()` wrapped in the standard Excalidraw JSON structure to `/tmp/diagram.excalidraw`.

## Phase 3: Validate (Mandatory)

You cannot judge a diagram from JSON alone. After generating, you MUST render to PNG, view it, and fix issues.

### Render with Playwright

```bash
cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
  uv run python render_excalidraw.py /tmp/diagram.excalidraw --output /tmp/diagram.png --scale 2
```

This produces a **diagram-only PNG** — no UI chrome, no toolbar, no sidebar. Just the diagram. Then use the Read tool to view `/tmp/diagram.png`.

**First-time setup** (if renderer hasn't been configured):
```bash
cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
  uv sync && uv run playwright install chromium
```

**Never use `obsidian dev:screenshot` for validation.** It captures the entire Obsidian window — sidebar, toolbar, tabs — making it impossible to properly assess diagram layout. The Playwright renderer is the only acceptable validation method.

### The Fix Loop

```
Step 1: Run overlap checker (automated — catches issues invisible to the eye)
        cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
          uv run python check_overlaps.py /tmp/diagram.excalidraw
Step 2: Render to PNG with Playwright, view with Read tool
Step 3: Check DESIGN INTENT:
        - Does visual structure match your conceptual plan?
        - Does each section use the intended pattern?
        - Is visual hierarchy correct — hero dominant, supporting smaller?
Step 4: Check for DEFECTS (overlap checker + visual):
        - Arrow crossing through unconnected shapes (checker catches this)
        - Shape-shape overlaps (checker catches this)
        - Text overlapping shapes or other text (checker catches this)
        - Uneven spacing / lopsided composition (visual only)
        - Text too small to read (visual only)
Step 5: Fix using overlap checker suggestions + layout heuristics:
        - Read references/layout-heuristics.md for specific fix strategies
        - Edit .excalidraw JSON directly (Read → find element → Edit x/y)
        - Re-run overlap checker to verify fix
        - Re-render → back to Step 2
Step 6: Max 3 iterations. After 3 → proceed to save, report remaining issues.
```

**Fix strategy:** Edit the `.excalidraw` JSON directly for positional fixes (move, resize, spacing). Moving a shape does NOT break arrow binding — Excalidraw recalculates arrow routes from the binding data. The only dangerous edit is changing an element's `id`, which would orphan connected arrows.

Read `references/layout-heuristics.md` for specific fix techniques: arrow waypoints for crossings, spacing rules for overlaps, anchor distribution for congestion.

Only re-run the EA build (Phase 1) for structural changes — adding/removing elements or changing connections.

## Phase 4: Save to Vault

Convert the validated `.excalidraw` JSON to Obsidian's `.excalidraw.md` format and write to the vault.

### Conversion

The `.excalidraw.md` format wraps the JSON with frontmatter and a text index for Obsidian search:

1. Parse the `.excalidraw` JSON
2. Extract text elements → `"text content ^elementId"` lines (for search indexing)
3. Build the markdown wrapper:
   - Frontmatter: `excalidraw-plugin: parsed`, `tags: [excalidraw]`
   - `## Text Elements` section with extracted text
   - `## Drawing` section with the full JSON in a ` ```json ``` ` code block inside `%% %%` markers
4. Write to vault via filesystem or `obsidian-cli`

### Embed in Wiki Notes

After saving, embed in relevant wiki notes:

```markdown
![[diagram-name]]
```

Place outside bilingual callouts (diagrams are language-neutral).

## Delegation

This skill delegates format details to reference files — read them when needed:

- **Color palette** → `references/color-palette.md` (semantic colors for light + dark mode)
- **Visual patterns** → `references/visual-patterns.md` (9 patterns with layout guidance)
- **Element templates + EA API** → `references/element-templates.md` (JSON templates + EA usage)
- **Layout heuristics** → `references/layout-heuristics.md` (fix strategies for overlaps, crossings, spacing)
- **Depth enhancements** → `references/depth-enhancements.md` (Research, Multi-Zoom, Evidence — comprehensive diagrams only)

For vault operations, delegate to:
- File creation/search → `obsidian:obsidian-cli`
- Markdown formatting → `obsidian:obsidian-markdown`

## Isomorphism Test

Before finalizing any diagram, apply this test: **If you removed all text, would the structure alone communicate the concept?**

A fan-out visually says "one source, many outputs" without labels. A timeline visually says "sequence" without labels. If your diagram is just labeled boxes connected by arrows, the structure communicates nothing — redesign it.

## Completion Format

```
✅ Created diagram → [vault-path/filename.excalidraw]
   Pattern: [which visual patterns used]
   Elements: [count]
   Validated: [iterations completed]
```

## Blocked Format

```
⚠️ Diagramming blocked
Issue: [what went wrong — e.g., renderer not set up, concept too ambiguous]
To resolve: [specific action needed]
```
