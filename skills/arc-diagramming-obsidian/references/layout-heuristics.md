# Layout Heuristics

Specific fix strategies for common layout problems. Read this during Phase 3 (Validate) when the overlap checker or visual inspection reveals issues.

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
