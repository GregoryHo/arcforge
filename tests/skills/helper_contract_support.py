"""Structural mutations and the one-line failure contract shared by the
diagramming-obsidian helper tests.

B-8 promises that a helper which cannot do its job exits non-zero with one
line on stderr and never a Python traceback. `mutations()` breaks a valid
input one field at a time; `contract_violations()` checks that promise and nothing
else, so a mutation may succeed or fail but may not crash.
"""

from __future__ import annotations

import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Iterator

# Each field is replaced, in turn, by null, a number, a string, an object and an array.
REPLACEMENTS = (None, 7, "s", {"k": 1}, [1])


def _paths(node, prefix: tuple = ()) -> Iterator[tuple]:
    if isinstance(node, dict):
        items = node.items()
    elif isinstance(node, list):
        items = enumerate(node)
    else:
        return
    for key, child in items:
        yield prefix + (key,)
        yield from _paths(child, prefix + (key,))


def _replace(doc, path: tuple, value):
    copy = json.loads(json.dumps(doc))
    node = copy
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return copy


def mutations(doc) -> list[tuple[str, object]]:
    """Every field and array entry of `doc`, each replaced by every REPLACEMENTS value."""
    return [
        (f"{'/'.join(map(str, path))}={json.dumps(value)}", _replace(doc, path, value))
        for path in _paths(doc)
        for value in REPLACEMENTS
    ]


def run_all(cases: list, run: Callable[[object], subprocess.CompletedProcess]) -> list:
    """Run `run(case)` for every case, in parallel; results keep the input order."""
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(run, cases))


def contract_violations(results: list[tuple[str, subprocess.CompletedProcess]], prefix: str) -> list[str]:
    """Name each result that breaks B-8: a traceback, or a failure that is not one `prefix` line."""
    bad = []
    for name, proc in results:
        lines = proc.stderr.splitlines()
        if "Traceback" in proc.stderr:
            bad.append(f"{name}: traceback\n{proc.stderr}")
        elif proc.returncode != 0 and (len(lines) != 1 or not lines[0].startswith(prefix)):
            bad.append(f"{name}: exit {proc.returncode}, stderr {proc.stderr!r}")
    return bad
