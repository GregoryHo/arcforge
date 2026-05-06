from pathlib import Path


def test_active_eval_scenarios_use_current_assertion_format():
    scenario_paths = sorted(Path("evals/scenarios").glob("*.md"))

    assert scenario_paths

    for path in scenario_paths:
        text = path.read_text(encoding="utf-8")
        assert "# Eval:" in text
        assert "## Assertions" in text
        assert "0-10 scale" not in text.lower()


def test_code_graders_do_not_select_latest_transcript_by_mtime():
    scenario_paths = sorted(Path("evals/scenarios").glob("*.md"))

    assert scenario_paths

    forbidden = [
        "def latest_transcript()",
        "glob(\"*/transcripts/*.txt\")",
        "stat().st_mtime",
    ]

    for path in scenario_paths:
        text = path.read_text(encoding="utf-8")
        if "## Grader\ncode" not in text:
            continue
        for needle in forbidden:
            assert needle not in text, f"{path} must use TRANSCRIPT_PATH, not {needle}"
