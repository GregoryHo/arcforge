# arc-diagramming-obsidian Design

## Vision

A skill for generating high-quality Excalidraw diagrams from natural language, using coleam00's design methodology + our rendering flexibility + Obsidian vault integration.

Diagrams should ARGUE, not DISPLAY. Every diagram is a visual argument — structure mirrors concept, shape carries meaning.

## Architecture Decision

Independent skill, not a tier in arc-writing-obsidian. Writing text notes and designing visual diagrams are fundamentally different creative processes.

**Delegation:**
```
arc-writing-obsidian (text notes)
    ├── delegate → obsidian:obsidian-markdown
    ├── delegate → obsidian:json-canvas
    └── delegate → arc-diagramming-obsidian (Excalidraw visuals)
```

**Pipeline:**
```
Understand → Pattern → Generate → Validate → Save
```

**Skill structure:**
```
arc-diagramming-obsidian/
├── SKILL.md
└── references/
    ├── color-palette.md       # Cool minimal semantic colors (light + dark)
    ├── visual-patterns.md     # 9 patterns + layout rules
    └── element-templates.md   # JSON copy-paste templates
```

## Generation Engine

JSON direct write, based on coleam00's methodology. AI writes raw Excalidraw JSON hand-crafted per element, guided by strict design rules.

**Why JSON over EA API:** EA API loses text bindings and element positions on export. JSON gives precise control over every property — which matters because validation is visual (looking at rendered PNG), not by reading JSON.

**Default path: JSON + coleam00 methodology**
- AI selects visual pattern + size hierarchy
- Section-by-section generation (namespaced seeds: 100xxx, 200xxx)
- Descriptive string IDs ("trigger_rect", "arrow_fan_left")
- Render-validate loop (mandatory)

**Shortcut A: Mermaid (simple flowcharts)**
- `ea.addMermaid()` → auto-layout → iterate elements to apply colors
- For flowcharts <10 elements. Skips section-by-section.

**Shortcut B: EA API + elkjs (50+ element complex graphs)**
- EA API builds logical structure → elkjs computes initial coordinates
- AI adjusts per methodology → export JSON → validate

| Condition | Path |
|-----------|------|
| Simple flowchart (<10 elements) | Shortcut A (Mermaid) |
| Very complex graph (50+ elements) | Shortcut B (elkjs assist) |
| Everything else | Default (JSON + methodology) |

## Design Methodology (from coleam00)

### Validation Tests
1. **Isomorphism Test**: Remove all text — does structure alone communicate the concept?
2. **Education Test**: Could someone learn something concrete from this diagram?

### 9 Visual Patterns

| Pattern | Use Case |
|---------|----------|
| Fan-Out | One-to-many (sources, hubs) |
| Convergence | Many-to-one (aggregation) |
| Tree | Hierarchy (lines + free text, no boxes) |
| Timeline | Sequences (line + dots + labels) |
| Spiral/Cycle | Feedback loops |
| Cloud | Abstract state (overlapping ellipses) |
| Assembly Line | Transformation (before → process → after) |
| Side-by-Side | Comparison |
| Gap/Break | Phase boundaries |

**Rule:** Each major concept uses a different pattern. No uniform card grids.

### Layout Rules
- Size hierarchy: Hero 300x150, Primary 180x90, Secondary 120x60, Small 60x40
- Whitespace = importance: most important element gets 200px+ empty space
- Container discipline: <30% of text in containers. Default to free-floating text.

### Section-by-Section Generation
- Large diagrams built one section at a time
- Namespaced seeds (Section 1: 100xxx, Section 2: 200xxx)
- Descriptive string IDs for cross-section readability
- Update cross-section bindings as you go

## Visual Style: Cool Minimal

Two hue families — ice blue (flow) and teal (action). Decision uses pale yellow as sole warm breakpoint.

### Light Mode

| Semantic | Fill | Stroke |
|----------|------|--------|
| Neutral | `#f5f5f4` | `#78716c` |
| Primary | `#f0f9ff` | `#475569` |
| Primary-mid | `#e0f2fe` | `#475569` |
| Primary-deep | `#dbeafe` | `#475569` |
| Decision | `#fefce8` | `#92400e` |
| Hub | `#f1f5f9` | `#475569` |
| Action | `#f0fdfa` | `#115e59` |
| Action-mid | `#ccfbf1` | `#115e59` |
| Action-deep | `#99f6e4` | `#115e59` |

Text: `#374151` / Arrows: `#cbd5e1`

### Dark Mode

TODO: Design dark-background variant. Same hue families, adjusted for contrast on dark canvas.

## Render-Validate Pipeline

Rendering is not tool-specific — any Chrome access works identically. All use the same `@excalidraw/excalidraw` `exportToSvg()`.

### Tool Selection (by availability)

| Priority | Tool | Detection |
|----------|------|-----------|
| 1 | User's existing Chrome (claude-in-chrome, puppeteer, agent browser) | Check MCP or browser connection |
| 2 | Playwright (coleam00 script) | Check `uv` + `playwright` installed |
| 3 | Report unable to render, ask user to choose | — |

No forced installation. Use whatever the user's environment has.

### Validate Loop (mandatory, every diagram)

```
Step 1: Render PNG
Step 2: Check design intent (structure matches concept? eye flow? hierarchy?)
Step 3: Check defects (text clipping? overlap? arrow routing? spacing?)
Step 4: Fix JSON → back to Step 1
Step 5: Max 3 iterations. After 3 → report to user
```

### Dark Mode Support

Read user's Obsidian theme preference. Dark mode → `viewBackgroundColor` dark, color system uses dark variant. Don't force either mode.

## Improvements Over coleam00

| Dimension | coleam00 | Our optimization |
|-----------|----------|-----------------|
| Rendering | Playwright only | Any Chrome access |
| Simple diagrams | Hand-write all coordinates | Mermaid fast path |
| Very complex diagrams | Pure AI + rules | AI + rules + elkjs optional |
| Direction | Create only | Create + Ingest |
| Integration | Standalone files | Obsidian vault + knowledge graph |
| Dark mode | Not supported | Native support |
| Methodology | Complete (adopted as-is) | Same |

## Bidirectional Flow

**Create:** Natural language → Excalidraw diagram (this skill)
**Ingest:** Existing Excalidraw → Source note (arc-writing-obsidian extracts `## Text Elements`)

Diagrams are part of Karpathy's three-layer wiki model:
- Raw Source: the `.excalidraw.md` file (immutable)
- Wiki: Source note with `source_url` pointing to drawing
- Auditor detects un-ingested drawings in GROW suggestions

---

<!-- REFINER_INPUT_START -->

## Requirements for Refiner

### Functional Requirements

- REQ-F001: Generate Excalidraw JSON from natural language description
- REQ-F002: Apply cool minimal color palette (light + dark mode)
- REQ-F003: Support 9 visual patterns with automatic pattern selection
- REQ-F004: Section-by-section generation for large diagrams
- REQ-F005: Render-validate loop with visual defect detection (max 3 iterations)
- REQ-F006: Auto-detect available rendering tool (Chrome access > Playwright > report)
- REQ-F007: Mermaid fast path for simple flowcharts
- REQ-F008: elkjs-assisted layout for 50+ element diagrams
- REQ-F009: Save diagrams to Obsidian vault via obsidian-cli
- REQ-F010: Accept delegation from arc-writing-obsidian for Synthesis visuals

### Non-Functional Requirements

- REQ-N001: Zero mandatory external dependencies (use what user already has)
- REQ-N002: Dark mode native support
- REQ-N003: Hand-drawn style (roughness: 1) as default
- REQ-N004: SKILL.md under 500 lines; methodology in references/ files

### Constraints

- JSON direct write only (not EA API) for diagram generation
- All colors from color-palette.md (no invented colors)
- <30% of text elements in containers
- Render-validate loop is mandatory, not optional
- Max 3 validation iterations before reporting to user

<!-- REFINER_INPUT_END -->
