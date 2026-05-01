"""Tests for minimal composable ArcForge documentation posture."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _read(path: str) -> str:
    return (PROJECT_ROOT / path).read_text(encoding="utf-8")


def test_architecture_describes_arc_using_as_bounded_router():
    """Architecture rules must not reintroduce always-on 1% routing pressure."""
    content = _read(".claude/rules/architecture.md")

    assert "1% rule" not in content
    assert "always in context" not in content.lower()
    assert "bounded router" in content.lower()
    assert "smallest useful workflow" in content.lower()
    assert "harness" in content.lower() and "eval" in content.lower()


def test_readme_positions_arcforge_as_minimal_composable_toolkit():
    """README should present ArcForge as a toolkit, not an enforced workflow OS."""
    content = _read("README.md")
    lower = content.lower()

    assert "minimal, composable" in lower
    assert "skills are tools, not laws" in lower
    assert "core toolkit" in lower
    assert "optional workflows" in lower
    assert "harness/eval layer" in lower
    assert "non-activation behavior" in lower
    assert "workflow is enforced" not in lower
    assert "skills trigger automatically" not in lower


def test_skills_reference_has_bounded_arc_using_and_meta_only_writing_skills():
    """Public skill reference should match the new routing and meta-skill model."""
    content = _read("docs/guide/skills-reference.md")
    lower = content.lower()

    assert "even 1% chance" not in content
    assert "even if 1% chance" not in content
    assert "before ANY action" not in content
    assert "start here, always" not in content
    assert "always first" not in content
    assert "must be invoked first" not in content
    assert "No Action Without Skill Check" not in content
    assert "non-negotiable across all arcforge workflows" not in content
    assert "arc-learning --> arc-writing-skills" not in content
    assert "bounded router" in lower
    assert "project-level meta" in lower
    assert "arc-writing-skills" in content
    assert "33 skills" in content
    assert "three-layer model" in lower
    assert "core toolkit" in lower
    assert "optional workflows" in lower
    assert "harness/eval layer" in lower
    assert "activation and non-activation behavior" in lower


def test_active_specs_do_not_require_global_1_percent_routing():
    """Current source-of-truth specs must not require the old global router model."""
    content = _read("specs/arc-evaluating-v2/details/verdict-and-routing.xml")

    assert "1% rule" not in content
    assert "bounded router" in content.lower()
    assert "not a global always-on invocation rule" in content.lower()


def test_skills_reference_documents_living_sdd_responsibility_boundary():
    """Skills reference must spell out who owns what in the Living SDD pipeline."""
    content = _read("docs/guide/skills-reference.md")
    lower = content.lower()

    assert "living sdd responsibility boundary" in lower
    # Each owner is named in the boundary section.
    assert "arc-refining" in content
    assert "arc-verifying" in content
    assert "arc-syncing-spec" in content
    # Future syncing-spec must be marked as separate/opt-in, not always-on.
    assert "separate opt-in workflow skill" in lower
    # SessionStart bootstrap and arc-using router are explicitly off-limits as carriers.
    assert "sessionstart bootstrap" in lower
    assert "arc-using" in content
    assert "always-on" in lower


def test_arc_refining_states_its_authoritative_spec_ownership():
    """arc-refining must explicitly own formalization and disclaim verifying/syncing."""
    content = _read("skills/arc-refining/SKILL.md")
    lower = content.lower()

    assert "## boundary" in lower
    assert "authoritative" in lower
    assert "spec.xml" in content
    assert "details/*.xml" in content
    # Explicitly not the verifier and not the syncer.
    assert "arc-verifying" in content
    assert "arc-syncing-spec" in content
    assert "sessionstart bootstrap" in lower
    assert "arc-using" in content


def test_arc_verifying_disclaims_spec_authoring_and_drift_sync():
    """arc-verifying must own completion-claim evidence and disclaim spec syncing."""
    content = _read("skills/arc-verifying/SKILL.md")
    lower = content.lower()

    assert "## boundary" in lower
    assert "fresh evidence" in lower
    # Explicitly not the refiner and not the syncer.
    assert "arc-refining" in content
    assert "arc-syncing-spec" in content
    assert "sessionstart bootstrap" in lower
    assert "arc-using" in content


def test_sessionstart_bootstrap_does_not_smuggle_spec_sync_or_routing_pressure():
    """SessionStart hook must inject only minimal bootstrap — no spec-sync, no global routing."""
    content = _read("hooks/inject-skills/main.sh")
    lower = content.lower()

    # Minimal-toolkit posture preserved.
    assert "minimal, composable toolkit" in lower
    assert "skills are tools, not laws" in lower
    # Must not smuggle spec-sync responsibilities into the always-on bootstrap.
    assert "arc-syncing-spec" not in content
    assert "spec sync" not in lower
    assert "spec drift" not in lower
    assert "syncing-spec" not in content
    # Must not reintroduce global routing pressure.
    assert "1%" not in content
    assert "before any" not in lower
    assert "you must" not in lower


def test_arc_using_router_does_not_route_to_unshipped_syncing_spec():
    """arc-using must not pre-route to a skill that does not ship — keeps router bounded."""
    content = _read("skills/arc-using/SKILL.md")

    # Future arc-syncing-spec must not be wired into the bounded router yet.
    assert "arc-syncing-spec" not in content
    assert "syncing-spec" not in content
