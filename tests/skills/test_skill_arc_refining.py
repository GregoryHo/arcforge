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


# ---------------------------------------------------------------------------
# fr-rf-010 — Output Validation: Two-Pass Write with Mechanical Auth Check
# ---------------------------------------------------------------------------


def test_fr_rf_010_ac1_identity_header_validation_in_phase6():
    """fr-rf-010-ac1: Phase 6 MUST direct refiner to validate the identity header
    per fr-cc-if-002: spec_id, spec_version, status, source, scope all present
    and well-formed. Missing fields are ERROR. Refiner uses validateSpecHeader.
    """
    text = _read_skill()

    # Phase 6 section must be present
    phase6_start = text.find("## Phase 6")
    assert phase6_start != -1, "Phase 6 heading must exist"

    phase6_section = text[phase6_start:]
    # Find the next top-level section after Phase 6 to scope the check
    next_section = phase6_section.find("\n## ", 1)
    if next_section != -1:
        phase6_section = phase6_section[:next_section]

    # validateSpecHeader must be called in Phase 6
    assert "validateSpecHeader" in phase6_section, (
        "fr-rf-010-ac1: Phase 6 must invoke validateSpecHeader for identity-header validation"
    )

    # Must reference fr-cc-if-002 or list the required fields explicitly
    has_contract_ref = (
        "fr-cc-if-002" in phase6_section
        or (
            "spec_id" in phase6_section
            and "spec_version" in phase6_section
            and "status" in phase6_section
            and "scope" in phase6_section
        )
        or (
            "fr-cc-if-002" in text  # acceptable anywhere in skill
            and "validateSpecHeader" in phase6_section
        )
    )
    assert has_contract_ref, (
        "fr-rf-010-ac1: Phase 6 must reference fr-cc-if-002 or enumerate the required "
        "identity-header fields (spec_id, spec_version, status, source, scope)"
    )

    # Missing fields must be ERROR
    phase6_lower = phase6_section.lower()
    has_error_on_missing = (
        "error" in phase6_lower
        and "validatespecheader" in phase6_lower
    )
    assert has_error_on_missing, (
        "fr-rf-010-ac1: Phase 6 must state that missing identity-header fields are ERROR"
    )


def test_fr_rf_010_ac2_every_requirement_has_ac_with_trace():
    """fr-rf-010-ac2: SKILL.md MUST direct refiner to verify every <requirement>
    in the in-memory draft has at least one <acceptance_criteria> block containing
    at least one <criterion> with a <trace> element. Requirements without testable
    AC are ERROR.
    """
    text = _read_skill()

    # Must state the structural check rule (in Phase 6 or quality checklist)
    has_ac_trace_rule = (
        "every requirement" in text.lower()
        and "acceptance_criteria" in text or "<trace>" in text
    )
    # More precise: must say every requirement needs AC with trace
    has_structural_rule = (
        (
            "every requirement has at least one acceptance" in text.lower()
            or "every <requirement>" in text
            or "every requirement" in text.lower() and "trace" in text.lower()
        )
    )
    assert has_structural_rule, (
        "fr-rf-010-ac2: SKILL.md must direct that every requirement has at least one "
        "acceptance_criteria with a <trace> element"
    )

    # Requirements without testable AC must be flagged as ERROR
    # This must be somewhere in the skill prose (Phase 6 or checklist or Iron Law)
    has_error_directive = (
        "requirements without" in text.lower()
        or "requirement without" in text.lower()
        or (
            "every requirement" in text.lower()
            and "error" in text.lower()
            and "trace" in text.lower()
        )
    )
    assert has_error_directive, (
        "fr-rf-010-ac2: SKILL.md must state that requirements without testable AC are ERROR"
    )


def test_fr_rf_010_ac3_no_authoritative_files_with_ephemeral_exception():
    """fr-rf-010-ac3 (audit-patched): SKILL.md MUST use language that makes
    authoritative-vs-ephemeral distinction explicit:
    - On validation ERROR: no authoritative files (spec.xml, details/)
    - The _pending-conflict.md ephemeral exception applies ONLY for R3 axis blocks
    - For non-R3 errors (identity-header, schema): nothing is written at all
    """
    text = _read_skill()
    lower = text.lower()

    # Must use "authoritative" in the context of no-write
    has_authoritative_no_write = (
        "no authoritative" in lower
        or "authoritative state" in lower
        or "authoritative files" in lower
    )
    assert has_authoritative_no_write, (
        "fr-rf-010-ac3: SKILL.md must use 'authoritative' language for the no-write rule "
        "(distinguishing authoritative files from the ephemeral _pending-conflict.md)"
    )

    # Must state the ephemeral exception for R3 axis blocks only
    has_ephemeral_exception = (
        "ephemeral" in lower
        and "_pending-conflict.md" in text
    )
    assert has_ephemeral_exception, (
        "fr-rf-010-ac3: SKILL.md must note the ephemeral _pending-conflict.md exception "
        "applies only for R3 axis blocks"
    )

    # Must state that non-R3 errors (identity-header) write nothing at all
    has_non_r3_nothing_written = (
        "per fr-rf-015-ac2" in text
        or (
            "non-r3" in lower
            and ("no file" in lower or "nothing" in lower or "terminal" in lower)
        )
        or (
            "identity-header" in lower
            and ("no file" in lower or "terminal" in lower or "do not write" in lower)
        )
    )
    assert has_non_r3_nothing_written, (
        "fr-rf-010-ac3: SKILL.md must state that non-R3 errors (identity-header, schema) "
        "result in nothing written at all (terminal output only)"
    )


def test_fr_rf_010_ac4_atomic_write_in_phase6():
    """fr-rf-010-ac4: SKILL.md MUST direct refiner to write all files atomically
    — spec.xml and all details/*.xml in a single operation. Partial writes MUST
    NOT occur. The build-validate-write order must be described.
    """
    text = _read_skill()

    # Phase 6 must describe atomic write
    phase6_start = text.find("## Phase 6")
    assert phase6_start != -1, "Phase 6 heading must exist"
    phase6_section = text[phase6_start:]
    next_section = phase6_section.find("\n## ", 1)
    if next_section != -1:
        phase6_section = phase6_section[:next_section]
    phase6_lower = phase6_section.lower()

    has_atomic = "atomic" in phase6_lower
    assert has_atomic, (
        "fr-rf-010-ac4: Phase 6 must state that files are written atomically"
    )

    has_no_partial = (
        "partial write" in phase6_lower
        or "partial writes" in phase6_lower
        or "must not occur" in phase6_lower
    )
    assert has_no_partial, (
        "fr-rf-010-ac4: Phase 6 must state that partial writes MUST NOT occur"
    )

    # Build-validate-write order (two-pass pattern) must be described somewhere in skill
    has_build_validate_write = (
        "build in memory" in text.lower()
        or "two-pass" in text.lower()
        or "validate" in text.lower() and "then write" in text.lower()
    )
    assert has_build_validate_write, (
        "fr-rf-010-ac4: SKILL.md must describe the build-validate-write order "
        "(two-pass write pattern)"
    )


def test_fr_rf_010_ac5_mechanical_auth_check_trace_types():
    """fr-rf-010-ac5: Phase 6 MUST invoke mechanicalAuthorizationCheck and must
    explicitly distinguish two trace types:
    (i) design line-range traces — cited content must appear at those lines
    (ii) q_id traces — cited content must appear in that row's user_answer_verbatim
    On axis-3 mechanical ERROR, _pending-conflict.md IS written via writeConflictMarker.
    """
    text = _read_skill()

    # Phase 6 must invoke mechanicalAuthorizationCheck
    phase6_start = text.find("## Phase 6")
    assert phase6_start != -1, "Phase 6 heading must exist"
    phase6_section = text[phase6_start:]
    next_section = phase6_section.find("\n## ", 1)
    if next_section != -1:
        phase6_section = phase6_section[:next_section]

    assert "mechanicalAuthorizationCheck" in phase6_section, (
        "fr-rf-010-ac5: Phase 6 must invoke mechanicalAuthorizationCheck"
    )

    # Must distinguish design line-range traces
    has_line_range = (
        "line range" in phase6_section.lower()
        or "line ranges" in phase6_section.lower()
        or "design line" in phase6_section.lower()
        or "design.md" in phase6_section
    )
    assert has_line_range, (
        "fr-rf-010-ac5: Phase 6 must describe design line-range trace verification"
    )

    # Must distinguish q_id traces / decision-log
    has_qid = (
        "q_id" in phase6_section
        or "decision-log" in phase6_section
        or "user_answer_verbatim" in phase6_section
    )
    assert has_qid, (
        "fr-rf-010-ac5: Phase 6 must describe q_id / decision-log trace verification"
    )

    # On axis-3 mechanical ERROR: must write _pending-conflict.md
    has_conflict_on_error = (
        "writeConflictMarker" in phase6_section
        and "_pending-conflict.md" in phase6_section or "_pending-conflict" in phase6_section
    )
    assert has_conflict_on_error, (
        "fr-rf-010-ac5: Phase 6 must state that on axis-3 mechanical ERROR, "
        "_pending-conflict.md is written via writeConflictMarker"
    )


# ---------------------------------------------------------------------------
# fr-rf-014 — Phase 5.5 Self-Contradiction Sub-Pass + Axis-3 LLM Judgment
# ---------------------------------------------------------------------------


def _get_phase55_section(text: str) -> str:
    """Extract Phase 5.5 section text (between Phase 5.5 heading and Phase 6 heading)."""
    phase55_start = text.find("## Phase 5.5")
    phase6_start = text.find("## Phase 6")
    assert phase55_start != -1, "Phase 5.5 heading must exist"
    assert phase6_start != -1, "Phase 6 heading must exist"
    return text[phase55_start:phase6_start]


def _get_phase55a_section(text: str) -> str:
    """Extract Phase 5.5a sub-section text."""
    phase55 = _get_phase55_section(text)
    a_start = phase55.find("### 5.5a")
    b_start = phase55.find("### 5.5b")
    assert a_start != -1, "Phase 5.5a heading must exist"
    assert b_start != -1, "Phase 5.5b heading must exist"
    return phase55[a_start:b_start]


def _get_phase55b_section(text: str) -> str:
    """Extract Phase 5.5b sub-section text."""
    phase55 = _get_phase55_section(text)
    b_start = phase55.find("### 5.5b")
    assert b_start != -1, "Phase 5.5b heading must exist"
    return phase55[b_start:]


def test_fr_rf_014_ac1_scope_mismatch_detection():
    """fr-rf-014-ac1: Phase 5.5a MUST direct refiner to detect scope mismatches
    (description covers both success and failure paths but ACs only test success)
    and BLOCK with the exact remediation hint.
    """
    text = _read_skill()
    section_a = _get_phase55a_section(text)
    lower_a = section_a.lower()

    # Must mention scope mismatch detection
    has_scope_mismatch = (
        "scope mismatch" in lower_a
        or ("success" in lower_a and "failure" in lower_a and "path" in lower_a)
    )
    assert has_scope_mismatch, (
        "fr-rf-014-ac1: Phase 5.5a must describe scope mismatch detection "
        "(description covers success+failure but ACs only test success)"
    )

    # Must include exact remediation hint for scope mismatch (ac1 spec text)
    has_ac1_hint = (
        "widen acs to cover failure path" in lower_a
        or "widen ACs to cover failure path" in section_a
        or ("widen" in lower_a and "failure path" in lower_a)
    )
    assert has_ac1_hint, (
        "fr-rf-014-ac1: Phase 5.5a must include the remediation hint "
        "'widen ACs to cover failure path, or narrow description to match ACs'"
    )

    has_narrow_hint = (
        "narrow description to match acs" in lower_a
        or "narrow description" in lower_a
    )
    assert has_narrow_hint, (
        "fr-rf-014-ac1: Phase 5.5a must include the remediation hint "
        "'narrow description to match ACs'"
    )


def test_fr_rf_014_ac2_rfc2119_verb_mismatch_detection():
    """fr-rf-014-ac2: Phase 5.5a MUST direct refiner to detect RFC-2119 verb mismatches
    (description uses MUST but sibling AC uses SHOULD for same axis) and BLOCK
    with the exact remediation hint.
    """
    text = _read_skill()
    section_a = _get_phase55a_section(text)
    lower_a = section_a.lower()

    # Must mention RFC-2119 verb mismatch
    has_verb_mismatch = (
        "rfc-2119" in lower_a
        or "rfc 2119" in lower_a
        or ("must" in lower_a and "should" in lower_a and "mismatch" in lower_a)
        or "verb mismatch" in lower_a
    )
    assert has_verb_mismatch, (
        "fr-rf-014-ac2: Phase 5.5a must describe RFC-2119 verb mismatch detection "
        "(description uses MUST but AC uses SHOULD on same axis, or vice versa)"
    )

    # Must include exact remediation hint for verb mismatch (ac2 spec text)
    has_ac2_hint = (
        "align verbs across description and acs" in lower_a
        or "align verbs" in lower_a
    )
    assert has_ac2_hint, (
        "fr-rf-014-ac2: Phase 5.5a must include the remediation hint "
        "'align verbs across description and ACs for the same axis'"
    )

    has_same_axis = (
        "same axis" in lower_a
        or "for the same axis" in lower_a
    )
    assert has_same_axis, (
        "fr-rf-014-ac2: Phase 5.5a remediation hint must reference 'the same axis'"
    )


def test_fr_rf_014_ac3_axis3_llm_coverage_in_phase55b():
    """fr-rf-014-ac3: Phase 5.5b MUST direct refiner to verify axis-3 LLM coverage:
    for every criterion in the in-memory draft, a citable source (design phrase or
    non-deferral Q&A row) must exist. Must contrast with mechanical layer at Phase 6.
    """
    text = _read_skill()
    section_b = _get_phase55b_section(text)
    lower_b = section_b.lower()

    # Must describe citable source requirement
    has_citable_source = (
        "citable source" in lower_b
        or ("design phrase" in lower_b and "q&a" in lower_b)
        or ("design phrase" in lower_b and "non-deferral" in lower_b)
    )
    assert has_citable_source, (
        "fr-rf-014-ac3: Phase 5.5b must state that every criterion must have a citable source "
        "(design phrase or non-deferral Q&A row)"
    )

    # Must contrast with mechanical layer at Phase 6
    has_mechanical_contrast = (
        "mechanical" in lower_b
        or "phase 6" in lower_b
        or "mechanicalauthorizationcheck" in lower_b
    )
    assert has_mechanical_contrast, (
        "fr-rf-014-ac3: Phase 5.5b must contrast LLM judgment layer with the mechanical "
        "layer at Phase 6 (per fr-rf-010-ac5)"
    )


def test_fr_rf_014_ac4_r3_severity_no_warn():
    """fr-rf-014-ac4: Phase 5.5 MUST state that ANY finding (5.5a or 5.5b) is R3
    enforcement severity — exit non-zero, no spec.xml, no details/, no narrative report.
    Findings MUST NOT be downgraded to WARNING. Must cite Pattern 3 rationale.
    """
    text = _read_skill()
    phase55 = _get_phase55_section(text)
    lower55 = phase55.lower()

    # Must state R3 severity
    has_r3_severity = (
        "r3" in lower55
        or "r3 enforcement" in lower55
        or "r3 severity" in lower55
    )
    assert has_r3_severity, (
        "fr-rf-014-ac4: Phase 5.5 must state findings are R3 enforcement severity"
    )

    # Must state no downgrade to WARN
    has_no_warn = (
        "must not be downgraded to warning" in lower55
        or "not be downgraded to warn" in lower55
        or "no warn" in lower55
        or "must not downgrade" in lower55
        or ("warn" in lower55 and "not" in lower55 and "downgrade" in lower55)
        or "phase 5.5 findings must not be downgraded" in lower55
    )
    assert has_no_warn, (
        "fr-rf-014-ac4: Phase 5.5 must explicitly state findings MUST NOT be downgraded to WARNING"
    )

    # Must cite Pattern 3 rationale
    has_pattern3 = (
        "pattern 3" in lower55
        or "pattern3" in lower55
    )
    assert has_pattern3, (
        "fr-rf-014-ac4: Phase 5.5 must cite Pattern 3 rationale for why WARN is forbidden "
        "(a WARN would let the spec ship with internal contradictions)"
    )


def test_fr_rf_014_ac5_phase55a_writes_conflict_marker():
    """fr-rf-014-ac5 (audit-patched): Phase 5.5a MUST invoke writeConflictMarker
    for self-contradiction findings — NOT terminal-only. The prior fr-rf-015 commit
    incorrectly said 'Do NOT write _pending-conflict.md' for 5.5a blocks; the
    audit patch reverses this. Both 5.5a and 5.5b write the conflict file.
    """
    text = _read_skill()
    section_a = _get_phase55a_section(text)

    # Phase 5.5a MUST invoke writeConflictMarker
    assert "writeConflictMarker" in section_a, (
        "fr-rf-014-ac5: Phase 5.5a must invoke writeConflictMarker "
        "(audit-patched: self-contradiction is NOT exempt from the handoff)"
    )

    # Phase 5.5a MUST NOT say "do not write _pending-conflict.md" (the old wrong instruction)
    lower_a = section_a.lower()
    wrong_instruction = (
        "do not write `_pending-conflict" in lower_a
        or "do not write _pending-conflict" in lower_a
        or "terminal only" in lower_a and "no conflict" in lower_a
    )
    assert not wrong_instruction, (
        "fr-rf-014-ac5: Phase 5.5a must NOT say 'do not write _pending-conflict.md' — "
        "audit patch requires self-contradiction to also write the handoff file"
    )

    # The conflict_description must be seeded with requirement ID + remediation hint
    has_seeded_description = (
        "conflict_description" in section_a
        and (
            "requirement id" in lower_a
            or "remediation" in lower_a
        )
    )
    assert has_seeded_description, (
        "fr-rf-014-ac5: Phase 5.5a must seed conflict_description with the requirement ID "
        "and the relevant remediation hint (widen/narrow for ac1, align verbs for ac2)"
    )


def test_fr_rf_014_ac5_phase55b_writes_conflict_marker():
    """fr-rf-014-ac5: Phase 5.5b MUST also invoke writeConflictMarker for axis-3
    LLM findings (already covered by fr-rf-015 commit; this test guards regression).
    """
    text = _read_skill()
    section_b = _get_phase55b_section(text)

    # Phase 5.5b MUST invoke writeConflictMarker
    assert "writeConflictMarker" in section_b, (
        "fr-rf-014-ac5: Phase 5.5b must invoke writeConflictMarker for axis-3 LLM findings"
    )

    # axis_fired must be '3' for 5.5b
    has_axis3 = (
        "axis_fired" in section_b
        and "'3'" in section_b
    )
    assert has_axis3, (
        "fr-rf-014-ac5: Phase 5.5b writeConflictMarker call must set axis_fired to '3'"
    )


# ---------------------------------------------------------------------------
# fr-rf-001 — Three-Axis R3 Contradiction Check (orchestrator integration)
# ---------------------------------------------------------------------------


def _get_phase4_section(text: str) -> str:
    """Extract Phase 4 section text (between Phase 4 heading and Phase 5 heading)."""
    phase4_start = text.find("## Phase 4")
    phase5_start = text.find("## Phase 5 —")
    assert phase4_start != -1, "Phase 4 heading must exist"
    assert phase5_start != -1, "Phase 5 heading must exist"
    return text[phase4_start:phase5_start]


def test_fr_rf_001_ac1_axis1_requires_req_ids_in_terminal_output():
    """fr-rf-001-ac1: Phase 4 axis-1 block MUST print specific requirement IDs to
    terminal and point the user to _pending-conflict.md. The sessions-expire example
    (REQ-A / REQ-B or equivalent) must appear in Phase 4 with both REQ identifiers.
    """
    text = _read_skill()
    phase4 = _get_phase4_section(text)
    lower4 = phase4.lower()

    # Must mention specific requirement IDs in the axis-1 example
    # Accept REQ-A/REQ-B labels or the literal IDs (e.g., "REQ-A", "REQ-B")
    has_req_ids = (
        "req-a" in lower4
        or "req-b" in lower4
        or "requirement id" in lower4
        or "requirement ids" in lower4
    )
    assert has_req_ids, (
        "fr-rf-001-ac1: Phase 4 axis-1 must reference specific requirement IDs (e.g., REQ-A, REQ-B) "
        "in the contradiction example — terminal output must include both IDs"
    )

    # Must mention sessions-expire example (or paraphrase)
    has_sessions_example = (
        "sessions expire" in lower4
        or "sessions never expire" in lower4
        or "15 minute" in lower4
    )
    assert has_sessions_example, (
        "fr-rf-001-ac1: Phase 4 axis-1 must include the sessions-expire contradiction example "
        "(REQ-A 'sessions expire after 15 minutes' vs REQ-B 'sessions never expire')"
    )

    # Must include pointer to _pending-conflict.md on block
    has_conflict_pointer = "_pending-conflict.md" in phase4
    assert has_conflict_pointer, (
        "fr-rf-001-ac1: Phase 4 must point the user to _pending-conflict.md on axis-1 block"
    )

    # Must exit non-zero (explicitly stated in the BLOCK instructions)
    has_exit_nonzero = "exit non-zero" in lower4 or "process.exit(1)" in phase4
    assert has_exit_nonzero, (
        "fr-rf-001-ac1: Phase 4 BLOCK must document non-zero exit"
    )


def test_fr_rf_001_ac1_axis1_detects_spec_conflicts_and_broken_deps():
    """fr-rf-001-ac1: Phase 4 axis-1 MUST direct refiner to detect:
    (a) contradictions between new design requirements and existing spec requirements
    (b) broken dependencies on removed requirements
    """
    text = _read_skill()
    phase4 = _get_phase4_section(text)
    lower4 = phase4.lower()

    # Must detect conflict between new design requirements and existing spec requirements
    has_spec_conflict = (
        "existing spec" in lower4
        or ("new design" in lower4 and "spec" in lower4)
        or ("prior spec" in lower4 and "contradiction" in lower4)
        or ("prior spec" in lower4 and "conflict" in lower4)
    )
    assert has_spec_conflict, (
        "fr-rf-001-ac1: Phase 4 axis-1 must direct refiner to detect contradictions between "
        "new design requirements and existing spec requirements (when a prior spec exists)"
    )

    # Must detect broken dependencies on removed requirements
    has_broken_deps = (
        "broken dependenc" in lower4
        or "removed requirements" in lower4
        or ("depend" in lower4 and "removed" in lower4)
    )
    assert has_broken_deps, (
        "fr-rf-001-ac1: Phase 4 axis-1 must direct refiner to detect broken dependencies "
        "on removed requirements"
    )


def test_fr_rf_001_ac2_axis2_silent_pick_forbidden():
    """fr-rf-001-ac2: Phase 4 axis-2 MUST state that silently picking either side
    is forbidden — even if the Q&A answer is more recent than the design.
    """
    text = _read_skill()
    phase4 = _get_phase4_section(text)
    lower4 = phase4.lower()

    # Must forbid silent pick
    has_no_silent_pick = (
        "silently pick" in lower4
        or "silent pick" in lower4
        or "silently picking" in lower4
        or "no authorization to pick" in lower4
        or "does not silently pick" in lower4
    )
    assert has_no_silent_pick, (
        "fr-rf-001-ac2: Phase 4 axis-2 must explicitly state that silently picking "
        "either side is forbidden"
    )

    # Must state forbidden even if Q&A more recent
    has_recency_caveat = (
        "more recent" in lower4
        or "q&a is more recent" in lower4
        or "q&a answer is more recent" in lower4
        or "even if" in lower4 and "recent" in lower4
    )
    assert has_recency_caveat, (
        "fr-rf-001-ac2: Phase 4 axis-2 must state that silent pick is forbidden "
        "even if the Q&A answer is more recent than the design"
    )


def test_fr_rf_001_ac2_axis2_cites_both_design_line_and_qid():
    """fr-rf-001-ac2: Phase 4 axis-2 terminal output MUST cite both the design line range
    AND the Q&A q_id when blocking.
    """
    text = _read_skill()
    phase4 = _get_phase4_section(text)
    lower4 = phase4.lower()

    # Must cite design line range
    has_design_line = (
        "design line" in lower4
        or "line range" in lower4
        or "line ranges" in lower4
    )
    assert has_design_line, (
        "fr-rf-001-ac2: Phase 4 axis-2 block must cite the specific design line ranges"
    )

    # Must cite Q&A q_id
    has_qid = "q_id" in phase4 or "q_ids" in phase4
    assert has_qid, (
        "fr-rf-001-ac2: Phase 4 axis-2 block must cite the Q&A row q_id"
    )


def test_fr_rf_001_ac2_candidate_resolutions_all_three_sides():
    """fr-rf-001-ac2: The candidate_resolutions for axis-2 BLOCK MUST include at least
    one option per side: 'keep design wording', 'accept Q&A answer', and a reconciliation
    option ('make the axis configurable so both stances coexist').
    """
    text = _read_skill()
    phase4 = _get_phase4_section(text)
    lower4 = phase4.lower()

    # Must include 'keep design wording'
    has_keep_design = "keep design wording" in lower4
    assert has_keep_design, (
        "fr-rf-001-ac2: Phase 4 axis-2 candidate_resolutions must include 'keep design wording'"
    )

    # Must include 'accept Q&A answer'
    has_accept_qa = "accept q&a answer" in lower4
    assert has_accept_qa, (
        "fr-rf-001-ac2: Phase 4 axis-2 candidate_resolutions must include 'accept Q&A answer'"
    )

    # Must include reconciliation option ('make the axis configurable so both stances coexist')
    has_reconcile = (
        "make the axis configurable" in lower4
        or "configurable so both stances coexist" in lower4
        or "both stances coexist" in lower4
    )
    assert has_reconcile, (
        "fr-rf-001-ac2: Phase 4 axis-2 candidate_resolutions must include a reconciliation option "
        "('make the axis configurable so both stances coexist')"
    )


def test_fr_rf_001_ac3_block_writes_no_authoritative_artifacts():
    """fr-rf-001-ac3: SKILL.md MUST be unambiguous: when blocked on ANY axis (1, 2, or 3),
    refiner MUST NOT write spec.xml, details/*.xml, or any narrative report.
    Only _pending-conflict.md is permitted (for R3 axis blocks).
    """
    text = _read_skill()
    lower = text.lower()

    # Must state no spec.xml on block
    has_no_spec_xml = (
        "no spec.xml" in lower
        or "no `spec.xml`" in lower
        or "not write spec.xml" in lower
        or "must not write" in lower and "spec.xml" in lower
    )
    assert has_no_spec_xml, (
        "fr-rf-001-ac3: SKILL.md must explicitly state that spec.xml is NOT written on block"
    )

    # Must state no details/ on block
    has_no_details = (
        "no details/" in lower
        or "no `details/`" in lower
        or "no details" in lower
        or "not write details" in lower
    )
    assert has_no_details, (
        "fr-rf-001-ac3: SKILL.md must explicitly state that details/*.xml is NOT written on block"
    )

    # Must state no narrative report (no refiner-report.md)
    has_no_report = (
        "no refiner-report" in lower
        or "no narrative report" in lower
        or "no report" in lower
    )
    assert has_no_report, (
        "fr-rf-001-ac3: SKILL.md must explicitly state that no narrative report is written on block"
    )

    # Must state _pending-conflict.md is the only permitted artifact
    has_only_pending = (
        "_pending-conflict.md" in text
        and (
            "only file" in lower
            or "only persistent artifact" in lower
            or "only permitted" in lower
            or "only artifact" in lower
        )
    )
    assert has_only_pending, (
        "fr-rf-001-ac3: SKILL.md must state that _pending-conflict.md is the only permitted "
        "artifact on R3 axis-1/2/3 block"
    )


def test_fr_rf_001_ac4_terminal_output_format():
    """fr-rf-001-ac4: SKILL.md MUST direct refiner that terminal output on block lists
    each detected issue with:
    (i) which axis fired (1/2/3) and a one-line description
    (ii) the specific design line ranges and Q&A row q_ids involved
    AND points the user to _pending-conflict.md.
    """
    text = _read_skill()
    phase4 = _get_phase4_section(text)
    lower4 = phase4.lower()

    # Must list axis number in terminal output
    has_axis_in_output = (
        "which axis fired" in lower4
        or "axis fired" in lower4
        or "axis (1, 2, or 3)" in lower4
        or "axis 1" in lower4 and "axis 2" in lower4 and "axis 3" in lower4
    )
    assert has_axis_in_output, (
        "fr-rf-001-ac4: Phase 4 terminal output must state which axis fired (1, 2, or 3)"
    )

    # Must include one-line description per issue
    has_oneline_desc = (
        "one-line description" in lower4
        or "one line description" in lower4
        or "description of the conflict" in lower4
    )
    assert has_oneline_desc, (
        "fr-rf-001-ac4: Phase 4 terminal output must include a one-line description of the conflict"
    )

    # Must point user to _pending-conflict.md
    has_pending_pointer = "_pending-conflict.md" in phase4
    assert has_pending_pointer, (
        "fr-rf-001-ac4: Phase 4 terminal output must point user to _pending-conflict.md"
    )


def test_fr_rf_001_phase_to_axis_taxonomy_explicit():
    """fr-rf-001 description: The three-axis taxonomy MUST be explicit in the skill:
    Phase 4 = axes 1 and 2 (pre-draft LLM check);
    Phase 5.5 = axis 3 LLM judgment;
    Phase 6 = axis 3 mechanical enforcement.
    """
    text = _read_skill()
    lower = text.lower()

    # Phase 4 covers axes 1 and 2 (must be explicit somewhere — description or Phase 4 header)
    has_phase4_axes12 = (
        "phase 4" in lower and "axis 1" in lower and "axis 2" in lower
        and (
            "phase 4" in lower
            and ("axes 1 and 2" in lower or "axis 1 and 2" in lower or "axis-1" in lower and "axis-2" in lower)
        )
    )
    # More targeted: check Phase 4 section specifically
    phase4 = _get_phase4_section(text)
    lower4 = phase4.lower()
    # Phase 4 section should cover both axis 1 and axis 2 (already present)
    has_phase4_axis1 = "axis 1" in lower4
    has_phase4_axis2 = "axis 2" in lower4
    assert has_phase4_axis1 and has_phase4_axis2, (
        "fr-rf-001: Phase 4 must explicitly name Axis 1 and Axis 2 "
        "(the pre-draft LLM contradiction check)"
    )

    # Phase 5.5 covers axis 3 LLM judgment
    phase55_start = text.find("## Phase 5.5")
    phase6_start = text.find("## Phase 6")
    assert phase55_start != -1
    phase55 = text[phase55_start:phase6_start]
    lower55 = phase55.lower()
    has_phase55_axis3 = (
        "axis 3" in lower55
        or "axis-3" in lower55
        or "llm judgment" in lower55
        or "llm-judgment" in lower55
    )
    assert has_phase55_axis3, (
        "fr-rf-001: Phase 5.5 must cover axis-3 LLM judgment"
    )

    # Phase 6 covers axis 3 mechanical enforcement
    phase6_section = text[phase6_start:]
    next_phase = phase6_section.find("\n## ", 1)
    if next_phase != -1:
        phase6_section = phase6_section[:next_phase]
    lower6 = phase6_section.lower()
    has_phase6_axis3_mechanical = (
        "mechanical" in lower6
        and ("axis" in lower6 or "axis 3" in lower6 or "mechanicalauthorizationcheck" in lower6)
    )
    assert has_phase6_axis3_mechanical, (
        "fr-rf-001: Phase 6 must cover axis-3 mechanical enforcement"
    )
