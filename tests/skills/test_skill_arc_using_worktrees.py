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


def _extract_section(text: str, heading: str) -> str:
    """Return the body of a `## <heading>...` section, up to the next `## `.

    Matches by prefix so headings carrying a parenthetical or trailing
    punctuation (e.g. "## Generic Tier (any git repo)") still resolve.
    """
    pattern = rf"^## {re.escape(heading)}.*?(?=^## |\Z)"
    match = re.search(pattern, text, re.DOTALL | re.MULTILINE)
    if match is None:
        raise AssertionError(f"missing section: {heading}")
    return match.group(0)


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


def test_arc_using_worktrees_frontmatter():
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


def test_arc_using_worktrees_blessed_invocation():
    """Generic + composition tiers invoke the CLI via the blessed ARCFORGE_ROOT form."""
    text = _read_skill()

    # Blessed CLI form (AF-1 convention), not the broken SKILL_ROOT coordinator.js path.
    assert "ARCFORGE_ROOT}/scripts/cli.js" in text
    assert "SKILL_ROOT}/scripts/coordinator.js" not in text

    # AF-1 blessed fallback header (`:=`), NOT the abort `:?` form that breaks
    # the first command on non-Claude platforms.
    assert ': "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"' in text
    assert ":?" not in text


def test_arc_using_worktrees_detection_table():
    """The 4-row tier-detection table must be present with all four signals."""
    text = _read_skill()
    section = _extract_section(text, "Which Tier Am I In?")

    # Four data rows in the markdown table → at least four numbered signals.
    rows = [line for line in section.splitlines() if re.match(r"\|\s*[1-4]\s*\|", line)]
    assert len(rows) == 4, f"expected a 4-row detection table, found {len(rows)} rows"

    # The four signals named in the RFC contract.
    assert ".arcforge-epic" in section
    assert "dag.yaml" in section
    assert "No arcforge state" in section


def test_arc_using_worktrees_composition_tier_delegates():
    """Composition tier is a single expand pointer — it must NOT re-document
    the epic lifecycle (no merge/cleanup), per the WT-3 acceptance grep."""
    text = _read_skill()
    section = _extract_section(text, "Composition Tier")

    # Exactly one expand command.
    assert section.count("expand --epic") == 1

    # The section delegates; it does not re-document merge/cleanup (those live
    # in arc-coordinating / the Finishing section, not here).
    assert "merge" not in section.lower()
    assert "cleanup" not in section.lower()

    # Branch is engine-derived `<spec-id>/<epic-id>` — the stale `-b <epic-id>`
    # claim must be gone from the whole skill.
    assert "<spec-id>/<epic-id>" in section
    assert "-b <epic-id>" not in text


def test_arc_using_worktrees_generic_tier_cli():
    """Generic tier wires to the WT-2 engine: add/list/remove via the CLI."""
    text = _read_skill()
    section = _extract_section(text, "Generic Tier")

    assert "worktree add" in section
    assert "worktree list --json" in section
    assert "worktree remove" in section

    # There is no `switch` subcommand — moving in is `cd` to the JSON path.
    assert "worktree switch" not in text


def test_arc_using_worktrees_red_flags():
    """All five red flags from the RFC are carried over."""
    text = _read_skill()
    section = _extract_section(text, "Red Flags")

    flags = [line for line in section.splitlines() if re.match(r"\d+\.\s", line.strip())]
    assert len(flags) == 5, f"expected 5 red flags, found {len(flags)}"


def test_arc_using_worktrees_no_manual_git_worktree_add():
    """`git worktree add` must NEVER appear in a fenced code block — those are
    the parts an agent is most likely to execute verbatim. It may appear in
    inline backticks inside prose (a Red Flag counterexample), but never as an
    executable instruction."""
    text = _read_skill()
    for block in _extract_fenced_code_blocks(text):
        assert "git worktree add" not in block, (
            "`git worktree add` appears inside a fenced code block — agents "
            "execute these verbatim. Move it to inline prose if you need to "
            "mention it as a Red Flag counterexample."
        )


def test_arc_using_worktrees_no_hardcoded_paths():
    """The skill must teach agents to read paths from CLI output, not hardcode them."""
    text = _read_skill()
    lower = text.lower()

    # Positive invariant: read the path from the CLI's JSON output.
    assert "path` field" in text or "path field" in lower, (
        "skill must tell agents to read the `path` field from CLI JSON output"
    )

    # Must explicitly warn against hardcoding / reconstructing the path.
    assert "hardcode" in lower or "reconstruct" in lower, (
        "skill must explicitly forbid hardcoding/reconstructing worktree paths"
    )

    # Structural check: the canonical worktree root string must NOT appear in
    # any fenced code block as a literal path an agent would execute.
    hardcoded_patterns = ("~/.arcforge/worktrees/", "/.arcforge/worktrees/")
    for block in _extract_fenced_code_blocks(text):
        for pattern in hardcoded_patterns:
            assert pattern not in block, (
                f"hardcoded worktree path `{pattern}` appears inside a fenced "
                "code block — agents will execute it verbatim. Use an "
                "abstract placeholder like `<path from CLI JSON>`."
            )
