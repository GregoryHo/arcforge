# arcforge v6 — progress

> 北極星計畫：`docs/plans/v6/PLAN.md`（靜態基準，不追蹤進度）。本檔為唯一進度載體（D3 checkbox 格式 v0，格式規格於 P1 凍結後如有變動，本檔跟著改——那是格式 churn 的早期警報）。
>
> **main 凍結政策**：v6 開發期間 `main` 凍結 v5 patch（不出 hotfix）。所有工作在 `v6` 長期分支，每個 phase 一個 PR 進 `v6`，phase exit 打回滾 tag，v6 完成後一次合入 main。

## Phase 狀態

- [x] P0.0 前置閘 — gate: PASS (2026-07-31)
- [ ] P1 強制層可用化 + 契約凍結
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
- [x] bucket spike → **PASS**（見 `spikes/plugin-skills-whitelist.md`；白名單採目錄項形式，P6.5 照計畫執行）
- [x] main 凍結政策（見本檔 header）
- [x] 進度載體建立（本檔 + progress artifact）
- [x] no-op PR 驗證 CI 三個 job 觸發且綠

## 偏離紀錄

| 日期 | 偏離 | 理由 |
|------|------|------|
| 2026-07-31 | 回滾 tag 命名由 `v6-p<N>` 改為 `gate-p<N>` | `release.yml` 的 `on.push.tags: ['v*']` 會被 `v6-p0.0` 誤觸發（跑 release job 並因版本比對噴錯）。`gate-` 前綴避開 glob。 |

## 新開裁決（D9+）

（無）
