# 6.3.0 發版後查核（2026-10-02）

Claude Code 2.1.287。方法同 [`post-release-6.2.1.md`](post-release-6.2.1.md)。

| 查核 | 方式 | 結果 |
|---|---|---|
| Release | `gh run view 37048968360`、`gh release view v6.3.0` | run `success`，tag `v6.3.0` 指向 06994bf7；Release 已發布（非 draft、非 prerelease），body 與 CHANGELOG `[6.3.0]` 段 `diff -wB` 無差異 |
| 網站 | curl `arcforge.greghojob.workers.dev` 的 `page/hero.js`、`page/sections.js` | 兩個 bundle 都是 `v6.3.0` |
| GitHub 來源安裝 | 全新 `CLAUDE_CONFIG_DIR`、`claude plugin marketplace add GregoryHo/arcforge`、`claude plugin install arcforge@arcforge-dev` | payload 在 `plugins/cache/arcforge-dev/arcforge/6.3.0/`，是複本（無 `.git`）；`installed_plugins.json` 的 `installPath` 指向該路徑，`gitCommitSha` 為 06994bf7 |
| SessionStart hook 從快取執行 | 在 repo 外的空目錄跑一個 `claude -p "reply with the word ok" --model opus --debug` | hook 已執行，見下方說明。該 turn 以 `Not logged in · Please run /login` 結束：全新 `CLAUDE_CONFIG_DIR` 沒有登入憑證，未重跑 |
| 重疊 opt-in（#164） | 暫時 `HOME` 與暫時專案，安裝版 `scripts/cli.js learn enable --global`、`learn enable --project`、`learn disable --global`，再 `learn status --json` | global 帶 `enabled_at`、`disabled_at`（與 `updated_at` 相同），project 帶 `enabled_at`；安裝版 `learningEnabledSince` 讀出 global 的 `enabled_at`（`18:44:23.429Z`），不是 project 的 `18:44:24.608Z` |
| helper 錯誤輸出（#228） | 安裝版 `check_overlaps.py` 讀一個不完整的 JSON 檔 | 只印一行 `ERROR: Invalid JSON: Expecting value: line 1 column 15 (char 14)`，exit 1 |
| fence 前的 code span（#210） | 安裝版 `lint_vault.py --scope all --json`，note 內容為 `` Text ```literal ``、fence 內 `[[Example]]`、fence 後 `Real: [[Link]]` | link graph：`Example` inbound 0、`Link` inbound 1。同一個 vault 用 v6.2.1 的 script 跑是相反的（`Example` 1、`Link` 0） |

## hook 的證據

登入失敗發生在 hook 之後，所以證據取自 session 留下的檔案，不取自模型回覆：

- session-tracker 寫出 `~/.arcforge/sessions/proj630/2026-10-02/session-049f3a69-cfe1-445d-9976-8564519c3b97.json`，`started` 為 `2026-10-02T18:44:05.294Z`。
- debug log：
  - `Read manifest hooks for plugin arcforge (enabled=true): ./hooks/claude-code.json`
  - `Hook SessionStart:startup (SessionStart) success: … Session tracker initialized (background tasks)`
  - `Hook UserPromptSubmit (UserPromptSubmit) success`
- debug log 沒有 `unknown keys`。

快取路徑在 debug log 出現 4 次，全是載入 skill 的行（從 `…/6.3.0/skills/core` 載入 16 個 skill），與 6.2.1 相同。

第一次執行把 prompt 放在 `--debug` 後面，`--debug` 把它當成 filter 參數吃掉，`-p` 沒有拿到 prompt，以 `Input must be provided…` 結束（exit 1）。這次失敗是指令寫錯，與登入無關，所以把 prompt 移到旗標前面重跑一次；上表是重跑的結果。那次執行也寫出一份 session 紀錄（`session-6d7377f7-…`），已一併刪除。

在 repo 內執行 `claude plugin install` 時會提示「This plugin is disabled in your settings」，原因是 repo 的 `.claude/settings.json` 停用 arcforge；全新 config 目錄的 user settings 是 `"arcforge@arcforge-dev": true`，hook 執行在 repo 外，不受影響。

測試狀態（暫時 config 目錄、暫時 `HOME`、兩個暫時專案、暫時 vault、兩份 session 紀錄）都已移除。真正的 `~/.arcforge` 與執行中的 observer daemon 沒有動。

## 還欠

- Obsidian vault 條目：6.2.1 與 6.3.0 都還沒寫（兩次發版時 `obsidian vaults` 都沒有回應，`log.md` 條目與 daily note 都沒寫）。
- 後續 issue：#247、#250、#252、#253、#256、#260、#263。
