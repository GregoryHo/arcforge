# arcforge v6 — progress

> 北極星計畫：`docs/plans/v6/PLAN.md`（靜態基準，不追蹤進度）。本檔為唯一進度載體（D3 checkbox 格式 v0，格式規格於 P1 凍結後如有變動，本檔跟著改——那是格式 churn 的早期警報）。
>
> **main 凍結政策**：v6 開發期間 `main` 凍結 v5 patch（不出 hotfix）。所有工作在 `v6` 長期分支，每個 phase 一個 PR 進 `v6`，phase exit 打回滾 tag，v6 完成後一次合入 main。
>
> **寫入時機規範**（P0.0 verifier 發現後補）：本檔的 gate 狀態與勾選只在 gate step 4（verifier 判定之後）更新——phase 進行中預寫「完成態」等於 worker 自評 AC，禁止。
>
> Progress artifact（人看的儀表板）：https://claude.ai/code/artifact/e709b090-6920-4858-9d66-1429ad261e97

## Phase 狀態

- [x] P0.0 前置閘 — gate: PASS (2026-07-31)
- [x] P1 強制層可用化 + 契約凍結 — gate: PASS (2026-07-31, PR #136, tag gate-p1)
- [x] P2 引擎瘦身 + 反向耦合翻正 — gate: PASS (2026-07-31, PR #137, tag gate-p2)
- [x] P3 meta skill + 2 pilots + 最小 eval 迴路 — gate: PASS (2026-08-01, PR #138, tag gate-p3)
- [x] P4 紀律叢集 — gate: PASS (2026-08-13, PR #139, tag gate-p4；首次 FAIL→補救→再驗)
- [ ] P5 保留系統叢集（D1/D8 驗證場）
- [ ] P6 workflow 叢集 + router 收斂
- [ ] P6.5 bucket 落地（spike PASS → 執行）
- [ ] P7 eval 語料庫重建 + 全量 benchmark
- [ ] P8 文件、規範、發版 → v6.0.0-rc

## P0.0 任務

- [x] 開 `v6` 分支
- [x] `ci.yml` 觸發條件加入 `v6`（push + pull_request）
- [x] bucket spike → **PASS**（見 `spikes/plugin-skills-whitelist.md`；白名單採目錄項形式，P6.5 照計畫執行。注意：「目錄項載入整個 bucket」是額外發現、非三判定點之一，P6.5 落地時需重新驗證）
- [x] main 凍結政策（見本檔 header）
- [x] 進度載體建立（本檔 + progress artifact）
- [x] no-op PR 驗證 CI 三個 job 觸發且綠

## P1 任務（全數完成，PR #136）

- [x] pytest schema 凍結（category/status 移除、frozen 鍵集、ratchet ×3、slash cross-ref）+ `decisions/skill-schema.md`
- [x] D1 lint（skill-path-discipline 反轉刪除）、D8 lint（精確 allowlist，P5 歸零）、doc-refs R4 雙軌 + floor（runner 級）
- [x] router stub（`skills/using/`）+ 雙向契約測試
- [x] D3 任務清單格式凍結：`scripts/lib/task-list.js` + `decisions/task-list-format.md`
- [x] CI 補 check:hooks/check:eval-targets；hooks 子 npm 專案收斂；test:diary/reflect 移除
- [x] 承重規則改寫 ×5 + hooks.md/CLAUDE.md/README/AGENTS/CONTRIBUTING 假敘述清除
- [x] 負向驗證：router 壞列→router-contract 紅；反引號假引用→check:docs+pytest 雙紅；task-list 壞樣本→10+4 負向案例

### P1 gate 備註（verifier 發現）
- verifier 否決實作者對 AC2 的保守解讀：canonical 反引號列形式下 check:docs 會紅，AC2 字面成立
- worker 自報刪檔與實況不符一例（skill-path-discipline），orchestrator 補刪——「不採信自報」原則生效
- 已知前瞻風險：R4 slash floor 現靠 v5 legacy 文件撐（router 表尚空）；P8 刪 v5 文件前 v6 rows 必須先補上
- `tests/skills/test_minimal_toolkit_docs.py` 是 v5 doctrine 快照測試，P2 刪檔時必須同 commit 處理（無主，已指派給 P2）

## P2 任務（全數完成，PR #137，兩波五 worker）

- [x] Wave1-E：hooks 14→6 實體（刪 8 目錄+兩支派送器；session-tracker 拔 SDD 渲染）
- [x] Wave1-F1：D8 翻正——daemon/auto-diary/eval prompts/dashboard 搬引擎側；allowlist 7→1
- [x] Wave1-F2：loop 任務來源 DAG→D3 清單（--tasks）；loop-verifier 去 SDD
- [x] Wave2-D-core：scripts/lib −19 檔、CLI 22→5、agents/templates/Codex/dogfood/integration 全刪、website sdd 頁移除、task-list blocked note 參數
- [x] Wave2-D-skills：6 支 doomed skills 刪除、legacy 30→24、ARCFORGE_ROOT 四出貨目錄歸零、v5 快照 pytest 刪除、check:docs 52 條追到 0
- [x] verifier 修正：README/plugin.json/marketplace.json 出貨面假敘述（ARCFORGE_ROOT/SDD 宣傳）清除

### P2 gate 備註
- 「不採信自報」再度生效：兩個 worker 的 `git grep "a\|b\|c"` 單模式寫法會靜默回 0（假綠），D-skills 自查發現後改 `-e` 多模式，追回 11 處 R4 掃不到的 dangling 引用
- `${CLAUDE_PLUGIN_ROOT}` 在 skill Bash 區塊的 runtime 可用性「形式合規、runtime 未證」——P3 的 D1 scenario（[tool_called] 斷言）是驗收點
- 留給 P7/P8：cli-invocation.md 與 worktree-workflow.md 敘事層重寫（守衛掃不到的過期教學）、website Codex 卡片/skill 計數、evals 歷史紀錄、retired scenarios
- D8 allowlist = 1（session-tracker→reflect.js），P5 歸零

## P3 任務（全數完成，PR #138）

- [x] D9 spike + 裁決 + 落地（bin/arcforge shim、D1 lint 更新、16 支呼叫改裸形式）
- [x] writing-skills（142→150 行 + 2 refs，user-invoked）+ REFACTOR 回饋 ×5
- [x] pilot tdd：IMPROVED **+0.86** CI[0.75,0.96]（6v6）
- [x] pilot finishing：IMPROVED **+0.58** CI[0.55,0.62]（10v10 併池，525→154 行、零 PERMANENT 例外）
- [x] D1/D9 runtime 實證：transcript 記錄裸 arcforge 執行 + `external` kind 字串（僅真實 CLI 可產生）
- [x] router scenario IMPROVED +0.32（保守下界）；invocation-table 定案
- [x] skill-schema 三守衛（§3.1/§5.2/§7gap2）mutation 轉紅驗證；eval 引擎修兩缺陷（re: 斷言、error-trial 排除）

### P3 gate 備註（verifier 修正與掛帳）
- **verifier 否決兩項實作者敘事**：(1) d1「policy 錯位」定性不成立——真因 treatment 觸發不穩（3/5），任何 policy 都不 PASS；AC3 依「行為斷言已證」判 met-with-interpretation，行為閘對 d1 未乾淨通過。(2)「skill 一行未改」僅窄義成立（v1→v2 有未提交視窗的 treatment 輸入變動）；頭條數字 provenance 閉合（全部晚於 skill commit）。
- **磁碟級發現**：harness 對每個 trial 無條件加 `--disable-slash-commands`——headless trial 永無 Skill 工具；D6/P6 的 router 觸發矩陣與任何 `[tool_called] Skill:*` 斷言在此模態下結構不可能，scenario 設計必須繞開。
- finishing 的 eval 與 skill 高度耦合（四選項與規避語句逐字對應）——delta 真實但不得讀作泛化證據。
- **掛帳 P4**：finishing description 違反 no-summarize 規則（動它需自帶 baseline）；第二支 user-invoked skill 落地時重跑 §3.1/§5.2 mutation。
- **掛帳 P6**：router `/tdd` 與 `/finishing` 列在「實作完成但無測試」狀態上重疊、表無優先序；ROUTER_SKILL 在 pytest/jest 雙處硬編。
- **掛帳 P7**：rubric 編輯→Version bump 的 lint（防靜默混池）；eval report 與 compare 的 trial 數不一致；parseActions 只留 Bash 首行；d1 scenario 穩定性；Design Notes 改引 --disable-slash-commands。

## P4 任務（全數完成，PR #139，四路 worker + p4-finisher 稽核）

- [x] debugging（127 行+2 refs）：IMPROVED +0.16 CI[0.05,0.27]
- [x] code-review（155 行+completion-evidence ref）：two-axis IMPROVED **+0.40 CI[0.4,0.4]**（treatment 5/5 滿分）
- [x] compacting（66 行）：non-regression PASS（天花板誠實記錄，不宣稱 lift）
- [x] sessions（純 prose + `.handovers/` 慣例）：IMPROVED +0.17 CI[0.17,0.17]
- [x] 5 支 legacy 刪除（debugging/reviewing/verifying/compacting/managing-sessions），json 21→16；router 7 列
- [x] 落點對照表 73 條：`decisions/p4-absorption-map.md`（52+6 落地/14 捨棄/1 冗餘；6 條刻意反轉）
- [x] 儀器修正：eval trial timeout 300s→600s、analyzer 接收 assertionScores、two-axis 汙染池隔離（附錄存檔）

### P4 gate 備註
- **首次 verifier FAIL→補救→再驗**：FAIL 原因是 AC3 落點表只存在於 agent 訊息（不可覆核載體）+ 漏標 agents/verifier.md。補救 = 73 條全表持久化 + F 節 + 排除紀錄存檔。教訓：**gate 交付物必須落在 repo 內的耐久載體，agent 訊息不算證據**。
- two-axis 的 +0.40 證明的是「報告形狀」（兩軸不合併 + plan-mandated 缺陷仍報），非 dispatch 機制本身（1/5 trial 內聯自審仍滿分）——如實定位。
- **掛帳 P7（儀器）**：缺陷 A（SIGTERM trial 不標 infraError；修法約束＝killed 且最終輸出未完成，見 absorption-map 附錄）；duration_ms 低報（eval.js:228 優先採 stream-json 值）；finishing description no-summarize 違規（**明確改派 P7**，前提「動它需自帶 baseline」不變）；sessions 的 scenario 結構守衛等價物；range-fidelity/answering-feedback 兩 scenario 無實測池。
- P3 掛帳的 §3.1/§5.2 mutation 重跑：P4 無新 user-invoked skill，N/A，順延至下一支 user-invoked 落地時。

## 偏離紀錄

| 日期 | 偏離 | 理由 |
|------|------|------|
| 2026-07-31 | 回滾 tag 命名由 `v6-p<N>` 改為 `gate-p<N>` | `release.yml` 的 `on.push.tags: ['v*']` 會被 `v6-p0.0` 誤觸發（跑 release job 並因版本比對噴錯）。`gate-` 前綴避開 glob。 |
| 2026-07-31 | P2 AC「hooks.json 10→6 條目」改判為「hook 實體 14→6」 | verifier 查證：baseline 本來就是 6 events（該讀法無鑑別力），而 6 條目按 check-hooks-schema 自身規則（sync/async 分列）不可達。實體 14→6 精準命中計畫 Context 的「14→6」。條目實況 9。 |
| 2026-07-31 | P0.0 直接 commit 到 v6（未走 phase PR） | v6 分支自舉的雞生蛋問題（分支存在前無法對它開 PR）；P1 起全部走 phase PR。 |

## 新開裁決（D9+）

| # | 日期 | 裁決 | 內容 |
|---|------|------|------|
| D9 | 2026-07-31 | **bin/arcforge shim + 裸呼叫**（D1 機制層修正，使用者拍板） | Spike ground truth：`CLAUDE_PLUGIN_ROOT` 只給 hooks，在 skill 觸發的 Bash 中 UNSET；Claude Code 自動把每個 plugin 的 `bin/` 加進 PATH（實測端到端成功）。skill → 引擎的唯一形式改為裸呼叫 `arcforge <cmd>`；出貨 `bin/arcforge` shim；D1 lint 全面禁止 skill 內出現 CLAUDE_PLUGIN_ROOT；P2 寫入的引擎呼叫已改回裸形式。殘留：12 個 legacy 檔的 skill-local `${CLAUDE_PLUGIN_ROOT}` 路徑（豁免中、runtime 已壞、隨各自重寫 phase 以 base-dir 機制處理）。 |
