from pathlib import Path
import re


def _read_skill() -> str:
    skill_path = Path("skills/arc-planning/SKILL.md")
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


def test_arc_planning_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-planning"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text
    assert "⚠️" in text

    word_count = len(re.findall(r"\b\w+\b", text))
    assert word_count <= 500


def test_arc_planning_contains_required_sections():
    text = _read_skill()

    # Must have DAG output
    assert "dag.yaml" in text.lower()

    # Must have epic/feature mapping
    assert "epic" in text.lower()
    assert "feature" in text.lower()

    # Must reference spec.xml as input
    assert "spec.xml" in text.lower()

    # Must have traceability
    assert "source_requirement" in text.lower() or "traceability" in text.lower()

    # Must have self-validation (cycle detection)
    assert "circular" in text.lower() or "cycle" in text.lower()
