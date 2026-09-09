"""Link graph and Raw Source provenance facts for lint_vault.py.

The graph is the wiki layer's: a `[[wikilink]]` in a note's body outside code,
or in a parsed frontmatter value, is an edge unless it is an attachment embed,
a link to a Raw Source capture (provenance), or the note itself. Provenance
resolves a typed note's `sha256` to the capture it was ingested from. Stdlib
only; imported by lint_vault.py in this directory.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter, defaultdict
from pathlib import Path

from vault_frontmatter import (
    is_raw_source,
    note_type,
    parse_frontmatter,
    read_text,
    split_frontmatter,
    strip_code,
)

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")
# A link target with an explicit extension other than .md is an attachment
# embed, not a note relationship — unless a note of that exact name exists
# (`[[Node.js]]` is a note when Node.js.md is).
EXTENSION_RE = re.compile(r"\.[A-Za-z0-9]+$")


def _frontmatter_values(value) -> list[str]:
    """Every string inside a parsed frontmatter value (scalar, list, or mapping)."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [s for item in value for s in _frontmatter_values(item)]
    if isinstance(value, dict):
        return [s for item in value.values() for s in _frontmatter_values(item)]
    return []


def link_text(note: dict) -> str:
    """What the graph scans: the body outside code, plus the parsed frontmatter
    values — a `[[link]]` in a YAML comment is not a link."""
    values = _frontmatter_values(note["fm"] or {})
    return strip_code(note["body"]) + "\n" + "\n".join(values)


def link_facts(notes: list[dict], scoped: list[dict], raw: list[dict]) -> dict:
    """Link graph over the wiki-layer `notes`; a link to one of the `raw` captures is
    provenance, not a relationship, and counts for neither side."""
    by_rel = {note["rel"] for note in notes}
    by_stem: dict[str, list[str]] = defaultdict(list)
    for note in notes:
        by_stem[Path(note["rel"]).stem.lower()].append(note["rel"])
    raw_rels = {note["rel"] for note in raw}
    raw_stems = {Path(note["rel"]).stem.lower() for note in raw}

    def resolve(target: str, source: str = "") -> str | None:
        # A link with a path resolves by that path only. A bare name resolves by
        # basename; when several notes share it, the one in the source note's
        # own folder wins, and otherwise the link stays unresolved rather than
        # being handed to whichever note sorts first (search-strategies.md:
        # an ambiguous match is left unresolved).
        name = target[:-3] if target.endswith(".md") else target
        if "/" in name:
            return f"{name}.md" if f"{name}.md" in by_rel else None
        hits = by_stem.get(name.lower(), [])
        if len(hits) == 1:
            return hits[0]
        same_folder = [rel for rel in hits if Path(rel).parent == Path(source).parent]
        return same_folder[0] if len(same_folder) == 1 else None

    def is_attachment(target: str, source: str) -> bool:
        ext = EXTENSION_RE.search(target)
        return bool(ext) and ext.group(0).lower() != ".md" and resolve(target, source) is None

    def is_raw_capture(target: str, source: str) -> bool:
        # Provenance is a link that can only mean a capture: by path, or by a
        # bare name no wiki note has. An ambiguous wiki name stays a wiki link.
        name = target[:-3] if target.endswith(".md") else target
        if "/" in name:
            return f"{name}.md" in raw_rels
        return name.lower() in raw_stems and name.lower() not in by_stem

    outbound: dict[str, int] = {}
    inbound: Counter = Counter()
    for note in notes:
        targets = set()
        for match in WIKILINK_RE.finditer(link_text(note)):
            target = match.group(1).strip()
            if (
                target
                and not is_attachment(target, note["rel"])
                and not is_raw_capture(target, note["rel"])
            ):
                targets.add(target)
        resolved = {resolve(target, note["rel"]) for target in targets}
        # A link to the note itself, under any spelling, is not an outbound edge.
        outbound[note["rel"]] = sum(1 for target in targets if resolve(target, note["rel"]) != note["rel"])
        for rel in resolved - {None, note["rel"]}:
            inbound[rel] += 1

    per_note = {
        note["rel"]: {"inbound": inbound[note["rel"]], "outbound": outbound[note["rel"]]}
        for note in scoped
    }
    orphans = sorted(
        rel for rel, counts in per_note.items() if not counts["inbound"] and not counts["outbound"]
    )
    return {"orphans": orphans, "notes": per_note}


def sha256_body(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    """A note's body digest per raw-sources.md; a non-note file's raw bytes."""
    if path.suffix == ".md":
        return sha256_body(split_frontmatter(read_text(path))[1])
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _source_url_file(note: dict, files: dict[str, Path]) -> Path | None:
    """The vault file `source_url` names, when it names one (not a URL, not the note itself)."""
    source_url = note["fm"].get("source_url")
    if not isinstance(source_url, str) or not source_url or "://" in source_url:
        return None
    candidate = files.get(source_url.lstrip("/")) or files.get(
        (Path(note["rel"]).parent / source_url).as_posix()
    )
    return candidate if candidate is not None and candidate != note["path"] else None


def _linked_raw_source(note: dict, files: dict[str, Path], md_by_stem: dict) -> Path | None:
    """The Raw Source note (`sha256`, no `type:`) the body wikilinks — when it links exactly one.
    A link with a path resolves by that path only; a bare name by basename, and only
    when every note of that name is a capture (a wiki note of the same name makes
    the link a wiki relationship, not provenance)."""

    def frontmatter_of(rel: str) -> dict | None:
        fm_text, _ = split_frontmatter(read_text(files[rel]))
        return parse_frontmatter(fm_text) if fm_text is not None else None

    hits: set[Path] = set()
    for match in WIKILINK_RE.finditer(strip_code(note["body"])):
        target = match.group(1).strip()
        name = target[:-3] if target.endswith(".md") else target
        if "/" in name:
            rels = [f"{name}.md"] if f"{name}.md" in files else []
        else:
            rels = md_by_stem.get(name.lower(), [])
            if not all(is_raw_source(frontmatter_of(rel)) for rel in rels):
                continue
        for rel in rels:
            if is_raw_source(frontmatter_of(rel)):
                hits.add(files[rel])
    return hits.pop() if len(hits) == 1 else None


def raw_source_facts(scoped: list[dict], vault: Path, files: dict[str, Path]) -> list[dict]:
    md_by_stem: dict[str, list[str]] = defaultdict(list)
    for rel in files:
        if rel.endswith(".md"):
            md_by_stem[Path(rel).stem.lower()].append(rel)
    out = []
    for note in scoped:
        fm = note["fm"]
        if fm is None or "sha256" not in fm:
            continue
        stored = fm["sha256"] if isinstance(fm["sha256"], str) else ""
        # The provenance pair: a typed note's digest is of the Raw Source it was
        # ingested from, never of its own synthesized body.
        target = _source_url_file(note, files)
        if target is None and note_type(fm) is not None:
            target = _linked_raw_source(note, files, md_by_stem)
        if target is not None:
            hashed_file, recomputed = target.relative_to(vault).as_posix(), sha256_file(target)
        elif note_type(fm) is None:
            hashed_file, recomputed = note["rel"], sha256_body(note["body"])
        else:
            hashed_file, recomputed = None, None
        if recomputed is None:
            status = "unresolved"
        elif not stored:
            status = "unhashed"
        else:
            status = "fresh" if stored == recomputed else "drift"
        out.append(
            {
                "path": note["rel"],
                "hashed_file": hashed_file,
                "status": status,
                "stored": stored,
                "recomputed": recomputed,
            }
        )
    return out
