"""Contract test for diagramming-obsidian's `references/plan_layout.py`.

Runs the script as `references/depth-enhancements.md` runs it (a subprocess on
a spec JSON, optionally `--output` and `--ea-script`) and asserts what its
docstring promises: the layout's JSON shape, flow and evidence columns that
never share an X-range, zone stacking, connection pass-through, and the error
exits on bad input.
"""

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from .helper_contract_support import contract_violations, mutations, run_all

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = PROJECT_ROOT / "skills" / "core" / "diagramming-obsidian" / "references" / "plan_layout.py"

FLOW_SIZES = ("hero", "primary", "secondary", "small", "no-such-size")


def _run(tmp_path: Path, spec, *args: str, raw: str | None = None) -> subprocess.CompletedProcess:
    path = tmp_path / "spec.json"
    path.write_text(raw if raw is not None else json.dumps(spec), encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(path), *args],
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
    )


def _layout(tmp_path: Path, spec) -> dict:
    proc = _run(tmp_path, spec)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def _spec(*zones, **top):
    return {"zones": list(zones), **top}


def test_layout_has_the_documented_shape(tmp_path):
    spec = _spec(
        {
            "id": "z1",
            "title": "CLIENT",
            "elements": [{"id": "a", "type": "flow", "text": "A", "size": "primary"}],
        },
        canvas={"width": 1000, "bg": "#ffffff"},
    )
    layout = _layout(tmp_path, spec)
    assert set(layout) == {"canvas", "zones", "elements", "connections"}
    assert layout["canvas"] == {"width": 1000, "bg": "#ffffff", "height": 220}
    assert layout["zones"] == [
        {"zone_id": "z1", "title": "CLIENT", "title_x": 50, "title_y": 30, "separator_y": 160}
    ]
    assert layout["elements"] == {
        "a": {
            "id": "a",
            "type": "flow",
            "shape": "rectangle",
            "text": "A",
            "x": 50,
            "y": 70,
            "width": 180,
            "height": 70,
            "size": "primary",
        }
    }
    assert layout["connections"] == []


def test_empty_spec_uses_the_default_canvas(tmp_path):
    assert _layout(tmp_path, {}) == {
        "canvas": {"width": 1400, "bg": "#1e1e1e", "height": 30},
        "zones": [],
        "elements": {},
        "connections": [],
    }


@pytest.mark.parametrize("size", FLOW_SIZES)
def test_flow_never_shares_an_x_range_with_evidence(tmp_path, size):
    zone = {
        "id": "z",
        "elements": [
            {"id": "f", "type": "flow", "text": "F", "size": size},
            {"id": "e", "type": "evidence", "text": "x" * 200},
        ],
    }
    els = _layout(tmp_path, _spec(zone))["elements"]
    assert els["f"]["x"] == 50 and els["e"]["x"] == 400
    assert els["f"]["x"] + els["f"]["width"] < els["e"]["x"]


def test_unknown_flow_size_falls_back_to_primary(tmp_path):
    zone = {"id": "z", "elements": [{"id": "f", "type": "flow", "size": "no-such-size"}]}
    el = _layout(tmp_path, _spec(zone))["elements"]["f"]
    assert (el["width"], el["height"], el["size"]) == (180, 70, "no-such-size")


def test_evidence_size_follows_its_text(tmp_path):
    zone = {
        "id": "z",
        "elements": [
            {"id": "short", "type": "evidence", "text": "a"},
            {"id": "wide", "type": "evidence", "text": "x" * 100},
            # A spec carries line breaks as the two characters `\n`, as the docstring's example does.
            {"id": "tall", "type": "evidence", "text": "\\n".join(["line"] * 10)},
        ],
    }
    els = _layout(tmp_path, _spec(zone))["elements"]
    assert (els["short"]["width"], els["short"]["height"]) == (250, 120)
    assert els["wide"]["width"] == 350
    assert els["tall"]["height"] == 10 * 16 + 30


def test_columns_stack_independently_and_zones_stack_below_each_other(tmp_path):
    spec = _spec(
        {
            "id": "z1",
            "elements": [
                {"id": "f1", "type": "flow", "size": "primary"},
                {"id": "e1", "type": "evidence", "text": "e"},
                {"id": "f2", "type": "flow", "size": "small"},
            ],
        },
        {"id": "z2", "elements": [{"id": "f3", "type": "flow", "size": "small"}]},
    )
    layout = _layout(tmp_path, spec)
    els = layout["elements"]
    assert els["f1"]["y"] == 70 and els["e1"]["y"] == 70
    assert els["f2"]["y"] == 70 + 70 + 30
    # Zone 1's bottom is its taller column (flow: f2 ends at 170 + 40, evidence
    # at 70 + 120) plus the 20 px margin.
    z1, z2 = layout["zones"]
    assert z1["separator_y"] == 170 + 40 + 20
    assert z2["title_y"] == z1["separator_y"] + 60
    assert els["f3"]["y"] == z2["title_y"] + 40
    assert els["f3"]["y"] > z1["separator_y"]


def test_connections_pass_through_zone_first_then_cross_zone(tmp_path):
    inner = {"from": "a", "to": "b", "anchor": ["bottom", "top"]}
    cross = {"from": "b", "to": "c", "anchor": ["right", "left"]}
    spec = _spec(
        {"id": "z1", "elements": [{"id": "a"}, {"id": "b"}], "connections": [inner]},
        {"id": "z2", "elements": [{"id": "c"}]},
        cross_zone_connections=[cross],
    )
    assert _layout(tmp_path, spec)["connections"] == [inner, cross]


def test_output_flag_writes_the_file_and_keeps_stdout_empty(tmp_path):
    out = tmp_path / "layout.json"
    spec = _spec({"id": "z", "elements": [{"id": "a", "type": "flow"}]})
    proc = _run(tmp_path, spec, "--output", str(out))
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout == ""
    assert f"Layout written to {out}" in proc.stderr
    assert json.loads(out.read_text(encoding="utf-8")) == _layout(tmp_path, spec)


def test_ea_script_prints_an_outline_to_stderr(tmp_path):
    spec = _spec(
        {
            "id": "z",
            "title": "SERVER",
            "elements": [
                {"id": "f", "type": "flow", "text": "Handle"},
                {"id": "e", "type": "evidence", "text": "payload"},
            ],
        }
    )
    proc = _run(tmp_path, spec, "--ea-script")
    assert proc.returncode == 0, proc.stderr
    json.loads(proc.stdout)  # stdout stays pure JSON
    assert "// === ZONE: SERVER ===" in proc.stderr
    assert "// [FLOW] f: (50, 70) 180x70 rectangle — Handle" in proc.stderr
    assert "// [EVIDENCE] e: (400, 70) 250x120 rectangle — payload" in proc.stderr


def test_missing_spec_exits_1_with_a_message(tmp_path):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(tmp_path / "absent.json")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 1
    assert "ERROR: File not found:" in proc.stderr


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


def test_output_into_a_missing_directory_exits_1_with_one_error_line(tmp_path):
    out = tmp_path / "no-such-dir" / "layout.json"
    proc = _run(tmp_path, {}, "--output", str(out))
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith(f"ERROR: Cannot write {out}: "), line


@pytest.mark.parametrize(
    "raw, message",
    [
        ("{not json", "ERROR: Invalid JSON: "),
        (json.dumps([]), "ERROR: Not a layout spec: top level is an array, not an object"),
        (json.dumps({"canvas": 5}), "ERROR: Not a layout spec: 'canvas' is a number, not an object"),
        (json.dumps({"zones": {}}), "ERROR: Not a layout spec: 'zones' is an object, not an array"),
        (json.dumps({"zones": ["z"]}), "ERROR: Not a layout spec: zone 0 is a string, not an object"),
        (json.dumps({"zones": [{"elements": 1}]}), "ERROR: Not a layout spec: zone 0 'elements' is a number, not an array"),
        (json.dumps({"zones": [{"elements": [1]}]}), "ERROR: Not a layout spec: zone 0 element 0 is a number, not an object"),
        (json.dumps({"zones": [{"elements": [{"type": "flow"}]}]}), "ERROR: Not a layout spec: zone 0 element 0 has no 'id'"),
        (
            json.dumps({"zones": [{"elements": [{"id": "e", "type": "evidence", "text": 5}]}]}),
            "ERROR: Not a layout spec: zone 0 element 0 ('e') 'text' is a number, not a string",
        ),
        (
            json.dumps({"zones": [{"elements": [{"id": "f", "size": ["x"]}]}]}),
            "ERROR: Not a layout spec: zone 0 element 0 ('f') 'size' is an array, not a string",
        ),
        ("[" * 200_000, "ERROR: Invalid JSON: "),
        (
            json.dumps({"zones": [{"elements": [{"id": {"k": 1}}]}]}),
            "ERROR: Not a layout spec: zone 0 element 0 'id' is an object, not a string",
        ),
        (json.dumps({"zones": [{"connections": None}]}), "ERROR: Not a layout spec: zone 0 'connections' is null, not an array"),
        (json.dumps({"zones": [{"connections": [1]}]}), "ERROR: Not a layout spec: zone 0 connection 0 is a number, not an object"),
        (json.dumps({"cross_zone_connections": "x"}), "ERROR: Not a layout spec: 'cross_zone_connections' is a string, not an array"),
        (json.dumps({"cross_zone_connections": [[]]}), "ERROR: Not a layout spec: cross-zone connection 0 is an array, not an object"),
    ],
    ids=["invalid-json", "top-level-array", "canvas-not-object", "zones-not-array", "zone-not-object",
         "elements-not-array", "element-not-object", "element-without-id", "text-not-string", "size-not-string",
         "nested-too-deep", "id-not-string", "connections-null", "connection-not-object",
         "cross-zone-not-array", "cross-zone-entry-not-object"],
)
def test_bad_spec_exits_1_with_one_error_line(tmp_path, raw, message):
    proc = _run(tmp_path, None, raw=raw)
    assert proc.returncode == 1
    (line,) = proc.stderr.splitlines()
    assert line.startswith(message), line
    assert proc.stdout == ""


def _load_module():
    spec = importlib.util.spec_from_file_location(SCRIPT.stem, SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_an_unexpected_exception_is_one_error_line_not_a_traceback(monkeypatch, capsys):
    # The last-resort guard under the specific checks: whatever escapes is
    # still one line naming the exception, and a non-zero exit.
    module = _load_module()

    def explode():
        raise TypeError("unhashable type: 'dict'\nsecond line")

    monkeypatch.setattr(module, "run", explode)
    with pytest.raises(SystemExit) as exit_info:
        module.main()
    assert exit_info.value.code == 1
    assert capsys.readouterr().err == "ERROR: Unexpected TypeError: unhashable type: 'dict'\n"


FUZZ_SPEC = {
    "canvas": {"width": 800, "bg": "#ffffff"},
    "zones": [
        {
            "id": "z",
            "title": "CLIENT",
            "elements": [
                {"id": "f", "type": "flow", "text": "F", "shape": "rectangle", "size": "primary"},
                {"id": "e", "type": "evidence", "text": "E"},
            ],
            "connections": [{"from": "f", "to": "e", "anchor": ["right", "left"]}],
        }
    ],
    "cross_zone_connections": [{"from": "f", "to": "e"}],
}


def test_mutated_specs_never_print_a_traceback(tmp_path):
    def run(case):
        name, doc = case
        path = tmp_path / f"{abs(hash(name))}.json"
        path.write_text(json.dumps(doc), encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), str(path), "--ea-script"], capture_output=True, text=True, check=False
        )
        # --ea-script writes its outline to stderr on success; the contract is about failures.
        return name, proc

    cases = mutations(FUZZ_SPEC)
    assert len(cases) > 100
    assert contract_violations(run_all(cases, run), "ERROR: ") == []


@pytest.mark.parametrize(
    "args, fragment",
    [
        ([], "the following arguments are required: input"),
        (["in.json", "--bogus"], "unrecognized arguments: --bogus"),
        (["in.json", "--output"], "argument --output/-o: expected one argument"),
    ],
    ids=["missing-input", "unknown-option", "bad-value"],
)
def test_usage_error_is_one_line_and_exit_2(tmp_path, args, fragment):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), *args], capture_output=True, text=True, check=False, cwd=tmp_path
    )
    assert proc.returncode == 2
    (line,) = proc.stderr.splitlines()
    assert line.startswith("ERROR: ") and fragment in line, line
    assert line.endswith(" (run with --help for usage)")
    assert "usage:" not in proc.stderr


def test_help_prints_usage_on_stdout_and_exits_0(tmp_path):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--help"], capture_output=True, text=True, check=False, cwd=tmp_path
    )
    assert proc.returncode == 0
    assert proc.stdout.startswith("usage: ")
    assert proc.stderr == ""
