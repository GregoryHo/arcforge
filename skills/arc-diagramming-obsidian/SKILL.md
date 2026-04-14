---
name: arc-diagramming-obsidian
description: Use when the user wants to create an Excalidraw diagram, architecture visualization, flowchart, mind map, or any visual representation of concepts and relationships. Trigger on mentions of drawing, diagramming, visualizing, mapping, or illustrating ideas. Also trigger when arc-maintaining-obsidian delegates for Synthesis visuals that need more than embedded Mermaid. Even if the user just says "show me how this works visually" or "can you draw that?" — this skill applies.
---

# arc-diagramming-obsidian

Diagrams should ARGUE, not DISPLAY. A diagram is a visual argument — structure mirrors concept, shape carries meaning. If removing all text leaves a meaningless grid of boxes, the diagram has failed.

## Pipeline

```
DESIGN → BUILD → VALIDATE → SAVE
```

You own the full workflow. For complex diagrams, delegate mechanical phases (Build, Validate, Save) to subagents that read from `agents/` — this keeps your context clean. For simple diagrams or when subagents aren't available, execute each phase yourself. The instructions below are self-contained either way.

The rest of this skill is split into two layers of guidance:

- **HARD** — physical and mechanical invariants. The tools can verify these, or violating them silently corrupts the output. Non-negotiable.
- **SOFT** — concept judgments. Depend on what you're drawing, not on what the tools require. Reasoning, not rules.

Both layers apply across all four phases.

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

HARD keeps the diagram technically valid. SOFT is where you make it *good*. These are concept judgments — they depend on what you're drawing.

### Think First, Draw Second

For each major concept in the diagram, answer before reaching for shapes:

- What does it DO? (the verb — not the noun)
- What relationships exist with other elements?
- What's the core transformation (input → output, state A → state B)?
- What would someone need to SEE to understand this?

### Reasoning About What to Add

Every element should serve the concept. Before adding anything, ask: *what does this communicate that labels alone don't?*

If the answer is "nothing" — the element is noise. If the answer is "this is where the flow starts" / "this is state the user should sense" / "this is a zone boundary" / "this shows the concept is symmetric" — the element is doing work.

Two registers to match:

- **Language register.** If the prompt is monolingual, keep labels in that language. Don't add bilingual subtitles unless asked.
- **Conceptual register.** If the concept is symmetric (three equal stages, parallel peers, `Input → Process → Output`), give peers the same size. Hero sizing implies real importance — don't fabricate one where the concept doesn't claim it.

Decoration is not the enemy. *Unjustified* decoration is.

### Scale Reflects Real Importance

When one element is genuinely more important than peers (a convergence point that everything flows into, the hero concept the diagram is *about*), size it larger. When peers are genuinely equal, size them equally. Concrete size ranges are in `references/painters-toolkit.md` — they're suggestions for reference, not mandated tiers.

### Isomorphism Self-Check (Heuristic)

Before building, ask: if I removed all text from this design, would the structure communicate anything about the concept? A fan-out says "one source, many outputs" without any labels. A convergence says "many inputs, one result." A cycle says "feedback."

If your planned structure is just "labeled boxes connected by arrows" with no isomorphism to the concept — the structure isn't doing work. Revisit.

This is a check, not a gate. Sometimes "A connects to B" is genuinely what the concept says, and that's fine. But the check prompts verification before committing.

### The Painter's Toolkit

Shape variety, subtitles, zone labels, decorative accents, separators, containers, footer annotations — these are your brushes. Read `references/painters-toolkit.md` during design to see the full vocabulary, then pick what serves the current concept.

Not a menu to copy from. A vocabulary to pick from.

### Visual Patterns (Reference)

For pattern inspiration — fan-out, convergence, tree, timeline, spiral/cycle, cloud, assembly line, side-by-side, gap — see `references/visual-patterns.md`. Each pattern has ASCII sketches, shape-meaning tables, and "when NOT to use."

Each major concept in a diagram typically uses a different pattern. If two adjacent sections look structurally identical, consider redesigning one — visual monotony kills comprehension.

### Depth and Layout Planning

- For comprehensive/technical depth (research mandate, multi-zoom architecture, evidence artifacts), see `references/depth-enhancements.md`.
- For diagrams with 20+ elements or evidence artifacts, use `references/plan_layout.py` to compute coordinates automatically — it enforces systematic spacing and two-column separation that prevents the most common overlap defects.

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

Key build rules (these restate the mechanical invariants above in context):

- **Style before element** — `ea.style.*` applies to the NEXT element created
- **`addText` with box returns the BOX id** — use this for `connectObjects`, not the text id
- **Stagger anchors** when multiple arrows leave one shape (left/bottom/right, not all bottom)
- **Diamond text ≤ 12 chars** — diamonds have ~50% less usable area than rectangles
- **`viewBackgroundColor`** — `#1e1e1e` (dark) or `#ffffff` (light), per Step 4

Read `references/element-templates.md` for the full EA API reference, raw JSON templates for Phase 2 fixes, and the binding checklist.

**Mermaid shortcut:** For simple flowcharts under 10 elements, use `ea.addMermaid()` instead. Only flowchart type produces native editable elements — other Mermaid types fall back to SVG images.

---

## Phase 2: Validate (Mandatory)

After building, render to PNG, view it, fix defects. Up to 3 iterations — then save and report remaining issues.

```
ITERATION (repeat up to 3×):
  1. CHECK  — cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
                uv run python check_overlaps.py /tmp/diagram.excalidraw
  2. RENDER — cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
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

`ea.elementsDict` is a documented public property used in official Excalidraw scripts.

### Fallback: Manual Canonical Format

Only use when `obsidian eval code="typeof window.ExcalidrawAutomate"` returns empty (EA plugin unavailable). Obsidian checks format heuristics — any deviation causes silent corruption. Read `references/save-format.md` for the byte-exact template.

### Post-Save Verification (Mandatory)

```bash
cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
  uv run python verify_saved_diagram.py <vault-path>/<name>.excalidraw.md
```

Exits non-zero on format corruption or render mismatch. For the manual-fallback path, also compares the re-rendered PNG against `/tmp/diagram.png` to catch JSON corruption. If verification fails, regenerate using the canonical template from `references/save-format.md` — not the file you just wrote.

### Embed in Wiki Notes

```markdown
![[diagram-name]]
```

Place outside bilingual callouts (diagrams are language-neutral).

---

## Delegation (Optional)

For complex diagrams, spawn a subagent for each mechanical phase to keep context clean. For simple diagrams or when subagents aren't available, follow the phases above directly.

When delegating, pass the agent file and relevant context. Each subagent reads its instructions and the reference files it needs:

- **Build** — pass the design spec (theme, zones, elements, connections, brushes chosen) and tell the subagent to read `agents/diagram-builder.md`. Output: `/tmp/diagram.excalidraw` + element count.
- **Validate** — pass the diagram path and a 1-2 sentence design intent summary. Tell the subagent to read `agents/diagram-validator.md`. Output: validated `.excalidraw` + PNG at `/tmp/diagram.png` + issues report.
- **Save** — pass the diagram path, filename, folder, and embed target. Tell the subagent to read `agents/diagram-saver.md`. Output: vault path of saved file.

**Quality gate:** After validation returns, view the PNG yourself before proceeding to Save. If it doesn't match your design intent, revise the spec and re-run Build, or give specific fix instructions to a new Validate pass.

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

### What to do yourself vs. delegate

Keep in-scope tasks yourself; route out-of-scope tasks to the dedicated skill.

| Task | Do yourself | Delegate to |
|------|------------|-------------|
| Generate elements (EA API or raw JSON) | ✓ | — |
| Render to PNG (Playwright) | ✓ | — |
| Check overlaps (`check_overlaps.py`) | ✓ | — |
| Layout planning (`plan_layout.py`) | ✓ | — |
| Detect Obsidian theme | — | `obsidian:obsidian-cli` (via `obsidian eval`) |
| Find vault path / search existing notes | — | `obsidian:obsidian-cli` |
| Write `.excalidraw.md` to vault | ✓ (direct filesystem write) — OR `ea.create()` | — |
| Embed diagram in a wiki note | — | `obsidian:obsidian-cli` + `obsidian:obsidian-markdown` |
| Reload a changed diagram in Obsidian | — | `obsidian:obsidian-cli` |

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
