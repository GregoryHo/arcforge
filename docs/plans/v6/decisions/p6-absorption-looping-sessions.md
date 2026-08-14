# P6 Track C 吸收對照表 — looping + sessions⊕compacting

> 兩件事，一份對照：
>
> 1. `arc-looping` → `skills/looping/`（user-invoked 重寫）
> 2. `skills/compacting/` → `skills/sessions/`（合併，−1 dir）
>
> 逐行記錄舊 skill 的**每一個行為面**落到哪裡。「已合併」不是答案——每一列必須指到
> 新 skill 的某一節、某個 reference、某個 CLI 子命令，或寫明 **刻意捨棄＋理由**。
>
> 落點欄縮寫：**S**=新 skill 的 SKILL.md｜**R**=該 skill 的 `references/`｜
> **C**=CLI（`arcforge loop --help`）｜**✂**=刻意捨棄

## 1. arc-looping（169 行 + references/state-file.md 47 行）→ `skills/looping/`

| 行為面 | 落點 | 說明 |
|---|---|---|
| Core principle（fresh session per task + file-based state） | **S** 開場 | 保留為敘事骨幹；補上「所以沒有人在看」這一句，把機制直接接到 user-invoked 的理由 |
| When to Use（有一份可無人值守執行的清單） | **S** §Step 1 | user-invoked 的 description 不帶 trigger（schema §3），這節的內容改由 Step 1 的前置條件承擔 |
| 「Task list must exist — 先跑 arc-writing-tasks」 | **S** §Step 1 | 保留「清單先行」，但**不指名產清單的 skill**：P6 的 `executing`（Track A）與本支同 phase 平行落地，跨 worker 硬連結會讓任一支先進主線時 §5.1 target 解析不到。清單格式面直接示範 D3 樣態即可 |
| D3 清單樣態（banner + `- [ ] T1 —` + `verify:`） | **S** §Step 1 程式碼區塊 | 新增。舊 skill 只說「要有一份清單」，使用者無從判斷手上那份是否 loop-ready |
| 「Verify baseline — npm test」 | **S** §Step 1 完成判準 | 從「建議」升級為 Step 1 的 checkbox，並補上為何：壞掉的 baseline 會讓 loop 花一個 session、退 floor、retry，然後 block 一個本來沒問題的任務 |
| 「Set limits — --max-runs / --max-cost」 | **S** §Step 2 完成判準 | 同上升級為 checkbox（兩個旗標都必須在命令列上） |
| Stop Conditions 六列表 | **S** §Step 2 | 補齊為七列：舊表漏了 `blocked`（有任務被擋、無可跑任務）與 `failed` 的區別 |
| Flag Reference 九列表 | **S** §Step 2/§Step 3/§verifier 三處就地說明 | ✂ 掉獨立的旗標字典。旗標表在 `arcforge loop --help`（**C**）已是即時真值；skill 內重抄一份只會漂移。skill 只講**何時**用哪個旗標 |
| Headless Permissions（不能答權限提示、stall 簽名、pass-through） | **S** §Step 3 | 原樣保留，含「不要改 `--task-timeout`，要改 `--allowed-tools`」的反直覺指令 |
| 「絕不自動加 --dangerously-skip-permissions」 | **S** §Step 3 | |
| Launching Overnight（nohup + disown、wall-clock = N × timeout） | **S** §Step 3 + 完成判準 | |
| 「絕不在 tool-driven session 的前景啟動」 | **S** §Step 3 + Red flags | |
| Monitoring（讀 `.arcforge-loop.json`） | **S** §Checking on it | |
| State File 欄位清單 | **S** §Checking on it + **R** `state-file.md` | **刻意保留 reference**（P5 把 learning 的 storage 版面 ✂ 出 skill，本表不照抄那個裁決）：learning 有 `learn diary path` / `learn status` 這類 CLI 回報路徑，loop **沒有** `loop status` 命令，狀態檔就是使用者在無人值守期間唯一的讀取面。「去讀 `.arcforge-loop.json`」這條指令在不知道欄位語意時不可執行。退場條件寫在這裡：一旦 CLI 長出 `loop status`，這份 reference 應該退成該命令的輸出 |
| state-file.md 的 `"pattern": "sequential"`、`feat-001-01` 任務 id | **R**（更正後保留） | 兩者都與引擎實況不符：`beginRun` 寫入的是 `pattern: "tasks"`，任務 id 來自 D3 清單（`T1`/`T2`）。承接時一併更正，並補 `tasks_file` 欄位與「stale `running` = 被殺掉的 run」判讀句 |
| Worktree Awareness（從 project root 跑、不要兩個 loop 打同一份清單） | **S** §Checking on it + Red flags | 「從 project root 跑」一句 ✂：v6 的 worktree 面由 `dispatching`（Track B）承擔，且 loop 的 project root 由 `CLAUDE_PROJECT_DIR` / cwd 決定，重述一次只是規則副本。「兩個 loop 打同一份清單」保留（真實破壞行為） |
| During Execution（每輪流程敘述） | **S** §Step 1（verify floor 語意）+ §Checking on it | 流程本身是引擎行為，使用者不需背；保留的是使用者**要據以決策**的兩點：floor 決定任務能不能被標 done、markers 由 loop 擁有 |
| Resume vs Reset | **S** §Picking it back up | 原樣保留 |
| 「被殺掉的 loop 留下 status: running / finished_at: null → 下次 --reset」 | **S** §Picking it back up + **R** + Red flags | 三處都寫：這是唯一一個「檔案還在但語意相反」的狀態，誤讀會讓使用者以為 loop 還在跑 |
| `--verify-cmd` / `--verifier` / `--max-retries` | **S** §The verifier gate | 新增**何時值得開 verifier** 的判準（舊 skill 只列旗標語意，沒說何時用）：floor 看不見的東西才需要第二意見 |
| After the Loop（`/code-review` → arc-finishing） | **S** §When it stops | `arc-finishing` → `/finishing`（v6 已落地）。補「先讀 state file 與清單、回報 blocked 原因再提議」 |
| Red Flags 五條 | **S** §Red flags（八條） | 五條全數保留，新增三條：憑「使用者說不要上限」就不設上限、手改 markers、stall 後不看 errors 直接重啟 |
| Integration §（Before / Works with / After） | **✂**（拆入各節） | 三行 skill 名索引，v6 由 router 承擔；其中 `/evaluating`（迴圈之間跑 eval）與「compaction 不需要，每輪都是新 session」兩句捨棄——前者是未落地的組合建議，後者是引擎事實而非使用者行為 |
| `category: orchestration` / `status: promoted` frontmatter | **✂** | v6 凍結 schema 不收這兩個鍵（skill-schema §2） |

### Invocation 裁決：user-invoked（重推導維持預填值）

判準是「agent 該不該自己伸手去拿」。`looping` 是 v6 少數兩件事同時成立的
skill：它**花使用者的錢**（每輪一個 `claude -p` session，`--max-cost` 預設無上限），
而且**在沒有人看的情況下改使用者的碼並 commit**。agent 自行啟動一個無人值守迴圈，
等於自己批准自己不受監督——那不是「條件在任務中途成立」可以正當化的事，
`evaluating` 的 P5 推導已經把這條界線畫出來（它兩者皆非，所以是 model-invoked）。

反向檢查（推翻預填的機會）：觸發條件「使用者要走開了、手上有一份清單」確實會在任務
中途出現，這在別的 skill 是 model-invoked 的理由。但這裡的失敗方向是不對稱的：
忘記啟動迴圈的代價是使用者隔天自己再打一次；自行啟動迴圈的代價是一夜無人監督的
花費與 commit。預填值成立，落地為 `disable-model-invocation: true`。

連帶約束：user-invoked 不可被其他 skill prose-invoke（schema §3.1）。`/looping`
因此**只**出現在 router 的 Skill Map 索引列（標注 `(user-invoked)`），任何其他
skill 的內文都不得寫它。

## 2. eval scenario 處置

| Scenario | 處置 | 理由 |
|---|---|---|
| `eval-arc-looping-bounded-unattended-loop-gate` | **除役（刪檔）** | 前提整個死在 P2：它的 trap 是 `loop --pattern dag`，fixture 是 `specs/demo/dag.yaml`，斷言 A1 要求 agent 確認「verified DAG 存在」——SDD pipeline 與 DAG 引擎已於 P2 移除，`--pattern` 旗標不存在。retarget 等於重寫。第二個理由：它的 baseline 已實測 100%（hash `2e6fc32c`），A4 又長期 flaky（見檔內 status 註記），本來就是 draft-unvalidated。以新 scenario 取代 |
| `eval-looping-killed-run-reset`（新增） | **+1** | 見 `evals/skill-eval-coverage.md` P6 節 |

## 3. 待補（C2 sessions⊕compacting）

本節於 sessions⊕compacting 合併 commit 補齊。
