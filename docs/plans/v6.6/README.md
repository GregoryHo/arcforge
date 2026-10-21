# v6.6 roadmap 規劃紀錄

6.5.0 發版後的排程：先 6.5.1（儀器修補，0 個 trial session），再 6.6.0（第二個 staged skill 目錄與一輪量測）。這裡是設計歷史，給維護 arcforge 的人看；產品狀態的正本在 `product/`（列、D-065 起的 decision、spec 的 B-item）。

| 檔案 | 內容 |
|---|---|
| [`PLAN.md`](PLAN.md) | 核可計畫（2026-10-20）：兩個版本各自的範圍與假設、要記錄哪些 decision、6.5.1 與 6.6.0 工作包、順序限制、量測額度與預先登記、執行規則 |
| [`wp-d/design-gate.executing-dispatching-v2.md`](wp-d/design-gate.executing-dispatching-v2.md) | D1 `executing` → `dispatching` 交接（#184）的離線設計關卡：MEASURABLE，兩臂同一份 `executing`、treatment 多 `--also-stage skills/core/dispatching`，斷言是 Agent 呼叫的 prompt 逐字帶三條 acceptance criteria |
| [`wp-d/design-gate.diagramming-layout-v2.md`](wp-d/design-gate.diagramming-layout-v2.md) | D2 `eval-diagramming-obsidian-layout-grid` Version 2（#185）的離線設計關卡：MEASURABLE，六個對等的 Primary 服務排一列、不點名寬度；preflight 天花板 BLOCK 就關閉 #185 |
| [`post-release-6.5.1.md`](post-release-6.5.1.md) | 6.5.1 發版後查核（2026-10-22）：release、網站、GitHub 來源安裝、hook 從快取執行，以及每個出貨改動各一個探測 |

上一輪的規劃在 [`../v6.5/`](../v6.5/)。
