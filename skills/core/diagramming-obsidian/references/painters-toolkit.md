# Painter's Toolkit

A vocabulary of brushes. Not a menu to copy — a set of techniques you pick from based on what the current concept actually needs to communicate.

Each section gives:
- **Principle** — what the brush is and what it expresses
- **When it serves** — the concept shape that benefits from this
- **EA pattern** — the syntax to produce it
- **When not to use** — the anti-pattern to avoid

The core test across every brush: *does this communicate something labels alone don't?* If yes, the brush is working. If no, it's noise.

---

## Shape Variety

Shape carries semantic weight. Not all elements should be rectangles.

| Shape | Meaning | Use For |
|---|---|---|
| **Rectangle** | Discrete process step, named component | Transformations, subsystems, stable things with labels |
| **Rounded rectangle** | Process step with softer register | Conversational/informal context |
| **Ellipse** | Endpoint, source, sink, emergent/abstract concept | Start points, terminal results, inputs and outputs to the whole system |
| **Diamond** | Decision, branch (binary or small-n) | If/else, yes/no, condition checks |
| **Cloud / freeform** | Ambient, non-discrete, contextual state | Memory, context, "everything else" regions |

**When it serves:** When the diagram has distinct *roles* that benefit from visually distinct shapes. "This is a terminal, this is a process, this is a decision" becomes readable at a glance, before any label is read.

**EA pattern:**
```javascript
// Ellipse as a terminal node
ea.style.strokeColor = '#60a5fa'; ea.style.backgroundColor = 'transparent';
const startId = ea.addEllipse(50, 300, 120, 60);

// Rectangle as a process step
ea.style.backgroundColor = '#1e40af';
const procId = ea.addText(220, 300, 'Process', {
  box: 'rectangle', boxPadding: 20
});

// Diamond as a decision
ea.style.backgroundColor = '#f59e0b';
const decId = ea.addText(420, 310, 'OK?', {
  box: 'diamond', boxPadding: 20
});
```

**When not to use:** When shapes would imply distinctions the concept doesn't make. Three equal peer stages should all be rectangles — using rect/ellipse/diamond for them implies "these are different kinds of things" when they aren't.

---

## Subtitle Pattern

A small, muted text label placed directly below a main element — a short characterization without adding a box.

**Principle:** subtitles add semantic density without visual weight. The main label says *what the element is*; the subtitle hints at *how* or *with what*.

**When it serves:** When each element represents a process step that benefits from a short phrase characterizing its inputs, transformation, or output form. Adds information density without crowding the diagram.

**EA pattern:**
```javascript
// Main element (full weight)
ea.style.strokeColor = '#e2e8f0';
ea.style.backgroundColor = '#1e40af';
ea.style.fontSize = 16;
const main = ea.addText(x, y, 'Main Label', {
  box: 'rectangle', boxPadding: 20
});

// Subtitle directly below (muted, smaller, no box)
ea.style.strokeColor = '#94a3b8';   // slate-400, muted
ea.style.backgroundColor = 'transparent';
ea.style.fontSize = 11;
ea.addText(x + 10, y + boxHeight + 8, 'short descriptor');
```

**When not to use:** When the main label is already self-explanatory. When the subtitle would just restate the label. When the concept is abstract and has no "how/with what" to characterize.

---

## Zone Labels

Small-caps muted-color text at the start of a zone, naming the region without drawing a container around it.

**Principle:** zones can be communicated through typography alone. A title plus implicit whitespace boundary is often cleaner than drawing a container — the boundary is felt, not enclosed.

**When it serves:** Multi-zone diagrams where each zone has a distinct role or phase (two paths, three layers, before/after, read/write).

**EA pattern:**
```javascript
ea.style.strokeColor = '#5eead4';   // teal-300, muted
ea.style.fontSize = 12;
// All-uppercase gives a small-caps feel in standard EA fonts
ea.addText(zoneStartX, zoneStartY - 30, 'ZONE NAME');
```

**When not to use:** Single-zone diagrams (nothing to distinguish). When the zones already share a visual container (redundant — the container already named them). When the "zone" is just a handful of elements with no role distinction.

---

## Decorative Accents

Small dots, markers, or ellipses that suggest *state*, *content*, or *flow* inside or near a larger element.

**Principle:** when a concept has "stuff inside" (a store holds items, a queue holds events, an input emits data), small shapes at the boundary or interior make that contents visible without enumerating it.

**When it serves:** When the concept involves a container of items, a flow carrying discrete units, or a boundary that emits/receives data. The accents are tiny — they're hints, not structure.

**EA pattern:**
```javascript
// Small dots suggesting "this holds items"
ea.style.strokeColor = '#1e40af';
ea.style.backgroundColor = '#1e40af';
ea.addEllipse(containerX + 30, containerY + 20, 4, 4);
ea.addEllipse(containerX + 42, containerY + 38, 3, 3);
ea.addEllipse(containerX + 22, containerY + 52, 5, 5);
// Vary size and position slightly — regular grids look mechanical
```

**When not to use:** Sprinkled "to look pretty" without meaning. Inside elements that represent atomic operations (no contents to hint at). When the accents crowd the element's label.

---

## Zone Separators

A dashed horizontal (or vertical) line dividing two conceptual halves of a diagram.

**Principle:** when a diagram represents two phases (before/after, input-path/output-path, write-side/read-side) that share elements, a dashed separator makes the conceptual break explicit without disconnecting them. A solid line would imply hard separation; a dashed line says "same components, different phase."

**When it serves:** Two-phase architectures where both phases participate with shared components. Helps the reader hold both phases in mind simultaneously.

**EA pattern:**
```javascript
ea.style.strokeColor = '#64748b';   // slate-500
ea.style.strokeStyle = 'dashed';
ea.addLine([[leftX, midY], [rightX, midY]]);
```

**When not to use:** Single-phase diagrams. When the separator would cut through an element's natural position. When you're trying to create visual hierarchy — use whitespace plus zone labels instead.

---

## Container Usage

A container (a rectangle or rounded shape with children inside) expresses one of three things:

- **Grouping** — these items all belong to the same category or role
- **Containment** — this region holds internal pieces that matter to the concept
- **Boundary** — this is a layer, zone, or region with edges worth naming

**Principle:** boxes have semantic weight. When boxes express grouping/containment/boundary, they add clarity. When they don't, they add noise.

**When it serves:**
- Multiple children share a property worth naming ("all of these are X kind of thing")
- The region itself is a named concept in the diagram (a layer, phase, subsystem)
- The boundary itself is part of what the diagram communicates

**EA pattern:**
```javascript
// Grouping container — parent wraps children
ea.style.strokeColor = '#60a5fa';
ea.style.backgroundColor = 'transparent';
ea.style.fontSize = 14;
const parent = ea.addText(px, py, 'Category Name', {
  box: 'rectangle',
  boxPadding: 40,    // extra padding so children fit inside
  boxStrokeColor: '#60a5fa'
});
// Children are added as separate elements at positions within the
// parent's coordinate range — they each have their own styles.
```

**When not to use:**
- One label in a box when plain text communicates the same thing
- Every element wrapped — grouping dissolves when nothing is ungrouped
- A box that expresses nothing (no grouping, containment, or boundary — just "this word has a box around it because boxes look formal")
- Three-deep nesting when one or two levels would do

---

## Footer Annotations

Long-form clarification placed below the diagram — the "asterisk" that names invariants the shapes can't show.

**Principle:** some truths about a diagram are about *all* of it (global constraints, assumptions, read-order hints, immutability claims). A short footer captures these without cluttering individual elements.

**When it serves:** When the diagram's overall behavior has a constraint invisible in any single element — "operations run top-to-bottom", "the left column is immutable", "all edges are async unless marked". When the reader benefits from a short reminder of the diagram's frame.

**EA pattern:**
```javascript
ea.style.strokeColor = '#94a3b8';
ea.style.fontSize = 11;
ea.addText(footerX, footerY,
  'Constraint or context sentence that applies to the whole diagram.');
```

**When not to use:** When the footer repeats what the diagram already shows. When it's used to excuse a confusing design instead of fixing the diagram. When multiple footer lines would compete for attention — a single short sentence is the upper bound.

---

## Size Suggestions

Concrete size ranges for reference — pick based on real importance differences in the concept, not as defaults.

| Tier | Typical size (W × H) | When |
|---|---|---|
| **Hero** | 260-320 × 120-160 | One element is genuinely the most important (convergence point, the thing the diagram is about) |
| **Primary** | 160-200 × 70-100 | Major components of roughly equal weight |
| **Secondary** | 110-140 × 50-70 | Supporting elements beside primaries |
| **Small marker** | 50-80 × 30-50 | Minor nodes, state markers, anchor points |

**Principle:** scale is a claim about importance. Use hero sizing only when the concept says "this matters more" — otherwise match peer sizes.

**Whitespace:** the hero element earns 150-220px of empty space around it. Primaries get 60-100px buffer between peers.

**When not to use hero sizing:** symmetric concepts (three equal stages, parallel branches, Input → Process → Output). Applying hero sizing there implies hierarchy the concept doesn't claim — it makes the diagram lie.

---

## Color Beyond the Base Palette

`references/color-palette.md` defines the base semantic palette (ice blue for flow, teal for action, pale yellow for decision). The Painter's Toolkit extends this with **muted variants** used for non-primary elements:

| Purpose | Color | Example use |
|---|---|---|
| Subtitle text | `#94a3b8` (slate-400) | Below main labels |
| Zone label | `#5eead4` (teal-300) | Section headers like "ZONE NAME" |
| Separator line | `#64748b` (slate-500) | Dashed horizontal dividers |
| Footer text | `#94a3b8` (slate-400) | Bottom-of-diagram annotations |

These are muted by design — they're supporting the main elements, not competing with them. Don't promote them to full-saturation palette colors unless the concept specifically needs them.

---

## Reading Order

These brushes compose. A single diagram might use shape variety (ellipses at endpoints, rects in the middle) + subtitles (on each process step) + zone labels (naming two paths) + a separator (dividing them) + a decorative accent (inside one element) + a footer (one-line constraint).

Not every diagram needs every brush. Pick based on what the concept actually has to communicate. The test, always: *does this brush communicate something labels alone don't?*

When in doubt, start lean and add. Subtractive edits after building are harder than additive ones — a brush you didn't use costs nothing; a brush you added without justification is clutter you now have to remove.
