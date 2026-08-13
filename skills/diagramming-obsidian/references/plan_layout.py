"""Plan diagram layout with flow/evidence separation.

Usage:
    uv run python plan_layout.py <spec.json> [--output coords.json]

Takes a diagram spec (elements, types, connections) and computes coordinates
that guarantee flow elements and evidence artifacts never overlap.

The spec format:

{
  "canvas": {"width": 1400, "bg": "#1e1e1e"},
  "zones": [
    {
      "id": "zone1",
      "title": "CLIENT SIDE",
      "elements": [
        {"id": "build_req", "type": "flow", "text": "Build API Request\\nPOST /v1/messages", "shape": "rectangle", "size": "primary"},
        {"id": "req_payload", "type": "evidence", "text": "{\\n  \"model\": ...\\n}", "shape": "rectangle"},
        {"id": "parse_resp", "type": "flow", "text": "Parse tool_use\\nfrom response", "shape": "rectangle", "size": "secondary"}
      ],
      "connections": [
        {"from": "build_req", "to": "parse_resp", "anchor": ["bottom", "top"]}
      ]
    }
  ],
  "cross_zone_connections": [
    {"from": "build_req", "to": "api_recv", "anchor": ["right", "left"]}
  ]
}

Output: JSON with computed x, y for each element + zone separators.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Size presets (width, height)
SIZES = {
    "hero": (280, 100),
    "primary": (180, 70),
    "secondary": (140, 55),
    "small": (80, 40),
    "evidence": (280, 200),  # default evidence size, will be overridden by text length
}

# Layout constants
FLOW_COL_X = 50          # flow elements start here
EVIDENCE_COL_X = 400     # evidence elements go in a separate column
ZONE_TITLE_Y_OFFSET = 0  # title at top of zone
ZONE_ELEMENT_START = 40   # elements start 40px below zone top
ROW_GAP = 30              # gap between rows within a zone
ZONE_GAP = 60             # gap between zones (includes separator)
SEPARATOR_MARGIN = 20     # gap between elements and separator line
MIN_EVIDENCE_HEIGHT = 120
EVIDENCE_TEXT_LINE_HEIGHT = 16  # approximate height per line of evidence text


def estimate_evidence_size(text: str) -> tuple[int, int]:
    """Estimate evidence block size from text content."""
    lines = text.count("\\n") + text.count("\n") + 1
    height = max(MIN_EVIDENCE_HEIGHT, lines * EVIDENCE_TEXT_LINE_HEIGHT + 30)
    # Width based on longest line
    max_line = max((len(l) for l in text.replace("\\n", "\n").split("\n")), default=20)
    width = max(250, min(350, max_line * 8 + 40))
    return (width, height)


def plan_zone(zone: dict, start_y: float, canvas_width: int) -> dict:
    """Plan layout for a single zone. Returns zone layout with element coords."""
    elements = zone.get("elements", [])
    zone_id = zone.get("id", "zone")
    title = zone.get("title", "")

    zone_top = start_y
    current_flow_y = zone_top + ZONE_ELEMENT_START
    current_evidence_y = zone_top + ZONE_ELEMENT_START
    max_zone_bottom = current_flow_y

    element_coords = {}

    for el in elements:
        el_id = el["id"]
        el_type = el.get("type", "flow")
        shape = el.get("shape", "rectangle")
        size_name = el.get("size", "primary" if el_type == "flow" else "evidence")

        if el_type == "evidence":
            # Evidence goes in the right column
            w, h = estimate_evidence_size(el.get("text", ""))
            x = EVIDENCE_COL_X
            y = current_evidence_y
            current_evidence_y = y + h + ROW_GAP
            max_zone_bottom = max(max_zone_bottom, y + h)
        else:
            # Flow goes in the left column
            w, h = SIZES.get(size_name, SIZES["primary"])
            x = FLOW_COL_X
            y = current_flow_y
            current_flow_y = y + h + ROW_GAP
            max_zone_bottom = max(max_zone_bottom, y + h)

        element_coords[el_id] = {
            "id": el_id,
            "type": el_type,
            "shape": shape,
            "text": el.get("text", ""),
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "size": size_name,
        }

    zone_bottom = max_zone_bottom + SEPARATOR_MARGIN

    return {
        "zone_id": zone_id,
        "title": title,
        "title_x": FLOW_COL_X,
        "title_y": zone_top,
        "separator_y": zone_bottom,
        "elements": element_coords,
        "zone_bottom": zone_bottom,
    }


def plan_layout(spec: dict) -> dict:
    """Plan full diagram layout from spec."""
    canvas_width = spec.get("canvas", {}).get("width", 1400)
    bg = spec.get("canvas", {}).get("bg", "#1e1e1e")
    zones = spec.get("zones", [])

    current_y = 30  # start below top margin
    planned_zones = []
    all_elements = {}

    for zone in zones:
        planned = plan_zone(zone, current_y, canvas_width)
        planned_zones.append(planned)
        all_elements.update(planned["elements"])
        current_y = planned["zone_bottom"] + ZONE_GAP

    # Plan connections (just pass through with anchor info)
    connections = []
    for zone in zones:
        for conn in zone.get("connections", []):
            connections.append(conn)
    for conn in spec.get("cross_zone_connections", []):
        connections.append(conn)

    return {
        "canvas": {"width": canvas_width, "bg": bg, "height": int(current_y)},
        "zones": [
            {
                "zone_id": z["zone_id"],
                "title": z["title"],
                "title_x": z["title_x"],
                "title_y": z["title_y"],
                "separator_y": z["separator_y"],
            }
            for z in planned_zones
        ],
        "elements": all_elements,
        "connections": connections,
    }


def format_as_ea_script(layout: dict) -> str:
    """Generate EA API script from planned layout."""
    lines = []
    lines.append("// Auto-generated layout — coordinates from plan_layout.py")
    lines.append("// Flow elements: left column (x=50)")
    lines.append("// Evidence artifacts: right column (x=400)")
    lines.append("")

    for zone in layout["zones"]:
        lines.append(f"// === ZONE: {zone['title']} ===")
        lines.append(f"// Title at ({zone['title_x']}, {zone['title_y']})")
        lines.append(f"// Separator at y={zone['separator_y']}")
        lines.append("")

    lines.append("// === ELEMENTS ===")
    for el_id, el in layout["elements"].items():
        col = "EVIDENCE" if el["type"] == "evidence" else "FLOW"
        lines.append(
            f"// [{col}] {el_id}: ({el['x']}, {el['y']}) {el['width']}x{el['height']} "
            f"{el['shape']} — {el['text'][:40]}"
        )

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Plan Excalidraw diagram layout")
    parser.add_argument("input", type=Path, help="Path to spec JSON file")
    parser.add_argument("--output", "-o", type=Path, help="Output JSON path (default: stdout)")
    parser.add_argument("--ea-script", action="store_true", help="Also print EA script outline")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    spec = json.loads(args.input.read_text(encoding="utf-8"))
    layout = plan_layout(spec)

    output = json.dumps(layout, indent=2)

    if args.output:
        args.output.write_text(output, encoding="utf-8")
        print(f"Layout written to {args.output}", file=sys.stderr)
    else:
        print(output)

    if args.ea_script:
        print("\n---\n", file=sys.stderr)
        print(format_as_ea_script(layout), file=sys.stderr)


if __name__ == "__main__":
    main()
