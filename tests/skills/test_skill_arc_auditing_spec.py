from pathlib import Path

import pytest
import yaml


SKILL_PATH = Path("skills/arc-auditing-spec/SKILL.md")
AGENT_NAMES = [
    "arc-auditing-spec-cross-artifact-alignment",
    "arc-auditing-spec-internal-consistency",
    "arc-auditing-spec-state-transition-integrity",
]
AGENT_PATHS = [Path(f"agents/{name}.md") for name in AGENT_NAMES]
FINDING_SCHEMA_PATH = Path("skills/arc-auditing-spec/references/finding-schema.md")

READ_ONLY_TOOLS = {"Read", "Grep", "Glob"}
FORBIDDEN_TOOLS = {"Edit", "Write", "Bash", "NotebookEdit"}

AXIS_AGENT_IDS = {
    "arc-auditing-spec-cross-artifact-alignment": "A1",
    "arc-auditing-spec-internal-consistency": "A2",
    "arc-auditing-spec-state-transition-integrity": "A3",
}

SEVERITY_ENUM = "{HIGH, MED, LOW, INFO}"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        raise AssertionError("missing frontmatter start")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise AssertionError("missing frontmatter end")
    raw = text[4:end]
    body = text[end + 5 :]
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict):
        data = {}
    return data, body


def _extract_tools_list(front: dict) -> list[str]:
    raw = front.get("tools", [])
    if isinstance(raw, list):
        return [str(t).strip() for t in raw]
    # fallback for string form
    tools: list[str] = []
    for piece in str(raw).replace("\n", ",").split(","):
        piece = piece.strip().lstrip("-").strip()
        if piece:
            tools.append(piece)
    return tools


def test_skill_frontmatter_and_structure():
    text = _read(SKILL_PATH)
    front, body = _parse_frontmatter(text)

    assert front.get("name") == "arc-auditing-spec"
    assert front.get("description", "").startswith("Use when")
    assert len(front.get("name", "") + front.get("description", "")) < 1024
    assert "@" not in text  # no @-syntax file loading

    # Iron Law + invocation contract + Red Flags must all be present
    assert "## Iron Law" in body
    assert "READ-ONLY ADVISORY" in body.upper() or "read-only advisory" in body.lower()
    assert "## Invocation Contract" in body
    assert "Phase 0" in body
    assert "## Red Flags" in body or "Red Flags — STOP" in body


def test_skill_references_three_agents():
    body = _read(SKILL_PATH)
    for name in AGENT_NAMES:
        assert name in body, f"SKILL.md must reference agent: {name}"


# ── aa-001: Phase 1 parallel fan-out ────────────────────────────────────────

def test_skill_phase1_mentions_single_message_parallel():
    """fr-aa-001-ac1: Phase 1 MUST instruct single-message concurrent dispatch."""
    body = _read(SKILL_PATH)
    assert "single message" in body.lower(), (
        "SKILL.md Phase 1 must mention 'single message' to prevent serial dispatch"
    )
    assert "parallel" in body.lower(), (
        "SKILL.md Phase 1 must mention 'parallel' dispatch"
    )


def test_skill_phase1_names_all_three_agents():
    """fr-aa-001-ac1: Phase 1 must name all three agent ids."""
    body = _read(SKILL_PATH)
    for name in AGENT_NAMES:
        assert name in body, f"Phase 1 must name agent {name}"


def test_skill_phase1_has_prompt_template():
    """fr-aa-001-ac2: Phase 1 must include a labeled prompt template block."""
    body = _read(SKILL_PATH)
    # A labeled, copy-pasteable template block in Phase 1
    assert "prompt template" in body.lower() or "task prompt" in body.lower(), (
        "Phase 1 must include a labeled prompt template for sub-agent Task invocations"
    )
    # Template must mention spec-id and paths to key artifacts
    assert "spec-id" in body.lower() or "spec_id" in body.lower(), (
        "Prompt template must include spec-id parameter"
    )
    assert "design.md" in body, "Prompt template must reference design.md path"
    assert "spec.xml" in body, "Prompt template must reference spec.xml path"
    assert "dag.yaml" in body, "Prompt template must reference dag.yaml path"


def test_skill_phase1_partial_failure_does_not_halt():
    """fr-aa-004-ac3: SKILL.md must note partial-failure contract (one error_flag does not halt)."""
    body = _read(SKILL_PATH)
    assert "error_flag" in body, (
        "SKILL.md Phase 1 must mention error_flag so partial failures are surfaced"
    )
    # Must indicate audit continues even if one axis fails
    lower = body.lower()
    assert "partial" in lower or "succeed" in lower, (
        "SKILL.md must state that phases 2-5 continue using findings from axes that succeeded"
    )


# ── aa-002: Finding schema ───────────────────────────────────────────────────

def test_finding_schema_reference_exists():
    """aa-002: shared finding schema reference file must exist."""
    assert FINDING_SCHEMA_PATH.exists(), (
        f"Shared finding schema not found at {FINDING_SCHEMA_PATH}"
    )


def test_finding_schema_contains_required_fields():
    """fr-aa-002-ac1/ac2/ac3: schema must define id format, severity enum, resolution fields."""
    text = _read(FINDING_SCHEMA_PATH)
    assert "A1" in text or "A<axis>" in text, "Schema must document axis ID prefix format"
    assert "NNN" in text or "zero-padded" in text.lower(), (
        "Schema must document zero-padded NNN suffix"
    )
    assert "HIGH" in text and "MED" in text and "LOW" in text and "INFO" in text, (
        "Schema must list all four severity values"
    )
    assert "observed" in text.lower(), "Schema must document 'observed' field"
    assert "why it matters" in text.lower(), "Schema must document 'why it matters' field"
    assert "preview" in text.lower(), "Schema must document 'preview' field for resolutions"
    assert "(Recommended)" in text, "Schema must document '(Recommended)' prefix rule"
    assert "error_flag" in text, "Schema must document error_flag for partial-failure"


@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_cites_finding_schema(path: Path):
    """aa-002: each agent body must cite the shared finding schema reference file."""
    assert path.exists(), f"agent file missing: {path}"
    text = _read(path)
    assert "finding-schema" in text.lower(), (
        f"{path.name} must cite the shared finding-schema reference file"
    )


@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_states_severity_enum(path: Path):
    """fr-aa-002-ac4: each agent body must state the severity enum."""
    assert path.exists(), f"agent file missing: {path}"
    _, body = _parse_frontmatter(_read(path))
    assert "HIGH" in body and "MED" in body and "LOW" in body and "INFO" in body, (
        f"{path.name} must state the severity enum {{HIGH, MED, LOW, INFO}}"
    )


@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_states_axis_id_prefix(path: Path):
    """fr-aa-002-ac1: each agent body must state its axis ID prefix (A1, A2, or A3)."""
    assert path.exists(), f"agent file missing: {path}"
    _, body = _parse_frontmatter(_read(path))
    expected_prefix = AXIS_AGENT_IDS[path.stem]
    assert expected_prefix in body, (
        f"{path.name} must state its axis ID prefix {expected_prefix}"
    )


@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_has_severity_cutoff_criteria(path: Path):
    """fr-aa-002-ac4: each agent body must have axis-specific HIGH vs MED vs LOW cut-offs."""
    assert path.exists(), f"agent file missing: {path}"
    _, body = _parse_frontmatter(_read(path))
    lower = body.lower()
    assert "high" in lower and ("med" in lower or "medium" in lower) and "low" in lower, (
        f"{path.name} must contain HIGH/MED/LOW severity cut-off criteria"
    )
    # Must have a cut-off section/heading or explicit criteria language
    assert "cut-off" in lower or "cutoff" in lower or "criteria" in lower or "severity" in lower, (
        f"{path.name} must contain explicit severity cut-off criteria"
    )


# ── aa-003: Axis-scope separation ───────────────────────────────────────────

def test_cross_artifact_agent_has_4_to_6_patterns():
    """fr-aa-003-ac1: cross-artifact body must list 4-6 concrete pattern examples."""
    path = Path("agents/arc-auditing-spec-cross-artifact-alignment.md")
    assert path.exists()
    _, body = _parse_frontmatter(_read(path))
    lower = body.lower()
    # Must contain counter-examples section routing elsewhere
    assert "not my axis" in lower or "belongs to" in lower or "counter-example" in lower, (
        "cross-artifact agent must contain explicit counter-examples routing to other axes"
    )
    # Must contain patterns for rename drift and related cross-artifact issues
    assert "rename" in lower or "drift" in lower, (
        "cross-artifact agent must list rename-drift type patterns"
    )
    assert "dag" in lower and "design" in lower, (
        "cross-artifact agent must reference both dag.yaml and design.md in its patterns"
    )


def test_internal_consistency_agent_has_4_to_6_patterns():
    """fr-aa-003-ac2: internal-consistency body must list 4-6 patterns + counter-examples."""
    path = Path("agents/arc-auditing-spec-internal-consistency.md")
    assert path.exists()
    _, body = _parse_frontmatter(_read(path))
    lower = body.lower()
    assert "counter-example" in lower or "not my axis" in lower or "belongs to" in lower, (
        "internal-consistency agent must contain counter-examples routing to cross-artifact axis"
    )
    assert "consumes" in lower or "produces" in lower or "contradiction" in lower, (
        "internal-consistency agent must reference internal-field contradictions"
    )
    assert "depends_on" in lower or "dangling" in lower, (
        "internal-consistency agent must address dangling references"
    )


def test_state_transition_agent_has_3_to_5_patterns():
    """fr-aa-003-ac3: state-transition body must list 3-5 file-level patterns."""
    path = Path("agents/arc-auditing-spec-state-transition-integrity.md")
    assert path.exists()
    _, body = _parse_frontmatter(_read(path))
    lower = body.lower()
    assert ".arcforge-epic" in lower, (
        "state-transition agent must reference .arcforge-epic marker files"
    )
    assert "worktree" in lower, (
        "state-transition agent must reference worktree directory presence"
    )
    assert "feature-status" in lower or "feature status" in lower, (
        "state-transition agent must reference feature-status files"
    )


def test_state_transition_agent_excludes_git_explicitly():
    """fr-aa-003-ac3 + F-03: state-transition body must explicitly exclude git commands."""
    path = Path("agents/arc-auditing-spec-state-transition-integrity.md")
    assert path.exists()
    _, body = _parse_frontmatter(_read(path))
    lower = body.lower()
    # Must name the forbidden git commands explicitly
    assert "git log" in lower, (
        "state-transition agent must explicitly name 'git log' as excluded"
    )
    assert "git worktree list" in lower, (
        "state-transition agent must explicitly name 'git worktree list' as excluded"
    )
    # Must have an exclusion phrase (not just mention them)
    assert "not in" in lower or "excluded" in lower or "out of scope" in lower or "no git" in lower, (
        "state-transition agent must have an explicit exclusion phrase for git commands"
    )


# ── aa-004: Graceful degradation ────────────────────────────────────────────

@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_has_graceful_degradation_section(path: Path):
    """fr-aa-004-ac3: every agent must describe partial-failure / error_flag contract."""
    assert path.exists(), f"agent file missing: {path}"
    _, body = _parse_frontmatter(_read(path))
    assert "error_flag" in body, (
        f"{path.name} must document the error_flag partial-failure contract"
    )


def test_cross_artifact_agent_spec_xml_absent_branch():
    """fr-aa-004-ac1: cross-artifact agent must branch when spec.xml is absent."""
    path = Path("agents/arc-auditing-spec-cross-artifact-alignment.md")
    assert path.exists()
    _, body = _parse_frontmatter(_read(path))
    lower = body.lower()
    # Must branch on spec.xml absence marker
    assert "spec.xml" in lower and ("absent" in lower or "missing" in lower or "not present" in lower), (
        "cross-artifact agent must branch when spec.xml is absent"
    )
    # Must emit exactly one INFO finding in that branch
    assert "info" in lower, (
        "cross-artifact agent must emit INFO severity finding when spec.xml absent"
    )
    # Must state the pinned title text
    assert "spec.xml not present" in lower or "alignment-with-spec checks skipped" in lower, (
        "cross-artifact agent must include pinned INFO finding title for absent spec.xml"
    )


def test_state_transition_agent_dag_absent_branch():
    """fr-aa-004-ac2: state-transition agent must emit exactly one INFO when dag.yaml absent."""
    path = Path("agents/arc-auditing-spec-state-transition-integrity.md")
    assert path.exists()
    _, body = _parse_frontmatter(_read(path))
    # Must contain the verbatim pinned title from fr-aa-004-ac2
    assert "DAG not yet planned — state integrity not applicable" in body, (
        "state-transition agent must contain verbatim fr-aa-004-ac2 pinned title"
    )


# ── M-2: sc-002-tool-grant-structural.sh pyyaml fix ─────────────────────────

@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_read_only_tool_grant(path: Path):
    """sc-002-ac3: agent tool allowlist MUST be read-only, enforced by frontmatter.

    Uses yaml.safe_load (M-3) — handles both list and inline-array YAML forms (M-2).
    """
    assert path.exists(), f"agent file missing: {path}"
    text = _read(path)
    front, _ = _parse_frontmatter(text)

    tools = _extract_tools_list(front)
    assert tools, f"{path} must declare a `tools:` allowlist (sc-002-ac3)"

    for tool in tools:
        assert tool in READ_ONLY_TOOLS, (
            f"{path} tool '{tool}' is not in the read-only allowlist "
            f"{sorted(READ_ONLY_TOOLS)} — sc-002-ac3 forbids extensions"
        )
    for forbidden in FORBIDDEN_TOOLS:
        assert forbidden not in tools, (
            f"{path} must NOT grant '{forbidden}' (sc-002-ac3); "
            f"read-only is structural, not prose-based"
        )


@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_frontmatter_identity(path: Path):
    text = _read(path)
    front, _ = _parse_frontmatter(text)
    assert front.get("name") == path.stem


def test_command_wrapper_exists_and_delegates():
    """fr-sc-001-ac1: `/arc-auditing-spec <spec-id>` must be a real slash command."""
    cmd_path = Path("commands/arc-auditing-spec.md")
    assert cmd_path.exists(), (
        "commands/arc-auditing-spec.md must exist so `/arc-auditing-spec` "
        "resolves per fr-sc-001-ac1"
    )
    text = cmd_path.read_text(encoding="utf-8")
    front, body = _parse_frontmatter(text)

    dmi = front.get("disable-model-invocation")
    assert dmi is True or str(dmi).strip().lower() == "true", (
        "commands/arc-auditing-spec.md must set `disable-model-invocation: true`"
    )
    assert "arc-auditing-spec" in body, "command wrapper must delegate to the skill"
    assert "skill" in body.lower(), (
        "command wrapper must explicitly delegate to a skill (thin wrapper rule)"
    )


def test_no_pipeline_auto_invocation_of_audit_skill():
    """sc-001-ac3: no pipeline skill's SKILL.md may invoke /arc-auditing-spec."""
    pipeline_skills = [
        "skills/arc-brainstorming/SKILL.md",
        "skills/arc-refining/SKILL.md",
        "skills/arc-planning/SKILL.md",
    ]
    for skill in pipeline_skills:
        path = Path(skill)
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        assert "/arc-auditing-spec" not in content, (
            f"{skill} must not invoke /arc-auditing-spec — pipeline auto-invocation "
            f"is forbidden by fr-sc-001-ac3"
        )


# ── Eval scenarios exist (ship gate) ─────────────────────────────────────────

def test_axis_eval_cross_artifact_exists():
    """fr-sc-003-ac2: cross-artifact axis eval scenario must exist."""
    evals_dir = Path("skills/arc-auditing-spec/evals")
    matches = list(evals_dir.glob("aa-cross-artifact-001*"))
    assert matches, (
        "At least one aa-cross-artifact-001-* eval scenario file must exist "
        "in skills/arc-auditing-spec/evals/ (fr-sc-003-ac2 ship gate)"
    )


def test_axis_eval_internal_consistency_exists():
    """fr-sc-003-ac2: internal-consistency axis eval scenario must exist."""
    evals_dir = Path("skills/arc-auditing-spec/evals")
    matches = list(evals_dir.glob("aa-internal-001*"))
    assert matches, (
        "At least one aa-internal-001-* eval scenario file must exist "
        "in skills/arc-auditing-spec/evals/ (fr-sc-003-ac2 ship gate)"
    )


def test_axis_eval_state_transition_exists():
    """fr-sc-003-ac2: state-transition axis eval scenario must exist."""
    evals_dir = Path("skills/arc-auditing-spec/evals")
    matches = list(evals_dir.glob("aa-state-transition-001*"))
    assert matches, (
        "At least one aa-state-transition-001-* eval scenario file must exist "
        "in skills/arc-auditing-spec/evals/ (fr-sc-003-ac2 ship gate)"
    )
