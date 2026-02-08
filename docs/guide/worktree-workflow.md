# Worktree Workflow Guide

> 大型專案的 Epic 開發流程：從 DAG 到 Worktree 到完成

## 概念總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                      大型專案開發流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   dag.yaml          .worktrees/         實作完成                  │
│   ┌──────┐         ┌──────────┐        ┌──────┐                 │
│   │Epic A│────────▶│ epic-a/  │───────▶│Merged│                 │
│   │Epic B│         │ epic-b/  │        │ PR   │                 │
│   │Epic C│         └──────────┘        │ Keep │                 │
│   └──────┘                             └──────┘                 │
│                                                                 │
│   Coordinator       Implementer        Finish-Epic              │
│   (管理層)          (執行層)            (收尾層)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 三個角色

| 角色 | 職責 | 使用時機 |
|------|------|----------|
| **Coordinator** | 管理 worktree 生命週期 | 在 base 專案，操作多個 epic |
| **Implementer** | 在 worktree 內執行實作 | 進入 worktree 後，逐 feature 開發 |
| **Finish-Epic** | 處理 epic 完成後的決策 | 所有 feature 完成，決定如何整合 |

## 完整流程

```
                          ┌─────────────────────┐
                          │   Base 專案         │
                          │   (有 dag.yaml)     │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
          ┌─────────────────┐               ┌─────────────────┐
          │ arc-coordinating    │               │ arc-coordinating    │
          │ status          │               │ expand          │
          │                 │               │                 │
          │ 查看 DAG 狀態    │               │ 建立 worktree   │
          └─────────────────┘               └────────┬────────┘
                                                     │
                                                     ▼
                          ┌─────────────────────────────────────┐
                          │        進入 Worktree                 │
                          │   cd .worktrees/epic-xxx            │
                          └──────────────────┬──────────────────┘
                                             │
                                             ▼
                          ┌─────────────────────────────────────┐
                          │  Phase 0: Sync 檢查依賴              │
                          │  arc-coordinating sync --direction      │
                          │                    from-base        │
                          │                                     │
                          │  blocked_by 不為空？ ──▶ STOP       │
                          │  blocked_by 為空？   ──▶ 繼續       │
                          └──────────────────┬──────────────────┘
                                             │
                                             ▼
                          ┌─────────────────────────────────────┐
                          │        Implementer Loop             │
                          │   ┌─────────────────────────────┐   │
                          │   │  For each feature:          │   │
                          │   │    1. writing-tasks         │   │
                          │   │    2. agent-driven/execute  │   │
                          │   │    3. TDD + Review          │   │
                          │   └─────────────────────────────┘   │
                          └──────────────────┬──────────────────┘
                                             │
                                             ▼
                          ┌─────────────────────────────────────┐
                          │        Finish-Epic                  │
                          │                                     │
                          │   1. Sync from base (檢查依賴變更)   │
                          │   2. 驗證測試通過                    │
                          │   3. 選擇：Merge/PR/Keep/Discard   │
                          │   4. Sync to base (更新 DAG 狀態)   │
                          └──────────────────┬──────────────────┘
                                             │
                                             ▼
                          ┌─────────────────────────────────────┐
                          │        回到 Base                    │
                          │   cd /path/to/base                  │
                          │   arc-coordinating status               │
                          │   → 檢查下一個可開始的 epic          │
                          └─────────────────────────────────────┘
```

## 指令速查表

### 在 Base 專案

```bash
# 查看 DAG 狀態（哪些 epic ready/in_progress/completed）
arc-coordinating status

# 為 ready 的 epic 建立 worktree
arc-coordinating expand

# 掃描所有 worktree 狀態並更新 DAG
arc-coordinating sync

# 清理已 merge 的 worktree
arc-coordinating cleanup
```

### 在 Worktree 內

```bash
# 從 base 同步依賴狀態
arc-coordinating sync --direction from-base

# 將本地進度推回 base DAG
arc-coordinating sync --direction to-base

# 雙向同步（預設）
arc-coordinating sync --direction both

# Merge 回 base（自動偵測 epic 和 base branch）
arc-coordinating merge
```

## 常見情境

### 情境 1：開始新 Epic

```bash
# 1. 在 base 專案
cd /project
arc-coordinating status        # 看哪些 epic ready
arc-coordinating expand        # 建立 worktree

# 2. 進入 worktree
cd .worktrees/epic-auth

# 3. 檢查依賴（使用 implementer skill，會自動做）
arc-coordinating sync --direction from-base

# 4. 開始實作
# → 使用 arc-implementing skill
```

### 情境 2：完成 Epic

```bash
# 1. 在 worktree 內，所有 feature 完成
# → 使用 arc-finishing-epic skill

# 2. 選擇 Merge
arc-coordinating merge         # 自動偵測 epic，merge 回 base
arc-coordinating cleanup       # 清理 worktree

# 3. 回 base 繼續下一個
cd /project
arc-coordinating status
```

### 情境 3：跨 Session 恢復工作

```bash
# 1. 回到 base 查看狀態
cd /project
arc-coordinating status

# 2. 找到 in_progress 的 epic
cd .worktrees/epic-api

# 3. 同步最新依賴狀態
arc-coordinating sync --direction from-base

# 4. 繼續實作
# → 使用 arc-implementing skill
```

## Sync 流程圖

```
          Base DAG                    Worktree
        ┌──────────┐                ┌──────────┐
        │          │   from-base    │          │
        │ epic-a:  │ ──────────────▶│ .agentic │
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

## 決策樹

```
你在哪裡？
    │
    ├─▶ Base 專案（有 dag.yaml，無 .arcforge-epic）
    │       │
    │       ├─▶ 想看狀態？ → arc-coordinating status
    │       ├─▶ 想開始 epic？ → arc-coordinating expand → cd .worktrees/xxx
    │       └─▶ 想同步所有 worktree？ → arc-coordinating sync
    │
    └─▶ Worktree 內（有 .arcforge-epic）
            │
            ├─▶ 剛進入？ → arc-coordinating sync --direction from-base
            ├─▶ 開始實作？ → 使用 arc-implementing skill
            ├─▶ 完成了？ → 使用 arc-finishing-epic skill
            └─▶ 想 merge？ → arc-coordinating merge
```

## 注意事項

1. **永遠先 sync**：進入 worktree 後，先 sync from-base 確認依賴狀態
2. **不要手動 git merge**：使用 `arc-coordinating merge`，它會正確更新 DAG
3. **Blocked 就停止**：如果 sync 顯示 blocked_by 不為空，先完成依賴的 epic
4. **.arcforge-epic 是關鍵**：這個檔案標記你在 worktree 內，包含同步資訊
