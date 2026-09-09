"""Contract test for maintaining-obsidian's LINT script.

Builds a tiny vault in tmp_path, runs `references/lint_vault.py --json` the way
the skill runs it (a subprocess), and asserts the facts it reports: block-list
frontmatter reads as filled, undeclared fields are counted against SCHEMA.md,
the orphan graph, sha256 drift / unhashed / unresolved provenance, log entries
naming missing files, tag counts against the taxonomy, duplicate-title
candidates, and the threshold flags.
"""

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = PROJECT_ROOT / "skills" / "core" / "maintaining-obsidian" / "references" / "lint_vault.py"

SCHEMA = """---
type: schema
created: 2026-05-06
---

# Test vault — schema

## Universal Frontmatter

```yaml
---
type: source | entity
created: YYYY-MM-DD
tags: []
---
```

## Source

```yaml
---
type: source
source_url: ""
source_author: ""          # author or organization
sha256: ""
---
```

## Entity

```yaml
---
type: entity
aliases: []
---
```

## Tag Taxonomy

- `arcforge` — project tag
- `entity` — entity notes (`entity/tool`, ...)

LINT checks:
- Unknown top-level tags → flag.

## Audit Thresholds

- Field empty in 90%+ of a type → EVOLVE candidate (`--field-empty-pct 90`).
"""

ALPHA_BODY = "# Alpha\n\nSee [[alpha-note-draft|the draft]] and ![[diagram.png]].\n"
ALPHA = (
    "---\n"
    "type: source\n"
    "created: 2026-05-06\n"
    "tags:\n"
    "  - arcforge\n"
    "  - tdd\n"
    'source_url: "https://example.com/alpha"\n'
    'source_author: ""\n'
    f'sha256: "{"0" * 64}"\n'
    "---\n"
    f"{ALPHA_BODY}"
)

DRAFT = """---
type: source
created: 2026-05-07
tags: [arcforge]
source_url: "https://example.com/alpha-draft"
sha256: ""
---
# Alpha (draft)

Supersedes [[Wiki/alpha-note]].
"""

GAMMA = """---
type: entity
created: 2026-05-08
tags: [entity, entity/tool, tdd]
aliases: []
extra_field: yes
---
# Gamma

Nothing links here and this links nowhere.
"""

LOG = """# Log

## [2026-05-06] create | source | Wiki/alpha-note.md
## [2026-05-07] create | entity | Wiki/deleted-note.md
## [2026-05-08] query | how does alpha work?
"""


@pytest.fixture
def vault(tmp_path: Path) -> Path:
    (tmp_path / "SCHEMA.md").write_text(SCHEMA, encoding="utf-8")
    (tmp_path / "AGENTS.md").write_text("# Contract\n", encoding="utf-8")
    (tmp_path / "log.md").write_text(LOG, encoding="utf-8")
    wiki = tmp_path / "Wiki"
    wiki.mkdir()
    (wiki / "alpha-note.md").write_text(ALPHA, encoding="utf-8")
    (wiki / "alpha-note-draft.md").write_text(DRAFT, encoding="utf-8")
    (wiki / "gamma-orphan.md").write_text(GAMMA, encoding="utf-8")
    return tmp_path


def _run(vault: Path, *extra: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(vault), "--scope", "all", "--json", *extra],
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def _pair(report: dict, a: str, b: str) -> dict:
    return next(d for d in report["duplicate_titles"] if {d["a"], d["b"]} == {a, b})


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


def test_unindented_block_list_reads_as_filled(vault):
    # Valid YAML: sequence items at column 0 under the key (PyYAML reads a list).
    (vault / "Wiki" / "delta-note.md").write_text(
        "---\ntype: source\ntitle: Delta\ntags:\n- arcforge\n- tdd\n---\nbody\n",
        encoding="utf-8",
    )
    tags = _run(vault)["types"]["source"]["fields"]["tags"]
    assert tags == {"expected": 3, "present": 3, "filled": 3, "empty": 0, "empty_pct": 0.0, "exceeds": None}


def test_raw_source_note_without_type_is_drift_checked_not_untyped(vault):
    raw = vault / "Raw"
    raw.mkdir()
    (raw / "article.md").write_text(
        "---\nsource_url: https://example.com/a\nsha256: " + "0" * 64 + "\n---\nraw text\n",
        encoding="utf-8",
    )
    report = _run(vault)
    assert report["untyped"] == []
    by_path = {item["path"]: item for item in report["raw_sources"]}
    assert by_path["Raw/article.md"]["status"] == "drift"


def test_undeclared_fields_are_counted_against_schema(vault):
    entity = _run(vault)["types"]["entity"]
    assert entity["declared"] == ["aliases", "created", "tags", "type"]
    assert entity["variants"] == 1
    assert entity["undeclared"] == {"extra_field": {"present": 1, "present_pct": 100.0, "exceeds": None}}


def test_orphan_graph(vault):
    links = _run(vault)["links"]
    assert links["orphans"] == ["Wiki/gamma-orphan.md"]
    assert links["notes"]["Wiki/alpha-note.md"] == {"inbound": 1, "outbound": 1}
    assert links["notes"]["Wiki/alpha-note-draft.md"] == {"inbound": 1, "outbound": 1}


def test_typed_note_with_remote_source_and_no_raw_link_is_unresolved_not_drift(vault):
    # A typed note's sha256 is the Raw Source's digest (B-4), never its own body's:
    # hashing the synthesized body would report drift on every correct ingest.
    by_path = {item["path"]: item for item in _run(vault)["raw_sources"]}
    assert by_path["Wiki/alpha-note.md"] == {
        "path": "Wiki/alpha-note.md",
        "hashed_file": None,
        "status": "unresolved",
        "stored": "0" * 64,
        "recomputed": None,
    }
    # An empty digest with nothing to backfill from is unresolved too, not unhashed.
    assert by_path["Wiki/alpha-note-draft.md"]["status"] == "unresolved"


RAW_BODY = "# Fed statement\n\nRates unchanged.\n"
RAW_DIGEST = hashlib.sha256(RAW_BODY.encode("utf-8")).hexdigest()


def _news_shaped_pair(vault: Path) -> Path:
    raw_dir = vault / "Raw" / "2026-05-06"
    raw_dir.mkdir(parents=True)
    raw = raw_dir / "bloomberg-fed.md"
    raw.write_text(
        f"---\nsource_url: https://example.com/fed\nsha256: {RAW_DIGEST}\n---\n{RAW_BODY}",
        encoding="utf-8",
    )
    (vault / "Wiki" / "fed-article.md").write_text(
        "---\ntype: source\ncreated: 2026-05-06\n"
        f"source_url: https://example.com/fed\nsha256: {RAW_DIGEST}\n---\n"
        "# Fed\n\n## Lead\nRates held.\n\n## Source\n[[Raw/2026-05-06/bloomberg-fed]] (immutable original)\n",
        encoding="utf-8",
    )
    return raw


def test_typed_note_hashes_the_raw_source_its_body_links(vault):
    raw = _news_shaped_pair(vault)
    by_path = {item["path"]: item for item in _run(vault)["raw_sources"]}
    assert by_path["Wiki/fed-article.md"] == {
        "path": "Wiki/fed-article.md",
        "hashed_file": "Raw/2026-05-06/bloomberg-fed.md",
        "status": "fresh",
        "stored": RAW_DIGEST,
        "recomputed": RAW_DIGEST,
    }
    assert by_path["Raw/2026-05-06/bloomberg-fed.md"]["status"] == "fresh"
    # A legacy empty digest on a note whose capture resolves is unhashed: backfill from it.
    (vault / "Wiki" / "fed-article-legacy.md").write_text(
        "---\ntype: source\nsource_url: https://example.com/fed\nsha256: \"\"\n---\n"
        "## Source\n[[Raw/2026-05-06/bloomberg-fed]]\n",
        encoding="utf-8",
    )
    legacy = {item["path"]: item for item in _run(vault)["raw_sources"]}["Wiki/fed-article-legacy.md"]
    assert legacy["status"] == "unhashed" and legacy["recomputed"] == RAW_DIGEST
    # --skip Raw takes the capture out of the note set, not out of the drift check.
    by_path = {item["path"]: item for item in _run(vault, "--skip", "Raw")["raw_sources"]}
    assert by_path["Wiki/fed-article.md"]["status"] == "fresh"
    # The publisher edits the article: the re-captured body drifts from the pair.
    raw.write_text(raw.read_text(encoding="utf-8") + "\nCorrection appended.\n", encoding="utf-8")
    by_path = {item["path"]: item for item in _run(vault)["raw_sources"]}
    assert by_path["Wiki/fed-article.md"]["status"] == "drift"
    assert by_path["Wiki/fed-article.md"]["hashed_file"] == "Raw/2026-05-06/bloomberg-fed.md"


def test_raw_sources_are_drift_checked_but_never_scope_subjects(vault):
    raw = vault / "Raw"
    raw.mkdir()
    (raw / "alpha-capture.md").write_text(
        "---\ntitle: Alpha\nsource_url: https://example.com/alpha\nsha256: " + "0" * 64 + "\n---\nraw text\n",
        encoding="utf-8",
    )
    newest = max(p.stat().st_mtime for p in (vault / "Wiki").iterdir()) + 10
    os.utime(raw / "alpha-capture.md", (newest, newest))
    report = _run(vault, "--scope", "recent:1")
    # The newest file is the capture, yet the one subject is a wiki note.
    assert report["notes"] == {"total": 3, "raw_sources": 1, "in_scope": 1}
    assert list(report["links"]["notes"]) != ["Raw/alpha-capture.md"]
    assert {item["path"] for item in report["raw_sources"]} >= {"Raw/alpha-capture.md"}
    # A capture titled like its note is not a duplicate-title candidate.
    assert not any("Raw/" in d["a"] or "Raw/" in d["b"] for d in _run(vault)["duplicate_titles"])


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


def test_wikilinks_inside_code_are_examples_not_links(vault):
    (vault / "Wiki" / "gamma-orphan.md").write_text(
        # A double-backtick span, and a fence that opens with ``` and closes with
        # ```` — a longer delimiter CommonMark accepts.
        GAMMA + "\nExample: `[[alpha-note]]`, ``[[alpha-note]]`` and\n\n```\n[[alpha-note-draft]]\n````\n",
        encoding="utf-8",
    )
    links = _run(vault)["links"]
    assert "Wiki/gamma-orphan.md" in links["orphans"]
    assert links["notes"]["Wiki/alpha-note.md"]["inbound"] == 1


def test_log_entries_naming_missing_files(vault):
    log = _run(vault)["log"]
    assert log["entries"] == 3
    assert log["missing_files"] == [{"line": 4, "file": "Wiki/deleted-note.md"}]


def test_raw_captures_and_attachment_embeds_are_not_edges(vault):
    raw = vault / "Raw"
    raw.mkdir()
    # Captured text mentioning the orphan is the source's link, not the vault's.
    (raw / "capture.md").write_text(
        "---\nsource_url: https://example.com/c\nsha256: " + "0" * 64 + "\n---\nSee [[Wiki/gamma-orphan]] and [[alpha-note]].\n",
        encoding="utf-8",
    )
    # Attachments of any extension are embeds; a dotted note name still resolves.
    (vault / "Wiki" / "Node.js.md").write_text("---\ntype: entity\n---\nabout node\n", encoding="utf-8")
    (vault / "Wiki" / "gamma-orphan.md").write_text(
        GAMMA + "\n![[recording.mp3]] ![[clip.webp]] ![[deck.pdf]]\n", encoding="utf-8"
    )
    (vault / "Wiki" / "alpha-note-draft.md").write_text(DRAFT + "\nRuntime: [[Node.js]].\n", encoding="utf-8")
    links = _run(vault)["links"]
    assert "Wiki/gamma-orphan.md" in links["orphans"]
    assert links["notes"]["Wiki/alpha-note.md"]["inbound"] == 1
    assert links["notes"]["Wiki/Node.js.md"]["inbound"] == 1
    assert links["notes"]["Wiki/alpha-note-draft.md"]["outbound"] == 2


def test_log_path_tokens_are_not_satisfied_by_a_basename_elsewhere(vault):
    # `Wiki/deleted-note.md` stays missing when only `Archive/deleted-note.md`
    # exists; a bare basename in the log still matches any file of that name.
    (vault / "Archive").mkdir()
    (vault / "Archive" / "deleted-note.md").write_text("---\ntype: entity\n---\nmoved\n", encoding="utf-8")
    with (vault / "log.md").open("a", encoding="utf-8") as log:
        log.write("## [2026-05-09] create | entity | deleted-note.md\n")
    assert _run(vault)["log"]["missing_files"] == [{"line": 4, "file": "Wiki/deleted-note.md"}]


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


PRESETS = Path(__file__).resolve().parents[2] / "skills" / "core" / "maintaining-obsidian" / "presets"


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


GENERIC_SOURCE = (
    "---\ntype: source\ncreated: 2026-05-06\nlangs: [en, zh]\n"
    "source_url: https://example.com/{n}\nsource_author: Someone\nsha256: {digest}\n"
    "tags: [source]\naliases: []\n---\nbody\n"
)
PAPER_SOURCE = (
    "---\ntype: source\ncreated: 2026-05-06\nlangs: [en, zh]\n"
    "source_url: https://arxiv.org/abs/1\nsource_author: [A, B]\nsha256: {digest}\n"
    "venue: NeurIPS\nyear: 2025\nmethodology: ''\nreading_status: queued\n"
    "cites: []\ncited_by: []\ntags: [paper]\naliases: []\n---\nbody\n"
)


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


def test_links_with_a_path_resolve_by_that_path_only(vault):
    raw = _news_shaped_pair(vault)
    # The Article's link names the wrong day: the only bloomberg-fed.md lives
    # under 2026-05-06, and it must not stand in for the missing capture.
    article = vault / "Wiki" / "fed-article.md"
    article.write_text(
        article.read_text(encoding="utf-8").replace("[[Raw/2026-05-06/bloomberg-fed]]", "[[Raw/2026-05-07/bloomberg-fed]]"),
        encoding="utf-8",
    )
    report = _run(vault)
    assert {i["path"]: i["status"] for i in report["raw_sources"]}["Wiki/fed-article.md"] == "unresolved"
    assert raw.exists()
    # The same rule in the link graph: a path link to a note that is not there
    # gives the same-named note elsewhere no backlink.
    (vault / "Wiki" / "gamma-orphan.md").write_text(GAMMA + "\nSee [[Archive/alpha-note]].\n", encoding="utf-8")
    links = _run(vault)["links"]["notes"]
    assert links["Wiki/alpha-note.md"]["inbound"] == 1
    assert links["Wiki/gamma-orphan.md"]["outbound"] == 1


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
    # A fence indented four spaces is an indented code block, not a declaration.
    with (tmp_path / "SCHEMA.md").open("a", encoding="utf-8") as schema:
        schema.write("\nIndented example:\n\n    ```yaml\n    type: ghost\n    ```\n")
    assert _run(tmp_path)["schema"]["declared_types"] == ["book"]
