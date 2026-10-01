# 6.2.0 發版後查核（2026-10-01）

Claude Code 2.1.286。6.1 roadmap（#191）的最後一版；三個版本都在同一天出貨。

| 查核 | 方式 | 結果 |
|---|---|---|
| Release | tag `v6.2.0` → `release.yml` | 成功，GitHub Release body 取自 CHANGELOG |
| 網站 | `arcforge.greghojob.workers.dev` 的 hero bundle | footer `v6.2.0` |
| GitHub 來源安裝 → hook | 全新 `CLAUDE_CONFIG_DIR`、`claude plugin marketplace add GregoryHo/arcforge`、一個 `-p` session | 載入；session-tracker 寫出紀錄；debug log 無 unknown-keys，4 處指向 `cache/arcforge-dev/arcforge/6.2.0` |
| 新指令 | 安裝版 `scripts/cli.js --help` | `learn instinct deactivate` / `restore` 都在 |

測試狀態（session 紀錄）已移除。

## 6.1 roadmap 收尾

- 三個版本：6.1.1（42 項）、6.1.2（48 項）、6.2.0（30 項）；120 項全部有去向。
- 兩輪量測：6.1.1 約 107 個 live session（含 34 個作廢）、6.2.0 55 個。
- 留給 owner：codex-9（`$` mention namespace，需一個付費 Codex turn）。
- 新進 backlog：五個 `redesign-*` wish（D-045、D-047）、`skill-body-trim`、#228（diagramming helper 的 traceback）。
