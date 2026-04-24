# SDD v2 Downstream Contract — Design

spec-id: `sdd-downstream-contract`
Date: 2026-04-24
Branch in scope: `feature/sdd-enhance`
Research backing: `docs/research/sdd-v2-downstream-contract-gap.md` (Findings 1–7)

## Problem / Motivation

Arcforge 的 SDD v2 pipeline 目前只有 upstream（brainstorming / refining / planning）有正式 spec（`specs/spec-driven-refine/`）。該 spec 的 `scope/excludes` 明寫 Phase 2（downstream migration）被排除（`specs/spec-driven-refine/spec.xml:32`），導致 downstream consumer 沒有合約。三次 contributor session（2026-04-20、2026-04-24 上午、2026-04-24 下午）連續在實作循環中撞到同一類問題，記錄於 `docs/research/sdd-v2-downstream-contract-gap.md`。

具體痛點：

1. **`dag.yaml` 寫了沒 commit（§2.2 / §6.1）。** `scripts/lib/coordinator.js:426-493` 的 `_mergeEpicsInBase` 把 epic status flip 到 COMPLETED，`_saveDag` 寫檔到磁碟，但整個 coordinator 沒有任何 `git add` / `git commit` 呼叫。每次 `arcforge merge <epic>` 後 `git status` 都留 dirty `specs/<id>/dag.yaml`，要 contributor 自行決定怎麼處置。

2. **處置慣例分歧（§6.5）。** 同一個 bug 之下，2026-04-20 session 採「reconcile-after-merge」（手動 chore commit 把 status 補上），2026-04-24 上午 session 採「revert-after-merge」（`git checkout -- dag.yaml`）。兩種都不在任何 skill / rule 裡明寫，全靠 per-session 即興決定。

3. **下一次 iteration 的 refiner gate 被卡住（§7.1）。** revert-after-merge 的結果是 dag.yaml 所有 epics 停在 `pending`，refiner 的 DAG completion gate（`scripts/lib/sdd-utils.js` `checkDagStatus`）讀到「prior sprint incomplete」直接 block 下次 iteration，得手動 `git rm dag.yaml` 才能繼續。

4. **`arcforge cleanup` scope 過窄（§7.2）。** 目前只清 worktree 目錄 + `git worktree prune`（`coordinator.js:501-538`），不清 epic branch、不清 `dag.yaml`、不清 `specs/<id>/epics/`。sprint 結束後每次要手動 `git branch -d` 數個 branch + `git rm` 兩次 tracked artifact。

5. **跨 workflow 責任不清。** 五個 downstream workflow skills（`arc-implementing`、`arc-agent-driven`、`arc-dispatching-parallel`、`arc-dispatching-teammates`、`arc-looping`）對「sprint 結束要做什麼」各自假設不同，沒有單一 source of truth。

**問題本質**：downstream consumer 沒有合約，因此 coordinator 寫 `dag.yaml` 的語意、`cleanup` 的 scope、sprint-terminus 的定義、跨 workflow 的責任分工，全都靠 per-session 即興決定。

## Proposed Solution / Architecture

以「最小增量、讓既有 skill 負責」為原則，把 downstream consumer contract 收斂到三個層的修改。

### Layer 1 — Coordinator（`scripts/lib/coordinator.js`）

修 §6.1 bug：`_mergeEpicsInBase` 在呼叫 `_saveDag` 寫 `dag.yaml` 之後、產生 integrate commit 之前，多做 `git add specs/<id>/dag.yaml`。如此 `feat: integrate <epic> epic` 這個 commit 本身就帶 dag 狀態變更，無額外 chore commit。

擴展 `cleanup` 指令（epic-scope）：保留現有語意（移除 worktree + `git worktree prune`），額外加入「對該 epic 的 branch 若 `git branch --merged` 為 true 則 `git branch -d <branch>`」。未 merged branch 跳過，不傷到 PR-pending 流程。

新增 `finish` 子命令（spec-scope）：`arcforge finish --spec-id <id>`。前置 guard：`dag.yaml` 存在、所有 epics `status=completed`、所有 epic branches 已 merged 到當前 branch、working tree 乾淨（除 dag.yaml drift）。任一失敗即 error 並列舉失敗原因。通過後：內部呼 `cleanup` 清剩餘 worktree / branch → `git rm specs/<id>/dag.yaml` → `git rm -r specs/<id>/epics/` → 產生 commit `chore(specs): finish <spec-id> sprint`。

### Layer 2 — 共用偵測邏輯

`arcforge finish --spec-id <id> --if-last`：`--if-last` 旗標讓 CLI 自己判斷 `allEpicsCompleted`；若 false 安靜 `exit 0`（不是 error，因為「不是最後一個」不是失敗）；若 true 執行完整 finish 流程。這讓 skill 層只要無腦呼叫，不用自己寫狀態檢查的重複實作。

提供公開 helper `allEpicsCompleted(dag)`（放在 `scripts/lib/models.js` 或 `scripts/lib/coordinator.js`），供 CLI 與測試共用。

### Layer 3 — Skill 文件修改

**以 `arc-writing-skills` 紀律（RED/GREEN/REFACTOR）進行**，不當作一般文件編輯。Layer 1 / 2 的 code 改動由 `arc-tdd` 規範；Layer 3 的 skill 文件改動由 `arc-writing-skills` 規範，每個修改都要有對應的 eval scenario 作為 RED baseline，skill 文件修改後轉綠，REFACTOR 時補 Red Flags / Common Rationalizations 關閉跳過誘惑。

受影響的 skill：

- `skills/arc-finishing-epic/SKILL.md` — Step 4 Option 1（merge locally）在 `cleanup` 呼叫後多一行 `arcforge finish --spec-id <id> --if-last`。Option 2（PR）**不可**加 finish 呼叫（PR 未 merge，不符 guard）。Iron Law 補一條、Red Flags 補誘惑關閉。
- `skills/arc-dispatching-teammates/SKILL.md` 或 `references/wrap-up-sequence.md` — Step 8b 批次 cleanup 後多一行 `arcforge finish --spec-id <id> --if-last`。
- `skills/arc-coordinating/SKILL.md` — command table 新增 `finish` 條目。

不用改的：`arc-implementing`、`arc-agent-driven`、`arc-looping`、`arc-dispatching-parallel` — 它們都 route 到 `arc-finishing-epic` 做 per-epic 終結，改動在下游自動覆蓋。

### 設計取捨

- **為什麼 coordinator 自動 `git add` dag.yaml 而不是寫 sidecar 檔？** 單行修改，符合 §6.5 user directive「dag 狀態變更應在 integrate commit 裡」；sidecar 方案會讓 `arcforge status` 多讀一個檔，scope 膨脹。
- **為什麼分 `cleanup` 和 `finish` 兩個指令？** cleanup 只動未 tracked 檔 + local git ref；finish 動 tracked 檔並產生 commit。語意層級不同，綁同一 flag 會隱藏 blast radius 差異。
- **為什麼 `--if-last` 放 CLI 而不是 skill？** 偵測邏輯單點；skill 只要無腦呼叫，不用維護狀態檢查的重複實作。
- **為什麼 review 不做 machine gate？** 現有 workflow chain（arc-requesting-review → arc-receiving-review → arc-finishing-epic）已保證走到 finish 時 review 已 pass；review verdict 無結構化狀態可讀，machine check 需要新建狀態檔，scope 膨脹。

## Identifiable Requirements

### R1 — Coordinator & CLI（Layer 1 + 2）

- **R1.1** Coordinator 的 `_mergeEpicsInBase` 在寫 `dag.yaml` 後、產生 integrate commit 前，必須 `git add specs/<id>/dag.yaml`。整合 commit 本身包含 dag 狀態變更，無額外 chore commit。驗證：Jest 整合測 merge 後 `git log -1 --name-only` 包含 dag.yaml。
- **R1.2** `arcforge cleanup [--spec-id <id>] [--epic <name>]` 移除 completed epics 的 worktree 目錄 + `git worktree prune` + 對每個已 fully-merged 的 epic branch 執行 `git branch -d`。未 merged branch 跳過。驗證：Jest + fixture worktree。
- **R1.3** `arcforge finish --spec-id <id>` 執行前 guard：`specs/<id>/dag.yaml` 存在；dag 中所有 epics `status=completed`；所有 epic branches 已 merged 到當前 branch（`git branch --merged` 驗證）；working tree 除 `specs/<id>/dag.yaml` drift 外乾淨。任一失敗：非零 exit code 並列舉失敗原因，無任何 side effect。驗證：Jest 每個 guard 獨立測。
- **R1.4** `arcforge finish --spec-id <id>` guard 全過後：內部呼 `cleanup --spec-id <id>` 清剩餘 worktree / branch → `git rm specs/<id>/dag.yaml` → `git rm -r specs/<id>/epics/` → 產生 commit `chore(specs): finish <spec-id> sprint`。驗證：Jest end-to-end。
- **R1.5** `arcforge finish --spec-id <id> --if-last`：偵測 allEpicsCompleted；若 false，`exit 0` 並印 "Not last epic — skipping finish"（不是 error）；若 true 執行完整 finish 流程（同 R1.4）。驗證：Jest 兩條分支。
- **R1.6** 提供公開 helper `allEpicsCompleted(dag)` 返回 boolean，供 `finish --if-last` 與測試共用。驗證：unit test。

### R2 — Skill 修改（Layer 3，以 `arc-writing-skills` 紀律進行）

- **R2.1** `arc-finishing-epic` SKILL.md Step 4 Option 1（merge locally）在 `cleanup` 呼叫後多一行 `arcforge finish --spec-id <id> --if-last`。Step 4 Option 2（PR）**不可**加 finish 呼叫。驗證：eval scenario 驗證 skill 在 local merge 後呼 finish；PR branch 時不呼。
- **R2.2** `arc-dispatching-teammates` wrap-up（SKILL.md Step 8b 或 `references/wrap-up-sequence.md`）在批次 cleanup 後多一行 `arcforge finish --spec-id <id> --if-last`。驗證：eval scenario 觀察 lead session 走完所有 teammates 後是否呼 finish。
- **R2.3** `arc-coordinating` SKILL.md command table 新增 `finish` 條目，描述為 "End a sprint (delete dag.yaml + epics/ when all epics completed)"。驗證：eval 或 pytest 檢查 SKILL.md 包含該行。
- **R2.4** R2.1 / R2.2 / R2.3 三個被修改的 skill 必須補 Red Flags / Common Rationalizations 關閉跳過 finish 的誘惑（例：「last epic 但懶得呼 finish，手動清」明列為禁止）。驗證：adversarial eval scenario 誘導 skill 跳過 finish，預期不會被誘導。

### R3 — 文件 & 跨 spec 合約

- **R3.1** 新增 `docs/guide/downstream-contract.md`，描述三個 workflow 終點（arc-finishing-epic、arc-dispatching-teammates wrap-up、user 手動）都以 `arcforge finish --if-last` 結尾的合約；列出 §6.5 三種 convention 的歷史並說明 Convention C（delete-after-sprint）如何成為正式 contract。
- **R3.2** 本 spec 的 design 與 spec.xml 必須 cross-reference `specs/spec-driven-refine/spec.xml:32` 的 Phase 2 exclusion，說明本 spec 是 Phase 2 的正式承接者。不修 `spec-driven-refine` 本體。

## Scope

### Includes

**程式碼**
- `scripts/lib/coordinator.js` — 修 `_mergeEpicsInBase`、擴展 `cleanup` 含 branch 刪除、新增 `finish` 實作、新增 `allEpicsCompleted` helper。
- `scripts/cli.js` — 暴露 `finish` 子命令、補齊 `cleanup` 的 `--spec-id` / `--epic` 參數、加入 `--if-last` 旗標。
- 對應測試：Jest（`scripts/lib/__tests__/` 或 `tests/`）、整合測（`tests/integration/`）。

**Skill 文件**
- `skills/arc-finishing-epic/SKILL.md`
- `skills/arc-dispatching-teammates/SKILL.md` 或 `references/wrap-up-sequence.md`
- `skills/arc-coordinating/SKILL.md`
- 對應 eval scenarios：`evals/scenarios/sdd-downstream-contract-*.md`。

**使用者文件**
- `docs/guide/downstream-contract.md`（新檔）。

### Excludes（明確排除）

- **不新建 skill。** 使用者指示「不考慮新的 skill」；所有 skill 層職責由既有 skill 承擔。
- **不迭代 `specs/spec-driven-refine/`。** 本 spec 是 Phase 2 的獨立承接者；只在本 spec design 裡 cross-ref，不修該 spec 本體。
- **不做 review 的 machine gate。** `arcforge finish` 不檢查 review 是否 pass。Review discipline 由既有 skill chain 保證。
- **不做 §6.2 orphan worktree GC。** 跨 project / 已消失 base 的孤兒 worktree 清理是 filesystem-scan 級別議題，不在本 spec。
- **不改 planner / refiner。** Upstream stages 不在 contract 範圍，只改 downstream consumer。
- **不改 sidecar state 檔結構。** `.arcforge-epic` marker 結構不變；`dag.yaml` 的存在 / 內容 / 位置不變（只改寫檔後是否 `git add`、以及 sprint 結束是否 `git rm`）。
- **不處理 PR-based 流程的 sprint-end。** R2.1 明寫 arc-finishing-epic Step 4 Option 2（PR）不呼 finish；若所有 epic 都走 PR 流程，sprint-end 需 user 在 PR 全部 merge 後手動 `arcforge finish --spec-id <id>`。這是刻意設計，因為 PR merge 發生在 remote，本 spec 不建立 remote-poll 機制。
- **不處理 §6.4 commit granularity。** docs-only epic 的 commit 粒度合約是另一 open question。
- **不新增整合測 pipeline fixture。** 若新行為需現有 fixture 更新，由實作 PR 附帶處理，但不新增新的 pipeline fixture。

### 不在 scope 內但值得記錄

- §6.5 三種 convention（revert / reconcile / delete）在本 spec 確立後只有 **Convention C（delete-after-sprint）** 是正式 contract；其他兩種成為歷史，`docs/guide/downstream-contract.md` 要明寫此轉換。
- §2.5 / §6.3 的「rename sweep / package-lock.json 不該附在 feature epic commit」是 commit ownership 議題，與本 spec 的 cleanup contract 無直接耦合，留在 research doc 作為未來議題。
