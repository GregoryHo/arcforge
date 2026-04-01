from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-looping/SKILL.md")
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


def test_arc_looping_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-looping"
    assert front.get("description", "").startswith("Guide for")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @ symbols in skill content
    assert "@" not in text


def test_arc_looping_has_loop_patterns():
    """Test skill documents sequential and DAG loop patterns."""
    text = _read_skill()

    # Must document both patterns
    assert "sequential" in text.lower()
    assert "dag" in text.lower() or "DAG" in text

    # Must mention max-runs limit
    assert "--max-runs" in text


def test_arc_looping_has_state_tracking():
    """Test skill documents loop state file and stop conditions."""
    text = _read_skill()

    # Must reference state file
    assert ".arcforge-loop.json" in text

    # Must document stop conditions
    assert "stall" in text.lower()

    # Must reference dag.yaml as input
    assert "dag.yaml" in text


def test_arc_looping_has_monitoring():
    """Test skill documents how to monitor running loops."""
    text = _read_skill()

    # Must reference loop-operator agent for monitoring
    assert "loop-operator" in text

    # Must document retry storm detection
    assert "retry" in text.lower()


def test_arc_looping_references_related_skills():
    """Test skill references upstream and downstream skills."""
    text = _read_skill()

    # Must reference arc-planning as prerequisite
    assert "arc-planning" in text

    # Must reference finishing skills
    assert "arc-finishing" in text
