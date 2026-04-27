from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-refining/SKILL.md")
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


def test_arc_refining_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    # Frontmatter validation
    assert front.get("name") == "arc-refining"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @-syntax file loading
    assert "@" not in text

    # Standardized completion/blocked markers
    assert "✅" in text
    assert "⚠️" in text

    # Description must not hardcode paths (fr-cc-006)
    description = front.get("description", "")
    assert "specs/" not in description
    assert "specs/<spec-id>" not in description


def test_arc_refining_contains_required_sections():
    text = _read_skill()

    # Must have quality checklist
    assert "checklist" in text.lower()
    assert "acceptance criteria" in text.lower()

    # Must have workflow guidance
    assert "workflow guidance" in text.lower() or "clarifying questions" in text.lower()

    # Must specify output format — per-spec directory (not root-level specs/details)
    assert "spec.xml" in text.lower()
    assert "specs/<spec-id>" in text or "specs/<spec_id>" in text

    # Must have validation steps
    assert "validation" in text.lower() or "validate" in text.lower()

    # Must emphasize Source of Truth
    assert "source of truth" in text.lower()


def test_arc_refining_sdd_utils_input_validation():
    """Skill must invoke sdd-utils for input validation (fr-cc-if-005-ac2)."""
    text = _read_skill()

    # Must mention parseDesignDoc and/or sdd-utils for input validation
    assert "parseDesignDoc" in text or "sdd-utils" in text

    # Must mention validateDesignDoc for input validation
    assert "validateDesignDoc" in text


def test_arc_refining_sdd_utils_output_validation():
    """Skill must invoke sdd-utils for output validation (fr-cc-if-005-ac3)."""
    text = _read_skill()

    # Must mention parseSpecHeader and validateSpecHeader for output validation
    assert "parseSpecHeader" in text
    assert "validateSpecHeader" in text


def test_arc_refining_filesystem_behavior_detection():
    """Skill must detect behavior from filesystem state, not from a mode parameter
    (fr-rf-005, fr-rf-009; D5 — no Path A/B/γ/initial/iteration mode labels).
    """
    text = _read_skill()

    # Detection must reference spec.xml existence (the filesystem signal)
    assert "spec.xml" in text

    # Both contexts must be documented as filesystem states, not mode labels
    has_no_prior = (
        "no prior spec" in text.lower()
        or "first formalization" in text.lower()
        or "specs/<spec-id>/spec.xml" in text and "does not exist" in text.lower()
    )
    has_prior = (
        "prior spec exists" in text.lower()
        or "iteration on prior spec" in text.lower()
        or "prior spec" in text.lower()
    )
    assert has_no_prior, "Skill must describe the no-prior-spec context"
    assert has_prior, "Skill must describe the prior-spec context"

    # The deprecated mode labels must be GONE (D5 realignment)
    # Use word-boundary checks so we don't false-trigger on harmless phrases.
    import re
    assert not re.search(r"\bPath A\b", text), "Path A label removed per D5"
    assert not re.search(r"\bPath B\b", text), "Path B label removed per D5"
    assert "gamma mode" not in text.lower(), "gamma mode label removed per D5"
    assert "γ mode" not in text, "γ mode label removed per D5"


def test_arc_refining_two_pass_write():
    """Skill must document two-pass write pattern (fr-rf-010, fr-cc-val-001)."""
    text = _read_skill()

    assert "two-pass" in text.lower() or "build in memory" in text.lower() or "two pass" in text.lower()


def test_arc_refining_delta_metadata():
    """Skill must document delta element output (fr-rf-011)."""
    text = _read_skill()

    # Delta element must be mentioned
    assert "<delta>" in text or "delta metadata" in text.lower() or "delta element" in text.lower()

    # Delta placement — last child of overview
    assert "last child" in text.lower() or "last child of" in text.lower() or "<overview>" in text


def test_arc_refining_no_refiner_report_artifact():
    """Per D6 (2026-04-19 realignment), refiner block writes NO files.
    Any mention of refiner-report.md must be in a negation context.
    """
    text = _read_skill()

    # The skill may mention refiner-report.md only to negate it (e.g., "No refiner-report.md")
    # The forbidden pattern: a positive instruction to PRODUCE the file.
    forbidden = [
        "produce a refiner-report",
        "write a refiner-report",
        "writes a refiner-report",
        "writes refiner-report.md",
        "produce refiner-report.md",
    ]
    for f in forbidden:
        assert f not in text.lower(), (
            f"Skill must not instruct producing a refiner-report (found: {f!r}) — D6 forbids any block-time artifact"
        )

    # Skill MUST explicitly state block behavior is terminal-only / no files
    has_terminal_only = (
        "terminal-only" in text.lower()
        or "no files" in text.lower()
        or "writes nothing" in text.lower()
        or "write no files" in text.lower()
        or "no refiner-report" in text.lower()
    )
    assert has_terminal_only, (
        "Skill must explicitly document terminal-only block behavior (no report file written)"
    )


def test_arc_refining_dag_completion_gate():
    """Per D2 (2026-04-19 realignment), refiner owns the DAG completion gate (fr-rf-012)."""
    text = _read_skill()

    # Must invoke checkDagStatus or document the gate behavior
    has_gate = (
        "checkDagStatus" in text
        or "dag completion gate" in text.lower()
        or "complete current sprint before iterating" in text.lower()
    )
    assert has_gate, "Skill must document the DAG completion gate (per D2/fr-rf-012)"


def test_arc_refining_no_escape_hatch():
    """Per D7 (2026-04-19 realignment), there is no escape hatch from the gate."""
    text = _read_skill()

    has_escape_hatch_disclaimer = (
        "no escape hatch" in text.lower()
        or "no --force" in text.lower()
        or "no force flag" in text.lower()
        or "no `--force`" in text.lower()
    )
    assert has_escape_hatch_disclaimer, (
        "Skill must explicitly state there is no escape hatch (no --force, no abandoned status)"
    )


def test_arc_refining_delta_accumulation():
    """Per D3 (2026-04-19 realignment), refiner appends new <delta> and preserves prior deltas verbatim."""
    text = _read_skill()

    # Must mention preserving prior deltas (not overwriting)
    has_preserve = (
        "preserve every prior" in text.lower()
        or "preserve all prior" in text.lower()
        or "verbatim" in text.lower()
        or "never overwrite" in text.lower()
        or ("append" in text.lower() and "prior" in text.lower())
    )
    assert has_preserve, (
        "Skill must document that prior <delta> elements are preserved verbatim (per D3)"
    )


def test_arc_refining_supersedes():
    """Skill must document version increment and supersedes field (fr-rf-007)."""
    text = _read_skill()

    assert "supersedes" in text


def test_arc_refining_r2_enforcement():
    """Skill must enforce R2 — refiner MUST NOT write to docs/plans/ except the report."""
    text = _read_skill()

    # Must mention R2 or unidirectional rule
    assert "r2" in text.lower() or "unidirectional" in text.lower() or "must not write" in text.lower()


def test_arc_refining_routes_to_arc_planning():
    """Workflow skill must route to /arc-planning after completion (skills.md workflow type rule)."""
    text = _read_skill()

    assert "/arc-planning" in text or "arc-planning" in text


def test_arc_refining_no_refiner_input_check():
    """REFINER_INPUT check must be completely removed (replaced by full design doc consumption)."""
    text = _read_skill()

    assert "REFINER_INPUT" not in text


# ---------------------------------------------------------------------------
# fr-rf-013 — Phase 5 No-Invention Discipline
# ---------------------------------------------------------------------------


def test_fr_rf_013_ac1_rate_limited_example_and_three_moves():
    """fr-rf-013-ac1: Phase 5 must contain the rate-limited / qualitative-phrase example
    showing refiner MUST NOT author a concrete MUST, and must enumerate the three
    legitimate moves (a/b/c).
    """
    text = _read_skill()
    lower = text.lower()

    # Must mention qualitative phrasing or a concrete rate-limited example
    has_qualitative_example = (
        "rate-limited" in lower
        or "rate limited" in lower
        or ("qualitative" in lower and "phrase" in lower)
    )
    assert has_qualitative_example, (
        "fr-rf-013-ac1: Phase 5 must contain a rate-limited or analogous qualitative-phrase example"
    )

    # Must show that inventing a concrete MUST is forbidden
    has_invention_forbidden = (
        "training-data" in lower
        or "training data" in lower
    )
    assert has_invention_forbidden, (
        "fr-rf-013-ac1: Phase 5 must state that inventing a concrete MUST from training-data is forbidden"
    )

    # Three legitimate moves must be present (a, b, c enumeration in Phase 5)
    # Check that all three move patterns appear in Phase 5's "No invention" subsection
    phase5_start = text.find("## Phase 5")
    phase6_start = text.find("## Phase 5.5")
    assert phase5_start != -1, "Phase 5 heading must exist"
    assert phase6_start != -1, "Phase 5.5 heading must exist"
    phase5_section = text[phase5_start:phase6_start]
    phase5_lower = phase5_section.lower()

    has_move_a = (
        "should/may" in phase5_lower
        or "should" in phase5_lower and "qualitative" in phase5_lower
        or "preserve" in phase5_lower and "should" in phase5_lower
    )
    has_move_b = (
        "leave the axis unbound" in phase5_lower
        or "axis unbound" in phase5_lower
        or "no criterion" in phase5_lower
    )
    has_move_c = (
        "block" in phase5_lower and "candidate" in phase5_lower
        or "block with candidate" in phase5_lower
    )
    assert has_move_a, "fr-rf-013-ac1: Phase 5 must list move (a) — preserve as SHOULD/MAY"
    assert has_move_b, "fr-rf-013-ac1: Phase 5 must list move (b) — leave axis unbound"
    assert has_move_c, "fr-rf-013-ac1: Phase 5 must list move (c) — BLOCK with candidate resolutions"


def test_fr_rf_013_ac2_deferral_signal_true():
    """fr-rf-013-ac2: Phase 5 must mention deferral_signal=true, the four canonical phrases,
    reference DECISION_LOG_RULES.deferral_signal_canonical_phrases, and state that deferral
    does NOT authorize a concrete MUST.
    """
    text = _read_skill()

    # Must mention deferral_signal (the boolean flag name)
    assert "deferral_signal" in text, (
        "fr-rf-013-ac2: Phase 5 must mention deferral_signal (the flag from DECISION_LOG_RULES)"
    )

    # Must call out DECISION_LOG_RULES.deferral_signal_canonical_phrases as source of truth
    assert "DECISION_LOG_RULES" in text, (
        "fr-rf-013-ac2: Phase 5 must reference DECISION_LOG_RULES as source of truth for deferral phrases"
    )
    assert "deferral_signal_canonical_phrases" in text, (
        "fr-rf-013-ac2: Phase 5 must reference deferral_signal_canonical_phrases specifically"
    )

    # Must include the four canonical phrases (any location in skill is acceptable)
    lower = text.lower()
    assert "use defaults" in lower, (
        'fr-rf-013-ac2: Must include canonical phrase "use defaults"'
    )
    assert "covered." in text, (
        'fr-rf-013-ac2: Must include canonical phrase "covered."'
    )
    assert '"skip"' in text or "'skip'" in text or "\"skip\"" in text or "skip" in lower, (
        'fr-rf-013-ac2: Must include canonical phrase "skip"'
    )
    assert "you decide" in lower, (
        'fr-rf-013-ac2: Must include canonical phrase "you decide"'
    )

    # Phase 5 section must state deferral does NOT authorize a concrete MUST
    phase5_start = text.find("## Phase 5")
    phase55_start = text.find("## Phase 5.5")
    assert phase5_start != -1
    phase5_section = text[phase5_start:phase55_start]
    phase5_lower = phase5_section.lower()

    deferral_no_concrete_must = (
        "deferral" in phase5_lower and "does not authorize" in phase5_lower
        or "deferral" in phase5_lower and "not authorize" in phase5_lower
        or "deferral" in phase5_lower and "unbound" in phase5_lower
    )
    assert deferral_no_concrete_must, (
        "fr-rf-013-ac2: Phase 5 must state that deferral does NOT authorize a concrete MUST"
    )


def test_fr_rf_013_ac3_every_concrete_must_sourced():
    """fr-rf-013-ac3: Phase 5 must direct that for every concrete MUST the refiner
    must cite a non-deferral source; it must also mention mechanicalAuthorizationCheck
    to signal that this rule is enforced mechanically at Phase 6.
    """
    text = _read_skill()

    # Must mention mechanicalAuthorizationCheck (Phase 6 enforcement link)
    assert "mechanicalAuthorizationCheck" in text, (
        "fr-rf-013-ac3: SKILL.md must mention mechanicalAuthorizationCheck so the LLM "
        "understands the prompt is enforced mechanically downstream"
    )

    # Phase 5 section must contain the "for every concrete MUST → cite non-deferral source" rule
    phase5_start = text.find("## Phase 5")
    phase55_start = text.find("## Phase 5.5")
    assert phase5_start != -1
    phase5_section = text[phase5_start:phase55_start]
    phase5_lower = phase5_section.lower()

    has_source_rule = (
        "non-deferral source" in phase5_lower
        or ("non-deferral" in phase5_lower and "concrete must" in phase5_lower)
        or ("concrete must" in phase5_lower and "source" in phase5_lower and "deferral" in phase5_lower)
    )
    assert has_source_rule, (
        "fr-rf-013-ac3: Phase 5 must contain the rule: every concrete MUST must trace to "
        "a non-deferral source (design phrase or non-deferral Q&A row)"
    )


# ---------------------------------------------------------------------------
# fr-rf-015 — _pending-conflict.md Write-on-Block Contract
# ---------------------------------------------------------------------------


def test_fr_rf_015_ac1_r3_block_paths_invoke_write_conflict_marker():
    """fr-rf-015-ac1: On axis-1, axis-2, or axis-3 block, SKILL.md MUST direct
    refiner to call writeConflictMarker before exiting non-zero.
    """
    text = _read_skill()

    # Must mention writeConflictMarker (the writer function name)
    assert "writeConflictMarker" in text, (
        "fr-rf-015-ac1: SKILL.md must direct refiner to call writeConflictMarker on R3 axis block"
    )

    # Phase 4 (axis 1/2 block) must invoke the writer
    phase4_start = text.find("## Phase 4")
    phase5_start = text.find("## Phase 5 —")
    assert phase4_start != -1, "Phase 4 heading must exist"
    assert phase5_start != -1, "Phase 5 heading must exist"
    phase4_section = text[phase4_start:phase5_start]
    assert "writeConflictMarker" in phase4_section, (
        "fr-rf-015-ac1: Phase 4 BLOCK path must invoke writeConflictMarker (axis 1/2)"
    )

    # Phase 5.5 or Phase 6 must invoke the writer for axis-3 blocks
    phase55_start = text.find("## Phase 5.5")
    phase6_start = text.find("## Phase 6")
    assert phase55_start != -1, "Phase 5.5 heading must exist"
    assert phase6_start != -1, "Phase 6 heading must exist"
    post_draft_section = text[phase55_start:]
    assert "writeConflictMarker" in post_draft_section, (
        "fr-rf-015-ac1: Phase 5.5 or Phase 6 axis-3 BLOCK path must invoke writeConflictMarker"
    )


def test_fr_rf_015_ac1_four_required_fields_in_skill():
    """fr-rf-015-ac1: SKILL.md must show the four required fields from fr-cc-if-007
    when describing the writeConflictMarker call: axis_fired, conflict_description,
    candidate_resolutions, user_action_prompt.
    """
    text = _read_skill()

    assert "axis_fired" in text, (
        "fr-rf-015-ac1: SKILL.md must show axis_fired field in writeConflictMarker call"
    )
    assert "conflict_description" in text, (
        "fr-rf-015-ac1: SKILL.md must show conflict_description field"
    )
    assert "candidate_resolutions" in text, (
        "fr-rf-015-ac1: SKILL.md must show candidate_resolutions field"
    )
    assert "user_action_prompt" in text, (
        "fr-rf-015-ac1: SKILL.md must show user_action_prompt field"
    )


def test_fr_rf_015_ac1_candidate_resolution_range():
    """fr-rf-015-ac1: SKILL.md must direct refiner to provide AT LEAST 1 and AT MOST 3
    candidate resolutions (per fr-sd-012-ac1, fr-cc-if-007-ac2).
    """
    text = _read_skill()
    lower = text.lower()

    has_range = (
        "at least 1" in lower
        or "1–3" in text  # Unicode en-dash range
        or "1–3" in text       # ASCII dash variant
        or ("at least" in lower and "candidate" in lower)
        or ("at most 3" in lower and "candidate" in lower)
    )
    assert has_range, (
        "fr-rf-015-ac1: SKILL.md must state the 1–3 candidate resolution range"
    )


def test_fr_rf_015_ac2_no_write_for_non_r3_blocks():
    """fr-rf-015-ac2: SKILL.md must explicitly state that _pending-conflict.md
    MUST NOT be written for non-R3-axis blocks: DAG gate, design-doc validation,
    identity-header validation errors.
    """
    text = _read_skill()
    lower = text.lower()

    # Must mention the no-write condition explicitly
    has_no_write_directive = (
        "must not write" in lower
        or "do not write" in lower
        or "do not write `_pending-conflict" in lower
        or "per fr-rf-015-ac2" in lower
    )
    assert has_no_write_directive, (
        "fr-rf-015-ac2: SKILL.md must explicitly state when NOT to write _pending-conflict.md"
    )

    # Must list at least one of the non-R3 block categories
    has_non_r3_category = (
        "dag completion gate" in lower
        or "dag gate" in lower
        or "design-doc validation" in lower
        or "identity-header validation" in lower
        or "fr-rf-012" in text
        or "fr-rf-009" in text
        or "fr-rf-010" in text
    )
    assert has_non_r3_category, (
        "fr-rf-015-ac2: SKILL.md must name at least one non-R3 block category"
    )


def test_fr_rf_015_lifecycle_reminder():
    """fr-rf-015: SKILL.md must note that _pending-conflict.md is ephemeral —
    brainstorming Phase 0 reads and deletes it; refiner does not need to clean up.
    """
    text = _read_skill()
    lower = text.lower()

    has_ephemeral = (
        "ephemeral" in lower
        or ("brainstorming" in lower and "deletes" in lower)
        or ("brainstorming" in lower and "delete" in lower and "pending" in lower)
    )
    assert has_ephemeral, (
        "fr-rf-015: SKILL.md must note that _pending-conflict.md is ephemeral "
        "and deleted by brainstorming"
    )


def test_fr_rf_015_pending_conflict_rules_cited():
    """fr-rf-015: SKILL.md must reference PENDING_CONFLICT_RULES as the schema
    source of truth for the conflict file fields.
    """
    text = _read_skill()

    assert "PENDING_CONFLICT_RULES" in text, (
        "fr-rf-015: SKILL.md must reference PENDING_CONFLICT_RULES as schema source of truth"
    )
