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

Exits 0 on success, 1 on any failure with one `VERIFY FAILED:` line on
stderr naming the cause, 2 on a usage error, and 128+N when stopped by
signal N (SIGTERM, SIGHUP), after stopping the render and removing its
scratch directory.
"""
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
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


def interrupted(signum: int, _frame: object) -> None:
    """Exit through SystemExit so the render's scratch directory unwinds."""
    print(f'VERIFY FAILED: interrupted by {signal.Signals(signum).name}', file=sys.stderr)
    sys.exit(128 + signum)


def run_render(args: list[str]) -> subprocess.CompletedProcess:
    """Run the renderer in its own process group, and take the whole group
    down if this process is interrupted: `uv run` cannot forward the SIGKILL
    subprocess.run would send it, so the render under it would outlive us."""
    proc = subprocess.Popen(
        args, cwd=Path(__file__).parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, start_new_session=True,
    )
    try:
        stdout, stderr = proc.communicate()
    except BaseException:
        stop_process_group(proc)
        raise
    return subprocess.CompletedProcess(args, proc.returncode, stdout, stderr)


def stop_process_group(proc: subprocess.Popen) -> None:
    """SIGTERM the renderer's group so Playwright can close Chromium, give it
    five seconds, then SIGKILL whatever is left. Without process groups
    (no os.killpg), stop the direct child the same way."""
    if not hasattr(os, 'killpg'):
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            proc.poll()  # reap our direct child so it stops counting
            os.killpg(proc.pid, 0)  # raises once the group is empty
            time.sleep(0.05)
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        # Gone: ESRCH once the group is empty; EPERM on macOS when only
        # zombies are left in a group this process created itself.
        pass
    proc.wait()


def render_failure_cause(result: subprocess.CompletedProcess) -> str:
    """One line naming why the renderer failed: its ERROR: line, else its
    last stderr line, else its exit status."""
    lines = [line for line in result.stderr.splitlines() if line.strip()]
    errors = [line for line in lines if line.startswith('ERROR:')]
    if errors or lines:
        return (errors or lines)[-1].strip()
    return f'renderer exited with status {result.returncode}'


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
        verify_path.write_text(json_text, encoding='utf-8')
        out_png = Path(scratch) / 'diagram-post-save.png'
        try:
            result = run_render(
                ['uv', 'run', 'python', 'render_excalidraw.py',
                 str(verify_path), '--output', str(out_png), '--scale', '2'],
            )
        except FileNotFoundError:
            fail('render failed: `uv` not found on PATH')
        if result.returncode != 0:
            fail(f'render failed: {render_failure_cause(result)}')
        if not out_png.is_file():
            fail('render failed: renderer wrote no PNG')
        if reference_png and reference_png.exists():
            ref_size = reference_png.stat().st_size
            new_size = out_png.stat().st_size
            ratio = new_size / ref_size if ref_size else 0
            if not (0.5 <= ratio <= 2.0):
                fail(f'post-save render size deviates sharply from pre-save '
                     f'(ref={ref_size}, new={new_size}, ratio={ratio:.2f}) — '
                     f'likely JSON corruption during save')


def main() -> None:
    """Run, and report anything the checks above did not anticipate as one
    line instead of a traceback. KeyboardInterrupt is not caught."""
    try:
        run()
    except Exception as e:
        text = str(e).strip()
        cause = text.splitlines()[0] if text else ''
        fail(f'unexpected {type(e).__name__}: {cause}')


def run() -> None:
    if len(sys.argv) != 2:
        print('Usage: verify_saved_diagram.py <path-to-.excalidraw.md>',
              file=sys.stderr)
        sys.exit(2)

    md_path = Path(sys.argv[1])
    if not md_path.exists():
        fail(f'file not found: {md_path}')

    try:
        content = md_path.read_text(encoding='utf-8')
    except (OSError, UnicodeDecodeError) as e:
        fail(f'cannot read {md_path}: {e}')
    check_format_markers(content)

    json_text, is_compressed = extract_json_block(content)
    if is_compressed:
        print('OK: format markers present; compressed-json block not decoded or '
              'rendered (ea.create path: markers only)')
        return

    try:
        json.loads(json_text)
    except (json.JSONDecodeError, RecursionError) as e:
        fail(f'drawing block is not valid JSON: {e}')
    for name in ('SIGTERM', 'SIGHUP'):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), interrupted)
    render_and_compare(json_text, Path('/tmp/diagram.png'))
    print('OK: format markers present, JSON parses, post-save render succeeds')


if __name__ == '__main__':
    main()
