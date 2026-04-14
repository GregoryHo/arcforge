import re
from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-using-worktrees/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def _extract_fenced_code_blocks(text: str) -> list[str]:
    """Return the content of every ``` fenced code block in the text.

    Fenced blocks are the portions of the skill an agent is most likely to
    execute verbatim, so structural checks target these rather than prose.
    """
    return re.findall(r"```[a-zA-Z]*\n(.*?)\n```", text, re.DOTALL)


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


def test_arc_using_worktrees_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-using-worktrees"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    # No @-file syntax (forces files into context).
    assert "@" not in text

    # Required visual markers for completion + blocked formats.
    assert "✅" in text
    assert "⚠️" in text


def test_arc_using_worktrees_is_thin_wrapper():
    """The skill must delegate to coordinator.js, not create worktrees by hand."""
    text = _read_skill()

    # Must delegate to coordinator.js expand --epic.
    assert 'coordinator.js" expand --epic' in text

    # `git worktree add` must NEVER appear in a fenced code block — those are
    # the parts an agent is most likely to execute verbatim. It may appear in
    # inline backticks inside prose (e.g., inside a Red Flag paragraph that
    # frames it as forbidden), but not as an executable instruction.
    for block in _extract_fenced_code_blocks(text):
        assert "git worktree add" not in block, (
            "`git worktree add` appears inside a fenced code block — agents "
            "execute these verbatim. Move it to inline prose if you need to "
            "mention it as a Red Flag counterexample."
        )

    # Must reference .arcforge-epic for context (explaining what the CLI does).
    assert ".arcforge-epic" in text

    # Must reference SKILL_ROOT for CLI invocation.
    assert "SKILL_ROOT" in text


def test_arc_using_worktrees_references_worktree_rule():
    """The skill should point at arc-using for the Worktree Rule background."""
    text = _read_skill()
    assert "arc-using" in text
    # The Worktree Rule lives in arc-using — this skill must reference it.
    assert "Worktree Rule" in text


def test_arc_using_worktrees_no_hardcoded_paths():
    """The skill must teach agents to read paths from CLI output, not hardcode them."""
    text = _read_skill()
    lower = text.lower()

    # Must contain the specific instruction that the path comes from the CLI's
    # JSON output — this is the positive invariant that shapes agent behavior.
    assert "path from arcforge expand" in lower, (
        "skill must tell agents to read the path from `arcforge expand` output"
    )

    # Must explicitly warn against hardcoding / reconstructing the path.
    assert "hardcode" in lower or "reconstruct" in lower, (
        "skill must explicitly forbid hardcoding/reconstructing worktree paths"
    )

    # Structural check: the canonical worktree root string
    # (`~/.arcforge-worktrees/` or `/.arcforge-worktrees/`) must NOT appear in
    # any fenced code block as a literal path an agent would execute. It may
    # appear in prose (e.g., in the Worktree Rule reference) because prose is
    # documentation, not instructions.
    hardcoded_patterns = ("~/.arcforge-worktrees/", "/.arcforge-worktrees/")
    for block in _extract_fenced_code_blocks(text):
        for pattern in hardcoded_patterns:
            assert pattern not in block, (
                f"hardcoded worktree path `{pattern}` appears inside a fenced "
                "code block — agents will execute it verbatim. Use an "
                "abstract placeholder like `<path from arcforge expand JSON>`."
            )
