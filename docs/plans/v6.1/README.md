# v6.1 roadmap 規劃紀錄

6.1.0 發版後的盤點與排程。這裡是設計歷史，給維護 arcforge 的人看；產品狀態的正本在 `product/`。

| 檔案 | 內容 |
|---|---|
| [`PLAN.md`](PLAN.md) | 核可的計畫：三個版本（6.1.1、6.1.2、6.2.0）的範圍、工作包、eval 額度、待定決策 |
| [`recap-2026-09-29.json`](recap-2026-09-29.json) | 盤點出的 120 項未完成事項，每項含 `id`、排定的 `version`、說明與證據 |
| [`wp-e/`](wp-e/) | `claude plugin eval` 三個 case 的彙總結果（D-024、D-025、D-044 的證據） |
| [`wp-f/`](wp-f/) | 6.1.1 量測回合的七份 preflight 讀數，從被 gitignore 的快取複製出來（D-021、D-045 的證據） |
| [`wp-g-post-install.md`](wp-g-post-install.md) | 6.1.1 安裝後查核（release-4、hooks-8、GitHub 來源的 hook 驗證）與兩個 6.1.2 候選 |

## 事項編號

`id` 的格式是 `<領域>-<n>`，例如 `learning-1`。領域有十個：skill-system、cli、hooks、learning、eval、obsidian、worktrees-loop、codex、sdd、release。

`PLAN.md` 的工作包以這些編號指稱事項。要查某一項的證據：

```bash
node -e "const r=require('./docs/plans/v6.1/recap-2026-09-29.json'); console.log(r.items.find(i=>i.id==='learning-1'))"
```

## 盤點怎麼做的

盤點對象是 main 的 `10974a2c`。18 個 reader 分頭讀各領域的 spec、程式、issue、backlog 與 decision log，合併重複後逐項對照程式碼查證。原始 244 項，合併成 116 組，查證後留下 120 項，另有 3 項被駁回（列在 JSON 的 `refuted`）。

各項的 `kind`：

| 值 | 意思 |
|---|---|
| `broken` | 已出貨，但行為與承諾不符 |
| `partial` | 刻意只做一部分，有記錄在案的 Residual 或 Cost accepted |
| `unverified` | 已出貨，但某個宣稱沒量過、沒測過 |
| `decision-needed` | 卡在維護者的決定，不是卡在程式 |
| `not-started` | 只有想法，還沒有實作 |
