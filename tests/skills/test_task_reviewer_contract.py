"""Contract tests for the merged per-task task-reviewer (agent + template).

The task-reviewer collapses the two sequential per-task reviewers
(spec-reviewer, then quality-reviewer) into ONE reviewer that reads the
task's change once and returns BOTH verdicts. These tests pin the merged
contract's six elements plus the diff-fallback rules.
"""
from pathlib import Path

TEMPLATE = Path("templates/task-reviewer-prompt.md")
AGENT = Path("agents/task-reviewer.md")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _frontmatter_block(text: str) -> str:
    if not text.startswith("---\n"):
        raise AssertionError("missing frontmatter start")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise AssertionError("missing frontmatter end")
    return text[4:end]


def _parse_frontmatter(text: str) -> dict:
    front = _frontmatter_block(text).strip().splitlines()
    data = {}
    for line in front:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


# --- Template: dual verdict in one pass -----------------------------------


def test_template_has_both_verdict_parts():
    text = _read(TEMPLATE)
    # Part 1 — spec compliance verdict tokens
    assert "Part 1" in text
    assert "Spec Compliance" in text
    assert "✅" in text
    assert "❌" in text
    # Part 2 — task quality verdict tokens
    assert "Part 2" in text
    assert "Task Quality" in text
    assert "Approved" in text
    assert "Needs fixes" in text


def test_template_has_three_check_pattern():
    text = _read(TEMPLATE)
    assert "Missing" in text
    assert "Extra" in text
    assert "Misunderstand" in text


# --- Template: ⚠️ cannot-verify verdict -----------------------------------


def test_template_has_cannot_verify_verdict():
    text = _read(TEMPLATE)
    assert "⚠️" in text
    assert "Cannot verify from diff" in text
    # Reviewer must flag-and-stop, not broaden its own search.
    assert "do NOT broaden your search" in text or "do not broaden" in text.lower()
    # Controller owns resolution — not handed back to the reviewer.
    assert "controller resolves" in text.lower()


# --- Template: strengthened do-not-trust core -----------------------------


def test_template_preserves_do_not_trust_core_strengthened():
    text = _read(TEMPLATE)
    # arcforge's core heading is preserved (not SP6's shorter phrasing).
    assert "Do Not Trust the Implementer Report" in text
    # SP6's sharpening: a stated rationale never downgrades severity.
    assert "never downgrades a finding's severity" in text


# --- Template: tests already ran ------------------------------------------


def test_template_says_tests_already_ran_no_full_suite():
    text = _read(TEMPLATE)
    lower = text.lower()
    assert "tests already ran" in lower or "already ran the tests" in lower
    # Trims quality-reviewer's unconditional full-suite run.
    assert "do not re-run the suite" in lower or "do not re-run the full suite" in lower
    assert "focused" in lower


# --- Template: primary DIFF_FILE + HEAD~1-forbidden BASE..HEAD fallback ----


def test_template_uses_diff_file_primary_and_forbids_head1():
    text = _read(TEMPLATE)
    # Primary input placeholder (arcforge {VARIABLE} style).
    assert "{DIFF_FILE}" in text
    # SP6 fallback + HEAD~1 forbidden.
    assert "BASE..HEAD" in text
    assert "HEAD~1" in text
    assert "primary" in text.lower()


# --- Template: plan-mandated defect labeling (reviewer-side anti-gaming) ---


def test_template_reports_plan_mandated_as_important():
    text = _read(TEMPLATE)
    lower = text.lower()
    assert "plan-mandated" in lower
    # Reviewer categorizes by actual severity independently.
    assert "actual" in lower and "severity" in lower


def test_template_preserves_strengths_section():
    # T1 stop-condition guard: the dual-verdict format must still express
    # quality-reviewer's Strengths section (no verdict lost).
    text = _read(TEMPLATE)
    assert "### Strengths" in text


def test_template_uses_arcforge_placeholder_style():
    text = _read(TEMPLATE)
    # Curly-brace placeholders like the existing templates — not SP6's [BRACKETS].
    assert "{WHAT_WAS_IMPLEMENTED}" in text
    assert "{ACCEPTANCE_CRITERIA}" in text


# --- Agent frontmatter ----------------------------------------------------


def test_agent_frontmatter_name_and_model_sonnet():
    text = _read(AGENT)
    front = _parse_frontmatter(text)
    assert front.get("name") == "task-reviewer"
    # D6: model pinned to sonnet (not inherit).
    assert front.get("model") == "sonnet"


def test_agent_frontmatter_declares_review_tools():
    text = _read(AGENT)
    block = _frontmatter_block(text)
    # Read/Grep/Glob for read-only analysis; Bash for focused test + reading the package.
    for tool in ("Read", "Grep", "Glob", "Bash"):
        assert tool in block, f"agent frontmatter missing tool: {tool}"


def test_agent_points_at_template_and_dual_verdict():
    text = _read(AGENT)
    assert "templates/task-reviewer-prompt.md" in text
    # Both verdicts named in the agent body.
    assert "Spec Compliance" in text
    assert "Task Quality" in text
