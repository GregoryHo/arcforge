# WP-D 對預先登記的偏離

本輪收尾的 decision 會記下這些偏離，做法與 D-054 記錄 D-049 的偏離相同。

## 1. `sessions` scenario 只量 B-11

**預先登記的內容**：D-055 (i) 與 `docs/plans/v6.4/PLAN.md`（量測額度與預先登記）規定一支 `sessions` scenario 同時涵蓋 B-10（handover 的五個段落）與 B-11（resume 時先報告狀態再停下），不拆成兩支。

**實際做法**：`evals/scenarios/eval-sessions-handover-and-resume.md` Version 1 只量 B-11。

**理由**：

- 一個 trial 只是一次 `claude -p` 呼叫，只有一則 user message，而且帶 `--no-session-persistence`（`scripts/lib/eval-trial.js:159`、`:377`、`:422-435`）。寫 handover 與讀 handover 因此無法分屬前後兩個 session。把兩件事寫進同一則 prompt，不是替 agent 排好順序，就是在 prompt 裡叫它停，B-11 等於直接送給 baseline。
- B-10 的特有部分是 `.handovers/<YYYY-MM-DD>-<slug>.md` 路徑與五個標題。沒看過這個慣例的一臂寫不出來，兩臂的差異是先天決定的，不是量出來的。這部分已由 `eval-sessions-handover-completeness` 的 A5 量測，該 scenario 也明寫 A5 不屬於它的鑑別主張。
- 語料中沒有任何 scenario 涵蓋 B-11。

**結果**：B-10 本輪沒有新的 harness 證據，維持 `eval-sessions-handover-completeness` 既有的證據。session 數不變：仍是一支 scenario，preflight 3，PASS 後 A/B 10。

**核准**：team lead，2026-10-03。理由也記在 `design-review/sessions.design.json` 的 `departure` 欄位。
