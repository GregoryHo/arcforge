# v6.6 roadmap 規劃紀錄

6.5.0 發版後的排程：先 6.5.1（儀器修補，0 個 trial session），再 6.6.0（第二個 staged skill 目錄與一輪量測）。這裡是設計歷史，給維護 arcforge 的人看；產品狀態的正本在 `product/`（列、D-065 起的 decision、spec 的 B-item）。

| 檔案 | 內容 |
|---|---|
| [`PLAN.md`](PLAN.md) | 核可計畫（2026-10-20）：兩個版本各自的範圍與假設、要記錄哪些 decision、6.5.1 與 6.6.0 工作包、順序限制、量測額度與預先登記、執行規則 |
| [`wp-d/design-gate.executing-dispatching-v2.md`](wp-d/design-gate.executing-dispatching-v2.md) | D1 `executing` → `dispatching` 交接（#184）的離線設計關卡：MEASURABLE，兩臂同一份 `executing`、treatment 多 `--also-stage skills/core/dispatching`，斷言是 Agent 呼叫的 prompt 逐字帶三條 acceptance criteria |
| [`wp-d/design-gate.diagramming-layout-v2.md`](wp-d/design-gate.diagramming-layout-v2.md) | D2 `eval-diagramming-obsidian-layout-grid` Version 2（#185）的離線設計關卡：MEASURABLE，六個對等的 Primary 服務排一列、不點名寬度；preflight 天花板 BLOCK 就關閉 #185 |
| [`wp-d/round.md`](wp-d/round.md) | 6.6.0 量測輪帳本（2026-10-22）：D-068 第 4 點的 digest 在量測 commit 重算、四次 run 的指令、起訖、session 花費與結果，兩次 infrastructure 重跑的原因 |
| [`wp-d/audit.d1.md`](wp-d/audit.d1.md) | D1 preflight 的逐列稽核：3/3 PASS、天花板 BLOCK，baseline 把三條 acceptance criteria 逐字貼進 writer 的 brief；D-068 第 7 點的四個計數 |
| [`wp-d/audit.d2.md`](wp-d/audit.d2.md) | D2 preflight 的逐列稽核：3/3 PASS、天花板 BLOCK，baseline 看出舊格線與 40 px 最小值的矛盾、自己放大欄距；格式與間距 FAIL 各 0 |
| `wp-d/preflight.*.json` | preflight 紀錄複本：D1 run 1（`setup_failed`）、D1 run 2（BLOCK）、D2 run 4（BLOCK）；`-1`、`-2` 的 D2 紀錄是 Version 1 的，在 `../v6.5/wp-d/` |
| [`post-release-6.5.1.md`](post-release-6.5.1.md) | 6.5.1 發版後查核（2026-10-22）：release、網站、GitHub 來源安裝、hook 從快取執行，以及每個出貨改動各一個探測 |

上一輪的規劃在 [`../v6.5/`](../v6.5/)。
