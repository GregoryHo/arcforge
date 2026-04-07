# Obsidian Skills Tasks

> **Goal:** Two skills — arc-writing-obsidian (conversational crystallizer) and arc-auditing-obsidian (wiki lint layer) — following Karpathy's LLM Wiki pattern for Obsidian vaults.
> **Architecture:** Workflow skill (writer) + Discipline skill (auditor). Writer creates artifacts with opinionated templates, auditor maintains graph health. Both delegate format work to kepano's obsidian skills.
> **Tech Stack:** SKILL.md (markdown), pytest (validation), obsidian-cli + obsidian-markdown + json-canvas (delegation targets)

> **For Claude:** Use arc-executing-tasks to implement.

## Context

Design doc: `docs/plans/2026-04-07-obsidian-skills-design.md`
Research: `docs/research/obsidian-skill-research.md`

Naming convention correction: design doc says `arc-obsidian-writer` / `arc-obsidian-auditor` but arcforge naming rules require gerund-first → `arc-writing-obsidian` / `arc-auditing-obsidian`.

## Tasks

### Task 1: Write failing tests for arc-writing-obsidian

**Files:**
- Create: `tests/skills/test_skill_arc_writing_obsidian.py`

**Step 1: Write failing test**
```python
from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-writing-obsidian/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def _parse_frontmatter(text: str) -> dict:
    if not text.startswith("---\n"):
        raise AssertionError("missing frontmatter start")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise AssertionError("missing frontmatter end")
    front = text[4:end].strip().splitlines()
    data = {}
    for line in front:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def test_arc_writing_obsidian_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-writing-obsidian"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024
    assert "@" not in text


def test_arc_writing_obsidian_has_page_types():
    """Writer must define all 6 Karpathy page types."""
    text = _read_skill()
    for page_type in ["source", "entity", "synthesis", "moc", "decision", "log"]:
        assert page_type.lower() in text.lower(), f"missing page type: {page_type}"


def test_arc_writing_obsidian_has_classify_confirm_create_pipeline():
    """Writer must follow classify → confirm → create pipeline."""
    text = _read_skill().lower()
    assert "classify" in text
    assert "confirm" in text
    assert "create" in text or "template" in text


def test_arc_writing_obsidian_has_fast_path():
    """Writer must support fast path for unambiguous classification."""
    text = _read_skill().lower()
    assert "fast path" in text or "fast-path" in text


def test_arc_writing_obsidian_has_frontmatter_schema():
    """Writer must define opinionated frontmatter templates."""
    text = _read_skill()
    assert "type:" in text
    assert "created:" in text
    assert "tags:" in text


def test_arc_writing_obsidian_delegates_to_obsidian_skills():
    """Writer must delegate to kepano's obsidian skills."""
    text = _read_skill()
    assert "obsidian-markdown" in text or "obsidian:obsidian-markdown" in text
    assert "json-canvas" in text or "obsidian:json-canvas" in text


def test_arc_writing_obsidian_has_completion_formats():
    """Writer must have standard completion/blocked formats."""
    text = _read_skill()
    assert "✅" in text
    assert "⚠️" in text


def test_arc_writing_obsidian_no_vault_awareness():
    """Writer must NOT resolve wikilinks — that's the auditor's job."""
    text = _read_skill().lower()
    assert "plain text" in text and "relationship" in text
```

**Step 2: Run test**
Run: `python3 -m pytest tests/skills/test_skill_arc_writing_obsidian.py -v`
Expected: FAIL (FileNotFoundError — skill doesn't exist yet)

**Step 3: Commit**
`git commit -m "test: add failing tests for arc-writing-obsidian skill"`

---

### Task 2: Write failing tests for arc-auditing-obsidian

**Files:**
- Create: `tests/skills/test_skill_arc_auditing_obsidian.py`

**Step 1: Write failing test**
```python
from pathlib import Path


def _read_skill() -> str:
    skill_path = Path("skills/arc-auditing-obsidian/SKILL.md")
    return skill_path.read_text(encoding="utf-8")


def _parse_frontmatter(text: str) -> dict:
    if not text.startswith("---\n"):
        raise AssertionError("missing frontmatter start")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise AssertionError("missing frontmatter end")
    front = text[4:end].strip().splitlines()
    data = {}
    for line in front:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def test_arc_auditing_obsidian_frontmatter():
    text = _read_skill()
    front = _parse_frontmatter(text)

    assert front.get("name") == "arc-auditing-obsidian"
    assert front.get("description", "").startswith("Use when")
    assert len((front.get("name", "") + front.get("description", ""))) < 1024
    assert "@" not in text


def test_arc_auditing_obsidian_has_three_operations():
    """Auditor must define LINK, LINT, and GROW operations."""
    text = _read_skill().upper()
    assert "LINK" in text
    assert "LINT" in text
    assert "GROW" in text


def test_arc_auditing_obsidian_link_resolves_wikilinks():
    """LINK operation must resolve plain text to wikilinks."""
    text = _read_skill().lower()
    assert "wikilink" in text or "[[" in text


def test_arc_auditing_obsidian_lint_checks_schema():
    """LINT must check frontmatter schema compliance."""
    text = _read_skill().lower()
    assert "schema" in text or "frontmatter" in text
    assert "orphan" in text


def test_arc_auditing_obsidian_grow_proposes_only():
    """GROW must propose, never auto-create."""
    text = _read_skill().lower()
    assert "propose" in text or "suggest" in text


def test_arc_auditing_obsidian_has_invocation_commands():
    """Auditor must define invocation subcommands."""
    text = _read_skill().lower()
    assert "link" in text and "lint" in text and "grow" in text


def test_arc_auditing_obsidian_delegates_to_obsidian_cli():
    """Auditor must use obsidian-cli for vault operations."""
    text = _read_skill()
    assert "obsidian-cli" in text or "obsidian:obsidian-cli" in text


def test_arc_auditing_obsidian_has_batch_mode():
    """Auditor must support batching for large vaults."""
    text = _read_skill().lower()
    assert "batch" in text or "recent" in text


def test_arc_auditing_obsidian_has_completion_formats():
    """Auditor must have standard completion/blocked formats."""
    text = _read_skill()
    assert "✅" in text
    assert "⚠️" in text
```

**Step 2: Run test**
Run: `python3 -m pytest tests/skills/test_skill_arc_auditing_obsidian.py -v`
Expected: FAIL (FileNotFoundError — skill doesn't exist yet)

**Step 3: Commit**
`git commit -m "test: add failing tests for arc-auditing-obsidian skill"`

---

### Task 3: Implement arc-writing-obsidian SKILL.md

**Files:**
- Create: `skills/arc-writing-obsidian/SKILL.md`

**Step 1: Write SKILL.md**

The skill must include:
- Frontmatter: `name: arc-writing-obsidian`, `description: Use when...`
- Pipeline: classify → confirm → create (with fast path)
- All 6 page types with trigger signals
- Opinionated frontmatter templates per page type
- Delegation to obsidian-markdown, json-canvas, obsidian-cli
- Plain text relationships (no vault awareness)
- Tier system: T1 markdown+mermaid, T2 canvas
- Completion (✅) and blocked (⚠️) formats

Content: Implement based on design doc Sections 1-2 (`docs/plans/2026-04-07-obsidian-skills-design.md`).

**Step 2: Run test**
Run: `python3 -m pytest tests/skills/test_skill_arc_writing_obsidian.py -v`
Expected: PASS (all 8 tests)

**Step 3: Commit**
`git commit -m "feat(skills): add arc-writing-obsidian — conversational crystallizer for Obsidian"`

---

### Task 4: Implement arc-auditing-obsidian SKILL.md

**Files:**
- Create: `skills/arc-auditing-obsidian/SKILL.md`

**Step 1: Write SKILL.md**

The skill must include:
- Frontmatter: `name: arc-auditing-obsidian`, `description: Use when...`
- Three operations: LINK, LINT, GROW
- LINK: resolve plain text → wikilinks via obsidian-cli
- LINT: schema compliance, orphans, staleness, contradictions, tag hygiene
- GROW: gap analysis, entity extraction, MOC suggestions (propose only)
- Invocation commands: `/auditor link`, `/auditor lint`, `/auditor grow`, `/auditor`
- Batch mode (default 50 most recent, --all for full scan)
- Audit report output format
- Delegation to obsidian-cli, obsidian-markdown
- Completion (✅) and blocked (⚠️) formats

Content: Implement based on design doc Section 3 (`docs/plans/2026-04-07-obsidian-skills-design.md`).

**Step 2: Run test**
Run: `python3 -m pytest tests/skills/test_skill_arc_auditing_obsidian.py -v`
Expected: PASS (all 9 tests)

**Step 3: Commit**
`git commit -m "feat(skills): add arc-auditing-obsidian — wiki lint layer for Obsidian vaults"`

---

### Task 5: Register skills in arc-using routing table

**Files:**
- Modify: `skills/arc-using/SKILL.md`

**Step 1: Add writer to Skill Priority section**

Add example to the existing Skill Priority examples list:
```
- "Create a note/document/diagram for Obsidian" → arc-writing-obsidian
```

**Step 2: Add auditor to Discipline Skills table**

Add to the Discipline Skills — Conditional Triggers table:

| Condition | Skill | Iron Law |
|-----------|-------|----------|
| User asks about vault health, missing links, or orphan notes | `arc-auditing-obsidian` | Propose changes, never auto-modify without approval |

**Step 3: Run test**
Run: `npm run test:skills`
Expected: All tests PASS (161 existing + 17 new = 178)

**Step 4: Commit**
`git commit -m "feat(skills): register obsidian skills in arc-using routing table"`

---

### Task 6: Lint and full test suite

**Step 1: Lint**
Run: `npm run lint:fix`
Expected: No errors in skills (markdown files not linted by Biome, but verify no issues)

**Step 2: Full test suite**
Run: `npm test`
Expected: All 4 runners pass

**Step 3: Commit (if lint fixes needed)**
`git commit -m "chore: lint fixes for obsidian skills"`

---

### Task 7: Real-prompt evaluation — arc-writing-obsidian

Test the writer skill with realistic user scenarios. Create test prompts and run Claude with the skill loaded.

**Test prompts:**

1. **Source ingestion**: "I just read this article about RAG vs fine-tuning, here's the key points: [paste]. Save this to my vault."
2. **Entity creation**: "I keep hearing about LangGraph — what is it and can you add it to my notes?"
3. **Synthesis from conversation**: "We've been discussing Karpathy's LLM Wiki and kepano's file-over-app philosophy. How do they relate? Create a note connecting these ideas."
4. **Decision capture**: "I'm choosing between Obsidian Sync and git for vault backup. Sync is easier but costs money, git is free but manual. I'm going with git."
5. **Fast path test**: "Log: met with Alice about the API migration timeline — targeting Q3"

**Evaluation criteria:**
- Does it classify the correct page type?
- Does it use the confirm step (or correctly skip via fast path)?
- Is the frontmatter schema correct for the page type?
- Does it delegate to kepano's obsidian-markdown skill?
- Are relationships left as plain text (not wikilinks)?
- Is the output a note you'd actually want in your vault?

**Step 1:** Save test prompts to `evals/arc-writing-obsidian/evals.json`
**Step 2:** Run each prompt with the skill loaded, save outputs
**Step 3:** Review outputs qualitatively — iterate on SKILL.md if needed
**Step 4:** Commit any improvements

---

### Task 8: Real-prompt evaluation — arc-auditing-obsidian

Test the auditor skill against a sample vault structure.

**Test prompts:**

1. **Link pass**: "I just created 3 new notes. Can you link them into my vault?" (provide sample notes with plain-text relationships)
2. **Lint pass**: "Check my vault health" (provide sample notes, some missing frontmatter, some orphans)
3. **Grow pass**: "What's missing in my vault?" (provide 5+ source notes on a topic with no synthesis note)

**Evaluation criteria:**
- Does LINK correctly identify plain-text relationships and propose wikilinks?
- Does LINT catch schema violations and orphan notes?
- Does GROW propose (not auto-create) new artifacts?
- Does the audit report use the correct format?
- Does it batch correctly (default 50 most recent)?

**Step 1:** Create sample vault fixture in `evals/arc-auditing-obsidian/`
**Step 2:** Run each prompt with the skill loaded, save outputs
**Step 3:** Review outputs qualitatively — iterate on SKILL.md if needed
**Step 4:** Commit any improvements

---

### Task 9: Description optimization

After skills are stable and eval passes, optimize the `description` frontmatter field for reliable triggering.

**Step 1:** Draft 20 trigger eval queries (10 should-trigger, 10 should-not-trigger) per skill
**Step 2:** Run description optimization loop (skill-creator methodology)
**Step 3:** Update SKILL.md frontmatter with optimized descriptions
**Step 4:** Verify pytest still passes
**Step 5:** Commit
`git commit -m "feat(skills): optimize obsidian skill descriptions for triggering"`
