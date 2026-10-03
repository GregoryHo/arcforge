# 6.4.0 發版後查核（2026-10-03）

Claude Code 2.1.288。方法同 [`../v6.3/post-release-6.3.0.md`](../v6.3/post-release-6.3.0.md)。

| 查核 | 方式 | 結果 |
|---|---|---|
| Release | `gh run view 37101622647`、`gh release view v6.4.0` | run `success`，tag `v6.4.0` 指向 20536307；Release 已發布（非 draft、非 prerelease），body 與 CHANGELOG `[6.4.0]` 段 `diff -wB` 無差異 |
| 網站 | curl `arcforge.greghojob.workers.dev` 的 `page/hero.js`、`page/sections.js` | 兩個 bundle 都是 `v6.4.0`，第一次查就是 |
| GitHub 來源安裝 | 全新 `CLAUDE_CONFIG_DIR`、`claude plugin marketplace add GregoryHo/arcforge`、`claude plugin install arcforge@arcforge-dev` | payload 在 `plugins/cache/arcforge-dev/arcforge/6.4.0/`，是複本（無 `.git`）；`installed_plugins.json` 的 `installPath` 指向該路徑，`gitCommitSha` 為 20536307 |
| SessionStart hook 從快取執行 | 在 repo 外的空目錄跑一個 `claude -p "reply with the word ok" --model opus --debug`（prompt 在旗標前面） | hook 已執行，見下方說明。該 turn 以 `Not logged in · Please run /login` 結束：全新 `CLAUDE_CONFIG_DIR` 沒有登入憑證，未重跑 |
| `arcforge session`（D-056） | 暫時 `HOME` 與暫時 git 專案，安裝版 `scripts/cli.js session`，五段 handover 檔 | `save demo --from h.md` exit 0（`alias "demo", new`）；不帶 `--force` 再存一次 exit 1，`alias "demo" already exists — pass --force to overwrite it`；帶 `--force` exit 0（`updated`），`alias list` 指向新 archive；兩個檔 `archive-demo-20261003T060538Z.md`、`archive-demo-20261003T060540Z.md` 都在，`list` 新的在前、舊的 alias 欄是 `-`；`resume demo` 印出 metrics header 與五段 |
| archive 不含使用者訊息 | 同一個暫時 `HOME`，餵安裝版 `session-tracker/start.js` 與 `user-message-counter/main.js` 一個假 SessionStart 與一個 prompt 含 `PROMPTCANARY` 的 UserPromptSubmit（`ARCFORGE_OBSERVE_NO_SPAWN=1`），再 `save demo2` | 有 tracker 紀錄時的 stamp 行：`**Metrics:** as the session-tracker record holds them at 2026-10-03T06:05:56.767Z — since the record's last diary capture or resume, not since the session began; the current turn may not be counted`；`PROMPTCANARY` 在 archive 中 0 次，在暫時 `~/.arcforge` 任何檔案中也沒有。`User messages` 一欄是 `none recorded`，計數器沒有寫進這份紀錄，本次未追 |
| v5 格式 | `session resume v5.md`，檔內為 `Summary / What Worked / What Failed / Blockers / Next Step` | exit 1，`the v5 session archive format (…) is not supported — only the five handover sections are read` |
| `observer-daemon.sh status` | 安裝版 script，`HOME` 指向空目錄（`ARCFORGE_HOME` 未設），連跑兩次 | 兩次都 `Observer daemon: STOPPED`、exit 0，跑完目錄仍是空的：沒有建立 `.observer.lock`，也沒有其他檔案 |
| `atomic-write.js` 拆出 | 安裝版 `scripts/lib/` | `atomic-write.js` 存在，export `atomicWriteFile`；`utils.js` 的 `atomicWriteFile` 為 `undefined` |

## hook 的證據

登入失敗發生在 hook 之後，所以證據取自 session 留下的檔案，不取自模型回覆：

- session-tracker 寫出 `~/.arcforge/sessions/proj640/2026-10-03/session-626b21e1-a5d3-4468-bdd2-6b2901d18e1e.json`，`started` 為 `2026-10-03T06:05:15.216Z`。
- debug log：
  - `Read manifest hooks for plugin arcforge (enabled=true): ./hooks/claude-code.json`
  - `Hook SessionStart:startup (SessionStart) success: … Session tracker initialized (background tasks)`
  - `Hook UserPromptSubmit (UserPromptSubmit) success`
- debug log 沒有 `unknown keys`。

快取路徑在 debug log 出現 4 次，全是載入 skill 的行（從 `…/6.4.0/skills/core` 載入 16 個 skill），與 6.3.0 相同。

測試狀態（暫時 config 目錄、暫時 `HOME`、空目錄、暫時 git 專案、`~/.arcforge/sessions/proj640/` 的 session 紀錄）都已移除。真正的 `~/.arcforge` 與執行中的 observer daemon 沒有動。

## 還欠

- `qmd` 索引更新。
- 後續 issue：#256、#184、#185。
- wish：`eval-concurrent-run-guard`、`preflight-result-rows`、`eval-skill-files-outside-trial`（`product/BACKLOG.md`）。
- eli5 頁面重新發布。
