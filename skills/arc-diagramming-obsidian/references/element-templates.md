# Element Templates & EA API Reference

Two ways to create Excalidraw elements: the **EA API** (recommended — handles text sizing and arrow binding automatically) and **raw JSON** (for Phase 3 manual fixes). Both produce the same output format.

## EA API (Phase 1: Build)

### Setup

```javascript
const ea = window.ExcalidrawAutomate;
ea.reset();
const s = ea.style;
s.roughness = 0;          // 0 = clean modern, 1 = hand-drawn
s.opacity = 100;
s.fillStyle = 'solid';
s.fontFamily = 3;         // monospace (Cascadia)
s.roundness = {type: 3};  // rounded corners for rectangles
```

### Text-in-Shape (auto-sized container)

The most useful method. Creates both the shape AND the text inside it with proper binding. Returns the **box ID** — use this for arrow connections.

```javascript
s.strokeColor = '#e2e8f0';         // text color
s.backgroundColor = '#1e40af';     // box fill color
s.fontSize = 16;

// Rectangle
const boxId = ea.addText(200, 100, 'Lead Session', {
  box: 'rectangle',
  boxPadding: 20,              // padding around text (default: 30)
  boxStrokeColor: '#60a5fa'    // box stroke (separate from text color)
});

// Diamond (for decisions)
const decId = ea.addText(400, 100, 'Both\nPASS?', {
  box: 'diamond',
  boxPadding: 24,
  boxStrokeColor: '#fbbf24'
});

// Ellipse (for start/end)
const startId = ea.addText(50, 100, 'Start', {
  box: 'ellipse',
  boxPadding: 18,
  boxStrokeColor: '#78716c'
});
```

**How it works:** EA measures the text dimensions at the current fontSize/fontFamily, creates the container at `(x - padding, y - padding)` with size `(textWidth + 2*padding, textHeight + 2*padding)`, creates the text with `containerId` pointing to the container, and adds `{type: "text", id: textId}` to the container's `boundElements`.

### Connected Arrows (auto-bound)

Creates an arrow between two shapes with proper bidirectional binding. Both shapes will list the arrow in their `boundElements`, and the arrow will have `startBinding` and `endBinding` pointing to the shapes.

```javascript
s.strokeColor = '#475569';  // arrow color (set before calling)

ea.connectObjects(boxA, 'bottom', boxB, 'top', {
  endArrowHead: 'arrow'     // 'arrow', 'bar', 'dot', 'triangle', 'diamond', null
});
```

**Anchors:** `'top'`, `'bottom'`, `'left'`, `'right'`, or `null` (auto-detect shortest path).

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `endArrowHead` | `'arrow'` | Arrowhead at target |
| `startArrowHead` | `null` | Arrowhead at source |
| `padding` | `10` | Gap between shape edge and arrow endpoint |
| `numberOfPoints` | `0` | Extra waypoints (0 = straight line) |

### Free-Floating Text

```javascript
s.strokeColor = '#93c5fd';  // text color
s.fontSize = 20;
ea.addText(40, 200, 'SECTION TITLE');  // no box option = free-floating
```

### Structural Lines

```javascript
s.strokeColor = '#64748b';
s.strokeWidth = 1;
s.strokeStyle = 'dashed';     // 'solid', 'dashed', 'dotted'
ea.addLine([[30, 200], [800, 200]]);  // horizontal separator
```

### Marker Dots

```javascript
s.backgroundColor = '#94a3b8';
s.strokeColor = '#94a3b8';
ea.addEllipse(94, 150, 12, 12);  // small filled dot
```

### Export to .excalidraw JSON

```javascript
const elements = ea.getElements();  // returns array of clean JSON objects
const json = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: elements,
  appState: { viewBackgroundColor: '#1e1e1e', gridSize: 20 },
  files: {}
};
require('fs').writeFileSync('/tmp/diagram.excalidraw', JSON.stringify(json, null, 2));
```

### Style Property Reference

Set these on `ea.style` BEFORE each element creation:

| Property | Values | Applies to |
|----------|--------|-----------|
| `strokeColor` | hex string | Text: text color. Arrows/lines: stroke color |
| `backgroundColor` | hex string | Shape fill color |
| `fontSize` | number | Text size in pixels |
| `fontFamily` | `3` (mono), `1` (hand), `2` (normal) | Font |
| `strokeWidth` | `1`, `2`, `3` | Line/arrow/shape border thickness |
| `strokeStyle` | `'solid'`, `'dashed'`, `'dotted'` | Line style |
| `roughness` | `0` (clean), `1` (hand-drawn) | Edge rendering |
| `fillStyle` | `'solid'`, `'hachure'`, `'cross-hatch'` | Fill pattern |
| `opacity` | `0`-`100` | Always use 100 |
| `roundness` | `{type: 3}` or `null` | Rounded corners for rectangles |
| `startArrowHead` | `'arrow'`, `null`, etc. | Arrow start style |
| `endArrowHead` | `'arrow'`, `null`, etc. | Arrow end style |

---

## Raw JSON Templates (Phase 3: Fix)

Use these when editing `.excalidraw` JSON directly during the validate loop. Replace placeholder colors with values from `color-palette.md`.

### File Wrapper

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [],
  "appState": {
    "viewBackgroundColor": "#1e1e1e",
    "gridSize": 20
  },
  "files": {}
}
```

### Rectangle

```json
{
  "type": "rectangle",
  "id": "process_rect",
  "x": 100, "y": 100, "width": 180, "height": 90,
  "strokeColor": "#93c5fd",
  "backgroundColor": "#172554",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 100001,
  "version": 1,
  "versionNonce": 100002,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": [{"id": "process_text", "type": "text"}],
  "link": null,
  "locked": false,
  "roundness": {"type": 3}
}
```

### Text (Centered in Shape)

`containerId` links to the parent shape. The parent's `boundElements` must include this text.

```json
{
  "type": "text",
  "id": "process_text",
  "x": 130, "y": 132,
  "width": 120, "height": 25,
  "text": "Process",
  "originalText": "Process",
  "fontSize": 16,
  "fontFamily": 3,
  "textAlign": "center",
  "verticalAlign": "middle",
  "strokeColor": "#e2e8f0",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 100003,
  "version": 1,
  "versionNonce": 100004,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false,
  "containerId": "process_rect",
  "lineHeight": 1.25
}
```

### Free-Floating Text

```json
{
  "type": "text",
  "id": "section_title",
  "x": 100, "y": 50,
  "width": 200, "height": 30,
  "text": "Section Title",
  "originalText": "Section Title",
  "fontSize": 20,
  "fontFamily": 3,
  "textAlign": "left",
  "verticalAlign": "top",
  "strokeColor": "#93c5fd",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 100030,
  "version": 1,
  "versionNonce": 100031,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false,
  "containerId": null,
  "lineHeight": 1.25
}
```

### Diamond

```json
{
  "type": "diamond",
  "id": "decision_diamond",
  "x": 100, "y": 100, "width": 140, "height": 100,
  "strokeColor": "#fbbf24",
  "backgroundColor": "#422006",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 100010,
  "version": 1,
  "versionNonce": 100011,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": [{"id": "decision_text", "type": "text"}],
  "link": null,
  "locked": false
}
```

### Arrow (Bound)

Bidirectional binding required — arrow references shapes AND shapes list the arrow.

```json
{
  "type": "arrow",
  "id": "arrow_a_to_b",
  "x": 282, "y": 145, "width": 118, "height": 0,
  "strokeColor": "#475569",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 100040,
  "version": 1,
  "versionNonce": 100041,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false,
  "points": [[0, 0], [118, 0]],
  "startBinding": {"elementId": "process_rect", "focus": 0, "gap": 4},
  "endBinding": {"elementId": "decision_diamond", "focus": 0, "gap": 4},
  "startArrowhead": null,
  "endArrowhead": "arrow"
}
```

### Line (Structural)

```json
{
  "type": "line",
  "id": "separator_line",
  "x": 30, "y": 200,
  "width": 800, "height": 0,
  "strokeColor": "#475569",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "dashed",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 100050,
  "version": 1,
  "versionNonce": 100051,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false,
  "points": [[0, 0], [800, 0]]
}
```

### Small Marker Dot

```json
{
  "type": "ellipse",
  "id": "marker_dot_1",
  "x": 94, "y": 150,
  "width": 12, "height": 12,
  "strokeColor": "#94a3b8",
  "backgroundColor": "#94a3b8",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 100060,
  "version": 1,
  "versionNonce": 100061,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false
}
```

---

## Text Width Estimation (for manual JSON only)

When editing JSON directly, estimate text width to prevent clipping:

```
minimum_width ≈ character_count × fontSize × 0.6
```

EA handles this automatically — only needed when creating elements by hand in Phase 3.

## Binding Checklist (for manual JSON only)

When creating arrows in raw JSON, ensure four-way binding:

1. Arrow `startBinding.elementId` → source shape ID
2. Arrow `endBinding.elementId` → target shape ID
3. Source shape's `boundElements` includes `{"id": "arrow_id", "type": "arrow"}`
4. Target shape's `boundElements` includes `{"id": "arrow_id", "type": "arrow"}`

EA's `connectObjects()` handles all four automatically.
