# arcforge roadmap：120 項未完成事項，分 3 版出貨

## Context

- v6.1.0 在 2026-09-07 發版。main（`10974a2c`）上有三個已合併但未發版的修正：#181、#182、#188。
- `product/ROADMAP.md` 在 main 上沒有下一版的列。
- 2026-09-29 的 recap 查證出 120 項未完成事項（28 項 medium 以上、92 項 low）。
- 原本只想把三個 commit 發成 6.1.1，卡在 benchmark 閘門：`evals/benchmarks/latest.json` 比 `v6.1.0` tag 舊，而 #182 動了 `skills/`。
- 目標：一次把 120 項全部排進版本，分 3 版出貨，eval 額度花得越少越好。

事項編號採 `<領域>-<n>`。每一項的標題、說明、證據與排定的版本都在 [`recap-2026-09-29.json`](recap-2026-09-29.json)，以 `id` 欄位對照。

## 已定案（使用者決定）

1. 一次規劃，分 3 版出貨：6.1.1、6.1.2、6.2.0。
2. eval 儀器修正併入 6.1.1。順序：先修儀器，再量測，再發版。
3. #179 先記為 `Status: Proposed`；重新量測後才決定。
4. 120 項全部排進版本，每一項都有去向。
5. 6.1.1 的 benchmark 只重跑受影響的 scenario。
6. 評估 `claude plugin eval` 能不能派上用場（結論見下方專節）。

## 執行規則（每一版都適用）

- **Worker 模型**：只有主 session 用 Fable。`pm`、`qa` 的 frontmatter 是 `model: inherit`，派工時一律帶 `model: "opus"`；機械性查核用 `"sonnet"`。
- **停用 advisor**：每個 worker prompt 都寫明不得呼叫 advisor 工具（背後是 Fable）。派工後檢查 transcript 的 `model` 欄位。
- **不代跑 eval**：任何 live trial 都由使用者啟動。計畫只列要跑哪些、幾個 session。
- **對外動作**：push、開 PR、合併、建立或關閉 issue 由主 session 自行執行並回報，使用者已授權。打 tag 與啟動 eval 量測之前先回報：前者送達所有使用者，後者花額度。
- **合併條件**：CI 全綠、Codex 自動審查完成且意見已處理、`qa` 審查無未處理的發現。三者缺一不合併。
- **每個 commit 前**：`npm run lint:fix`、`npm test`（5 個 runner）、6 個 static check。
- **spec 先行**：各工作包先寫 B-item。要實作的行為先進 spec，再寫測試；spec 已經承諾的行為不用重寫。
- **測試先行**：每個引擎修正先寫會失敗的測試，再修，文件改動放同一個 commit。
- **`Proposed` 決策**：每一版開工時，一次把該版的 `Proposed` 決策列給使用者確認；定案前不寫對應的程式。

## 版本總覽

| 版本 | 層級 | 主題 | 事項數 | eval session | 連結的 spec |
|---|---|---|---|---|---|
| 6.1.1 | patch | 修好 eval 儀器、learning 止血、如實的隱私與安全敘述、三個已合併 commit | 42 | 約 80 | eval、learning、hooks、skill-system、obsidian、sdd、worktrees-loop |
| 6.1.2 | patch | 文件與引擎對齊、CLI 訊息、contributor 工具、repo 整理 | 48 | 0 | cli、hooks、learning、worktrees-loop、obsidian、codex-harness |
| 6.2.0 | minor | learning 生命週期補完、需要搬動磁碟資料的修改、eval 語料修正 | 30 | 約 50 到 70 | learning、cli、worktrees-loop、codex-harness、eval、sdd |

**eval 額度合計：兩輪約 130 到 150 個 session。使用者目前只核可了 6.1.1 的約 78 個；6.2.0 那一輪在該版開工時另行確認。**

**spec header 會長這樣，這是刻意的**：三個版本的列一次寫進 `product/ROADMAP.md`。依 `product/AGENTS.md` 的規則，spec header 以連結該 spec 的最高版本列為準。所以 learning、cli 等 spec 從第一天起就會顯示 `… · extended by 6.2.0 (next)`，6.1.1 發版時只會更新前半段的 `shipped vX.Y.Z`。這是為了讓完整 roadmap 看得見，不要當成錯誤去修。

**硬性規則：6.1.2 不得動到 `skills/`、`evals/scenarios/`、`evals/fixtures/`。** 這三個路徑有變動才會觸發 benchmark 閘門（`scripts/check-benchmark-freshness.js`）。

**與兩份方案的差異**：兩個 Plan agent 都主張只重跑 1 次 benchmark。本計畫是 2 次。原因：使用者選了 6.1.1 只跑約 78 個 session，這個預算放不下 scenario 評分規則的修正（每改一支就要重跑那一支）。所以這批修正移到 6.2.0，連同 #179 定案後可能需要的 skill 文字修改一起量。總 session 數相同，只是分兩次花。

## 6.1.1（42 項）

順序：WP0 → WP-A、WP-B、WP-C 平行 → WP-D → WP-E → WP-F → WP-G → 發版 → 安裝後查核。

### WP0 開工前（不花 eval 額度）

| 事項 | 處置 | 做什麼 |
|---|---|---|
| hooks-7 | 量測 | 使用者在 repo 外的空資料夾從 marketplace 安裝 6.1.0，開一個 session 確認 hook 有觸發。失敗的話，6.1.1 先修這個 |
| release-7 | 決策 | 三個版本的列、D-018 的範圍、spec header、BACKLOG 都已寫入（roadmap 的 PR） |
| release-3 | 修設定 | `.github/workflows/claude-code-review.yml` 只在 PR 開啟與 ready 時跑，加路徑限制。6.1.1 會開 6 個以上的 PR，不先收窄的話每次 push 都會跑完整 review |

### WP-A eval 儀器（量測前必須合併）

關鍵檔案：`scripts/lib/eval-trial-env.js`、`eval-trial-outcome.js`、`eval-grader-model.js`、`eval-grader-io.js`、`eval.js`、`eval-stats.js`、`eval-benchmark.js`、`eval-dashboard/eval-dashboard.js`、`scripts/cli/eval-command.js`。測試放 `tests/scripts/`（jest）。

| 事項 | 處置 | 做什麼 |
|---|---|---|
| eval-1 | 修引擎 | #170：`buildIsolationSettings` 固定 `outputStyle`、停用 user hooks |
| eval-2 | 修引擎 | provider 拒絕回應判為 `infraError`，不進計分池 |
| eval-4 | 修引擎 | grader、analyzer、comparator 的 prompt 改用 `__dirname` 解析（照 `scripts/lib/loop-verifier.js:38` 的做法）；讀到空內容就丟錯 |
| eval-6 | 修引擎 | `eval run`、`list`、`report`、dashboard 都經過 `scorableResults` |
| eval-5 | 修引擎 | `eval ab --plugin-dir` 不再注入 skill 本文 |
| eval-7 | 修引擎 | dashboard 的 A/B 比較遵守 `## Verdict Policy non-regression` |
| eval-8 | 修引擎 | `infraError` 的 row 帶上 version |
| eval-10 | 修引擎 | plugin-dir trial 也加隔離提示；trial 後檢查 repo 有沒有被寫入。「不是 sandbox」維持 Residual |
| eval-12 | 修引擎 | #183：result row 記錄逾時上限；壞值在 Setup 之前就拒絕 |
| eval-17 | 修文件 | `docs/guide/eval-system.md` 對齊引擎，含上面所有改動 |

### WP-B learning 止血（不花 eval 額度，可與 WP-A 平行）

關鍵檔案：`scripts/lib/confidence.js`、`hooks/session-tracker/start.js`、`scripts/lib/learning-curator/observer-daemon.sh`、`scripts/lib/learning.js`、`scripts/lib/learning-dashboard.html`、`learning-dashboard.js`、`product/specs/learning.md`、`docs/guide/learning-dashboard.md`。

| 事項 | 處置 | 做什麼 | 測試 |
|---|---|---|---|
| learning-1 | 修引擎 | 衰減改成可重複執行而結果不變；已啟用的 instinct 不自動封存；每次封存寫 audit，並在封存檔標記原因（B-10） | `tests/scripts/`：呼叫 5 次等於呼叫 1 次；已啟用的不會被移進 `archived/`；封存檔帶有原因欄位 |
| learning-2 | 修引擎加修文件 | curator 加上不給工具的限制；spec B-9 與 guide 寫明 curator 是第二條對外路徑 | `tests/observer-daemon/`：argv 含工具限制 |
| learning-3 | 修引擎 | `checkDaemon` 先檢查 opt-in；未啟用的 project 不分析 | `hooks/__tests__/`：learning 關閉時不啟動 daemon |
| learning-4 | 修引擎 | #173：dashboard 確認後送出 `safety_ack` | dashboard ack 測試 |
| learning-5 | 修引擎 | `setLearningEnabled` 改成合併既有 config | `tests/scripts/`：enable 後其他 key 還在 |

已被重複扣分的 instinct 在 6.1.1 不會自動復原（復原指令在 6.2.0）。CHANGELOG 要寫明手動搬回的方法。

### WP-C 如實的安全敘述（文件）

| 事項 | 處置 | 做什麼 |
|---|---|---|
| hooks-2 | 修文件 | spec B-4、README、guide 改成「掃指令字串」。掃 staged 內容另記成 backlog wish |
| hooks-6 | 整理 | `hooks/secrets-guard/main.js` 檔頭註解 |

### WP-D 動到 `skills/` 的修改（全部在量測之前）

| 事項 | 處置 | 做什麼 |
|---|---|---|
| obsidian-1 | 決策加修文件 | `index.md` 重建定義成 LINK 模式的寫入步驟，寫進 `references/audit.md` |
| obsidian-2 | 修引擎 | #186：fence walker 支援 list-item 容器 |
| obsidian-3 | 修引擎 | #187：frontmatter 解析支援引號內的跳脫 |
| obsidian-4 | 修引擎 | `render_excalidraw.py` 的安裝提示路徑 |
| obsidian-5 | 修文件 | `audit.md` 拿掉不存在的 `--backfill-sha256` |
| obsidian-6 | 修文件 | `verify_saved_diagram.py` 的說明與 spec B-8 如實描述檢查範圍 |

測試：`tests/skills/test_lint_vault.py` 新增 #186、#187 的案例。

### WP-E #179

| 事項 | 處置 | 做什麼 |
|---|---|---|
| sdd-1 | 量測加決策 | README 與 `docs/guide/skills-reference.md` 先揭露現況；用 `claude plugin eval` 量 `speccing` 在真實 plugin 路由下的觸發率；結果出來後使用者定案 |

### WP-F 量測與帳本

| 事項 | 處置 | 做什麼 |
|---|---|---|
| eval-23 | 量測 | 重跑受影響的 scenario（清單見「eval 額度預算」） |
| eval-11 | 量測 | diagramming 用 1800 秒上限跑，上限值記進結果 |
| eval-15 | 量測 | lint-script scenario 進 snapshot |
| eval-22 | 量測 | router A/B，同時是 #170 修正的驗收 |
| skill-system-3 | 記為 Residual | 由 router 那一輪涵蓋；description 不動 |
| eval-3 | 決策 | 帳本如實記 REGRESSED；及格條件由使用者定 |
| eval-24 | 決策 | floor 斷言是否計入 pass bar，讀結果之前定案 |
| eval-14、16、20、21 | 記為 Residual | 帳本註明：這些結果在儀器修正前量的，本輪沒重跑 |
| eval-18 | 記為 Residual | #184、#185：現有 scenario 量不到，記進帳本 |

### WP-G 發版與安裝後查核

| 事項 | 處置 | 做什麼 |
|---|---|---|
| hooks-5 | 修引擎 | #176：測試的 stub 改成寫完才可讀，保護 pre-flight |
| release-4 | 量測 | 從安裝版跑 learning、obsidian ingest、looping 各一次 |
| hooks-8 | 量測 | 在 6.1.1 安裝版確認 unknown keys 警告消失 |

## 6.1.2（48 項，不花 eval 額度）

順序：WP-H → WP-I 到 WP-M 任意順序 → WP-N 最後（檢查工具要對前面各包改過的文件都回報無誤）。

| 工作包 | 事項 | 內容 |
|---|---|---|
| WP-H CLI 契約 | cli-1 到 cli-9 | `arc` 改成 `arcforge`；eval 執行期錯誤在 `--json` 下輸出 `{error}`；`--help` 印 `arcforge`；環境變數表補齊；`--effort` 進 guide；manifest 宣告 `eval report --json`；help 與 manifest 的對照測試；旗標檢查涵蓋 `learn-workflow-command.js`。cli-6 記為 Residual |
| WP-I hooks | hooks-1、3、4 | 拿掉「承接上個 session」的承諾（建引擎另記 wish）；`start.js`、`end.js` 加頂層 try/catch；compact-suggester 的說明對齊程式 |
| WP-J learning 小修 | learning-6、7、8、10、16 | #177 探測改成找標記；#172 補 spec B-7 的成本列舉；#159 檢查 `appendCandidate` 結果；enricher 的 cwd 改成 draft 目錄；#167 加測試後關閉 |
| WP-K loop | worktrees-loop-2、3、4、5 | 終止狀態不被覆寫；resume 重設 status；提示改指 `looping`；B-6 在沒有 floor 時的行為寫明並加啟動警告 |
| WP-L obsidian | obsidian-7、8、9、10 | 四支 Python helper 加契約測試；spec B-4 改成有條件；其餘記為 Residual 或 backlog wish |
| WP-M codex | codex-1、5、6、7、9 | spec 與 README 文字修正；fifteen 與 sixteen 的出入用 `codex debug prompt-input` 確認；`$` mention 實測一次 |
| WP-N 工具與整理 | skill-system-1、2、4；sdd-2、3、4、8、9；release-1、2、5、6、8 到 13 | 測試註解節號；skill-system-2 只記為 Residual，不拆 `references/`（會動到 `skills/`）；bucket 清單收斂到 `tests/scripts/skill-tree.js`；`check:product` 的 C3 與章節檢查；doc-refs R2 加驗子命令；`package.json` 的 `files` 收窄；兩支 Claude workflow 的成本寫進 contributor 文件；刪除 v5 殘留檔與兩個已關閉的 remote 分支；官網加 Codex 安裝區塊；#174 行數上限檢查 |

關鍵檔案：`scripts/cli/*.js`、`scripts/lib/cli-manifest.js`、`scripts/lib/doc-refs.js`、`scripts/check-product.js`、`scripts/lib/loop-state.js`、`scripts/lib/loop-session.js`、`scripts/lib/diary-capture.js`。

## 6.2.0（30 項）

順序：該版的 `Proposed` 決策先定案 → WP-O → WP-P → WP-Q、WP-R → WP-S → 量測。

| 工作包 | 事項 | 內容 |
|---|---|---|
| WP-O learning 生命週期 | learning-9、11、12、13、14、15、17、18、19、20、21、22、23、24、25 | #178 狀態讀取進 lock；Layer-5 新增出口（approved 可 dismiss、materialized 可重新 materialize）；不合規的 name 在 ingestion 拒絕；新指令 `learn instinct deactivate` 與 `learn instinct restore`；rejections 輪替不刪除；dashboard 顯示退件；#169 只計已 enrich 的 diary。keyspace 維持 basename 並記為 Residual |
| WP-P worktree | worktrees-loop-1 | 路徑改由 `git rev-parse --show-toplevel` 推導，舊路徑仍找得到 |
| WP-Q codex 決策 | codex-2、3、4、8、10、11、12 | 本輪維持 D-013 的邊界，逐項記為 Residual 或留在 backlog |
| WP-R product method | sdd-6、sdd-7、eval-25 | 記為 Residual，wish 留在 backlog |
| WP-S eval 語料 | eval-9、eval-13、eval-19、sdd-5 | #166 與四個 rubric 洞的修正（各自 `## Version` 加一）；supersede 的 preflight 在新版 grader 上跑；新增「不主動 bootstrap」scenario |

關鍵檔案：`scripts/lib/learning-curator/lifecycle.js`、`queue-writer.js`、`activate.js`、`schema.js`、`scripts/cli/learn-*.js`、`scripts/lib/worktree-generic.js`、`worktree-paths.js`、`evals/scenarios/eval-speccing-*.md`。

**層級說明**：新增 CLI 指令所以是 minor。如果 keyspace 的決策改成搬動既有資料，就變成 major，要另開版本。

## eval 額度預算

### 6.1.1：約 95 個 session

| 執行 | 方式 | session |
|---|---|---|
| router-skill-selection | `arcforge eval ab`，k=5 | 10 |
| diagramming-obsidian-unverified-save-claim | `arcforge eval ab`，k=5，上限 1800 秒 | 10 |
| executing-verify-decides-done | `arcforge eval ab`，k=5 | 10 |
| finishing-verify-before-options | `arcforge eval ab`，k=5 | 10 |
| maintaining-obsidian-vault-only-answer | `arcforge eval ab`，k=5 | 10 |
| maintaining-obsidian-audit-runs-lint-script | `arcforge eval ab`，k=5 | 10 |
| maintaining-obsidian-link-rebuilds-index（新 scenario，D-028） | 先跑 k=3 的 preflight，再 `arcforge eval ab`，k=5 | 13 |
| #179 觸發率 | `claude plugin eval`，只跑載入 plugin 的那一臂，10 次 | 10 |
| `claude plugin eval` 隔離查核 | 1 個 case，2 次 | 2 |
| 備用 | 補被判為 `infraError` 的 trial | 10 |

- 依據：現有 snapshot 每個 treatment trial 平均 219 秒。80 個 session 依序跑約 5 小時。
- tdd 與 dispatching 不重跑：#182 只改了它們的 `references/`。已查過程式：A/B 僅載入單一 skill 檔案（`scripts/cli/eval-command.js:337-353`），不會帶入 `references/`。
- 量測結束後執行 `arcforge eval report`，再確認 `git diff --stat <量測 commit>..HEAD -- skills evals/scenarios evals/fixtures` 是空的。閘門只比時間戳，抓不到量測之後才進來的修改。

### 6.2.0：約 50 到 70 個 session

spec-before-code 新版 A/B（k=10，20 個）、supersede 的 preflight 加 A/B（13 個）、新 scenario 的 preflight 加 A/B（13 個）、備用。#179 或手動 instinct 的決策如果改了 skill 文字，對應的 scenario 要加進來。確切清單在 6.2.0 開工時定。

## `claude plugin eval` 的定位

**結論：拿來量 #179，不拿來取代發版用的 benchmark。**

| 問題 | 是否解決 | 依據 |
|---|---|---|
| skill 在真實路由下有沒有觸發 | 可以。`tool_used` grader 配 `input_match` 可斷言特定 skill | `--help` 與研究 agent 的參考資料 |
| 操作者的 `outputStyle`、user hooks 漏進 trial | 也許可以。每次 run 用全新的 `HOME` 與 `CLAUDE_CONFIG_DIR` | 推論，沒有實測；所以預算裡排了 2 個 session 先查 |
| 額度用完被當成結果計分 | 只解一部分。開跑前憑證失效會中止；跑到一半被拒沒有寫明 | 參考資料 |
| 信賴區間、發版閘門用的 snapshot | 不行 | 沒有記載 |

使用時的固定做法：

- 用 `--eval-dir` 指到 `evals/` 以外的目錄（例如 `plugin-evals/`）。arcforge 的 `evals/` 已被自己的 harness 佔用。不改 manifest 的 `experimental.evals`，避免動到出貨的 `plugin.json`。
- 每次都帶 `--no-publish`（否則報告會上傳到 claude.ai）、`--model`（不帶的話預設模型沒有記載）、`--max-cost-usd`。
- 每個 case 自己設 `timeout_seconds` 與 `max_turns`。預設是 300 秒、10 個 turn。

限制：功能掛在 `experimental` 之下，沒有公開文件頁。要不要把更多 scenario 搬過去，記成 backlog wish，本輪不做。

## 要記錄的決策

編號由 `pm` 在寫入時依序指派；下表的順序就是寫入順序。

| 決策 | 狀態 | 建議預設 | 版本 |
|---|---|---|---|
| D-018（改寫）：6.1.1 的範圍與為什麼現在做 | Accepted | — | 6.1.1 |
| 6.1.2 為什麼獨立一版 | Accepted | — | 6.1.2 |
| 6.2.0 為什麼獨立一版 | Accepted | — | 6.2.0 |
| 6.1.1 的 benchmark 只重跑受影響的 scenario | Accepted | Residual：其餘結果在舊儀器上量 | 6.1.1 |
| 衰減可重複執行；已啟用的 instinct 不自動封存 | Accepted | 依 learning B-4 | 6.1.1 |
| curator 是第二條對外路徑 | Proposed | 不給工具、受 opt-in 控制、spec 寫明 | 6.1.1 |
| #179 的方向 | Proposed | 重新量測；觸發率仍低就改成文件寫明手動呼叫 | 6.1.1 |
| `claude plugin eval` 作為路由量測工具 | Proposed | 只用於觸發率，不進發版閘門 | 6.1.1 |
| answering-feedback 及格條件 | Proposed | 成本旗標僅供參考 | 6.1.1 |
| floor 斷言是否計入 pass bar | Proposed | 維持引擎現行的計算方式並寫進文件 | 6.1.1 |
| obsidian `index.md` 重建放在哪個模式 | Proposed | LINK 模式，列為寫入步驟 | 6.1.1 |
| secrets-guard 掃描範圍 | Proposed | 修文件；掃 staged 內容記成 wish | 6.1.1 |
| CI review workflow 的觸發範圍 | Proposed | 只在 PR 開啟與 ready 時跑，加路徑限制 | 6.1.1 |
| hooks B-8 的 session 承接 | Proposed | 修文件 | 6.1.2 |
| loop B-6 沒有 floor 時 | Proposed | 修文件加啟動警告 | 6.1.2 |
| refine D-006（clause 編號、C3、章節檢查） | Proposed | CommonMark 邊界維持 Residual | 6.1.2 |
| obsidian B-4 改成有條件 | Proposed | spec 跟著 skill | 6.1.2 |
| D-012 Residual：候選 name | Proposed | 在 ingestion 拒絕 | 6.2.0 |
| Layer-5 矩陣的出口 | Proposed | approved 可 dismiss、materialized 可重新 materialize | 6.2.0 |
| learning keyspace | Proposed | 維持 basename，記為 Residual | 6.2.0 |
| 手動 instinct 能否啟用 | Proposed | 不行，並在文件寫明 | 6.2.0 |
| D-013 Codex 邊界 | Proposed | 本輪不變 | 6.2.0 |
| 復原遭衰減封存的 instinct | Accepted | 新指令 `learn instinct restore` | 6.2.0 |
| rejections 保留方式 | Proposed | 輪替到 archive，不刪除 | 6.2.0 |
| reflection 只計已 enrich 的 diary | Proposed | 採用 | 6.2.0 |
| grader 不執行 trial 產出（#156 A5） | Proposed | 改成靜態檢查 | 6.2.0 |

## 沒有歸屬的事項

下列事項目前沒有 issue 也沒有 backlog 條目，要先建立歸屬。

- **新 GitHub issue**：learning-1、2、3；eval-2、4、5、6、7、8、10；hooks-1、2、3、4；cli-1、2、3；worktrees-loop-1 到 4；obsidian-1、4、5。
- **新 backlog wish**：secrets-guard 掃 staged 內容、session 承接注入、diagramming headless fallback、eval trial sandbox、`claude plugin eval` 語料搬遷。
- **graduation tombstone**：每個被排進版本的既有 wish，在 `product/BACKLOG.md` 留一行劃掉的紀錄。對照如下，其餘 wish 留在原處。
  - 6.1.1：`dashboard-activation-ack`、`learn-enable-erases-config`、`eval-void-trial-detection`
  - 6.1.2：`website-install-symmetry`、`stale-probe-window-vs-rendered-paths`、`check-product-spec-sections`
  - 6.2.0：`dashboard-rejections`、`stale-draft-floor-overlapping-opt-in`、`cli-draft-path-redaction`、`strand-free-candidate-names`、`speccing-a5-floor-executes-nothing`、`supersede-v7-preflight`

## 核可後的執行順序

第 1 到 3 步已完成，結果在 PR #190、#191、#203 與 issue #192 到 #202。

1. （已完成）recap 清單與事項編號對照存進 `docs/plans/v6.1/`。`docs/plans` 不在 `check:docs` 的掃描範圍內，清單裡引用的舊指令名不會觸發檢查。
2. （已完成）`pm`（opus）修改 `product/`：三個版本的列、決策、spec header、BACKLOG。`pm` 沒有 Bash，`npm run check:product` 與 git 操作由主 session 執行；之後每次派 `pm` 都是同樣的分工。
3. （已完成）收窄 CI review workflow、開 roadmap 的 PR、為 medium 以上且沒有歸屬的 11 項建立 issue。
4. 使用者做 WP0 的 marketplace 安裝查核。
5. 列出 6.1.1 的 `Proposed` 決策請使用者確認。
6. WP-A、WP-B、WP-C 各開一個分支，各派一個 opus worker 在獨立 worktree 實作，`qa`（opus）逐一審查。
7. WP-D、WP-E、WP-F、WP-G 依序進行；量測由使用者啟動。
8. 依 `.claude/skills/releasing/SKILL.md` 發 6.1.1。
9. 6.1.2、6.2.0 開工時各自重複第 5 到 8 步。

## 驗證

- **每個工作包**：新增的測試先失敗、修正後轉綠；`npm test` 5 個 runner 全過；6 個 static check 全過；`npm run lint` 無錯誤。
- **product 狀態**：每次改 `product/` 後執行 `npm run check:product`。
- **eval 儀器（WP-A）**：在 repo 外的目錄執行 model grader，確認 prompt 非空；用一個拒絕回應的 fixture 確認被判為 `infraError`；router A/B 的兩臂不再出現操作者的 `outputStyle`。
- **learning（WP-B）**：在暫存的 home 目錄連續觸發 5 次 SessionStart，instinct 的信心值只扣一次；learning 關閉時沒有 daemon 行程。
- **發版前**：`node scripts/check-benchmark-freshness.js` 回報 exit 0；量測之後 `skills/`、`evals/scenarios/`、`evals/fixtures/` 沒有新的差異。
- **發版後**：從 marketplace 安裝新版，確認 hook 觸發、unknown keys 警告消失、learning 與 obsidian 與 looping 各跑通一次。
- **Worker 模型**：每次派工後掃 transcript，確認沒有 Fable 的 assistant turn、沒有 advisor 呼叫。

## 風險

1. **額度不夠，量測卡住，learning 的修正跟著延後。** 備案：從 `v6.1.0` tag 開分支，只帶 WP-B 發成 6.1.1。那個分支沒動到 `skills/`，不用跑 benchmark；其餘版本的編號往後順延。
2. **WP0 發現安裝版不載入 hook。** 這會變成 6.1.1 的第一個修正，優先於其他所有工作。
3. **量測之後又有人改了 `skills/`。** 閘門抓不到，要靠發版前的 diff 檢查。
4. **`claude plugin eval` 的隔離行為與預期不同。** 先用 2 個 session 查核；不符的話 #179 改回用修好的 `arcforge eval`。
5. **6.1.1 有 42 項。** 其中 13 項是帳本記錄或量測，不是程式修改；程式修改依工作包拆成獨立 PR。
6. **`Proposed` 決策有 21 筆。** 依版本分三批問，每批先問會擋住最多工作的那幾筆。
