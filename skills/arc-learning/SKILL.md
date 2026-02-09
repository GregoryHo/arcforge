---
name: arc-learning
description: Use when you have accumulated instincts and want to cluster related ones into higher-level skills, commands, or agents. Use when instinct evolve suggests candidates. Use when you want to consolidate behavioral patterns into reusable abstractions.
---

# Instinct Clustering

## Overview

Cluster related instincts into higher-level abstractions: skills, commands, or agents. This skill analyzes accumulated behavioral patterns (instincts) and identifies groups that can be consolidated into reusable components.

**Pipeline position:** `observe → instincts → cluster (this skill) → skills/commands/agents`

## Quick Reference

| Task | Command |
|------|---------|
| **Scan instincts** | `node "${SKILL_ROOT}/scripts/learn.js" scan --project {p}` |
| **Preview clusters** | `node "${SKILL_ROOT}/scripts/learn.js" preview --project {p}` |
| **List evolved** | `node "${SKILL_ROOT}/scripts/learn.js" list --project {p}` |

## Workflow

1. **Scan**: Load all instincts from `~/.claude/instincts/{project}/` and `global/`
2. **Cluster**: Group by domain, then within each domain use trigger fingerprint similarity (Jaccard >= 0.6) to find sub-clusters
3. **Filter**: Only process clusters with 3+ instincts, at least 1 with confidence >= 0.6
4. **Preview**: Display candidate clusters for user review
5. **Generate**: User decides what to create (skill, command, or agent)
6. **Track**: Record which instincts were consolidated

## When to Use

- `instinct evolve` suggests clustering candidates
- 5+ instincts accumulated in the same domain
- User wants to consolidate behavioral patterns into reusable components
- User explicitly asks to cluster or organize instincts

## When NOT to Use

- Fewer than 3 instincts in any domain
- User wants to save a single pattern (use /recall instead)
- User wants to reflect on diaries (use /reflect instead)
- User wants to confirm/contradict individual instincts (use arc-observing)

## Key Principles

- **User-driven**: Preview clusters and let user decide what to create
- **Minimum cluster size**: 3+ instincts required per cluster
- **Quality threshold**: At least 1 instinct must have confidence >= 0.6
- **Source tracking**: Record which instincts were consumed by each cluster
