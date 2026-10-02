"""Contract test for diagramming-obsidian's `references/check_overlaps.py`.

Runs the script as the skill's Phase 2 runs it (a subprocess on an
`.excalidraw` file) and asserts what its docstring and `--help` promise: the
issue types it detects, the `--json` report shape and verdicts, the
`--min-overlap` / `--padding` flags, and the error exits on bad input.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = PROJECT_ROOT / "skills" / "core" / "diagramming-obsidian" / "references" / "check_overlaps.py"


def rect(id_, x, y, w=100, h=100, **extra):
    return {"id": id_, "type": "rectangle", "x": x, "y": y, "width": w, "height": h, **extra}


def text(id_, x, y, w=60, h=20, value="label", **extra):
    return {"id": id_, "type": "text", "x": x, "y": y, "width": w, "height": h, "text": value, **extra}


def arrow(id_, x, y, points, **extra):
    return {"id": id_, "type": "arrow", "x": x, "y": y, "points": points, **extra}


def _run(tmp_path: Path, elements, *args: str, raw: str | None = None) -> subprocess.CompletedProcess:
    diagram = tmp_path / "d.excalidraw"
    content = raw if raw is not None else json.dumps({"type": "excalidraw", "elements": elements})
    diagram.write_text(content, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(diagram), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def _report(tmp_path: Path, elements, *args: str) -> dict:
    proc = _run(tmp_path, elements, "--json", *args)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_clean_diagram_reports_no_issues(tmp_path):
    report = _report(tmp_path, [rect("a", 0, 0), rect("b", 300, 0)])
    assert report == {
        "issues": [],
        "summary": {"total": 0, "high_severity": 0, "by_type": {}},
        "verdict": "clean",
    }


def test_shape_overlap_is_high_severity_and_suggests_moving_the_smaller_shape(tmp_path):
    report = _report(tmp_path, [rect("big", 0, 0, 200, 200), rect("small", 150, 150, 100, 100)])
    assert report["verdict"] == "needs_fix"
    assert report["summary"] == {"total": 1, "high_severity": 1, "by_type": {"shape-shape": 1}}
    (issue,) = report["issues"]
    assert issue["type"] == "shape-shape"
    assert issue["severity"] == "high"
    assert issue["overlap_px"] == 2500
    assert issue["suggestion"] == "Move rectangle#small down by 70px"


def test_small_shape_overlap_is_medium_severity(tmp_path):
    # 20 x 20 = 400 px², at or above the default 100 threshold but not above 500.
    (issue,) = _report(tmp_path, [rect("a", 0, 0), rect("b", 80, 80)])["issues"]
    assert (issue["type"], issue["severity"], issue["overlap_px"]) == ("shape-shape", "medium", 400)


def test_min_overlap_raises_the_shape_threshold(tmp_path):
    elements = [rect("a", 0, 0), rect("b", 50, 50)]
    assert _report(tmp_path, elements)["summary"]["by_type"] == {"shape-shape": 1}
    assert _report(tmp_path, elements, "--min-overlap", "3000")["verdict"] == "clean"


def test_shapes_sharing_a_group_are_not_an_overlap(tmp_path):
    elements = [rect("a", 0, 0, groupIds=["g"]), rect("b", 50, 50, groupIds=["g"])]
    assert _report(tmp_path, elements)["verdict"] == "clean"


def test_deleted_elements_are_ignored(tmp_path):
    elements = [rect("a", 0, 0), rect("b", 50, 50, isDeleted=True)]
    assert _report(tmp_path, elements)["verdict"] == "clean"


def test_arrow_through_an_unbound_shape_is_a_crossing_with_a_waypoint(tmp_path):
    (issue,) = _report(tmp_path, [rect("box", 0, 0), arrow("arr", -100, 50, [[0, 0], [400, 0]])])["issues"]
    assert issue == {
        "type": "arrow-shape-crossing",
        "severity": "high",
        "arrow": "arrow#arr",
        "arrow_id": "arr",
        "shape": "rectangle#box",
        "crossing_point": [50.0, 50.0],
        "suggestion": "Add waypoint at [50, 130] to route around rectangle#box",
    }


def test_arrow_bound_to_the_shape_is_not_a_crossing(tmp_path):
    bound = arrow("arr", -100, 50, [[0, 0], [400, 0]], startBinding={"elementId": "box"})
    assert _report(tmp_path, [rect("box", 0, 0), bound])["verdict"] == "clean"


def test_arrow_through_free_text_is_a_crossing(tmp_path):
    report = _report(tmp_path, [text("t", 0, 0), arrow("arr", -100, 10, [[0, 0], [400, 0]])])
    (issue,) = report["issues"]
    assert issue["type"] == "arrow-text-crossing"
    assert issue["text"] == 'text("label")'
    assert issue["suggestion"].startswith("Route arrow left of text: add waypoint at [-30, ")


def test_free_texts_too_close_are_reported_and_padding_widens_the_net(tmp_path):
    # 15 px apart vertically: outside the default 10 px padding, inside 20.
    elements = [text("t1", 0, 0, value="one"), text("t2", 0, 35, value="two")]
    assert _report(tmp_path, elements)["verdict"] == "clean"
    report = _report(tmp_path, elements, "--padding", "20")
    assert report["verdict"] == "minor_issues"
    (issue,) = report["issues"]
    assert (issue["type"], issue["severity"]) == ("text-text", "medium")
    assert (issue["element_a"], issue["element_b"]) == ('text("one")', 'text("two")')


def test_free_text_over_a_shape_is_reported_unless_bound_or_contained(tmp_path):
    loose = [rect("box", 0, 0), text("t", 10, 10)]
    (issue,) = _report(tmp_path, loose)["issues"]
    assert (issue["type"], issue["shape"]) == ("text-shape", "rectangle#box")

    bound = [rect("box", 0, 0, boundElements=[{"id": "t", "type": "text"}]), text("t", 10, 10)]
    assert _report(tmp_path, bound)["verdict"] == "clean"

    contained = [rect("box", 0, 0), text("t", 10, 10, containerId="box")]
    assert _report(tmp_path, contained)["verdict"] == "clean"


def test_shapes_closer_than_30px_are_crowded_and_low_severity(tmp_path):
    report = _report(tmp_path, [rect("a", 0, 0), rect("b", 110, 0)])
    assert report["verdict"] == "spacing_only"
    (issue,) = report["issues"]
    assert issue == {
        "type": "crowded-shapes",
        "severity": "low",
        "element_a": "rectangle#a",
        "element_b": "rectangle#b",
        "gap_px": 10,
        "suggestion": "Increase gap between rectangle#a and rectangle#b from 10px to 30px",
    }


def test_default_output_is_a_formatted_report_not_json(tmp_path):
    # JSON needs `--json`, which the skill's Phase 2 command does not pass.
    proc = _run(tmp_path, [rect("box", 0, 0), arrow("arr", -100, 50, [[0, 0], [400, 0]])])
    assert proc.returncode == 0, proc.stderr
    lines = proc.stdout.splitlines()
    assert lines[0] == "Overlap check: 1 issues found (1 high severity)"
    assert lines[1] == "Verdict: needs_fix"
    assert "[arrow-shape-crossing]" in proc.stdout
    assert "arrow#arr crosses rectangle#box" in proc.stdout
    assert "Fix: Add waypoint at [50, 130]" in proc.stdout


def test_findings_do_not_change_the_exit_code(tmp_path):
    # Exit 0 whatever the verdict: callers read the verdict, not the status.
    assert _run(tmp_path, [rect("a", 0, 0), rect("b", 50, 50)]).returncode == 0


def test_missing_file_exits_1_with_a_message(tmp_path):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(tmp_path / "absent.excalidraw")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 1
    assert "ERROR: File not found:" in proc.stderr


@pytest.mark.parametrize("raw", ["{not json", "[" * 200_000], ids=["not-json", "nested-too-deep"])
def test_invalid_json_exits_1_with_one_error_line(tmp_path, raw):
    proc = _run(tmp_path, None, raw=raw)
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith("ERROR: Invalid JSON: "), line


def _unreadable_input(tmp_path: Path, kind: str) -> Path:
    if kind == "directory":
        return tmp_path
    path = tmp_path / "input"
    if kind == "binary":
        path.write_bytes(b"\x89PNG\r\n\x1a\n\x00\xff")
    else:
        path.write_text("{}", encoding="utf-8")
        path.chmod(0)
    return path


@pytest.mark.parametrize("kind", ["binary", "directory", "no-permission"])
def test_unreadable_input_exits_1_with_one_error_line(tmp_path, kind):
    if kind == "no-permission" and os.geteuid() == 0:
        pytest.skip("root reads a chmod 000 file")
    path = _unreadable_input(tmp_path, kind)
    proc = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True, check=False)
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith(f"ERROR: Cannot read {path}: "), line


def test_help_documents_the_flags():
    proc = subprocess.run([sys.executable, str(SCRIPT), "--help"], capture_output=True, text=True, check=False)
    assert proc.returncode == 0
    for flag in ("--min-overlap", "--padding", "--json"):
        assert flag in proc.stdout


@pytest.mark.parametrize(
    "raw, message",
    [
        (json.dumps([]), "ERROR: Not an Excalidraw scene: top level is an array, not an object"),
        (json.dumps({"type": "excalidraw"}), "ERROR: Not an Excalidraw scene: missing 'elements' array"),
        (json.dumps({"elements": {}}), "ERROR: Not an Excalidraw scene: 'elements' is an object, not an array"),
        (json.dumps({"elements": ["x"]}), "ERROR: Not an Excalidraw scene: element 0 is a string, not an object"),
        (
            json.dumps({"elements": [{"type": "rectangle", "x": 0, "y": 0, "width": 10, "height": 10}]}),
            "ERROR: Not an Excalidraw scene: element 0 has no 'id'",
        ),
        (json.dumps({"elements": [{"id": "a"}]}), "ERROR: Not an Excalidraw scene: element 0 ('a') has no 'type'"),
        (json.dumps({"elements": [{"id": None, "type": "text"}]}), "ERROR: Not an Excalidraw scene: element 0 'id' is null, not a string"),
        (json.dumps({"elements": [rect("a", "0", 0)]}), "ERROR: Not an Excalidraw scene: element 0 ('a') 'x' is a string, not a number"),
        (
            json.dumps({"elements": [arrow("a", 0, 0, "bad")]}),
            "ERROR: Not an Excalidraw scene: element 0 ('a') 'points' is not an array of [x, y] number pairs",
        ),
        (
            json.dumps({"elements": [arrow("a", 0, 0, [[0, 0], [1]])]}),
            "ERROR: Not an Excalidraw scene: element 0 ('a') 'points' is not an array of [x, y] number pairs",
        ),
        (
            json.dumps({"elements": [rect("a", 0, 0, boundElements="x")]}),
            "ERROR: Not an Excalidraw scene: element 0 ('a') 'boundElements' is a string, not an array or null",
        ),
        (
            json.dumps({"elements": [rect("a", 0, 0, boundElements=["x"])]}),
            "ERROR: Not an Excalidraw scene: element 0 ('a') 'boundElements' holds a string, not an object",
        ),
        (
            json.dumps({"elements": [rect("a", 0, 0, groupIds={})]}),
            "ERROR: Not an Excalidraw scene: element 0 ('a') 'groupIds' is an object, not an array or null",
        ),
        (
            json.dumps({"elements": [arrow("a", 0, 0, [[0, 0]], startBinding="b")]}),
            "ERROR: Not an Excalidraw scene: element 0 ('a') 'startBinding' is a string, not an object or null",
        ),
        (
            json.dumps({"elements": [text("a", 0, 0, value=5)]}),
            "ERROR: Not an Excalidraw scene: element 0 ('a') 'text' is a number, not a string",
        ),
    ],
    ids=["top-level-array", "no-elements", "elements-not-array", "element-not-object", "element-without-id",
         "element-without-type", "id-null", "x-string", "points-string", "points-short-pair",
         "bound-elements-string", "bound-element-not-object", "group-ids-object", "binding-string", "text-number"],
)
def test_valid_json_that_is_not_a_scene_exits_1_with_one_error_line(tmp_path, raw, message):
    proc = _run(tmp_path, None, raw=raw)
    assert proc.returncode == 1
    assert proc.stderr.strip() == message
    assert proc.stdout == ""


def test_docstring_says_json_output_needs_the_flag():
    doc = SCRIPT.read_text(encoding="utf-8").split('"""')[1]
    assert "Output: JSON report" not in doc
    assert "--json" in doc
