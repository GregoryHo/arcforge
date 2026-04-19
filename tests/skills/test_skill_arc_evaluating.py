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


# --- v2-specific assertions (fr-sb-008) ---


def test_arc_evaluating_frontmatter_has_exactly_two_fields():
    """Frontmatter must have exactly two fields: name and description."""
    text = _read_skill()
    front = _parse_frontmatter(text)
    assert set(front.keys()) == {"name", "description"}, (
        f"Expected exactly 'name' and 'description' fields, got: {set(front.keys())}"
    )


def test_arc_evaluating_body_word_count_at_most_1800():
    """Body word count must be <= 1800."""
    import subprocess
    result = subprocess.run(
        ["wc", "-w", "skills/arc-evaluating/SKILL.md"],
        capture_output=True,
        text=True,
    )
    word_count = int(result.stdout.strip().split()[0])
    assert word_count <= 1800, f"Word count is {word_count}, must be <= 1800"


def test_arc_evaluating_rationalization_table_exists_with_six_rows():
    """Rationalization Table must exist with at least 6 rows."""
    text = _read_skill()
    lower = text.lower()

    # Must have a rationalization table
    has_table_header = "excuse" in lower and "reality" in lower
    assert has_table_header, "Missing Rationalization Table with 'Excuse' and 'Reality' columns"

    # Count table data rows (lines starting with | that are not header/separator rows)
    import re
    table_rows = [
        line for line in text.splitlines()
        if line.strip().startswith("|")
        and "---" not in line
        and re.search(r"excuse|reality", line, re.IGNORECASE) is None
    ]
    # Filter to only rows that are inside the rationalization table
    # Find the rationalization section
    rationaliz_idx = lower.find("rationalization")
    assert rationaliz_idx != -1, "Missing Rationalization section"
    rationaliz_text = text[rationaliz_idx:]
    data_rows = [
        line for line in rationaliz_text.splitlines()
        if line.strip().startswith("|")
        and "---" not in line
        and re.search(r"excuse|reality", line, re.IGNORECASE) is None
    ]
    assert len(data_rows) >= 6, (
        f"Rationalization Table must have >= 6 rows, found {len(data_rows)}"
    )


def test_arc_evaluating_rationalization_table_covers_v2_excuses():
    """Rationalization Table must cover all 6 required v2 excuses."""
    text = _read_skill()
    lower = text.lower()

    rationaliz_idx = lower.find("rationalization")
    assert rationaliz_idx != -1, "Missing Rationalization section"
    rationaliz_text = lower[rationaliz_idx:]

    required_phrases = [
        "too small",
        "time pressure",
        "preflight",
        "k=4",
        "insufficient_data",
        "weak_assertion",
    ]
    for phrase in required_phrases:
        assert phrase in rationaliz_text, (
            f"Rationalization Table missing v2 excuse covering '{phrase}'"
        )


def test_arc_evaluating_red_flags_section_exists_with_six_bullets():
    """Red Flags section must exist with >= 6 bullets."""
    text = _read_skill()
    lower = text.lower()

    red_flags_idx = lower.find("red flags")
    assert red_flags_idx != -1, "Missing 'Red Flags' section"

    # Count bullet points after the section header
    red_flags_text = text[red_flags_idx:]
    # Stop at next section header (##)
    next_section = red_flags_text.find("\n## ", 10)
    if next_section == -1:
        next_section = red_flags_text.find("\n# ", 10)
    if next_section != -1:
        red_flags_text = red_flags_text[:next_section]

    bullets = [line for line in red_flags_text.splitlines() if line.strip().startswith("- ")]
    assert len(bullets) >= 6, (
        f"Red Flags section must have >= 6 bullets, found {len(bullets)}"
    )


def test_arc_evaluating_red_flags_stop_directive():
    """Red Flags section must end with stop/re-read directive."""
    text = _read_skill()
    lower = text.lower()

    red_flags_idx = lower.find("red flags")
    assert red_flags_idx != -1, "Missing 'Red Flags' section"

    red_flags_text = lower[red_flags_idx:]
    # Check for stop/re-read directive
    has_stop = "stop" in red_flags_text and "re-read" in red_flags_text
    assert has_stop, "Red Flags section missing stop/re-read directive"


def test_arc_evaluating_red_flags_covers_v2_failures():
    """Red Flags section must cover all 6 required v2 failure thoughts."""
    text = _read_skill()
    lower = text.lower()

    red_flags_idx = lower.find("red flags")
    assert red_flags_idx != -1, "Missing 'Red Flags' section"

    red_flags_text = lower[red_flags_idx:]
    required_concepts = [
        "manually tested",
        "docs-only",
        "insufficient_data",
        "promote",
        "blind comparator",
        "preflight",
    ]
    for concept in required_concepts:
        assert concept in red_flags_text, (
            f"Red Flags section missing concept '{concept}'"
        )


def test_arc_evaluating_v2_reference_files_exist():
    """New v2 reference files must exist."""
    from pathlib import Path
    refs = [
        Path("skills/arc-evaluating/references/preflight.md"),
        Path("skills/arc-evaluating/references/verdict-policy.md"),
        Path("skills/arc-evaluating/references/audit-workflow.md"),
    ]
    for ref in refs:
        assert ref.exists(), f"Missing required reference file: {ref}"


def test_arc_evaluating_v2_reference_files_word_count():
    """Each new v2 reference file must be >= 300 words."""
    import subprocess
    from pathlib import Path
    refs = [
        "skills/arc-evaluating/references/preflight.md",
        "skills/arc-evaluating/references/verdict-policy.md",
        "skills/arc-evaluating/references/audit-workflow.md",
    ]
    for ref in refs:
        result = subprocess.run(
            ["wc", "-w", ref],
            capture_output=True,
            text=True,
        )
        word_count = int(result.stdout.strip().split()[0])
        assert word_count >= 300, (
            f"{ref} must be >= 300 words, got {word_count}"
        )


def test_grading_and_execution_has_discovered_claims_schema():
    """grading-and-execution.md must document discovered_claims[] schema."""
    from pathlib import Path
    text = Path("skills/arc-evaluating/references/grading-and-execution.md").read_text(encoding="utf-8")
    lower = text.lower()

    assert "discovered_claims" in lower, "Missing discovered_claims schema"
    # Check required fields
    assert '"text"' in text, "discovered_claims missing 'text' field"
    assert '"category"' in text, "discovered_claims missing 'category' field"
    assert '"passed"' in text, "discovered_claims missing 'passed' field"
    assert '"evidence"' in text, "discovered_claims missing 'evidence' field"
    # Check category enum values
    assert "factual" in lower, "discovered_claims category missing 'factual'"
    assert "process" in lower, "discovered_claims category missing 'process'"
    assert "quality" in lower, "discovered_claims category missing 'quality'"


def test_grading_and_execution_has_weak_assertions_schema():
    """grading-and-execution.md must document weak_assertions[] schema."""
    from pathlib import Path
    text = Path("skills/arc-evaluating/references/grading-and-execution.md").read_text(encoding="utf-8")
    lower = text.lower()

    assert "weak_assertions" in lower, "Missing weak_assertions schema"
    # Check required fields
    assert '"assertion_id"' in text, "weak_assertions missing 'assertion_id' field"
    assert '"reason"' in text, "weak_assertions missing 'reason' field"
