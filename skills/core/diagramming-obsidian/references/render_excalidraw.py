"""Render Excalidraw JSON to PNG using Playwright + headless Chromium.

Usage:
    cd <this skill's references/ directory>
    uv run python render_excalidraw.py <path-to-file.excalidraw> [--output path.png] [--scale 2] [--width 1920]

First-time setup:
    cd <this skill's references/ directory>
    uv sync
    uv run playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import shlex
import sys
from pathlib import Path


def validate_excalidraw(data: object) -> list[str]:
    """Validate Excalidraw JSON structure. Returns list of errors (empty = valid)."""
    if not isinstance(data, dict):
        return ["top level is not an object"]

    errors: list[str] = []

    if data.get("type") != "excalidraw":
        errors.append(f"Expected type 'excalidraw', got '{data.get('type')}'")

    if "elements" not in data:
        errors.append("Missing 'elements' array")
    elif not isinstance(data["elements"], list):
        errors.append("'elements' must be an array")
    elif len(data["elements"]) == 0:
        errors.append("'elements' array is empty — nothing to render")
    else:
        for i, el in enumerate(data["elements"]):
            problem = element_error(el)
            if problem:
                errors.append(f"element {i} {problem}")

    return errors


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def element_error(el: object) -> str | None:
    """Return why an element cannot be measured for the viewport, or None."""
    if not isinstance(el, dict):
        return "is not an object"
    for key in ("x", "y", "width", "height"):
        if key in el and not is_number(el[key]):
            return f"{key!r} is not a number"
    points = el.get("points", [])
    if not isinstance(points, list) or not all(
        isinstance(p, list) and len(p) == 2 and is_number(p[0]) and is_number(p[1]) for p in points
    ):
        return "'points' is not an array of [x, y] number pairs"
    return None


def compute_bounding_box(elements: list[dict]) -> tuple[float, float, float, float]:
    """Compute bounding box (min_x, min_y, max_x, max_y) across all elements."""
    min_x = float("inf")
    min_y = float("inf")
    max_x = float("-inf")
    max_y = float("-inf")

    for el in elements:
        if el.get("isDeleted"):
            continue
        x = el.get("x", 0)
        y = el.get("y", 0)
        w = el.get("width", 0)
        h = el.get("height", 0)

        # For arrows/lines, points array defines the shape relative to x,y
        if el.get("type") in ("arrow", "line") and "points" in el:
            for px, py in el["points"]:
                min_x = min(min_x, x + px)
                min_y = min(min_y, y + py)
                max_x = max(max_x, x + px)
                max_y = max(max_y, y + py)
        else:
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x + abs(w))
            max_y = max(max_y, y + abs(h))

    if min_x == float("inf"):
        return (0, 0, 800, 600)

    return (min_x, min_y, max_x, max_y)


def render(
    excalidraw_path: Path,
    output_path: Path | None = None,
    scale: int = 2,
    max_width: int = 1920,
) -> Path:
    """Render an .excalidraw file to PNG. Returns the output PNG path."""
    # Read and validate before importing playwright, so a broken diagram is
    # reported as broken, not as a missing renderer.
    try:
        raw = excalidraw_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        print(f"ERROR: Cannot read {excalidraw_path}: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, RecursionError) as e:
        print(f"ERROR: Invalid JSON in {excalidraw_path}: {e}", file=sys.stderr)
        sys.exit(1)

    errors = validate_excalidraw(data)
    if errors:
        print(f"ERROR: Invalid Excalidraw file: {'; '.join(errors)}", file=sys.stderr)
        sys.exit(1)

    references = shlex.quote(str(Path(__file__).resolve().parent))
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            f"ERROR: playwright not installed. Run: cd {references} && uv sync && uv run playwright install chromium",
            file=sys.stderr,
        )
        sys.exit(1)

    # Compute viewport size from element bounding box
    elements = [e for e in data["elements"] if not e.get("isDeleted")]
    min_x, min_y, max_x, max_y = compute_bounding_box(elements)
    padding = 80
    diagram_w = max_x - min_x + padding * 2
    diagram_h = max_y - min_y + padding * 2

    # Cap viewport width, let height be natural
    vp_width = min(int(diagram_w), max_width)
    vp_height = max(int(diagram_h), 600)

    # Output path
    if output_path is None:
        output_path = excalidraw_path.with_suffix(".png")

    # Template path (same directory as this script)
    template_path = Path(__file__).parent / "render_template.html"
    if not template_path.exists():
        print(f"ERROR: Template not found at {template_path}", file=sys.stderr)
        sys.exit(1)

    template_url = template_path.as_uri()

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
        except Exception as e:
            if "Executable doesn't exist" in str(e):
                print(
                    f"ERROR: Chromium not installed for Playwright. Run: cd {references} && uv run playwright install chromium",
                    file=sys.stderr,
                )
                sys.exit(1)
            first_line = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
            print(f"ERROR: Chromium failed to launch: {first_line}", file=sys.stderr)
            sys.exit(1)

        page = browser.new_page(
            viewport={"width": vp_width, "height": vp_height},
            device_scale_factor=scale,
        )

        # Load the template
        page.goto(template_url)

        # Wait for the ES module to load (imports from esm.sh)
        page.wait_for_function("window.__moduleReady === true", timeout=30000)

        # Inject the diagram data and render
        json_str = json.dumps(data)
        result = page.evaluate(f"window.renderDiagram({json_str})")

        if not result or not result.get("success"):
            error_msg = result.get("error", "Unknown render error") if result else "renderDiagram returned null"
            print(f"ERROR: Render failed: {error_msg}", file=sys.stderr)
            browser.close()
            sys.exit(1)

        # Wait for render completion signal
        page.wait_for_function("window.__renderComplete === true", timeout=15000)

        # Screenshot the SVG element
        svg_el = page.query_selector("#root svg")
        if svg_el is None:
            print("ERROR: No SVG element found after render.", file=sys.stderr)
            browser.close()
            sys.exit(1)

        svg_el.screenshot(path=str(output_path))
        browser.close()

    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Render Excalidraw JSON to PNG")
    parser.add_argument("input", type=Path, help="Path to .excalidraw JSON file")
    parser.add_argument("--output", "-o", type=Path, default=None, help="Output PNG path (default: same name with .png)")
    parser.add_argument("--scale", "-s", type=int, default=2, help="Device scale factor (default: 2)")
    parser.add_argument("--width", "-w", type=int, default=1920, help="Max viewport width (default: 1920)")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    png_path = render(args.input, args.output, args.scale, args.width)
    print(str(png_path))


if __name__ == "__main__":
    main()
