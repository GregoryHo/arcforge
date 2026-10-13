# v6.5 roadmap 規劃紀錄

6.4.0 發版後的排程：6.5.0 一個版本。這裡是設計歷史，給維護 arcforge 的人看；產品狀態的正本在 `product/`（列、D-059 到 D-062、spec 的 B-item）。

| 檔案 | 內容 |
|---|---|
| [`PLAN.md`](PLAN.md) | 核可的計畫：6.5.0 的範圍、工作包、順序限制、量測額度與預先登記、執行規則與操作備忘 |
| [`wp-d/design-gate.sessions-resume.md`](wp-d/design-gate.sessions-resume.md) | D1 `sessions` V2（真 archive）的離線設計關卡：MEASURABLE，三個條件加一條 preflight 停止規則 |
| [`wp-d/design-gate.executing-dispatching.md`](wp-d/design-gate.executing-dispatching.md) | D2 `executing` → `dispatching` 交接的離線設計關卡：NOT MEASURABLE，0 個 session，記為發現 |
| [`wp-d/design-gate.verify-exit.md`](wp-d/design-gate.verify-exit.md) | D3 verify-exit 的第二次離線設計關卡：NOT MEASURABLE，0 個 session，記為發現 |
| [`wp-d/design-gate.diagramming-layout.md`](wp-d/design-gate.diagramming-layout.md) | D4 `diagramming-obsidian` 版面 reference 的離線設計關卡：MEASURABLE，只限交出座標計畫的 task |
| [`wp-d/design-gate.sessions-handover-writing.md`](wp-d/design-gate.sessions-handover-writing.md) | D5 `sessions` handover 撰寫（有條件）的離線設計關卡：MEASURABLE，只能讀成 treatment 的非回歸 |
| [`wp-d/budget.md`](wp-d/budget.md) | 五道關卡判定之後的 session 額度：排定 26，D5 有條件 13，最壞情況 53，上限 80 |
| [`wp-d/audit.d1.md`](wp-d/audit.d1.md) | D1 的 operator 稽核：preflight 3 列與 A/B 10 列逐列，resume 呼叫對照 wrapper 的 log，treatment 的停下逐項檢查 |
| [`wp-d/audit.d4.md`](wp-d/audit.d4.md) | D4 的 operator 稽核：兩次 preflight 的 6 列，舊 reference 的 baseline 以 140 寬的方塊通過，天花板 BLOCK 記為發現 |
| [`wp-d/audit.d5.md`](wp-d/audit.d5.md) | D5 的 operator 稽核：preflight 3 列與 A/B 10 列逐列，每臂在七項斷言上的通過數，只讀成 treatment 沒有回歸 |
| [`wp-d/preflight.eval-sessions-handover-and-resume.json`](wp-d/preflight.eval-sessions-handover-and-resume.json) | D1 的 preflight 紀錄，原樣複製：PASS，baseline 0/3 |
| [`wp-d/preflight.eval-diagramming-obsidian-layout-grid-1.json`](wp-d/preflight.eval-diagramming-obsidian-layout-grid-1.json) | D4 第一次 preflight 的紀錄，原樣複製：BLOCK，沒有通過率，1 個 trial 被 provider 拒絕 |
| [`wp-d/preflight.eval-diagramming-obsidian-layout-grid-2.json`](wp-d/preflight.eval-diagramming-obsidian-layout-grid-2.json) | D4 重跑的 preflight 紀錄，原樣複製：BLOCK，baseline 3/3，天花板 |
| [`wp-d/preflight.eval-sessions-handover-completeness.json`](wp-d/preflight.eval-sessions-handover-completeness.json) | D5 的 preflight 紀錄，原樣複製：PASS，baseline 0/3（三列都是 0.71） |
| [`post-release-6.5.0.md`](post-release-6.5.0.md) | 6.5.0 發版後查核：release、網站、GitHub 來源安裝、hook 從快取執行、SessionStart 的 archive 行、`eval compare --no-analyzer`、run lock、alias 規則、版本 |

量測輪的結果記在 `product/ROADMAP.md` 的 D-064 與 `evals/skill-eval-coverage.md` 的「6.5.0 量測輪」。

上一輪的規劃在 [`../v6.4/`](../v6.4/)。
