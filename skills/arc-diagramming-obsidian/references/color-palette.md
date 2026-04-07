# Cool Minimal Color Palette

Two hue families — ice blue (flow) and teal (action). Decision uses pale yellow as sole warm breakpoint. All diagrams use this palette exclusively.

## Light Mode (white canvas: `#ffffff`)

### Shape Colors

| Semantic | Fill | Stroke | Use |
|----------|------|--------|-----|
| Neutral | `#f5f5f4` | `#78716c` | General elements, entry points |
| Primary | `#f0f9ff` | `#475569` | Main flow nodes |
| Primary-mid | `#e0f2fe` | `#475569` | Secondary nodes |
| Primary-deep | `#dbeafe` | `#475569` | Emphasized nodes |
| Decision | `#fefce8` | `#92400e` | Decision/judgment — only warm color |
| Hub | `#f1f5f9` | `#475569` | Convergence points (Vault, aggregators) |
| Action | `#f0fdfa` | `#115e59` | Operations, output actions |
| Action-mid | `#ccfbf1` | `#115e59` | Operation emphasis |
| Action-deep | `#99f6e4` | `#115e59` | Operation highlight |

### Text Colors

| Level | Color | Use |
|-------|-------|-----|
| Title | `#1e3a5f` | Section headings, major labels |
| Body | `#374151` | Text inside shapes, descriptions |
| Detail | `#64748b` | Annotations, metadata |

### Arrow & Line Colors

| Element | Color |
|---------|-------|
| Arrows | `#cbd5e1` |
| Structural lines (trees, timelines) | `#94a3b8` |
| Marker dots (fill + stroke) | `#475569` |

### Evidence Artifacts

| Artifact | Background | Text |
|----------|------------|------|
| Code snippet | `#1e293b` | Syntax-colored |
| JSON/data | `#1e293b` | `#22c55e` (green) |

## Dark Mode (dark canvas: `#1e1e1e`)

### Shape Colors

| Semantic | Fill | Stroke | Use |
|----------|------|--------|-----|
| Neutral | `#292524` | `#a8a29e` | General elements, entry points |
| Primary | `#172554` | `#93c5fd` | Main flow nodes |
| Primary-mid | `#1e3a5f` | `#7dd3fc` | Secondary nodes |
| Primary-deep | `#1e40af` | `#60a5fa` | Emphasized nodes |
| Decision | `#422006` | `#fbbf24` | Decision/judgment — only warm color |
| Hub | `#1e293b` | `#94a3b8` | Convergence points |
| Action | `#042f2e` | `#5eead4` | Operations, output actions |
| Action-mid | `#115e59` | `#2dd4bf` | Operation emphasis |
| Action-deep | `#0d9488` | `#14b8a6` | Operation highlight |

### Text Colors

| Level | Color | Use |
|-------|-------|-----|
| Title | `#93c5fd` | Section headings, major labels |
| Body | `#e2e8f0` | Text inside shapes, descriptions |
| Detail | `#94a3b8` | Annotations, metadata |

### Arrow & Line Colors

| Element | Color |
|---------|-------|
| Arrows | `#475569` |
| Structural lines | `#64748b` |
| Marker dots | `#94a3b8` |

### Evidence Artifacts

| Artifact | Background | Text |
|----------|------------|------|
| Code snippet | `#0f172a` | Syntax-colored |
| JSON/data | `#0f172a` | `#4ade80` (green) |

## Rules

1. Do not invent new colors — every element uses a color from this file
2. Always pair darker stroke with lighter fill (light mode) or lighter stroke with darker fill (dark mode)
3. If a concept doesn't fit a semantic category, use Primary
4. Opacity is always 100 — use color, size, and stroke width for hierarchy instead of transparency
