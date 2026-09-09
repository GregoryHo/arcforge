"""Shared fixtures for tests/skills/."""

import pytest

from .lint_vault_support import build_vault


@pytest.fixture
def vault(tmp_path):
    return build_vault(tmp_path)
