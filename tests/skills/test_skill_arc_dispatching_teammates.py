from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-dispatching-teammates/SKILL.md")
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


def test_arc_dispatching_teammates_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-dispatching-teammates"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @ symbols in skill content (force-loads break progressive disclosure)
    assert "@" not in text


def test_arc_dispatching_teammates_has_core_concepts():
    """Test skill documents the core teammates dispatch concept."""
    text = _read_skill()

    # Must document the core substrate — agent teammates
    assert "teammate" in text.lower()
    assert "team_name" in text

    # Must document SendMessage as the lead-teammate communication path
    assert "SendMessage" in text


def test_arc_dispatching_teammates_has_cap_discipline():
    """Test skill documents the 5-teammate cap and continuous dispatch."""
    text = _read_skill()

    # Must state the cap
    assert "5" in text
    assert "cap" in text.lower()

    # Must document continuous dispatch (not waves)
    assert "continuous" in text.lower()
    assert "queue" in text.lower()


def test_arc_dispatching_teammates_has_preconditions():
    """Test skill documents hard-fail preconditions."""
    text = _read_skill()

    # Must have a Preconditions section
    assert "Precondition" in text or "precondition" in text

    # Must reference hard-fail behavior
    assert "hard fail" in text.lower() or "hard-fail" in text.lower()

    # Must require 2+ ready epics
    assert "2+ ready" in text or "2+ epics" in text or "2 or more" in text.lower()


def test_arc_dispatching_teammates_has_arc_looping_boundary():
    """Test skill documents the attendance-based boundary against arc-looping."""
    text = _read_skill()

    # Must reference arc-looping as the walk-away alternative
    assert "arc-looping" in text

    # Must name the attendance/presence discriminator
    assert "attendance" in text.lower() or "walking away" in text.lower() or "present" in text.lower()


def test_arc_dispatching_teammates_has_spawn_prompt_template():
    """Test skill contains a verbatim spawn prompt for teammates."""
    text = _read_skill()

    # Must have a spawn prompt template
    assert "Spawn Prompt" in text or "spawn prompt" in text.lower()

    # Must reference /arc-implementing as the teammate's workflow
    assert "/arc-implementing" in text or "arc-implementing" in text

    # Must warn teammates that plain-text output is invisible to the lead
    assert "invisible" in text.lower() or "not visible" in text.lower()


def test_arc_dispatching_teammates_has_red_flags():
    """Test skill documents the baseline rationalizations to counter."""
    text = _read_skill()

    # Must have a Red Flags section
    assert "Red Flag" in text

    # Must counter the "open N Claude windows and tab between them" rationalization
    assert "window" in text.lower() or "tab" in text.lower() or "orchestrator" in text.lower()


def test_arc_dispatching_teammates_has_completion_and_blocked_formats():
    """Test skill uses arcforge's standard completion and blocked formats."""
    text = _read_skill()

    # Completion format marker
    assert "✅" in text

    # Blocked format marker
    assert "⚠️" in text

    # Blocked format must include Issue/Checked/Action triple
    assert "Issue:" in text
    assert "Action:" in text


def test_arc_dispatching_teammates_has_expand_workflow():
    """Test skill auto-expands per epic rather than assuming pre-expansion."""
    text = _read_skill()

    # Must reference the per-epic expand flag
    assert "--epic" in text

    # Must reference the canonical worktree path derivation (do not reconstruct from hash)
    assert "arcforge-worktree" in text or "canonical" in text.lower() or "status --json" in text


def test_arc_dispatching_teammates_references_related_skills():
    """Test skill references upstream and downstream arcforge skills."""
    text = _read_skill()

    # Must reference arc-using as the routing prerequisite
    assert "arc-using" in text

    # Must reference arc-planning as the upstream
    assert "arc-planning" in text

    # Must reference arc-implementing as what each teammate runs
    assert "arc-implementing" in text

    # Must reference arc-finishing-epic as the teammate wrap-up
    assert "arc-finishing-epic" in text


def test_arc_dispatching_teammates_word_count_within_tier():
    """Test SKILL.md stays within the Comprehensive tier soft guidance."""
    text = _read_skill()
    word_count = len(text.split())

    # Standard tier is <1000w, Comprehensive is <1800w. This skill covers
    # 9 structural sections plus a verbatim spawn prompt — Comprehensive
    # is the hard ceiling.
    assert word_count < 1800, f"SKILL.md is {word_count} words, exceeds Comprehensive tier (<1800w)"
