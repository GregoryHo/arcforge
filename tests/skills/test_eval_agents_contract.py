from pathlib import Path


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


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


def test_eval_grader_doc_matches_trial_level_contract():
    text = _read("skills/arc-evaluating/agents/eval-grader.md")
    lower = text.lower()
    front = _parse_frontmatter(text)

    assert front.get("name") == "eval-grader"
    assert "single trial" in lower or "individual trial" in lower
    assert "assertion" in lower and "evidence" in lower
    assert "harness" in lower and "recompute" in lower


def test_eval_grader_doc_describes_structured_json_response():
    text = _read("skills/arc-evaluating/agents/eval-grader.md")
    lower = text.lower()

    assert '"scores"' in text
    assert '"evidence"' in text
    assert '"overall"' in text
    assert '"passed"' in text
    assert "only a json object" in lower
    assert "0.25" in text
    assert "0.75" in text


def test_eval_analyzer_doc_is_qualitative_not_numeric_engine():
    text = _read("skills/arc-evaluating/agents/eval-analyzer.md")
    lower = text.lower()
    front = _parse_frontmatter(text)

    assert front.get("name") == "eval-analyzer"
    assert "qualitative" in lower
    assert "programmatic" in lower or "provided metrics" in lower
    assert "do not recompute" in lower or "do not invent" in lower


def test_eval_analyzer_doc_requests_analysis_over_per_assertion_math():
    text = _read("skills/arc-evaluating/agents/eval-analyzer.md")
    lower = text.lower()

    # Analyzer documents analysis fields (no verdict authority).
    assert '"analysis"' in text
    # New output schema: analytical fields only — no recommendation or verdict.
    assert '"recommendation"' not in text, (
        "eval-analyzer must not include a recommendation field (verdict authority stripped)"
    )
    assert '"delta_explanation"' in text
    assert '"weak_assertions_patterns"' in text
    assert '"variance_notes"' in text
    assert '"per_assertion"' not in text
    assert "regression" in lower or "improvement" in lower
