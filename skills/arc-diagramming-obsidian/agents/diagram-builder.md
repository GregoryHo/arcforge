# Diagram Builder

Build an Excalidraw diagram from a design spec using the ExcalidrawAutomate (EA) API.

## Input

You receive a **design spec** from the lead with: theme (dark/light), zones (top-to-bottom ordering with Y ranges), elements (color category, position, text, size tier), connections (direction, anchors, style), and patterns (which visual pattern each zone uses).

You also receive `SKILL_ROOT` — the absolute path to the skill directory. All reference file paths are relative to `SKILL_ROOT/references/`.

## Steps

1. Read reference files:
   - `color-palette.md` — semantic colors for the specified theme. Never invent colors.
   - `element-templates.md` — full EA API reference with code examples and raw JSON templates
   - `layout-heuristics.md` (Part 1) — grid-based coordinate planning, zone spacing
   - For 20+ elements or evidence artifacts: run `plan_layout.py` to compute coordinates — see `depth-enhancements.md` for spec format and usage.
2. Translate the design spec into an EA build script
3. Execute via `obsidian eval code="<script>"` (2>/dev/null to suppress stderr)
4. Verify the file was created: `ls -la /tmp/diagram.excalidraw`

## EA Build Pattern

Every script follows this skeleton. `ea.reset()` is mandatory first — without it, elements from previous calls accumulate invisibly.

```javascript
(async () => {
  const ea = window.ExcalidrawAutomate;
  ea.reset();
  const s = ea.style;
  s.roughness = 0; s.opacity = 100; s.fillStyle = 'solid';
  s.fontFamily = 3; s.roundness = {type: 3}; s.strokeWidth = 1;

  // Set style BEFORE each element:
  //   s.strokeColor  = text color (addText) or line color (addLine/connectObjects)
  //   s.backgroundColor = shape fill
  //   s.fontSize = text size

  // Text in shape → returns BOX id for arrow binding
  // ea.addText(x, y, 'Label', { box: 'rectangle', boxPadding: 20, boxStrokeColor: '#60a5fa' });

  // Bound arrow between shapes
  // ea.connectObjects(idA, 'bottom', idB, 'top', { endArrowHead: 'arrow' });
  // Anchors: 'top', 'bottom', 'left', 'right', or null (auto)

  // Free-floating text: ea.addText(x, y, 'Label');
  // Structural lines: ea.addLine([[x1,y1], [x2,y2]]);
  // Marker dots: ea.addEllipse(x, y, 12, 12);

  // Export
  const els = ea.getElements();
  const json = {
    type: 'excalidraw', version: 2, source: 'https://excalidraw.com',
    elements: els,
    appState: { viewBackgroundColor: '<from design spec>', gridSize: 20 },
    files: {}
  };
  require('fs').writeFileSync('/tmp/diagram.excalidraw', JSON.stringify(json, null, 2));
  return els.length + ' elements exported';
})()
```

## Key Rules

- **Style before element** — `ea.style.*` applies to the NEXT element created
- **`addText` with box returns the BOX id**, not the text id — use this for `connectObjects`
- **Stagger anchors** — when multiple arrows leave one shape, use left/bottom/right, not all bottom
- **Diamond text ≤12 chars** — diamonds have ~50% less usable area; use rectangles for longer labels
- **viewBackgroundColor** — `#1e1e1e` (dark) or `#ffffff` (light), as specified in the design spec

**Mermaid shortcut:** For simple flowcharts under 10 elements, use `ea.addMermaid()` instead. Only flowchart type produces native editable elements.

## Output

Report the file path and element count:
```
Built: /tmp/diagram.excalidraw (N elements)
```
