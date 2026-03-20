from pathlib import Path


def test_eval_scenario_format_uses_normalized_five_tier_scale():
    text = Path("evals/scenarios/eval-scenario-format.md").read_text(encoding="utf-8")
    lower = text.lower()

    assert "normalized 0.0-1.0" in lower
    assert "0.25" in text
    assert "0.75" in text
    assert "0-10 scale" not in lower
