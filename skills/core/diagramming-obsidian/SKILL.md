---
name: diagramming-obsidian
description: Excalidraw diagram builder for an Obsidian vault. Use when the user asks to be shown something visually — an architecture, a flow, a mind map, a "draw this" — or when a note's content needs a diagram beyond an embedded Mermaid block.
---

# Diagramming Obsidian

A diagram should ARGUE, not display. Structure carries the claim: strip every
label out, and a good diagram still says *one source fans out to many*, *many
inputs converge*, *this loop feeds back*. A grid of boxes is a failed diagram,
and no amount of labelling repairs it.

`DESIGN → BUILD → VALIDATE → SAVE`, and you own all four. Two layers run through
every phase: **HARD** is mechanical — the tools verify it, or violating it
silently corrupts the output — and **SOFT** is judgment about the concept you are
drawing.

## Running the helpers

The Python helpers ship inside this skill's own `references/` directory and every
command below runs from there. Its absolute path came with this skill when it
loaded, on the line reading `Base directory for this skill` — resolve
`references/` against that path, never against the user's working directory.

```bash
BASE=<the path from that line>
cd "$BASE/references" && uv run python <helper> ...
# a missing dependency is first-run setup, not a defect:
cd "$BASE/references" && uv sync && uv run playwright install chromium
```

## HARD — process invariants

**Detect the theme before building anything.** The wrong palette silently yields
an unreadable diagram — dark colors on a light canvas wash out, light on dark go
near-invisible — and the renderer will happily produce it with no feedback.

```bash
obsidian eval code="document.body.classList.contains('theme-dark') ? 'dark' : 'light'"
```

No answer within 5 seconds: pick from prompt signals ("dark mode" in the request,
the hour) and **state the assumption in your final output**. Never assume silently.

**Render and view the PNG on every Validate iteration.** Composition,
readability, and hierarchy are not visible in JSON. The overlap checker finds
bounding-box collisions; it cannot see an arrow crossing an unrelated shape at an
acute angle, text too small to read, or a hero that fails to dominate. Read
`/tmp/diagram.png` with the Read tool every single iteration.

**Verify the save.** Both `ea.create()` and the manual write path can produce
format corruption that still renders — markdown text bleeding through a canvas
that looks fine. Run `verify_saved_diagram.py` after every save.

## HARD — mechanical invariants (EA)

- **`ea.reset()` first in every EA invocation.** Without it, elements from earlier calls accumulate and appear in the output invisibly.
- **Never change an element's `id`.** Connected arrows are bound to the shape id; changing it orphans them.
- **`addText` with `box` returns the BOX id**, not the text id. Pass that returned value to `connectObjects`.
- **`viewBackgroundColor` matches the detected theme** — `#1e1e1e` dark, `#ffffff` light.
- **The manual save format is byte-exact.** Wrong frontmatter spacing, list-style tags instead of an inline array, a missing warning line — each corrupts silently. `references/save-format.md`.

## HARD — trace the arrows before you build

Four arrow-path collisions recur. Each is a real pixel overlap that
`check_overlaps.py` catches *after* the build, and that costs nothing to avoid
before it:

- **Converging arrows** travel the corridor below their source elements, crossing any annotation placed directly under those boxes.
- **Back-edges** routed horizontally at the Y-midpoint of a zone they merely pass through will cross that zone's contents.
- **Decision-diamond yes/no labels** at the bottom of the diamond sit in the fan-out exit path of anything leaving from below.
- **Back-edge labels** placed at the arrow's own vertical-run X-coordinate land on top of the line.

Trace every planned arrow from source to target mentally. A path that crosses an
unrelated element gets repositioned **before** building. Fix strategies once
built: `references/layout-heuristics.md` Part 2.

## SOFT — the design space

HARD keeps a diagram valid; SOFT is what makes it good.

**Think first, draw second.** For each major concept, answer before reaching for
shapes: what does it DO (the verb)? What is the core transformation — input to
output, state A to state B? What would someone need to SEE to understand it?

**Every element serves the concept.** Before adding anything, ask what it
communicates that labels alone do not. "Nothing" means it is noise; "this is
where flow starts / a zone boundary / the concept is symmetric" means it is
working. Match two registers: **language** (a monolingual prompt gets monolingual
labels — no bilingual subtitles unless asked) and **conceptual** (a symmetric
concept gets equal-sized peers; do not invent a hero the concept never claimed).
Size a genuine hero larger and genuine peers equally — the ranges in
`references/painters-toolkit.md` are suggestions, not tiers.

**Isomorphism self-check.** With all text removed, would the structure alone
communicate the concept? A check, not a gate — sometimes "A connects to B"
genuinely is the concept.

**Brushes** — shape variety, subtitles, zone labels, accents, separators,
containers, footers — are a vocabulary to pick from, not a menu to copy:
`references/painters-toolkit.md`. Patterns (fan-out, convergence, tree, timeline,
cycle, assembly line, side-by-side, gap): `references/visual-patterns.md`. Two
adjacent sections that come out structurally identical means redesigning one —
visual monotony kills comprehension.

## Phase 1 — Build with ExcalidrawAutomate

Two references open before the first line of EA code:
`references/layout-heuristics.md` Part 1 for grid-based coordinate planning, and
`references/element-templates.md` for the build skeleton — setup, text-in-shape,
arrow binding, the JSON export block, and the raw-JSON templates Phase 2 needs.
Colors come from `references/color-palette.md`; never invent them. For 20+
elements, run `plan_layout.py` rather than placing coordinates by hand. For
comprehensive or technical depth (research framing, multi-zoom, evidence
artifacts): `references/depth-enhancements.md`.

Elements are created through `obsidian eval`, and the build ends by exporting
every element to `/tmp/diagram.excalidraw`.

Three rules the templates do not enforce for you: **style before element**
(`ea.style.*` applies to the NEXT element created, so set it again before each
one), **stagger anchors** when several arrows leave one shape (left/bottom/right,
not all bottom), and keep **diamond text under 12 characters** — a diamond has
roughly half a rectangle's usable area, so longer labels belong in rectangles.

**Mermaid shortcut:** for a simple flowchart under 10 elements, `ea.addMermaid()`
is enough. Only the flowchart type yields native editable elements; other types
fall back to SVG images.

## Phase 2 — Validate

Up to 3 iterations, then save and report what is still wrong.

1. **Check** — `uv run python check_overlaps.py /tmp/diagram.excalidraw`
2. **Render** — `uv run python render_excalidraw.py /tmp/diagram.excalidraw --output /tmp/diagram.png --scale 2`, then Read the PNG.
3. **Judge** — against design intent (right pattern? hero dominant where the concept claims one? brushes serving the concept?) and against defects (overlaps, crossings, uneven spacing, unreadable text).
4. **Fix** — positional fixes edit the JSON directly (Read → find the element → Edit its `x`/`y`); moving a shape does not break arrow binding, because Excalidraw recalculates from binding data rather than coordinates. Structural changes — adding, removing, reconnecting — mean rebuilding from Phase 1 with `ea.reset()`.

- [ ] Done when an iteration produced a PNG you read, and either it is clean or three iterations are spent.

## Phase 3 — Save to the vault

Prefer `ea.create()`; fall back to a manual write only when EA is unreachable
(`obsidian eval code="typeof window.ExcalidrawAutomate"` returns empty).

```javascript
(async () => {
  const ea = window.ExcalidrawAutomate;
  ea.reset();
  const json = JSON.parse(require('fs').readFileSync('/tmp/diagram.excalidraw', 'utf8'));
  json.elements.forEach(el => { ea.elementsDict[el.id] = el; });
  ea.setView('new');
  await ea.create({ filename: '<name>', foldername: '<folder>', onNewPane: false, silent: true });
  return 'Saved to vault';
})()
```

Target file already present: remove it first —
`await app.vault.adapter.remove('<folder>/<name>.excalidraw.md')` — then create.
For the manual fallback, use the byte-exact template in
`references/save-format.md`; Obsidian decides the format by heuristics, so any
deviation corrupts silently. Then verify, always:

```bash
uv run python verify_saved_diagram.py <vault-path>/<name>.excalidraw.md
```

Non-zero exit means format corruption or a render mismatch. On failure,
regenerate from the canonical template in `references/save-format.md` — not from
the file you just wrote, which is the corrupt one. Embed with
`![[diagram-name]]`, outside any bilingual callout: diagrams are language-neutral.

- [ ] Done when the verifier exited zero and you can state the vault path it checked.

## Report

Give the vault path, the visual patterns used, the element count, and how many
Validate iterations ran. Stopped short: name what blocked it and the specific
action that unblocks it. A diagram reported as done without a verified save is a
claim, not a deliverable.
