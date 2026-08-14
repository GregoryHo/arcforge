# Diary template

Open this when writing a diary from scratch — there is no draft to finalize.

Fill every section that has content. Drop a section entirely rather than filling
it with "none of note"; a diary is not a form.

```markdown
# Session Diary: {project}

**Date:** {YYYY-MM-DD}
**Session ID:** {sessionId}

## Decisions Made

- [Decision]: [Rationale]

## User Preferences Observed

- [Preference observed]

## What Worked Well

- [Technique or approach that succeeded]

## Challenges & Solutions

- **Challenge**: [What went wrong]
- **Solution**: [How it was resolved]
- **Generalizable?**: [Yes/No]

## PR/Review Feedback (if any)

- [Feedback]: [Action taken]

## Context for Next Session

- [Key context to remember]

---

_Captured at {timestamp}_
```

`Generalizable?` is the one field reflection depends on: it marks which solutions
are candidates for a pattern later. Answer it on every challenge.

## Worked example

```markdown
# Session Diary: payments-api

**Date:** 2026-08-13
**Session ID:** session-4f21a9

## Decisions Made

- Retry webhook delivery in the worker, not the request handler: the handler's
  30s timeout was the actual cap on retry budget, and moving it removed the
  coupling between HTTP timeout and retry policy.
- Kept the existing `jsonschema` dependency instead of adding `pydantic`:
  one schema validator in the tree is worth more than the nicer API.

## User Preferences Observed

- Wants the failing test written before the fix, every time — asked for it twice
  after I went straight to the patch.
- Prefers errors that name the offending value, not just the field.

## What Worked Well

- Reading the two existing webhook handlers before writing the third: the retry
  helper already existed and would have been duplicated otherwise.

## Challenges & Solutions

- **Challenge**: Retries fired twice for a single failure, and the duplicate was
  invisible in logs because both attempts shared a request id.
- **Solution**: The handler and the worker were both retrying. Removed the
  handler's retry and gave each attempt its own attempt id.
- **Generalizable?**: Yes — "two layers each retrying" is a shape worth watching
  for, and the shared-id blindness is why it stayed hidden.

## Context for Next Session

- The dead-letter queue has no consumer yet; failures accumulate silently there.

---

_Captured at 2026-08-13T18:40:00Z_
```

What makes this entry useful later is that every item says **why**. "Changed the
retry location" would have been unreadable in a month; the reason it moved is the
part a pattern can be built from.
