# Reflection report format

Open this when writing up a reflection over accumulated diaries.

Rule violations come first, patterns second, observations last. The ordering is
deliberate: a violation is something the project already decided and keeps
failing to hold, which outranks a newly noticed tendency.

```markdown
## Reflect Strategy

**Mode:** {unprocessed|project_focused|recent_window}
**Diaries analyzed:** {count}
**Reason:** {why this mode was selected}
**Projects covered:** {project} ({count}), ...

---

## Rule Violations Detected (PRIORITY)

### Violation: {rule-name}

**Existing rule:** "{quoted from CLAUDE.md}"
**Violation pattern:** the user corrected this in {N} sessions
**Evidence:**
- [YYYY-MM-DD] diary-{id}: "{correction quote}"
- [YYYY-MM-DD] diary-{id}: "{correction quote}"
**Suggested action:** {what could change} — the user decides

---

## Patterns Identified (3+ occurrences)

### Pattern: {pattern-name}

**Occurrences:** {N} sessions
**Evidence:**
- [YYYY-MM-DD] session {id}: {how it appeared}
- [YYYY-MM-DD] session {id}: {how it appeared}
- [YYYY-MM-DD] session {id}: {how it appeared}
**Implication:** {what this suggests}
**Instinct to save:** id `{kebab-case-id}`, trigger "{when}", action "{what}",
domain `{domain}`, evidence count {N}

---

## Observations (1-2 occurrences)

- {observation}: seen in {N} session(s)
```

## Worked example

```markdown
## Reflect Strategy

**Mode:** unprocessed
**Diaries analyzed:** 5
**Reason:** 5 diaries had accumulated since the last reflection
**Projects covered:** payments-api (5)

---

## Rule Violations Detected (PRIORITY)

### Violation: test-before-fix

**Existing rule:** "Write a test that reproduces the bug, then make it pass"
**Violation pattern:** the user corrected this in 3 sessions
**Evidence:**
- [2026-08-04] diary-9c11: "write the failing test first please"
- [2026-08-09] diary-2ab7: "again — test first, then the patch"
- [2026-08-13] diary-4f21: "asked for it twice after I went straight to the patch"
**Suggested action:** the rule exists and is being skipped under time pressure;
strengthening the wording may not be the fix — the user decides

---

## Patterns Identified (3+ occurrences)

### Pattern: read-siblings-before-adding-a-third

**Occurrences:** 3 sessions
**Evidence:**
- [2026-07-30] diary-71c2: found an existing pagination helper after writing a
  duplicate, and deleted the duplicate
- [2026-08-06] diary-1de5: read both existing migrations first; the naming
  convention was not written down anywhere
- [2026-08-13] diary-4f21: the retry helper already existed and would have been
  duplicated otherwise
**Implication:** in this codebase the convention lives in the siblings, not in
the docs, so reading two before writing a third pays for itself
**Instinct to save:** id `read-siblings-first`, trigger "about to add a third
instance of an existing pattern", action "read the two existing ones before
writing", domain `workflow`, evidence count 3

---

## Observations (1-2 occurrences)

- Prefers errors that name the offending value, not just the field: seen in 2 sessions
- Dead-letter queues get created without consumers: seen in 1 session
```

Note what the example does **not** do. It never writes "always read siblings
first" as a rule, and the violation section does not propose the obvious fix as
though it were decided. Both stop at what the diaries actually show.
