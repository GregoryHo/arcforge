"""Contract test for diagramming-obsidian's `references/render_excalidraw.py` Chromium hint.

Runs the script as the skill runs it (a subprocess), with a stub `playwright`
package on PYTHONPATH whose Chromium is missing, and asserts that the command
the error prints can be run as printed: its `cd` target exists and is the
directory holding the script's `pyproject.toml`.
"""

import json
import os
import shlex
import shutil
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


def _run_without_chromium(tmp_path: Path, script: Path = SCRIPT) -> str:
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
        [sys.executable, str(script), str(diagram)],
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(stub)},
    )
    assert proc.returncode == 1, proc.stderr
    return proc.stderr


def _cd_target(stderr: str) -> Path:
    # Parse the hint the way a shell would when the user pastes it.
    line = next((l for l in stderr.splitlines() if l.startswith("Run: cd ")), None)
    assert line, f"no `Run: cd <dir> && ...` hint in:\n{stderr}"
    words = shlex.split(line[len("Run: "):])
    assert words[0] == "cd" and words[2] == "&&", words
    return Path(words[1])


def test_missing_chromium_hint_names_the_scripts_own_directory(tmp_path):
    stderr = _run_without_chromium(tmp_path)
    assert "Chromium not installed" in stderr
    target = _cd_target(stderr)
    assert target.is_dir() and (target / "pyproject.toml").is_file()
    assert target.resolve() == REFERENCES.resolve()
    assert "playwright install chromium" in stderr



def test_missing_chromium_hint_quotes_a_directory_with_a_space_and_a_quote(tmp_path):
    # Pasted into a shell, the hint must reach this exact directory: no word
    # split at the space, no string ended by the quote, no `$()` expansion.
    odd = tmp_path / 'ref "q" $(echo x) dir'
    odd.mkdir()
    for name in ("render_excalidraw.py", "render_template.html"):
        shutil.copy(REFERENCES / name, odd / name)
    stderr = _run_without_chromium(tmp_path, odd / "render_excalidraw.py")
    assert _cd_target(stderr) == odd.resolve()
