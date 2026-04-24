from pathlib import Path

import pytest


SKILL_PATH = Path("skills/arc-auditing-spec/SKILL.md")
AGENT_NAMES = [
    "arc-auditing-spec-cross-artifact-alignment",
    "arc-auditing-spec-internal-consistency",
    "arc-auditing-spec-state-transition-integrity",
]
AGENT_PATHS = [Path(f"agents/{name}.md") for name in AGENT_NAMES]

READ_ONLY_TOOLS = {"Read", "Grep", "Glob"}
FORBIDDEN_TOOLS = {"Edit", "Write", "Bash", "NotebookEdit"}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        raise AssertionError("missing frontmatter start")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise AssertionError("missing frontmatter end")
    raw = text[4:end]
    body = text[end + 5 :]
    data: dict = {}
    current_key: str | None = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        if line.startswith(" ") or line.startswith("\t") or line.startswith("-"):
            if current_key is not None:
                data[current_key] = (data.get(current_key, "") + "\n" + line).strip()
            continue
        if ":" in line:
            key, value = line.split(":", 1)
            current_key = key.strip()
            data[current_key] = value.strip()
    return data, body


def _extract_tools_list(front: dict) -> list[str]:
    raw = front.get("tools", "")
    tools: list[str] = []
    for piece in raw.replace("\n", ",").split(","):
        piece = piece.strip().lstrip("-").strip()
        if piece:
            tools.append(piece)
    return tools


def test_skill_frontmatter_and_structure():
    text = _read(SKILL_PATH)
    front, body = _parse_frontmatter(text)

    assert front.get("name") == "arc-auditing-spec"
    assert front.get("description", "").startswith("Use when")
    assert len(front.get("name", "") + front.get("description", "")) < 1024
    assert "@" not in text  # no @-syntax file loading

    # Iron Law + invocation contract + Red Flags must all be present
    assert "## Iron Law" in body
    assert "READ-ONLY ADVISORY" in body.upper() or "read-only advisory" in body.lower()
    assert "## Invocation Contract" in body
    assert "Phase 0" in body
    assert "## Red Flags" in body or "Red Flags — STOP" in body


def test_skill_references_three_agents():
    body = _read(SKILL_PATH)
    for name in AGENT_NAMES:
        assert name in body, f"SKILL.md must reference agent: {name}"


@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_read_only_tool_grant(path: Path):
    """sc-002-ac3: agent tool allowlist MUST be read-only, enforced by frontmatter."""
    assert path.exists(), f"agent file missing: {path}"
    text = _read(path)
    front, _ = _parse_frontmatter(text)

    tools = _extract_tools_list(front)
    assert tools, f"{path} must declare a `tools:` allowlist (sc-002-ac3)"

    for tool in tools:
        assert tool in READ_ONLY_TOOLS, (
            f"{path} tool '{tool}' is not in the read-only allowlist "
            f"{sorted(READ_ONLY_TOOLS)} — sc-002-ac3 forbids extensions"
        )
    for forbidden in FORBIDDEN_TOOLS:
        assert forbidden not in tools, (
            f"{path} must NOT grant '{forbidden}' (sc-002-ac3); "
            f"read-only is structural, not prose-based"
        )


@pytest.mark.parametrize("path", AGENT_PATHS, ids=[p.name for p in AGENT_PATHS])
def test_agent_frontmatter_identity(path: Path):
    text = _read(path)
    front, _ = _parse_frontmatter(text)
    assert front.get("name") == path.stem


def test_no_pipeline_auto_invocation_of_audit_skill():
    """sc-001-ac3: no pipeline skill's SKILL.md may invoke /arc-auditing-spec."""
    pipeline_skills = [
        "skills/arc-brainstorming/SKILL.md",
        "skills/arc-refining/SKILL.md",
        "skills/arc-planning/SKILL.md",
    ]
    for skill in pipeline_skills:
        path = Path(skill)
        if not path.exists():
            continue  # skill may not exist at this point in the tree
        content = path.read_text(encoding="utf-8")
        # forbidden: slash-command invocation of our skill from upstream pipeline body
        assert "/arc-auditing-spec" not in content, (
            f"{skill} must not invoke /arc-auditing-spec — pipeline auto-invocation "
            f"is forbidden by fr-sc-001-ac3"
        )
