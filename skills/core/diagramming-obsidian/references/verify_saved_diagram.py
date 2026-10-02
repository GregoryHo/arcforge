"""Verify a saved .excalidraw.md file.

What is checked depends on the save path, which the drawing block reveals:

  ea.create() path (```compressed-json``` block): format markers only. The
    compressed payload is not decoded, parsed, or rendered, so a payload the
    plugin corrupted still passes. Exit 0 here means the file has the plugin's
    format markers, not that the canvas renders.

  Manual-fallback path (uncompressed ```json``` block):
    1. Format markers: catches the silent corruption hand-writing causes.
    2. The JSON parses and the canvas re-renders, into a fresh temporary
       directory so concurrent runs never share a file.
    3. The re-rendered PNG's byte size is compared against /tmp/diagram.png
       when present. A large delta signals JSON structural damage.

Exits 0 on success, 1 on any failure with a clear message.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path


FORMAT_MARKERS = {
    'plugin_parsed': 'excalidraw-plugin: parsed',
    'tags_inline':   'tags: [excalidraw]',
    'warning_line':  '==⚠  Switch to EXCALIDRAW VIEW',
    'heading':       '# Excalidraw Data',
}


def fail(msg: str) -> None:
    print(f'VERIFY FAILED: {msg}', file=sys.stderr)
    sys.exit(1)


def check_format_markers(content: str) -> None:
    missing = [k for k, v in FORMAT_MARKERS.items() if v not in content]
    if missing:
        fail(f'missing format markers: {missing}')


def extract_json_block(content: str) -> tuple[str, bool]:
    """Returns (json_text, is_compressed). For compressed-json, json_text
    is the raw compressed payload which we do not attempt to parse here."""
    m = re.search(r'```(compressed-)?json\n(.*?)\n```', content, re.DOTALL)
    if not m:
        fail('no ```json or ```compressed-json block found')
    return m.group(2), bool(m.group(1))


def render_and_compare(json_text: str, reference_png: Path | None) -> None:
    with tempfile.TemporaryDirectory(prefix='verify-diagram-') as scratch:
        verify_path = Path(scratch) / 'verify.excalidraw'
        verify_path.write_text(json_text)
        out_png = Path(scratch) / 'diagram-post-save.png'
        try:
            result = subprocess.run(
                ['uv', 'run', 'python', 'render_excalidraw.py',
                 str(verify_path), '--output', str(out_png), '--scale', '2'],
                cwd=Path(__file__).parent, capture_output=True, text=True,
            )
        except FileNotFoundError:
            fail('render failed: `uv` not found on PATH')
        if result.returncode != 0:
            fail(f'render failed: {result.stderr.strip()}')
        if reference_png and reference_png.exists():
            ref_size = reference_png.stat().st_size
            new_size = out_png.stat().st_size
            ratio = new_size / ref_size if ref_size else 0
            if not (0.5 <= ratio <= 2.0):
                fail(f'post-save render size deviates sharply from pre-save '
                     f'(ref={ref_size}, new={new_size}, ratio={ratio:.2f}) — '
                     f'likely JSON corruption during save')


def main() -> None:
    if len(sys.argv) != 2:
        print('Usage: verify_saved_diagram.py <path-to-.excalidraw.md>',
              file=sys.stderr)
        sys.exit(2)

    md_path = Path(sys.argv[1])
    if not md_path.exists():
        fail(f'file not found: {md_path}')

    content = md_path.read_text()
    check_format_markers(content)

    json_text, is_compressed = extract_json_block(content)
    if is_compressed:
        print('OK: format markers present; compressed-json block not decoded or '
              'rendered (ea.create path: markers only)')
        return

    try:
        json.loads(json_text)
    except json.JSONDecodeError as e:
        fail(f'drawing block is not valid JSON: {e}')
    render_and_compare(json_text, Path('/tmp/diagram.png'))
    print('OK: format markers present, JSON parses, post-save render succeeds')


if __name__ == '__main__':
    main()
