from pathlib import Path


PLAN_PATH = Path("docs/plans/learning-subsystem-mvp.md")


def _read_plan() -> str:
    return PLAN_PATH.read_text(encoding="utf-8")


def test_learning_subsystem_mvp_plan_exists():
    assert PLAN_PATH.exists()


def test_mvp_splits_observing_learning_and_reflecting_responsibilities():
    text = _read_plan().lower()

    assert "arc-observing" in text
    assert "sensor" in text or "signal capture" in text
    assert "arc-learning" in text
    assert "candidate lifecycle" in text
    assert "arc-reflecting" in text
    assert "secondary evidence" in text


def test_mvp1_defines_enablement_and_disabled_default():
    text = _read_plan().lower()

    assert "mvp-1" in text
    assert "disabled by default" in text
    assert "explicit enable" in text
    assert "observe" in text and "obey" in text and "config" in text
    assert "observation and candidate analysis may run automatically only after enablement" in text
    assert "fail open" in text


def test_candidate_queue_schema_and_authorization_gate_are_explicit():
    plan = _read_plan()
    text = plan.lower()

    assert (
        "Learning remains optional to enable, automatic once enabled, and conservative at the point of behavior change."
        in plan
    )
    for field in [
        "id",
        "scope",
        "artifact_type",
        "summary",
        "trigger",
        "evidence",
        "confidence",
        "status",
        "created_at",
    ]:
        assert field in text

    assert "candidate queue" in text
    assert "pending" in text
    assert "approved" in text
    assert "rejected" in text
    assert "materialized" in text
    assert "approval required" in text or "requires approval" in text


def test_global_promotion_is_proposed_not_automatic():
    text = _read_plan().lower()

    assert "default to project" in text
    assert "promotion candidate" in text
    assert "2+ projects" in text
    assert "not automatic" in text
    assert "explicit approval" in text


def test_materializer_starts_with_draft_or_activation_gate():
    text = _read_plan().lower()

    assert "mvp-2" in text
    assert ".draft" in text
    assert "not active" in text or "activation gate" in text
    assert "explicit activation" in text or "explicit approval" in text


def test_release_flow_golden_path_has_fixture_eval_plan():
    text = _read_plan().lower()

    assert "mvp-3" in text
    assert "release flow" in text
    assert "fixture observations" in text
    assert "arc-releasing" in text
    assert "natural language" in text
    assert "preflight" in text or "pre-flight" in text

def test_mvp2_includes_read_only_draft_review_and_fail_closed_activation():
    text = _read_plan().lower()

    assert "learn inspect" in text
    assert "learn drafts" in text
    assert "read-only" in text
    assert "review-safe" in text
    assert "global" in text and "does not" in text and "probe project-local artifact paths" in text
    assert "arcforge learn activate <candidate-id> --project" in text
    assert "global activation" in text and "fails closed" in text


def test_pr_readiness_lifecycle_is_documented():
    text = _read_plan().lower()

    assert "disabled by default" in text
    assert "global materialization and activation are not in mvp" in text
    assert "making learning core/default-on" in text
    assert "import/export of learned skills" in text
