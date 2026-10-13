# 6.5.0 發版後查核（2026-10-13）

Claude Code 2.1.296。方法同 [`../v6.4/post-release-6.4.0.md`](../v6.4/post-release-6.4.0.md)。每一項查的都是 GitHub release 與暫時安裝的複本，不讀開發 checkout 的原始程式碼；下表的「安裝版」指 `plugins/cache/arcforge-dev/arcforge/6.5.0/`。

| 查核 | 方式 | 結果 |
|---|---|---|
| Release | `gh run view 38334386649`、`gh release view v6.5.0` | run `success`，tag `v6.5.0` 指向 0ca06913；Release 已發布（非 draft、非 prerelease，`publishedAt` 2026-10-13T01:59:19Z），body 與 CHANGELOG `[6.5.0]` 段 `diff -wB` 無差異 |
| 網站 | curl `arcforge.greghojob.workers.dev` 的 `page/hero.js`、`page/sections.js` | 兩個 bundle 都是 `v6.5.0`，第一次查就是 |
| GitHub 來源安裝 | 全新 `CLAUDE_CONFIG_DIR`、`claude plugin marketplace add GregoryHo/arcforge`、`claude plugin install arcforge@arcforge-dev` | payload 在 `plugins/cache/arcforge-dev/arcforge/6.5.0/`，是複本（無 `.git`）；`installed_plugins.json` 的 `installPath` 指向該路徑，`gitCommitSha` 為 0ca06913。payload 多一個 `node_modules`，見下方說明 |
| SessionStart hook 從快取執行 | 在 repo 外的空目錄跑一個 `claude -p "reply with the word ok" --model opus --debug`（prompt 在旗標前面），`ARCFORGE_HOME` 指向暫時目錄 | hook 已執行，見下方說明。該 turn 以 `Not logged in · Please run /login` 結束（exit 1）：全新 `CLAUDE_CONFIG_DIR` 沒有登入憑證，未重跑 |
| SessionStart 的 archive 行（6.5.0 新增） | 暫時 git 專案與暫時 `ARCFORGE_HOME`，安裝版 `scripts/cli.js session save demo --from h.md`（五段 handover 檔），再把 SessionStart payload 從 stdin 餵給安裝版 `hooks/session-tracker/inject-context.js` | `"source":"startup"`：`systemMessage` 與 `additionalContext` 都有 `Previous session archive: demo, saved 2026-10-13. Read it: arcforge session resume demo`；`clear` 相同。`resume`、`compact`：只剩 `1 session alias`，沒有這一行。手改 `aliases.json` 把 key 換成 `-bad` 之後的 `startup`：改用路徑形式，`Previous session archive: archive-demo-20261013T020122Z.md, saved 2026-10-13. Read it: arcforge session resume <archive 的絕對路徑>`；照那個路徑 `session resume` 印出五段 |
| `eval compare --no-analyzer` | 暫時專案，一個 `## Grader` 為 `model` 的 scenario，用安裝版 `appendResult` 寫入每臂 5 列（baseline 全敗、treatment 全過）；`PATH` 最前面放一個只記錄呼叫的假 `claude` | 印出 `(Analyzer skipped: --no-analyzer. The verdict below is the harness verdict.)` 與 `Verdict:   IMPROVED`，exit 0，假 `claude` 被呼叫 0 次。對照：同一個專案不帶旗標，印出 `(Using eval-analyzer agent for qualitative analysis...)`，假 `claude` 被呼叫 1 次，verdict 相同 |
| `eval preflight` 的 run lock | 同一個暫時專案，`.eval-trials/run.lock` 寫入一個活著的 `sleep` 的 PID，再跑安裝版 `eval preflight skipped` | 0.04 秒內 exit 1：`Error: Another eval is running in this checkout: … (PID 79535, started 2026-10-13T02:05:00.000Z) holds …/.eval-trials/run.lock. …`；假 `claude` 被呼叫 0 次，lock 檔內容未變，沒有寫出 `evals/preflight/` |
| alias 不得以 `-` 開頭 | 安裝版 `session save -x --from h.md`、`session alias set -x <archive>`，再直接呼叫安裝版 `scripts/lib/session-aliases.js` 的 `validateAlias('-x')` 與 `setAlias(…, '-x', …)` | 兩個 CLI 指令都只印該指令的 `Usage:` 行，exit 1，`alias list` 仍只有 `demo`：CLI 把 `-x` 讀成旗標，沒有走到 `validateAlias`。直接呼叫：`validateAlias` 回 `{"valid":false,"error":"Alias cannot begin with -"}`，`setAlias` 回同一個 error |
| 版本 | 安裝版 `scripts/check-version-sync.js`、`scripts/cli.js --version`、`bin/arcforge --version` | `check-version-sync.js` 九個位置都是 6.5.0，exit 0。CLI 沒有 `--version` 旗標：兩個指令都印出 help 並 exit 1，所以這一半沒有東西可查 |

## hook 的證據

登入失敗發生在 hook 之後，所以證據取自 session 留下的檔案，不取自模型回覆：

- session-tracker 寫出 `$ARCFORGE_HOME/sessions/proj650/2026-10-13/session-6216add3-9cba-471b-a27a-40109c291439.json`，`started` 為 `2026-10-13T02:00:53.117Z`。`ARCFORGE_HOME` 是暫時目錄，真正的 `~/.arcforge/sessions/` 沒有出現 `proj650`。
- debug log：
  - `Read manifest hooks for plugin arcforge (enabled=true): ./hooks/claude-code.json`
  - `Hook SessionStart:startup (SessionStart) success: … Session tracker initialized (background tasks)`
  - `Hook UserPromptSubmit (UserPromptSubmit) success`
- debug log 沒有 `unknown keys`（0 行）。

快取路徑在 debug log 出現 7 次：4 行是載入 skill（從 `…/6.5.0/skills/core` 載入 16 個 skill），與 6.4.0 相同；另外 3 行是 hook 指令本身，`session-tracker/start.js`、`session-tracker/inject-context.js`、`user-message-counter/main.js` 都以 `…/6.5.0/hooks/` 下的絕對路徑執行。

安裝後的 payload 有一個 `node_modules`（208 個項目），mtime 比複製晚一秒，marketplace 的 clone 裡沒有，repo 也沒有追蹤它：是 Claude Code 2.1.296 在安裝時裝的。6.4.0 的紀錄沒有提到這個目錄，當時有沒有不得而知。arcforge 執行時不需要任何相依套件，這次沒有往下追。

## 清理

暫時 config 目錄、空目錄、暫時 git 專案、暫時 eval 專案、三個暫時 `ARCFORGE_HOME`（內含那份 session 紀錄與 `demo` archive）、假 `claude` 與它的呼叫紀錄都已移除，持有 lock 的 `sleep` 已結束。真正的 `~/.arcforge` 與執行中的 observer daemon 沒有動。

## 還欠

- `qmd` 索引更新。
- 後續 issue：#184、#185、#256。
- wish：`eval-layout-grid-v2`、`eval-transcript-full-tool-input`、`eval-provider-limit-mid-trial`（`product/BACKLOG.md`）。
- 這一輪看到、都沒有開 issue 的不穩定測試：jest worker SIGSEGV 一次；`diary-capture.test.js` 的 marker 競爭兩次；`test-cli-session-alias-lock.js` 的 EAGAIN 一次；observer-daemon 的 `ZB-T1` 一次；`learning-curator-proposal-ingestor.test.js:912` 一次。
