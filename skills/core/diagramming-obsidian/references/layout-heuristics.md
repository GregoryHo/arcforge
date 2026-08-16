# Layout Heuristics

Two parts: **preventive planning** (read during Phase 1 Build) and **corrective fixes** (read during Phase 2 Validate).

---

## Part 1: Preventive Planning (Phase 1)

Read this BEFORE writing the EA build script. Good spacing prevents 80% of overlap issues.

### Grid-Based Coordinate Planning

Before calling any EA API method, plan your layout on a virtual grid:

```
Columns: x = 50, 250, 450, 650, 850, ...  (200px increments)
Rows:    y = 50, 200, 350, 500, 650, ...   (150px increments)
```

This ensures minimum 40px gap between Primary-sized elements (180px wide, 200px column spacing = 20px gap on each side).

For Hero elements (300px wide), skip a column — they occupy two grid slots.

### Zone Layout Template

For multi-zone diagrams (like the teammates architecture), plan vertical space per zone:

```
Zone 1 title:    y = 30
Zone 1 elements: y = 70 to 170
Separator:       y = 200
Zone 2 title:    y = 220
Zone 2 elements: y = 260 to 360
Separator:       y = 390
Zone 3 title:    y = 410
Zone 3 elements: y = 450 to 550
```

Each zone gets 170px of element space + 30px gap to separator. Adjust zone height based on content — more elements = taller zone.

### Evidence Artifact Placement

Evidence artifacts (code/JSON blocks) are large — typically 250-300px wide and 200-280px tall. They MUST NOT share Y-space with flow elements.

**Two strategies:**

**Strategy A: Below-step placement** (simpler, works for vertical flows)
```
Flow element:     y = 200
Evidence block:   y = 310  (flow.y + flow.height + 20)
Next flow element: y = 600  (evidence.y + evidence.height + 20)
```

**Strategy B: Side lane** (compact, works for horizontal flows)
```
Flow lane:      x = 50 to 400
Evidence lane:  x = 450 to 800
```

The key rule: **evidence blocks are NOT inline labels — they are large shapes that need their own space.**

### Arrow Corridor Reservation

Leave at least 60px between shapes for arrows to route through without crossing other elements:

```
[Shape A]  ←60px→  [Shape B]
              ↑
         arrow corridor
```

For fan-out patterns, make the corridor wider (100px) since multiple arrows share it.

### Cross-Zone Arrow Routing

When arrows cross zones, the most common mistake is trying to fix routing while the layout is wrong. **If connectObjects produces an arrow that crosses through unrelated elements, the first response should be: is my layout wrong?**

**Root cause of most crossings: zone ordering doesn't match logical flow.** If the logical sequence is A→B→C and zones are ordered A→C→B (top to bottom), arrows from A to B must cross zone C. No routing technique fixes this — reorder zones to A→B→C.

**When layout is correct but arrows still cross zone titles/separators:**

Use `connectObjects` with explicit anchors to control direction. When an arrow must pass a separator line, ensure adequate vertical spacing (60px+) between the separator and elements on both sides — this gives the arrow room to cross the separator in empty space rather than through text.

```javascript
// Cross-zone arrow: explicit anchors control direction
ea.connectObjects(stepA, 'bottom', stepB, 'top', {
  endArrowHead: 'arrow'
});
// Works cleanly when:
// 1. stepA is directly above stepB (same column or close)
// 2. Nothing sits between them except empty separator space
// 3. Separator has 60px+ clearance above and below
```

**Back-edges (retry loops, error paths):** These rare arrows go against the primary flow. Route them along the diagram edge (far left or far right) using `connectObjects` with 'left'/'right' anchors, or `addArrow` with waypoints along the edge. Use a distinct style (dashed, different color) so readers know it's not part of the main flow.

```javascript
// Retry loop along right edge
s.strokeStyle = 'dashed';
s.strokeColor = '#fbbf24';  // distinct color
ea.connectObjects(rejectNode, 'right', targetNode, 'right', {
  endArrowHead: 'arrow'
});
```

**Prefer connectObjects over addArrow.** connectObjects produces bound arrows that snap to shape edges and maintain visual connection as shapes move. addArrow produces unbound arrows that float independently — they look disconnected and don't snap. Only use addArrow when connectObjects genuinely cannot route cleanly after layout optimization.

### Stagger connectObjects Anchors

When multiple arrows leave the same shape, distribute across different anchors:

```javascript
// BAD — all from 'bottom', arrows overlap
ea.connectObjects(lead, 'bottom', wt1, 'top', ...);
ea.connectObjects(lead, 'bottom', wt2, 'top', ...);
ea.connectObjects(lead, 'bottom', wt3, 'top', ...);

// GOOD — spread across anchors
ea.connectObjects(lead, 'left',   wt1, 'top', ...);
ea.connectObjects(lead, 'bottom', wt2, 'top', ...);
ea.connectObjects(lead, 'right',  wt3, 'top', ...);
```

---

## Part 2: Corrective Fixes (Phase 2)

Read this when the overlap checker or visual inspection reveals issues.

## Arrow Crossing Through Shapes

**Problem:** An arrow passes through a shape it's not connected to.

**Fix:** Add an intermediate waypoint to route the arrow around the shape. In the `.excalidraw` JSON, add a point to the arrow's `points` array:

```json
// Before: straight line that crosses a shape
"points": [[0, 0], [300, 200]]

// After: route above the shape via waypoint
"points": [[0, 0], [150, -40], [300, 200]]
```

**How to choose the waypoint:**
- The overlap checker reports the crossing point and suggests a waypoint
- Route above (`y - 30`) or below (`y + 30`) the crossed shape, whichever is closer to the arrow's natural path
- For vertical arrows crossing horizontal shapes: route left or right
- Keep waypoints aligned with the arrow's general direction — don't create sharp zigzags

**Prevention during Phase 1 (Build):**
- Use `connectObjects` with explicit anchors (`'top'`, `'bottom'`, `'left'`, `'right'`) to control arrow direction
- When two elements are not vertically or horizontally aligned, use `numberOfPoints: 1` to add a natural midpoint
- Stagger arrows from the same shape: don't connect 3 arrows all from `'bottom'` — use `'bottom'`, `'left'`, `'right'`

## Overlapping Shapes

**Problem:** Two shapes' bounding boxes intersect.

**Fix:** Increase spacing by adjusting `x` and `y` coordinates in the JSON.

**Rules of thumb:**
- Minimum 40px gap between shapes at the same hierarchy level
- Minimum 80px gap between shapes in different sections/zones
- Hero elements need 120px+ clearance on all sides

**Prevention during Phase 1:**
- Plan coordinates on a grid: x increments of 200px for columns, y increments of 150px for rows
- Leave 200px vertical gap between zone separator lines and the elements above/below them

## Text Overlapping Shapes

**Problem:** A free-floating label overlaps a shape it's not contained in.

**Fix:** Move the text element. Common patterns:
- Labels above shapes: place at `shape.y - 25` (for fontSize 14)
- Labels below shapes: place at `shape.y + shape.height + 8`
- Section titles: place 30px above the first element in the section

**Prevention during Phase 1:**
- Place free-floating text BEFORE the shapes it describes — this forces you to think about spacing
- Use consistent vertical offsets: titles at `y - 30`, subtitles at `y - 12`

## Text Overlapping Text

**Problem:** Two free-floating text elements are too close.

**Fix:** Increase vertical or horizontal spacing. Minimum gaps by font size:
- fontSize 20+: 35px vertical gap
- fontSize 14-16: 25px vertical gap
- fontSize 10-12: 18px vertical gap

## Arrow Congestion (Multiple Arrows in Same Corridor)

**Problem:** Multiple arrows share the same path, creating visual noise.

**Fix strategies:**
1. **Stagger anchors**: Instead of all arrows from `'bottom'`, distribute across `'bottom'`, `'left'`, `'right'`
2. **Offset parallel arrows**: For arrows going the same direction, offset them horizontally by 20-30px using waypoints
3. **Use a spine**: For fan-out patterns, draw one arrow from the source to a midpoint, then branch from there

**Example — fan-out with spine:**
```javascript
// Instead of 3 arrows from Lead to each Worktree:
ea.connectObjects(lead, 'bottom', wt1, 'top', {endArrowHead: 'arrow'});
ea.connectObjects(lead, 'bottom', wt2, 'top', {endArrowHead: 'arrow'});
ea.connectObjects(lead, 'bottom', wt3, 'top', {endArrowHead: 'arrow'});

// Use a spine point and branch:
// 1. Arrow from Lead bottom to a midpoint (no arrowhead)
// 2. Three short arrows from midpoint area to each Worktree
// This spreads traffic across a wider corridor
```

## Zone Separator Spacing

**Problem:** Dashed separator lines are too close to elements above or below them.

**Fix:** Ensure at least 30px between the separator line and the nearest element on each side.

**In JSON terms:**
```
separator.y should be:
  > (highest element above).y + (its height) + 30
  < (lowest element below).y - 30
```

## General Spacing Rules

| Between | Minimum gap |
|---------|-------------|
| Same-level shapes | 40px |
| Cross-section shapes | 80px |
| Hero element clearance | 120px |
| Text label to described shape | 8px |
| Section title to first element | 30px |
| Separator line to nearest element | 30px |
| Parallel arrows | 20px offset |
