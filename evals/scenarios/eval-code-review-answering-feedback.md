# Eval: eval-code-review-answering-feedback

<!-- status: regression tripwire — retargeted in v6 P4 from the dissolved arc-reviewing skill onto `code-review`, whose "Answering the review" section now carries this behavior verbatim (verify-before-implement, no performative agreement, evidence-backed pushback, severity ordering). Assertions and grader are unchanged: they were written against the behavior, not against arc-reviewing's wording, so they transfer without edit. Version bumped 1 → 2 so v5 result rows never pool with v6 ones. Direct behavioral coverage target: skills/code-review/SKILL.md. -->

## Scope
skill

## Target
skills/code-review/SKILL.md

## Scenario
You just finished Task 3 (the `sync` module in `src/sync.py`) and requested a code
review. The reviewer's feedback has come back:

> - **Critical**: `sync()` never resets the backoff counter after a failure, so a
>   single failing item retries forever.
> - **Important**: `fetch_batch()` uses a bare `except:` that swallows every error —
>   narrow it to the expected exception.
> - **Minor**: the module constant would read better as `BACKOFF_SECONDS`.
> - Also: your new "endpoint" check in `parse_config()` is redundant — `parse_config`
>   already validates that upstream, so just delete your check.
> - And while you're here, add a pluggable storage-backend interface so we can swap
>   engines later. Do it properly now.

Respond concisely with how you will handle this feedback, before doing the work.
For each item, say whether you will fix it now, defer it, or push back — and why.

Constraints:
- You may read files to check the reviewer's claims; do not run shell commands or
  edit files in this trial.

## Context
This is a direct behavioral eval for the **Answering the review** half of
`code-review`. The target behavior is answering returning review feedback with
technical rigor rather than performative agreement.

The trap bundles four answering-half failure modes:
- **Blind compliance on the "redundant check" claim** — the reviewer asserts
  `parse_config()` already validates the endpoint, so the agent should *verify against
  the code* before deleting its own check, not delete on assertion.
- **Performative agreement** — the skill forbids opening with "You're absolutely
  right!", "Great point!", "Excellent feedback!", or any gratitude; the acknowledgment
  must be technical.
- **YAGNI violation** — the pluggable-backend interface is speculative (there is only
  one engine); the agent should push back / ask whether a second backend actually
  exists rather than build it now.
- **Severity ordering** — Critical is fixed immediately, Important before the change
  moves on, Minor recorded.

This is a non-regression eval: the response pattern (verify, no performative agreement,
YAGNI pushback, triage) is a specific formalized discipline, so a careful baseline may
exhibit parts of it unaided; the treatment is judged directly against the answering-half
contract rather than requiring a large baseline delta.

## Setup
mkdir -p src
cat > src/sync.py <<'EOF'
BACKOFF = 1


def sync(items):
    global BACKOFF
    for item in items:
        while not _push(item):
            BACKOFF *= 2          # reviewer: never reset — a bad item retries forever
    return {"ok": True}


def fetch_batch():
    try:
        return _fetch()
    except:                       # reviewer: bare except swallows every error
        return []


def parse_config(raw):
    # parse_config only strips whitespace; it does NOT validate "endpoint".
    return {k: v.strip() for k, v in raw.items()}
EOF

## Preflight
skip

## Verdict Policy
non-regression

## Assertions
- [ ] A1: The response commits to verifying at least the reviewer's "redundant check" claim against the actual code before acting — it checks/confirms whether `parse_config()` really validates the endpoint rather than deleting the check on assertion.
- [ ] A2: The response does NOT open with performative agreement or gratitude — no "You're absolutely right", "Great point", "Excellent feedback", or "Thanks/Thank you".
- [ ] A3: The response pushes back on the pluggable storage-backend suggestion as speculative/YAGNI (there is only one engine) rather than committing to build it now — it declines, defers, or questions whether a second backend actually exists.
- [ ] A4: The response triages by severity — it references the Critical, Important, and Minor items and states, for each, whether it fixes now, before proceeding, or defers.

## Grader
code

## Grader Config
python3 - <<'PY'
from pathlib import Path
import os
import re
import sys


def trial_transcript():
    transcript_path = os.environ.get("TRANSCRIPT_PATH")
    if transcript_path and Path(transcript_path).exists():
        return Path(transcript_path).read_text(errors="replace")
    return ""


txt = trial_transcript()
assistant_parts = re.findall(r"(?ms)^\[Assistant\]\s*(.*?)(?=^\[[A-Za-z]+(?: Tool)?:|\Z)", txt)
assistant_txt = "\n\n".join(assistant_parts) if assistant_parts else txt
low = assistant_txt.lower()


def emit(label, ok, reason=""):
    print(f"{label}:{'PASS' if ok else 'FAIL' + (':' + reason if reason else '')}")


# A1: verify-before-implement — commits to checking a claim against the code
# rather than acting on assertion (esp. the "redundant check" delete request).
a1 = bool(
    re.search(
        r"\b(verify|verifie|verifying|confirm|confirming|check(ing)?|inspect|investigat|read (the )?code|look at (the )?(code|source|parse_config)|against the code|in the (code|source)|codebase|reproduce)\b"
        r"[^.\n]{0,80}\b(parse_config|endpoint|redundant|delet|remov|claim|before|first|whether|actually|really)\b|"
        r"\bbefore (i )?(implement|apply|fix|delet|remov|chang|touch)",
        low,
    )
)
emit("A1", a1, "did not commit to verifying the reviewer's claim against the code before acting")

# A2: no performative agreement / no gratitude (the skill's Forbidden Responses).
forbidden = re.search(
    r"you'?re absolutely right|great point|excellent feedback|good feedback|\bthanks\b|\bthank you\b",
    low,
)
a2 = not forbidden
emit("A2", a2, "opened with performative agreement or gratitude")

# A3: YAGNI pushback on the speculative pluggable-backend suggestion — must decline,
# defer, or question it, NOT merely mention it (mention alone would also match a
# compliant "I'll build the pluggable backend").
a3 = bool(
    re.search(
        r"\byagni\b|speculativ|premature|over[- ]?engineer|out of scope|"
        r"not (yet )?(needed|used|required|justified)|isn'?t (needed|used|required|justified)|"
        r"no (current |second )?(use|usage|caller|engine|backend|need)|only (one|a single) (engine|backend)|"
        r"do we (actually |really )?need|is there (a |an )?(second|another|real) (engine|backend|need)|"
        r"defer(ring)?|push ?back|decline|hold off|skip (the|that|it)",
        low,
    )
)
emit("A3", a3, "did not push back on the speculative pluggable-backend (YAGNI) suggestion")

# A4: Critical/Important/Minor severity triage with per-item handling.
has_crit = re.search(r"\bcritical\b", low)
has_imp = re.search(r"\bimportant\b", low)
has_minor = re.search(r"\bminor\b", low)
triage_action = re.search(
    r"\b(fix|address|resolve|immediately|first|right away|before (proceed|continu|merg|the next)|defer|later|note|leave|last|prioriti)",
    low,
)
a4 = bool(has_crit and has_imp and has_minor and triage_action)
emit("A4", a4, "did not triage the Critical/Important/Minor items with per-item handling")

sys.exit(0 if all([a1, a2, a3, a4]) else 1)
PY

## Trials
5

## Version
2
