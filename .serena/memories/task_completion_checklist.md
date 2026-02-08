# Task Completion Checklist

When completing a task in arcforge, follow this checklist:

## Before Committing

### 1. Code Quality

- [ ] Code follows project conventions (see `code_style_and_conventions.md`)
- [ ] Type hints added to all public functions/methods (Python tests)
- [ ] Docstrings added for new classes and public methods (Google-style)
- [ ] No linter warnings (ruff for Python, standard Node.js conventions for scripts/)

### 2. Testing

- [ ] Tests written for new functionality
- [ ] All tests pass: `pytest tests/ -v`
- [ ] Tests follow existing patterns in `tests/`

### 3. Verification

- [ ] Code runs without errors
- [ ] Changes work as expected (manual verification)
- [ ] No regression in existing functionality

## Commit Guidelines

- Write clear commit messages explaining "why"
- Reference issue/task numbers if applicable
- Keep commits focused on single concerns

## For Skill Changes

If modifying skills in `skills/`:

- [ ] SKILL.md follows frontmatter format (name, description)
- [ ] Skill content is clear and actionable
- [ ] Corresponding test in `tests/test_skill_*.py` updated if needed

## For CLI/Core Changes

If modifying `scripts/`:

- [ ] Update relevant tests in `tests/`
- [ ] Verify CLI still works: `node scripts/cli.js --help`

## For Documentation Changes

If modifying docs in `docs/`:

- [ ] Markdown renders correctly
- [ ] Links are valid
- [ ] Content is accurate and up-to-date
