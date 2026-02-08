# Code Style and Conventions

## Python (Tests)

### Python Version

- **Python 3.11+** - Uses modern type hints and features

### Type Hints

- **Modern syntax**: Use `list[str]`, `dict[str, int]`, `tuple[int, ...]` instead of `List`, `Dict`, `Tuple` from typing
- **Optional**: Use `Optional[T]` or `T | None` for optional values
- **All public functions and methods should have type hints**

```python
# Good
def load_skill(self, skill_name: str) -> Optional[str]:
    pass

def is_ready(self, completed_features: set[str]) -> bool:
    return all(dep in completed_features for dep in self.depends_on)
```

### Data Classes

- **Use `@dataclass`** for data structures
- **Use `field(default_factory=list)`** for mutable defaults

```python
from dataclasses import dataclass, field

@dataclass
class Feature:
    id: str
    name: str
    status: TaskStatus = TaskStatus.PENDING
    depends_on: list[str] = field(default_factory=list)
```

### Docstrings

- **Google-style docstrings** for classes and public methods
- Include Args, Returns, and Raises sections

```python
def load_skill(self, skill_name: str) -> Optional[str]:
    """
    Load a skill's content by name.

    Args:
        skill_name: Name of skill to load

    Returns:
        Skill content formatted for this platform, or None
    """
    pass
```

### Imports

- **Standard library first**, then third-party, then local
- **Use pathlib.Path** for file paths (not os.path)

```python
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
```

### Testing

- **pytest** for testing
- **Test file naming**: `test_<module>.py`
- **Test function naming**: `test_<behavior_description>`
- **Use descriptive test names that explain the scenario**

```python
def test_feature_dependency_readiness():
    feature = Feature(id="f1", name="Feature 1", depends_on=["f0"])
    assert not feature.is_ready(set())
    assert feature.is_ready({"f0"})
```

## Node.js (CLI and Core Engine)

The CLI and core engine live in `scripts/` and use **CommonJS** (`require()`/`module.exports`).

- **Entry point**: `scripts/cli.js`
- **Core modules**: `scripts/lib/` (e.g., `coordinator.js`)
- **Style**: Standard Node.js conventions — `camelCase` for variables and functions
- **Built-in modules preferred**: Uses `parseArgs` from `node:util`, `fs`, `path`
- **No build step**: Scripts run directly with `node`

## Naming Conventions

- **Python Classes**: PascalCase (`Feature`, `TaskStatus`)
- **Python Functions/Methods**: snake_case (`is_ready`, `load_skill`)
- **Python Variables**: snake_case (`skill_name`, `completed_features`)
- **Python Constants**: UPPER_SNAKE_CASE
- **Python Private members**: Prefix with underscore (`_internal_method`)
- **Node.js functions/variables**: camelCase (`loadSkill`, `skillName`)

## Project Patterns

- **Dependency injection** - Pass dependencies through constructors
- **Composition over inheritance** - Use adapters pattern
- **Explicit over implicit** - Clear data flow

## Linting

- **ruff** is used for Python linting (presence of `.ruff_cache/` directory)
- No custom configuration in pyproject.toml - uses defaults
