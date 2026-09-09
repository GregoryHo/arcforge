"""Emit the deterministic LINT facts for an Obsidian vault.

Usage:
    cd <this skill's references/ directory>
    python3 lint_vault.py <vault> [--scope recent:50|all] [--skip <folder>]... [--json]
                          [--field-empty-pct N] [--undeclared-pct N] [--tag-min N] [--title-match R]

Reports facts, not verdicts — every figure is a hypothesis about a file that
the auditor reads before acting on:
  1. Frontmatter per note, parsed as a block. A YAML block list (`tags:` then
     indented `- ` items) reads as filled, never as empty.
  2. `type:` presence; per-type field fill counts and undeclared-field counts.
     Declared fields come from the top-level yaml fences in `<vault>/SCHEMA.md`
     (a fence nested inside another fence is an illustration). A fence whose
     `type:` lists several names (`source | entity`), or whose section heading
     does not name its one type (`## Universal Frontmatter` over `type: book`),
     is a base every note of those types carries; a fence naming one type under
     that type's own heading is a variant of it (the llm-wiki Source and its
     Paper variant), and a placeholder name (`<one of the types declared
     below>`) declares nothing. A note is measured against
     the variant whose fields it carries most of, so a field only one variant
     declares is `expected` of the notes fitting that variant, not of every
     note of the type. A variant fence that declares a `tags:` value names its
     discriminator: a note carrying that tag fits the variant whatever fields
     it lacks — that is how a paper missing every paper field is still measured
     as a paper rather than passing as a generic Source.
  3. Link graph from [[wikilinks]] over the wiki layer: inbound / outbound per
     in-scope note, and the orphans (zero of each). A bare `[[name]]` shared by
     several notes resolves to the one in the linking note's folder, else stays
     unresolved (it still counts as outbound). A target with an explicit
     extension other than `.md` is an attachment embed (`![[image.png]]`,
     `![[clip.mp4]]`), not a link, unless a note of that exact name exists.
     Raw Source captures are not in the graph: a `[[link]]` inside captured
     text is the source's, not the vault's, and a typed note's provenance link
     to its capture (`[[Raw/...]]`) is not a wiki relationship.
  4. Raw Source sha256 drift per raw-sources.md: strip the frontmatter, normalize
     line endings to `\\n`, sha256 the UTF-8 bytes of what follows the closing
     fence line. A note carries a hash when its frontmatter has a `sha256` key.
     The file hashed is the `source_url` target when that is a file inside the
     vault; otherwise a Raw Source note (`sha256`, no `type:`) hashes its own
     body, and a typed note hashes the one Raw Source note its body wikilinks.
     A typed note with neither is `unresolved`, whether or not it stores a
     digest: its original is remote, and nothing in the vault stands in for it.
  5. `log.md` entries naming files that do not exist anywhere in the vault. The
     last field of an entry is its path whatever it contains (`create | source |
     My Note.md`); any other field counts as a path only when it ends in an
     extension and has no whitespace before its first `/`. `query` and `schema`
     entries are free text, not checked.
  6. Frontmatter tag counts, each marked `declared` when the tag or its top-level
     segment is a backticked list item under SCHEMA.md's `## Tag Taxonomy`;
     `--tag-min` sets `exceeds` for undeclared tags only.
  7. Duplicate-title candidates (difflib ratio >= 0.6, or the --title-match
     value when lower) between in-scope notes and every other note.

Scope: `recent:N` (default recent:50) takes the N most recently modified
wiki-layer notes as subjects; the link graph, the file index, and duplicate
comparison still cover the whole wiki layer. Raw Source notes (`sha256`, no
`type:`) are never subjects of the schema, link, tag, or title checks, never
sources or targets in the link graph, and are all drift-checked whatever the
scope, so `Raw/` neither needs `--skip` nor eats into `recent:N`. A `[[wikilink]]` inside a fenced code block or inline code is
an example, not a link. `--skip <folder>` drops a folder from the wiki note set (plugin-
managed folders, folders AGENTS.md declares out of scope); a Raw Source note in
a skipped folder keeps its identity. Dot-dirs,
Excalidraw drawings (`excalidraw-plugin:` in frontmatter), the root-level
AGENTS.md / SCHEMA.md / CLAUDE.md / README.md / index.md / log.md, and the
standard `_audits/` report folder are never notes (a vault that keeps reports
elsewhere passes that folder as `--skip`).

Threshold flags only set the `exceeds` booleans in the JSON; the numbers live in
each vault's SCHEMA.md `## Audit Thresholds`. Without a flag, `exceeds` is null.

Output: JSON (--json) or a short text summary.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from vault_frontmatter import (
    is_empty,
    is_raw_source,
    note_tags,
    note_type,
    parse_frontmatter,
    read_text,
    split_frontmatter,
    text_lines,
    yaml_fences,
)
from vault_links import link_facts, raw_source_facts

NON_NOTE_ROOT_FILES = {"AGENTS.md", "SCHEMA.md", "CLAUDE.md", "README.md", "index.md", "log.md"}
# The standard audit-report folder: every run writes a new report there, so
# reports would otherwise take over the recent:N slice run by run.
REPORT_DIR = "_audits"
LOG_FILE = "log.md"
SCHEMA_FILE = "SCHEMA.md"
DUP_CANDIDATE_FLOOR = 0.6

# A log field names a file when it ends in a letter-led extension and reads as
# a path: no whitespace at all, or none before its first `/` (`Raw/recording.mp3`,
# `Wiki/My Note.md`; not `bump to v1.2`, not `updated SCHEMA.md`).
FILE_TOKEN_RE = re.compile(r"^\S.*\.[A-Za-z][A-Za-z0-9]{0,9}$")
TYPE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
TAXONOMY_HEADING_RE = re.compile(r"^##\s+.*\btaxonomy\b", re.IGNORECASE)
TAXONOMY_ITEM_RE = re.compile(r"^\s*[-*]\s+`#?([^`\s]+)`")
LOG_ENTRY_RE = re.compile(r"^\s*(?:#+\s*|-\s*)?\[\d{4}-\d{2}-\d{2}\]\s*([A-Za-z-]+)?")
# Log entries whose fields are free text rather than a path (a question may end
# in a filename without naming a file to check).
FREE_TEXT_OPS = {"query", "schema"}


def is_path_token(token: str) -> bool:
    """See FILE_TOKEN_RE: a letter-led extension, and no whitespace before the first `/`."""
    if not FILE_TOKEN_RE.match(token):
        return False
    head = token.split("/", 1)[0] if "/" in token else token
    return re.search(r"\s", head) is None


def exceeds(value: float, threshold: float | None) -> bool | None:
    return None if threshold is None else value >= threshold


# ---------------------------------------------------------------------------
# Vault walk
# ---------------------------------------------------------------------------


def _skipped(rel: str, skip: set[str]) -> bool:
    return any(rel == folder or rel.startswith(folder + "/") for folder in skip | {REPORT_DIR})


def collect(vault: Path, skip: set[str]) -> tuple[list[dict], dict[str, Path]]:
    """Every file in the vault (by relative posix path) and the notes among them."""
    files: dict[str, Path] = {}
    notes: list[dict] = []
    for path in sorted(vault.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(vault)
        if any(part.startswith(".") for part in rel.parts):
            continue
        rel_posix = rel.as_posix()
        files[rel_posix] = path
        if path.suffix != ".md":
            continue
        if len(rel.parts) == 1 and path.name in NON_NOTE_ROOT_FILES:
            continue
        text = read_text(path)
        fm_text, body = split_frontmatter(text)
        fm = parse_frontmatter(fm_text) if fm_text is not None else None
        if fm and "excalidraw-plugin" in fm:
            continue
        title = fm.get("title") if fm else None
        notes.append(
            {
                "rel": rel_posix,
                "path": path,
                "fm": fm,
                "text": text,
                "body": body,
                "title": title if isinstance(title, str) and title else path.stem,
                "mtime": path.stat().st_mtime,
                # A skipped folder leaves the wiki note set; a Raw Source note in
                # it keeps its identity (drift-checked, a provenance target).
                "skipped": _skipped(rel_posix, skip),
            }
        )
    return notes, files


def select_scope(notes: list[dict], scope: str) -> list[dict]:
    if scope == "all":
        return notes
    limit = int(scope.split(":", 1)[1])
    return sorted(notes, key=lambda n: n["mtime"], reverse=True)[:limit]


# ---------------------------------------------------------------------------
# Facts
# ---------------------------------------------------------------------------


def declared_fields(vault: Path) -> dict[str, list[dict]] | None:
    """Per type, one variant per fence SCHEMA.md declares; None without a SCHEMA.md.

    A fence naming several types, or naming one type under a heading path that
    does not mention it (`## Universal Frontmatter` over `type: book`), is a base
    shared by every variant of each type it names; a fence naming one type under
    that type's own heading — or a subheading of it (`## Source / ### Frontmatter`)
    — is a variant, with `fields` (its keys plus the base)
    and `tags` (the tags its `tags:` value lists — the variant's discriminator).
    A type with no variant fence has its base as the single variant.
    """
    schema = vault / SCHEMA_FILE
    if not schema.is_file():
        return None
    base: dict[str, set[str]] = defaultdict(set)
    variants: dict[str, list[dict]] = defaultdict(list)
    for heading, fence in yaml_fences(read_text(schema)):
        lines = [line for line in fence.split("\n") if line.strip() != "---"]
        fm = parse_frontmatter("\n".join(lines))
        type_value = fm.get("type")
        if not isinstance(type_value, str):
            continue
        names = [n for n in (part.strip() for part in type_value.split("|")) if TYPE_NAME_RE.match(n)]
        for name in names:
            own_section = _heading_names(heading, name)
            if len(names) == 1 and own_section:
                variants[name].append({"fields": set(fm.keys()), "tags": set(note_tags(fm))})
            else:
                base[name].update(fm.keys())
    return {
        name: [{"fields": base[name] | v["fields"], "tags": v["tags"]} for v in variants[name]]
        or [{"fields": base[name], "tags": set()}]
        for name in sorted(set(base) | set(variants))
    }


def _heading_names(heading: str, type_name: str) -> bool:
    """Whether the heading path names the type as whole words — `Source — Paper
    Variant / Frontmatter` names `source`, `Daily Aggregate` names
    `daily-aggregate`, `Catalog defaults` does not name `log`."""
    tokens = re.findall(r"[a-z0-9]+", heading.lower())
    key = re.sub(r"[^a-z0-9]", "", type_name.lower())
    return any(
        key == "".join(tokens[i:j]) for i in range(len(tokens)) for j in range(i + 1, len(tokens) + 1)
    )


def _fit(fm: dict, variants: list[dict]) -> int:
    """Index of the variant a note fits: a discriminator tag it carries wins, then the most
    declared fields it carries, then the earlier (generic) fence."""
    tags = set(note_tags(fm)) | {tag.rsplit("/", 1)[-1] for tag in note_tags(fm)}
    return max(
        range(len(variants)),
        key=lambda i: (bool(variants[i]["tags"] & tags), len(variants[i]["fields"] & fm.keys()), -i),
    )


def declared_tags(vault: Path) -> list[str]:
    """Top-level tags listed under SCHEMA.md's taxonomy heading, as `- `tag` — ...` items."""
    schema = vault / SCHEMA_FILE
    if not schema.is_file():
        return []
    tags: list[str] = []
    inside = False
    for line in text_lines(read_text(schema)):  # a fenced example declares nothing
        if line.startswith("## "):
            inside = bool(TAXONOMY_HEADING_RE.match(line))
            continue
        match = TAXONOMY_ITEM_RE.match(line) if inside else None
        if match and match.group(1) not in tags:
            tags.append(match.group(1))
    return tags


def type_facts(scoped: list[dict], declared, field_empty_pct, undeclared_pct) -> tuple[dict, list]:
    by_type: dict[str, list[dict]] = defaultdict(list)
    untyped = []
    for note in scoped:
        fm = note["fm"]
        type_value = note_type(fm)
        if type_value is None:
            if is_raw_source(fm):
                # A Raw Source note: audit.md keeps it under the drift check
                # (raw_source_facts) and out of schema compliance.
                continue
            untyped.append({"path": note["rel"], "has_frontmatter": fm is not None})
            continue
        by_type[type_value].append(fm)

    types = {}
    for type_name, fms in sorted(by_type.items()):
        total = len(fms)
        variants = declared.get(type_name) if declared is not None else None
        decl = set().union(*(v["fields"] for v in variants)) if variants else None
        observed = set().union(*(fm.keys() for fm in fms))
        # Each note is measured against the variant it fits (_fit). A field every
        # variant declares — or none — is expected of every note; a field only
        # some variants declare is expected of the notes fitting them, plus any
        # note carrying it anyway.
        fits = [_fit(fm, variants) for fm in fms] if variants else []
        fields = {}
        for field in sorted(observed | (decl or set())):
            if variants and any(field not in v["fields"] for v in variants) and field in decl:
                expected = [
                    fm for i, fm in zip(fits, fms) if field in variants[i]["fields"] or field in fm
                ]
            else:
                expected = fms
            if not expected:
                continue
            present = sum(1 for fm in expected if field in fm)
            filled = sum(1 for fm in expected if field in fm and not is_empty(fm[field]))
            empty = len(expected) - filled
            pct = round(100.0 * empty / len(expected), 1)
            fields[field] = {
                "expected": len(expected),
                "present": present,
                "filled": filled,
                "empty": empty,
                "empty_pct": pct,
                "exceeds": exceeds(pct, field_empty_pct),
            }
        undeclared = None
        if decl is not None:
            undeclared = {}
            for field in sorted(observed - decl):
                present = sum(1 for fm in fms if field in fm)
                pct = round(100.0 * present / total, 1)
                undeclared[field] = {
                    "present": present,
                    "present_pct": pct,
                    "exceeds": exceeds(pct, undeclared_pct),
                }
        types[type_name] = {
            "notes": total,
            "declared": sorted(decl) if decl is not None else None,
            "variants": len(variants) if variants else 0,
            "variant_notes": [fits.count(i) for i in range(len(variants))] if variants else [],
            "fields": fields,
            "undeclared": undeclared,
        }
    return types, untyped


def log_facts(vault: Path, files: dict[str, Path]) -> dict:
    log = vault / LOG_FILE
    if not log.is_file():
        return {"path": None, "entries": 0, "missing_files": []}
    basenames = {Path(rel).name for rel in files}
    entries = 0
    missing = []
    for line_no, line in enumerate(read_text(log).split("\n"), 1):
        entry = LOG_ENTRY_RE.match(line)
        if entry:
            entries += 1
            if (entry.group(1) or "").lower() in FREE_TEXT_OPS:
                continue
        fields = [part.strip().strip("`") for part in line.split("|")]
        for index, token in enumerate(fields):
            # The last field of a path-valued entry is the path whatever it
            # contains (`create | source | My Note.md`); any other field is a
            # path only when it reads as one.
            last_field = entry is not None and index == len(fields) - 1
            if not (is_path_token(token) or (last_field and FILE_TOKEN_RE.match(token))):
                continue
            if token in files or token.lstrip("./") in files:
                continue
            if "/" not in token and token in basenames:
                continue
            missing.append({"line": line_no, "file": token})
    return {"path": LOG_FILE, "entries": entries, "missing_files": missing}


def tag_facts(scoped: list[dict], declared: list[str], tag_min) -> dict:
    """Tag counts; `exceeds` only for a tag outside the taxonomy (top-level segment undeclared)."""
    counts: Counter = Counter()
    for note in scoped:
        counts.update(note_tags(note["fm"]))
    out = {}
    for tag, n in sorted(counts.items()):
        is_declared = tag in declared or tag.split("/", 1)[0] in declared
        out[tag] = {
            "count": n,
            "declared": is_declared,
            "exceeds": None if tag_min is None else (not is_declared and n >= tag_min),
        }
    return out


def normalize_title(title: str) -> str:
    return re.sub(r"[\W_]+", " ", title.lower()).strip()


def duplicate_title_facts(notes: list[dict], scoped: list[dict], title_match) -> list[dict]:
    floor = DUP_CANDIDATE_FLOOR if title_match is None else min(DUP_CANDIDATE_FLOOR, title_match)
    normalized = {note["rel"]: normalize_title(note["title"]) for note in notes}
    seen: set[tuple[str, str]] = set()
    out = []
    for subject in scoped:
        if not normalized[subject["rel"]]:
            continue
        matcher = SequenceMatcher()
        matcher.set_seq2(normalized[subject["rel"]])
        for other in notes:
            if other["rel"] == subject["rel"] or not normalized[other["rel"]]:
                continue
            pair = tuple(sorted((subject["rel"], other["rel"])))
            if pair in seen:
                continue
            seen.add(pair)
            matcher.set_seq1(normalized[other["rel"]])
            if matcher.real_quick_ratio() < floor or matcher.quick_ratio() < floor:
                continue
            ratio = round(matcher.ratio(), 3)
            if ratio < floor:
                continue
            out.append({"a": pair[0], "b": pair[1], "ratio": ratio, "exceeds": exceeds(ratio, title_match)})
    out.sort(key=lambda item: (-item["ratio"], item["a"], item["b"]))
    return out


def lint_vault(vault: Path, scope: str, skip: set[str], thresholds: dict) -> dict:
    notes, files = collect(vault, skip)
    raw = [note for note in notes if is_raw_source(note["fm"])]
    wiki = [note for note in notes if not is_raw_source(note["fm"]) and not note["skipped"]]
    scoped = select_scope(wiki, scope)
    declared = declared_fields(vault)
    taxonomy = declared_tags(vault)
    types, untyped = type_facts(
        scoped, declared, thresholds["field_empty_pct"], thresholds["undeclared_pct"]
    )
    return {
        "vault": str(vault),
        "scope": scope,
        "skipped": sorted(skip),
        "thresholds": thresholds,
        "notes": {"total": len(wiki), "raw_sources": len(raw), "in_scope": len(scoped)},
        "schema": {
            "path": SCHEMA_FILE if declared is not None else None,
            "declared_types": sorted(declared) if declared else [],
            "declared_tags": taxonomy,
        },
        "untyped": untyped,
        "types": types,
        "links": link_facts(wiki, scoped, raw),
        "raw_sources": raw_source_facts(scoped + raw, vault, files),
        "log": log_facts(vault, files),
        "tags": tag_facts(scoped, taxonomy, thresholds["tag_min"]),
        "duplicate_titles": duplicate_title_facts(wiki, scoped, thresholds["title_match"]),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_scope(value: str) -> str:
    if value == "all" or re.fullmatch(r"recent:[1-9]\d*", value):
        return value
    raise argparse.ArgumentTypeError(f"scope must be 'all' or 'recent:<N>', got {value!r}")


def print_summary(report: dict) -> None:
    notes = report["notes"]
    schema = report["schema"]
    print(
        f"Vault: {report['vault']}  scope: {report['scope']} "
        f"({notes['in_scope']} of {notes['total']} wiki notes, {notes['raw_sources']} Raw Sources)"
    )
    print(f"Schema: {schema['path'] or 'none'}  types: {', '.join(schema['declared_types']) or '-'}")
    for name, facts in report["types"].items():
        undeclared = facts["undeclared"]
        extra = f", undeclared fields: {', '.join(undeclared)}" if undeclared else ""
        print(f"  {name}: {facts['notes']} notes{extra}")
    print(f"Untyped: {len(report['untyped'])}")
    for item in report["untyped"]:
        print(f"  {item['path']} (frontmatter: {'yes' if item['has_frontmatter'] else 'no'})")
    print(f"Orphans: {len(report['links']['orphans'])}")
    for rel in report["links"]["orphans"]:
        print(f"  {rel}")
    by_status = Counter(item["status"] for item in report["raw_sources"])
    print(
        f"Raw Sources: {len(report['raw_sources'])} (fresh {by_status['fresh']}, "
        f"drift {by_status['drift']}, unhashed {by_status['unhashed']}, "
        f"unresolved {by_status['unresolved']})"
    )
    for item in report["raw_sources"]:
        if item["status"] != "fresh":
            print(f"  {item['status']}: {item['path']}")
    log = report["log"]
    print(f"Log: {log['entries']} entries, {len(log['missing_files'])} naming missing files")
    for item in log["missing_files"]:
        print(f"  line {item['line']}: {item['file']}")
    outside = sum(1 for facts in report["tags"].values() if not facts["declared"])
    print(f"Tags: {len(report['tags'])} distinct, {outside} outside the taxonomy")
    print(f"Duplicate-title candidates: {len(report['duplicate_titles'])}")
    for item in report["duplicate_titles"]:
        print(f"  {item['ratio']:.3f}  {item['a']}  ~  {item['b']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Emit the deterministic LINT facts for an Obsidian vault"
    )
    parser.add_argument("vault", type=Path, help="Path to the vault root")
    parser.add_argument(
        "--scope", type=parse_scope, default="recent:50", help="recent:<N> (default recent:50) or all"
    )
    parser.add_argument(
        "--skip",
        action="append",
        default=[],
        metavar="FOLDER",
        help="Vault-relative folder to leave out of the note set (repeatable)",
    )
    parser.add_argument(
        "--field-empty-pct",
        type=float,
        default=None,
        help="Field empty in this %% of a type or more sets exceeds",
    )
    parser.add_argument(
        "--undeclared-pct",
        type=float,
        default=None,
        help="Undeclared field present in this %% of a type or more sets exceeds",
    )
    parser.add_argument(
        "--tag-min", type=int, default=None, help="Tag used this many times or more sets exceeds"
    )
    parser.add_argument(
        "--title-match",
        type=float,
        default=None,
        help="Title similarity ratio (0-1) at or above which a pair sets exceeds",
    )
    parser.add_argument(
        "--json", action="store_true", help="Output raw JSON instead of the text summary"
    )
    args = parser.parse_args()

    vault = args.vault.resolve()
    if not vault.is_dir():
        print(f"ERROR: vault directory not found: {args.vault}", file=sys.stderr)
        sys.exit(1)

    thresholds = {
        "field_empty_pct": args.field_empty_pct,
        "undeclared_pct": args.undeclared_pct,
        "tag_min": args.tag_min,
        "title_match": args.title_match,
    }
    skip = {folder.strip("/") for folder in args.skip if folder.strip("/")}
    report = lint_vault(vault, args.scope, skip, thresholds)

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return
    print_summary(report)


if __name__ == "__main__":
    main()
