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
- [ ] P2 引擎瘦身 + 反向耦合翻正
- [ ] P3 meta skill + 2 pilots + 最小 eval 迴路
- [ ] P4 紀律叢集
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

## 偏離紀錄

| 日期 | 偏離 | 理由 |
|------|------|------|
| 2026-07-31 | 回滾 tag 命名由 `v6-p<N>` 改為 `gate-p<N>` | `release.yml` 的 `on.push.tags: ['v*']` 會被 `v6-p0.0` 誤觸發（跑 release job 並因版本比對噴錯）。`gate-` 前綴避開 glob。 |

## 新開裁決（D9+）

（無）
