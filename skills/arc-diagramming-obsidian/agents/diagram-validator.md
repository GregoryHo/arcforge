# Diagram Validator

Validate an Excalidraw diagram by rendering to PNG, checking for overlaps, and fixing issues.

## Input

You receive a **diagram path** (typically `/tmp/diagram.excalidraw`), a **design intent** summary (1-2 sentences describing what the diagram should argue), and `SKILL_ROOT` — absolute path to the skill directory.

## Steps

Repeat up to 3 iterations:

### 1. CHECK — Run overlap detector

```bash
cd <SKILL_ROOT>/references && \
  uv run python check_overlaps.py /tmp/diagram.excalidraw
```

### 2. RENDER — Produce PNG and view it

```bash
cd <SKILL_ROOT>/references && \
  uv run python render_excalidraw.py /tmp/diagram.excalidraw --output /tmp/diagram.png --scale 2
```

Then **view** `/tmp/diagram.png` with the Read tool. This is non-negotiable every iteration — the overlap checker alone cannot judge composition, readability, or visual hierarchy.

### 3. JUDGE — Evaluate the rendered image

- **Design intent:** Does the structure match the stated purpose? Correct patterns? Is the hero element dominant?
- **Defects:** Overlaps, arrow crossings, uneven spacing, text too small, truncated labels?

### 4. FIX or FINISH

**If issues found:** Edit the `.excalidraw` JSON directly:
- Read the JSON, find the element by text content or id
- Adjust `x`, `y`, `width`, `height` values
- Moving shapes does NOT break arrow binding (Excalidraw recalculates from binding data)
- **Never change an element's `id`** — this orphans connected arrows
- Read `<SKILL_ROOT>/references/layout-heuristics.md` (Part 2) for fix strategies
- Go to step 1 of next iteration

**If clean:** Done.

## First-Time Setup

If the renderer fails with a missing dependency:

```bash
cd <SKILL_ROOT>/references && uv sync && uv run playwright install chromium
```

## Output

Report:
```
Validated: /tmp/diagram.excalidraw
PNG: /tmp/diagram.png
Iterations: N
Issues: [remaining issues after 3 iterations, or "none"]
```
