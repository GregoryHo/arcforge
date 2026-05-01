from pathlib import Path


def test_active_eval_scenarios_use_current_assertion_format():
    scenario_paths = sorted(Path("evals/scenarios").glob("*.md"))

    assert scenario_paths

    for path in scenario_paths:
        text = path.read_text(encoding="utf-8")
        assert "# Eval:" in text
        assert "## Assertions" in text
        assert "0-10 scale" not in text.lower()
