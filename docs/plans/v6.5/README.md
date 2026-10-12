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

preflight 紀錄、稽核與發版後查核會隨各工作包的 PR 加進這張表。

上一輪的規劃在 [`../v6.4/`](../v6.4/)。
