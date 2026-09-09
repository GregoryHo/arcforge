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
     `type:` lists several names (`source | entity`) declares for each; a
     placeholder name (`<one of the types declared below>`) declares nothing.
  3. Link graph from [[wikilinks]] over the whole vault: inbound / outbound per
     in-scope note, and the orphans (zero of each). Embeds of non-note files
     (`![[image.png]]`) are not links.
  4. Raw Source sha256 drift per raw-sources.md: strip the frontmatter, normalize
     line endings to `\\n`, sha256 the UTF-8 bytes of what follows the closing
     fence line. A note carries a hash when its frontmatter has a `sha256` key.
     The file hashed is the `source_url` target when that is a file inside the
     vault; otherwise a Raw Source note (`sha256`, no `type:`) hashes its own
     body, and a typed note hashes the one Raw Source note its body wikilinks.
     A typed note with neither is `unresolved`: its original is remote, and
     nothing in the vault stands in for it.
  5. `log.md` entries naming files that do not exist anywhere in the vault.
  6. Frontmatter tag counts, each marked `declared` when the tag or its top-level
     segment is a backticked list item under SCHEMA.md's `## Tag Taxonomy`;
     `--tag-min` sets `exceeds` for undeclared tags only.
  7. Duplicate-title candidates (difflib ratio >= 0.6, or the --title-match
     value when lower) between in-scope notes and every other note.

Scope: `recent:N` (default recent:50) takes the N most recently modified notes as
subjects; the link graph, the file index, and duplicate comparison still cover
the whole vault. `--skip <folder>` drops a folder from the note set (plugin-
managed folders, `_audits`, folders AGENTS.md declares out of scope). Dot-dirs,
Excalidraw drawings (`excalidraw-plugin:` in frontmatter), and the root-level
AGENTS.md / SCHEMA.md / CLAUDE.md / README.md / index.md / log.md are never notes.

Threshold flags only set the `exceeds` booleans in the JSON; the numbers live in
each vault's SCHEMA.md `## Audit Thresholds`. Without a flag, `exceeds` is null.

Output: JSON (--json) or a short text summary.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

NON_NOTE_ROOT_FILES = {"AGENTS.md", "SCHEMA.md", "CLAUDE.md", "README.md", "index.md", "log.md"}
LOG_FILE = "log.md"
SCHEMA_FILE = "SCHEMA.md"
DUP_CANDIDATE_FLOOR = 0.6

# Link targets with these extensions are embeds, not note relationships.
NON_NOTE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".pdf", ".canvas", ".html", ".excalidraw"}
FILE_TOKEN_RE = re.compile(r"\.(md|pdf|png|jpe?g|gif|svg|html|canvas)$", re.IGNORECASE)
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")
KEY_RE = re.compile(r"^([A-Za-z0-9_-]+):(.*)$")
TYPE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
TAXONOMY_HEADING_RE = re.compile(r"^##\s+.*\btaxonomy\b", re.IGNORECASE)
TAXONOMY_ITEM_RE = re.compile(r"^\s*[-*]\s+`#?([^`\s]+)`")
LOG_ENTRY_RE = re.compile(r"^\s*(?:#+\s*|-\s*)?\[\d{4}-\d{2}-\d{2}\]")


# ---------------------------------------------------------------------------
# Frontmatter
# ---------------------------------------------------------------------------


def read_text(path: Path) -> str:
    """Read as UTF-8 with line endings normalized to \\n."""
    return path.read_bytes().decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")


def split_frontmatter(text: str) -> tuple[str | None, str]:
    """Return (frontmatter text, body). Frontmatter is None when the note has none."""
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 4)
    if end == -1:
        if text.endswith("\n---"):
            return text[4:-4], ""
        return None, text
    return text[4:end], text[end + 5 :]


def _scalar(raw: str):
    """Parse one inline YAML value: quoted string, inline list, empty, or bare."""
    value = raw.strip()
    if value[:1] in ("'", '"'):
        close = value.find(value[0], 1)
        return value[1:close] if close != -1 else value[1:]
    value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        return [_scalar(item) for item in inner.split(",")] if inner else []
    if value in ("", "null", "~"):
        return ""
    return value


def parse_frontmatter(text: str) -> dict:
    """Parse a frontmatter block. Block lists and nested mappings are read whole."""
    data: dict = {}
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        match = KEY_RE.match(lines[i])
        i += 1
        if not match:
            continue
        key, rest = match.group(1), match.group(2)
        if rest.strip() and not rest.strip().startswith("#"):
            data[key] = _scalar(rest)
            continue
        block: list[str] = []
        while i < len(lines) and (
            not lines[i].strip()
            or lines[i][:1] in (" ", "\t")
            or lines[i] == "-"
            or lines[i].startswith("- ")
        ):
            if lines[i].strip():
                block.append(lines[i].strip())
            i += 1
        if not block:
            data[key] = ""
        elif all(item == "-" or item.startswith("- ") for item in block):
            data[key] = [_scalar(item[1:]) for item in block]
        else:
            data[key] = {
                item.split(":", 1)[0].strip(): _scalar(item.split(":", 1)[1]) if ":" in item else ""
                for item in block
            }
    return data


def is_empty(value) -> bool:
    return value == "" or value == [] or value == {}


def note_type(fm: dict | None) -> str | None:
    """The note's `type:` when it is a non-empty string; None for an untyped note."""
    value = fm.get("type") if fm else None
    return value if isinstance(value, str) and value else None


def yaml_fences(text: str) -> list[str]:
    """Bodies of the top-level ```yaml fences. A ```yaml line inside an open fence is content."""
    fences: list[str] = []
    info: str | None = None
    buf: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if info is None:
            if stripped.startswith("```"):
                info, buf = stripped[3:].strip().lower(), []
        elif stripped == "```":
            if info in ("yaml", "yml"):
                fences.append("\n".join(buf))
            info = None
        else:
            buf.append(line)
    return fences


def exceeds(value: float, threshold: float | None) -> bool | None:
    return None if threshold is None else value >= threshold


# ---------------------------------------------------------------------------
# Vault walk
# ---------------------------------------------------------------------------


def _skipped(rel: str, skip: set[str]) -> bool:
    return any(rel == folder or rel.startswith(folder + "/") for folder in skip)


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
        if path.suffix != ".md" or _skipped(rel_posix, skip):
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


def declared_fields(vault: Path) -> dict[str, set[str]] | None:
    """Fields each type declares in SCHEMA.md's yaml fences; None without a SCHEMA.md."""
    schema = vault / SCHEMA_FILE
    if not schema.is_file():
        return None
    declared: dict[str, set[str]] = defaultdict(set)
    for fence in yaml_fences(read_text(schema)):
        lines = [line for line in fence.split("\n") if line.strip() != "---"]
        fm = parse_frontmatter("\n".join(lines))
        type_value = fm.get("type")
        if not isinstance(type_value, str):
            continue
        for name in (part.strip() for part in type_value.split("|")):
            if TYPE_NAME_RE.match(name):
                declared[name].update(fm.keys())
    return dict(declared)


def declared_tags(vault: Path) -> list[str]:
    """Top-level tags listed under SCHEMA.md's taxonomy heading, as `- `tag` — ...` items."""
    schema = vault / SCHEMA_FILE
    if not schema.is_file():
        return []
    tags: list[str] = []
    inside = False
    for line in read_text(schema).split("\n"):
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
            if fm is not None and "sha256" in fm:
                # A Raw Source note: audit.md keeps it under the drift check
                # (raw_source_facts) and out of schema compliance.
                continue
            untyped.append({"path": note["rel"], "has_frontmatter": fm is not None})
            continue
        by_type[type_value].append(fm)

    types = {}
    for type_name, fms in sorted(by_type.items()):
        total = len(fms)
        decl = declared.get(type_name) if declared is not None else None
        observed = set().union(*(fm.keys() for fm in fms))
        fields = {}
        for field in sorted(observed | (decl or set())):
            present = sum(1 for fm in fms if field in fm)
            filled = sum(1 for fm in fms if field in fm and not is_empty(fm[field]))
            empty = total - filled
            pct = round(100.0 * empty / total, 1)
            fields[field] = {
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
            "fields": fields,
            "undeclared": undeclared,
        }
    return types, untyped


def link_facts(notes: list[dict], scoped: list[dict]) -> dict:
    by_rel = {note["rel"] for note in notes}
    by_stem: dict[str, list[str]] = defaultdict(list)
    for note in notes:
        by_stem[Path(note["rel"]).stem.lower()].append(note["rel"])

    def resolve(target: str) -> str | None:
        name = target[:-3] if target.endswith(".md") else target
        if "/" in name and f"{name}.md" in by_rel:
            return f"{name}.md"
        hits = by_stem.get(Path(name).name.lower())
        return hits[0] if hits else None

    outbound: dict[str, int] = {}
    inbound: Counter = Counter()
    for note in notes:
        targets = set()
        for match in WIKILINK_RE.finditer(note["text"]):
            raw = match.group(1).strip()
            if raw and Path(raw).suffix.lower() not in NON_NOTE_EXTS:
                targets.add(raw)
        resolved = {resolve(raw) for raw in targets}
        outbound[note["rel"]] = len(targets) - (1 if note["rel"] in resolved else 0)
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
    """The Raw Source note (`sha256`, no `type:`) the body wikilinks — when it links exactly one."""
    hits: set[Path] = set()
    for match in WIKILINK_RE.finditer(note["body"]):
        target = match.group(1).strip()
        name = target[:-3] if target.endswith(".md") else target
        rels = [f"{name}.md"] if f"{name}.md" in files else md_by_stem.get(Path(name).name.lower(), [])
        for rel in rels:
            fm_text, _ = split_frontmatter(read_text(files[rel]))
            fm = parse_frontmatter(fm_text) if fm_text is not None else None
            if fm is not None and "sha256" in fm and note_type(fm) is None:
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
        if not stored:
            status = "unhashed"
        elif recomputed is None:
            status = "unresolved"
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


def log_facts(vault: Path, files: dict[str, Path]) -> dict:
    log = vault / LOG_FILE
    if not log.is_file():
        return {"path": None, "entries": 0, "missing_files": []}
    basenames = {Path(rel).name for rel in files}
    entries = 0
    missing = []
    for line_no, line in enumerate(read_text(log).split("\n"), 1):
        if LOG_ENTRY_RE.match(line):
            entries += 1
        for part in line.split("|"):
            token = part.strip().strip("`")
            if not FILE_TOKEN_RE.search(token):
                continue
            if token in files or token.lstrip("./") in files or Path(token).name in basenames:
                continue
            missing.append({"line": line_no, "file": token})
    return {"path": LOG_FILE, "entries": entries, "missing_files": missing}


def tag_facts(scoped: list[dict], declared: list[str], tag_min) -> dict:
    """Tag counts; `exceeds` only for a tag outside the taxonomy (top-level segment undeclared)."""
    counts: Counter = Counter()
    for note in scoped:
        tags = (note["fm"] or {}).get("tags", [])
        if isinstance(tags, str):
            tags = [t for t in re.split(r"[,\s]+", tags) if t]
        elif isinstance(tags, dict):
            tags = list(tags)
        for tag in tags:
            if isinstance(tag, str) and tag:
                counts[tag.lstrip("#")] += 1
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
    scoped = select_scope(notes, scope)
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
        "notes": {"total": len(notes), "in_scope": len(scoped)},
        "schema": {
            "path": SCHEMA_FILE if declared is not None else None,
            "declared_types": sorted(declared) if declared else [],
            "declared_tags": taxonomy,
        },
        "untyped": untyped,
        "types": types,
        "links": link_facts(notes, scoped),
        "raw_sources": raw_source_facts(scoped, vault, files),
        "log": log_facts(vault, files),
        "tags": tag_facts(scoped, taxonomy, thresholds["tag_min"]),
        "duplicate_titles": duplicate_title_facts(notes, scoped, thresholds["title_match"]),
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
        f"({notes['in_scope']} of {notes['total']} notes)"
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
