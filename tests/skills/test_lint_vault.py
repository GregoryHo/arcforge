"""Contract test for maintaining-obsidian's LINT script — schema, scope, tags, log, titles, thresholds.

Runs `references/lint_vault.py --json` the way the skill runs it (a subprocess) on
the fixture vault from lint_vault_support and asserts the facts it reports. The
link graph and Raw Source provenance are covered by test_vault_links.py.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from .lint_vault_support import (
    SCRIPT,
    SCHEMA,
    GAMMA,
    PRESETS,
    GENERIC_SOURCE,
    PAPER_SOURCE,
    _run,
    _pair,
)


def test_scans_only_notes_and_reads_declared_types(vault):
    report = _run(vault)
    assert report["notes"] == {"total": 3, "raw_sources": 0, "in_scope": 3}
    assert report["schema"] == {
        "path": "SCHEMA.md",
        "declared_types": ["entity", "source"],
        "declared_tags": ["arcforge", "entity"],
    }
    assert report["untyped"] == []


def test_block_list_frontmatter_reads_as_filled(vault):
    tags = _run(vault)["types"]["source"]["fields"]["tags"]
    assert tags == {"expected": 2, "present": 2, "filled": 2, "empty": 0, "empty_pct": 0.0, "exceeds": None}


def test_comment_lines_inside_a_block_are_not_items(vault):
    (vault / "Wiki" / "delta-note.md").write_text(
        "---\ntype: source\ntags:\n  # grouping\n  - project\nsource_author:\n  # none yet\n---\nbody\n",
        encoding="utf-8",
    )
    report = _run(vault)
    assert report["tags"]["project"]["count"] == 1
    assert not any(t.startswith("#") or t.startswith("- ") for t in report["tags"])
    assert report["types"]["source"]["fields"]["source_author"]["filled"] == 0


def test_unindented_block_list_reads_as_filled(vault):
    # Valid YAML: sequence items at column 0 under the key (PyYAML reads a list).
    (vault / "Wiki" / "delta-note.md").write_text(
        "---\ntype: source\ntitle: Delta\ntags:\n- arcforge\n- tdd\n---\nbody\n",
        encoding="utf-8",
    )
    tags = _run(vault)["types"]["source"]["fields"]["tags"]
    assert tags == {"expected": 3, "present": 3, "filled": 3, "empty": 0, "empty_pct": 0.0, "exceeds": None}


def test_undeclared_fields_are_counted_against_schema(vault):
    entity = _run(vault)["types"]["entity"]
    assert entity["declared"] == ["aliases", "created", "tags", "type"]
    assert entity["variants"] == 1
    assert entity["undeclared"] == {"extra_field": {"present": 1, "present_pct": 100.0, "exceeds": None}}


def test_audit_reports_are_never_scope_subjects(vault):
    reports = vault / "_audits"
    reports.mkdir()
    report = reports / "audit-2026-05-09-all.md"
    report.write_text("---\ntype: audit-report\ncreated: 2026-05-09\n---\n# Audit\n", encoding="utf-8")
    newest = max(p.stat().st_mtime for p in (vault / "Wiki").iterdir()) + 10
    os.utime(report, (newest, newest))
    result = _run(vault, "--scope", "recent:1")
    assert result["notes"] == {"total": 3, "raw_sources": 0, "in_scope": 1}
    assert "audit-report" not in result["types"]


def test_log_entries_naming_missing_files(vault):
    log = _run(vault)["log"]
    assert log["entries"] == 3
    assert log["missing_files"] == [{"line": 4, "file": "Wiki/deleted-note.md"}]


def test_fenced_examples_under_the_taxonomy_declare_nothing(vault):
    schema = vault / "SCHEMA.md"
    schema.write_text(
        schema.read_text(encoding="utf-8").replace(
            "LINT checks:\n", "Example of a bad entry:\n\n```\n- `ghost` — not a real tag\n```\n\nLINT checks:\n"
        ),
        encoding="utf-8",
    )
    (vault / "Wiki" / "gamma-orphan.md").write_text(GAMMA.replace("tags: [entity, entity/tool, tdd]", "tags: [ghost]"), encoding="utf-8")
    report = _run(vault, "--tag-min", "1")
    assert report["schema"]["declared_tags"] == ["arcforge", "entity"]
    assert report["tags"]["ghost"] == {"count": 1, "declared": False, "exceeds": True}


def test_log_path_tokens_are_not_satisfied_by_a_basename_elsewhere(vault):
    # `Wiki/deleted-note.md` stays missing when only `Archive/deleted-note.md`
    # exists; a bare basename in the log still matches any file of that name.
    (vault / "Archive").mkdir()
    (vault / "Archive" / "deleted-note.md").write_text("---\ntype: entity\n---\nmoved\n", encoding="utf-8")
    with (vault / "log.md").open("a", encoding="utf-8") as log:
        log.write("## [2026-05-09] create | entity | deleted-note.md\n")
        log.write("## [2026-05-10] ingest | raw | Raw/recording.mp3\n")
        log.write("## [2026-05-11] schema | bump to v1.2\n")
        log.write("## [2026-05-12] create | entity | Wiki/My Note.md\n")
        log.write("## [2026-05-13] query | summarize Wiki/alpha-note.md and Wiki/gone.md\n")
        log.write("## [2026-05-14] schema | updated SCHEMA.md\n")
        log.write("## [2026-05-15] create | entity | ./My Root Note.md\n")
    report = _run(vault)["log"]
    assert report["entries"] == 10
    assert report["missing_files"] == [
        {"line": 4, "file": "Wiki/deleted-note.md"},
        {"line": 7, "file": "Raw/recording.mp3"},
        {"line": 9, "file": "Wiki/My Note.md"},
        {"line": 12, "file": "./My Root Note.md"},
    ]


def test_tag_counts_and_taxonomy_membership(vault):
    tags = _run(vault)["tags"]
    assert {tag: facts["count"] for tag, facts in tags.items()} == {
        "arcforge": 2,
        "entity": 1,
        "entity/tool": 1,
        "tdd": 2,
    }
    # A sub-tag is declared through its top-level segment; a bare "- Unknown top-level
    # tags → flag." line under the taxonomy heading is not a tag.
    assert {tag: facts["declared"] for tag, facts in tags.items()} == {
        "arcforge": True,
        "entity": True,
        "entity/tool": True,
        "tdd": False,
    }


def test_duplicate_title_candidates_carry_a_ratio(vault):
    pair = _pair(_run(vault), "Wiki/alpha-note.md", "Wiki/alpha-note-draft.md")
    assert 0.6 <= pair["ratio"] < 1.0
    assert pair["exceeds"] is None


def test_threshold_flags_set_exceeds(vault):
    report = _run(vault, "--title-match", "0.7", "--field-empty-pct", "90", "--tag-min", "2")
    assert report["thresholds"] == {
        "field_empty_pct": 90.0,
        "undeclared_pct": None,
        "tag_min": 2,
        "title_match": 0.7,
    }
    assert _pair(report, "Wiki/alpha-note.md", "Wiki/alpha-note-draft.md")["exceeds"] is True
    assert report["types"]["source"]["fields"]["source_author"]["exceeds"] is True
    assert report["types"]["source"]["fields"]["tags"]["exceeds"] is False
    # --tag-min flags a tag outside the taxonomy only: `arcforge` is declared and
    # sits at the threshold, `tdd` is undeclared at the same count.
    assert report["tags"]["arcforge"] == {"count": 2, "declared": True, "exceeds": False}
    assert report["tags"]["tdd"] == {"count": 2, "declared": False, "exceeds": True}
    assert report["tags"]["entity/tool"]["exceeds"] is False


def test_recent_scope_limits_subjects_but_not_the_graph(vault):
    draft = vault / "Wiki" / "alpha-note-draft.md"
    newest = max(p.stat().st_mtime for p in (vault / "Wiki").iterdir()) + 10
    os.utime(draft, (newest, newest))
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(vault), "--scope", "recent:1", "--json"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    report = json.loads(proc.stdout)
    assert report["notes"] == {"total": 3, "raw_sources": 0, "in_scope": 1}
    assert list(report["links"]["notes"]) == ["Wiki/alpha-note-draft.md"]
    assert report["links"]["notes"]["Wiki/alpha-note-draft.md"]["inbound"] == 1


def test_skip_drops_a_folder_and_bad_scope_is_rejected(vault):
    report = _run(vault, "--skip", "Wiki")
    assert report["notes"] == {"total": 0, "raw_sources": 0, "in_scope": 0}
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(vault), "--scope", "latest"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode != 0
    assert "scope must be" in proc.stderr


@pytest.mark.parametrize("preset,type_name", [("llm-wiki", "source"), ("news", "article")])
def test_preset_source_types_declare_the_provenance_pair(tmp_path, preset, type_name):
    # obsidian.md B-4: the typed note carries source_url and sha256; a preset whose
    # schema omits sha256 makes every conformant note an undeclared-field finding.
    (tmp_path / "SCHEMA.md").write_text((PRESETS / preset / "SCHEMA.md").read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    (tmp_path / "note.md").write_text(
        f"---\ntype: {type_name}\nsource_url: https://example.com/x\nsha256: {'0' * 64}\n---\nbody\n",
        encoding="utf-8",
    )
    undeclared = _run(tmp_path)["types"][type_name]["undeclared"]
    assert "sha256" not in undeclared and "source_url" not in undeclared


@pytest.mark.parametrize(
    "preset,type_name,tag",
    [("llm-wiki", "entity", "entity/model"), ("news", "article", "region/us"), ("project-tracker", "task", "area/infra")],
)
def test_preset_taxonomies_declare_their_top_level_tags(tmp_path, preset, type_name, tag):
    (tmp_path / "SCHEMA.md").write_text((PRESETS / preset / "SCHEMA.md").read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    (tmp_path / "note.md").write_text(
        f"---\ntype: {type_name}\ntags: [{tag}, made-up]\n---\nbody\n", encoding="utf-8"
    )
    report = _run(tmp_path, "--tag-min", "1")
    assert tag.split("/")[0] in report["schema"]["declared_tags"]
    assert report["tags"][tag] == {"count": 1, "declared": True, "exceeds": False}
    assert report["tags"]["made-up"] == {"count": 1, "declared": False, "exceeds": True}


def test_variant_only_fields_are_expected_of_the_notes_fitting_that_variant(tmp_path):
    # llm-wiki declares Source twice — the generic fence and the Paper variant —
    # both as `type: source`. Paper-only fields are measured over the notes that
    # fit the Paper variant, not reported 100% empty across every Source.
    (tmp_path / "SCHEMA.md").write_text((PRESETS / "llm-wiki" / "SCHEMA.md").read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    for n in range(3):
        (tmp_path / f"source-{n}.md").write_text(GENERIC_SOURCE.format(n=n, digest="0" * 64), encoding="utf-8")
    (tmp_path / "paper.md").write_text(PAPER_SOURCE.format(digest="1" * 64), encoding="utf-8")
    source = _run(tmp_path, "--field-empty-pct", "90")["types"]["source"]
    assert source["notes"] == 4 and source["variants"] == 2 and source["variant_notes"] == [3, 1]
    assert source["undeclared"] == {}
    fields = source["fields"]
    assert fields["source_author"]["expected"] == 4 and fields["sha256"]["expected"] == 4
    assert fields["venue"] == {"expected": 1, "present": 1, "filled": 1, "empty": 0, "empty_pct": 0.0, "exceeds": False}
    assert fields["methodology"] == {"expected": 1, "present": 1, "filled": 0, "empty": 1, "empty_pct": 100.0, "exceeds": True}
    assert fields["cites"]["exceeds"] is True  # the paper's own empty list, over one expected note
    # A generic Source that carries a paper-only field anyway is counted for it.
    (tmp_path / "source-0.md").write_text(
        GENERIC_SOURCE.format(n=0, digest="0" * 64).replace("aliases: []", "aliases: []\nvenue: Blog"),
        encoding="utf-8",
    )
    fields = _run(tmp_path)["types"]["source"]["fields"]
    assert fields["venue"] == {"expected": 2, "present": 2, "filled": 2, "empty": 0, "empty_pct": 0.0, "exceeds": None}


def test_paper_missing_every_paper_field_still_fits_the_paper_variant(tmp_path):
    # By keys alone a malformed paper is a generic Source; the Paper fence's
    # `tags: [paper]` is its discriminator, so the missing fields are expected.
    (tmp_path / "SCHEMA.md").write_text((PRESETS / "llm-wiki" / "SCHEMA.md").read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    (tmp_path / "source-0.md").write_text(GENERIC_SOURCE.format(n=0, digest="0" * 64), encoding="utf-8")
    (tmp_path / "malformed-paper.md").write_text(
        GENERIC_SOURCE.format(n=1, digest="1" * 64).replace("tags: [source]", "tags: [source/paper]"),
        encoding="utf-8",
    )
    source = _run(tmp_path, "--field-empty-pct", "90")["types"]["source"]
    assert source["variant_notes"] == [1, 1]
    assert source["fields"]["venue"] == {"expected": 1, "present": 0, "filled": 0, "empty": 1, "empty_pct": 100.0, "exceeds": True}
    assert source["fields"]["source_author"]["expected"] == 2


def test_single_type_universal_fence_is_a_base_not_a_variant(tmp_path):
    # A vault with one type: the universal fence says `type: book` too, so by name
    # count alone it would be a second variant and a Book missing `created` or
    # `tags` would never be reported.
    (tmp_path / "SCHEMA.md").write_text(
        "# Schema\n\n## Universal Frontmatter\n\n```yaml\n---\ntype: book\ncreated: YYYY-MM-DD\ntags: []\n---\n```\n\n"
        "## Book\n\n```yaml\n---\ntype: book\nauthor: \"\"\n---\n```\n",
        encoding="utf-8",
    )
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    (tmp_path / "dune.md").write_text("---\ntype: book\nauthor: Herbert\n---\nbody\n", encoding="utf-8")
    book = _run(tmp_path)["types"]["book"]
    assert book["variants"] == 1 and book["declared"] == ["author", "created", "tags", "type"]
    assert book["fields"]["created"] == {"expected": 1, "present": 0, "filled": 0, "empty": 1, "empty_pct": 100.0, "exceeds": None}
    assert book["fields"]["tags"]["empty"] == 1


def test_variant_fences_under_subheadings_keep_their_type_section(tmp_path):
    # `## Source` / `### Frontmatter` and `## Source — Paper Variant` /
    # `### Frontmatter`: the enclosing section names the type, so both fences
    # are variants of `source`, not a union under "Frontmatter".
    (tmp_path / "SCHEMA.md").write_text(
        "# Schema\n\n## Source\n\n### Frontmatter\n\n```yaml\n---\ntype: source\nsource_url: \"\"\n---\n```\n\n"
        "## Source — Paper Variant\n\n### Frontmatter\n\n```yaml\n---\ntype: source\nsource_url: \"\"\nvenue: \"\"\n---\n```\n",
        encoding="utf-8",
    )
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    (tmp_path / "plain.md").write_text("---\ntype: source\nsource_url: https://x/p\n---\nbody\n", encoding="utf-8")
    source = _run(tmp_path, "--field-empty-pct", "90")["types"]["source"]
    assert source["variants"] == 2 and source["variant_notes"] == [1, 0]
    assert "venue" not in source["fields"]


def test_a_heading_naming_the_type_as_a_substring_is_still_a_base(tmp_path):
    # `## Catalog defaults` contains "log" but does not name the type `log`.
    (tmp_path / "SCHEMA.md").write_text(
        "# Schema\n\n## Catalog defaults\n\n```yaml\n---\ntype: log\ncreated: YYYY-MM-DD\n---\n```\n\n"
        "## Log\n\n```yaml\n---\ntype: log\nlevel: \"\"\n---\n```\n\n"
        "## Daily Aggregate\n\n```yaml\n---\ntype: daily-aggregate\nday: \"\"\n---\n```\n",
        encoding="utf-8",
    )
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    (tmp_path / "entry.md").write_text("---\ntype: log\nlevel: info\n---\nbody\n", encoding="utf-8")
    (tmp_path / "day.md").write_text("---\ntype: daily-aggregate\nday: 2026-05-06\n---\nbody\n", encoding="utf-8")
    types = _run(tmp_path)["types"]
    assert types["log"]["variants"] == 1 and types["log"]["fields"]["created"]["empty"] == 1
    assert types["daily-aggregate"]["variants"] == 1


def test_minimal_preset_placeholders_declare_no_types_or_tags(tmp_path):
    # The minimal SCHEMA.md declares no types: its universal fence carries the
    # placeholder `<one of the types declared below>` and its `type: typename`
    # skeleton sits inside an illustration fence.
    (tmp_path / "SCHEMA.md").write_text((PRESETS / "minimal" / "SCHEMA.md").read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    (tmp_path / "note.md").write_text("---\ntype: typename\ntags: [x]\n---\nbody\n", encoding="utf-8")
    report = _run(tmp_path)
    assert report["schema"] == {"path": "SCHEMA.md", "declared_types": [], "declared_tags": []}
    assert report["types"]["typename"]["declared"] is None
    # A real type added after the illustration is read: the illustration's closer
    # does not open a fence that swallows the rest of the file.
    with (tmp_path / "SCHEMA.md").open("a", encoding="utf-8") as schema:
        schema.write("\n## Book\n\n```yaml\n---\ntype: book\nauthor: \"\"\n---\n```\n")
    report = _run(tmp_path)
    assert report["schema"]["declared_types"] == ["book"]
    assert report["types"]["typename"]["declared"] is None
    # A fence indented four spaces is an indented code block, and a fence inside
    # a callout is an illustration: neither declares.
    with (tmp_path / "SCHEMA.md").open("a", encoding="utf-8") as schema:
        schema.write("\nIndented example:\n\n    ```yaml\n    type: ghost\n    ```\n")
        schema.write("\n> [!example]\n> ```yaml\n> type: ghost\n> ```\n")
    assert _run(tmp_path)["schema"]["declared_types"] == ["book"]

