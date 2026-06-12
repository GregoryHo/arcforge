"""Tests for arc-learning skill.

Verifies the skill document describes the optional learning lifecycle:
observe -> automatic candidate queue -> review/approve -> draft materialize -> inspect -> explicit activate.
"""

from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-learning/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def test_frontmatter_exists():
    text = _read_skill()
    assert text.startswith("---\n")
    assert "name: arc-learning" in text
    assert "description:" in text


def test_description_mentions_optional_candidate_lifecycle():
    text = _read_skill().lower()
    assert "optional" in text
    assert "candidate" in text
    assert "lifecycle" in text


def test_has_quick_reference_for_supported_arcforge_commands():
    """Required primary surface commands (post-pivot v3.1 dashboard-driven)."""
    text = _read_skill()
    assert "## Quick Reference" in text
    for command in [
        "arcforge learn status",
        "arcforge learn enable --project",
        "arcforge learn disable --project",
        "arcforge learn dashboard",
    ]:
        assert command in text


def test_documents_retired_legacy_cli():
    """Post-pivot SKILL.md must clearly mark pre-pivot CLI subcommands as legacy."""
    text = _read_skill()
    assert "Retired" in text or "Deprecated" in text or "Legacy" in text
    # Legacy CLI subcommands named in the one-line retired notice to warn users away
    for legacy in ["analyze", "approve", "materialize", "activate"]:
        assert legacy in text
    # The retired notice routes users to the dashboard
    assert "use the dashboard" in text


def test_has_workflow_with_approval_and_activation_gates():
    text = _read_skill().lower()
    assert "## workflow" in text
    assert "disabled by default" in text
    assert "pending candidate" in text
    assert "approve" in text
    assert "dismiss" in text or "reject" in text
    assert "materialize" in text
    assert "inspect" in text
    assert "activat" in text  # matches activate/activation


def test_key_principles_enforce_conservative_learning():
    text = _read_skill().lower()
    assert "## key principles" in text
    assert "no active behavior change without explicit activation" in text
    assert "project scope first" in text
    # Post-pivot: global promotion IS supported via dashboard, but silent
    # auto-promotion is not. Either wording is acceptable.
    assert "global" in text and ("unsupported" in text or "explicit" in text)
    assert "redacted" in text or "sanitized" in text


def test_when_to_use_and_not_to_use_sections_exist():
    text = _read_skill()
    assert "## When to Use" in text
    assert "## When NOT to Use" in text


def test_no_legacy_direct_generation_guidance():
    text = _read_skill().lower()
    assert "generate artifact" not in text
    assert "directly generate active" not in text
    assert "learn.js generate" not in text
    assert "check-duplicate" not in text


def test_position_documents_queue_and_draft_path():
    text = _read_skill().lower()
    assert "position:" in text
    assert "observations" in text
    assert "candidate queue" in text
    assert "inactive draft" in text  # singular or plural
    assert "active artifact" in text  # singular or plural


def test_legacy_learn_js_removed():
    """The retired clustering script no longer ships; the dashboard Evolve action replaced it."""
    assert not Path("skills/arc-learning/scripts/learn.js").exists()
    text = _read_skill().lower()
    assert "legacy" in text
    assert "learn.js" not in text
