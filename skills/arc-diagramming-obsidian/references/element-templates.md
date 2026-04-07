# Excalidraw Element Templates

Copy-paste JSON templates for each element type. Replace placeholder colors with values from `color-palette.md` based on semantic purpose.

## File Wrapper

Every `.excalidraw` file starts with this structure:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": 20
  },
  "files": {}
}
```

Set `viewBackgroundColor` to `#1e1e1e` for dark mode.

## Rectangle

```json
{
  "type": "rectangle",
  "id": "process_rect",
  "x": 100, "y": 100, "width": 180, "height": 90,
  "strokeColor": "#475569",
  "backgroundColor": "#f0f9ff",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
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

## Diamond

```json
{
  "type": "diamond",
  "id": "decision_diamond",
  "x": 100, "y": 100, "width": 140, "height": 100,
  "strokeColor": "#92400e",
  "backgroundColor": "#fefce8",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
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

## Ellipse

```json
{
  "type": "ellipse",
  "id": "start_ellipse",
  "x": 100, "y": 100, "width": 120, "height": 80,
  "strokeColor": "#78716c",
  "backgroundColor": "#f5f5f4",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "angle": 0,
  "seed": 100020,
  "version": 1,
  "versionNonce": 100021,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": [{"id": "start_text", "type": "text"}],
  "link": null,
  "locked": false
}
```

## Text (Centered in Shape)

The `containerId` links this text to its parent shape. The parent's `boundElements` must include `{"id": "...", "type": "text"}`.

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
  "strokeColor": "#374151",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
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

## Free-Floating Text (No Container)

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
  "strokeColor": "#1e3a5f",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
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

## Arrow

Arrows require bidirectional binding — the arrow references the shapes, AND each shape must list the arrow in its `boundElements`.

```json
{
  "type": "arrow",
  "id": "arrow_a_to_b",
  "x": 282, "y": 145, "width": 118, "height": 0,
  "strokeColor": "#cbd5e1",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
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
  "startBinding": {"elementId": "process_rect", "focus": 0, "gap": 2},
  "endBinding": {"elementId": "decision_diamond", "focus": 0, "gap": 2},
  "startArrowhead": null,
  "endArrowhead": "arrow"
}
```

For curved arrows: use 3+ points in the `points` array.

## Line (Structural, Not Arrow)

Use for timelines, tree trunks, dividers — anything that shows structure without direction.

```json
{
  "type": "line",
  "id": "timeline_trunk",
  "x": 100, "y": 100,
  "width": 0, "height": 300,
  "strokeColor": "#94a3b8",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
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
  "points": [[0, 0], [0, 300]]
}
```

## Small Marker Dot (10-20px)

Use as timeline markers, bullet points, connection nodes.

```json
{
  "type": "ellipse",
  "id": "marker_dot_1",
  "x": 94, "y": 150,
  "width": 12, "height": 12,
  "strokeColor": "#475569",
  "backgroundColor": "#475569",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 1,
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

## Binding Checklist

When connecting elements with arrows:

1. Arrow's `startBinding.elementId` → source shape ID
2. Arrow's `endBinding.elementId` → target shape ID
3. Source shape's `boundElements` array must include `{"id": "arrow_id", "type": "arrow"}`
4. Target shape's `boundElements` array must include `{"id": "arrow_id", "type": "arrow"}`

Missing any of these four causes arrows to detach from shapes.
