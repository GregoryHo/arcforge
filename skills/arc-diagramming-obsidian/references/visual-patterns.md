# Visual Patterns Reference

## 9 Patterns

### 1. Fan-Out (One-to-Many)

```
           ○
          ↗
    □ → ○
          ↘
           ○
```

**Use when:** A single source produces multiple outputs — PRDs, root causes, central hubs, dispatch.
**Don't use when:** Outputs are sequential (use Timeline instead).
**Size:** Central element = Hero or Primary. Targets = Secondary.

### 2. Convergence (Many-to-One)

```
  ○ ↘
  ○ → □
  ○ ↗
```

**Use when:** Multiple inputs merge into one result — aggregation, funnels, synthesis.
**Don't use when:** Inputs don't actually merge (use Side-by-Side instead).
**Size:** Inputs = Secondary. Target = Hero or Primary.

### 3. Tree (Hierarchy)

```
  label
  ├── label
  │   ├── label
  │   └── label
  └── label
```

**Use when:** Parent-child nesting — file systems, org charts, taxonomies.
**Implementation:** Use `line` elements for trunk/branches + free-floating text. No boxes.
**Size:** Root = Primary text size. Leaves = Secondary text size.

### 4. Timeline (Sequence)

```
  ●─── Label 1
  │
  ●─── Label 2
  │
  ●─── Label 3
```

**Use when:** Ordered steps in time or process.
**Implementation:** Line + small marker dots (10-20px ellipses) at intervals + free-floating text labels.
**Size:** Dots = Small (12px). Labels = free-floating text.

### 5. Spiral/Cycle (Continuous Loop)

```
  □ → □
  ↑     ↓
  □ ← □
```

**Use when:** Feedback loops, iterative processes, evolution.
**Don't use when:** Process has a clear end (use Assembly Line instead).
**Size:** All elements = Primary (equal weight in a cycle).

### 6. Cloud (Abstract State)

**Use when:** Context, memory, conversations, mental states — anything fuzzy/unbounded.
**Implementation:** 3-5 overlapping ellipses with varied sizes and slight opacity.
**Size:** Varied — largest = Primary, others = Secondary/Small.

### 7. Assembly Line (Transformation)

```
  ○○○ → [PROCESS] → □□□
  chaos              order
```

**Use when:** Clear input-to-output transformation — data processing, conversion, compilation.
**Size:** Process box = Hero. Input/output = Secondary.

### 8. Side-by-Side (Comparison)

**Use when:** Before/after, options, trade-offs, competing approaches.
**Implementation:** Two parallel structures with visual contrast (different colors or sizes).
**Size:** Both sides = Primary (equal weight for fair comparison).

### 9. Gap/Break (Separation)

**Use when:** Phase changes, context resets, boundaries between distinct concepts.
**Implementation:** Visual whitespace (200px+) or a thin dashed line divider.

## Shape Meaning

Choose shape based on what it represents:

| Concept Type | Shape | Why |
|---|---|---|
| Labels, descriptions | **none** (free-floating text) | Typography creates hierarchy |
| Section titles | **none** (free-floating text) | Font size is enough |
| Markers on timeline | small `ellipse` (10-20px) | Visual anchor, not container |
| Start, trigger, input | `ellipse` | Soft, origin-like |
| End, output, result | `ellipse` | Completion, destination |
| Decision, condition | `diamond` | Classic decision symbol |
| Process, action, step | `rectangle` | Contained action |
| Abstract state | overlapping `ellipse` | Fuzzy, cloud-like |
| Hierarchy node | lines + text (no boxes) | Structure through lines |

## Container vs Free-Floating Text

| Use Container When... | Use Free-Floating Text When... |
|---|---|
| It's the focal point of a section | It's a label or description |
| Arrows need to connect to it | It describes something nearby |
| Shape itself carries meaning (decision = diamond) | Typography creates sufficient hierarchy |
| It represents a distinct "thing" in the system | It's supporting detail or metadata |

## Lines as Structure

Lines (type: `line`, NOT arrows) serve as primary structural elements:

- **Timelines:** Vertical/horizontal line with small dots at intervals
- **Tree structures:** Vertical trunk + horizontal branches + free-floating text
- **Dividers:** Thin dashed lines to separate sections
- **Flow spines:** Central line that elements relate to

Use lines to create structure without arrows — arrows imply direction/causality, lines imply grouping/relationship.
