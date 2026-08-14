# P6 落點對照表 — `brainstorming` / `executing` 吸收來源逐條對照

> P6 Track A 的人工 AC 交付物（verifier 覆核載體）。四支舊 skill 及其全部附檔，
> 主張**逐條**列出：**落地 / 部分 / 捨棄（附理由）/ 反轉（附理由）/ 純冗餘**。
> 「已合併」不是落點——每一條要嘛指得出新檔案的哪一節，要嘛說得出為什麼不要。

## 來源枚舉

| 代號 | 檔案 | 行數 |
|---|---|---|
| **A** | `skills/arc-brainstorming/SKILL.md` | 242 |
| **B** | `skills/arc-writing-tasks/SKILL.md` | 109 |
| **C** | `skills/arc-executing-tasks/SKILL.md` | 137 |
| **D** | `skills/arc-agent-driven/SKILL.md` | 135 |
| **D′** | `skills/arc-agent-driven/implementer-prompt.md` | 81 |
| **D″** | `skills/arc-agent-driven/task-reviewer-prompt.md` | 61 |
| **D‴** | `skills/arc-agent-driven/scripts/` ×3（sdd-workspace / task-brief / review-package） | 306 |

合計 1071 行 → `skills/brainstorming/SKILL.md`（116 行 body）+
`skills/executing/SKILL.md`（135 行 body），無 `references/`。

## 縮寫

- **BR** = `skills/brainstorming/SKILL.md`：`LAW`（The law）、`NOT`（When this does
  not apply）、`U1`、`E2`、`Y3`、`C4`、`HO`（Handing off）、`RAT`、`RF`
- **EX** = `skills/executing/SKILL.md`：`STATE`（The list is the only progress
  record）、`FMT`（Format）、`WRITE`（Writing the list）、`MODE`（Pick a mode）、
  `RUN`（Running a task）、`RES`（Resuming）、`RAT`、`DONE`

## 統計

**86 條**（A27 / B11 / C21 / D12 / D′7 / D″5 / D‴3）→
落地或部分 **47**｜完全捨棄 **34**｜純冗餘 **5**（D″ 整檔，P4 已吸收）。

完全捨棄的五類理由，全部至少歸屬其一：
① **載體消失**（SDD 管線／`agents/`／`templates/`，P2 已刪）
② **第二份事實來源**（與 D3「只有一種任務格式」或凍結 schema 相衝）
③ **無行為足跡的儀式**（宣告句、ASCII 輸出框、計數規則、字數規定）
④ **已在別支落地**（P4 `code-review`；Track B `dispatching`；`tdd`／`finishing`）
⑤ **點名引擎內部或發明路徑慣例**（D1 禁止／v6 不指定輸出路徑）

**8 條刻意反轉**（勿讀成遺漏）：A25、B2、B5、B11、C13、C15/D7、D′2/D′4。
每條在下表標 **反轉** 並附理由。

---

## A. `skills/arc-brainstorming/SKILL.md`（242 行）

| # | 來源主張 | 落點 |
|---|---|---|
| A1 | Iron Law「NO DESIGN WITHOUT EXPLORATION FIRST」 | **BR LAW（措辭反轉為可檢驗形式）** — 改為「NO DESIGN UNTIL THE ALTERNATIVES HAVE BEEN NAMED」。「有沒有探索過」無法從輸出判定，「有沒有把替代方案講出來」可以；eval 也才有得抓 |
| A2 | 不得因「需求看起來很清楚」或時間壓力而跳過 | **BR LAW + RAT** — 「Clarity is what an assumption feels like from the inside」＋ RAT 前兩列 |
| A3 | When NOT to Use 三條（已清楚且有文件／單一函式或小修／使用者說 just do it） | **BR NOT**（三條全落地，補第四條「你是在回答問題，不是在蓋東西」） |
| A4 | Phase 0：elicitation 前先掃 `specs/` 找既有 spec_id | **捨棄**（①）— SDD 管線 P2 已刪 |
| A5 | Step 0a：先偵測 `specs/<id>/_pending-conflict.md`，存在即自動進 iterate 分支 | **捨棄**（①）— refiner 衝突交接，管線已死 |
| A6 | 逐字（VERBATIM）呈現 `candidate_resolutions`，提示「pick (a)(b)(c)」 | **捨棄**（①）— 載體消失。其精神（不得改寫使用者要選的選項）在 v6 無對應輸入 |
| A7 | pending 檔對 brainstorming 唯讀；design 寫成功後才刪，失敗則保留待重試 | **捨棄**（①） |
| A8 | Step 0b：列出既有 spec 並要使用者確認 new vs iterate，**不得自動偵測** | **部分** — 「不得推斷使用者沒說的事」升為 **BR RF** 第三條；spec-id / iterate 機制捨棄（①） |
| A9 | Phase 1：查專案狀態（檔案、文件、近期 commit）、讀 `product/vision.md` | **部分** — 「先讀 repo、commit、文件、決策紀錄」進 **BR U1**；具名檔 `product/vision.md` 捨棄（⑤，SDD 慣例） |
| A10 | 一次一問、優先多選、聚焦目的／限制／成功標準 | **BR U1**（全落地，含「一次六題會有三題被猜」的理由） |
| A11 | decision-log：q_id 穩定、`deferral_signal`、YAML 增量落檔、refiner 機械解析 | **捨棄**（①②）— 消費者（refiner）已死；那是寫給機器讀的第二份事實來源 |
| A12 | Phase 2：提 2-3 個方案含 trade-off，先講推薦並說明理由 | **BR E2**（落地並強化：「每個方案都必須是你能真的替它辯護的」——straw man 不算一個方案） |
| A13 | YAGNI：只做使用者明確要求的 | **BR Y3**（落地，並補一張「你正要加什麼／為何它活不下來」五列表） |
| A14 | 2-Action Rule：每 2 次搜尋就存 `docs/research/<topic>.md` | **捨棄**（③⑤）— 一個計數儀式加一個發明的目錄慣例，與探索品質無因果 |
| A15 | spec-id 在 Phase 2 結束才定案、kebab-case、需使用者確認 | **捨棄**（①） |
| A16 | Phase 3：以 200-300 字分段呈現，逐段與使用者確認 | **部分** — 「短段落、逐段確認、不要丟一堵牆再問 look OK?」進 **BR C4**；200-300 字的數字捨棄（③） |
| A17 | design doc 四要素：問題／解法架構／可辨識需求（prose）／範圍宣告 | **BR C4**（四要素原樣落地，是本支唯一保留的結構性規定） |
| A18 | 寫檔前逐項驗證，缺一即 ERROR、未解決不得寫 | **部分** — 「四件事都在桌上才算收斂」落地；ERROR 機械閘捨棄（①，沒有強制輸出檔可擋） |
| A19 | 輸出路徑 `docs/plans/<spec-id>/<YYYY-MM-DD>/design.md` | **捨棄**（①⑤）— 改為 **BR C4** 尾段：落點由使用者決定，「不要為了歸檔而發明一個目錄慣例」 |
| A20 | iterate 分支：讀 `spec.xml`／歷代 design.md／`vision.md`／`decisions.yml` | **捨棄**（①） |
| A21 | Phase 2 Decision-Ledger：`decisions.yml`、`D-NNN`、append-only、B2 immutability hook | **捨棄**（①②）— ledger 與該 hook 均已不存在 |
| A22 | design doc 不得預寫結構化 delta（refiner 是 delta 權威） | **捨棄**（①） |
| A23 | Same-Day Iteration UX（`-v2`／描述性後綴） | **捨棄**（①）— 依附 A19 的目錄慣例 |
| A24 | After the Design：`git add` 兩路徑並 commit「brainstorming artifacts」 | **捨棄**（①③）— 把探索變成「產生可提交產物」的儀式；v6 的收斂物未必是檔案 |
| A25 | Hand off：**always** route to `/arc-writing-tasks` | **反轉 → BR HO** 三分支表（要清單 → `/executing`；夠小 → 直接做並走 `/tdd`；還沒收斂 → 說出來、指名未決的問題）。理由：`always` 是 SDD 管線的強制下一站，v6 沒有那條管線；而「探索完就一定要產出任務清單」正是 YAGNI 要擋的東西 |
| A26 | Common Rationalizations 九列 | **BR RAT** — 八列落地或改寫；「I'll pre-author the delta to save the refiner work」捨棄（①）。另新增三列（prototype 決定論、「真的只有一種做法」、「他們要的是 X」） |
| A27 | Stage Completion Format / Blocked Format（ASCII 框，含 `Then retry: /arc-brainstorming`） | **捨棄**（③）— 輸出裝飾，零行為足跡；且自我呼叫在 v6 無意義 |

## B. `skills/arc-writing-tasks/SKILL.md`（109 行）

| # | 來源主張 | 落點 |
|---|---|---|
| B1 | Bite-sized：每個任務 2-5 分鐘 | **部分 → EX WRITE** — 「一個任務一個行為，小到幾分鐘內做得完並檢查得了」。精確分鐘數捨棄（③，沒有人在計時，寫下來只是自我安慰） |
| B2 | Exact code：任務內必須寫完整程式碼，不是「加驗證」 | **反轉（部分）** — granularity 判準落地（見 B6），但「任務文字要內含完整實作碼」捨棄。理由：那讓清單變成第二份原始碼（②），並逼寫清單的人在沒有 repo 回饋、沒有紅燈的情況下先把碼寫死——與 `/tdd` 的 RED-first 直接衝突 |
| B3 | Exact commands：完整測試指令與預期輸出 | **落地並強化 → EX WRITE / RUN** — 升格為 D3 的 `verify:` 欄位：不只是「寫下指令」，而是「這條指令決定完成與否，取代你對做完沒做完的判斷」 |
| B4 | TDD order：先測後實作 | **部分 → EX RUN step 2** — 指向 `/tdd`。順序紀律歸 tdd 所有，在此重述會變成第二份 TDD 規格（②） |
| B5 | Persist to file：`docs/tasks/<name>-tasks.md` | **反轉（部分）** — 「寫成檔案」落地並升為 **EX STATE** 的核心規則；`docs/tasks/<name>-tasks.md` 這個路徑捨棄（⑤）。v6 不指定使用者 repo 的檔案落點 |
| B6 | Granularity Check 表三列（Set up auth／Add tests／Implement login） | **EX WRITE**（三列原樣落地，只換成本專案語氣） |
| B7 | Output Structure 範本（Goal／Architecture／Tech Stack／Context／Task N 五步） | **捨棄**（②）— 由 **EX FMT** 的 D3 v1 grammar 取代。兩份任務格式規格必然漂移；D3 已凍結、有 owner（`scripts/lib/task-list.js`）與 schema test |
| B8 | 範本內嵌「**For Claude:** Use arc-agent-driven or arc-executing-tasks」 | **捨棄**（①） |
| B9 | Completion Format / Blocked Format | **捨棄**（③） |
| B10 | Red Flags 四條（"Set up X" 無檔案／"Add tests" 無測試碼／"Implement Y" 無實作／任務 >5 分鐘） | **部分 → EX WRITE** — 收斂成一句正向判準：「一個永遠不可能被任何指令證明完成的任務，通常是還太含糊」。逐條表捨棄（與 B6 重複） |
| B11 | After This Skill：兩模式二選一，**Default to `arc-agent-driven`** | **反轉 → EX MODE** — 兩模式保留為顯式開關，但「預設走開」反轉為「問使用者要哪一種，不要假設」＋「要走開就先說出來，那是使用者還能說不的時點」。理由：走開模式在使用者不在場時花錢與改碼，把它設成預設等於預設自我授權（與 `looping` user-invoked 的同一條理由） |

## C. `skills/arc-executing-tasks/SKILL.md`（137 行）

| # | 來源主張 | 落點 |
|---|---|---|
| C1 | Overview：human-in-the-loop with checkpoints | **EX MODE**（Attended 欄） |
| C2 | 「Announce at start: I'm using the arc-executing-tasks skill…」 | **捨棄**（③）— 宣告儀式，零行為足跡 |
| C3 | vs arc-agent-driven 對照表（Executor／Review／Control／Best for） | **部分 → EX MODE 表** — 軸改為「誰執行／任務之間／適合／代價」。多出來的**代價**軸是刻意的：原表四軸沒有一軸回答「這個模式讓你付出什麼」，而那正是選模式時唯一該問的 |
| C4 | Step 1：讀清單、批判性檢視缺口與含糊、有疑慮先跟使用者提 | **部分 → EX WRITE 尾段 + MODE 前置** — 「目標本身還沒定就先回 `/brainstorming`」＋「動第一個任務前先定模式」 |
| C5 | Step 2 Choose Execution Context（本支為平行 session 設計；若在規劃 session 需確認交接） | **捨棄**（④）— session 拓撲屬 `sessions`／`dispatching` 的面 |
| C6 | Step 3：預設一批 3 個任務 | **EX MODE**（Attended：「三個任務是個好預設」） |
| C7 | Step 4 Checkpoint Report（ASCII 框範本） | **部分 → EX MODE** — 保留三件事（什麼落地／verify 說了什麼／要什麼決定）＋新增「使用者沒機會回答的 checkpoint 不算 checkpoint」；ASCII 框捨棄（③） |
| C8 | Step 5 Continue or Adjust | **EX MODE**（Attended 的等待語義內含） |
| C9 | Step 6：全部做完後走 arc-finishing（Step 0 以 `.arcforge-epic` 判別） | **部分 → EX DONE** 尾段指向 `/finishing`；`.arcforge-epic` 判別捨棄（①，epic-scoped worktree framing P2 已刪） |
| C10 | Core Rule 1：依序執行、遵守任務相依 | **部分 → EX RUN step 5** — 「往下走」。硬性「依序」捨棄：D3 v1 沒有相依圖，宣稱有等於憑空發明一個不存在的欄位（②） |
| C11 | Core Rule 2：Verify each — 跑測試指令、確認預期輸出 | **EX RUN step 3-4（核心）** — 強化為「跑了、讀了輸出才算」，並成為新 scenario 的 A2/A3 |
| C12 | Core Rule 3：Commit atomic，一個邏輯單元一個 commit | **EX RUN step 5** |
| C13 | Core Rule 4：Stop on failure — 測試失敗不要繼續 | **反轉（強化）→ EX RUN step 4** — 原文只說「停」。v6 要求停下來時把理由寫進檔案（`[!]` + `note:`），否則下一個人（或明天的自己）接不住一個沒有原因的停頓 |
| C14 | Core Rule 5：不得弄壞既有功能 | **捨棄**（④）— 由 `verify:`、`/tdd`、`/code-review` 承接；在此重述會變成無錨點的普適勸告 |
| C15 | Durable Progress Ledger：TodoWrite／checkpoint 只活在 context、compaction 或新 session 會丟、寫 `.arcforge/sdd/progress.md`（或勾 checkbox）、start 時讀 ledger 從最後 complete 之後接、先與 `git log` 對帳 | **反轉載體，診斷全數落地 → EX STATE + RES** — 診斷（context 會死、最貴的失敗是重做已完成的任務、要與 git log 對帳）原樣保留並成為整支 skill 的中心。但第二份紀錄 `.arcforge/sdd/progress.md` **刪除**：D3 明文只有一種任務格式，而原文自己就寫了正解（「或勾 `docs/tasks/…` 的 checkbox」）。兩處可以互相矛盾的紀錄，遲早會矛盾——EX STATE 直接把這句寫成規則 |
| C16 | Commit Strategy 表（feat/single/wip 三種 message） | **捨棄**（④）— commit message 慣例屬各專案的 CONTRIBUTING，不是本 skill 的行為面 |
| C17 | 小步 commit 便於回滾／不確定會不會影響別處就先 commit | **EX RUN step 5 + RAT**（「一個大 commit 比較乾淨」列） |
| C18 | Rationalizations 三列 | **EX RAT**（改寫落地） |
| C19 | Completion Format / Blocked Format | **捨棄**（③） |
| C20 | Integration：**Required** arc-using-worktrees（開工前先建隔離工作區） | **捨棄轉指向**（④）— worktree 面屬 Track B 的 `dispatching`。把隔離工作區設成硬性前置，會讓一個單分支的三步任務也被擋在門外 |
| C21 | Red Flags 五條 | **部分** — 三條落地（失敗測試就停／弄壞了就回滾（→ RUN step 4、RAT）／「先 commit 之後補測試」（→ RAT））；「未經同意在 main/master 開工」捨棄轉指向（④，分支面屬 `/finishing` 與 `dispatching`）；「改動多到追不上就全部一起 commit」併入 C17 那一列 |

## D. `skills/arc-agent-driven/SKILL.md`（135 行）

| # | 來源主張 | 落點 |
|---|---|---|
| D1 | Core principle：每任務一個全新 subagent ＋ 一個 task-reviewer 一趟回兩個 verdict | **部分 → EX MODE（Unattended）一句指向 `dispatching`** — 派工形狀（fan-out、隔離、模型階梯）是 Track B 的面；兩 verdict 的審查判準 P4 已落在 `code-review`（見 `p4-absorption-map.md` B1） |
| D2 | When to Use ／ vs arc-executing-tasks | **EX MODE 表**（見 C3） |
| D3 | Process 1-6（讀任務→派 implementer→派 reviewer→修→標完成→最後整支 branch review→`/code-review`→finishing） | **部分 → EX RUN + DONE** — 「跑一個任務」的骨幹與收尾落地；派工步驟指向 `dispatching` |
| D4 | Max review cycles 3；不收斂就帶著未解議題升級給人 | **捨棄轉指向**（④）— 審查迴圈的停止條件屬 `dispatching`／`code-review` |
| D5 | Per-Task File Handoff：記 BASE、`task-brief.js` 組 brief、`review-package.js` 出包、以 `{DIFF_FILE}` 交給 reviewer | **捨棄**（①④）— 腳本刪除（見 D‴）；review range fidelity 已由 P4 `code-review` 與 `eval-code-review-range-fidelity` 承接 |
| D6 | 「BASE 要記在 implementer 跑之前；`HEAD~1` 會把多 commit 任務截成最後一個 commit」 | **捨棄轉指向**（④）— P4 `code-review` 已落地同一條 |
| D7 | Durable Progress Ledger（同 C15，另加「`git clean -fdx` 會毀掉 ledger，要從 git log 重建」） | 同 **C15** 處置。`git clean` 註記隨載體消失（①） |
| D8 | Model Selection：每次 dispatch 都要指名模型、不得 inherit；haiku／sonnet／opus 階梯 | **捨棄轉指向**（④）— Track B `dispatching` 的面。附帶理由：具名模型階梯是會過期的事實，寫進 skill 等於排一個定時炸彈 |
| D9 | Headless caveat：arc-looping 走 `claude -p`，不吃 `model:` pin（點名 `scripts/lib/loop-verifier.js`），要顯式傳 `--model` | **捨棄**（⑤④）— prose 點名引擎內部檔違反 D1；內容屬 `looping`／`dispatching` |
| D10 | Agents & Templates：`implementer`／`task-reviewer` 兩個具名 agent 表 ＋ 兩份 template 作跨平台 fallback | **捨棄**（①）— P2 已刪 `agents/` 與 `templates/`；v6 單一平台，跨平台 fallback 無意義 |
| D11 | Red Flags 十條 | **逐條分流**：①兩 verdict 未清不得標完成 → P4 `code-review` 已有；②未經同意在 main 開工 → 捨棄轉指向 `/finishing`；③不得平行派多個 implementer → `dispatching`；④不要讓 subagent 自己讀任務檔 → `dispatching`；⑤不得指導 reviewer → P4 已落地；⑥不得讓計畫給自己打分（plan-mandated）→ P4 已落地；⑦不得給裸 diff → 隨 D5 捨棄；⑧不得用 `HEAD~1` → P4 已落地；⑨⑩**不得重派 ledger 標記完成的任務、先與 git log 對帳** → **EX RES**（本節唯一直接落在 executing 的一條，也是新 scenario 的 A1） |
| D12 | Integration 清單（worktrees／writing-tasks／code-review／finishing／subagents 用 `/tdd`） | **部分 → EX DONE 尾段** 指向 `/code-review`、`/finishing`；`/tdd` 進 **EX RUN step 2**；worktrees 見 C20 |

## D′. `skills/arc-agent-driven/implementer-prompt.md`（81 行）

| # | 來源主張 | 落點 |
|---|---|---|
| D′0 | 整檔載體：dispatch 用的 prompt template | **捨棄**（①④）— P2 已刪 `templates/`；派工 prompt 屬 `dispatching` |
| D′1 | 「把完整任務文字貼給 subagent，別讓它自己讀檔」 | **捨棄轉指向**（④）— 派工形狀，`dispatching` |
| D′2 | Before You Begin：需求／作法／相依有疑問，**現在就問** | **反轉 → EX MODE（Unattended）** — 走開模式下沒有人會回答。反轉為「需要決定的任務是 `[!]` 加上把問題寫進 `note:`，不是猜一個合理答案」。在場模式下原意仍成立（EX MODE Attended 的等待語義） |
| D′3 | Your Job 1-5：TDD（**REQUIRED:** `/tdd`）→ 驗證全綠 → 自審 → commit → 回報 | **EX RUN step 1-5 的骨幹**（落地） |
| D′4 | 「工作中遇到意外或不清楚就問；暫停澄清永遠 OK；不要猜、不要假設」 | 同 **D′2** 反轉處置 |
| D′5 | Self-Review 四類：完整性／品質／紀律（YAGNI）／測試真的驗行為 | **部分 → EX DONE 檢查表** — 完整性與證據面落地（每個 `[x]` 都跑過 verify 並讀過輸出、檔案與現實一致）；品質面捨棄轉指向 `/code-review`（④，P4 已落地一份，重述會變第二份標準） |
| D′6 | Report Format：實作了什麼／測了什麼與結果／改了哪些檔／commit hash／自審發現 | **部分 → EX MODE（Attended）checkpoint 三件事**（什麼落地／verify 說了什麼／要什麼決定）。commit hash 與檔案清單捨棄（③，git 已經知道） |

## D″. `skills/arc-agent-driven/task-reviewer-prompt.md`（61 行）— 整檔純冗餘

| # | 來源主張 | 落點 |
|---|---|---|
| D″1 | 一趟讀完回兩個 verdict（spec compliance + task quality） | **純冗餘** — P4 已落在 `code-review` S3（`p4-absorption-map.md` B1） |
| D″2 | Do Not Trust the Report：implementer 的回報是未經驗證的主張 | **純冗餘** — P4 已落地 |
| D″3 | Part 1 三檢查（Missing／Extra／Misunderstand）；無法從 diff 驗證就標 ⚠️ 並停 | **純冗餘** — P4 S3 Part 1 |
| D″4 | Part 2 逐一 changed function、錯誤處理分層、嚴重度三分、plan-mandated 仍是 finding | **純冗餘** — P4 S3 Part 2 |
| D″5 | `{DIFF_FILE}` 輸入契約（讀一次、不得重跑 git） | **捨棄** — 隨 D5／D‴3 的載體消失 |

本檔**無任何新落點**，且不因此有遺漏：五條主張在 P4 已逐條落地並有 eval 覆蓋
（`eval-code-review-two-axis`、`eval-code-review-range-fidelity`）。

## D‴. `skills/arc-agent-driven/scripts/`（306 行 JS）— 全數捨棄

| # | 檔案 | 落點 |
|---|---|---|
| D‴1 | `sdd-workspace.js`（102）— `.arcforge/sdd/` 自我忽略工作區、`runGit` 提高 maxBuffer | **捨棄**（①②）— SDD 工作區是 C15 那份第二任務狀態的家。D3 只有一種任務格式，工作區沒有東西可放 |
| D‴2 | `task-brief.js`（103）— 組 per-task brief 檔給 implementer | **捨棄**（①④⑤）— 派工形狀屬 `dispatching`；且本檔 `require('../../../scripts/lib/utils')` 是**活的 D1 違規**，靠 grandfather 才沒轉紅。刪除同時消掉一筆 D1 債 |
| D‴3 | `review-package.js`（101）— 把 `BASE..HEAD` 的 commit list + `--stat` + `-U10` 寫成一個檔 | **捨棄**（④）— review range 的正確性 P4 已由 `code-review` 承接；打包的載體屬 `dispatching` |

---

## 兩處跨 skill 措辭的決定（勿讀成疏漏）

| 指向 | 本分支寫法 | 為什麼 |
|---|---|---|
| `looping` | 裸名 `looping`，**永久**不帶斜線 | schema §3.1：user-invoked skill 不得被其他 skill 的 prose invoke。EX MODE 只中性描述「要不要把整份清單交給無人值守迴圈跑，是使用者自己啟動的事」 |
| `dispatching` | 裸名 `dispatching`，**暫時**不帶斜線 | Track B 尚未落地，`/dispatching` 會讓 `test_cross_reference_resolves` 在本分支轉紅。三支 legacy skill 的懸空指標修補也一併用了 `/executing`（已存在）而非新造。**orchestrator 合併裁量**：Track B 落地後可把 EX MODE 那一句升為 `/dispatching`；不升也不算違規（bare mention 合法） |

## 四支 legacy-targeting scenario 逐支處置

**全部除役，0 retarget、0 `## Version` bump。** 這與 P5 `evaluating`（9 支全
retarget、檔名保留）相反，理由逐支如下——不是忘了處理：

| Scenario | 處置 | 理由 |
|---|---|---|
| `eval-arc-agent-driven-ledger-resume` | **除役** | 前提被 D3 反轉。fixture 刻意讓 checkbox 清單全部未勾（誤導），把 `.arcforge/sdd/progress.md` 設成唯一權威；v6 的清單**就是**狀態，且沒有第二份 ledger。要讓它有效必須換掉 Setup、Assertions、Grader——那是新 scenario，不是 version bump。**存活的行為（resume 時不得重做 `[x]`）由 `eval-executing-verify-decides-done` A1 承接**（src sha 快照） |
| `eval-arc-agent-driven-model-selection` | **除役** | 派工模型階梯是 `dispatching`（Track B）的面。從 Track A 分支 retarget 過去會讓 `## Target` 指向本分支不存在的目錄，`check:eval-targets` 直接轉紅。Track B 若要重寫一支，起點在此 |
| `eval-arc-agent-driven-review-package-handoff` | **除役** | 行為的載體 `review-package.js` 整支捨棄（D‴3）。`executing` 沒有實作它，retarget 會量到一個新檔案裡不存在的東西 |
| `sdd-brainstorming-pending-conflict-handoff` | **除役** | `_pending-conflict.md` 是 refiner 的衝突交接（A5–A7）。SDD 管線 P2 已刪，行為沒有 target |

**未動、且不屬本 Track**：`eval-optional-workflow-simple-nonactivation` 與
`eval-optional-workflow-task-fit-activation` 的 `## Target` 是
`skills/arc-using/SKILL.md`（orchestrator 的處置範圍）。兩者 body 內對本批四支
的提及落在 **negative-match** grader pattern（斷言 agent **不得**提到它們），
刪除後語義仍成立、不需修改。`eval-sessionstart-minimal-bootstrap` 同理
（`arc-brainstorming.*arc-debugging.*arc-tdd` 是「不得傾印整份 skill 檔」的
反向 pattern）。已實測 `check:eval-targets` 綠。

## 附帶觀察（不在本 Track 修，記錄以免被當成遺漏）

- `CONTRIBUTING.md` §Skill Naming 仍以 `arc-brainstorming` / `arc-writing-tasks`
  當作「好名字」範例，且該節「Prefix: `arc-` required」整條與 **D7**（v6 無
  `arc-` 前綴）相衝。這不是本次刪除造成的懸空——整節在 D7 落地時就已過期，
  而且 `CONTRIBUTING.md` 不在 `check:docs` 的掃描面內。屬 orchestrator 最終
  收斂或 P7 的文件重建範圍，Track A 不代為改寫一整節命名規約。
- `docs/guide/skills-reference.md` 本次只做懸空指標的機械改名與三個小節的合併
  （`arc-writing-tasks` + `arc-executing-tasks` + `arc-agent-driven` → 單一
  `### executing`）。整份文件仍是 v5 結構（SDD／Orchestration 分類），P7 重建。
- `tests/skills/test_skill_structure.py::test_is_legacy_discriminates` 原本硬編
  `arc-brainstorming` 作正向樣本。已改為讀 manifest：硬編一個名字，等於每個
  phase 重寫到那支 skill 時都轉紅一次，那是噪音不是發現。
