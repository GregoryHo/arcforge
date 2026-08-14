"""Structure-only validation for every skill under skills/*/SKILL.md.

Checks frontmatter validity, name == dirname, the frozen v6 frontmatter schema,
description register, generic structure, cross-reference resolution, referenced
supporting-file existence, and line budget. No literal sentence assertions —
behavioral protection is the eval layer's job.

Skills are discovered dynamically, so merges, renames, and new skills need zero
test edits. Paths are anchored to the repo root, so the suite is cwd-proof.

Grandfathering (v6 P1): the 30 v5 skills predate the frozen schema and the
`/name` composition rule. `docs/plans/v6/legacy-skills.json` is the single source
of truth for that exemption; skills outside it get the full v6 ruleset. The list
is a ratchet — it may only shrink (see the ratchet tests at the bottom of this
file) and must be empty by the end of P6. While every skill is still legacy, the
new assertions are vacuous on real skills, so the parser/predicate unit tests at
the end of this file carry their actual coverage.
"""
import json
import re
import warnings
from pathlib import Path

import pytest
import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
# Shipped skills live in the `core` lifecycle bucket (P6.5) — the one bucket
# `.claude-plugin/plugin.json` whitelists. `in-progress/` and `deprecated/` are
# on-disk holding areas that never load, so this schema does not govern them.
SKILLS_DIR = PROJECT_ROOT / "skills" / "core"
LEGACY_MANIFEST = PROJECT_ROOT / "docs" / "plans" / "v6" / "legacy-skills.json"
ROUTER_MANIFEST = PROJECT_ROOT / "tests" / "router-skill.json"

# Line budget: soft cap warns, hard cap fails.
SOFT_LINE_CAP = 150
HARD_LINE_CAP = 250

# Description grammar — two registers, applied to every skill (legacy included)
# because it is the machine-readable half of the invocation dichotomy.
#   model-invoked (default): "<identity>. Use when <triggers>", 60–280 chars.
#   user-invoked (disable-model-invocation: true): plain one-liner, max 120 chars,
#   no "Use when" trigger list.
MODEL_DESC_MIN = 60
MODEL_DESC_MAX = 280
USER_DESC_MAX = 120

# Frozen frontmatter schema (v6). Anything outside this set fails — including the
# v5 `category` / `status` fields, which v6 drops. Legacy skills are exempt.
FROZEN_FRONTMATTER_KEYS = frozenset(
    {"name", "description", "disable-model-invocation", "argument-hint", "allowed-tools"}
)

# Ratchet baseline: the legacy list is frozen at its P1 size and may only shrink.
# Adding a name to dodge the frozen schema is exactly what this blocks.
LEGACY_BASELINE = 30

# Sanity floor: guards against a broken glob silently passing the whole suite.
MIN_SKILL_COUNT = 10

# Exact expected count, pre-registered at the P6.5 bucket move. The floor above
# catches a glob that broke to zero; this catches one that broke to "some". A
# real change to the shipped skill set is a deliberate edit here, not a mystery
# failure — update it in the same commit that adds or removes a skill.
EXPECTED_SKILL_COUNT = 15

# Permanent exceptions — per-skill overrides of the hard cap, keyed by skill name
# and measured in BODY lines (frontmatter excluded). The table is EMPTY and is
# meant to stay that way: `test_permanent_budget_is_legacy_only` forbids an entry
# for any v6 skill, so the only legal key would be a grandfathered v5 skill, and
# every one of those is on its way out. The two historical entries are gone —
# `arc-refining` with the skill in P2, `arc-finishing` in P3 when the pilot-B
# rewrite (`finishing`) landed inside the 250-line cap without an exception.
# Over the cap, the answer is `references/` or the CLI, never a new key here.
PERMANENT_LINE_BUDGET = {}

# Supporting-file references: references/, scripts/, templates/, agents/ paths ending
# in a known extension. The lookbehind skips matches embedded in a longer path
# (cross-skill `arc-using/references/...`) or a variable example
# (`${SKILL_ROOT}/scripts/...`) so only first-class path pointers are validated.
_SUPPORTING_FILE_PATTERN = re.compile(
    r"(?<![\w./$-])(?:references|scripts|templates|agents)/[A-Za-z0-9._/-]+\.(?:md|js|sh|ya?ml)"
)

# Legacy cross-references: first arc-* token after a REQUIRED SUB-SKILL /
# REQUIRED BACKGROUND marker. Legacy skills only — v6 skills use `/name`.
_CROSS_REF_PATTERN = re.compile(r"(?:REQUIRED SUB-SKILL|REQUIRED BACKGROUND).*?(arc-[\w-]+)")

# v6 composition: the only sanctioned cross-skill pointer is a prose `/name`
# invocation (backticked or bare — both parse), optionally plugin-namespaced as
# `/arcforge:name`. The lookarounds reject path-shaped slashes
# (`references/x.md`, `/usr/local`, `and/or`, `2026/07/31`, `${SKILL_ROOT}/scripts`)
# and XML closing tags (`</delta>`), so a match is a genuine invocation.
# The trailing `(?!\.\w)` rejects a file extension without rejecting a sentence
# period, so `/finishing.` at the end of a sentence still parses.
# Calibrated against all 30 v5 skills: with these exclusions plus
# BUILTIN_SLASH_COMMANDS, the parser reports zero unresolved targets on real
# skill prose.
_SLASH_INVOCATION_PATTERN = re.compile(
    r"(?<![\w./$<-])/(?:arcforge:)?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![\w/-])(?!\.\w)"
)

# Router index (schema §3.1 exemption, P3). `skills/using` carries a `## Skill Map`
# table listing every shipped skill. Those rows are an INDEX, not invocations: the
# table answers "which skills exist and when does each apply", and the execution
# semantics still require the user to type `/name`. Without this carve-out §3.1
# ("a user-invoked skill is never prose-invoked") and the router bijection ("every
# shipped skill has exactly one row") are mutually exclusive — `writing-skills` is
# user-invoked, so a row violates one rule and no row violates the other.
#
# The exemption is scoped as narrowly as it can be: ONLY the leading `/name` cell
# of a table row inside the Skill Map section. Any other slash token — elsewhere in
# the router, later cells of a Skill Map row, or any other skill's prose — is a
# normal INVOCATION and gets the full §3.1 check.
#
# Router identity is NOT spelled out here. `tests/router-skill.json` is the single
# source this file and tests/scripts/router-contract.test.js (jest) both read —
# P3 hardcoded `"using"` in both, so a rename could leave this side exempting a
# table the bijection side no longer treated as the router, with both suites green.
def _load_router_manifest():
    """Read the shared router manifest, failing loudly on a malformed field."""
    data = json.loads(ROUTER_MANIFEST.read_text())
    for key in ("router_skill", "skill_map_heading"):
        value = data.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError(f"{ROUTER_MANIFEST}: '{key}' must be a non-empty string")
    return data


_ROUTER_MANIFEST_DATA = _load_router_manifest()
ROUTER_SKILL = _ROUTER_MANIFEST_DATA["router_skill"]
SKILL_MAP_HEADING = _ROUTER_MANIFEST_DATA["skill_map_heading"]
# The leading cell of a Skill Map row: `| /finishing | ... |` (backticks optional).
_ROUTER_ROW_PATTERN = re.compile(r"^\|\s*`?/([a-z0-9][a-z0-9-]*)`?\s*\|")

# Cross-skill deep links (schema §5.2): a path reaching into ANOTHER skill's
# directory. Wanting another skill's files means wanting that skill, so the only
# sanctioned pointer is a `/name` invocation. Matches both spellings the schema
# names — `skills/<bucket>/<other>/...` and `../<other>/...` — and resolves the
# offender by skill name, so a pointer at the skill's OWN directory is not a
# boundary crossing. The bucket segment (P6.5) is optional so the pre-bucket
# spelling `skills/<other>/` is still caught rather than silently ignored.
_DEEP_LINK_PATTERN = re.compile(
    r"(?:\.\./|skills/(?:core/|in-progress/|deprecated/)?)([a-z][a-z0-9-]*)/"
)

# Claude Code builtin slash commands. Skill prose legitimately names these
# (`/compact`, `/review`), and they are not skills. Filtered only when the token
# does not also name a shipped skill, so a real skill can never hide behind the
# list.
BUILTIN_SLASH_COMMANDS = frozenset(
    {
        "agents",
        "clear",
        "compact",
        "config",
        "context",
        "cost",
        "doctor",
        "export",
        "help",
        "hooks",
        "init",
        "mcp",
        "memory",
        "model",
        "permissions",
        "resume",
        "review",
        "rewind",
        "security-review",
        "status",
        "todos",
        "usage",
    }
)


def _load_legacy_skills() -> frozenset[str]:
    data = json.loads(LEGACY_MANIFEST.read_text(encoding="utf-8"))
    legacy = data["legacy"]
    assert isinstance(legacy, list), "legacy-skills.json: 'legacy' must be a list"
    return frozenset(legacy)


LEGACY_SKILLS = _load_legacy_skills()


def _is_legacy(name: str) -> bool:
    """True when the skill is grandfathered out of the v6 frontmatter/composition rules."""
    return name in LEGACY_SKILLS


def _skill_dirs() -> list[Path]:
    return sorted(
        d for d in SKILLS_DIR.iterdir() if d.is_dir() and (d / "SKILL.md").exists()
    )


SKILL_DIRS = _skill_dirs()
SKILL_NAMES = {d.name for d in SKILL_DIRS}


def _read(skill_dir: Path) -> str:
    return (skill_dir / "SKILL.md").read_text(encoding="utf-8")


def _split_frontmatter(text: str) -> tuple[str, str]:
    """Return (frontmatter_text, body) or raise AssertionError on malformed fences."""
    assert text.startswith("---\n"), "missing frontmatter start fence"
    end = text.find("\n---\n", 4)
    assert end != -1, "missing frontmatter end fence"
    return text[4:end], text[end + 5 :]


def _load_frontmatter(text: str) -> dict:
    front, _ = _split_frontmatter(text)
    data = yaml.safe_load(front)
    assert isinstance(data, dict), "frontmatter is not a YAML mapping"
    return data


def _schema_violations(data: dict) -> list[str]:
    """Frontmatter keys outside the frozen v6 schema, sorted."""
    return sorted(key for key in data if key not in FROZEN_FRONTMATTER_KEYS)


def _slash_invocations(text: str) -> list[str]:
    """Every `/name` prose invocation in the text, in order of appearance."""
    return [m.group(1) for m in _SLASH_INVOCATION_PATTERN.finditer(text)]


def _is_builtin_slash_command(target: str) -> bool:
    """True for a Claude Code builtin that is not also a shipped skill name."""
    return target in BUILTIN_SLASH_COMMANDS and target not in SKILL_NAMES


def _line_budget(name: str) -> int:
    return PERMANENT_LINE_BUDGET.get(name, HARD_LINE_CAP)


def _markdown_files(skill_dir: Path) -> list[Path]:
    """Every markdown file shipped inside a skill directory, SKILL.md first."""
    return sorted(skill_dir.rglob("*.md"), key=lambda p: (p.name != "SKILL.md", str(p)))


def _deep_link_violations(text: str, self_name: str) -> list[str]:
    """Paths reaching into another shipped skill's directory (schema §5.2)."""
    return sorted(
        {
            match.group(0)
            for match in _DEEP_LINK_PATTERN.finditer(text)
            if match.group(1) in SKILL_NAMES and match.group(1) != self_name
        }
    )


def _classify_slash_targets(source: str, text: str) -> list[tuple[str, str, str]]:
    """Slash targets in one skill's prose, tagged INVOCATION or ROUTER_INDEX.

    Line-based so a Skill Map row can be recognized by its leading cell. Only that
    leading cell earns ROUTER_INDEX; every other slash token on the line is a
    normal invocation.
    """
    refs = []
    in_skill_map = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_skill_map = line.strip() == SKILL_MAP_HEADING
        row = _ROUTER_ROW_PATTERN.match(line) if in_skill_map and source == ROUTER_SKILL else None
        if row:
            refs.append((source, "ROUTER_INDEX", row.group(1)))
            line = line[row.end() :]
        for target in _slash_invocations(line):
            if _is_builtin_slash_command(target):
                continue
            refs.append((source, "INVOCATION", target))
    return refs


def _collect_cross_references() -> list[tuple[str, str, str]]:
    """(source, ref_type, target) triples — legacy uses arc-* markers, v6 uses `/name`."""
    refs = []
    for skill_dir in SKILL_DIRS:
        text = _read(skill_dir)
        if _is_legacy(skill_dir.name):
            for line in text.splitlines():
                for match in _CROSS_REF_PATTERN.finditer(line):
                    ref_type = "SUB-SKILL" if "SUB-SKILL" in line else "BACKGROUND"
                    refs.append((skill_dir.name, ref_type, match.group(1)))
        else:
            refs.extend(_classify_slash_targets(skill_dir.name, text))
    return refs


CROSS_REFS = _collect_cross_references()


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_frontmatter_valid(skill_dir):
    """Frontmatter parses as YAML, name == dirname, description present (<1024 combined)."""
    data = _load_frontmatter(_read(skill_dir))

    assert data.get("name") == skill_dir.name, (
        f"frontmatter name {data.get('name')!r} != directory {skill_dir.name!r}"
    )
    description = data.get("description")
    assert isinstance(description, str) and description.strip(), "description missing or empty"
    combined = len(f"{data['name']}{description}")
    assert combined < 1024, f"name+description is {combined} chars (>= 1024)"


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_frontmatter_schema_frozen(skill_dir):
    """Non-legacy skills declare only frozen-schema frontmatter keys."""
    if _is_legacy(skill_dir.name):
        pytest.skip("grandfathered via docs/plans/v6/legacy-skills.json")

    violations = _schema_violations(_load_frontmatter(_read(skill_dir)))
    assert not violations, (
        f"{skill_dir.name} declares frontmatter keys outside the frozen schema: {violations} "
        f"(allowed: {sorted(FROZEN_FRONTMATTER_KEYS)})"
    )


def _is_dmi(data: dict) -> bool:
    """True when the skill is flagged user-invoked-only (disable-model-invocation)."""
    value = data.get("disable-model-invocation")
    return value is True or (isinstance(value, str) and value.strip().lower() == "true")


def _invokes_user_invoked(ref_type: str, target_frontmatter: dict) -> bool:
    """True when a cross-reference calls a user-invoked skill (schema §3.1 violation).

    ROUTER_INDEX rows are indexing, not calling, so they never violate.
    """
    return ref_type == "INVOCATION" and _is_dmi(target_frontmatter)


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_description_register(skill_dir):
    """Description obeys its register: user-invoked (DMI) plain <=120 with no trigger
    list; model-invoked <=280 and a non-trivial 'Use when' trigger."""
    data = _load_frontmatter(_read(skill_dir))
    description = data["description"]

    if _is_dmi(data):
        assert len(description) <= USER_DESC_MAX, (
            f"{skill_dir.name} is user-invoked (disable-model-invocation) but its "
            f"description is {len(description)} chars (> {USER_DESC_MAX}); drop trigger prose"
        )
        assert "use when" not in description.lower(), (
            f"{skill_dir.name} is user-invoked but its description carries a 'Use when' "
            f"trigger list — user-invoked descriptions are plain human-facing one-liners"
        )
    else:
        assert len(description) <= MODEL_DESC_MAX, (
            f"{skill_dir.name} model-invoked description is {len(description)} chars "
            f"(> {MODEL_DESC_MAX})"
        )
        assert len(description) >= MODEL_DESC_MIN and "use when" in description.lower(), (
            f"{skill_dir.name} model-invoked description must be a non-trivial "
            f"'<identity>. Use when <triggers>' clause"
        )


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_has_section_and_body(skill_dir):
    """Every skill has at least one '## ' section heading and a non-empty body."""
    _, body = _split_frontmatter(_read(skill_dir))
    assert body.strip(), "skill body is empty"
    assert re.search(r"(?m)^## ", body), "skill has no '## ' section heading"


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_referenced_supporting_files_exist(skill_dir):
    """Every references/scripts/templates/agents pointer resolves.

    Legacy skills may still resolve against the repo root; v6 skills may not
    (schema §5.3 + §7 gap 2, closed in P3). A v6 skill is a closed unit, so a
    pointer that only resolves at the repo root is reaching outside itself —
    exactly what the repo-root fallback used to let through.
    """
    local_only = not _is_legacy(skill_dir.name)
    missing = []
    for match in _SUPPORTING_FILE_PATTERN.finditer(_read(skill_dir)):
        rel = match.group(0)
        if (skill_dir / rel).exists():
            continue
        if not local_only and (PROJECT_ROOT / rel).exists():
            continue
        missing.append(rel)
    assert not missing, (
        f"{skill_dir.name} references supporting files that do not resolve"
        f"{' inside the skill directory' if local_only else ''}: {sorted(set(missing))}"
    )


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_no_cross_skill_deep_links(skill_dir):
    """No markdown in a v6 skill links into another skill's directory (schema §5.2).

    Scans every markdown file under the skill, not just SKILL.md: a deep link is
    most likely to appear in a `references/*.md`, so a SKILL.md-only guard would
    have a hole exactly where the risk lives.
    """
    if _is_legacy(skill_dir.name):
        pytest.skip("grandfathered via docs/plans/v6/legacy-skills.json")

    offenders = {}
    for md in _markdown_files(skill_dir):
        found = _deep_link_violations(md.read_text(encoding="utf-8"), skill_dir.name)
        if found:
            offenders[str(md.relative_to(skill_dir))] = found
    assert not offenders, (
        f"{skill_dir.name} deep-links into another skill's directory: {offenders} — "
        f"wanting another skill's files means wanting that skill; invoke it with `/name`"
    )


@pytest.mark.parametrize("skill_dir", SKILL_DIRS, ids=lambda d: d.name)
def test_line_budget(skill_dir):
    """SKILL.md body stays within its hard cap; over the soft cap emits a warning.

    Counts body lines only — frontmatter is declarative metadata, not the prose the
    budget governs.
    """
    _, body = _split_frontmatter(_read(skill_dir))
    lines = body.count("\n")
    limit = _line_budget(skill_dir.name)
    assert lines <= limit, f"{skill_dir.name} SKILL.md is {lines} lines (hard cap {limit})"
    if lines > SOFT_LINE_CAP:
        warnings.warn(
            f"{skill_dir.name} SKILL.md is {lines} lines (> soft cap {SOFT_LINE_CAP})",
            stacklevel=2,
        )


@pytest.mark.parametrize(
    "source,ref_type,target",
    CROSS_REFS,
    ids=[f"{s}->{t}" for s, _, t in CROSS_REFS],
)
def test_cross_reference_resolves(source, ref_type, target):
    """Every cross-skill pointer (legacy REQUIRED marker or v6 `/name`) resolves."""
    assert target in SKILL_NAMES, (
        f"{source} has {ref_type} reference to '{target}' "
        f"but no {SKILLS_DIR.name}/{target}/SKILL.md exists under {SKILLS_DIR}"
    )


@pytest.mark.parametrize(
    "source,ref_type,target",
    CROSS_REFS,
    ids=[f"{s}->{t}" for s, _, t in CROSS_REFS],
)
def test_user_invoked_skills_are_not_prose_invoked(source, ref_type, target):
    """A user-invoked skill is an explicit-intent entry point (schema §3.1).

    Another skill's prose calling `/name` on it routes around the gate the flag
    exists to create. The router's Skill Map is exempt (ROUTER_INDEX): that table
    indexes the skill set, it does not call into it.
    """
    if ref_type != "INVOCATION" or target not in SKILL_NAMES:
        pytest.skip("not a v6 prose invocation of a shipped skill")

    assert not _invokes_user_invoked(ref_type, _load_frontmatter(_read(SKILLS_DIR / target))), (
        f"{source} prose-invokes /{target}, which is user-invoked "
        f"(disable-model-invocation) — a user-invoked skill is reached by the user "
        f"typing its slash command, never by another skill's text"
    )


def test_cross_references_found():
    """Sanity floor: cross-reference scan actually found references to validate."""
    assert len(CROSS_REFS) >= 3, (
        f"expected >= 3 cross-references across all skills, found {len(CROSS_REFS)}"
    )


# --- Ratchet -----------------------------------------------------------------


def test_legacy_entries_still_exist():
    """Every legacy entry names a live skill — deleting a skill must prune the list."""
    dangling = sorted(name for name in LEGACY_SKILLS if not (SKILLS_DIR / name / "SKILL.md").exists())
    assert not dangling, (
        f"docs/plans/v6/legacy-skills.json lists skills that no longer exist: {dangling} — "
        f"prune them in the same commit that deletes or rewrites the skill"
    )


def test_legacy_list_only_shrinks():
    """The grandfather list is monotonic: no new skill may buy an exemption."""
    assert len(LEGACY_SKILLS) <= LEGACY_BASELINE, (
        f"legacy list grew to {len(LEGACY_SKILLS)} (baseline {LEGACY_BASELINE}) — new skills "
        f"must satisfy the frozen schema, not join the grandfather list"
    )


def test_skill_scan_floor():
    """Sanity floor: a broken glob must not silently pass the whole suite."""
    assert len(SKILL_DIRS) > MIN_SKILL_COUNT, (
        f"discovered only {len(SKILL_DIRS)} skills under {SKILLS_DIR} "
        f"(floor {MIN_SKILL_COUNT}) — the discovery glob is probably broken"
    )


def test_skill_scan_matches_expected_count():
    """The scan sees the whole shipped set — a glob that half-broke is still broken."""
    assert len(SKILL_DIRS) == EXPECTED_SKILL_COUNT, (
        f"discovered {len(SKILL_DIRS)} skills under {SKILLS_DIR}, expected "
        f"{EXPECTED_SKILL_COUNT}: {sorted(d.name for d in SKILL_DIRS)} — either the "
        f"discovery glob broke or the shipped skill set changed without updating "
        f"EXPECTED_SKILL_COUNT in the same commit"
    )


def test_permanent_budget_is_legacy_only():
    """Line budget exceptions exist for legacy skills only — never for a v6 skill."""
    non_legacy = sorted(name for name in PERMANENT_LINE_BUDGET if not _is_legacy(name))
    assert not non_legacy, (
        f"PERMANENT_LINE_BUDGET opens exceptions for non-legacy skills: {non_legacy} — "
        f"v6 skills live within the {HARD_LINE_CAP}-line hard cap"
    )


# --- Helper coverage ---------------------------------------------------------
# While every shipped skill is still legacy, the v6 assertions above are vacuous.
# These pin the predicates and parsers they depend on.


def test_is_legacy_discriminates():
    """The grandfather predicate reads the manifest, not the shipped skill set."""
    # Read the positive case out of the manifest rather than naming a skill:
    # a hardcoded name turns this test red the phase that skill is rewritten,
    # which is noise, not a finding. The manifest empties by the end of P6.
    for name in LEGACY_SKILLS:
        assert _is_legacy(name) is True
    # `tdd` ships and is absent from the manifest — the predicate must not
    # infer legacy status from a directory merely existing.
    assert _is_legacy("tdd") is False
    assert _is_legacy("not-a-shipped-skill") is False


def test_schema_violations_rejects_v5_fields():
    """The frozen schema accepts only its five keys and names every offender."""
    assert _schema_violations({"name": "tdd", "description": "d"}) == []
    assert (
        _schema_violations(
            {
                "name": "tdd",
                "description": "d",
                "disable-model-invocation": True,
                "argument-hint": "[path]",
                "allowed-tools": "Read",
            }
        )
        == []
    )
    assert _schema_violations(
        {"name": "tdd", "description": "d", "category": "discipline", "status": "promoted"}
    ) == ["category", "status"]


def test_slash_invocations_match_prose_calls():
    """`/name` invocations parse, backticked or bare, at line start or mid-sentence."""
    assert _slash_invocations("Run `/tdd` first.") == ["tdd"]
    assert _slash_invocations("/code-review\nthen /finishing.") == ["code-review", "finishing"]


def test_slash_invocations_resolve_plugin_namespace():
    """The plugin-namespaced form resolves to the bare skill name."""
    assert _slash_invocations("Run `/arcforge:tdd` now.") == ["tdd"]


def test_slash_invocations_ignore_path_shaped_slashes():
    """Paths, dates, or-slashes, and XML closing tags are not invocations."""
    noise = (
        "See references/foo.md and skills/tdd/SKILL.md\n"
        "Write to /usr/local/bin, dated 2026/07/31.\n"
        "Use ${SKILL_ROOT}/scripts/run.sh for and/or cases.\n"
        "The schema is <delta><reason>x</reason></delta>.\n"
    )
    assert _slash_invocations(noise) == []


def _router_doc(rows: list[str], tail: str = "") -> str:
    """A minimal router document with a Skill Map table, for classifier fixtures."""
    header = ["# R", "", SKILL_MAP_HEADING, "", "| Skill | Use when |", "| --- | --- |"]
    return "\n".join([*header, *rows, "", tail])


def test_router_index_rows_are_not_invocations():
    """A Skill Map row indexes a skill; it does not invoke it (schema §3.1 exemption)."""
    doc = _router_doc(["| `/writing-skills` | authoring a skill (user-invoked) |"])
    assert _classify_slash_targets(ROUTER_SKILL, doc) == [
        (ROUTER_SKILL, "ROUTER_INDEX", "writing-skills")
    ]


def test_router_exemption_stops_at_the_skill_map():
    """Outside the Skill Map section the router's own slash calls stay invocations."""
    doc = _router_doc(["| `/tdd` | tests |"], tail="## Notes\n\nThen run /writing-skills.\n")
    assert _classify_slash_targets(ROUTER_SKILL, doc) == [
        (ROUTER_SKILL, "ROUTER_INDEX", "tdd"),
        (ROUTER_SKILL, "INVOCATION", "writing-skills"),
    ]


def test_router_exemption_covers_only_the_leading_cell():
    """A slash target in a row's later cell is a call, not an index entry."""
    doc = _router_doc(["| `/tdd` | after /writing-skills lands |"])
    assert _classify_slash_targets(ROUTER_SKILL, doc) == [
        (ROUTER_SKILL, "ROUTER_INDEX", "tdd"),
        (ROUTER_SKILL, "INVOCATION", "writing-skills"),
    ]


def test_router_exemption_does_not_leak_to_other_skills():
    """The same table shape in a non-router skill earns no exemption."""
    doc = _router_doc(["| `/writing-skills` | authoring |"])
    assert _classify_slash_targets("tdd", doc) == [("tdd", "INVOCATION", "writing-skills")]


def test_invokes_user_invoked_discriminates():
    """§3.1 fires on an invocation of a user-invoked target and nothing else."""
    user_invoked = {"name": "writing-skills", "disable-model-invocation": True}
    model_invoked = {"name": "tdd"}
    assert _invokes_user_invoked("INVOCATION", user_invoked) is True
    assert _invokes_user_invoked("INVOCATION", model_invoked) is False
    assert _invokes_user_invoked("ROUTER_INDEX", user_invoked) is False
    # The flag is legal as the YAML string "true" (schema §2), so it must count.
    assert _invokes_user_invoked("INVOCATION", {"disable-model-invocation": "true"}) is True


def test_deep_link_violations_flag_other_skill_paths():
    """Both spellings the schema names are caught, by skill name (schema §5.2)."""
    text = "Read skills/tdd/references/examples.md and ../finishing/SKILL.md."
    assert _deep_link_violations(text, "writing-skills") == ["../finishing/", "skills/tdd/"]


def test_deep_link_violations_see_through_the_bucket_segment():
    """The canonical P6.5 spelling resolves to the skill, not to the bucket."""
    text = "Read skills/core/tdd/references/examples.md."
    assert _deep_link_violations(text, "writing-skills") == ["skills/core/tdd/"]
    # ...and a pointer at the skill's OWN dir is still not a boundary crossing.
    assert _deep_link_violations(text, "tdd") == []


def test_deep_link_violations_allow_self_and_local_paths():
    """A skill's own directory, its local references, and unrelated paths are fine."""
    text = (
        "See references/examples.md and scripts/run.sh.\n"
        "This file lives at skills/tdd/SKILL.md; siblings are ../references/x.md.\n"
        "Unrelated: src/parser/index.js, docs/guide/eval-system.md.\n"
    )
    assert _deep_link_violations(text, "tdd") == []


def test_builtin_slash_commands_are_not_cross_references():
    """Claude Code builtins are filtered — but never at the cost of a real skill."""
    assert _is_builtin_slash_command("compact") is True
    assert _is_builtin_slash_command("review") is True
    assert _is_builtin_slash_command("tdd") is False
    shadowed = sorted(BUILTIN_SLASH_COMMANDS & SKILL_NAMES)
    assert not [b for b in shadowed if _is_builtin_slash_command(b)], (
        f"a shipped skill shares a builtin name and must still be validated: {shadowed}"
    )
