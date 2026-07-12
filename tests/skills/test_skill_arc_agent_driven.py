from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-agent-driven/SKILL.md")
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


def test_arc_agent_driven_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-agent-driven"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text

    assert "✅" in text


def test_arc_agent_driven_contains_required_sections():
    text = _read_skill()

    # Must have process flowchart
    assert "digraph process" in text

    # Must have prompt template references
    assert "implementer-prompt.md" in text
    assert "task-reviewer-prompt.md" in text

    # Must have max review cycles guidance
    assert "Max review cycles" in text

    # Must reference the single task-reviewer's dual-verdict contract
    assert "spec compliance" in text.lower()
    assert "task quality" in text.lower()

    # Must reference subagent dispatch
    assert "subagent" in text.lower()


def test_arc_agent_driven_review_package_handoff():
    text = _read_skill()

    # Must wire in the pre-built review package handoff
    assert "scripts/review-package.js" in text
    assert ".arcforge/sdd/" in text
    assert "{DIFF_FILE}" in text

    # Must warn against HEAD~1 truncating a multi-commit task
    assert "HEAD~1" in text


def test_arc_agent_driven_durable_progress_ledger():
    text = _read_skill()

    # Ledger file lives in the same self-ignoring workspace
    assert ".arcforge/sdd/progress.md" in text

    # Exact ledger line format is the recovery contract
    assert "Task N: complete (commits <base7>..<head7>, review clean)" in text

    # Resume uses git-verifiable state, not recollection
    assert "git log" in text.lower()

    # Red Flag: never re-dispatch a ledger-complete task; reconcile first
    assert "reconcile the ledger against `git log`" in text


def test_arc_agent_driven_model_selection_ladder():
    text = _read_skill()

    # New Model Selection section carrying the load-bearing dispatch rule
    assert "### Model Selection" in text
    assert "never rely on inherit" in text.lower()

    # arcforge's real tiers, mapped cheapest → strongest
    assert "haiku" in text
    assert "sonnet" in text
    assert "opus" in text

    # Cheapest-tier condition is directly checkable against arc-writing-tasks
    assert "Exact code — Complete code" in text

    # Headless caveat: arc-looping must pass --model explicitly to honor a pin
    assert "--model" in text
    assert "loop-verifier.js" in text


def test_code_reviewer_agent_pinned_to_strongest_tier():
    # The final whole-branch review must not silently inherit the session's
    # (often most expensive) model — it is pinned to arcforge's strongest tier.
    text = Path("agents/code-reviewer.md").read_text(encoding="utf-8")
    front = _parse_frontmatter(text)
    assert front.get("model") == "opus"
