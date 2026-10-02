# 6.2.1 發版後查核（2026-10-02）

Claude Code 2.1.287。方法同 [`../v6.1/post-release-6.2.0.md`](../v6.1/post-release-6.2.0.md)。

| 查核 | 方式 | 結果 |
|---|---|---|
| Release | `gh run view 37028745952`、`gh release view v6.2.1` | run `success`，tag `v6.2.1` 指向 00ee26b1；Release 已發布（非 draft、非 prerelease），body 與 CHANGELOG `[6.2.1]` 段 `diff -wB` 無差異 |
| 網站 | curl `arcforge.greghojob.workers.dev` 的 `page/hero.js`、`page/sections.js` | 兩個 bundle 都是 `v6.2.1` |
| GitHub 來源安裝 | 全新 `CLAUDE_CONFIG_DIR`、`claude plugin marketplace add GregoryHo/arcforge`、`claude plugin install arcforge@arcforge-dev` | payload 在 `plugins/cache/arcforge-dev/arcforge/6.2.1/`，是複本（無 `.git`）；`installed_plugins.json` 的 `installPath` 指向該路徑，`gitCommitSha` 為 00ee26b1 |
| SessionStart hook 從快取執行 | 在 repo 外的空目錄跑一個 `claude -p --model opus --debug`（「reply with the word ok」） | hook 已執行，見下方說明。該 turn 以 `Not logged in · Please run /login` 結束：全新 `CLAUDE_CONFIG_DIR` 沒有登入憑證，未重跑 |
| `eval history`（#242） | 安裝版 `scripts/cli.js eval history`，暫時專案內放 `2026-10-02.json` 與 `2026-10-02-2.json` 兩份最小 snapshot | 兩份都列出（`2026-10-02 — 1 evals`、`2026-10-02-2 — 2 evals`），exit 0 |
| stale lock 回收（#243） | grep 安裝版 `scripts/lib/learning-curator/observer-daemon.sh`，未啟動 daemon | 有 `reclaim_stale_lock()` 與 `mkdir "${LOCK_DIR}.reclaim.${stale_id}"` 的保留機制；檔案與 main 相同 |

## hook 的證據

登入失敗發生在 hook 之後，所以證據取自 session 留下的檔案，不取自模型回覆：

- session-tracker 寫出 `~/.arcforge/sessions/proj/2026-10-02/session-4529310e-5d86-44b7-8b83-62b6cee5e307.json`，`started` 為 `2026-10-02T15:45:11.221Z`。
- debug log：
  - `Read manifest hooks for plugin arcforge (enabled=true): ./hooks/claude-code.json`
  - `Hook SessionStart:startup (SessionStart) success: … Session tracker initialized (background tasks)`
  - `Hook UserPromptSubmit (UserPromptSubmit) success`
- debug log 沒有 arcforge 的 `unknown keys`。

hook 的 log 行只印相對路徑 `./hooks/claude-code.json`。快取路徑在 debug log 只出現 4 次，全是載入 skill 的行（從 `…/6.2.1/skills/core` 載入 16 個 skill）。6.2.0 紀錄的「4 處指向」應該就是這幾行。hook 與快取的連結來自 `installPath`，log 本身沒有直接寫出。

測試狀態（暫時 config 目錄、兩個暫時專案、session 紀錄）都已移除。

## 還欠

- 這一版的 Obsidian vault 條目：發版時 `obsidian vaults` 卡住 120 秒，`log.md` 條目與 daily note 都沒寫。
- 後續 issue：#247、#250、#252、#253。
