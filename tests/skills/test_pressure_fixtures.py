"""Structural validation for pressure scenario fixtures.

These fixtures live at tests/skills/pressure/ and are MANUAL regression tests
that require spawning a subagent to execute. Pytest doesn't run them, but we
do verify their shape so accidents (truncation, missing sections, renamed
required headings) fail CI before they rot.

The content of each scenario — the actual prompt, baseline output, treatment
output — is a frozen record of what happened on a specific date. Updating it
is deliberate; regenerating it requires re-running the scenario against a
subagent. See tests/skills/pressure/README.md for the workflow.
"""

from pathlib import Path

PRESSURE_DIR = Path(__file__).parent / "pressure"

REQUIRED_SECTIONS = [
    "## Prompt (paste into a subagent)",
    "## Pass criteria",
    "## Frozen baseline output",
    "## Frozen treatment output",
    "## Verdict",
]

REQUIRED_METADATA_FIELDS = [
    "**Skill under test**",
    "**Invariant**",
    "**Status**",
    "**Last captured**",
]


def _scenario_files() -> list[Path]:
    """Return every scenario file under tests/skills/pressure/ (excluding README)."""
    return sorted(
        f for f in PRESSURE_DIR.glob("*.md") if f.name.lower() != "readme.md"
    )


def test_pressure_directory_exists():
    """The pressure directory must exist and contain at least one scenario."""
    assert PRESSURE_DIR.is_dir(), f"missing pressure scenario directory: {PRESSURE_DIR}"
    assert (PRESSURE_DIR / "README.md").is_file(), "pressure directory needs a README.md"
    assert _scenario_files(), "pressure directory has no scenario files"


def test_each_scenario_has_required_sections():
    """Every scenario file must contain the standard section headings.

    The sections are the contract: a reviewer opening any scenario file should
    immediately find the prompt, the pass criteria, the frozen outputs, and
    the verdict. If someone edits a scenario and drops a section, this test
    catches it.
    """
    for scenario in _scenario_files():
        text = scenario.read_text(encoding="utf-8")
        missing = [s for s in REQUIRED_SECTIONS if s not in text]
        assert not missing, f"{scenario.name} missing sections: {missing}"


def test_each_scenario_has_metadata_header():
    """Every scenario must start with a metadata table naming the skill under test."""
    for scenario in _scenario_files():
        text = scenario.read_text(encoding="utf-8")
        missing = [m for m in REQUIRED_METADATA_FIELDS if m not in text]
        assert not missing, f"{scenario.name} missing metadata fields: {missing}"


def test_each_scenario_has_pass_criteria_table():
    """The pass criteria must be a markdown table so assertions are scannable."""
    for scenario in _scenario_files():
        text = scenario.read_text(encoding="utf-8")
        pass_criteria_index = text.find("## Pass criteria")
        assert pass_criteria_index >= 0, f"{scenario.name} has no Pass criteria section"

        # The next markdown table after "## Pass criteria" must exist before the
        # next h2. This catches someone replacing the table with prose.
        next_h2 = text.find("\n## ", pass_criteria_index + len("## Pass criteria"))
        section_body = text[pass_criteria_index:next_h2 if next_h2 > 0 else len(text)]
        assert "| #" in section_body or "|---" in section_body, (
            f"{scenario.name} Pass criteria section lost its table format"
        )


def test_scenario_names_match_inventory_in_readme():
    """The README's inventory table must list every scenario file.

    This prevents the two from drifting — if you add a scenario, you must
    register it in the README so future readers can find it.
    """
    readme = (PRESSURE_DIR / "README.md").read_text(encoding="utf-8")
    for scenario in _scenario_files():
        assert scenario.name in readme, (
            f"{scenario.name} exists but is not listed in pressure/README.md inventory"
        )


def test_scenarios_name_the_frozen_capture_date():
    """Every frozen output section should carry the capture date in parentheses.

    This is a lightweight way to spot stale scenarios — the date tells a future
    reader when the behavior was last verified, not just when the file was
    written.
    """
    for scenario in _scenario_files():
        text = scenario.read_text(encoding="utf-8")
        assert "Frozen baseline output (" in text, (
            f"{scenario.name} baseline output is missing a capture date"
        )
        assert "Frozen treatment output (" in text, (
            f"{scenario.name} treatment output is missing a capture date"
        )
