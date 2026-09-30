"""Contract test for diagramming-obsidian's `references/render_excalidraw.py` Chromium hint.

Runs the script as the skill runs it (a subprocess), with a stub `playwright`
package on PYTHONPATH whose Chromium is missing, and asserts that the command
the error prints can be run as printed: its `cd` target exists and is the
directory holding the script's `pyproject.toml`.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REFERENCES = PROJECT_ROOT / "skills" / "core" / "diagramming-obsidian" / "references"
SCRIPT = REFERENCES / "render_excalidraw.py"

# sync_playwright() whose Chromium launch fails the way a missing browser does.
NO_CHROMIUM = '''
class _Chromium:
    def launch(self, **kwargs):
        raise Exception("BrowserType.launch: Executable doesn't exist at /nowhere/chrome")

class _Playwright:
    chromium = _Chromium()
    def __enter__(self):
        return self
    def __exit__(self, *exc):
        return False

def sync_playwright():
    return _Playwright()
'''


def _run_without_chromium(tmp_path: Path) -> str:
    stub = tmp_path / "stub"
    (stub / "playwright").mkdir(parents=True)
    (stub / "playwright" / "__init__.py").write_text("", encoding="utf-8")
    (stub / "playwright" / "sync_api.py").write_text(NO_CHROMIUM, encoding="utf-8")
    diagram = tmp_path / "d.excalidraw"
    diagram.write_text(
        json.dumps({"type": "excalidraw", "elements": [{"type": "rectangle", "x": 0, "y": 0, "width": 10, "height": 10}]}),
        encoding="utf-8",
    )
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(diagram)],
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(stub)},
    )
    assert proc.returncode == 1, proc.stderr
    return proc.stderr


def _cd_target(stderr: str) -> Path:
    match = re.search(r'Run: cd "([^"]+)" &&', stderr)
    assert match, f'no runnable `cd "<dir>" &&` hint in:\n{stderr}'
    return Path(match.group(1))


def test_missing_chromium_hint_names_the_scripts_own_directory(tmp_path):
    stderr = _run_without_chromium(tmp_path)
    assert "Chromium not installed" in stderr
    target = _cd_target(stderr)
    assert target.is_dir() and (target / "pyproject.toml").is_file()
    assert target.resolve() == REFERENCES.resolve()
    assert "playwright install chromium" in stderr

