---
name: arc-diagramming-obsidian
description: Use when the user wants to create an Excalidraw diagram, architecture visualization, flowchart, mind map, or any visual representation of concepts and relationships. Trigger on mentions of drawing, diagramming, visualizing, mapping, or illustrating ideas. Also trigger when arc-writing-obsidian delegates for Synthesis visuals that need more than embedded Mermaid. Even if the user just says "show me how this works visually" or "can you draw that?" — this skill applies.
---

# arc-diagramming-obsidian

Diagrams should ARGUE, not DISPLAY. A diagram is a visual argument — structure mirrors concept, shape carries meaning. If removing all text leaves a meaningless grid of boxes, the diagram has failed.

## Pipeline

Every invocation follows five steps:

```
Understand → Pattern → Generate → Validate → Save
```

1. **Understand** — What concepts need visualizing? What relationships exist? What's the core transformation?
2. **Pattern** — Map each concept to a visual pattern (see table below). Each major concept uses a different pattern.
3. **Generate** — Write Excalidraw JSON section-by-section, applying layout rules and color palette
4. **Validate** — Render to PNG, inspect visually, fix issues. Mandatory — repeat up to 3 times.
5. **Save** — Write `.excalidraw` file to vault via `obsidian-cli`

## Design Process

### Step 0: Assess Depth

**Simple/Conceptual** — Abstract shapes for mental models. No evidence artifacts needed.
**Comprehensive/Technical** — Concrete examples for real systems. Research actual specs, event names, API formats before drawing.

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

## Generation Engine

### Default: JSON Direct Write

Write raw Excalidraw JSON hand-crafted per element. This gives precise control over every property — position, color, binding, text. The render-validate loop catches layout issues visually.

Read `references/element-templates.md` for copy-paste JSON templates for each element type.

**Section-by-section strategy** for large diagrams:
1. Create base file with JSON wrapper and first section of elements
2. Add one section per edit — take time with layout and connections
3. Use descriptive string IDs: `"trigger_rect"`, `"arrow_fan_left"` (not numeric)
4. Namespace seeds by section: Section 1 uses 100xxx, Section 2 uses 200xxx
5. Update cross-section bindings as you go (both arrow and target element must reference each other)

### Shortcut: Mermaid (simple flowcharts)

For flowcharts under 10 elements, use `ea.addMermaid()` via `obsidian eval` — Mermaid handles layout automatically. After generation, iterate elements to apply cool minimal colors from the palette.

Only flowcharts produce native editable elements. Other Mermaid diagram types fall back to SVG images.

### Shortcut: elkjs (50+ element complex graphs)

For very complex diagrams, use the elkjs layout engine (available in the vault's Auto Layout script) to compute initial coordinates. AI builds logical structure, elkjs positions elements, AI adjusts per methodology.

## Colors

All colors come from `references/color-palette.md`. Two hue families — ice blue (flow) and teal (action). Decision uses pale yellow as the sole warm breakpoint.

Light mode and dark mode variants are both defined. Read the user's Obsidian theme to determine which to use. Set `viewBackgroundColor` accordingly.

**Rule:** Do not invent new colors. If a concept doesn't fit an existing semantic category, use Primary.

## Render-Validate Loop

This is mandatory — not a final check. You cannot judge a diagram from JSON alone.

### Rendering

Any tool that can access Chrome works identically — they all use the same `excalidraw library` `exportToSvg()` under the hood.

**Tool detection (use first available):**
1. User's existing browser access (claude-in-chrome, puppeteer, agent browser, etc.)
2. Playwright with coleam00's render script (`render_excalidraw.py`)
3. If neither available — report to user, ask them to choose

The rendering tool does NOT affect quality. Use whatever is available.

### The Loop

```
Step 1: Render to PNG
Step 2: View the image. Check DESIGN INTENT first:
        - Does visual structure match the conceptual plan?
        - Does each section use the intended pattern?
        - Is visual hierarchy correct — hero dominant, supporting smaller?
Step 3: Check for DEFECTS:
        - Text clipped or overflowing containers
        - Elements overlapping
        - Arrows crossing through elements
        - Uneven spacing
        - Text too small to read
        - Lopsided composition
Step 4: Fix JSON → back to Step 1
Step 5: Max 3 iterations. After 3 → save what you have, report issues to user.
```

### Dark Mode

Read the user's Obsidian theme preference. If dark mode:
- Set `viewBackgroundColor` to dark canvas (e.g., `#1e1e1e`)
- Use dark mode color variant from `references/color-palette.md`
- Ensure text colors have sufficient contrast on dark backgrounds

If light mode: white canvas, light mode palette.

## Delegation

This skill delegates format details to reference files — read them when needed:

- **Color palette** → `references/color-palette.md` (semantic colors for light + dark mode)
- **Visual patterns** → `references/visual-patterns.md` (9 patterns with layout guidance)
- **JSON templates** → `references/element-templates.md` (copy-paste element templates)

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
Issue: [what went wrong — e.g., no rendering tool available, concept too ambiguous]
To resolve: [specific action needed]
```
