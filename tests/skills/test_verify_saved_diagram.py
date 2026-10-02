"""Contract test for diagramming-obsidian's `references/verify_saved_diagram.py`.

Runs the script as the skill's Phase 3 runs it (a subprocess on the saved
`.excalidraw.md`) and asserts what its docstring promises for both save paths.

On the `ea.create()` path the drawing is a compressed-json block the verifier
does not decode, so it checks the format markers and nothing else; its success
line and its docstring must say so rather than imply the canvas was rendered.

On the manual-fallback path it re-renders by running `uv run python
render_excalidraw.py` from its own directory. A stub `uv` on PATH stands in for
that render, so no test here needs Playwright or Chromium.

The verifier renders into a fresh temporary directory, but compares against
the skill's fixed pre-save render, `/tmp/diagram.png`, so an autouse fixture
moves any existing copy aside for each test and puts it back afterwards;
ambient `/tmp` state never reaches an assertion.
"""

import importlib.util
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

from .helper_contract_support import REPLACEMENTS, contract_violations, run_all

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REFERENCES = PROJECT_ROOT / "skills" / "core" / "diagramming-obsidian" / "references"
SCRIPT = REFERENCES / "verify_saved_diagram.py"

MARKERS = (
    "---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n"
    "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==\n\n"
    "# Excalidraw Data\n\n## Text Elements\n\n## Drawing\n"
)

SCENE = json.dumps({"type": "excalidraw", "elements": [{"type": "rectangle", "x": 0, "y": 0}]})

# Stands in for `uv run python render_excalidraw.py <in> --output <out> --scale 2`:
# records its argv, cwd and the scene it was handed, then acts out FAKE_UV_MODE:
# fails, fails noisily or silently, sleeps, exits 0 without a PNG, or writes
# FAKE_UV_BYTES (default 100) bytes.
FAKE_UV = '''
import json, os, sys
from pathlib import Path
with open(os.environ["FAKE_UV_LOG"], "w") as log:
    scene = Path(sys.argv[4]).read_text(encoding="utf-8")
    json.dump({"argv": sys.argv[1:], "cwd": os.getcwd(), "scene": scene, "pid": os.getpid()}, log)
mode = os.environ.get("FAKE_UV_MODE")
if mode == "fail":
    print("render exploded", file=sys.stderr)
    sys.exit(1)
if mode == "noisy":
    print("Resolved 5 packages in 1ms", file=sys.stderr)
    print("ERROR: playwright not installed. Run: cd /r && uv sync", file=sys.stderr)
    print("trailing noise", file=sys.stderr)
    sys.exit(1)
if mode == "silent":
    sys.exit(3)
if mode == "sleep":
    import time
    time.sleep(30)
if mode == "tree":
    # Like `uv run`: the render is a grandchild. It outlives a SIGKILLed parent
    # unless it is signalled itself, and then writes into the scratch directory.
    import subprocess
    out = sys.argv[sys.argv.index("--output") + 1]
    grandchild = subprocess.Popen([sys.executable, "-c", (
        "import os, sys, time; from pathlib import Path\\n"
        "Path(sys.argv[2]).write_text(str(os.getpid()))\\n"
        "time.sleep(1.5)\\n"
        "Path(sys.argv[1]).parent.mkdir(parents=True, exist_ok=True)\\n"
        "Path(sys.argv[1]).write_bytes(b'late')\\n"
    ), out, os.environ["FAKE_UV_LOG"] + ".grandchild"])
    grandchild.wait()
if mode == "no-png":
    sys.exit(0)
out = Path(sys.argv[sys.argv.index("--output") + 1])
out.write_bytes(b"x" * int(os.environ.get("FAKE_UV_BYTES", "100")))
'''

REFERENCE_PNG = Path("/tmp/diagram.png")


@pytest.fixture(autouse=True)
def isolated_reference_png():
    # Save and remove whatever an earlier run left at the reference path;
    # restore it once the test is done.
    saved = REFERENCE_PNG.read_bytes() if REFERENCE_PNG.exists() else None
    REFERENCE_PNG.unlink(missing_ok=True)
    try:
        yield
    finally:
        REFERENCE_PNG.unlink(missing_ok=True)
        if saved is not None:
            REFERENCE_PNG.write_bytes(saved)


def _fake_uv(tmp_path: Path, mode: str, size: int | None = None) -> dict:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    uv = bin_dir / "uv"
    uv.write_text(f"#!{sys.executable}\n{FAKE_UV}", encoding="utf-8")
    uv.chmod(0o755)
    env = {
        **os.environ,
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        "FAKE_UV_LOG": str(tmp_path / "uv-call.json"),
        "FAKE_UV_MODE": mode,
    }
    if size is not None:
        env["FAKE_UV_BYTES"] = str(size)
    return env


def _verify(tmp_path: Path, content: str, env: dict | None = None) -> subprocess.CompletedProcess:
    saved = tmp_path / "d.excalidraw.md"
    saved.write_text(content, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(saved)], capture_output=True, text=True, check=False, env=env
    )


def _manual(json_text: str) -> str:
    return MARKERS + "```json\n" + json_text + "\n```\n%%\n"


def test_compressed_block_passes_on_format_markers_alone(tmp_path):
    # The payload is not valid compressed data: the verifier never decodes it.
    proc = _verify(tmp_path, MARKERS + "```compressed-json\nnot-a-real-payload\n```\n%%\n")
    assert proc.returncode == 0, proc.stderr
    assert "format markers" in proc.stdout
    assert "not decoded or rendered" in proc.stdout


def test_compressed_block_missing_a_marker_fails(tmp_path):
    content = MARKERS.replace("tags: [excalidraw]\n", "") + "```compressed-json\nx\n```\n"
    proc = _verify(tmp_path, content)
    assert proc.returncode == 1
    assert "missing format markers" in proc.stderr


def test_docstring_says_the_compressed_path_checks_markers_only():
    doc = SCRIPT.read_text(encoding="utf-8").split('"""')[1]
    assert "compressed-json" in doc and "markers only" in doc
    assert "either save path" not in doc


@pytest.mark.parametrize("args", [[], ["a.md", "b.md"]], ids=["no-args", "two-args"])
def test_wrong_argument_count_exits_2_with_usage(args):
    proc = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, check=False)
    assert proc.returncode == 2
    assert "Usage: verify_saved_diagram.py <path-to-.excalidraw.md>" in proc.stderr


def test_missing_file_fails(tmp_path):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(tmp_path / "absent.excalidraw.md")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 1
    assert "VERIFY FAILED: file not found:" in proc.stderr


@pytest.mark.parametrize(
    "key, marker",
    [
        ("plugin_parsed", "excalidraw-plugin: parsed"),
        ("tags_inline", "tags: [excalidraw]"),
        ("warning_line", "==⚠  Switch to EXCALIDRAW VIEW"),
        ("heading", "# Excalidraw Data"),
    ],
)
def test_each_missing_marker_is_named(tmp_path, key, marker):
    proc = _verify(tmp_path, MARKERS.replace(marker, "") + "```compressed-json\nx\n```\n")
    assert proc.returncode == 1
    assert f"VERIFY FAILED: missing format markers: ['{key}']" in proc.stderr


def test_block_list_tags_are_a_missing_marker(tmp_path):
    # Hand-written `tags:\n  - excalidraw` is the silent corruption the inline
    # marker exists to catch.
    content = MARKERS.replace("tags: [excalidraw]", "tags:\n  - excalidraw") + "```json\n{}\n```\n"
    proc = _verify(tmp_path, content)
    assert proc.returncode == 1
    assert "['tags_inline']" in proc.stderr


def test_no_drawing_block_fails(tmp_path):
    proc = _verify(tmp_path, MARKERS + "no block here\n")
    assert proc.returncode == 1
    assert "VERIFY FAILED: no ```json or ```compressed-json block found" in proc.stderr


def test_manual_path_renders_from_the_scripts_directory_and_reports_success(tmp_path):
    # A pre-save reference the same size as the stub's render: the ratio check runs and passes.
    REFERENCE_PNG.write_bytes(b"x" * 100)
    env = _fake_uv(tmp_path, "ok")
    proc = _verify(tmp_path, _manual(SCENE), env)
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == "OK: format markers present, JSON parses, post-save render succeeds"
    call = json.loads((tmp_path / "uv-call.json").read_text(encoding="utf-8"))
    run, python, script, scene, output_flag, png, scale_flag, scale = call["argv"]
    assert (run, python, script, output_flag, scale_flag, scale) == (
        "run", "python", "render_excalidraw.py", "--output", "--scale", "2",
    )
    assert Path(call["cwd"]).resolve() == REFERENCES.resolve()
    assert call["scene"] == SCENE


def test_manual_path_renders_into_a_fresh_directory_it_removes(tmp_path):
    # Two runs never share a scratch file, so concurrent verifies cannot collide.
    env = _fake_uv(tmp_path, "ok")
    argvs = []
    for _ in range(2):
        assert _verify(tmp_path, _manual(SCENE), env).returncode == 0
        argvs.append(json.loads((tmp_path / "uv-call.json").read_text(encoding="utf-8"))["argv"])
    (scene_a, png_a), (scene_b, png_b) = ((Path(a[3]), Path(a[5])) for a in argvs)
    assert scene_a.parent == png_a.parent and scene_b.parent == png_b.parent
    assert scene_a.parent != scene_b.parent
    for path in (scene_a, png_a, scene_b, png_b):
        assert not path.parent.exists()


def test_manual_path_render_failure_fails_with_the_renderers_stderr(tmp_path):
    proc = _verify(tmp_path, _manual(SCENE), _fake_uv(tmp_path, "fail"))
    assert proc.returncode == 1
    assert "VERIFY FAILED: render failed: render exploded" in proc.stderr


def _load_module():
    spec = importlib.util.spec_from_file_location("verify_saved_diagram", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("new_size, passes", [(100, True), (300, False), (40, False)])
def test_post_save_render_size_must_stay_within_half_to_double_the_reference(
    tmp_path, monkeypatch, capsys, new_size, passes
):
    # Called in-process so the reference PNG can be any path, here under tmp_path.
    for key, value in _fake_uv(tmp_path, "ok", new_size).items():
        monkeypatch.setenv(key, value)
    reference = tmp_path / "ref.png"
    reference.write_bytes(b"x" * 100)
    module = _load_module()
    if passes:
        module.render_and_compare(SCENE, reference)
        return
    with pytest.raises(SystemExit) as exit_info:
        module.render_and_compare(SCENE, reference)
    assert exit_info.value.code == 1
    assert "post-save render size deviates sharply from pre-save" in capsys.readouterr().err


@pytest.mark.parametrize("block", ["{not json", "[" * 200_000 + "]" * 200_000], ids=["not-json", "nested-too-deep"])
def test_manual_path_invalid_json_fails_with_one_line_before_rendering(tmp_path, block):
    proc = _verify(tmp_path, _manual(block), _fake_uv(tmp_path, "ok"))
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith("VERIFY FAILED: drawing block is not valid JSON: ")
    assert not (tmp_path / "uv-call.json").exists()


def test_manual_path_without_uv_fails_with_one_line(tmp_path):
    # PATH holds only an empty directory: `uv` cannot be found.
    empty = tmp_path / "empty-bin"
    empty.mkdir()
    proc = _verify(tmp_path, _manual(SCENE), {**os.environ, "PATH": str(empty)})
    assert proc.returncode == 1
    assert proc.stderr.strip() == "VERIFY FAILED: render failed: `uv` not found on PATH"


def test_manual_path_render_failure_reports_the_renderers_error_line_only(tmp_path):
    proc = _verify(tmp_path, _manual(SCENE), _fake_uv(tmp_path, "noisy"))
    assert proc.returncode == 1
    assert proc.stderr.strip() == (
        "VERIFY FAILED: render failed: ERROR: playwright not installed. Run: cd /r && uv sync"
    )


def test_a_failure_with_control_characters_is_one_bounded_line(capsys):
    module = _load_module()
    with pytest.raises(SystemExit) as exit_info:
        module.fail("render failed: ERROR: got 'a\nb\x1b[31m'")
    assert exit_info.value.code == 1
    assert capsys.readouterr().err == "VERIFY FAILED: render failed: ERROR: got 'a\\x0ab\\x1b[31m'\n"
    with pytest.raises(SystemExit):
        module.fail("x" * 100_000)
    (line,) = capsys.readouterr().err.splitlines()
    assert line == "VERIFY FAILED: " + "x" * 1000 + "… (truncated)"


def test_manual_path_silent_render_failure_names_the_exit_status(tmp_path):
    proc = _verify(tmp_path, _manual(SCENE), _fake_uv(tmp_path, "silent"))
    assert proc.returncode == 1
    assert proc.stderr.strip() == "VERIFY FAILED: render failed: renderer exited with status 3"


def test_manual_path_render_that_writes_no_png_fails(tmp_path):
    REFERENCE_PNG.write_bytes(b"x" * 100)
    proc = _verify(tmp_path, _manual(SCENE), _fake_uv(tmp_path, "no-png"))
    assert proc.returncode == 1
    assert proc.stderr.strip() == "VERIFY FAILED: render failed: renderer wrote no PNG"


@pytest.mark.parametrize("kind", ["binary", "directory", "no-permission"])
def test_unreadable_saved_file_fails_with_one_line(tmp_path, kind):
    if kind == "no-permission" and os.geteuid() == 0:
        pytest.skip("root reads a chmod 000 file")
    path = tmp_path / "d.excalidraw.md"
    if kind == "directory":
        path.mkdir()
    elif kind == "binary":
        path.write_bytes(MARKERS.encode("utf-8") + b"\xff\xfe")
    else:
        path.write_text(MARKERS, encoding="utf-8")
        path.chmod(0)
    proc = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True, check=False)
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith(f"VERIFY FAILED: cannot read {path}: "), line


def _running(pid: int) -> bool:
    """Whether `pid` is still executing. A zombie counts as stopped: where PID 1
    does not reap adopted children (some containers), a killed process stays
    in the table and `os.kill(pid, 0)` alone would still succeed."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    state = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return bool(state) and not state.startswith("Z")


@pytest.mark.parametrize("signum", [signal.SIGTERM, signal.SIGHUP], ids=["SIGTERM", "SIGHUP"])
def test_signal_mid_render_removes_the_scratch_directory(tmp_path, signum):
    saved = tmp_path / "d.excalidraw.md"
    saved.write_text(_manual(SCENE), encoding="utf-8")
    log = tmp_path / "uv-call.json"
    grandchild_log = Path(str(log) + ".grandchild")
    proc = subprocess.Popen(
        [sys.executable, str(SCRIPT), str(saved)],
        env=_fake_uv(tmp_path, "tree"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        deadline = time.monotonic() + 10
        while not grandchild_log.exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert grandchild_log.exists(), "the stub render never started"
        time.sleep(0.1)  # let the stub finish writing its log
        call = json.loads(log.read_text(encoding="utf-8"))
        scratch = Path(call["argv"][3]).parent
        assert scratch.is_dir()
        proc.send_signal(signum)
        _, stderr = proc.communicate(timeout=10)
    finally:
        proc.kill()
    assert proc.returncode == 128 + signum, stderr
    assert stderr.strip() == f"VERIFY FAILED: interrupted by {signal.Signals(signum).name}"
    assert not scratch.exists()
    assert not _running(call["pid"])  # the stub `uv`
    # The render under it is gone too: past the moment it would have written,
    # nothing has re-created the scratch directory and the process is dead.
    time.sleep(2)
    assert not scratch.exists()
    assert not _running(int(grandchild_log.read_text(encoding="utf-8")))


def test_without_killpg_an_interrupt_still_stops_the_renderer(monkeypatch):
    # Platforms without process groups fall back to the child alone.
    monkeypatch.delattr(os, "killpg")
    module = _load_module()
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        module.stop_process_group(child)
        assert child.returncode is not None
    finally:
        child.kill()
        child.wait()


def test_an_unexpected_exception_is_one_failed_line_not_a_traceback(monkeypatch, capsys):
    module = _load_module()

    def explode():
        raise TypeError("unhashable type: 'dict'\nsecond line")

    monkeypatch.setattr(module, "run", explode)
    with pytest.raises(SystemExit) as exit_info:
        module.main()
    assert exit_info.value.code == 1
    assert capsys.readouterr().err == "VERIFY FAILED: unexpected TypeError: unhashable type: 'dict'\n"


def test_mutated_saved_files_never_print_a_traceback(tmp_path):
    # Every prefix of a valid manual-path file, and its drawing block replaced
    # by each kind of JSON value.
    whole = _manual(SCENE)
    cases = [(f"prefix-{n}", whole[:n]) for n in range(0, len(whole), 7)]
    cases += [(f"block={json.dumps(v)}", _manual(json.dumps(v))) for v in REPLACEMENTS]
    env = _fake_uv(tmp_path, "ok")

    def run(case):
        name, content = case
        path = tmp_path / f"{abs(hash(name))}.excalidraw.md"
        path.write_text(content, encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True, check=False, env=env
        )
        return name, proc

    assert len(cases) > 40
    assert contract_violations(run_all(cases, run), "VERIFY FAILED: ") == []
