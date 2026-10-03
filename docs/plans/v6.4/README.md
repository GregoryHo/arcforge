# v6.4 roadmap 規劃紀錄

6.3.0 發版後的排程：6.4.0 一個版本。這裡是設計歷史，給維護 arcforge 的人看；產品狀態的正本在 `product/`（列、D-055、D-056、spec 的 B-item）。

| 檔案 | 內容 |
|---|---|
| [`PLAN.md`](PLAN.md) | 核可的計畫：6.4.0 的範圍、工作包、順序限制、量測額度與預先登記、執行規則與操作備忘 |
| [`wp-d/preflight.eval-router-skill-selection.json`](wp-d/preflight.eval-router-skill-selection.json) | 量測輪 router V2 的 preflight 紀錄（hash `4168c6b60ae1a260`，baseline 0/3，PASS），從被 gitignore 的快取原樣複製 |
| [`wp-d/preflight.eval-sessions-handover-and-resume.json`](wp-d/preflight.eval-sessions-handover-and-resume.json) | 量測輪 `sessions` V1 的 preflight 紀錄（hash `8e1d782ac42ba6e6`，重跑 `20261003-045008`，baseline 0/3，PASS），從被 gitignore 的快取原樣複製 |
| [`wp-d/audit.sessions-preflight.md`](wp-d/audit.sessions-preflight.md) | operator 對 `sessions` preflight 的稽核：重跑與中止的兩次各 3 個 trial 逐列判讀、C5 regex 離線重跑 |
| [`wp-d/audit.ab.md`](wp-d/audit.ab.md) | operator 對兩次 A/B（`sessions` V1、router V2）每一列的稽核、中止事件與 session 計數 |
| [`post-release-6.4.0.md`](post-release-6.4.0.md) | 6.4.0 發版後查核：Release、網站、GitHub 來源安裝、快取 hook、安裝版 `arcforge session` 與 daemon `status` |

上一輪的規劃在 [`../v6.3/`](../v6.3/)。
