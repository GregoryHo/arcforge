---
name: arc-diagramming-obsidian
description: Use when the user wants to create an Excalidraw diagram, architecture visualization, flowchart, mind map, or any visual representation of concepts and relationships. Trigger on mentions of drawing, diagramming, visualizing, mapping, or illustrating ideas. Also trigger when arc-maintaining-obsidian delegates for Synthesis visuals that need more than embedded Mermaid. Even if the user just says "show me how this works visually" or "can you draw that?" — this skill applies.
---

# arc-diagramming-obsidian

Diagrams should ARGUE, not DISPLAY. A diagram is a visual argument — structure mirrors concept, shape carries meaning. If removing all text leaves a meaningless grid of boxes, the diagram has failed.

## Pipeline

Three phases, one diagram:

```
DESIGN → BUILD → VALIDATE → SAVE
```

You own the full workflow. For complex diagrams, delegate mechanical phases (Build, Validate, Save) to subagents that read from `agents/` — this keeps your context clean. For simple diagrams or when subagents aren't available, execute each phase yourself. The instructions below are self-contained either way.

## Design Process (Before Building)

### Step 0: Assess Depth

**Simple/Conceptual** (default) — Abstract shapes for mental models.
**Comprehensive/Technical** — Read `references/depth-enhancements.md` for additional steps: Research Mandate, Multi-Zoom Architecture, Evidence Artifacts.

### Step 1: Understand Deeply

For each concept: What does it DO? What relationships exist? What's the core transformation? What would someone need to SEE to understand this?

### Step 2: Map Concepts to Visual Patterns

| Pattern | Use Case | Structure |
|---------|----------|-----------|
| **Fan-Out** | One-to-many | Central element + radiating arrows |
| **Convergence** | Many-to-one | Multiple inputs merging |
| **Tree** | Hierarchy | Lines + free-floating text (no boxes) |
| **Timeline** | Sequences | Line + small dots + labels |
| **Spiral/Cycle** | Feedback loops | Elements with arrow returning to start |
| **Cloud** | Abstract state (memory, context) | Overlapping ellipses, varied sizes |
| **Assembly Line** | Transformation | Input → Process → Output |
| **Side-by-Side** | Comparison | Two parallel structures |
| **Gap/Break** | Phase boundaries | Visual whitespace or barrier |

Each major concept uses a different pattern. If two adjacent sections look the same, redesign one. Visual monotony kills comprehension.

Read `references/visual-patterns.md` for ASCII sketches, shape meaning tables, and when NOT to use each pattern.

### Step 3: Plan the Layout

**Zone ordering = logic ordering.** If the logical flow is A→B→C, zones must stack top to bottom in that order. When zone order matches logic, most arrows naturally flow downward.

**Clear sight lines.** For every planned arrow, check: is another element blocking the path? Fix element positioning, not arrow routing.

**Size hierarchy communicates importance:**
- Hero: 300×150 — visual anchor, most important concept
- Primary: 180×90 — major components
- Secondary: 120×60 — supporting elements
- Small: 60×40 — markers, minor nodes

**Whitespace = importance.** The hero element gets 200px+ of empty space around it.

**Symmetric concepts deserve symmetric visuals — do not fabricate a hero where none exists.** Hierarchy is a tool for *revealing real differences in importance*, not a default to apply everywhere. For `Input → Process → Output`, the three stages are conceptually equal; forcing Process to be larger implies it's more important, which the concept doesn't claim. Before picking a hero, ask: "Does the concept actually say this element matters more?" If no, give all peers the same size. Over-applying hierarchy makes diagrams lie; honest symmetry is often the stronger argument.

**Match the prompt's register — don't decorate past it.** If the user's prompt uses a single language, keep labels in that language. If the user asks for a "simple" diagram, resist adding hero sizing, bilingual subtitles, decorative titles, or color ceremonies they didn't request. Every extra detail is noise that dilutes the core message. Restraint is a skill, not a shortage.

**Container discipline:** Less than 30% of text in containers. Default to free-floating text. Container test: "Would this work without the box?" If yes, remove it.

For diagrams with 20+ elements or evidence artifacts, use `references/plan_layout.py` to compute coordinates automatically — it enforces systematic spacing and two-column separation (flow left, evidence right) that prevents the most common overlap defects.

#### Common Layout Traps (audit before building)

These defects recur across diagrams. Audit your plan against each — fixing them at design time is far cheaper than fixing them in Phase 2 iterations.

**Trap 1: Converging arrows collide with annotations.** When multiple arrows merge into one element, they travel through the *corridor below* the source elements. Annotations placed below source boxes (e.g., "sequential" under "Workflow") will be crossed by those arrows.
→ Fix: put annotations inside source boxes (as subtitle text in a taller box) or above them — never directly below when converging arrows follow.

**Trap 2: Back-edges routed through the source zone.** A back-edge from zone C up to zone A that travels horizontally at the Y-midpoint of zone B will cross zone B's elements.
→ Fix: route back-edge **down 40px below its source first**, then horizontally to the diagram edge, then up to the target. Three segments, not one.

**Trap 3: "yes" / "no" labels in fan-out exit paths.** Decision diamond labels placed at the bottom center will be crossed by any fan-out arrow exiting from the bottom.
→ Fix: offset labels laterally by 30px+ from the arrow's exit point, or place them along the arrow's horizontal run rather than the exit.

**Trap 4: Back-edge label overlapping its own arrow.** Free text describing a back-edge, placed at the arrow's vertical-run X, sits on the arrow line.
→ Fix: place the label at `arrow_x + 12` (to the right of the vertical run), not on it.

Mentally trace every arrow from source to target. If the path crosses an unrelated element, reposition BEFORE writing EA code.

### Step 4: Detect Theme (required — not optional)

```bash
obsidian eval code="document.body.classList.contains('theme-dark') ? 'dark' : 'light'"
```

**Why this is required, not optional:** choosing the wrong palette silently produces an unreadable diagram. A dark-mode user opening a light-palette diagram sees washed-out pastel; a light-mode user opening a dark-palette diagram sees near-invisible text. The Playwright renderer happily renders in whatever colors you picked, so there's no feedback loop to catch this.

**If `obsidian eval` returns no response within 5 seconds**, Obsidian isn't running with the plugin loaded. Do one of:
1. Ask the user to open Obsidian, then retry
2. Pick a palette based on prompt signals (user mentioned "dark mode")
3. Fall back to dark mode and **state the assumption in your completion output** so the user can correct it

Never silently assume dark mode — the assumption must be visible to the user.

All colors come from `references/color-palette.md`. Two hue families: ice blue (flow) and teal (action). Decision uses pale yellow as the sole warm breakpoint. Do not invent new colors.

### Step 5: Isomorphism Test

Before building: if you removed all text, would the structure alone communicate the concept? A fan-out visually says "one source, many outputs" without labels. If your diagram is just labeled boxes connected by arrows, the structure communicates nothing — redesign.

## Phase 1: Build with ExcalidrawAutomate

Create elements using the EA API via `obsidian eval`. EA handles text sizing and arrow binding automatically. The build ends by exporting all elements as a `.excalidraw` JSON file.

Before writing EA code, read `references/layout-heuristics.md` Part 1 for grid-based coordinate planning. For 20+ elements, run `references/plan_layout.py` to compute coordinates.

### Core Pattern

**`ea.reset()` is mandatory** at the start of every EA invocation — without it, elements accumulate from previous calls.

```javascript
(async () => {
  const ea = window.ExcalidrawAutomate;
  ea.reset();
  const s = ea.style;
  s.roughness = 0; s.opacity = 100; s.fillStyle = 'solid';
  s.fontFamily = 3; s.roundness = {type: 3};

  // --- Style BEFORE each element ---
  s.strokeColor = '#e2e8f0'; s.backgroundColor = '#1e40af'; s.fontSize = 16;
  const boxA = ea.addText(200, 50, 'Lead Session', {
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

Key rules:
- **Style before element** — `ea.style.*` applies to the NEXT element created
- **`addText` with box returns the BOX id** — use this for `connectObjects`, not the text id
- **Stagger anchors** when multiple arrows leave one shape (left/bottom/right, not all bottom)
- **Diamond text ≤12 chars** — diamonds have ~50% less usable area; use rectangles for longer labels
- **viewBackgroundColor** — `#1e1e1e` (dark) or `#ffffff` (light) per Step 4

Read `references/element-templates.md` for the full EA API reference, raw JSON templates for Phase 2 fixes, and the binding checklist.

**Mermaid shortcut:** For simple flowcharts under 10 elements, use `ea.addMermaid()` instead. Only flowchart type produces native editable elements — other Mermaid types fall back to SVG images.

## Phase 2: Validate (Mandatory)

You cannot judge a diagram from JSON alone. After building, render to PNG, check for overlaps, and fix. Up to 3 iterations — then save and report remaining issues.

```
ITERATION (repeat up to 3×):
  1. CHECK  — cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
                uv run python check_overlaps.py /tmp/diagram.excalidraw
  2. RENDER — cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
                uv run python render_excalidraw.py /tmp/diagram.excalidraw \
                --output /tmp/diagram.png --scale 2
              Then view /tmp/diagram.png — non-negotiable every iteration.
  3. JUDGE  — Design intent: correct patterns? Hero dominant?
              Defects: overlaps, crossings, uneven spacing, text too small?
  4. FIX    — Edit .excalidraw JSON directly (Read → find element → Edit x/y).
              Moving shapes does NOT break arrow binding.
              Never change element IDs — this orphans connected arrows.
              → Next iteration, or proceed to Save if clean.
```

Read `references/layout-heuristics.md` Part 2 for fix strategies: arrow waypoints, spacing rules, anchor distribution.

**First-time setup** (if renderer fails with missing deps):
```bash
cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
  uv sync && uv run playwright install chromium
```

**When to rebuild vs. JSON-edit:** Positional fixes (move, resize, spacing) → edit JSON. Structural changes (add/remove elements, change connections) → rebuild from Phase 1 with `ea.reset()`.

## Phase 3: Save to Vault

Preferred path: use `ea.create()` — it handles `.excalidraw.md` format correctly (compressed JSON, text indexing, frontmatter). Fallback path: manual canonical template when EA is unavailable.

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

### Fallback: Manual Canonical Format (only if EA unavailable)

**Only use this when `obsidian eval` returns no response within 5 seconds.** Before falling back, verify EA is truly unreachable:

```bash
obsidian eval code="typeof window.ExcalidrawAutomate"
# expected: "object" — if empty, EA plugin is not loaded
```

If EA is unavailable, manually construct `.excalidraw.md` using this EXACT template. Obsidian's plugin checks format heuristics — any deviation causes **silent corruption** (the canvas renders but markdown text bleeds through, and the Playwright renderer cannot detect this). Copy the structure byte-for-byte:

```
---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

# Excalidraw Data

## Text Elements
<text content> ^<elementId>

<text content> ^<elementId>

%%
## Drawing
```json
{...complete JSON from .excalidraw file...}
```
%%
```

**Format details that matter (silent failure if violated):**
- Blank lines INSIDE frontmatter block (`---\n\n...\n\n---`)
- `tags: [excalidraw]` **inline array** — NOT a YAML list (`  - excalidraw` breaks it)
- Warning line `==⚠  Switch to EXCALIDRAW VIEW...==` must be present (plugin's recognition marker)
- `# Excalidraw Data` single-hash parent heading before sub-sections
- Blank line between each `text ^id` entry in Text Elements
- `%%` wraps ONLY the `## Drawing` section (not Text Elements)

### Post-Save Verification

The `render_excalidraw.py` helper only reads raw `.excalidraw` JSON — pointing it at `.excalidraw.md` will fail with a JSON parse error. Two-step verification:

**Step 1 — Format markers present** (catches silent corruption from manual-fallback path):
```bash
python3 <<'EOF'
import sys
with open('<vault-path>/<name>.excalidraw.md') as f:
    content = f.read()
checks = {
    'plugin_parsed': 'excalidraw-plugin: parsed' in content,
    'tags_inline': 'tags: [excalidraw]' in content,
    'warning_line': '==⚠  Switch to EXCALIDRAW VIEW' in content,
    'heading': '# Excalidraw Data' in content,
}
missing = [k for k, v in checks.items() if not v]
if missing:
    print(f'CORRUPTED: missing {missing}')
    sys.exit(1)
print('Format OK')
EOF
```

**Step 2 — Canvas still renders** (catches JSON corruption from either save path):
```bash
python3 <<'EOF'
import re, json
with open('<vault-path>/<name>.excalidraw.md') as f:
    content = f.read()
# ea.create() uses compressed-json; manual fallback uses json
match = re.search(r'```(?:compressed-)?json\n(.*?)\n```', content, re.DOTALL)
if not match:
    raise RuntimeError('No json block found')
# For uncompressed path, validate JSON parses
if '```json' in content:
    json.loads(match.group(1))
    open('/tmp/verify.excalidraw', 'w').write(match.group(1))
EOF

cd ${ARCFORGE_ROOT}/skills/arc-diagramming-obsidian/references && \
  uv run python render_excalidraw.py /tmp/verify.excalidraw \
  --output /tmp/diagram-post-save.png --scale 2
```

If the post-save render doesn't match the pre-save validated version, the save corrupted the file — regenerate using the canonical template (not the one you just wrote).

### Embed in Wiki Notes

```markdown
![[diagram-name]]
```

Place outside bilingual callouts (diagrams are language-neutral).

## Delegation (Optional)

For complex diagrams, spawn a subagent for each mechanical phase to keep context clean. For simple diagrams or when subagents aren't available, follow the phases above directly — they are self-contained.

When delegating, pass the agent file and relevant context. Each subagent reads its instructions and the reference files it needs:

- **Build** — pass the design spec (theme, zones, elements, connections, patterns) and tell the subagent to read `agents/diagram-builder.md`. Output: `/tmp/diagram.excalidraw` + element count.
- **Validate** — pass the diagram path and a 1-2 sentence design intent summary. Tell the subagent to read `agents/diagram-validator.md`. Output: validated `.excalidraw` + PNG at `/tmp/diagram.png` + issues report.
- **Save** — pass the diagram path, filename, folder, and embed target. Tell the subagent to read `agents/diagram-saver.md`. Output: vault path of saved file.

**Quality gate:** After validation returns, view the PNG yourself before proceeding to Save. If it doesn't match your design intent, revise the spec and re-run Build, or give specific fix instructions to a new Validate pass.

### Reference Files

Read on demand — don't load all at once:
- `references/color-palette.md` — Semantic colors for light + dark mode
- `references/visual-patterns.md` — 9 patterns with layout guidance
- `references/element-templates.md` — Full EA API reference + raw JSON templates
- `references/layout-heuristics.md` — Grid planning (Part 1) + fix strategies (Part 2)
- `references/depth-enhancements.md` — Research, Multi-Zoom, Evidence (comprehensive only)
- `references/plan_layout.py` — Automatic coordinate computation for 20+ elements

### What to do yourself vs. delegate

Keep in-scope tasks yourself; route out-of-scope tasks to the dedicated skill. Reinventing vault lookup or theme detection burns context on work another skill does cleaner.

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
