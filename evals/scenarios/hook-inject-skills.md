# Eval: hook-inject-skills

## Scope

agent

## Scenario

List the arcforge skills you know about. For each skill, give its name and a one-sentence description of when to use it.

## Context

You are in a project directory. Answer based only on what you know from your current session context.

## Setup

ARCFORGE="$PROJECT_ROOT"
mkdir -p .claude
cat > .claude/settings.local.json << HOOKS_EOF
{
  "hooks": {
    "SessionStart": [{
      "matcher": ".*",
      "hooks": [{
        "type": "command",
        "command": "bash ${ARCFORGE}/hooks/inject-skills/main.sh"
      }]
    }]
  }
}
HOOKS_EOF

## Assertions

- [ ] Claude lists at least 3 specific arcforge skill names from the injected arc-using content (arc-brainstorming, arc-debugging, arc-tdd, arc-planning, arc-writing-tasks, arc-coordinating, arc-implementing)
- [ ] Claude demonstrates knowledge that these are arcforge toolkit skills (not generic concepts) — references arcforge, the toolkit, or the skill system
- [ ] Claude does NOT say it has no information about arcforge or that arcforge skills don't exist (minor caveats about individual skill details are acceptable)

## Grader

model

## Grader Config

The eval question is: "Did the inject-skills hook successfully give Claude awareness of arcforge skills?"

Assertion 1 (skill names): 1.0 if 3+ correct names from the list. 0.5 if 1-2 names. 0.0 if no correct names or only fabricated names.

Assertion 2 (arcforge awareness): 1.0 if Claude frames these as arcforge/toolkit skills (not just generic concepts). 0.5 if ambiguous framing. 0.0 if Claude treats them as generic ideas unrelated to arcforge.

Assertion 3 (no total ignorance): 1.0 if Claude demonstrates knowledge of arcforge skills — minor caveats like "I only have summary info" are acceptable and score 1.0. Only score 0.0 if Claude says it has NO information about arcforge skills at all.

## Trials

5
