import re
from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-finishing/SKILL.md")
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


def test_arc_finishing_frontmatter_and_rules():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-finishing"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024

    assert "@" not in text


def test_arc_finishing_contains_required_sections():
    text = _read_skill()

    # Must present exactly 4 options
    assert "1. Merge" in text
    assert "2. Push and create a Pull Request" in text or "2. Create PR" in text
    assert "3. Keep" in text
    assert "4. Discard" in text

    # Must require typed "discard" confirmation
    assert "Type 'discard' to confirm" in text

    # Must have Quick Reference table
    assert "## Quick Reference" in text

    # Must have check/warning markers in Quick Reference
    assert "✓" in text

    # No cleanup for Option 2 (keep worktree)
    assert "Keep worktree until PR merged" in text


def test_arc_finishing_step0_discriminates_on_marker():
    """WT-6: the merged skill discriminates epic vs non-epic on .arcforge-epic.

    Both paths live in one skill — Step 0 reads the marker and routes. The
    discrimination must check for the marker file directly.
    """
    text = _read_skill()
    assert ".arcforge-epic" in text
    assert "if [ -f .arcforge-epic ]" in text
    # Both path labels present.
    assert "Epic Path" in text
    assert "Non-Epic Path" in text


def test_arc_finishing_shared_blocks_exactly_once():
    """WT-6: 4-option prompt, typed-discard, and the test gate appear once each.

    The twin-skill drift history is exactly why the shared blocks must not be
    duplicated when the two skills merge into one.
    """
    text = _read_skill()
    # The 4-option prompt header appears exactly once.
    assert text.count("Implementation complete. What would you like to do?") == 1
    # The typed-discard confirmation appears exactly once.
    assert text.count("Type 'discard' to confirm") == 1
    # The test auto-detect gate (its distinctive comment) appears exactly once.
    assert text.count("Auto-detect test command from project files") == 1


def test_arc_finishing_epic_path_uses_coordinator_merge():
    """WT-6: the epic path still uses coordinator merge, not raw git merge."""
    text = _read_skill()
    assert "finish-epic.js" in text
    assert "coordinator merge" in text.lower()
    # Sync scoped to Option 2 only (epic path).
    assert "After Option 2" in text


def test_arc_finishing_epic_discard_uses_marker_guard():
    """SDD v2 (carried into the merged skill): discard sync guards on the marker.

    The root-level dag.yaml predicate was removed because the DAG now lives at
    specs/<spec-id>/dag.yaml in the base — the worktree only has the marker.
    """
    text = _read_skill()
    assert "if [ -f .arcforge-epic ]" in text
    assert "if [ -f dag.yaml ]" not in text


def test_arc_finishing_no_epic_name_git_operand():
    """WT-4 (carried): `<epic-name>` is never used as a git operand.

    The engine names epic branches `<spec-id>/<epic-id>`; the skill must resolve
    the live branch (`git branch --show-current`) instead of pasting a placeholder
    into a git command. Display placeholders in formats are fine.
    """
    text = _read_skill()
    bad = re.compile(r"(?:git\b[^\n`]*|origin |branch -[dD] |push[^\n`]*|tag[^\n`]*)<epic-name>")
    assert not bad.search(text), "<epic-name> must not appear as a git operand"
    assert "git branch --show-current" in text


def test_arc_finishing_option1_migrate_before_destroy():
    """WT-4 (carried): Option 1 reorders to merge → cd-to-base → cleanup → branch -d.

    Cleanup and `git branch -d` must run from the base checkout (after `cd`).
    The branch delete is the honest `-d`, not a forced `-D` (epic path).
    """
    text = _read_skill()
    assert 'BASE_WORKTREE="$(grep' in text
    assert 'cd "$BASE_WORKTREE"' in text
    assert 'git branch -d "$EPIC_BRANCH"' in text


def test_arc_finishing_conflict_abort_via_coordinator():
    """WT-5 (carried): conflict recovery aborts the BASE merge through the coordinator."""
    text = _read_skill()
    assert 'finish-epic.js" merge --abort' in text
    assert "bare `git merge --abort`" in text


def test_arc_finishing_step46_resolves_path_from_base():
    """WT-4 (carried): Step 4.6 queries the BASE dag for the epic path."""
    text = _read_skill()
    assert "the BASE dag" in text
    assert (
        '( cd "$BASE_WORKTREE" && node "${SKILL_ROOT}/scripts/finish-epic.js"'
        ' status --json --spec-id "$SPEC_ID" )'
    ) in text


def test_arc_finishing_nonepic_uses_base_checkout_merge():
    """WT-6 fixup 1: the non-epic path merges into the base, never checks out base here.

    git 2.52 exits 128 on `git checkout <base-branch>` inside a linked worktree,
    so the non-epic Option 1 must merge into the base via `git -C <base>` (located
    through `worktree list --json` kind:base), and the new red flag forbids the
    in-worktree checkout.
    """
    text = _read_skill()
    # Locate base via kind:base from worktree list --json.
    assert "worktree list --json" in text
    assert 'kind==="base"' in text
    # Merge into the base, not the worktree.
    assert 'git -C "$BASE_WORKTREE" merge "$FEATURE_BRANCH"' in text
    # The new red flag forbids checking out the base branch inside a linked worktree.
    assert "git checkout <base-branch>` inside a linked worktree" in text


def test_arc_finishing_nonepic_remove_before_branch_delete():
    """WT-6 fixup 1: non-epic worktree removal precedes branch delete; cd base first.

    Step 5 must remove the worktree (after cd to base) before deleting the branch —
    you cannot delete a branch checked out in a present worktree, and removing your
    own cwd strands the shell.
    """
    text = _read_skill()
    # Step 5 removes the generic worktree via the CLI.
    assert 'worktree remove "$WT_NAME"' in text
    # The ordering rule is stated.
    assert "worktree is removed" in text
