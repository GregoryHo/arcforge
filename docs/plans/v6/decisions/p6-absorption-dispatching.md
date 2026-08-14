# P6 Track B 吸收對照表 — dispatching 三支合一

> `arc-dispatching-parallel` + `arc-dispatching-teammates` + `arc-using-worktrees`
> → `skills/dispatching/`
>
> 逐行記錄舊 skill 的**每一個行為面**落到哪裡。「已合併」不是答案——每一列必須指到
> 新 skill 的某一節、某個 reference、某個 CLI 子命令，或寫明**刻意捨棄＋理由**。
>
> 落點欄縮寫：**S**=`skills/dispatching/SKILL.md`｜**Rc**=`references/dispatch-card.md`｜
> **Ra**=`references/acceptance.md`｜**C**=CLI｜**G**=`docs/guide/`｜**✂**=刻意捨棄

## 0. 合併前提：三支共同的死詞彙

三支舊 skill 的骨架建立在 P2 已刪除的 SDD 管線上。以下**整類**捨棄，下面各節不再逐條重複：

| 死詞彙 | 為何是死的 |
|---|---|
| `specs/<spec-id>/dag.yaml`、epic id、epic 依賴、ready epics | SDD pipeline + DAG/coordinator 引擎於 P2 移除 |
| `.arcforge-epic` marker、epic 展開、epic 生命週期 | 同上（引擎仍會拒絕帶 marker 的樹，但那是引擎不變式，不是 agent 要背的流程） |
| `arcforge:spec-reviewer` / `arcforge:verifier` subagent_type | `agents/` 於 P2 移除 |
| `parallel --features` / `cli.js parallel` | CLI 無此命令（cli-manifest 可證） |
| `/arc-agent-driven`（spawn prompt 內） | Track A 於本 phase 刪除；寫進非 legacy skill 會使 §5.1 cross-ref 懸空 |
| `cleanupWorktrees()`、`getStats()` 等引擎函式名 | D1：skill prose 不得指名引擎內部 |
| Cross-Platform Dispatch 節 | v6 只做 Claude Code（單一平台裁決） |

合併後的替代詞彙：epic/feature → **piece of work**；dag 依賴 → **file list 不相交**；
spec 合規 → **acceptance criteria**；spec-reviewer/verifier → **兩個 fresh-context 檢查**。

## 1. arc-dispatching-parallel（107 行）

| 行為面 | 落點 | 說明 |
|---|---|---|
| 「任務獨立才平行」三條判準（無共享依賴／無共享檔／各自可獨立理解） | **S** Step 1 | 原樣保留，升級為完成判準：每個 piece 要寫出 file list，兩張 list 不得有交集 |
| Don't use when：任務相關、需要完整系統狀態、agent 會改到同一批檔 | **S** Step 1 + Step 2 | 「會改到同一批檔」改由 Step 2 的隔離前提承接（不是不派工，是各給一棵 worktree） |
| Focused prompt 五要素（scope／goal／constraints／expected output／named model） | **S** Step 3 表 | 擴為六槽，每槽寫「沒有它會壞在哪」。`named model` **✂**——model tier ladder 的來源 `arc-agent-driven` 本 phase 被刪，且模型選擇不是本 skill 的行為面 |
| prompt 模板 code block | **Rc** §Template | 從四行擴為完整派工卡；舊模板缺 acceptance criteria 與 authority 兩槽 |
| 「一個 batch 全部送出才會真的並行」 | **S** Step 3 末句 | |
| Review and Integrate 四步 | **S** Step 4 + Step 5 | 拆成兩步：驗收（Step 4）與合併（Step 5）是不同的失敗模式 |
| 「衝突表示任務其實不獨立，回頭修分組」 | **S** Step 5 | |
| 「用 fresh-context subagent 跑測試，不採信實作者自報」 | **S** Step 4（本節主句） | 這是三支裡最該活下來的一句，升格為 Step 4 的標題 |
| Independent Failures 節 | **✂** | 與 Step 1「任務獨立才平行」同義；schema §Pruning 的 single-source-of-truth——一件事說兩次會分歧 |
| Common Rationalizations 表（4 列） | **S** Red flags | 「Sequential prevents conflicts」「Worktrees handle parallelization」兩列保留語意；「User knows the dependencies」併入 Step 1 |
| Key Distinction 表（worktree-level vs task-level） | **S** §Choosing the substrate | 兩個 skill 的分界消失後，改成同一張表裡的兩列 |
| Related Skills（before/after） | **S** Step 5 末句（`/finishing`）+ §Choosing the substrate（`executing`） | `arc-writing-tasks` 改指 Track A 的 `executing`，**不用 `/` 形式**（該目錄本 commit 時尚未存在，slash 會使 §5.1 懸空） |

## 2. arc-dispatching-teammates（140 行 + 4 references 共 847 行）

### 2.1 SKILL.md

| 行為面 | 落點 | 說明 |
|---|---|---|
| Core principle：teammates 是 lead-present 平行的支撐面，手動開 N 個視窗是 fallback | **S** §Choosing the substrate 末段 | 保留「手動平行正是本 skill 要取代的東西」這句反面判準 |
| 「別預先預測衝突，讓 runtime 處理 runtime」 | **S** Step 1 末段 | |
| When to Use 四列路由表 | **S** §Choosing the substrate | 四列壓成四列但重寫主語：epic → piece / stream of work |
| **「分界是在場與否，不是風險高低」** | **S** §Choosing the substrate（粗體句） | 原句保留，這是 teammates↔looping 唯一的判準 |
| Preconditions 1（2+ ready epics） | **✂** | epic 概念已死；獨立性判準由 Step 1 承擔 |
| Preconditions 2（單一 scope） | **✂** | 依附 epic 集合 |
| Preconditions 3（Agent 支援 team_name） | **S** §Choosing the substrate 隱含 | 壓成「create the team before dispatching into it」；工具能力探測不是行為紀律 |
| Preconditions 4（lead 在 project root 不在 worktree） | **S** Step 5（cleanup 那句）| 「一個 process 不能刪自己站著的目錄」——保留機制理由，去掉 epic 框架 |
| Preconditions 5（在 dev branch 不在 main） | **S** Step 5 | 改寫為「那條 branch 就是交付物，不要自行推上預設分支」 |
| Cap at 5 + queue the rest | **S** §Choosing the substrate | 保留數字與理由（超過 5 協調成本大於平行收益） |
| TeamCreate BEFORE any dispatch | **S** §Choosing the substrate | 保留順序約束，去掉 tool 名以外的 GH issue 連結 |
| 每個 epic 一棵 worktree、path 從 CLI 讀回不得重建 | **S** Step 2 | 與 arc-using-worktrees 的同一條規則合流（見 §3） |
| Monitor / continuous dispatch（非 waves） | **S** §Choosing the substrate | 壓成一句 |
| **Step 6 驗收：兩個 fresh-context subagent，subagent 就是 gate，不得 inline** | **S** Step 4 + **Ra** | 全表最重要的一條。「lead 的先驗 context 正是使 inline 驗收不可靠的原因」原意保留 |
| Step 7 retry loop（3 retries／feedback 四要素／fix-forward 新 worktree） | **Ra** §What a rejection has to contain + §Retry budget、**Rc** §Retry after a rejection | |
| Step 8 wrap-up 三動作與順序 | **S** Step 5 | 壓成一段：報告 → 清理已驗收的 worktree → 失敗的留著 → 從主 checkout 執行 |
| Spawn Prompt Template 節 | **Rc** | |
| 「teammate 的純文字對 lead 不可見，SendMessage 是唯一通道」 | **✂** | Claude Code teammates 的傳輸細節，不是派工判斷；派工卡的 `## Return this` 已承擔「要回報什麼」 |
| Red Flags 12 條 | **S** Red flags（7 條存活） | 逐條見下 §2.3 |
| Completion / Blocked 格式框 | **✂** | v6 已落地的 7 支 skill 皆無框線輸出格式；`code-review`／`finishing` 的先例是完成判準勾選框 |
| Platform note（其他 harness 無 teammate substrate） | **✂** | v6 單一平台 |

### 2.2 references/（847 行 → 2 檔）

| 舊檔 | 落點 | 說明 |
|---|---|---|
| `spawn-prompt-template.md`（147） | **Rc**（88 行） | Authority／Workspace／Coordination 三段結構保留並加第四段 `## Acceptance criteria`（舊模板缺此槽——被派出去的 agent 自己決定什麼叫 done，正是 Step 4 要驗的東西）。「為何 Authority 節不可省」的論證（dispatched agent 比互動 session 更謹慎，且往往連問都不問就停住）原意保留。「不得加 ownership contract」保留。retry 前綴段保留，含「模糊回饋比沒有回饋更糟」 |
| `acceptance-and-retry.md`（433） | **Ra**（≈110 行） | 保留：兩個檢查的 prompt、從主 checkout 而非 worktree 跑測試的四個理由（壓成一句「重跑等於重現作者的環境，而那正是受測變因」）、兩報告的讀法表、六種缺陷樣式、calibration（不確定時傾向接受）、rejection 四要素＋範例、spec defect vs impl defect 的判別與 override 協定、「override 與合理化從外面看一模一樣，差別在證據」、retry 預算與「同一判準連兩次同樣失敗就別再機械重試」。✂：`arcforge:spec-reviewer` / `arcforge:verifier` 的 Agent() 呼叫語法、`epics/<id>/epic.md` 路徑、spec-reviewer 專屬回報格式名 |
| `tmux-timing-race.md`（104） | **S** §Choosing the substrate 一句 | 壓成「部分 spawn 失敗就只把失敗的那些循序重試——那是啟動競態，不是團隊人數上限」。GH #40168 連結、偵測字串清單、partial 回報框 **✂**：harness bug 的版本細節會過期，且行為指令只有一句 |
| `wrap-up-sequence.md`（163） | **S** Step 5 | 保留順序理由（先報告再清理：清理先跑而報告失敗，使用者就既無紀錄也無可檢查的樹）與「失敗的 worktree 留著」。Final Report 範例框、`TeamDelete` 失敗分支、Agent Teams docs 引文 **✂** |

### 2.3 Red Flags 逐條裁定

| 舊 Red Flag | 裁定 |
|---|---|
| 「你來當協調者，開 N 個視窗切換」 | **存活** → §Choosing the substrate 末段 |
| 「agent teammates 是通用功能不是 arcforge 模式」 | **✂** — 舊 skill 的自我定位辯護，對行為無效 |
| 「我用 arc-looping，它處理 dag 平行」 | **存活（改寫）** → §Choosing the substrate 的在場判準 |
| 「arc-dispatching-parallel 已經涵蓋了」 | **✂** — 兩支合併後此合理化不再可能存在 |
| 「有 8 個 epic 就開 8 個 teammate」 | **存活** → cap 5 |
| 「worktree 已存在就直接派工」 | **✂** — 依附 epic 展開流程 |
| 「我在 main 上派工沒問題」 | **存活（改寫）** → Step 5「那條 branch 就是交付物」 |
| 「pane 建立失敗 → 縮小團隊」 | **存活（壓縮）** → §Choosing the substrate 一句 |
| 「我得告訴 teammate 避開哪些共用檔」 | **存活** → Step 1「不要超出 file list 去預先協商衝突」 |
| **「我已經知道這個 epic 在做什麼，跳過驗收 subagent，用測試名對照 AC」** | **存活** → Red flags「Skip the acceptance check because you know what was built」 |
| **「teammate 已經跑綠了，再跑驗證 subagent 是多餘的」** | **存活** → Red flags「Accept because the report says tests passed」 |
| 「之後手動關 pane，跳過 TeamDelete」 | **✂** — 資源清理細節，非派工判斷 |

## 3. arc-using-worktrees（103 行）

| 行為面 | 落點 | 說明 |
|---|---|---|
| `arcforge worktree add [--branch] [--from] [--setup] --json` | **S** Step 2 code block | 原樣（`--json` 是 CLI 全域旗標，`add` 回傳含 `path`，已對 cli-manifest 與 `runWorktreeCommand` 查證） |
| `arcforge worktree list --json` + kind 註記 + 無 switch 子命令 | **S** Step 2 | |
| `arcforge worktree remove <name> [--force]` | **S** Step 2 + Step 5 | |
| **「每個命令都印 JSON，讀 `path` 欄，絕不重建路徑」** | **S** Step 2 + Red flags ×2 | 這是本支存在的理由，保留為 Step 2 的完成判準 |
| 「已在 worktree 內 → 不得巢狀」 | **S** Step 2 | 去掉 `.arcforge-epic` 判別式，改為「已經在 worktree 裡就在那裡工作」 |
| 「使用者指定的自訂路徑優先，用 raw git」 | **S** Step 2 | |
| Red Flag 1「我直接 git worktree add」 | **S** Red flags | |
| Red Flag 2「放在 ./worktrees/ 比較方便」 | **S** Red flags（併入「憑記憶打路徑」） | |
| Red Flag 3「把路徑硬編進輸出」 | **S** Red flags | |
| Red Flag 4「CLI 壞了就手動做」 | **S** Red flags | |
| `~/.arcforge/worktrees/<project>-<hash>-<slug>/` 版面 | **✂**（skill 面）／**G** `docs/guide/worktree-workflow.md` 已有 | D2：路徑推導歸引擎，skill 寫出版面就等於硬編 |
| Stage Completion Format / Blocked Format 框 | **✂** | 見 §2.1 末列 |
| 「Called by: arc-agent-driven, arc-executing-tasks」 | **✂** | 反向索引；router 表已是唯一索引面 |
| **新增（三支皆無）**：唯讀的 piece 不需要 worktree | **S** Step 2 末段 | 合併後才成立的判準——舊 worktrees skill 不知道 caller 是否寫檔，合併後知道 |

## 4. 本 phase 第一手教訓的吸收（來源：progress.md P5 gate 備註）

兩條都是量測過程挖出來的真實失效，依 `.claude/rules/dev-context.md` 去掉貢獻者語境後
寫成使用者面的事實：

| 教訓（內部措辭） | 出貨措辭 | 落點 |
|---|---|---|
| 「subagent 背景 eval 程序隨 agent 睡眠被回收——長時量測必須由常駐 session 執行」（本 phase 兩次死池的根因） | 「A dispatched agent's processes die when that agent finishes. Anything long-running … belongs in the session that stays alive」＋「Dispatch the work that produces a result; keep the work that produces it *over time*」 | **S** §What stays in this session + Red flags 一列 |
| 「派工後不採信自報，用檔案面／機械證據驗收」（P5 gate 的證據紀律，e2e AC 全部要求檔案面證據） | 「A completion report is a claim … it describes what the agent intended」＋「A green suite is not compliance either: it only proves the tests that exist pass」 | **S** Step 4 主段 + 完成判準（證據必須由作者以外的人產出） |

第二條與 teammates 舊 skill 的最強內容同構（fresh-context 驗收、subagent 就是 gate、
不得 inline 覆寫），因此讀起來是這支 skill 自己的紀律，不是引用外部軼事。

## 5. Invocation 重推導

見 `decisions/invocation-table.md`：`dispatching` 落地為 **model-invoked**，並在同一次
編輯移除 `worktrees` 的預填列（合併後不再是獨立 skill）。

## 6. 非 skill 面的連帶落點

| 項目 | 落點 |
|---|---|
| `legacy-skills.json` | 9 → 6（同 commit 剪 3 條，ratchet `test_legacy_entries_still_exist`） |
| `skills/using` Skill Map | 新增 `/dispatching` 一列（bijection 測試同 commit 轉綠） |
| `skills/arc-using/SKILL.md` ×4、`references/codex-tools.md` | backticked 死名 → `/dispatching`（R4 gating；legacy skill 走 v5 marker 解析，slash token 不觸發 §3.1／cross-ref） |
| `skills/arc-agent-driven/SKILL.md:26` | 同上 |
| `docs/guide/skills-reference.md` | 三條目併一（索引、分類表、arc-looping 交叉引用、Large Epic 流程圖同步） |
| `README.md` ×2 | 情境表一列 + Orchestration 清單兩列併一 |
| `CONTRIBUTING.md:132` | 命名範例刪去死名一列 |
| eval scenario Target | 見 §7 |

## 7. eval scenario 的 Target 處置

`skills/arc-dispatching-parallel/SKILL.md` 與 `skills/arc-dispatching-teammates/SKILL.md`
消失後有 2 支 scenario 的 `## Target` 懸空。判準：**該 scenario 的斷言主語在 v6 是否還存在。**

| Scenario | 裁定 | 理由 |
|---|---|---|
| `eval-arc-dispatching-parallel-feature-level-readiness` | **除役**（→ `evals/scenarios/retired/`） | A1（鑑別性斷言）的 regex 要求回應提到 `parallel --features` / `cli.js parallel`——該命令在 P2 隨 coordinator 引擎刪除，cli-manifest 無此條目。Setup 建的是 `specs/demo/dag.yaml`。**主語不存在，retarget 會出貨一支訊號在結構上不可能為真的 scenario**。A4 已知 flaky（檔頭 draft-unvalidated 紀錄兩次 k=5 相反結果），且 baseline 100% 天花板 → preflight BLOCK 在案 |
| `eval-arc-dispatching-teammates-lead-present-routing` | **retarget → `skills/dispatching/SKILL.md`**（Version 1→2） | 行為主語（在場 → teammates／走開 → 迴圈，分界是在場不是風險）完整存活於 §Choosing the substrate。措辭校訂三處：Target、Context 內舊 skill 名、A3 的 `arc-looping` 改為中性的「unattended walk-away loop」形狀（Track C 本 phase 刪除 `arc-looping`）。Setup 的 dag.yaml **保留**——它只是「有三件獨立的工作」的道具，不是斷言主語；A4 的 sha256 錨點依附它 |

除役採「移入 `retired/`」形式，與既有四支除役 scenario 同構。已查證
`listScenarios()` **不遞迴** `retired/`（`check:eval-targets` 於移動後轉綠可證）。

## 8. 新增 scenario

`eval-dispatching-report-not-evidence`（Target `skills/dispatching/SKILL.md`）。
設計理由、鑑別力論證與離線 instrument 驗證見 `evals/skill-eval-coverage.md` §v6 P6。

鐵則遵循：prompt 不引用 skill 任何措辭（不出現 dispatch／evidence／independent／
worktree／acceptance 等本 skill 詞彙）；Max Turns 40；behavioral 斷言使用 `re:` regex；
無 `[tool_called] Skill:*`（harness 對每個 trial 加 `--disable-slash-commands`，該形狀
結構不可能）。

## 9. 殘留缺口（本次未修，須有人裁決）

| 缺口 | 現況 | 為何本次不修 |
|---|---|---|
| `docs/README.md:31` 的 `arc-dispatching-teammates-flow.png` 區塊 | 圖與外部 wiki 連結指向已刪除的 skill | 那是 wiki 素材索引（alt text 是**檔名**不是 skill 存在性宣稱），且 vault 同步是 P8 的工作。`assets/` 內的 PNG 仍存在，不是懸空路徑 |
| `evals/workspaces/arc-dispatching-*/` 三份 baseline/green/phase4 紀錄 | 保留 | RED/GREEN 的歷史證據，刪掉等於銷毀 Iron Law 紀錄；`evals/benchmarks/2026-07-02.json` 同理（歷史量測快照） |
| `docs/plans/2026-04-10-arc-dispatching-teammates-design.md` 等 8 份舊設計文件 | 保留 | `docs/plans/` 是設計沿革，不是出貨面；不受 R4 把關 |
| 新 scenario 的 A/B 未執行 | scenario + 離線 instrument 驗證已交付 | P6 預登記門檻 6（約束性）：所有 preflight/ab/compare 由 orchestrator 主 session 執行；worker 只交付 scenario 與 instrument |
