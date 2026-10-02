# arcforge roadmap：6.2.1 與 6.3.0

## Context

- main 停在 `f7fdefd9`。v6.1.1、v6.1.2、v6.2.0 都在 2026-10-01 出貨，`product/ROADMAP.md` 在 6.2.0 之後沒有下一版的列。
- 交接文件依觸發的閘門，把剩下的事項分成四組：A 不碰 eval-backed 路徑、B 動到 `skills/`、C 動到 `evals/scenarios/`、D 已依決策擱置。
- 2026-10-02 的分流：關閉 #183、#161（已由 #206、#219 實作）與 #179（D-044）；新開 #242、#243、#244；兩項觀察記為 backlog wish（`cli-human-output`、`eval-compare-skip-analyzer`）。
- 目標：先發一個不花 eval 額度的 patch，再用一輪量測補上五支 scenario 的 A/B 證據。

產品狀態的正本在 `product/`：兩個版本的列、D-048 到 D-052、spec 的 B-item、BACKLOG 的 graduation tombstone。本文件是排程與執行方式；兩者不一致時以 decision 為準。

## 已定案（維護者 2026-10-02 決定）

1. 分兩版：6.2.1（patch，0 個 live session）、6.3.0（minor，一輪量測）。
2. 6.2.1 不動 `skills/`、`evals/scenarios/`、`evals/fixtures/`（D-048）。
3. 6.3.0 重新設計並量測五支 baseline 在天花板的 scenario，上限約 80 個 trial session，規則在讀任何結果之前定好（D-049）。
4. `check:product` C3 拒絕指向「寫入時已整筆 superseded」的 `Refines:` / `Extends:`（D-050）。
5. learning config 新增 `enabled_at`，重疊的 opt-in 不再因停用一個 scope 而遺失（D-051）。
6. `releasing` skill 改寫成符合 squash-only ruleset：flip 在 release 分支上仍是獨立 commit，在 `main` 上與 release commit 併成一個（D-052）。
7. codex-9（`$` mention 的 namespace）依 owner 決定不量測。

## 執行規則（本輪適用）

- **Worker 模型**：只有主 session 用 Fable。每個 worker、`pm`、`qa` 派工時一律帶 `model: "opus"`。
- **停用 advisor**：每份 worker brief 都寫明不得呼叫 advisor 工具。
- **對外動作**：push、開 PR、squash merge、建立或關閉 issue 由主 session 執行。
- **合併條件**：CI 全綠、Codex 自動審查完成且每則意見都已修正或回覆、`qa` 審查無未處理的發現。三者缺一不合併。
- **打 tag**：6.2.1 與 6.3.0 的 tag 由主 session 推送，條件是 release PR 已合併、CI 全綠、發版前查核通過。這項授權在 2026-10-02 給出，只適用本輪。
- **live eval**：一律由主 session 啟動，不交給 subagent，且不超過上限。subagent 休眠時它在背景跑的 eval 行程會被回收（`evals/skill-eval-coverage.md` 有記錄）。
- **spec 與程式的順序**：Codex 審查回報「spec 在另一個 PR」是順序問題，先合併 spec 的 PR。程式 PR 改變了某個 B-item 的敘述時，spec 的句子放在同一個 PR。
- **天花板 BLOCK**：記為發現，不重跑到通過為止。
- **每個 commit 前**：`npm run lint:fix`、`npm test`（5 個 runner）、7 個 static check。

## 版本總覽

| 版本 | 層級 | 主題 | 工作包 | live session | 連結的 spec |
|---|---|---|---|---|---|
| 6.2.1 | patch | eval 儀器、loop 狀態與 observe hook、C3 liveness、發版流程 | WP-A 到 WP-D | 0 | eval、worktrees-loop、learning |
| 6.3.0 | minor | 五支 scenario 重新設計、skill-local script 修正、`enabled_at` | WP-E 到 WP-H | 上限約 80 個 trial session | skill-system、obsidian、sdd、learning、hooks |

**順序限制**

- 動到 `skills/`、`evals/scenarios/`、`evals/fixtures/` 的變更，在 v6.2.1 的 tag 之前不得合併進 main。
- WP-F 的 #210 修正要在 lint-script scenario 量測之前合併，前提是該 scenario 的 fixture 帶著那支 script。（讀檔補充：現行 Version 的 `## Setup` 從 `$PROJECT_ROOT` 複製 skill 的 `references/`，量到的是當下 commit 的 `lint_vault.py`，所以重新設計後若仍如此，#210 必須先合併。）
- scenario 的 PR 先審查、合併，才在它身上花 live session。

## 6.2.1（patch，不花 eval 額度）

順序：WP-A、WP-B、WP-C、WP-D 可平行 → 發版。

| 工作包 | 事項 | 內容 | spec |
|---|---|---|---|
| WP-A eval 引擎 | #212、#242 | dashboard 遇到只有 `infraError` / `gradeError` 的 pool 時顯示為儀器失敗，不再退回一般結果；同一天第二次 `eval report` 寫出新的副本而不覆寫，`eval history` 列出所有以日期開頭的副本 | eval B-13、B-9 |
| WP-B loop 狀態與 observe hook | #244、#243 | loop 的 run-state 檔改成原子替換；observe hook 的 lazy start 遇到死掉行程的 lock 時回收它 | worktrees-loop B-4、learning 資料模型 |
| WP-C `check:product` C3 | #163 | C3 回報寫入時目標已整筆 superseded 的 `Refines:` / `Extends:` | D-050、`product/AGENTS.md` |
| WP-D roadmap PR | — | 本 PR：兩個版本的列、D-048 到 D-052、本計畫，以及 `releasing` skill 的措辭（D-052） | — |

關鍵檔案（讀 issue 補充）：`scripts/lib/eval-dashboard/eval-dashboard.js`、`scripts/lib/eval-benchmark.js`、`scripts/cli/eval-command.js`、`scripts/lib/loop-state.js`、`hooks/observe/main.js`、`scripts/check-product.js`、`tests/scripts/check-product.test.js`。

D-048 的驗證：發版時從 `v6.2.0` 對 `skills/`、`evals/scenarios/`、`evals/fixtures/` 做 `git diff --stat` 是空的，freshness check 不需要新 snapshot 就 exit 0。

## 6.3.0（minor，一輪量測）

順序：v6.2.1 打 tag → WP-E 的 scenario PR、WP-F、WP-G → WP-H 量測 → 發版。

| 工作包 | 事項 | 內容 |
|---|---|---|
| WP-E scenario 重新設計 | 五支 scenario | `eval-executing-verify-decides-done`、`eval-router-skill-selection`、`eval-maintaining-obsidian-audit-runs-lint-script`、`eval-maintaining-obsidian-link-rebuilds-index`、`eval-speccing-supersede-not-overwrite`，各自 `## Version` 加一；lint-script 的重新設計拿掉 `## Preflight` 現有的 `skip`。流程見下方「重新設計的流程」 |
| WP-F skill-local script | #228、#210 | `diagramming-obsidian` 的四支 helper（`check_overlaps.py`、`plan_layout.py`、`render_excalidraw.py`、`verify_saved_diagram.py`）遇到錯誤輸入時印一行 `ERROR:` 並以非零結束，不再丟 traceback；`lint_vault` 的 code-span lookahead 遇到 fence 起始行就停 |
| WP-G `enabled_at` | #164 | 每個 scope 的 learning config 記下最近一次授權從何時開始；有效 opt-in 取任一 scope 連續授權到現在的那段時間從何時開始（D-051） |
| WP-H 量測與帳本 | — | 依下方預算與 A/B 順序跑完一輪、寫帳本，並以一筆 decision 記錄這一輪的結果，含未量測的 scenario；之後發版 |

spec：obsidian B-5、B-8；learning B-19；hooks B-6；sdd B-4；skill-system B-3、B-9。

關鍵檔案（讀 issue 補充）：`skills/core/diagramming-obsidian/references/*.py`、`skills/core/maintaining-obsidian/references/vault_frontmatter.py`、`scripts/lib/learning.js`、`hooks/session-tracker/inject-context.js`、`evals/scenarios/eval-*.md`。測試：`tests/skills/test_lint_vault.py`、`test_verify_saved_diagram.py`。

## 重新設計的流程（WP-E）

每支 scenario 的新 Version 都先離線寫好，再交給獨立的審查者攻擊、修訂，通過 go/no-go 關卡之後才花 preflight 的 session。離線審查若判定某支 scenario 不改引擎就無法區分兩臂，該支記為發現，一個 session 都不花（D-049）。

## eval 額度預算（6.3.0）

**量測條件**與 6.2.0 那一輪相同：`--model 'opus[1m]' --effort xhigh`、隔離、不帶 `--plugin-dir`、以 `--skill-file` 注入 skill、trial 上限 900 秒。

**計數單位是 trial session**，與前兩輪相同（D-021 的 107、D-047 的 55）。上限約 80 個 trial session，綁住整輪的是這個數字。

每支 scenario 的規則（讀結果之前定好，D-049）：

- preflight 一律 k=3（3 個 trial session）。
- PASS 之後的 A/B 用該 scenario 自己的 `## Trials`，不統一用 k=5。`eval-executing-verify-decides-done` 宣告 k=10，是檔案裡記載的檢定力下限（k=5 讀出 INCONCLUSIVE），A/B 是 20 個 trial session；其餘四支宣告 k=5，A/B 是 10 個。
- BLOCK 之後只能有一次事先寫下的重新設計，再跑第二次 preflight（多 3 個）；第二次仍 BLOCK 就記為發現，不跑 A/B，本輪不再跑這支。
- `eval-speccing-supersede-not-overwrite` 在 6.2.0 已用掉它的重新設計（D-047），這次的新 Version 是最後一版，BLOCK 即定案。

| scenario | `## Trials` | preflight | A/B | 一次通過時的合計 |
|---|---|---|---|---|
| `eval-maintaining-obsidian-link-rebuilds-index` | 5 | 3 | 10 | 13 |
| `eval-router-skill-selection` | 5 | 3 | 10 | 13 |
| `eval-executing-verify-decides-done` | 10 | 3 | 20 | 23 |
| `eval-speccing-supersede-not-overwrite` | 5 | 3 | 10 | 13 |
| `eval-maintaining-obsidian-audit-runs-lint-script` | 5 | 3 | 10 | 13 |

五支都一次通過就是 75；每多一次第二次 preflight 加 3。這輪的預算付不起每一種結果，所以 A/B 依上表的順序開跑：link-rebuilds-index（D-028 的 LINK 模式重建完全沒有 harness 證據）、router-skill-selection、executing-verify-decides-done、supersede-not-overwrite、audit-runs-lint-script。會讓總數超過上限的 A/B 不開跑，記為未量測，絕不改用較小的 k。

**上限不含 grader 呼叫。** 含 model 評分 assertion 的 scenario，每個被評分的 trial 另外會呼叫一次 grader（`scripts/lib/eval-graders.js` 約第 165 行），preflight 也算。main 上是 `eval-router-skill-selection` 與 `eval-maintaining-obsidian-audit-runs-lint-script`（`## Grader` 是 `mixed`）；其餘三支用程式評分。重新設計若改成程式評分，這筆成本就消失。

量測結束後執行 `arcforge eval report`，再確認 `git diff --stat <量測 commit>..HEAD -- skills evals/scenarios evals/fixtures` 是空的。

## 兩版都不做的事項（留在 backlog）

`skill-body-trim`、`diagramming-headless-fallback`、#184、#185、`speccing-spec-in-sync-eval`、`speccing-router-adjacency-eval`、`plugin-eval-corpus-migration`、`eval-trial-sandbox`、Codex 邊界的各項 wish（D-039）、`secrets-guard-staged-scan`、`session-continuity-injection`、`bound-transcript-parse`、`product-cli`、`project-keyspace-collision`。

`scripts/lib/learning-dashboard.js` 已有 697 行（上限 700）。任何會讓它變長的修改都要先拆檔；本計畫沒有任何一項動到它。

## 操作備忘

這些事之前沒有寫在 repo 任何地方。

- worker 的 worktree 要保留到 Codex 重新審查完它的 PR。
- 正式量測之前先跑一次 preflight，讀過 transcript 再開跑。#213 花了 34 個 session。
- `git worktree add` 之後第一次跑 jest，可能會出現一次「No tests found」。
- `evals/results/` 與 `evals/preflight/` 被 gitignore，只存在主 checkout，所以量測在主 checkout 跑。
- 維護者用的 marketplace 以本機目錄為來源，元件直接從原始碼目錄解析；arcforge 在 user-global 設定中是停用的。要測安裝版，在暫存目錄以 local scope 啟用它。
- 維護者機器上 `rm` 是 `rm -i` 的 alias。

## 驗證

- **每個工作包**：新增的測試先失敗、修正後轉綠；`npm test` 5 個 runner 全過；7 個 static check 全過；`npm run lint` 無錯誤。
- **product 狀態**：每次改 `product/` 後執行 `npm run check:product`。
- **6.2.1 發版前**：`git diff --stat v6.2.0..HEAD -- skills evals/scenarios evals/fixtures` 是空的；`node scripts/check-benchmark-freshness.js` 不需新 snapshot 就 exit 0（D-048）。
- **C3（WP-C）**：`tests/scripts/check-product.test.js` 原本把「refine 已 superseded 的 entry」當正例，改成反例；另以正例鎖住 refiner 比 kill 早、部分 superseded、`Proposed` 目標，以及收進 `<details>` 的 entry（D-050）。
- **6.3.0 量測前**：五支 scenario 的 PR 與 WP-F 都已合併；量測的 commit 記進帳本。
- **6.3.0 發版前**：量測 commit 之後 `skills/`、`evals/scenarios/`、`evals/fixtures/` 沒有新的差異；trial session 總數不超過 80；未量測與兩次 BLOCK 的 scenario 都記進帳本。

## 風險

1. **某支 scenario 兩次 BLOCK（supersede 一次就算）。** 依規則記為發現，該 skill 維持原有的證據，與 D-045 記錄的結果相同。不得為了湊出 A/B 再加一次重新設計。
2. **量測快照之後又有人改了 `skills/`。** freshness gate 只比時間戳，抓不到；靠發版前的 diff 檢查。
3. **預算付不起每一種結果。** 75 加上每次第二次 preflight 的 3，隨時可能碰到 80；順序排在後面的 A/B 可能因此未量測，trial 被判 `infraError` 時也沒有額度可補。超出上限前先停下來回報，不自行加跑。
4. **grader 呼叫不在上限內。** 兩支 `mixed` scenario 的實際花費會比 trial session 數多；重新設計時可考慮改成程式評分。
5. **#210 晚於 lint-script 的量測合併。** 量到的會是修正前的 script，結果作廢。
6. **6.2.1 的某項修正其實需要改 skill。** 依 D-048 的 Cost accepted，該項移到 6.3.0。
