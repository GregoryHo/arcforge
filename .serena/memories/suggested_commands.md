# Suggested Commands

## Testing

```bash
# Run all tests with verbose output
pytest tests/ -v

# Run specific test file
pytest tests/test_models.py -v

# Run with coverage
pytest tests/ -v --cov=scripts
```

## CLI Usage

```bash
# Show CLI help
node scripts/cli.js --help

# Show pipeline status
node scripts/cli.js status

# Get next available task
node scripts/cli.js next

# Mark task as completed
node scripts/cli.js complete <task-id>

# Show 5-Question Reboot context
node scripts/cli.js reboot

# Validate DAG structure
node scripts/cli.js validate
```

## Git Operations

```bash
# Standard git commands (Darwin/macOS)
git status
git log --oneline -10
git diff
git add .
git commit -m "message"

# Worktree management (used by coordinator)
git worktree list
git worktree add <path> <branch>
git worktree remove <path>
```

## File System (Darwin/macOS)

```bash
# List files
ls -la

# Find files
find . -name "*.js" -type f
find . -name "*.py" -type f

# Search in files
grep -r "pattern" --include="*.js"
grep -r "pattern" --include="*.py"
```
