"""Contract test for maintaining-obsidian's LINT script.

Builds a tiny vault in tmp_path, runs `references/lint_vault.py --json` the way
the skill runs it (a subprocess), and asserts the facts it reports: block-list
frontmatter reads as filled, undeclared fields are counted against SCHEMA.md,
the orphan graph, sha256 drift and unhashed Raw Sources, log entries naming
missing files, tag counts, duplicate-title candidates, and the threshold flags.
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
tags: [entity]
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
    assert report["notes"] == {"total": 3, "in_scope": 3}
    assert report["schema"] == {"path": "SCHEMA.md", "declared_types": ["entity", "source"]}
    assert report["untyped"] == []


def test_block_list_frontmatter_reads_as_filled(vault):
    tags = _run(vault)["types"]["source"]["fields"]["tags"]
    assert tags == {"present": 2, "filled": 2, "empty": 0, "empty_pct": 0.0, "exceeds": None}


def test_unindented_block_list_reads_as_filled(vault):
    # Valid YAML: sequence items at column 0 under the key (PyYAML reads a list).
    (vault / "Wiki" / "delta-note.md").write_text(
        "---\ntype: source\ntitle: Delta\ntags:\n- arcforge\n- tdd\n---\nbody\n",
        encoding="utf-8",
    )
    tags = _run(vault)["types"]["source"]["fields"]["tags"]
    assert tags == {"present": 3, "filled": 3, "empty": 0, "empty_pct": 0.0, "exceeds": None}


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
    assert entity["undeclared"] == {"extra_field": {"present": 1, "present_pct": 100.0, "exceeds": None}}


def test_orphan_graph(vault):
    links = _run(vault)["links"]
    assert links["orphans"] == ["Wiki/gamma-orphan.md"]
    assert links["notes"]["Wiki/alpha-note.md"] == {"inbound": 1, "outbound": 1}
    assert links["notes"]["Wiki/alpha-note-draft.md"] == {"inbound": 1, "outbound": 1}


def test_raw_source_drift_and_unhashed(vault):
    by_path = {item["path"]: item for item in _run(vault)["raw_sources"]}
    alpha = by_path["Wiki/alpha-note.md"]
    assert alpha["status"] == "drift"
    assert alpha["stored"] == "0" * 64
    assert alpha["recomputed"] == hashlib.sha256(ALPHA_BODY.encode("utf-8")).hexdigest()
    assert alpha["hashed_file"] == "Wiki/alpha-note.md"
    assert by_path["Wiki/alpha-note-draft.md"]["status"] == "unhashed"


def test_log_entries_naming_missing_files(vault):
    log = _run(vault)["log"]
    assert log["entries"] == 3
    assert log["missing_files"] == [{"line": 4, "file": "Wiki/deleted-note.md"}]


def test_tag_counts(vault):
    tags = _run(vault)["tags"]
    assert {tag: facts["count"] for tag, facts in tags.items()} == {"arcforge": 2, "entity": 1, "tdd": 1}


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
    assert report["tags"]["arcforge"]["exceeds"] is True
    assert report["tags"]["tdd"]["exceeds"] is False


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
    assert report["notes"] == {"total": 3, "in_scope": 1}
    assert list(report["links"]["notes"]) == ["Wiki/alpha-note-draft.md"]
    assert report["links"]["notes"]["Wiki/alpha-note-draft.md"]["inbound"] == 1


def test_skip_drops_a_folder_and_bad_scope_is_rejected(vault):
    report = _run(vault, "--skip", "Wiki")
    assert report["notes"] == {"total": 0, "in_scope": 0}
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
