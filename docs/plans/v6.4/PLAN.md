# arcforge roadmap：6.4.0

## Context

- main 停在 `c5328ba4`：v6.3.0（tag 在 `06994bf7`）之後又合併了 #265、#266、#267。
- 為什麼併成一版：
  - #267 改了 `skills/core/diagramming-obsidian/SKILL.md`，沒有 harness 證據，所以下一個版本不論是什麼都得重新產生 benchmark、付一輪量測的費用。原本規劃的 6.3.1 也逃不掉這一輪。
  - 6.0.0 把 v5 的 session archive 與 alias（save、resume、list、alias）拿掉，沒有 decision，CHANGELOG 也沒寫；底下的 `scripts/lib/session-utils.js`、`session-aliases.js` 一直留在出貨的程式裡，沒有對外入口。
  - 新增一個 CLI group 屬於 minor，前例是 6.2.0（D-020）。引擎修正搭這一版出貨，一輪量測只付一次。
- 2026-10-03 維護者在對話中逐一對齊每支 skill 的定位，得出兩項更正與一項確認：
  - 更正：`speccing` 是 v5 spec-driven pipeline 的檔案式替代品，不是 arcforge 內部專用的工具。
  - 更正：`sessions` 少了 v5 的 save／resume／list／alias。
  - 確認：hook registry 的檔名 `hooks/claude-code.json` 就是擋住 Codex 的機制，D-013 已記載。

產品狀態的正本在 `product/`：6.4.0 的列、D-055、D-056、六份 spec 的 B-item。本文件是排程與執行方式；兩者不一致時以 decision 為準。

## 已定案（維護者 2026-10-03 決定）

D-055：

1. 6.4.0 是 minor，帶回 session archive，成為第六個 CLI group `arcforge session`，並附上驅動它的 `sessions` skill 指示，設計依 D-056。
2. 原定 6.3.1 的引擎修正一起出貨：#247（沒有可用的 `ps` 時把活著的 daemon 看成 stale）、#252（手動 `stop`／`status` 與 start 競爭）、#253（共用 atomic-write helper 只有一個暫存檔名）、#260（並行 PostToolUse 時 diary 工具計數遺失）、#250（code grader 改從空的暫存目錄執行）。
3. README 與 `docs/guide/skills-reference.md` 寫明 `speccing` 取代 v5 的 spec-driven pipeline，用檔案而不是引擎。
4. 6.4.0 的 CHANGELOG 條目帶兩項對過去條目的更正：6.3.0 的「該行以安裝指令結尾」在缺少 `uv` 時不成立；6.0.0 漏寫了 save／resume／list／alias 被拿掉。
5. 一輪量測，`opus[1m]`／`xhigh`，上限約 40 個 trial session，規則在讀任何結果之前定好：(i) `sessions` 的 handover 與 present-then-stop 行為，skill scope；(ii) `eval-router-skill-selection` Version 2 的回歸量測；(iii) `diagramming-obsidian` 的 verify-exit 句子，前提是設計者先證明現行引擎能讓兩臂不同，否則記為發現、不花 session。

D-056：

1. 第六個 CLI group `arcforge session`：`save <alias> --from <path|->`、`resume <alias|path>`、`list`、`alias set <name> <archive-path>`／`alias remove <name>`／`alias list [--json]`，對外開放 `scripts/lib/session-utils.js` 與 `scripts/lib/session-aliases.js`。
2. archive 是引擎寫的 metrics header（時長、工具呼叫數、使用者訊息數、修改的檔案），取自專案最近一筆 session-tracker 紀錄，或 `--session <id-prefix>` 選定的那筆：是該紀錄在 `lastUpdated` 時間戳記當下持有的計數，從上次 diary capture 或 resume 起算，不是整個 session 的總數，header 另有一行寫明這個時間戳記。後接 handover 的五個段落 `Where it stands`、`Done`、`Unfinished`、`Decisions`、`Next`，由 agent 在 session 內寫、經 `save --from` 交給引擎；缺段落、順序不對或有段落是空的，引擎拒絕寫入。沒有任何背景 model 呼叫寫其中任何部分。
3. 存放在 `~/.arcforge/sessions/<project>/<date>/`；每個專案一份 alias 索引 `~/.arcforge/sessions/<project>/aliases.json`，alias 以專案為範圍，沒有保留名稱，覆寫既有的名稱要加 `--force`。
4. `.handovers/<date>-<slug>.md` 仍是可 commit、給別人的交接檔，段落相同；`resume` 兩種都讀，只讀這五個段落，v5 段落格式的 archive 不支援。
5. archive 不寫 v5 的 Conversation Trail：不含使用者訊息的任何文字，不論 learning 是否啟用。
6. `sessions` skill 加上 save、resume、list、alias 的指示；handover 與 present-then-stop 在本輪以 skill scope 量測，CLI 部分以契約測試出貨。

維護者的兩項裁示：

- archive 不帶使用者訊息的文字（D-056 第 5 點）。
- `resume` 只讀五個段落（D-056 第 4 點）。

其他：

- 量測上限約 40 個 trial session。
- 不在範圍內、維持開啟：#256、#184、#185。

## 執行規則（本輪適用）

- **Worker 模型**：只有主 session 用 Fable。每個 worker、`pm`、`qa` 派工時一律帶 `model: "opus"`。
- **停用 advisor**：每份 worker brief 都寫明不得呼叫 advisor 工具。
- **對外動作**：push、開 PR、squash merge、建立或關閉 issue 由主 session 執行。
- **合併條件**：CI 全綠、Codex 自動審查完成且每則意見都已修正或回覆、`qa` 審查無未處理的發現。三者缺一不合併。
- **打 tag**：6.4.0 的 tag 由主 session 推送，條件是 release PR 已合併、CI 全綠、發版前查核通過。
- **live eval**：一律由主 session 啟動，不交給 subagent，且不超過上限。subagent 休眠時它在背景跑的 eval 行程會被回收（`evals/skill-eval-coverage.md` 有記錄）。
- **spec 與程式的順序**：Codex 審查回報「spec 在另一個 PR」是順序問題，先合併 spec 的 PR。
- **B-item 的措辭**：程式 PR 改變了某個 B-item 的敘述時，spec 的句子放在同一個 PR。
- **天花板 BLOCK**：記為發現，不重跑到通過為止。
- **每個 commit 前**：`npm run lint:fix`、`npm test`（5 個 runner）、7 個 static check。

## 工作包

| 工作包 | 事項 | 內容 | spec |
|---|---|---|---|
| WP-A 引擎修正 | #250、#260、#247、#252、#253 | PR #268（#250，code grader 從空的暫存目錄執行）；PR #269（#260，diary 工具計數）；PR #270（#247、#252、#253，分支 `fix/observer-lock-atomic-write-races`） | eval B-14、hooks B-9、learning B-21、B-22 |
| WP-B sessions | D-056 | 見下方 | cli B-9、learning B-20、skill-system B-10 到 B-12 |
| WP-C 文件 | D-055 第 3、4 點 | README 與 `docs/guide/skills-reference.md`：`speccing` 取代 v5 pipeline，用檔案而不是引擎。6.4.0 的 CHANGELOG 條目帶兩項更正（6.3.0 的 `uv` 那一行；6.0.0 沒記錄的 archive 移除），並寫明 v5 格式的 archive 不會被讀取 | — |
| WP-D 量測 | D-055 第 5 點 | 見「量測額度與預先登記」 | skill-system B-3、B-10、B-11；obsidian B-10 |
| WP-E 發版 | — | 見下方 | — |

**WP-A 建置時欠下的 spec 修改**（依「B-item 的措辭」規則，放在對應的程式 PR）：

- cli B-3 的「five groups」改成六個，放在 WP-B 引擎 PR（B-9 寫著「Until 6.4.0 ships, B-3 names the five groups shipped today」）。
- learning 資料模型的 Residual 刪掉 #247 與 #252 那兩句，放在 PR #270（B-21 寫著那段 Residual 在 6.4.0 出貨前仍描述產品）。

**WP-B sessions**，先引擎、後 skill：

1. 引擎 PR：`arcforge session` group（`save <alias> --from <path|->`、`resume <alias|path>`、`list`、`alias set|remove|list`，指令形狀見 cli B-9）加進 `scripts/cli.js` 與 `scripts/lib/cli-manifest.js`，底層是 `scripts/lib/session-utils.js` 與 `session-aliases.js`。
2. `generateSession` 改寫成 metrics header 加五個 handover 段落，不寫 Conversation Trail；`parseSessionSections`／`formatSessionBriefing` 只處理五個段落。
3. `save` 驗證輸入的五個段落（全部存在、順序正確、沒有空段落），否則非零結束、不寫任何檔案；header 加上寫明 `lastUpdated` 時間戳記的那一行；`--session <id-prefix>` 選定 tracker 紀錄。
4. `scripts/lib/session-aliases.js`：刪掉 `RESERVED_NAMES`（cli B-9：沒有保留名稱）；`setAlias` 遇到既有名稱時拒絕覆寫，除非帶 `--force`（現在會直接覆寫）。
5. archive 與 `aliases.json` 各有 schema 測試。
6. 同一個 PR：`check:cli-consumers`、`docs/guide/cli-invocation.md`（「The five command groups」）、README 的「five subcommand groups」與「Five command groups」改成六個、cli B-3。
7. skill PR：`sessions` 的 `SKILL.md` 加上經由 CLI 的 save／list／alias／resume；handover 的寫法不變。`SKILL.md` 本體已有 155 行，超過 150 行的軟上限，往 250 行的硬上限長（D-056 Cost accepted）。

**WP-E 發版**：

- 依 `releasing` skill 執行。
- 這次 vault ingest 放在版本 bump **之前**；`obsidian` CLI 需要 Obsidian app 在執行中。
- 發版後查核寫在 `docs/plans/v6.4/post-release-6.4.0.md`。
- 重新發布維護者的 eli5 頁面：主圖寫著「5 組指令」。

## 順序限制

1. 本 product PR 先合併。
2. WP-A 與 WP-C 可以緊接著合併。
3. WP-B 的引擎 PR 合併後，才合併 WP-B 的 skill PR。
4. WP-D 的設計關卡通過之前，不花任何 session。
5. 所有 `skills/`、`evals/scenarios/`、`evals/fixtures/` 的變更都在量測輪之前合併。
6. 量測輪重新產生 `evals/benchmarks/latest.json`。
7. 然後 WP-E。

## 量測額度與預先登記（D-055 第 5 點）

**量測條件**：`--model 'opus[1m]' --effort xhigh`、隔離、不帶 `--plugin-dir`、以 `--skill-file` 注入 skill，k 依各 scenario 的 `## Trials`。

**計數單位是 trial session**，上限約 40，綁住整輪的是這個數字。上限不含 model grader 的呼叫（D-055 Cost accepted）。

**三項量測**，A/B 依此順序開跑：

1. **`sessions` scenario，skill scope。** D-055 (i) 與 skill-system B-12 把 handover（B-10）與 present-then-stop（B-11）都列入本輪。設計者讀 baseline 會失敗的行為來設計；一支 scenario，不拆。preflight 3，PASS 後 A/B 10。
2. **`eval-router-skill-selection` V2 回歸。** 確認 6.3.0 的讀數（D-054）在 6.4.0 的樹上仍成立，不是新的主張。PR #268 改了這支 scenario 檔（只改文字），檔案的 hash 隨之改變，`eval ab` 會要求一筆新的 preflight 紀錄：紀錄以 scenario 檔全文的 SHA-256、model 與執行條件為鍵查找（`scripts/lib/eval-preflight.js:256-257`，由 `scripts/cli/eval-command.js:418` 呼叫），6.3.0 那筆 PASS 紀錄對不上新 hash。所以 preflight 3，PASS 後 A/B 10。
3. **verify-exit 句子（#267、obsidian B-10）。** 設計者先證明現行引擎能讓兩臂不同。D-049 的 Residual：skill-scope 的 A/B 只注入 `SKILL.md`，skill-local script 的輸出只能經由兩臂都看得到的 fixture 進入 trial；量測要等 wish `eval-skill-files-outside-trial`。證明不了就記為發現，花 0 個 session。證明得了：preflight 3，PASS 後 A/B 10。

| 項目 | preflight | A/B | 一次通過時的合計 |
|---|---|---|---|
| `sessions` | 3 | 10 | 13 |
| router V2 回歸 | 3 | 10 | 13 |
| verify-exit | 3 | 10 | 13 |

最壞情況 3 + 10（`sessions`）+ 3 + 10（router）+ 3 + 10（verify-exit，只在設計關卡通過時）= 39，這就是真正的最壞情況：下列規則不允許任何會超過 39 的路徑，上限約 40 仍然成立。保留的 1 個只用於重跑個別出錯的 trial（provider 拒絕或量測工具錯誤），不用於第二次 preflight，也不用於新增 scenario。

**規則**（由 v6.3 PLAN 的規則收窄）：

- preflight 一律 k=3。PASS 之後的 A/B 用該 scenario 自己的 `## Trials`，不統一改 k。
- preflight BLOCK 就記為發現，不跑 A/B，也沒有第二次 preflight。
- router 的 preflight BLOCK 代表 baseline 沒有 skill 文字也通過 V2 scenario，與 6.3.0 的 baseline 讀數（D-054：preflight 0/3、A/B 0/5）相矛盾：記為發現，不跑 A/B，帳本裡 6.3.0 的結果加註「在 6.4.0 的樹上未重現」。
- 會讓總數超過上限的 A/B 不開跑，記為未量測，絕不改用較小的 k。
- `sessions` 是一支 scenario，同時涵蓋 B-10 與 B-11，不拆成兩支。
- 每支 scenario 的新 Version 先離線寫好，交給獨立的審查者攻擊、修訂，通過 go/no-go 關卡之後才花 preflight 的 session。

**稽核義務**：

- preflight 紀錄與 A/B pool 照 D-054 的方式記下，以一筆 decision 記錄這一輪的結果，含未量測與記為發現的項目。
- 量測結束後執行 `arcforge eval report`，再確認 `git diff --stat <量測 commit>..HEAD -- skills evals/scenarios evals/fixtures` 是空的。
- 量測的 commit 記進帳本。

## 操作備忘

- worktree 用 `node scripts/cli.js worktree add` 建立。
- `npm install` 之後 `package-lock.json` 出現的差異不要 commit：追蹤中的檔案本來就過期，與本輪無關。
- Codex 重新審查需要在該則意見的 thread 裡回覆。
- 已停止的 agent 無法再聯絡，要另外派一個新的。
- worker 的 worktree 要保留到 Codex 重新審查完它的 PR。
- `evals/results/` 與 `evals/preflight/` 被 gitignore，只存在主 checkout，所以量測在主 checkout 跑。
