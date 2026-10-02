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

import importlib.util
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from .helper_contract_support import contract_violations, mutations, run_all

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

# A sync_playwright() whose browser goes through the whole render. `stub.json`
# next to it names the call that raises (`fail_at`) and its message; every
# call is appended to `calls.log`, so a test can see the browser was closed.
RENDERS = '''
import json
from pathlib import Path

HERE = Path(__file__).parent
CONFIG = json.loads((HERE / "stub.json").read_text())

def _call(name, *args):
    with open(HERE / "calls.log", "a") as log:
        log.write(name + "\\n")
    if CONFIG.get("fail_at") == name:
        raise Exception(CONFIG["message"])

class _Svg:
    def screenshot(self, path):
        _call("screenshot")
        Path(path).write_bytes(b"\\x89PNG fake")

class _Page:
    def __init__(self):
        self.waits = 0
    def goto(self, url):
        _call("goto")
    def wait_for_function(self, expression, timeout):
        self.waits += 1
        _call("wait_module" if self.waits == 1 else "wait_render")
    def evaluate(self, script):
        _call("evaluate")
        return {"success": True}
    def query_selector(self, selector):
        _call("query_selector")
        return _Svg()

class _Browser:
    def new_page(self, **kwargs):
        _call("new_page")
        return _Page()
    def close(self):
        _call("close")

class _Chromium:
    def launch(self, **kwargs):
        _call("launch")
        return _Browser()

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
    (stub / "playwright").mkdir(parents=True, exist_ok=True)
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
    # The hint ends the one error line; parse it the way a shell would when
    # the user pastes it.
    (line,) = stderr.splitlines()
    assert line.startswith("ERROR: ") and ". Run: cd " in line, line
    words = shlex.split(line.split(". Run: ", 1)[1])
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


def test_missing_playwright_is_one_error_line_ending_in_the_setup_command(tmp_path):
    proc = _run(tmp_path, sync_api=None, init="raise ImportError('No module named playwright')")
    assert proc.returncode == 1
    assert proc.stderr.startswith("ERROR: playwright not installed. Run: cd ")
    assert proc.stderr.rstrip().endswith(" && uv sync && uv run playwright install chromium")
    assert _cd_target(proc.stderr).resolve() == REFERENCES.resolve()


@pytest.mark.parametrize("kind", ["binary", "directory", "no-permission"])
def test_unreadable_input_exits_1_with_one_error_line(tmp_path, kind):
    if kind == "no-permission" and os.geteuid() == 0:
        pytest.skip("root reads a chmod 000 file")
    path = tmp_path / "input"
    if kind == "directory":
        path.mkdir()
    elif kind == "binary":
        path.write_bytes(b"\x89PNG\r\n\x1a\n\x00\xff")
    else:
        path.write_text("{}", encoding="utf-8")
        path.chmod(0)
    proc = _run(tmp_path, str(path))
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith(f"ERROR: Cannot read {path}: "), line


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
        ("[" * 200_000, "ERROR: Invalid JSON in "),
        (
            json.dumps({"type": "excalidraw", "elements": [{"type": "rectangle", "x": "0"}]}),
            "ERROR: Invalid Excalidraw file: element 0 'x' is not a number",
        ),
        (
            json.dumps({"type": "excalidraw", "elements": [{"type": "arrow", "x": 0, "y": 0, "points": [[0]]}]}),
            "ERROR: Invalid Excalidraw file: element 0 'points' is not an array of [x, y] number pairs",
        ),
    ],
    ids=["invalid-json", "wrong-type", "no-elements", "elements-not-array", "elements-empty",
         "top-level-array", "element-not-object", "nested-too-deep", "x-not-number", "points-bad-pair"],
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


def _render_with(tmp_path: Path, *args: str, fail_at: str | None = None, message: str = ""):
    (tmp_path / "stub" / "playwright").mkdir(parents=True)
    (tmp_path / "stub" / "playwright" / "stub.json").write_text(
        json.dumps({"fail_at": fail_at, "message": message}), encoding="utf-8"
    )
    proc = _run(tmp_path, *args, sync_api=RENDERS)
    log = tmp_path / "stub" / "playwright" / "calls.log"
    calls = log.read_text(encoding="utf-8").split() if log.exists() else []
    return proc, calls


def test_stubbed_render_writes_the_png_and_closes_the_browser(tmp_path):
    proc, calls = _render_with(tmp_path)
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == str(tmp_path / "d.png")
    assert (tmp_path / "d.png").read_bytes().startswith(b"\x89PNG")
    assert calls[-1] == "close"


@pytest.mark.parametrize(
    "fail_at, message, stage",
    [
        (
            "wait_module",
            "Page.wait_for_function: Timeout 30000ms exceeded.\nCall log:\n  - waiting",
            "timed out loading the Excalidraw bundle from esm.sh (network?)",
        ),
        ("goto", "Page.goto: net::ERR_FILE_NOT_FOUND", "loading the render template"),
        ("evaluate", "Page.evaluate: TypeError: x is undefined", "rendering the diagram"),
        ("wait_render", "Page.wait_for_function: Timeout 15000ms exceeded.", "rendering the diagram"),
        ("screenshot", "Target page, context or browser has been closed\nBrowser logs:", "capturing the PNG"),
    ],
    ids=["offline", "template", "evaluate", "render-timeout", "browser-closed"],
)
def test_failure_after_launch_is_one_error_line_and_closes_the_browser(tmp_path, fail_at, message, stage):
    proc, calls = _render_with(tmp_path, fail_at=fail_at, message=message)
    assert proc.returncode == 1
    first = message.splitlines()[0]
    if stage.startswith("timed out"):
        expected = f"ERROR: Render failed: {stage}: {first}"
    else:
        expected = f"ERROR: Render failed while {stage}: {first}"
    assert proc.stderr.strip() == expected
    assert calls[-1] == "close"


@pytest.mark.parametrize("target", ["missing-dir", "a-directory"])
def test_unwritable_output_is_reported_before_launching_chromium(tmp_path, target):
    out = tmp_path / "no-such-dir" / "x.png" if target == "missing-dir" else tmp_path
    proc, calls = _render_with(tmp_path, str(tmp_path / "d.excalidraw"), "--output", str(out))
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith(f"ERROR: Cannot write {out}: "), line
    assert "launch" not in calls


def test_an_unexpected_exception_is_one_error_line_not_a_traceback(tmp_path):
    # sync_playwright() itself raising is outside every specific check: the
    # last-resort guard still reports it as one line.
    proc = _run(tmp_path, sync_api="def sync_playwright():\n    raise RuntimeError('driver gone\\nmore')\n")
    assert proc.returncode == 1
    assert proc.stderr == "ERROR: Unexpected RuntimeError: driver gone\n"


FUZZ_SCENE = {
    "type": "excalidraw",
    "elements": [
        {"id": "r", "type": "rectangle", "x": 0, "y": 0, "width": 100, "height": 60, "isDeleted": False},
        {"id": "a", "type": "arrow", "x": -50, "y": 20, "points": [[0, 0], [200, 0]]},
    ],
}


def test_mutated_scenes_never_print_a_traceback(tmp_path):
    stub = _stub(tmp_path, RENDERS)
    (stub / "playwright" / "stub.json").write_text(json.dumps({"fail_at": None}), encoding="utf-8")
    env = {**os.environ, "PYTHONPATH": str(stub)}

    def run(case):
        name, doc = case
        path = tmp_path / f"{abs(hash(name))}.excalidraw"
        path.write_text(json.dumps(doc), encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True, check=False, env=env
        )
        return name, proc

    cases = mutations(FUZZ_SCENE)
    assert len(cases) > 80
    assert contract_violations(run_all(cases, run), "ERROR: ") == []


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
