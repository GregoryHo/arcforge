"""Contract test for the LINT script's link graph and Raw Source provenance
(`references/vault_links.py`, driven through lint_vault.py as the skill runs it).
"""

import os
import hashlib
from pathlib import Path

from .lint_vault_support import (
    DRAFT,
    GAMMA,
    RAW_DIGEST,
    _run,
    _news_shaped_pair,
)


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
    # --skip Raw takes the capture out of the note set, not out of the drift
    # check, and its link is still provenance rather than a wiki edge.
    skipped = _run(vault, "--skip", "Raw")
    by_path = {item["path"]: item for item in skipped["raw_sources"]}
    assert by_path["Wiki/fed-article.md"]["status"] == "fresh"
    assert by_path["Raw/2026-05-06/bloomberg-fed.md"]["status"] == "fresh"
    assert "Wiki/fed-article.md" in skipped["links"]["orphans"]
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


def test_links_in_yaml_comments_are_not_edges_but_links_in_values_are(vault):
    (vault / "Wiki" / "gamma-orphan.md").write_text(
        GAMMA.replace("extra_field: yes\n", "extra_field: yes\nrelated: []   # e.g. [[alpha-note]]\n"),
        encoding="utf-8",
    )
    links = _run(vault)["links"]
    assert "Wiki/gamma-orphan.md" in links["orphans"]
    assert links["notes"]["Wiki/alpha-note.md"]["inbound"] == 1
    (vault / "Wiki" / "gamma-orphan.md").write_text(
        GAMMA.replace("extra_field: yes\n", "extra_field: yes\nrelated: \"[[alpha-note]]\"\n"),
        encoding="utf-8",
    )
    links = _run(vault)["links"]
    assert links["notes"]["Wiki/gamma-orphan.md"]["outbound"] == 1
    assert links["notes"]["Wiki/alpha-note.md"]["inbound"] == 2
    # A block scalar is a value too.
    (vault / "Wiki" / "gamma-orphan.md").write_text(
        GAMMA.replace("extra_field: yes\n", "extra_field: yes\nrelated: |\n  See [[alpha-note]]\n  and more\n"),
        encoding="utf-8",
    )
    links = _run(vault)["links"]
    assert links["notes"]["Wiki/gamma-orphan.md"]["outbound"] == 1
    assert links["notes"]["Wiki/alpha-note.md"]["inbound"] == 2


def test_links_inside_obsidian_and_html_comments_are_not_edges(vault):
    (vault / "Wiki" / "gamma-orphan.md").write_text(
        GAMMA + "\n%% draft: [[alpha-note]] %%\n\n<!-- todo: [[alpha-note-draft]]\nlater -->\n%%\nmulti-line [[alpha-note]]\n%%\n",
        encoding="utf-8",
    )
    links = _run(vault)["links"]
    assert "Wiki/gamma-orphan.md" in links["orphans"]
    assert links["notes"]["Wiki/alpha-note.md"]["inbound"] == 1


def test_self_links_under_any_spelling_are_not_edges(vault):
    (vault / "Wiki" / "gamma-orphan.md").write_text(
        GAMMA + "\nSelf: [[gamma-orphan]] and [[Wiki/gamma-orphan]] and [[gamma-orphan#Heading|me]].\n",
        encoding="utf-8",
    )
    links = _run(vault)["links"]
    assert links["notes"]["Wiki/gamma-orphan.md"] == {"inbound": 0, "outbound": 0}
    assert "Wiki/gamma-orphan.md" in links["orphans"]


def test_ambiguous_bare_links_resolve_by_folder_or_not_at_all(vault):
    for folder in ("A", "B"):
        (vault / folder).mkdir()
        (vault / folder / "foo.md").write_text(f"---\ntype: entity\n---\n{folder} foo\n", encoding="utf-8")
    (vault / "B" / "source.md").write_text("---\ntype: entity\n---\nSee [[foo]].\n", encoding="utf-8")
    (vault / "Wiki" / "gamma-orphan.md").write_text(GAMMA + "\nAlso [[foo]].\n", encoding="utf-8")
    links = _run(vault)["links"]
    assert links["notes"]["B/foo.md"]["inbound"] == 1      # same folder as B/source.md
    assert links["notes"]["A/foo.md"]["inbound"] == 0      # not handed the link by sort order
    assert "A/foo.md" in links["orphans"]
    assert links["notes"]["Wiki/gamma-orphan.md"]["outbound"] == 1   # ambiguous from Wiki/: unresolved, still a link
    assert "Wiki/gamma-orphan.md" not in links["orphans"]
    # The same-folder rule also decides the attachment and provenance prefilters:
    # a dotted name shared by two folders, and a bare name a capture also has.
    for folder in ("A", "B"):
        (vault / folder / "Node.js.md").write_text("---\ntype: entity\n---\nnode\n", encoding="utf-8")
    (vault / "Raw").mkdir()
    (vault / "Raw" / "foo.md").write_text("---\nsource_url: https://x/foo\nsha256: " + "0" * 64 + "\n---\ncapture\n", encoding="utf-8")
    (vault / "B" / "source.md").write_text("---\ntype: entity\n---\nSee [[foo]] and [[Node.js]].\n", encoding="utf-8")
    links = _run(vault)["links"]
    assert links["notes"]["B/Node.js.md"]["inbound"] == 1
    assert links["notes"]["B/foo.md"]["inbound"] == 1
    assert links["notes"]["B/source.md"]["outbound"] == 2
    # With a wiki `foo` in two folders and a capture `foo`, the ambiguous link
    # from Wiki/ is still a wiki link (unresolved), not provenance.
    assert links["notes"]["Wiki/gamma-orphan.md"]["outbound"] == 1


def test_provenance_link_to_a_capture_is_not_a_wiki_relationship(vault):
    _news_shaped_pair(vault)
    # The Article's only link is its `## Source` line: no wiki relationship, so
    # it is an orphan, while its provenance still resolves for the drift check.
    report = _run(vault)
    assert "Wiki/fed-article.md" in report["links"]["orphans"]
    assert {i["path"]: i["status"] for i in report["raw_sources"]}["Wiki/fed-article.md"] == "fresh"
    # A long attachment extension and a code span crossing a line break are
    # embeds and examples too.
    (vault / "Wiki" / "gamma-orphan.md").write_text(
        GAMMA + "\n![[diagram.excalidraw]] and ``literal\n[[alpha-note]]`` here.\n"
        "\n> [!note]\n> ```md\n> [[alpha-note]] inside a callout fence\n>```\n\nAfter the callout: [[Node.js]].\n",
        encoding="utf-8",
    )
    # The callout fence closes on `>``` ` (no space), and text after it is text again.
    (vault / "Wiki" / "Node.js.md").write_text("---\ntype: entity\n---\nnode\n", encoding="utf-8")
    links = _run(vault)["links"]
    assert "Wiki/gamma-orphan.md" not in links["orphans"]
    assert links["notes"]["Wiki/gamma-orphan.md"]["outbound"] == 1
    assert links["notes"]["Wiki/alpha-note.md"]["inbound"] == 1


def test_note_relative_source_url_normalises_but_never_leaves_the_vault(vault):
    raw = vault / "Raw"
    raw.mkdir()
    (raw / "capture.md").write_text("---\nsource_url: https://x/c\nsha256: " + "0" * 64 + "\n---\ncaptured\n", encoding="utf-8")
    digest = hashlib.sha256(b"captured\n").hexdigest()
    (vault / "Wiki" / "typed.md").write_text(
        f"---\ntype: source\nsource_url: ../Raw/capture.md\nsha256: {digest}\n---\nbody\n", encoding="utf-8"
    )
    (vault / "Wiki" / "escape.md").write_text(
        f"---\ntype: source\nsource_url: ../../capture.md\nsha256: {digest}\n---\nbody\n", encoding="utf-8"
    )
    by_path = {i["path"]: i for i in _run(vault)["raw_sources"]}
    assert by_path["Wiki/typed.md"]["status"] == "fresh"
    assert by_path["Wiki/typed.md"]["hashed_file"] == "Raw/capture.md"
    assert by_path["Wiki/escape.md"]["status"] == "unresolved"


def test_bare_provenance_link_colliding_with_a_wiki_name_is_unresolved(vault):
    raw = vault / "Raw"
    raw.mkdir()
    (raw / "foo.md").write_text("---\nsource_url: https://x/foo\nsha256: " + "0" * 64 + "\n---\ncapture\n", encoding="utf-8")
    (vault / "Wiki" / "foo.md").write_text("---\ntype: entity\n---\nwiki foo\n", encoding="utf-8")
    (vault / "Wiki" / "typed.md").write_text(
        "---\ntype: source\nsource_url: https://x/t\nsha256: " + "0" * 64 + "\n---\nSee [[foo]].\n", encoding="utf-8"
    )
    by_path = {i["path"]: i for i in _run(vault)["raw_sources"]}
    assert by_path["Wiki/typed.md"]["status"] == "unresolved"
    assert by_path["Wiki/typed.md"]["hashed_file"] is None


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
