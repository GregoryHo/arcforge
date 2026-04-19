from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-finishing-epic/SKILL.md")
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


def test_arc_finishing_epic_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-finishing-epic"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text


def test_arc_finishing_epic_contains_required_sections():
    text = _read_skill()

    # Must check for .arcforge-epic file
    assert ".arcforge-epic" in text
    assert "cat .arcforge-epic" in text

    # Must present exactly 4 options
    assert "1. Merge" in text
    assert "2. Push and create a Pull Request" in text or "2. Create PR" in text
    assert "3. Keep" in text
    assert "4. Discard" in text

    # Must use coordinator merge (not git merge directly)
    assert "coordinator merge" in text.lower()
    assert "finish-epic.js" in text

    # Sync scoped to Option 2 only
    assert "After Option 2" in text


def test_arc_finishing_epic_discard_uses_marker_guard():
    """SDD v2: discard-path sync guard predicates on .arcforge-epic marker.

    The root-level `dag.yaml` predicate (`if [ -f dag.yaml ]`) was removed
    because the DAG now lives at specs/<spec-id>/dag.yaml in the base —
    the current worktree only has the marker, which the coordinator uses
    to reconnect.
    """
    text = _read_skill()
    assert "if [ -f .arcforge-epic ]" in text
    assert "if [ -f dag.yaml ]" not in text
