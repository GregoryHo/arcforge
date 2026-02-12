from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-coordinating/SKILL.md")
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


def test_arc_coordinating_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-coordinating"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "⚠️" in text



def test_arc_coordinating_contains_required_sections():
    text = _read_skill()

    # Must reference CLI
    assert "arcforge" in text.lower()

    # Must have worktree management
    assert "worktree" in text.lower()

    # Must have commands
    assert "expand" in text.lower()
    assert "merge" in text.lower()
    assert "status" in text.lower()

    # Must reference dag.yaml
    assert "dag.yaml" in text.lower()

    # Must reference skill root and coordinator script (Node.js CLI)
    assert "SKILL_ROOT" in text
    assert "scripts/coordinator.js" in text
