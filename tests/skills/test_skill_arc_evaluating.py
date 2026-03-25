from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-evaluating/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def _parse_frontmatter(text: str) -> dict:
    if not text.startswith("---\n"):
        raise AssertionError("missing frontmatter start")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise AssertionError("missing frontmatter end")
    front = text[4:end].strip().splitlines()
    data = {}
    for line in front:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def test_arc_evaluating_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-evaluating"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @file references in skill content (pass@k metric notation is fine)
    import re
    at_refs = re.findall(r"@\w+\.\w+", text)
    assert len(at_refs) == 0, f"Found @file references: {at_refs}"


def test_arc_evaluating_three_scopes_documented():
    text = _read_skill()
    lower = text.lower()

    # All three scopes must be documented
    assert "skill eval" in lower or "### 1. skill" in lower
    assert "agent eval" in lower or "### 2. agent" in lower
    assert "workflow eval" in lower or "### 3. workflow" in lower


def test_arc_evaluating_workflow_ab_explains_environment_difference():
    """Workflow A/B must explain that environment varies, not prompt."""
    text = _read_skill()
    lower = text.lower()

    # Must explain that workflow eval varies the environment
    assert "isolated" in lower or "isolation" in lower
    # Must mention full toolkit/plugins for treatment
    assert "plugin" in lower or "full toolkit" in lower
    # Must clarify baseline = bare agent
    assert "bare agent" in lower or "no plugin" in lower or "without plugin" in lower
    # Must mention same prompt for both conditions
    assert "same prompt" in lower or "identical prompt" in lower


def test_arc_evaluating_workflow_cli_usage():
    """Must document eval ab without --skill-file for workflow scope."""
    text = _read_skill()

    # Must show workflow A/B CLI usage
    assert "eval ab" in text
    # Must explain that --skill-file is not needed for workflow scope
    assert "skill-file" in text.lower()


def test_arc_evaluating_common_mistakes_include_workflow():
    """Common mistakes table must include workflow-specific mistakes."""
    text = _read_skill()
    lower = text.lower()

    # Must have workflow-related common mistakes
    assert "workflow" in lower and "mistake" in lower
    # Must warn about wrong grader choice for workflow evals
    # or about running workflow eval without plugins installed
    has_plugin_warning = "no plugin" in lower or "without plugin" in lower
    has_scope_warning = "scope" in lower and ("skill-file" in lower or "workflow" in lower)
    assert has_plugin_warning or has_scope_warning


def test_arc_evaluating_has_scenario_design_guidance():
    """Must have guidance on writing good eval scenarios."""
    text = _read_skill()
    lower = text.lower()

    # Must have scenario design or preparation guidance
    assert "scenario" in lower
    # Must have guidance distinguishing when to use each scope
    has_when = "when to use" in lower
    has_scope_guidance = "scope" in lower and ("skill" in lower and "workflow" in lower)
    assert has_when or has_scope_guidance


def test_arc_evaluating_requires_question_first_framing():
    """The skill should teach what question the harness is answering before scenario design."""
    text = _read_skill()
    lower = text.lower()

    has_question_first = (
        "what are you trying to learn" in lower
        or "question first" in lower
        or "before choosing a metric" in lower
    )
    has_behavior_change = "change agent behavior" in lower or "behavior change" in lower
    has_task_outcome = "correct output" in lower or "task outcome" in lower
    has_toolkit_effect = "toolkit effect" in lower or "environment effect" in lower

    assert has_question_first
    assert has_behavior_change and has_task_outcome and has_toolkit_effect


def test_arc_evaluating_documents_discriminative_scenario_design():
    """The skill should explain how to design scenarios that isolate signal."""
    text = _read_skill()
    lower = text.lower()

    has_isolation_guidance = "one behavior per scenario" in lower or "isolate one behavior" in lower
    has_trap_guidance = "trap" in lower or "bait" in lower or "discriminative" in lower
    has_ground_truth_guidance = "ground truth" in lower or "defensible" in lower

    assert has_isolation_guidance
    assert has_trap_guidance
    assert has_ground_truth_guidance


def test_arc_evaluating_clarifies_harness_and_comparator_roles():
    """The skill should distinguish scenario structure, numeric stats, and qualitative analysis."""
    text = _read_skill()
    lower = text.lower()

    has_single_condition_guidance = "single-condition" in lower or "single condition" in lower
    has_ab_harness_guidance = "baseline and treatment" in lower and "eval ab" in lower
    has_numeric_vs_qualitative = "programmatic" in lower and "qualitative" in lower

    assert has_single_condition_guidance
    assert has_ab_harness_guidance
    assert has_numeric_vs_qualitative
