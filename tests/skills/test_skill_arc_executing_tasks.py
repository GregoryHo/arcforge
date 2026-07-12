from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-executing-tasks/SKILL.md")
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


def test_arc_executing_tasks_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-executing-tasks"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "⚠️" in text



def test_arc_executing_tasks_contains_required_sections():
    text = _read_skill()

    # Must have batch execution concept
    assert "batch" in text.lower() or "sequential" in text.lower()

    # Must have verification
    assert "verify" in text.lower() or "test" in text.lower()

    # Must have commit pattern
    assert "commit" in text.lower()


def test_arc_executing_tasks_durable_progress_ledger():
    text = _read_skill()

    # Mirrors the durable ledger, same file + same line format as agent-driven
    assert ".arcforge/sdd/progress.md" in text
    assert "Task N: complete (commits <base7>..<head7>, review clean)" in text

    # Resume-after-last-complete + reconcile against git log
    assert "git log" in text.lower()
