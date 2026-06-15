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


def test_arc_finishing_epic_no_epic_name_git_operand():
    """WT-4: `<epic-name>` is never used as a git operand.

    The engine names epic branches `<spec-id>/<epic-id>`; the skill must
    resolve the live branch (`git branch --show-current`) instead of pasting
    a placeholder into a git command. Display placeholders in completion /
    blocked formats are fine — only git operand uses are forbidden.
    """
    import re

    text = _read_skill()
    bad = re.compile(r"(?:git\b[^\n`]*|origin |branch -[dD] |push[^\n`]*|tag[^\n`]*)<epic-name>")
    assert not bad.search(text), "<epic-name> must not appear as a git operand"
    # Branch resolution is wired from the live worktree branch.
    assert "git branch --show-current" in text


def test_arc_finishing_epic_option1_migrate_before_destroy():
    """WT-4: Option 1 reorders to merge → cd-to-base → cleanup → branch -d.

    Cleanup and `git branch -d` must run from the base checkout (after `cd`),
    never from the worktree (silent no-op + cannot delete the dir you stand in).
    The branch delete is the honest `-d`, not a forced `-D`.
    """
    text = _read_skill()
    # Capture base path, then cd to it before cleanup.
    assert 'BASE_WORKTREE="$(grep' in text
    assert 'cd "$BASE_WORKTREE"' in text
    # Honest delete in Option 1 (full text guards against a silent switch to -D).
    assert 'git branch -d "$EPIC_BRANCH"' in text


def test_arc_finishing_epic_conflict_abort_via_coordinator():
    """WT-5: conflict recovery aborts the BASE merge through the coordinator.

    A bare `git merge --abort` from the worktree is a no-op (the half-merged
    state lives in the base checkout). Step 4.1 must route the abort through
    `finish-epic.js merge --abort`, which delegates to the base worktree.
    """
    text = _read_skill()
    assert 'finish-epic.js" merge --abort' in text
    # And it warns against the bare-git no-op trap.
    assert "bare `git merge --abort`" in text


def test_arc_finishing_epic_step46_resolves_path_from_base():
    """WT-4: Step 4.6 queries the BASE dag, never the worktree's local copy.

    A worktree's local dag carries `worktree: null` for every epic, so
    `status --json` from a worktree cwd reports `path: null` — which would
    print a null path for the kept-worktree options (2/3). The kept-options
    branch must cd to the marker's base_worktree before querying.
    """
    text = _read_skill()
    # Kept options resolve the base AND spec id, then query the base dag in a
    # subshell. --spec-id forces the flat single-spec shape (a multi-spec base
    # with no marker would otherwise return the nested { specs: {...} } shape).
    assert "the BASE dag" in text
    assert (
        '( cd "$BASE_WORKTREE" && node "${SKILL_ROOT}/scripts/finish-epic.js"'
        ' status --json --spec-id "$SPEC_ID" )'
    ) in text
