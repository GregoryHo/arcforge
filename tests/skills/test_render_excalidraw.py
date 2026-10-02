"""Contract test for diagramming-obsidian's `references/render_excalidraw.py`.

Runs the script as the skill runs it (a subprocess), with a stub `playwright`
package on PYTHONPATH, so no test here needs Chromium: argument parsing, input
validation, the "playwright missing" and "Chromium missing" messages, and that
the Chromium hint's command can be run as printed — its `cd` target exists and
is the directory holding the script's `pyproject.toml`.

One test does a real render. It is opt-in, because the render template loads
Excalidraw from https://esm.sh and so needs the network: it runs only with
`ARCFORGE_RENDER_TESTS=1` set and where `uv sync` has built the script's own
environment (`references/.venv`), and it skips when Chromium is not installed
there.
"""

import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REFERENCES = PROJECT_ROOT / "skills" / "core" / "diagramming-obsidian" / "references"
SCRIPT = REFERENCES / "render_excalidraw.py"

SCENE = {"type": "excalidraw", "elements": [{"type": "rectangle", "x": 0, "y": 0, "width": 10, "height": 10}]}

# sync_playwright() whose Chromium launch fails with the given message.
LAUNCH_FAILS = '''
class _Chromium:
    def launch(self, **kwargs):
        raise Exception({message!r})

class _Playwright:
    chromium = _Chromium()
    def __enter__(self):
        return self
    def __exit__(self, *exc):
        return False

def sync_playwright():
    return _Playwright()
'''

NO_CHROMIUM = LAUNCH_FAILS.format(message="BrowserType.launch: Executable doesn't exist at /nowhere/chrome")


def _stub(tmp_path: Path, sync_api: str | None, init: str = "") -> Path:
    stub = tmp_path / "stub"
    (stub / "playwright").mkdir(parents=True)
    (stub / "playwright" / "__init__.py").write_text(init, encoding="utf-8")
    if sync_api is not None:
        (stub / "playwright" / "sync_api.py").write_text(sync_api, encoding="utf-8")
    return stub


def _run(
    tmp_path: Path,
    *args: str,
    content: str | None = None,
    sync_api: str | None = NO_CHROMIUM,
    init: str = "",
    script: Path = SCRIPT,
) -> subprocess.CompletedProcess:
    stub = _stub(tmp_path, sync_api, init)
    diagram = tmp_path / "d.excalidraw"
    diagram.write_text(json.dumps(SCENE) if content is None else content, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(script), *(args or (str(diagram),))],
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(stub)},
    )


def _run_without_chromium(tmp_path: Path, script: Path = SCRIPT) -> str:
    proc = _run(tmp_path, script=script)
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


def test_help_documents_the_flags(tmp_path):
    proc = _run(tmp_path, "--help")
    assert proc.returncode == 0
    for flag in ("--output", "--scale", "--width"):
        assert flag in proc.stdout


def test_non_integer_scale_is_an_argument_error(tmp_path):
    proc = _run(tmp_path, str(tmp_path / "d.excalidraw"), "--scale", "1.5")
    assert proc.returncode == 2
    assert "--scale" in proc.stderr and "invalid int value" in proc.stderr


def test_missing_input_exits_1_before_touching_playwright(tmp_path):
    proc = _run(tmp_path, str(tmp_path / "absent.excalidraw"), sync_api=None, init="raise ImportError('x')")
    assert proc.returncode == 1
    assert "ERROR: File not found:" in proc.stderr
    assert "playwright" not in proc.stderr


def test_missing_playwright_exits_1_with_setup_steps(tmp_path):
    proc = _run(tmp_path, sync_api=None, init="raise ImportError('No module named playwright')")
    assert proc.returncode == 1
    assert "ERROR: playwright not installed." in proc.stderr
    assert "uv sync && uv run playwright install chromium" in proc.stderr


@pytest.mark.parametrize(
    "content, message",
    [
        ("{not json", "ERROR: Invalid JSON in "),
        (json.dumps({**SCENE, "type": "other"}), "Expected type 'excalidraw', got 'other'"),
    ],
    ids=["invalid-json", "wrong-type"],
)
def test_invalid_scene_is_reported_before_missing_playwright(tmp_path, content, message):
    # A broken diagram is reported as broken, not as a missing renderer.
    proc = _run(tmp_path, content=content, sync_api=None, init="raise ImportError('x')")
    assert proc.returncode == 1
    assert message in proc.stderr
    assert "playwright" not in proc.stderr


@pytest.mark.parametrize(
    "content, message",
    [
        ("{not json", "ERROR: Invalid JSON in "),
        (json.dumps({**SCENE, "type": "other"}), "Expected type 'excalidraw', got 'other'"),
        (json.dumps({"type": "excalidraw"}), "Missing 'elements' array"),
        (json.dumps({"type": "excalidraw", "elements": {}}), "'elements' must be an array"),
        (json.dumps({"type": "excalidraw", "elements": []}), "'elements' array is empty"),
        (json.dumps([]), "ERROR: Invalid Excalidraw file: top level is not an object"),
        (
            json.dumps({"type": "excalidraw", "elements": ["x"]}),
            "ERROR: Invalid Excalidraw file: element 0 is not an object",
        ),
    ],
    ids=["invalid-json", "wrong-type", "no-elements", "elements-not-array", "elements-empty",
         "top-level-array", "element-not-object"],
)
def test_invalid_scene_exits_1_with_one_error_line_before_launching_chromium(tmp_path, content, message):
    proc = _run(tmp_path, content=content)
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith("ERROR: ") and message in line
    assert "Chromium" not in proc.stderr


def test_every_scene_problem_is_named_on_the_one_error_line(tmp_path):
    proc = _run(tmp_path, content=json.dumps({"type": "other"}))
    assert proc.returncode == 1
    assert proc.stderr.strip() == (
        "ERROR: Invalid Excalidraw file: Expected type 'excalidraw', got 'other'; Missing 'elements' array"
    )


def test_launch_failure_other_than_a_missing_browser_is_one_error_line(tmp_path):
    # Only "Executable doesn't exist" maps to the install hint; any other
    # launch failure is named as one, with Playwright's first line, not a
    # traceback.
    message = "BrowserType.launch: Host system is missing dependencies\n  sudo apt-get install libnss3"
    proc = _run(tmp_path, sync_api=LAUNCH_FAILS.format(message=message))
    assert proc.returncode == 1
    assert proc.stderr.strip() == (
        "ERROR: Chromium failed to launch: BrowserType.launch: Host system is missing dependencies"
    )


@pytest.mark.skipif(
    os.environ.get("ARCFORGE_RENDER_TESTS") != "1"
    or not (REFERENCES / ".venv").is_dir()
    or shutil.which("uv") is None,
    reason="opt-in real render: set ARCFORGE_RENDER_TESTS=1; needs network (esm.sh), uv, and `uv sync` in references/",
)
def test_real_render_writes_a_png_next_to_the_input(tmp_path):
    diagram = tmp_path / "d.excalidraw"
    diagram.write_text(json.dumps(SCENE), encoding="utf-8")
    proc = subprocess.run(
        ["uv", "run", "--frozen", "python", "render_excalidraw.py", str(diagram)],
        capture_output=True,
        text=True,
        check=False,
        cwd=REFERENCES,
        timeout=120,
    )
    if "Chromium not installed" in proc.stderr:
        pytest.skip("Chromium is not installed in the references/ environment")
    assert proc.returncode == 0, proc.stderr
    png = tmp_path / "d.png"
    assert proc.stdout.strip() == str(png)
    assert png.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
