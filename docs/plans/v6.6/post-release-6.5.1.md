# 6.5.1 發版後查核（2026-10-22）

Claude Code 2.1.306。方法同 [`../v6.5/post-release-6.5.0.md`](../v6.5/post-release-6.5.0.md)，這次是 patch，每個出貨的改動只做一個探測。每一項都只查 GitHub release 與暫時安裝的複本，不讀開發 checkout 的原始程式碼；下表的「安裝版」指 `plugins/cache/arcforge-dev/arcforge/6.5.1/`。「探測專案」是一個暫時 git 專案，裡面只有一個 `## Grader` 為 `code` 的 scenario `probe651`，`PATH` 最前面放一個假 `claude`：記錄每次呼叫的參數，再把一份 stream-json fixture 印到 stdout。

| 查核 | 方式 | 結果 |
|---|---|---|
| Release | `gh run view 39632983252`、`gh release view v6.5.1` | run `success`，tag `v6.5.1` 指向 4a684202；Release 已發布（非 draft、非 prerelease，`publishedAt` 2026-10-21T16:18:44Z），body 與 CHANGELOG `[6.5.1]` 段 `diff -wB` 無差異 |
| 網站 | curl `arcforge.greghojob.workers.dev` 的 `page/hero.js`、`page/sections.js` | **失敗**：16:19:56Z 到 16:25:35Z 每 30 秒查一次，共 12 次，兩個 bundle 一直是 `v6.5.0`（`cf-cache-status: HIT`，加 query string 繞過快取也一樣）。4a684202 沒有 `Workers Builds: arcforge` 這個 check run，而 0ca06913、19b262b1、dcccc5e8 都有；release 分支的 preview（`540b8052-arcforge.greghojob.workers.dev`）已是 `v6.5.1`。正式站沒有為這次合併重新建置。安裝版裡的 `website/page/*.js` 是 6.5.1，見「版本」列。**補記（2026-10-22）**：release commit 4a684202 一直沒有建置，直到 #306 合併推上 main（0bce8da3）才觸發，該次 `Workers Builds: arcforge` 在 2026-10-21T16:47:24Z 完成（`success`），之後 `hero.js` 與 `sections.js` 都是 `v6.5.1` |
| GitHub 來源安裝 | 全新 `CLAUDE_CONFIG_DIR`、`claude plugin marketplace add GregoryHo/arcforge`、`claude plugin install arcforge@arcforge-dev` | payload 在 `plugins/cache/arcforge-dev/arcforge/6.5.1/`，是複本（無 `.git`）；`installed_plugins.json` 的 `installPath` 指向該路徑，`gitCommitSha` 為 4a684202。`node_modules` 又出現了，見下方說明 |
| SessionStart hook 從快取執行 | 在 repo 外的空目錄跑一個 `claude -p "reply with the word ok" --model opus --debug`，`ARCFORGE_HOME` 指向暫時目錄 | hook 已執行，見下方說明。該 turn 以 `Not logged in · Please run /login` 結束（exit 1），與 6.5.0 相同，未重跑 |
| preflight 歷史（#299） | 探測專案，同一個 key 跑兩次安裝版 `eval preflight probe651`：第一次 grader 全判 FAIL，第二次全判 PASS | 第一次 `Verdict: PASS`（baseline 0%），第二次 `Verdict: BLOCK`（100%）。`evals/preflight/` 下只剩第二次的紀錄（`timestamp` 2026-10-21T16:18:12.412Z），第一次的 PASS 紀錄搬到 `history/c6e1f75d3858a759-default.2026-10-21T16-17-53-689Z.json`，檔名就是它自己的 timestamp。之後呼叫安裝版 `checkPreflightGate('probe651', …)`，回的是 `Preflight BLOCK …`：gate 讀最新的那一份，不讀 `history/` |
| 每臂各自的 grading 檔（#301） | 直接呼叫安裝版 `scripts/lib/eval-grader-io.js` 的 `getGradingPath`，`eval` 分別為 `probe651-baseline`、`probe651-treatment`、`probe651-preflight`、`probe651`，`trial` 3 | 依序是 `grading/baseline-trial-3.json`、`grading/treatment-trial-3.json`、`grading/preflight-trial-3.json`、`grading/trial-3.json`，都在 `evals/results/probe651/<runId>/` 下 |
| transcript 內容與 raw 輸出（#300） | 上面第一次 preflight 的 fixture：一個 `Agent` tool_use（prompt 1,350 bytes、四段）、一個失敗的 `Bash` tool_result（`is_error: true`，內容開頭 `Exit code 1`）、一個 `result` event | `transcripts/preflight-trial-1.txt` 的 `[Tool: Agent]` 是一行 JSON，解析回來 prompt 1,350 字元、四段都在；下一塊是 `[Result: Bash] error (exit 1)`。`raw/preflight-trial-1.jsonl` 在旁邊，內容與 fixture 逐 byte 相同。該列 `transcript_format: 2` |
| 晚到的 provider 上限（#300） | 探測專案換另一份 fixture：兩次 tool call 之後，最後一個 assistant event 為 `model: "<synthetic>"`、只有 text、`usage.output_tokens: 0`；`result` event 的 `output_tokens` 為 4,430（照抄 6.5.0 那一輪的真實案例）。跑安裝版 `eval run probe651 --k 1` | `Trial 1/1: INFRA ERROR (provider_refusal: Provider refused the trial in place of the agent's turn after 2 tool calls: You have hit your session limit.)`；該列 `errorType: "provider_refusal"`、`infraError: true`、`refusalAfterActions: 2`、`transcript_format: 2`；`raw/trial-1.jsonl` 存在 |
| 有上限的 transcript 解析（#304） | 安裝版 `scripts/lib/transcript.js` 的 `parseTranscript`，餵一份 9 MiB（9,437,200 bytes、35,654 行）的合成 JSONL；再以 `opts.maxBytes` 等於最後 7 行的 byte 數解析一次；另餵一份 50 行的小檔 | 9 MiB：`truncated: true`，`totalMessages` 31,677，正好是最後 8 MiB 內放得下的完整行數，最後一則是最後一行。剛好落在行界：`truncated: true`，7 行全留，第一則就是那 7 行的第一行，另寫一個只有這 7 行的檔案做完整解析，兩者輸出相同。小檔：沒有 `truncated`，輸出與 `maxBytes: 1e12` 的解析相同 |
| `--json` 的 usage 錯誤（#302） | 安裝版 `scripts/cli.js obsidian unregister --json`（不給名稱）；`worktree list --json` 與不帶旗標各跑一次 | 前者 exit 1，stdout 0 bytes，stderr 為 `Usage: arcforge obsidian unregister <name>`。後者兩次都 exit 0，stdout `cmp` 相同 |
| lock 等待不再空轉（#303） | 一個新寫的 `.arcforge-lock`（未過期），用安裝版 `scripts/lib/locking.js` 的 `withLock`（`timeout: 300`）去等它，`/usr/bin/time -l` 量；對照組是同一個 node 空轉 300 ms | 等待 373 ms 後丟出 `LockError: Failed to acquire DAG lock after 300ms`，CPU 0.02 s user + 0.01 s sys（node 啟動本身約 0.02 s）。對照組 0.33 s user。lock 檔未被動到 |
| 版本 | 安裝版 `scripts/check-version-sync.js` | 九個位置都是 6.5.1，exit 0 |

探測專案裡，假 `claude` 每個 trial 被呼叫兩次：一次 `plugin list --json`，一次 `-p --output-format stream-json …`，兩次都印同一份 fixture。這對上面的結果沒有影響，但 `plugin list` 那一次拿到的不是它預期的輸出。

## hook 的證據

登入失敗發生在 hook 之後，所以證據取自 session 留下的檔案，不取自模型回覆：

- session-tracker 寫出 `$ARCFORGE_HOME/sessions/proj651/2026-10-21/session-06057a4e-dfa4-42cc-8be6-7e410e8f5451.json`，`started` 為 `2026-10-21T16:16:24.632Z`。`ARCFORGE_HOME` 是暫時目錄，真正的 `~/.arcforge/sessions/` 沒有出現 `proj651`。
- debug log：
  - `Read manifest hooks for plugin arcforge (enabled=true): ./hooks/claude-code.json`
  - `Hook SessionStart:startup (SessionStart) success: … Session tracker initialized (background tasks)`
  - `Hook UserPromptSubmit (UserPromptSubmit) success`
- debug log 沒有 `unknown keys`（0 行）。

快取路徑在 debug log 出現 7 次，與 6.5.0 相同：4 行是載入 skill（從 `…/6.5.1/skills/core` 載入 16 個 skill），3 行是 hook 指令本身，`session-tracker/start.js`、`session-tracker/inject-context.js`、`user-message-counter/main.js` 都以 `…/6.5.1/hooks/` 下的絕對路徑執行。

安裝後的 payload 又有 `node_modules`（208 個項目，與 6.5.0 相同），mtime 比 `package.json` 晚兩秒，marketplace 的 clone 裡沒有。這次是 Claude Code 2.1.306，所以這不是 2.1.296 才有的行為。arcforge 執行時不需要任何相依套件，這次同樣沒有往下追。

## 清理

暫時 config 目錄、空目錄、探測專案（含 `evals/preflight/` 與 `evals/results/`）、兩個暫時 `ARCFORGE_HOME`（內含那份 session 紀錄）、合成的 transcript、lock 目錄、fixture、假 `claude` 與它的呼叫紀錄都已移除。真正的 `~/.arcforge` 與執行中的 observer daemon 沒有動。

## 還欠

- `qmd` 索引更新。
- 6.6.0 的 issue：#184、#185、#256。
- vault 的 `index.md` 計數落後，發版時已記下，尚未補。
