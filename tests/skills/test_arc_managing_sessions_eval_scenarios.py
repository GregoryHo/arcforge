from pathlib import Path


SCENARIOS = [
    "eval-arc-managing-sessions-quick-handover.md",
    "eval-arc-managing-sessions-archive-recommendation.md",
    "eval-arc-managing-sessions-resume-wait.md",
]


def _read(name: str) -> str:
    return Path("evals/scenarios", name).read_text(encoding="utf-8")


def test_arc_managing_sessions_behavioral_eval_scenarios_exist():
    for name in SCENARIOS:
        assert Path("evals/scenarios", name).exists()


def test_arc_managing_sessions_eval_scenarios_target_skill_and_non_regression_policy():
    for name in SCENARIOS:
        text = _read(name).lower()
        assert "# eval:" in text
        assert "## target\nskills/arc-managing-sessions/skill.md" in text
        assert "## preflight\nskip" in text
        assert "## verdict policy\nnon-regression" in text
        assert "## grader\ncode" in text


def test_arc_managing_sessions_eval_scenarios_cover_core_behaviors():
    quick = _read("eval-arc-managing-sessions-quick-handover.md").lower()
    archive = _read("eval-arc-managing-sessions-archive-recommendation.md").lower()
    resume = _read("eval-arc-managing-sessions-resume-wait.md").lower()

    assert "quick handover" in quick
    assert "archive is not recommended" in quick or "archive recommendation of no" in quick
    assert "pure q&a" in quick or "read-only" in quick

    assert "high decision density" in archive
    assert "explicitly recommends archive" in archive
    assert "do not actually create an archive" in archive

    assert "wait for user confirmation" in resume
    assert "does not start" in resume
    assert "do not edit files or run commands" in resume


def test_arc_managing_sessions_eval_graders_emit_all_assertion_labels():
    for name in SCENARIOS:
        text = _read(name)
        assertions = [line for line in text.splitlines() if line.startswith("- [ ] A")]
        for index in range(1, len(assertions) + 1):
            assert f'emit("A{index}"' in text
