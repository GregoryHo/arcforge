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
import subprocess
import sys
from pathlib import Path

import pytest

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
# records its argv, cwd and the scene it was handed, then fails or writes
# FAKE_UV_BYTES (default 100) bytes.
FAKE_UV = '''
import json, os, sys
from pathlib import Path
with open(os.environ["FAKE_UV_LOG"], "w") as log:
    scene = Path(sys.argv[4]).read_text(encoding="utf-8")
    json.dump({"argv": sys.argv[1:], "cwd": os.getcwd(), "scene": scene}, log)
if os.environ.get("FAKE_UV_MODE") == "fail":
    print("render exploded", file=sys.stderr)
    sys.exit(1)
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


def test_manual_path_invalid_json_fails_with_one_line_before_rendering(tmp_path):
    proc = _verify(tmp_path, _manual("{not json"), _fake_uv(tmp_path, "ok"))
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
