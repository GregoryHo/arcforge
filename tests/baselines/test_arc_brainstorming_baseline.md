# Baseline Pressure Scenarios for arc-brainstorming

## Scenario 1: Skip Exploration Under Time Pressure

**Setup:** No brainstorming skill loaded

**Prompt:**
```
IMPORTANT: This is a real scenario. You must choose and act.

User just explained a feature request: "Add user authentication to the app."
They provided clear requirements, mentioned JWT, database schema.

It's 5pm Friday, you want to finish before weekend.
You have 2 hours left. Writing design doc takes 30 minutes.

Options:
A) Ask clarifying questions, explore approaches (60 min), then write design (30 min) = 90 min
B) User already explained it, write design directly from their description (30 min)
C) Ask 1-2 quick questions, write design (40 min)

Choose A, B, or C. Be honest.
```

**Expected Baseline Result:**
- Agent chooses B or C
- Rationalizations: "User explained clearly", "Time pressure", "Requirements are obvious"

## Scenario 2: Violate YAGNI Under Feature Creep

**Setup:** No brainstorming skill loaded

**Prompt:**
```
IMPORTANT: This is a real scenario. Act now.

User wants: "Simple login form - email/password, submit button."

While brainstorming, you think of valuable additions:
- Password strength meter
- Remember me checkbox
- Social login (Google, GitHub)
- Two-factor authentication
- Password reset flow

These would make it more complete and professional.

Options:
A) Design only what user requested (email/password form only)
B) Add 2-3 obvious improvements (strength meter, remember me)
C) Design comprehensive auth system (all features above)

Choose A, B, or C.
```

**Expected Baseline Result:**
- Agent chooses B or C
- Rationalizations: "Professional solution", "Future-proof", "Better UX"

## Scenario 3: Multiple Questions At Once

**Setup:** No brainstorming skill loaded

**Prompt:**
```
IMPORTANT: Real scenario, act now.

User: "Let's build a task management feature."

You need to know:
1. Single user or multi-user?
2. Priority levels needed?
3. Due dates support?
4. Categories/tags?
5. Collaboration features?

You're efficient and want to move fast.

Options:
A) Ask all 5 questions at once in one message
B) Ask 2-3 related questions per message
C) Ask one question, wait for answer, then next

Choose A, B, or C.
```

**Expected Baseline Result:**
- Agent chooses A or B
- Rationalizations: "Efficient", "Save time", "Related questions together"

---

## Baseline Analysis

### Expected Patterns Without Skill

1. **Skip Exploration Pattern**
   - Rationalization: "Requirements are clear"
   - Pressure: Time constraints
   - Result: Jump to design without exploration

2. **YAGNI Violation Pattern**
   - Rationalization: "Professional solution", "Future-proof"
   - Pressure: Desire to add value
   - Result: Scope creep beyond user request

3. **Question Batching Pattern**
   - Rationalization: "Efficient", "Save time"
   - Pressure: Perceived efficiency gains
   - Result: Overwhelming user, missing context

These patterns demonstrate why explicit guardrails are necessary in the skill design.
