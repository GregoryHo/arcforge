"""Contract test for diagramming-obsidian's `references/verify_saved_diagram.py`
on the `ea.create()` save path, whose drawing is a compressed-json block.

The verifier does not decode that block, so on this path it checks the format
markers and nothing else. Its success line and its docstring must say so rather
than imply the canvas was rendered.
"""

import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = PROJECT_ROOT / "skills" / "core" / "diagramming-obsidian" / "references" / "verify_saved_diagram.py"

MARKERS = (
    "---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n"
    "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==\n\n"
    "# Excalidraw Data\n\n## Text Elements\n\n## Drawing\n"
)


def _verify(tmp_path: Path, content: str) -> subprocess.CompletedProcess:
    saved = tmp_path / "d.excalidraw.md"
    saved.write_text(content, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(saved)], capture_output=True, text=True, check=False
    )


def test_compressed_block_passes_on_format_markers_alone(tmp_path):
    # The payload is not valid compressed data: the verifier never decodes it.
    proc = _verify(tmp_path, MARKERS + "```compressed-json\nnot-a-real-payload\n```\n%%\n")
    assert proc.returncode == 0, proc.stderr
    assert "format markers" in proc.stdout
    assert "not decoded or rendered" in proc.stdout


def test_compressed_block_missing_a_marker_fails(tmp_path):
    content = MARKERS.replace("tags: [excalidraw]\n", "") + "```compressed-json\nx\n```\n"
    proc = _verify(tmp_path, content)
    assert proc.returncode == 1
    assert "missing format markers" in proc.stderr


def test_docstring_says_the_compressed_path_checks_markers_only():
    doc = SCRIPT.read_text(encoding="utf-8").split('"""')[1]
    assert "compressed-json" in doc and "markers only" in doc
    assert "either save path" not in doc
