from pathlib import Path


PLAN_PATH = Path("docs/plans/optional-automatic-learning.md")


def _read_plan() -> str:
    return PLAN_PATH.read_text(encoding="utf-8")


def test_optional_automatic_learning_plan_exists():
    assert PLAN_PATH.exists()


def test_plan_defines_optional_but_automatic_learning_contract():
    plan = _read_plan()
    text = plan.lower()

    assert (
        "Learning remains optional to enable, automatic once enabled, and conservative at the point of behavior change."
        in plan
    )
    assert "optional" in text
    assert "automatic once enabled" in text
    assert "observe daemon" in text
    assert "candidate queue" in text
    assert "user authorization" in text


def test_plan_excludes_import_export_from_mvp():
    text = _read_plan().lower()

    assert "import/export" in text
    assert "out of mvp" in text or "not in mvp" in text


def test_plan_defines_project_global_scope_and_promotion():
    text = _read_plan().lower()

    assert "project-level" in text
    assert "global-level" in text
    assert "default to project" in text
    assert "promotion candidate" in text
    assert "2+ projects" in text


def test_plan_includes_release_flow_skill_golden_path():
    text = _read_plan().lower()

    assert "release flow" in text
    assert "project skill" in text
    assert "natural language" in text
    assert "skills/arc-releasing/skill.md.draft" in text
    assert "active `skills/arc-releasing/skill.md` path" in text
    assert "no active skill exists yet" in text
    assert "quality gate" in text


def test_plan_defines_conservative_draft_review_and_activation():
    text = _read_plan().lower()

    assert "skill.md.draft" in text
    assert "learn inspect" in text
    assert "learn drafts" in text
    assert "read-only" in text
    assert "explicit activation" in text
    assert "global activation is not in mvp" in text
    assert "global materialize/activate remain unsupported in mvp" in text
