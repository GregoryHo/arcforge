# Worktree Workflow Guide

> 大型專案的 Epic 開發流程：從 DAG 到 Worktree 到完成
>
> The authoritative human guide for how arcforge worktrees are derived,
> tracked, and cleaned up. All skills, rules, and tests defer to this
> document for the full story.

## Path Derivation (canonical rules)

ArcForge worktrees live **outside** the git tree at a deterministic location
computed by `scripts/lib/worktree-paths.js`. The home-based layout keeps
worktrees from polluting the working copy and lets multiple clones of the
same project coexist without collisions.

```
~/.arcforge/worktrees/<project>-<hash>-<epic>/
```

| Segment    | Source                                    | Example            |
|------------|-------------------------------------------|--------------------|
| `~/...`    | `os.homedir()`                            | `/Users/alice`     |
| `.arcforge/worktrees` | Fixed directory name           | `.arcforge/worktrees` |
| `<project>` | `path.basename(projectRoot)`, sanitized   | `arcforge`         |
| `<hash>`   | First 6 hex chars of `sha256(projectRoot)` | `3f2a91`          |
| `<epic>`   | Epic id from `specs/<spec-id>/dag.yaml`    | `epic-001`         |

**Why the hash?** Two clones of the same repo in different directories must
not collide, and two distinct specs within the same repo must not produce
the same worktree path when they share an epic id. The hash is computed
from `sha256(absoluteProjectPath + specId)` so both axes of collision are
covered without changing the visible `<project>-<hash>-<epic>` naming
scheme.

**Why the sanitized project name?** Human readability when listing worktrees.
Non-alphanumeric characters are collapsed to a single hyphen; trailing/
leading hyphens are trimmed; empty results fall back to `project`.

**Never hardcode** this path in skills, rules, tests, or agent output. It is
derived at runtime, and the derivation rule has evolved before (previously
`.worktrees/<epic>/` inside the repo). Use the CLI:

```bash
arcforge status --json   # each epic carries .path — the absolute worktree path (null until expanded)
```

Read `.path` from the **base checkout**. Inside a worktree, the local dag
copy has `worktree: null` for every epic, so `.path` is always null there.

## The `.arcforge-epic` Marker

Each worktree contains a single YAML file named `.arcforge-epic` at its root.
This file is the coupling between the worktree checkout and the base
`specs/<spec-id>/dag.yaml`:

```yaml
epic: epic-001                   # Must match an id in the per-spec dag.yaml
spec_id: spec-driven-refine      # Identifies which specs/<id>/dag.yaml to reconnect to
base_worktree: /Users/alice/arcforge   # Absolute path to the base checkout
base_branch: main                # The branch expand was launched from
local:
  status: in_progress            # pending | in_progress | completed | blocked
  started_at: 2026-04-10T...Z
synced: null                     # Populated by arc-coordinating sync
```

**Key facts:**

- The file is authored by `coordinator.js` during `expand`; do **not** write
  it by hand.
- `arc-coordinating sync` uses it to find the base DAG (`base_worktree`) and
  to carry local status back to it.
- If the file is missing, the directory is not an arcforge worktree even if
  it lives under `~/.arcforge/worktrees/`.
- `parseWorktreePath()` in `worktree-paths.js` recognizes the directory by
  the `<project>-<hash>-<epic>` pattern regardless of marker presence — this
  is how `_findBaseWorktree` distinguishes arcforge worktrees from the base.

## Cleanup Semantics

Worktrees are removed via `arcforge cleanup` (or `arc-coordinating cleanup`),
which delegates to `git worktree remove <absolute-path>`.

- The helper-computed path is always the source of truth — the coordinator
  resolves it via `getWorktreePath(projectRoot, specId, epicId)` before
  calling git.
- If git's own worktree registry still holds a stale entry after removal,
  the coordinator force-removes the directory.
- Cleanup does **not** delete the epic branch — that is the agent's choice
  via `arc-finishing` (its epic path).
- After cleanup the epic's `worktree` field in `specs/<spec-id>/dag.yaml`
  is cleared to `null`.

## Generic (non-epic) worktrees

Not every worktree is an epic. A throwaway branch, an experiment, or a
review checkout needs the same isolation without the DAG machinery. The
`arcforge worktree add|list|remove` subcommands (engine:
`scripts/lib/worktree-generic.js`) manage these **generic** worktrees, and
they live beside epic worktrees under `~/.arcforge/worktrees/` with no path
collision.

### Null-spec path derivation

A generic worktree reuses the canonical derivation with **no spec id** —
`getWorktreePath(projectRoot, /* specId = */ null, slug)`, the documented
legacy-null hash branch. The directory name is
`<project>-<hash6>-<slug>/`, where `<slug>` is the sanitized worktree name
and `<hash6>` folds only the project path (epic hashes additionally fold
the spec id in, so the two namespaces never collide). As always, **the
path is derived, never hardcoded** — read it from the CLI's JSON output.

```bash
arcforge worktree add my-experiment --json
# { "name": "my-experiment", "slug": "my-experiment", "branch": "my-experiment",
#   "branch_created": true,
#   "path": "/Users/alice/.arcforge/worktrees/proj-3f2a91-my-experiment" }
```

`add` defaults the branch to the worktree name; an existing branch is
checked out as-is, a missing one is created from `--from` (default: base
HEAD). `--setup` auto-detects and runs the project installer in the fresh
worktree (adds a `setup_command` field to the JSON).

### Kind annotation

`arcforge worktree list --json` enumerates every worktree git knows about
and tags each with a `kind`:

```bash
arcforge worktree list --json
# { "count": N, "worktrees": [
#   { "path": "...", "branch": "...", "head": "...", "kind": "base" },
#   { "path": "...", "branch": "...", "head": "...", "kind": "epic",
#     "epic": "epic-001", "spec_id": "spec-x" },
#   { "path": "...", "branch": "...", "head": "...", "kind": "generic" } ] }
```

| `kind` | Meaning |
|--------|---------|
| `base` | The main checkout — first non-managed entry |
| `epic` | A managed path carrying an `.arcforge-epic` marker (`epic`/`spec_id` attached) |
| `generic` | A managed path with **no** marker — created by `arcforge worktree add` |
| `external` | Any other non-managed entry (e.g. a user-placed raw-git worktree) |

The discrimination needs **no new marker file**: `kind` is derived from
`parseWorktreePath × hasArcforgeMarker`. A generic worktree is, by
definition, the managed-but-markerless case.

### Sync / merge invisibility guarantee

Because a generic worktree has no `.arcforge-epic` marker, the
coordinator's DAG machinery cannot see it and never touches it:

- `arc-coordinating sync` keys off marker files, so a generic worktree is
  skipped — its progress is never carried into any `dag.yaml`.
- `_findBaseWorktree` / `arcforge merge` walk the worktree list and reason
  only over base + epic entries; the generic one is inert to them.
- `arc-guard`'s worktree rules self-gate on the marker, so raw `git merge`
  or a loop launch inside a generic worktree is **not** blocked — it is the
  user's own business, not coordinator territory.

This is the build-time seam fix: a generic worktree is invisible to epic
tooling by construction, not by special-casing.

### Finishing and removing a generic worktree

A generic worktree is finished through the **non-epic path** of
`arc-finishing` (its Step 0 marker check routes there when no
`.arcforge-epic` is present). Cleanup is `arcforge worktree remove <name>`,
which refuses to touch an epic (marker-bearing) worktree — those belong to
`arcforge cleanup` — refuses a non-managed path, and refuses a dirty tree
unless `--force` is given:

```bash
arcforge worktree remove my-experiment --json
# { "removed": true, "path": "/Users/alice/.arcforge/worktrees/proj-3f2a91-my-experiment" }
```

## 概念總覽 / Concept Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      大型專案開發流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   dag.yaml       ~/.arcforge/worktrees/      實作完成             │
│   ┌──────┐      ┌────────────────┐         ┌──────┐              │
│   │Epic A│─────▶│ <proj>-<h>-a/  │────────▶│Merged│              │
│   │Epic B│      │ <proj>-<h>-b/  │         │ PR   │              │
│   │Epic C│      └────────────────┘         │ Keep │              │
│   └──────┘                                 └──────┘              │
│                                                                 │
│   Coordinator      Implementer              Finish-Epic          │
│   (管理層)          (執行層)                 (收尾層)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 三個角色 / Three Roles

| 角色 / Role | 職責 / Responsibility | 使用時機 / When |
|------|------|----------|
| **Coordinator** | 管理 worktree 生命週期 / manages worktree lifecycle | 在 base 專案，操作多個 epic |
| **Implementer** | 在 worktree 內執行實作 / implements inside the worktree | 進入 worktree 後，逐 feature 開發 |
| **Finish-Epic** | 處理 epic 完成後的決策 / handles epic integration | 所有 feature 完成，決定如何整合 |

## 指令速查表 / Command Reference

### 在 Base 專案 / In base

```bash
# 查看 DAG 狀態（哪些 epic ready/in_progress/completed）
arcforge status

# 為 ready 的 epic 建立 worktree（批次）
arcforge expand

# 為單一 epic 建立 worktree（含依賴安裝）
arcforge expand --epic epic-001 --project-setup

# 掃描所有 worktree 狀態並同步回 DAG
arcforge sync

# 清理已 merge 的 worktree
arcforge cleanup
```

### 在 Worktree 內 / Inside a worktree

```bash
# 從 base 同步依賴狀態
arcforge sync --direction from-base

# 將本地進度推回 base DAG
arcforge sync --direction to-base

# 雙向同步（預設）
arcforge sync --direction both

# Merge 回 base（自動偵測 epic 和 base branch）
arcforge merge
```

## 常見情境 / Common Scenarios

### 情境 1：開始新 Epic / Starting a new epic

```bash
# 1. 在 base 專案
cd /path/to/project
arcforge status        # 看哪些 epic ready

# 2. 為 ready 的 epic 建立 worktree
arcforge expand --epic epic-auth --project-setup

# 3. 用 arcforge status --json 取得 worktree 絕對路徑（.path 欄位），然後進入
cd "$(arcforge status --json | jq -r '.epics[] | select(.id=="epic-auth") | .path')"

# 4. 檢查依賴
arcforge sync --direction from-base

# 5. 開始實作（使用 arc-implementing）
```

### 情境 2：完成 Epic / Finishing an epic

```bash
# 1. 在 worktree 內，所有 feature 完成
#    → 使用 arc-finishing skill（Step 0 依 .arcforge-epic 選 epic 路徑）

# 2. 選擇 Merge
arcforge merge         # 自動偵測 epic，merge 回 base
arcforge cleanup epic-auth

# 3. 回 base 繼續下一個
cd /path/to/project
arcforge status
```

### 情境 3：跨 Session 恢復工作 / Resuming across sessions

```bash
# 1. 回到 base 查看狀態
cd /path/to/project
arcforge status

# 2. 在 base 取得 in_progress epic 的 worktree 絕對路徑（.path 欄位）
arcforge status --json

# 3. 進入該路徑並繼續
cd "$(arcforge status --json | jq -r '.epics[] | select(.id=="epic-auth") | .path')"
arcforge sync --direction from-base
```

## Sync 流程圖 / Sync Flow

```
          Base DAG                    Worktree
        ┌──────────┐                ┌──────────┐
        │          │   from-base    │          │
        │ epic-a:  │ ──────────────▶│ .arcforge│
        │ completed│                │ -epic    │
        │          │                │          │
        │ epic-b:  │   to-base      │ synced:  │
        │ pending  │ ◀──────────────│ deps,    │
        │          │                │ blocked  │
        │ epic-c:  │                │          │
        │ progress │                │ local:   │
        │          │                │ status   │
        └──────────┘                └──────────┘

   from-base: 拉取依賴狀態到 worktree
   to-base:   推送本地進度到 DAG
```

## Troubleshooting

### "Epic not ready" from `arcforge expand --epic <id>`
The single-epic mode refuses to expand if the epic is not pending or has
unmet dependencies. Run `arcforge status` to see which epics are blocking it.

### "Base worktree not found" from `arcforge merge`
`_findBaseWorktree` walks `git worktree list --porcelain` and picks the
first entry that does **not** parse as an arcforge worktree (via
`parseWorktreePath`). If none qualify, you are either inside a stale
worktree whose base has been moved, or the base checkout was removed. Run
`git worktree list` and re-add the base with `git worktree add` if needed.

### Worktree directory exists but `.arcforge-epic` is missing
This happens when someone ran `git worktree add ~/.arcforge/worktrees/...`
by hand. The directory is invisible to `arc-coordinating sync` (which keys
off marker files). Either delete it with `git worktree remove` and re-run
`arcforge expand`, or recreate the marker manually by copying from another
worktree — but the correct fix is always to use the CLI.

### `specs/<spec-id>/dag.yaml` says `worktree: epic-001` but the directory doesn't exist
The stored value is the epic id, not the path. The absolute path is
re-derived at read time. If the directory really is gone (e.g. you deleted
it by hand), run `git worktree prune` and `arcforge cleanup <epic-id>` to
clear the DAG entry.

## 注意事項 / Cautions

1. **永遠先 sync / Always sync first**：進入 worktree 後，先 sync from-base 確認依賴狀態
2. **不要手動 git merge / Never hand-merge**：使用 `arcforge merge`，它會正確更新 DAG
3. **Blocked 就停止 / Stop when blocked**：如果 sync 顯示 blocked_by 不為空，先完成依賴的 epic
4. **`.arcforge-epic` 是關鍵 / The marker is load-bearing**：這個檔案標記你在 worktree 內，包含同步資訊
5. **絕不硬寫路徑 / Never hardcode paths**：在 base checkout 讀取 `arcforge status --json` 的 `.path` 欄位，或呼叫 `scripts/lib/worktree-paths.js` 取得絕對路徑。在 worktree 內 `.path` 恆為 null（本地 dag 副本 `worktree: null`），不要從 worktree 內讀取
