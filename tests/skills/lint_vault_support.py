"""Fixture vault, constants, and the subprocess runner shared by the lint_vault tests."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

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


RAW_BODY = "# Fed statement\n\nRates unchanged.\n"
RAW_DIGEST = hashlib.sha256(RAW_BODY.encode("utf-8")).hexdigest()


PRESETS = Path(__file__).resolve().parents[2] / "skills" / "core" / "maintaining-obsidian" / "presets"


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


def build_vault(tmp_path: Path) -> Path:
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
