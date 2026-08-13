# P5 Track A 吸收對照表 — learning 四支合一

> `arc-journaling` + `arc-learning` + `arc-recalling` + `arc-reflecting` → `skills/learning/`
>
> 逐行記錄舊 skill 的**每一個行為面**落到哪裡。「已合併」不是答案——每一列必須指到
> 新 skill 的某一節、某個 reference、某個 CLI 子命令、某份 docs/guide，或寫明
> **刻意捨棄＋理由**。（P4 教訓：裁決要落在耐久載體。）
>
> 落點欄縮寫：**S**=`skills/learning/SKILL.md`｜**R**=`skills/learning/references/`｜
> **C**=CLI｜**L**=`scripts/lib/`｜**G**=`docs/guide/`｜**✂**=刻意捨棄

## 1. arc-journaling（172 行 + example-diary.md 49 行 + diary.js 68 行）

| 行為面 | 落點 | 說明 |
|---|---|---|
| `diary.js path` | **C** `learn diary path [--draft]` | 新增 `--draft`：skill 需要草稿路徑才能讀它，原本只能靠 prose 硬編 `~/.arcforge/diaries/...` |
| `diary.js save` | **C** `learn diary save --content` | |
| `diary.js finalize` | **C** `learn diary finalize` | 邏輯移入 **L** `learning-workflow.finalizeDiaryDraft` |
| Pre-Diary Check（4 條標準 + auto-skip 清單） | **S** §Capturing a diary Step 1 | 四條標準保留原意，auto-skip 清單壓縮為一句 |
| Draft Finalization Workflow（4 步） | **S** §Capturing a diary Step 2–3 | 這是全表最重要的一條——舊 skill 明文記載的失敗模式（收到 nudge 後憑記憶 `save`，產生重複 final + 孤兒 draft）原樣保留並升級為 Step 2 的完成判準 |
| 「Session Metrics 必須原樣保留」 | **S** Step 2 | |
| 「沒有那段記憶就不要填 `<!-- TO BE ENRICHED -->`」 | **S** Step 2 + Red flags | |
| 「finalize 是 rename 不是 merge」 | **S** Step 3 + **C** `--help` + **L** docstring | 三處都寫是因為誤解成 merge 會靜默丟掉編輯 |
| 「憑記憶反思，不要讀檔」 | **S** Step 3 + Red flags | |
| 「NEVER auto-save，先問」 | **S** Step 3 + Red flags | |
| diary 模板 | **R** `diary-template.md` | |
| `references/example-diary.md` | **R** `diary-template.md` §Worked example | 合併；範例重寫為「每一項都寫 why」的示範，並在結尾說明為何這樣才可被後續 pattern 使用 |
| Storage 版面（`~/.arcforge/diaries/...` 樹狀圖） | **G** skills-reference.md Artifacts | ✂ 出 skill：路徑改由 `learn diary path` 回報，skill 不再編碼引擎版面（D1 精神） |
| 「為何在 `~/.arcforge` 而非 `~/.claude`」註腳 | **✂** | 引擎沿革，非 agent 行為；讀者是貢獻者不是使用者 |
| Template Variables 節 | **✂** | CLI 已預設 `--date`=今天、`--session`=`$CLAUDE_SESSION_ID`、`--project`=專案目錄名，agent 不必自行推導 |
| 「存完提示去跑 arc-reflecting」 | **✂** | 兩者現在同一支 skill，§Which job 已承擔導引 |
| When to Use / When NOT to Use 兩節 | **S** §Which job + `/sessions` 區辨句 | user-invoked 的 description 不帶 trigger（schema §3），所以這兩節的內容改由 dispatch 表承擔 |
| `SKILL_ROOT` bash 前導 + `${CLAUDE_PLUGIN_ROOT}` | **✂** | D9：一律裸呼叫 `arcforge`。這是四支共同的刪除項，下面不再重複列 |

## 2. arc-reflecting（204 行 + example-reflection.md 83 + diary-analyzer.md 26 + reflect.js 182）

| 行為面 | 落點 | 說明 |
|---|---|---|
| `reflect.js strategy` | **C** `learn reflect scan`（併入） | 三命令併一：先挑 strategy 再用**別的** strategy 去 scan 會靜默分析錯集合 |
| `reflect.js scan` | **C** `learn reflect scan` | 同上 |
| `reflect.js auto-check` | **L** `learning-workflow.checkReflectReady` | ✂ 出 CLI：唯一消費者是 SessionEnd hook，而 hook 直接 require lib（D8 歸零的那條）。skill 面用 `reflect scan` 的 `ready` 欄 |
| `reflect.js update-log` | **C** `learn reflect record`（併入） | |
| `reflect.js save-record` | **C** `learn reflect record` | update-log + save-record 併一：舊流程是兩個獨立步驟，漏掉 update-log 會下次重複分析同一批 diary，漏掉 save-record 則 curator 看不見這次反思。合成一個命令後兩者不可能只做一半 |
| `reflect.js save-instinct` | **C** `learn instinct save --source reflection` | 與 recall 的 save 合流為單一入口，`--source` 選 confidence 上限（0.85 vs 0.90） |
| 「3+ = Pattern，1–2 = Observation」 | **S** §Reflecting Step 3 + Red flags | |
| 「每個 pattern 必須引用具體 diary」 | **S** Step 3 完成判準 | |
| 非規範性原則（報告觀察不下規則） | **S** Step 3 + Red flags + **R** 範例結尾 | |
| 「絕不自動改 CLAUDE.md」 | **S** Step 4 + Red flags | |
| 「一定要更新 processed.log」 | **C**（機制化）+ **S** Step 4 + Red flags | 從「請記得做」升級為「一個命令做完兩件事」——這是把紀律搬進機制的一例 |
| 讀 CLAUDE.md 找違規 | **S** Step 2 | |
| 反思輸出格式（strategy header / 違規 / pattern / observation） | **R** `reflection-format.md` | |
| 「違規排在 pattern 之前」 | **R** `reflection-format.md` 開頭說明理由 | |
| `references/example-reflection.md` | **R** `reflection-format.md` §Worked example | 合併並重寫；結尾加一段「這個範例刻意沒做什麼」 |
| Storage 版面 + processed.log 格式 | **G** skills-reference.md Artifacts | ✂ 出 skill |
| 「< 3 篇就回報數量並停」 | **S** Step 1 | |
| Observation cross-reference（比對 observations.jsonl 佐證） | **✂** | 需要 agent 手讀引擎的 JSONL——正是 D1 要禁的形狀。真正的交叉佐證由 curator 的 batch-assembler 在引擎側做，skill 重做一次只是弱化版 |
| `diary-analyzer.md`（子代理 prompt） | **✂** | `agents/` 於 P2 移除；大量 diary 要隔離 context 時用泛用 Task 子代理即可，26 行的專用 prompt 不承載行為 |
| Red Flags 節 | **S** §Red flags | |

## 3. arc-learning（146 行 + instinct.js 473 行）

| 行為面 | 落點 | 說明 |
|---|---|---|
| `learn status / enable / disable / dashboard` | **S** §Reviewing what activates | CLI 未動（既有生命週期子命令本次不改） |
| `instinct.js status` | **C** `learn instinct status` → **L** `instinct-feedback.collectInstinctStatus` + `renderInstinctStatus` | 資料與呈現拆開，`--json` 與人類視圖同源 |
| `instinct.js confirm` | **C** `learn instinct confirm` → **L** `confirmInstinct` | |
| `instinct.js contradict` | **C** `learn instinct contradict` → **L** `contradictInstinct` | 含 archive 分支 |
| `syncCuratorCandidate`（ICL-6 candidate 對齊） | **L** `instinct-feedback.syncCuratorCandidate` | 原樣移入，best-effort try/catch 語意不變 |
| `instinct.js evolve` | **✂** | 它的輸出結尾就是「去 dashboard 用 Evolve」——一個假裝成命令的指標。真正的 Evolve 在 dashboard |
| 「未經明確 activate 不改變行為」 | **S** §Reviewing（本節主句）+ Red flags | 這是整個子系統的核心保證，保留為 skill 的敘事骨幹 |
| 「專案 scope 優先，不靜默升 global」 | **S** §Reviewing | |
| 「LLM 提案、人拍板」三道閘 | **S** §Reviewing | |
| 「dashboard 是審查面，不要用臨時檔案編輯繞過」 | **S** §Reviewing | |
| confirm/contradict 要給使用者兩個方向 | **S** §Reviewing 末段 | |
| Candidate Lifecycle Statuses 八列表 | **G** learning-dashboard.md | ✂ 出 skill：dashboard 本身就顯示狀態，agent 背下八個狀態名不改變任何行為 |
| Confidence Lifecycle 算術（+0.05／−0.10／每週衰減／各門檻） | **G** | ✂ 出 skill：引擎常數。agent 需要知道的只有「反駁夠多會被封存」，那句留在 §Reviewing |
| Observer Daemon 四層說明 | **G** | ✂ 出 skill（任務明令：引擎細節不進 skill prose） |
| Daemon Safety（`.analyzing.lock`／watchdog／skip filter） | **G** | ✂ 同上 |
| Retired/Deprecated CLI 段落 | **C** `--help` | ✂ 出 skill：對使用者的意義只有「用 dashboard」，已在 §Reviewing 說明 |
| Redacted evidence／fail-closed／duplicate suppression 三條原則 | **✂** | 引擎不變式，非 agent 可執行的行為；agent 讀了也無事可做 |

## 4. arc-recalling（83 行 + recall.js 144 行）

| 行為面 | 落點 | 說明 |
|---|---|---|
| `recall.js save` | **C** `learn instinct save`（`--source` 預設 manual） | 與 reflect 的 save-instinct 合流 |
| `recall.js check-duplicate` | **C** `learn instinct check` | |
| `recall.js save-record` | **C** `learn recall record` → **L** `learning-workflow.recordRecall` | |
| 工作流六步（推導欄位→預覽→查重→存→記錄） | **S** §Saving an instinct by hand | 順序保留：查重在預覽之後、寫入之前 |
| 「一定要先預覽再存」 | **S** 該節第 3 步 + Red flags | |
| 「一次只存一條」 | **S** 該節末句 | |
| 「trigger/action 不明就問，不要猜」 | **S** 該節第 1 步 | |
| confidence 公式 `min(0.9, 0.5+0.05n)` | **✂** | 引擎常數；agent 用 `--evidence-count` 表達證據量即可，不需自行算 |
| `argument-hint` frontmatter | **✂** | 合併後這支 skill 有四個工作面，單一參數提示會誤述其中三個 |
| When to Use / When NOT to Use | **S** §Which job | |

## 5. 非 skill 面的連帶落點

| 項目 | 落點 |
|---|---|
| D8 allowlist 最後一條（`end.js` → reflect.js） | `hooks/session-tracker/end.js` 改 require **L**；`tests/scripts/d8-engine-boundary.test.js` ALLOWLIST = `[]`，並拆兩條斷言（釘常數 + 釘實掃） |
| hook nudge 三處 | `inject-context.js` 改指 `/arcforge:learning`，措辭改為「告訴使用者可以執行」（配合 user-invoked） |
| `tests/scripts/{diary,reflect,recall,instinct}.test.js` | 刪除，代之以 `learning-workflow.test.js` + `instinct-feedback.test.js`。約 30 → 115 tests；新增 finalize（原零覆蓋）、真實 confirm/contradict 檔案變更、archive 路徑、CLI exit code |
| `hooks/__tests__/learning-unification.test.js` §2 | 原本斷言 recall.js 的原始碼；改為斷言 CLI handler 的委派與 `--source` 預設 |
| `instinct-curator-lifecycle` / `inject-activated-instincts-contract` | 改 require **L** `instinct-feedback` |
| schema 測試 ×3 | **L** `learning-schemas.js` + `tests/scripts/learning-schemas.test.js`（46 tests，含負向樣本；mutation：`result()` 改恆真 → 36/46 轉紅） |
| §3.1 / §5.2 mutation 重跑（P3 掛帳） | 已執行，見 §6 |
| evals scenario Target | 見 §7 |
| `skills/using` router 列 | 新增 `/learning` 一列，Use-when 欄尾標 `(user-invoked)` |
| `skills/arc-using`（v5 legacy router） | 四列併一列，改指 `learning` |
| `docs/guide/skills-reference.md` | 四個條目併為一個 `learning` 條目；索引、分類表、決策樹、Learning Loop 圖同步 |
| `README.md` | 指令表、情境表、Memory 清單三處改指 `learning` |
| `docs/guide/learning-dashboard.md` / `cli-invocation.md` / `composable-skill-eval-coverage.md` | 最小 retarget（全面重寫是 P8） |

## 6. §3.1 / §5.2 mutation 重跑（清 P3 掛帳）

P3 記錄：這兩條守衛在真實語料上 vacuous，覆蓋由合成樣本承擔，**待第二支
user-invoked skill 落地時重跑**。`learning` 就是第二支，故本次重跑，用**真實語料的
刻意違規樣本**（不是合成 fixture）：

**§3.1 — user-invoked 不可被 prose-invoke**

```
mutation: 在 skills/sessions/SKILL.md 末尾加一行
          "After writing the handover, run /learning to capture a diary."

FAILED tests/skills/test_skill_structure.py::test_user_invoked_skills_are_not_prose_invoked[sessions->learning]
E  AssertionError: sessions prose-invokes /learning, which is user-invoked
   (disable-model-invocation) — a user-invoked skill is reached by the user
   typing its slash command, never by another skill's text
```

還原後：`5 passed, 9 skipped`。

**§5.2 — 禁跨 skill 深連結**

```
mutation: 在 skills/learning/references/diary-template.md 末尾加一行
          "See `skills/code-review/references/completion-evidence.md` ..."

FAILED tests/skills/test_skill_structure.py::test_no_cross_skill_deep_links[learning]
E  AssertionError: learning deep-links into another skill's directory:
   {'references/diary-template.md': ['skills/code-review/']}
```

注意這條命中的是 **`references/` 底下的檔案**，不是 SKILL.md——正是 P3 把守衛範圍
擴到 skill 目錄全部 markdown 的理由，本次得到真實語料驗證。

還原後：全 pytest `158 passed, 33 skipped`。

## 7. eval scenario 的 Target 處置

`skills/arc-learning/SKILL.md` / `skills/arc-reflecting/SKILL.md` 消失後有 7 支
scenario 的 `## Target` 懸空。逐支裁定（`node scripts/check-eval-targets.js` 綠）：

| Scenario | 新 Target | 理由 |
|---|---|---|
| `dashboard-promote-gate` | `scripts/lib/learning-dashboard.js` | 測的是 dashboard 控制面的 promote 閘，主語一直是引擎不是 skill prose |
| `dashboard-safety-ack-required` | `scripts/lib/learning-dashboard.js` | 同上 |
| `dashboard-concurrency-guard` | `scripts/lib/learning-dashboard.js` | 同上 |
| `deactivate-reviewer-ack-required` | `scripts/lib/learning-curator/activate.js` | reviewer_ack 同意模型由 activate.js 擁有 |
| `activated-skill-behavior` | `activate.js` + `skills/learning/SKILL.md` | 原本就是雙 target，只換 skill 那一半 |
| `pending-candidate-boundary` | `schema.js` + `skills/learning/SKILL.md` | 同上；`composable-skill-eval-coverage.md` 的 `--skill-file` 同步 |
| `reflect-pattern-detection` | `skills/learning/SKILL.md` | 測的行為（3+ 才算 pattern、單次不得升格、不得逐字倒 diary）完整存活於新 skill §Reflecting Step 3。prompt 內「invoke arc-reflecting」改為中性措辭，`## Version` 1→2 |

**未除役任何 scenario。** 七支的行為主語都還存在，只是換了承載檔案。

`evals/scenarios/eval-optional-workflow-task-fit-activation.md:135` 的負向 regex
仍列著 `arc-reflecting`：**刻意不動**。那是一條「輸出不得出現這些 skill 名」的斷言，
名稱消失後該項恆真、不可能誤紅；改動它會動到 rubric 而需 Version bump，卻換不到
任何鑑別力。留待 P7 重建語料時一併處理。

## 8. 殘留缺口（本次未修，須有人裁決）

| 缺口 | 現況 | 為何本次不修 |
|---|---|---|
| operation record 走 `os.homedir()`，不認 `ARCFORGE_HOME` | `learn reflect record` / `learn recall record` 在隔離環境下仍寫真實 home | 修它等於動 `operation-record-writer.js` 的預設解析器，屬「P5 引擎不動」邊界外。完整證據與影響範圍見 `docs/plans/v6/p5-learning-e2e-evidence.md` §2、§4 |
| CLI 未暴露 `--home-dir` / `--project-id` | 兩者留在 lib 參數層 | 它們是測試注入縫，不是使用者旗標；lib 測試直接用 `homeDir`，CLI 面不必背這兩個旗標 |
| e2e probe 未執行 | 見 `p5-learning-e2e-evidence.md` §1–§7 | 旗艦 AC，阻塞原因與拒絕的三條後門逐條記錄在該檔 |
| +1 scenario 的 A/B 未執行 | 見 `p5-learning-e2e-evidence.md` §8 | 沙箱拒絕含 `eval` token 的指令；scenario 檔已就緒，Setup 與 grader 已離線驗證（含負向樣本），但**沒有 delta 數字** |
| `skills/arc-using` 的 `learning` 表格列 | pytest 綠 | 它是 legacy skill（在 `legacy-skills.json` 內），§3.1 對它不生效；且該列寫的是 backtick 包住的 `learning` 而非 `/learning`，兩層都不觸發。**但若某個 phase 在刪掉 `arc-using` 之前先把它移出 legacy 清單，這列就會變成 §3.1 違規**——它 prose-invoke 了一支 user-invoked skill。移出清單與刪除必須是同一步 |
