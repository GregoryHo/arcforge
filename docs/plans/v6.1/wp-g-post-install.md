# WP-G：6.1.1 安裝後查核（2026-10-01）

Claude Code 2.1.286。記錄 release-4 與 hooks-8 的實測結果，以及過程中發現、尚未排進版本的兩個小項。

## 做了什麼

| 查核 | 方式 | 結果 |
|---|---|---|
| hooks-7 殘留：GitHub 來源的安裝會不會載入 hook | 全新 `CLAUDE_CONFIG_DIR`，`claude plugin marketplace add GregoryHo/arcforge`、`claude plugin install arcforge@arcforge-dev`，在 repo 外的空目錄跑一個 `-p` session | 載入。payload 是 `plugins/cache/arcforge-dev/arcforge/6.1.1/` 下的複本（非 git checkout）；session-tracker 寫出 `~/.arcforge/sessions/<dir>/` 的紀錄 |
| hooks-8：unknown-keys 警告消失 | `claude -p --debug`，比對 6.1.0 快取複本與 6.1.1 的 debug log | 6.1.0 的 log 有 `[WARN] Plugin arcforge: hooks.json: unknown keys "id" …`；6.1.1 的 log 沒有。`-p` 的 stderr 兩邊都不印這條，所以只有 debug log 能證明 |
| release-4：looping | 安裝版 `scripts/cli.js loop --tasks tasks.md --max-runs 1 --model haiku` | 一輪完成，`verify:` 通過，checkbox 翻成 `[x]` |
| release-4：learning | `learn enable --project` → 一個 haiku session → 對 daemon 送 `SIGUSR1` | `project-roots/<project>.json` 寫出；observe hook 擷取 observation；daemon 只分析有紀錄且啟用的專案（`Skipping arcforge: learning is not enabled for it`）；curator 以 `--tools ""` 執行 |
| release-4：obsidian ingest | 以安裝版 CLI 註冊暫時 vault（llm-wiki preset），一個 sonnet session 跑 `/arcforge:maintaining-obsidian` ingest | bootstrap（AGENTS/SCHEMA/CLAUDE.md）+ Raw 複本 + source note + index + log 全部寫出 |

安裝後的測試狀態（暫時 vault、learning opt-in、observation、session 紀錄）都已移除。

## 順手發現，排入 6.1.2 候選

- **worktrees-loop**：在不是 git repo 的目錄跑 `loop`，摘要前會印一行 `fatal: not a git repository`。不影響結果，是 loop 收尾時無條件呼叫 git。→ WP-K。
- **learning**：daemon 是 `~/.arcforge/instincts/.observer.lock` 的單例，閒置 30 分鐘或滿 2 小時才自行結束。從 6.1.0 升級後，舊版 daemon 若還活著，6.1.1 的 SessionStart 不會取代它，最長再跑 2 小時——這段期間仍是 6.1.0 的行為（不看 opt-in、curator 帶工具）。升級說明應該寫一句，或 SessionStart 看到舊版 daemon 時換掉它。→ WP-J。
- **目錄來源的 marketplace 從原始目錄解析元件**，不是從快取（詳見 `.claude/rules/plugin.md` 的 Residual）。對使用者沒有影響；對 contributor 的意義是：用目錄 marketplace 做的「快取路徑」驗證其實驗的是 manifest key。
