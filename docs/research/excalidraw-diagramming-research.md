# Excalidraw Diagramming Research

Date: 2026-04-07

## Goal

Design `arc-diagramming-obsidian` — a skill for generating high-quality Excalidraw diagrams from natural language, integrated with the Obsidian vault workflow.

## Key Decisions Made

### Architecture: Independent Skill (not a Tier in arc-writing-obsidian)

Writing text notes and designing visual diagrams are fundamentally different creative processes. Writing is "extract and structure information" (fast, seconds). Diagramming is "design a visual argument" (slow, needs render-validate loop, 2-4 iterations).

`arc-writing-obsidian` delegates to `arc-diagramming-obsidian` when a Synthesis note needs a visual. Same pattern as the existing delegation to `obsidian:json-canvas`.

### Generation: JSON Direct Write (not EA API)

**Tested both approaches with the same 12-element pipeline diagram.**

| Approach | Layout | Text | Binding | Verdict |
|----------|--------|------|---------|---------|
| JSON direct write | Correct, no overlap | All visible | Manual but precise | **Winner** |
| EA API (`obsidian eval`) | GROW element displaced to top-left, overlapping | Most text missing after export | Auto-binding lost during serialization | Unusable |

EA API's `addText(box:id)` binding and `connectObjects()` arrow positions are lost when the scene is exported via `getSceneFromFile()`. coleam00 explicitly prohibits API/script generation for this reason — direct JSON is the only way to precisely control every element property.

**Important caveat:** JSON's "transparency" (being able to read every property) is NOT the reason it wins. Validation is visual — you look at the rendered PNG, not the JSON source. JSON wins because its output is correct, not because it's debuggable. If EA API produced identical renders, the API's convenience would make it the better choice.

### Rendering: Playwright or Any Chrome Access (equivalent quality)

**Tested Playwright and Chrome (via Playwright with explicit light mode) on both diagram types.**

| Renderer | JSON diagram quality | EA API diagram quality |
|----------|---------------------|----------------------|
| Playwright (coleam00 script) | Perfect | Same EA API issues |
| Chrome (light mode) | Perfect — identical to Playwright | Same EA API issues |

Both use the same `@excalidraw/excalidraw` library's `exportToSvg()`. The rendering tool does not affect quality — only the generation method matters.

**Conclusion:** Rendering tool is interchangeable. Playwright, Puppeteer, claude-in-chrome, any headless browser, or any tool that can access Chrome — they all use the same `exportToSvg()` and produce identical results. The skill should not be coupled to a specific rendering tool. Choose based on what's available in the user's environment.

**Dark mode note:** Chrome dark mode inverts screenshot captures at the OS level. This is a capture problem, not a rendering problem. When saving to PNG programmatically (via canvas → base64 → file), the output is correct regardless of dark mode. Dark mode screenshots need `color_scheme: "light"` if using browser screenshot APIs.

### Visual Style: Cool Minimal

User rejected coleam00's colorful palette ("too flashy") and chose a minimal aesthetic: cool, minimal, with subtle color differentiation.

**Shape Colors (fill / stroke):**

| Semantic | Fill | Stroke | Use |
|----------|------|--------|-----|
| Neutral | `#f5f5f4` | `#78716c` | General elements, entry points |
| Primary | `#f0f9ff` | `#475569` | Main flow nodes |
| Primary-mid | `#e0f2fe` | `#475569` | Secondary nodes |
| Primary-deep | `#dbeafe` | `#475569` | Emphasized nodes |
| Decision | `#fefce8` | `#92400e` | Decision/judgment — only warm color |
| Hub | `#f1f5f9` | `#475569` | Convergence points (Vault, etc.) |
| Action | `#f0fdfa` | `#115e59` | Operations (LINK, etc.) |
| Action-mid | `#ccfbf1` | `#115e59` | Operation emphasis |
| Action-deep | `#99f6e4` | `#115e59` | Operation highlight |

**Text:** `#374151` (uniform dark gray)
**Arrows:** `#cbd5e1` (light slate, doesn't compete with elements)
**Design logic:** Two hue families only — ice blue (flow) and teal (action). Decision diamond uses pale yellow as the sole warm-color breakpoint.

**Dark mode is the primary environment, not an edge case.** The user works in dark mode. The palette must work on dark backgrounds — this is not a "nice to have" variant, it's the default context. Light mode is the secondary case. The render-validate loop should preview in dark mode to match the user's actual experience.

### Design Methodology: coleam00's Approach

Adopted from the `excalidraw-diagram-skill` repository (~/GitHub/AI/excalidraw-diagram-skill).

**Core philosophy:** "Diagrams should ARGUE, not DISPLAY."

**Two validation tests:**
1. Isomorphism Test — remove all text; does structure alone communicate the concept?
2. Education Test — could someone learn something concrete from this diagram?

**9 Visual Patterns:**

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

**Size hierarchy:** Hero 300x150, Primary 180x90, Secondary 120x60, Small 60x40
**Container discipline:** <30% of text in containers. Default to free-floating text.
**Section-by-section generation:** Large diagrams built one section at a time. Namespaced seeds (100xxx, 200xxx). Descriptive string IDs.

**Render-validate loop (mandatory):**
1. Generate JSON section by section
2. Render to PNG
3. AI views PNG, checks against vision + defect checklist
4. Fix JSON, re-render
5. Repeat 2-4 times until passing

### Excalidraw Ingest (Raw Source → Wiki Layer)

Existing `.excalidraw.md` drawings are Raw Sources in Karpathy's three-layer model. `arc-writing-obsidian` ingests them by extracting `## Text Elements` and creating a Source note. The auditor (`arc-auditing-obsidian`) only operates on the wiki layer — it skips `.excalidraw.md` files and dynamically excludes plugin-managed folders.

## Validated Capabilities

| Capability | Status | Method |
|------------|--------|--------|
| EA API element creation | Works | `obsidian eval` + `ea.addRect/connectObjects` |
| EA API file creation | Works | `ea.create({filename, foldername})` |
| EA API scene export | Lossy | Text bindings and positions lost on export |
| JSON direct write | Works perfectly | Write `.excalidraw` file with hand-crafted JSON |
| Mermaid → Excalidraw | Works (flowcharts only) | `ea.addMermaid()` — other types fall back to SVG image |
| Playwright rendering | Works | coleam00's `render_excalidraw.py` |
| Chrome rendering | Works | Same `exportToSvg` via browser, identical quality |
| `dev:screenshot` | Works but unreliable | Full window capture, tab switching issues, dark mode interference |
| `ea.createPNGBase64()` | Exists but untested | Requires active Excalidraw view |
| elkjs auto-layout | Available | Installed in vault's Auto Layout script, not yet integrated |

## What coleam00 Explicitly Prohibits

1. Don't generate entire diagram in one response (token limit truncation)
2. Don't use coding agent to generate JSON (insufficient context for skill rules)
3. Don't write Python generator script (indirection makes debugging harder)
4. Don't invent new colors (all from palette.md)
5. Don't use opacity variations (always 100, use color/size/stroke for hierarchy)
6. Don't put >30% text in containers
7. Don't use uniform card grids
8. Don't skip the render-validate loop

## Open Questions

1. **Dark mode palette** — Cool minimal colors chosen on light background. User works in dark mode — need to verify colors look good on dark canvas AND design dark-first palette if needed. This is the default, not a variant.
2. **elkjs integration** — Available but not tested as layout engine for EA API or JSON generation. Could solve coordinate computation for complex non-flowchart diagrams.
3. **Mermaid as shortcut** — `ea.addMermaid()` works for flowcharts but produces all-black elements. Post-processing to apply color palette not yet tested.
4. **Render tool agnosticism** — Any Chrome access works (Playwright, Puppeteer, claude-in-chrome, etc.). The skill should document the rendering interface, not prescribe a specific tool. Dark mode screenshot capture is a known issue with browser screenshot APIs — saving PNG programmatically bypasses it.
5. **EA API text binding fix** — The text loss might be fixable with different `addText` parameters or by using `ea.addElementsToView()` instead of `ea.create()`. Not investigated.

## File References

- Test JSON diagram: `/tmp/test-json-diagram.excalidraw`
- Render outputs: `/tmp/render-json-pw.png`, `/tmp/render-json-chrome.png`, `/tmp/render-ea-pw.png`, `/tmp/render-ea-chrome.png`
- coleam00 skill: `~/GitHub/AI/excalidraw-diagram-skill/`
- Render template: `~/GitHub/AI/excalidraw-diagram-skill/references/render_template.html`
- Cool minimal color test (in vault): `Excalidraw/color-cool-minimal.excalidraw.md`

## Corrected Assumptions

Mistakes made during research that were caught by the user:

1. **"Dark mode is interference"** → Wrong. Dark mode is the user's primary environment. The skill must design for dark mode first, not treat it as a problem to work around.
2. **"JSON transparency is an advantage"** → Misleading. Validation is visual (rendered PNG), not by reading JSON. JSON wins on output correctness, not debuggability. If EA API produced correct output, its convenience would be preferable.
3. **"Playwright is the recommended tool"** → Too prescriptive. Any tool that can access Chrome works identically. The skill should be render-tool-agnostic.
4. **"AI can't compute coordinates"** → Wrong. coleam00's skill proves AI computes coordinates reliably when given strict rules (size hierarchy, spacing rules, visual patterns). The earlier failures were from missing methodology, not AI limitation.
5. **"elkjs/Mermaid needed to avoid coordinate problems"** → Over-engineering. Useful as optional shortcuts, not required layers. The default path is AI + rules + validate.

## Next Steps

1. Finalize dark mode palette (dark-first, light as secondary)
2. Write `arc-diagramming-obsidian` SKILL.md + references (color-palette.md, visual-patterns.md, element-templates.md)
3. Create test cases (simple flowchart, complex architecture, mind map)
4. Run eval loop: generate → render → validate → iterate
5. Document render interface (tool-agnostic, not Playwright-specific)
