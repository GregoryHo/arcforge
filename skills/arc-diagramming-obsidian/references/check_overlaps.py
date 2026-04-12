"""Detect overlapping elements in Excalidraw JSON and suggest fixes.

Usage:
    cd skills/arc-diagramming-obsidian/references
    uv run python check_overlaps.py <path-to-file.excalidraw> [--min-overlap 100] [--padding 10]

Detects:
  1. Shape-shape overlaps (two shapes' bounding boxes intersect)
  2. Arrow-shape crossings (arrow segment passes through a shape it doesn't bind to)
  3. Text-text overlaps (free-floating labels too close)
  4. Text-shape overlaps (label overlaps a shape it's not contained in)

Output: JSON report with overlap details and fix suggestions.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def bbox(el: dict) -> tuple[float, float, float, float] | None:
    """Compute (x1, y1, x2, y2) bounding box for an element."""
    if el.get("isDeleted"):
        return None

    x = el.get("x", 0)
    y = el.get("y", 0)
    w = el.get("width", 0)
    h = el.get("height", 0)
    el_type = el.get("type", "")

    if el_type in ("arrow", "line"):
        points = el.get("points", [])
        if not points:
            return None
        xs = [x + p[0] for p in points]
        ys = [x + p[1] for p in points]
        # Fix: ys should use y not x
        ys = [y + p[1] for p in points]
        return (min(xs), min(ys), max(xs), max(ys))

    if w == 0 and h == 0:
        return None

    return (x, y, x + abs(w), y + abs(h))


def overlap_area(a: tuple, b: tuple) -> float:
    """Compute overlap area between two bounding boxes. 0 = no overlap."""
    x_overlap = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    y_overlap = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return x_overlap * y_overlap


def segments_from_arrow(el: dict) -> list[tuple]:
    """Extract line segments from an arrow/line element."""
    x = el.get("x", 0)
    y = el.get("y", 0)
    points = el.get("points", [])
    segs = []
    for i in range(len(points) - 1):
        ax, ay = x + points[i][0], y + points[i][1]
        bx, by = x + points[i + 1][0], y + points[i + 1][1]
        segs.append((ax, ay, bx, by))
    return segs


def segment_crosses_box(
    seg: tuple, box: tuple, padding: float = 0
) -> tuple[float, float] | None:
    """Check if a line segment crosses through a bounding box.

    Returns the approximate crossing point, or None.
    Uses Liang-Barsky line clipping algorithm.
    """
    x1, y1, x2, y2 = seg
    bx1, by1, bx2, by2 = (
        box[0] - padding,
        box[1] - padding,
        box[2] + padding,
        box[3] + padding,
    )

    dx = x2 - x1
    dy = y2 - y1

    p = [-dx, dx, -dy, dy]
    q = [x1 - bx1, bx2 - x1, y1 - by1, by2 - y1]

    t0, t1 = 0.0, 1.0

    for i in range(4):
        if p[i] == 0:
            if q[i] < 0:
                return None
        else:
            t = q[i] / p[i]
            if p[i] < 0:
                t0 = max(t0, t)
            else:
                t1 = min(t1, t)

    if t0 > t1:
        return None

    # Segment does cross the box — return midpoint of crossing
    t_mid = (t0 + t1) / 2
    cx = x1 + t_mid * dx
    cy = y1 + t_mid * dy
    return (round(cx, 1), round(cy, 1))


def label_for(el: dict) -> str:
    """Human-readable label for an element."""
    text = el.get("text", el.get("originalText", ""))
    if text:
        short = text.replace("\n", " ")[:30]
        return f'{el["type"]}("{short}")'
    return f'{el["type"]}#{el.get("id", "?")[:8]}'


def check_overlaps(
    data: dict, min_overlap: float = 100, padding: float = 10
) -> dict:
    """Run all overlap checks. Returns a report dict."""
    elements = [e for e in data.get("elements", []) if not e.get("isDeleted")]

    # Index by ID for lookups
    by_id = {e["id"]: e for e in elements}

    # Separate by type
    shapes = [e for e in elements if e["type"] in ("rectangle", "ellipse", "diamond")]
    texts = [e for e in elements if e["type"] == "text"]
    arrows = [e for e in elements if e["type"] in ("arrow", "line")]

    # Free-floating texts (not inside a container)
    free_texts = [t for t in texts if not t.get("containerId")]

    # Contained texts (inside a shape) — skip these for overlap checks
    contained_text_ids = {t["id"] for t in texts if t.get("containerId")}

    issues = []

    # 1. Shape-shape overlaps
    for i, a in enumerate(shapes):
        ba = bbox(a)
        if not ba:
            continue
        for b in shapes[i + 1 :]:
            bb = bbox(b)
            if not bb:
                continue
            area = overlap_area(ba, bb)
            if area >= min_overlap:
                # Suggest moving the smaller element
                a_area = (ba[2] - ba[0]) * (ba[3] - ba[1])
                b_area = (bb[2] - bb[0]) * (bb[3] - bb[1])
                mover = b if b_area <= a_area else a
                mover_bb = bb if b_area <= a_area else ba
                other_bb = ba if b_area <= a_area else bb

                # Suggest direction to move
                dx = (mover_bb[0] + mover_bb[2]) / 2 - (other_bb[0] + other_bb[2]) / 2
                dy = (mover_bb[1] + mover_bb[3]) / 2 - (other_bb[1] + other_bb[3]) / 2
                if abs(dx) > abs(dy):
                    direction = "right" if dx > 0 else "left"
                    shift = int(area**0.5) + 20
                    suggestion = f'Move {label_for(mover)} {direction} by {shift}px'
                else:
                    direction = "down" if dy > 0 else "up"
                    shift = int(area**0.5) + 20
                    suggestion = f'Move {label_for(mover)} {direction} by {shift}px'

                issues.append(
                    {
                        "type": "shape-shape",
                        "severity": "high" if area > 500 else "medium",
                        "element_a": label_for(a),
                        "element_b": label_for(b),
                        "overlap_px": round(area),
                        "suggestion": suggestion,
                    }
                )

    # 2. Arrow-shape crossings
    for arrow in arrows:
        segs = segments_from_arrow(arrow)
        # Get bound shape IDs (these are expected crossings)
        start_id = (arrow.get("startBinding") or {}).get("elementId")
        end_id = (arrow.get("endBinding") or {}).get("elementId")
        bound_ids = {start_id, end_id} - {None}

        for shape in shapes:
            if shape["id"] in bound_ids:
                continue  # Arrow is supposed to touch its bound shapes
            sb = bbox(shape)
            if not sb:
                continue
            for seg in segs:
                crossing = segment_crosses_box(seg, sb)
                if crossing:
                    # Suggest a waypoint to route around
                    cx, cy = crossing
                    # Route above or below the shape
                    shape_mid_y = (sb[1] + sb[3]) / 2
                    if cy < shape_mid_y:
                        wp_y = sb[1] - 30  # route above
                    else:
                        wp_y = sb[3] + 30  # route below
                    wp_x = cx

                    issues.append(
                        {
                            "type": "arrow-shape-crossing",
                            "severity": "high",
                            "arrow": label_for(arrow),
                            "arrow_id": arrow["id"],
                            "shape": label_for(shape),
                            "crossing_point": [cx, cy],
                            "suggestion": f"Add waypoint at [{round(wp_x)}, {round(wp_y)}] to route around {label_for(shape)}",
                        }
                    )
                    break  # One crossing per arrow-shape pair is enough

    # 3. Text-text overlaps (free-floating only)
    for i, a in enumerate(free_texts):
        ba = bbox(a)
        if not ba:
            continue
        for b in free_texts[i + 1 :]:
            bb = bbox(b)
            if not bb:
                continue
            # Add padding to catch near-misses
            padded_ba = (ba[0] - padding, ba[1] - padding, ba[2] + padding, ba[3] + padding)
            area = overlap_area(padded_ba, bb)
            if area > 0:
                issues.append(
                    {
                        "type": "text-text",
                        "severity": "medium",
                        "element_a": label_for(a),
                        "element_b": label_for(b),
                        "overlap_px": round(area),
                        "suggestion": f'Increase vertical spacing between {label_for(a)} and {label_for(b)} by {int(area**0.5) + 10}px',
                    }
                )

    # 4. Text-shape overlaps (free text overlapping a shape it's not inside)
    for text_el in free_texts:
        tb = bbox(text_el)
        if not tb:
            continue
        for shape in shapes:
            # Skip if this text is bound to this shape
            bound_els = shape.get("boundElements") or []
            if any(be.get("id") == text_el["id"] for be in bound_els):
                continue
            sb = bbox(shape)
            if not sb:
                continue
            area = overlap_area(tb, sb)
            if area >= min_overlap / 2:  # Lower threshold for text-shape
                issues.append(
                    {
                        "type": "text-shape",
                        "severity": "medium",
                        "text": label_for(text_el),
                        "shape": label_for(shape),
                        "overlap_px": round(area),
                        "suggestion": f'Move {label_for(text_el)} away from {label_for(shape)}',
                    }
                )

    # Build summary
    by_type = {}
    for issue in issues:
        t = issue["type"]
        by_type[t] = by_type.get(t, 0) + 1

    high_count = sum(1 for i in issues if i["severity"] == "high")

    return {
        "issues": issues,
        "summary": {
            "total": len(issues),
            "high_severity": high_count,
            "by_type": by_type,
        },
        "verdict": "clean" if len(issues) == 0 else ("needs_fix" if high_count > 0 else "minor_issues"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Check Excalidraw diagram for overlapping elements")
    parser.add_argument("input", type=Path, help="Path to .excalidraw JSON file")
    parser.add_argument("--min-overlap", type=float, default=100, help="Minimum overlap area (px²) to report for shapes (default: 100)")
    parser.add_argument("--padding", type=float, default=10, help="Padding around text elements for near-miss detection (default: 10)")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of formatted report")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(args.input.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    report = check_overlaps(data, args.min_overlap, args.padding)

    if args.json:
        print(json.dumps(report, indent=2))
        return

    # Formatted output
    summary = report["summary"]
    print(f"Overlap check: {summary['total']} issues found ({summary['high_severity']} high severity)")
    print(f"Verdict: {report['verdict']}")

    if report["issues"]:
        print()
        for i, issue in enumerate(report["issues"], 1):
            sev = "🔴" if issue["severity"] == "high" else "🟡"
            print(f"  {sev} #{i} [{issue['type']}]")
            if "element_a" in issue:
                print(f"     {issue['element_a']} ↔ {issue['element_b']}")
            elif "arrow" in issue:
                print(f"     {issue['arrow']} crosses {issue['shape']}")
            elif "text" in issue:
                print(f"     {issue['text']} overlaps {issue['shape']}")
            if "overlap_px" in issue:
                print(f"     Overlap: {issue['overlap_px']}px²")
            print(f"     Fix: {issue['suggestion']}")
            print()


if __name__ == "__main__":
    main()
