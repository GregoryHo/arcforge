# ArcForge Skills & Hooks Audit Remediation Plan

本文件是 arcforge 修復計畫（branch `fix/skills-hooks-audit-remediation`）的封裝說明，涵蓋一次多代理稽核對 `skills/`、`hooks/`、`scripts/` 產出的 **35 筆已確認（confirmed）發現 + 52 筆低嚴重度（low-severity）發現**，拆分為 10 個批次（Batch 1–10，其中 Batch 10 為低嚴重度整批潤飾）。以下各批次內容為個別草擬、已驗證過的技術結論，逐字保留、不重新調查、不二次質疑其技術判斷。

**目前狀態：本文件本身就是「計畫」，尚未套用任何出貨程式碼（shipped code）的修正。** 所有批次列出的 Fix 都還沒有被實作、沒有對應的 commit——這是執行前的規劃書，不是完成報告。後續章節依序為：彙整所有批次中明確標記的「Decision Required」決策點（含 Batch 10 額外拉出的設計決策）、全批次通用的紅線規則、跨批次的建議執行順序（含檔案重疊與重複發現的處理方式）、以及計畫「完成」的判定標準。

## Decisions — Resolved (2026-07-03)

以下 13 項決策已由 repo owner 逐一裁定完畢（訪談記錄於此，供實作者直接依循，不需再等待）。原始選項與論證保留於各批次內文，此處只記錄**最終決定**與**對批次範圍的影響**。

1. **B1-9（Batch 1）** — `agents/debugger.md` 與 `agents/planner.md`。
   → **決定：選項 A，刪除。** 兩個檔案都與已經「勝出」的既有設計重疊（arc-debugging 已內嵌完整 4-phase 方法論；arc-planning 的實際 planner 是 scripts/planner.js），且隔離式 subagent 委派模式本來就不適合除錯（需要延續上下文）與腦力激盪（需要使用者在場互動）這兩種場景。連同修正 `README.md` 第 195/199/204 行（移除兩列、調整「11 specialized subagents」計數）。範圍不變。

2. **DOC-1 第 28 行（Batch 2）** — `eval-optional-learning-release-flow-active-skill`。
   → **決定：選項 (a)，直接刪除該列與對應指令。**

3. **DOC-1 第 29 行（Batch 2）** — `eval-optional-learning-self-improvement-candidate`。
   → **決定：選項 (a)，直接刪除。**

4. **R3-2（Batch 3，次要/非必須）** — `setAlias` 路徑存在性驗證。
   → **決定：選項 (a)，只修文件用詞，不改程式碼。** `scripts/lib/session-aliases.js` 不變動。

5. **AE-4（Batch 4）** — `skills/arc-evaluating/references/eval-schemas.md`。
   → **決定：選項 (a)，重寫使其對齊現行 schema，並補上 SKILL.md 的 reference 清單引用。** 與批次作者原推薦（刪除）相反 —— **範圍擴大**：實作者需要對照 comparison.json（compliance/robustness/generalization → 現行 score_a/score_b 0-1 加權 rubric 格式）與 evals.json（pressures/options/correct_option → 現行 eval_name/prompt/expected_output 格式）重新撰寫兩套 schema 說明，不是機械修正。

6. **B5-1（Batch 5）** — `docs/guide/skills-reference.md` 的 arc-implementing Phase 1 措辭同步時機。
   → **決定：選項 (a)，等 Batch 3（R3-1）定案後再同步。** Batch 5 執行時若 Batch 3 尚未合併，此子項應標記 blocked、跳過，不要獨立發明措辭。

7. **batch6-1（Batch 6）** — `test_minimal_toolkit_docs.py` 守門測試涵蓋範圍。
   → **決定：選項 (b)，同時擴充測試。** 與批次作者原推薦（僅修文件）相反 —— **範圍擴大**：實作者需在 test_minimal_toolkit_docs.py 新增斷言，確認 hooks/README.md 與 docs/guide/hooks-system.md 不再宣稱 inject-skills 注入完整 arc-using 內容，防止同類漂移未來重演。

8. **batch6-2（Batch 6）** — `hooks/session-tracker/README.md` 的「Session End」輸出範例。
   → **決定：選項 (b)，整段重寫以如實反映目前 end.js 輸出格式。** **範圍擴大**：實作前需先實際跑一次 end.js（或讀 formatShortMessage/formatTriggeredMessage 的實作）取得真實輸出格式作為範例依據，不能只憑猜測改寫。

9. **B7-1（Batch 7）** — arc-journaling 草稿工作流程指示是否需要行為 eval 前置。
   → **決定：選項 (B)，先以既有結構性 pytest 出貨，行為 eval 列為獨立後續追蹤項。**

---

**Batch 10 額外拉出的設計決策（非本次分支範圍，全數決定另開追蹤項）：**

10. **hooks/arc-guard/main.js 的 GIT_MERGE_RE 比對邏輯**（-C 形式攔不住、子字串誤擋無害指令）。
    → **決定：另開追蹤項，本次分支不處理。**

11. **skills/arc-using/SKILL.md 的路由缺口**（arc-managing-sessions、arc-researching、arc-writing-tasks 未列入路由表）。
    → **決定：另開追蹤項，本次分支不擴大路由範圍。**

12. **skills/arc-writing-skills/SKILL.md 字數超標**（3598 字，超出 Meta 類 <2500 字上限約 44%）。
    → **決定：另開追蹤項，本次分支不瘦身。**

13. **skills/arc-maintaining-obsidian/evals/evals.json 過時 eval**（2 個情境已被 vault-contract 封鎖設計取代）。
    → **決定：另開追蹤項，本次分支不重寫。**

（註：R3-1 雖然是 Decision Required 範例常引用的 id，但其本身只有 Stop Condition、沒有 Decision Required 段落——不要誤把它的 Stop Condition 當成決策點列入此清單。）

**追蹤項提醒**：第 10–13 項已決定延後，執行 Batch 10 時應在對應項目旁標註「pull-out, tracked separately — see item N above」，不要在合併時讓它們悄悄消失（呼應文末 Definition of Done 第 2 點）。
## Global Rules

以下規則對全部 10 個批次一體適用，任何批次的實作者都不得以「這個批次比較急」或「這只是文件」為由跳過：

**(a) 測試與 lint 綠燈是不可退讓的底線。** 每個批次完成後、進入下一個批次前，`npm test`（涵蓋全部 5 個 runner：`test:scripts`、`test:hooks`、`test:node`、`test:skills`、`test:observer-daemon`）與 `npm run lint` 都必須維持綠燈。純文件批次（如 Batch 5、Batch 6、Batch 7、Batch 9 的多數項目）也不例外——文件變更不應該讓測試變紅，若真的變紅，代表某處测试其實依賴了被改動的文字內容，需要如實回報而非強行讓測試遷就新文字。

**(b) 全域停止條件（GLOBAL STOP CONDITION）。** 若任何一個批次的變更，導致**該批次未觸碰的檔案**所對應的測試失敗——立即停止**全部**批次的工作（不只是當下這個批次），向使用者回報以進行根因調查，調查釐清前不得繼續處理任何其他批次。這是本 repo「escalate-when-stuck」紀律（CLAUDE.md 第 5 節）在多批次情境下的延伸：跨批次的意外測試失敗，代表某個批次的改動觸及了未被辨識出的隱藏耦合，在查清之前繼續往下做，只會讓根因調查的範圍越滾越大。各批次自身內文列出的細粒度 Stop Condition（例如「若 grep 發現遺漏的消費者」「若前提假設不成立」）依然有效、需並行遵守——它們是這條全域規則之外，額外針對特定 finding 的更早期煞車點。

**(c) 未經使用者明確要求，不得提交 commit。** 每個批次的 Fix 只到「工作目錄產生正確 diff」為止；除非使用者明確指示要 commit（且遵循本 repo `.claude/rules/git-workflow.md` 的 Conventional Commits 格式與 pre-commit checklist），否則不主動執行 `git commit`。

**(d) 禁止範圍蔓延（no scope creep）。** 每一行被改動的程式碼或文件，都必須能追溯回某個具體的 finding id（例如 B1-3、AE-2、batch6-3）。不得順手「順便改善」鄰近程式碼、不得重新格式化未變更的段落、不得修復未在批次中被點名的其他過期描述——即使實作過程中順手發現了新的落差（如 Batch 1、Batch 6、Batch 9 部分項目中「調查中發現、非原始 audit 條目點名」的附帶修正），也只能在該批次已明確載明、且有獨立驗收標準的範圍內處理，不能自行擴大到未載明的相鄰問題；發現任何範圍外的新問題，應如實記錄、留給後續獨立項目，而不是趁勢一併動手。

## Execution Order

建議的跨批次執行順序如下，原則是：先做風險最高、範圍最窄的真程式碼 bug；再做可能牽動決策的機械清理；讓「內容權威來源」批次（Batch 3）先於引用它的批次（Batch 5、Batch 6）完成；最後才跑 Batch 10，因為 Batch 10 是「回頭重掃全庫」的低嚴重度潤飾批次，與多個先前批次在同一份檔案上有**逐字重複**的修正項——排在最後可以讓它在套用修正前先確認「這處是否已被前面批次修好」，避免重複改動或衝突 patch。

**1. Batch 2（優先，可與 Batch 7 平行）**
Batch 2 是本輪唯一的真程式碼功能缺陷（TS-1：`tsc` 在無祖先 tsconfig 時靜默假通過），批次自身標記為最高優先；DOC-1 為純文件修正、與其他批次完全無檔案重疊。兩項在 Batch 2 內部彼此獨立，可同時處理。

**2. Batch 1（機械式刪除，B1-9 子項需等待決策）**
Batch 1 絕大多數項目（B1-1 至 B1-8）是零依賴的死檔/死程式碼刪除，可直接執行；只有 **B1-9**（`agents/debugger.md`/`planner.md`）需要等待上方「Decisions Needed」第 1 項裁定後才能動手，裁定前這一子項應標記為 blocked、不影響其餘子項。Batch 1 也會動到 `README.md`（B1-9 選項 A/C 涉及第 195/199/204 行）——與 Batch 3（R3-1 動到 README 第 60/150 行）是同一份檔案的不同區塊，建議 Batch 1 先完成、Batch 3 再疊上去，避免兩個批次同時對同一檔案送出衝突 diff。

**3. Batch 3（優先於 Batch 5、Batch 6）**
Batch 3 是本輪唯二「內容必須先定案、才能讓下游批次引用」的批次之一：
- **R3-1**（`arc-implementing` Phase 1 措辭修正）的最終結果，是 Batch 5（B5-1）第 4 點「Phase 1 措辭對齊」的唯一依據——Batch 5 明確聲明「不要獨立發明新措辭」，必須等 R3-1 定案。
- **R3-3**（`arc-managing-sessions/SKILL.md` Storage Layout 的 diary 路徑修正）與 Batch 6 的 **batch6-4** 是**逐字相同的修正**（同一檔案、同一段落、同一段替換文字）。兩者只需套用一次；建議由 Batch 3 先套用，Batch 6 執行到 batch6-4 時改為「驗證性 no-op」（跑一次 Acceptance Criteria 確認已符合，不重複編輯）。
- R3-2（session alias 文件修正）也觸及 `arc-managing-sessions/SKILL.md` 的 argument-hint 附近文字，與 Batch 10 機械項目 #9（新增 `handover` 至 argument-hint）同一份 frontmatter 欄位，建議 Batch 3 先完成，Batch 10 疊加。

**4. Batch 4 / Batch 8 / Batch 9（三者互相獨立，可平行）**
三者分別只動 `skills/arc-evaluating/references/*.md` + `SKILL.md`、`skills/arc-writing-skills/SKILL.md`（平台路徑表格，第 98-105 行）、`skills/arc-learning/SKILL.md`（第 33 行）——彼此無檔案重疊，可平行處理。但 Batch 8 與 Batch 9 觸及的檔案，之後在 Batch 10 機械項目 #17（`arc-writing-skills` 第 354-355 行 render-graphs 範例）與 #8（`arc-learning` 第 67/69 行）會被同一批次再次編輯（不同行、無內容重疊）——建議此三批次完成後才進入 Batch 10，以免 Batch 10 對照到尚未套用的舊文字。

**5. Batch 6（在 Batch 3 之後）**
Batch 6 大量觸及 `hooks/README.md`、`docs/guide/hooks-system.md`、`hooks/session-tracker/README.md` 等文件，其中 batch6-4 依賴 Batch 3 的 R3-3 已完成（見上）。

**6. Batch 5（在 Batch 3、Batch 6 之後）**
B5-1 依賴 Batch 3 的 R3-1 定案（Decisions Needed 第 6 項）；B5-2 修正 `docs/guide/hooks-system.md` 的 Registered Hooks 表格（新增 4 個 hook 列），與 Batch 6 的 batch6-1（同一檔案第 213 行 inject-skills 描述修正）屬同一份表格的不同列——建議 Batch 6 先落地，Batch 5 再疊加新增列，避免兩批次對同一張表格的 diff 互相打架。

**7. Batch 7（可隨時平行，此處排在後段僅為文件敘事順序）**
`skills/arc-journaling/SKILL.md` 是本輪唯一與其他 9 個批次完全無檔案重疊的修改對象，實務上可在任何時間點獨立處理；排在這裡只是為了讓文件的執行順序敘述保持線性。B7-1 決策（Decisions Needed 第 9 項）需先裁定。

**8. Batch 10（務必最後執行）**
Batch 10 是回頭重掃全庫的低嚴重度整批潤飾，其中至少 3 處與前面批次的修正**逐字重複**：
- 機械項目 **#31**（`hooks/session-tracker/session.json.template` 刪除 + `hooks/README.md` 第 42 行）≡ **B1-5**（Batch 1）。
- 機械項目 **#32** 前半（`docs/guide/skills-reference.md` 「33 skills → 32」）≡ **B5-1**（Batch 5）第 1 點技能總數修正。
- （已在上方第 3 點提及）batch6-4 ≡ R3-3。
排在最後，可以讓 Batch 10 實作者在套用這幾筆修正前，先用其驗收指令確認「是否已被前面批次修好」，已修好則跳過、避免重複 commit 同一處變更；同時 Batch 10 對 `README.md`、`arc-writing-skills/SKILL.md`、`arc-learning/SKILL.md`、`arc-managing-sessions/SKILL.md` 等檔案的其餘（非重複）修正，也需要等前面批次先落地，才能正確核對行號與現況再下手。Batch 10 內部標記為「不予處理（Skip）」與「需設計決策（Pull-out）」的項目，不在本次執行順序內處理，前者維持現狀、後者移交 Decisions Needed 清單第 10–13 項另行排程。

---

## Batch 1 — Privacy & dead-file removal (mechanical deletions)

Now I have all details confirmed. Here is the remediation plan.

---

### B1-1: arc-diagramming-obsidian 內殘留的開發階段 session log（含個資）

- **Files**:
  - `skills/arc-diagramming-obsidian/references/.claude/logs/lightweight/.state.json`（刪除）
  - `skills/arc-diagramming-obsidian/references/.claude/logs/lightweight/_schema.json`（刪除）
  - `.gitignore`（補一條 anchored 規則，防止再次被追蹤）

- **Problem**: 這兩個檔案是貢獻者本機 Claude Code session 的殘留紀錄，內含本機 transcript 絕對路徑（`/Users/gregho/...`）、使用者中文 prompt 原文、token/成本統計與 model 名稱。它們被 git 追蹤，且因 marketplace 安裝是以 `./`（repo 相對路徑，`.claude-plugin/marketplace.json` 的 `source: "./"`）直接載入整個 git 追蹤樹，package.json 的 `files` 陣列（含 `skills/`）不足以阻擋它們隨插件出貨——會誤導使用者以為這是 skill 的一部分，同時洩漏貢獻者的本機路徑與對話內容。

- **Fix**:
  1. `git rm skills/arc-diagramming-obsidian/references/.claude/logs/lightweight/.state.json skills/arc-diagramming-obsidian/references/.claude/logs/lightweight/_schema.json`
  2. 同目錄下其餘 34 個 `*.log` 檔案未被 git 追蹤（已由 repo 既有的全域 `*.log` 規則正確忽略），不需處理。
  3. 根因：`.gitignore` 第 10 行 `.claude/logs/` 因含中間 slash 而是 root-anchored，只匹配 repo 根目錄的 `.claude/logs/`，不會匹配巢狀路徑 `skills/arc-diagramming-obsidian/references/.claude/logs/`——這正是這兩個檔案當初能被追蹤的原因。在 `.gitignore` 第 10 行後新增一行 `skills/**/.claude/logs/`（**不要**用全域 `**/.claude/logs/`，因為 `tests/integration/claude-code/.claude/logs/lightweight/.state.json` 是刻意保留的測試 fixture，不在本次清理範圍內，全域規則會不必要地牽連它）。

- **Acceptance Criteria**:
  1. `git ls-files skills/arc-diagramming-obsidian/references/.claude/logs/` → 空輸出。
  2. `grep -rn "logs/lightweight\|\.state\.json\|_schema\.json" --include="*.md" --include="*.js" --include="*.json" skills/arc-diagramming-obsidian/ 2>/dev/null` → 空輸出（確認無死引用殘留）。
  3. 驗證 gitignore 修好根因：`touch skills/arc-diagramming-obsidian/references/.claude/logs/lightweight/.state.json && git status --short skills/arc-diagramming-obsidian/references/.claude/logs/` → 應無輸出（被忽略）；`git check-ignore -v skills/arc-diagramming-obsidian/references/.claude/logs/lightweight/.state.json` → 應印出符合的 pattern；完成驗證後 `rm` 掉這個測試用的臨時檔。
  4. `npm run test:skills` → 全綠（確認沒有 pytest 依賴這個目錄的存在或內容）。

- **Stop Condition**: 若 `npm run test:skills` 因為這兩個檔案消失而失敗（代表有測試依賴這個目錄結構或內容存在），停下來查清楚是哪個測試、為何依賴開發期殘留物，不要為了讓測試通過而回復這些檔案。

---

### B1-2: arc-verifying/baseline-test.md 出貨面死檔 + 失效引用

- **Files**:
  - `skills/arc-verifying/baseline-test.md`（移動或刪除，二擇一，見下）
  - 若選擇移動：新增 `evals/workspaces/arc-verifying/baseline-test.md`

- **Problem**: `skills/arc-verifying/baseline-test.md` 是 RED 階段的貢獻者基線觀察紀錄，全 repo 無任何程式或文件引用它，卻隨 `package.json` 的 `files: ["skills/", ...]` 出貨給終端使用者，讓人誤以為這是 arc-verifying skill 的一部分。檔案第 29 行引用的 `review-model-spec.md`（`From review-model-spec.md Section 3`）在整個 repo（含子目錄搜尋）中不存在，是死檔內的失效引用。

- **Fix**: repo 已有兩種先例、目的略有不同，本項不強行二選一——依「最小改動、忠實保留 RED 證據」原則預設走 (a)，但 (b) 同樣可接受：
  - **(a) 移動（預設建議）**：`git mv skills/arc-verifying/baseline-test.md evals/workspaces/arc-verifying/baseline-test.md`，比照 `evals/workspaces/arc-dispatching-teammates/baseline-test.md` 的逐字保留先例（`docs/plans/2026-06-11-...md:159` 描述的同類手法）。移動時順手拿掉第 29 行對不存在的 `review-model-spec.md` 的引用（改成如「Classic Rationalizations to Block」小節不再溯源到外部檔案，或直接改為「(rationalizations observed during RED baseline)」）。
  - **(b) 直接刪除**：若維護者認為這份 2026-01-17 的 RED 觀察紀錄已無保留價值，`git rm skills/arc-verifying/baseline-test.md` 即可，同樣連帶消除死引用。
  - 不建議轉成 `tests/skills/pressure/` 格式：該目錄是「Scenario/RED/GREEN」結構化、可重跑的迴歸 fixture 格式，需要改寫內容才能套用，屬於超出「機械式清理」範圍的額外工作。

- **Acceptance Criteria**:
  1. `git ls-files skills/arc-verifying/baseline-test.md` → 空輸出。
  2. `grep -rn "baseline-test" skills/arc-verifying/ 2>/dev/null` → 空輸出。
  3. `find . -iname "*review-model-spec*" -not -path "*/node_modules/*" -not -path "*/.git/*"` → 空輸出（確認移動/刪除後死引用未被複製到新位置，或已在移動時一併修掉）。
  4. `npm run test:skills` → 全綠。

- **Stop Condition**: 若選擇 (a) 移動，且移動後發現有測試以相對路徑引用 `skills/arc-verifying/baseline-test.md`（目前 grep 未查到任何），停下來改測試路徑前先確認測試的原始意圖，不要盲目改路徑掩蓋失敗。

---

### B1-3: scripts/lib/evolve.js 出貨面死重（三型演化引擎，已被 dashboard Evolve 取代）

- **Files**:
  - `scripts/lib/evolve.js`（361 行，刪除）
  - `tests/scripts/evolve.test.js`（刪除，因為其唯一測試對象即將消失）

- **Problem**: `scripts/lib/evolve.js` 匯出 `classifyCluster`、`generateSkill`、`recordEvolution` 等 9 個函式，是 curator 改版前「三型演化引擎」的舊實作。現行 dashboard 的 `[Evolve]` 動作已在 `scripts/lib/learning-dashboard.js` 自行實作（產生 `cand_evolved_*` 記錄），`skills/arc-observing/scripts/instinct.js` 的 `cmdEvolve` 也是獨立實作、未 require 此模組。全 repo（`scripts/`、`hooks/`、`skills/`、`templates/`、`agents/`、`docs/guide/`、`.claude-plugin/`、`cli.js`）重新用 fresh grep 確認過，除了 `tests/scripts/evolve.test.js` 外沒有任何 require 這個檔案。`package.json` 的 `files` 含 `scripts/`，這 361 行連同 9 個死匯出隨插件出貨。

- **Fix**: `git rm scripts/lib/evolve.js tests/scripts/evolve.test.js`。不動 `CHANGELOG.md`（第 579、581、582、584 行提到此檔為歷史紀錄，不應改寫）。

- **Acceptance Criteria**:
  1. `git ls-files scripts/lib/evolve.js tests/scripts/evolve.test.js` → 空輸出。
  2. `grep -rn "lib/evolve\|require(.*['\"].*evolve['\"])" scripts/ hooks/ skills/ templates/ agents/ docs/guide/ .claude-plugin/ 2>/dev/null` → 空輸出（刻意排除 `CHANGELOG.md` 與 `docs/plans/`，那是歷史紀錄不是活的消費者）。
  3. `scripts/cli.js` 指令表不含 `evolve`：`grep -n "evolve" scripts/cli.js` → 空輸出（刪除前後皆應為空，確認 CLI 從未掛載它）。
  4. `npm run test:scripts` → 通過，且 jest 的 `coverageThreshold`（`scripts/lib/**/*.js` 行覆蓋率 ≥80%）不因此檔消失而跌破門檻（該檔刪除前完全由自己的測試覆蓋，屬覆蓋率中性變動）。
  5. `npm test` → 5 個 runner 全綠。

- **Stop Condition**: 若步驟 2 的 grep 在 `scripts/`、`hooks/`、`skills/`、`templates/`、`agents/`、`docs/guide/`、`.claude-plugin/` 任一路徑下發現稽核者遺漏的真實消費者，停止刪除，改記錄「keep, no action」並附上該消費者的檔案路徑與行號。

---

### B1-4: scripts/lib/compaction-analysis.js 出貨面死重（僅測試使用的 ICL-12 分析器）

- **Files**:
  - `scripts/lib/compaction-analysis.js`（226 行，刪除）
  - `tests/scripts/compaction-analysis.test.js`（刪除）

- **Problem**: `scripts/lib/compaction-analysis.js` 是 ICL-12 的 compaction 分析器（`analyzeCompactions`、`loadSessions`、`pairSession` 等），檔尾雖有 `require.main === module` 的 ad-hoc CLI（第 224–226 行），但 `scripts/cli.js` 指令表、`hooks/`、`skills/`、`docs/guide/` 均無任何調用或文件指引使用者如何觸發它。重新以 fresh grep 確認過，全 repo 除了 `tests/scripts/compaction-analysis.test.js` 外沒有任何 require 這個檔案，只有 `CHANGELOG.md:74` 與 `docs/plans/2026-06-11-...md:369` 提及（皆為歷史紀錄）。這是使用者路徑完全不可達、只有貢獻者分析工具身份的死重。

- **Fix**: `git rm scripts/lib/compaction-analysis.js tests/scripts/compaction-analysis.test.js`。不動 `CHANGELOG.md` 與 `docs/plans/2026-06-11-capability-seam-fix-implementation-plan.md`。

- **Acceptance Criteria**:
  1. `git ls-files scripts/lib/compaction-analysis.js tests/scripts/compaction-analysis.test.js` → 空輸出。
  2. `grep -rn "compaction-analysis" scripts/ hooks/ skills/ templates/ agents/ docs/guide/ .claude-plugin/ 2>/dev/null` → 空輸出（同樣排除 `CHANGELOG.md`、`docs/plans/`）。
  3. `grep -n "compaction" scripts/cli.js` → 空輸出（確認 CLI 從未掛載此分析器）。
  4. `npm run test:scripts` → 通過，`coverageThreshold` 不跌破 80%（同 B1-3 理由，屬覆蓋率中性變動）。
  5. `npm test` → 5 個 runner 全綠。

- **Stop Condition**: 若步驟 2 發現稽核者遺漏的真實消費者，停止刪除，改記錄「keep, no action」並附上該消費者位置。

---

### B1-5: hooks/session-tracker/session.json.template 出貨面死檔

- **Files**:
  - `hooks/session-tracker/session.json.template`（刪除）
  - `hooks/README.md`（第 42 行的目錄樹項目一併移除）

- **Problem**: `session.json.template` 沒有被任何程式讀取——`start.js` 第 51-60 行與 `end.js` 第 47-56 行都是在程式內 inline 建構出與此模板結構完全相同的 session 物件（`sessionId`/`project`/`date`/`started`/`lastUpdated`/`toolCalls`/`filesModified`/`compactions`），完全不讀取此檔。唯一引用是 `hooks/README.md` 目錄樹裡的一行列表。`package.json` 的 `files` 含 `hooks/`，此檔隨插件出貨對使用者是純粹死重量。

- **Fix**:
  1. `git rm hooks/session-tracker/session.json.template`
  2. 編輯 `hooks/README.md`：刪除第 42 行 `│   ├── session.json.template`（目錄樹中緊接在 `end.js` 之後、`README.md` 之前的那一行）。

- **Acceptance Criteria**:
  1. `git ls-files hooks/session-tracker/session.json.template` → 空輸出。
  2. `grep -rn "session.json.template" . --include="*.md" --include="*.js" --include="*.json" 2>/dev/null | grep -v node_modules` → 空輸出。
  3. `cd hooks && npm test` → 全綠（`start.js`/`end.js` 的測試從不依賴此模板檔案存在）。

- **Stop Condition**: 若步驟 2 的 grep 在 `hooks/README.md` 之外發現其他引用（目前確認沒有），停下來查清楚該引用的用途再決定是否刪除。

---

### B1-6: hooks/quality-check/prettier.js 的 checkPrettier 死程式碼

- **Files**:
  - `hooks/quality-check/prettier.js`

- **Problem**: `checkPrettier()`（`--check` 模式、不寫入）定義並匯出在 `hooks/quality-check/prettier.js`，但 `hooks/quality-check/main.js` 只呼叫 `runPrettier`（第 33、81 行），全 repo 沒有任何地方（含 `hooks/__tests__/`）引用 `checkPrettier`。這是出貨面（`package.json` 的 `files` 含 `hooks/`）中的死程式碼，讓讀者誤以為存在一個「檢查但不寫入」的呼叫路徑。

- **Fix**: 刪除 `checkPrettier` 函式本體（第 40–64 行）；`module.exports`（第 66–69 行）從
  ```js
  module.exports = {
    runPrettier,
    checkPrettier,
  };
  ```
  改為
  ```js
  module.exports = {
    runPrettier,
  };
  ```

- **Acceptance Criteria**:
  1. `grep -rn "checkPrettier" . --include="*.js" 2>/dev/null | grep -v node_modules` → 空輸出。
  2. `cd hooks && npm test` → 全綠（無任何測試引用 `checkPrettier`，故無測試連帶失敗）。
  3. `node -e "console.log(Object.keys(require('./hooks/quality-check/prettier.js')))"` → 輸出僅 `[ 'runPrettier' ]`。

- **Stop Condition**: 若步驟 1 的 grep 意外在 `hooks/__tests__/` 或其他地方發現引用（目前確認沒有），停下來，不要刪除有呼叫者的函式。

---

### B1-7: hooks/observe/main.js 的 MAX_OUTPUT_LENGTH 死常數

- **Files**:
  - `hooks/observe/main.js`
  - `hooks/__tests__/observe.test.js`

- **Problem**: `MAX_OUTPUT_LENGTH`（`main.js` 第 40 行定義、第 491 行匯出）在 hook 的實際執行邏輯中完全未使用——PostToolUse 階段（第 445-453 行附近）只記錄 `outcome` 與 `output_bytes`，不再儲存或截斷 response 內容；輸入截斷只用 `MAX_INPUT_LENGTH`（第 200 行）。全 repo 唯一引用是 `hooks/__tests__/observe.test.js` 第 178-182 行，而且該測試只是把它當一個「長度上限」參數傳給 `scripts/lib/sanitize-observation` 的 `sanitizeObservationPayload`，並非測試 hook 本身讀取/截斷 output 的行為。這是舊版「儲存 output 並截斷」設計的遺跡，讓讀者誤以為 hook 仍會處理/截斷工具輸出內容。

- **Fix**:
  1. `hooks/observe/main.js`：刪除第 40 行 `const MAX_OUTPUT_LENGTH = 5000;`；從第 490-491 行的 `module.exports` 移除 `MAX_OUTPUT_LENGTH,` 這一行（保留 `MAX_INPUT_LENGTH,` 不動，它在第 200 行仍被使用）。
  2. `hooks/__tests__/observe.test.js` 第 178 行：把
     ```js
     const { MAX_OUTPUT_LENGTH } = require('../observe/main');
     ```
     改成一個測試本地字面量常數，不再向 `main.js` 借用已刪除的匯出，例如：
     ```js
     const MAX_OUTPUT_LENGTH = 5000; // sanitizeObservationPayload's cap is generic (not observe-specific); matches main.js's MAX_INPUT_LENGTH value
     ```
     其餘第 179-182 行（`huge`、`sanitizeObservationPayload(huge, MAX_OUTPUT_LENGTH)`、兩個 `assert.ok`）保持原樣，因為它們引用的是這個測試本地變數名，語意不變。

- **Acceptance Criteria**:
  1. `grep -rn "MAX_OUTPUT_LENGTH" hooks/ scripts/ skills/ docs/ .claude-plugin/ 2>/dev/null` → 只應剩下 `hooks/__tests__/observe.test.js` 裡的本地字面量宣告與其 3 處使用，`hooks/observe/main.js` 內 0 hit。
  2. `cd hooks && npm test` → 全綠，特別是 `observe.test.js` 裡 `'caps sanitized payload length at the configured maximum'` 這條測試仍通過。
  3. `node -e "console.log(Object.keys(require('./hooks/observe/main.js')))"` → 不含 `MAX_OUTPUT_LENGTH`。

- **Stop Condition**: 若把測試常數字面量化之後，`sanitizeObservationPayload` 對相同長度值的截斷行為與用 `MAX_INPUT_LENGTH`（同為 5000）驗證出的行為不一致，停下來，先查清楚 `sanitizeObservationPayload` 的截斷契約是否真的與呼叫端命名無關，不要為了讓測試通過而調整字面量的值。

---

### B1-8: hooks/user-message-counter/main.js 的測試專用匯出死重

- **Files**:
  - `hooks/user-message-counter/main.js`
  - `hooks/user-message-counter/README.md`
  - `hooks/__tests__/user-message-counter.test.js`

- **Problem**: `main.js` 匯出的 `readCount`/`writeCount`/`resetCounter`/`getCounterFilePath`（第 47-52 行）只有 `hooks/__tests__/user-message-counter.test.js` 在用；生產程式碼沒有任何地方 require 這個模組。實際的讀取與重置是 `scripts/lib/diary-capture.js` 直接用 `createSessionCounter('user-count')` 完成（`diary-capture.js:44, 53`），完全不經過這些 wrapper。`hooks/user-message-counter/README.md` 第 58 行自己也承認「These thin wrappers ... exist for tests」。這四個匯出隨插件出貨（`package.json` 的 `files` 含 `hooks/`），對使用者是純測試用的死重量。

- **Fix**:
  1. `hooks/user-message-counter/main.js`：刪除第 46-52 行（含註解 `// Export for use by session-tracker` 及整個 `module.exports` 區塊），該檔案改為只在 `require.main === module` 時執行 `main()`、不再匯出任何東西。
  2. `hooks/user-message-counter/README.md`：刪除第 51-59 行的「## Exported Functions」整節（含程式碼區塊與其下方「These thin wrappers ... exist for tests」的說明句），因為匯出已不存在；上方「Counter-Ownership Contract」一節已正確描述 `diary-capture.js` 是唯一讀取/重置路徑，不需再改動。
  3. `hooks/__tests__/user-message-counter.test.js`：這個測試檔案的四個測試案例（`should initialize with count 0`、`should increment count`、`should reset counter`、`should use separate counter file from tool counter`）以及 `counter independence` 區塊的 `should not conflict with compact-suggester counter`，其覆蓋內容已分別存在於：
     - `hooks/__tests__/utils.test.js` 的 `describe('createSessionCounter', ...)`（第 276 行起）——涵蓋 init-0、write/read、reset、session-scoped 檔名命名、不同 counter 名稱互相獨立，是同一機制的通用版本測試。
     - `tests/scripts/diary-capture.test.js` 的 `readCounts`/`resetCounters` 測試——涵蓋生產路徑的讀取/重置行為。
     建議直接 `git rm hooks/__tests__/user-message-counter.test.js`（不留殘檔，因為它存在的唯一理由就是驗證即將刪除的四個 wrapper）。若維護者想保留「user-message-counter 與 compact-suggester 兩個 hook 模組的 counter 檔名不互相衝突」這條整合層級斷言，替代做法是把該測試改寫成直接 `require('../../scripts/lib/utils').createSessionCounter('user-count')` 取得 counter 物件（呼叫 `.read()`/`.write()`/`.reset()`/`.getFilePath()`），而非刪除整檔——兩種做法皆可接受，取捨留給維護者。

- **Acceptance Criteria**:
  1. `grep -n "module.exports" hooks/user-message-counter/main.js` → 空輸出（檔案不再有任何匯出）。
  2. `grep -rn "readCount\|writeCount\|resetCounter\|getCounterFilePath" hooks/user-message-counter/` → 空輸出。
  3. `cd hooks && npm test` → 全綠。
  4. 覆蓋率沒有靜默流失的佐證：`grep -n "describe('createSessionCounter'" hooks/__tests__/utils.test.js` 與 `grep -n "readCounts\|resetCounters" tests/scripts/diary-capture.test.js` 兩者皆應回傳非空輸出（證明本項刪除依賴的替代覆蓋確實存在）。

- **Stop Condition**: 若 `hooks/__tests__/utils.test.js` 的 `createSessionCounter` 測試其實沒有涵蓋「兩個不同 hook 模組共用同一個 counter 工廠、檔名不衝突」這個場景（只測了單一模組內的獨立性），停下來——這代表刪除 `should not conflict with compact-suggester counter` 這條測試會真的流失覆蓋，應改寫保留而非直接刪除整個測試檔。

---

### B1-9（Decision Required）: agents/debugger.md 與 agents/planner.md — 刪除 vs. 補接線 vs. 只修正 README 宣稱

- **Files**: `agents/debugger.md`、`agents/planner.md`、`README.md`（第 195、199、204 行）、`skills/arc-debugging/SKILL.md`、`skills/arc-planning/SKILL.md`、`skills/arc-brainstorming/SKILL.md`（視所選選項而定）

- **Problem**: `README.md` 第 195 行宣稱「Skills delegate focused work to 11 specialized subagents ... the parenthesized skill dispatches them」，並在第 199 行把 `planner` 標註為由 `(arc-planning, arc-brainstorming)` 分派、第 204 行把 `debugger` 標註為由 `(arc-debugging)` 分派。但實際上：
  - 全 repo 用 `subagent_type` 做真實 Task/Agent 分派的地方只有 `skills/arc-dispatching-teammates/SKILL.md` 與其 `references/acceptance-and-retry.md`，且只分派 `arcforge:spec-reviewer` 與 `arcforge:verifier`，從未分派 `arcforge:debugger` 或 `arcforge:planner`。
  - `skills/arc-debugging/SKILL.md`（296 行）全文沒有 `Task` 或 `subagent` 字樣，自己內嵌完整的除錯流程，未委派給 `debugger` agent。
  - `skills/arc-planning/SKILL.md` 裡出現的「planner」字樣全部指向 `skills/arc-planning/scripts/planner.js`（一支排程/DAG 產生腳本），與 `agents/planner.md` 這個 subagent 無關，是命名巧合。
  - `skills/arc-brainstorming/SKILL.md` 全文沒有 `Task`、`subagent`、`planner` 字樣。
  - 先前一輪整治（`docs/plans/2026-06-11-capability-seam-fix-implementation-plan.md` 的 RV-8）已經把 `skills/arc-agent-driven/SKILL.md`「Available Agents」表裡的 `planner`/`debugger`/`verifier` 三列刪掉、但明確保留了 `agents/*.md` 檔案本體（「agents/*.md 保留」），代表當時已經做過一次「表格宣稱 vs. 檔案留存」的取捨判斷，但沒有觸及 `README.md` 自己那張表——這張表現在是全 repo 唯一還在宣稱 debugger/planner 有被分派的地方。
  - `verifier`（由 arc-dispatching-teammates 實際使用）與 `code-reviewer` 在 README 同一張表也有類似的「skill 分派」宣稱，但那兩個是真的（或至少 verifier 是真的），不在本項範圍內——本項只處理 `debugger`/`planner` 兩列。

- **這不是機械式清理，取捨留給使用者決定，以下列出三個選項與各自證據**：

  **選項 A：刪除 `agents/debugger.md` 與 `agents/planner.md`（視為死重）**
  - 支持證據：全 repo 沒有任何 SKILL.md 用 `subagent_type` 分派這兩者；RV-8 已示範過「發現宣稱與實際不符時，傾向修表格」的處理慣例，但那次是保留檔案只刪表格列，這次若判斷連檔案本體都無人問津、無直接呼叫入口文件化，可以走得更徹底；沒有任何測試（含 `tests/skills/test_eval_agents_contract.py`，該測試只覆蓋 `skills/arc-evaluating/agents/` 底下的 `eval-grader.md`/`eval-analyzer.md`，與這兩個檔案無關）會因刪除而失敗。
  - 反對證據：Claude Code 的 agent 是依慣例自動載入的（`agents/` 目錄本身就是 shipped 元件，見 `.claude/rules/plugin.md`「Component path fields」與「Directory Layout」），使用者理論上可以不經任何 SKILL.md、直接手動 `Task(subagent_type='arcforge:debugger')` 呼叫——這是一個獨立的、已完整撰寫（4-phase 方法論、報告格式齊全）的能力面，刪除等於直接拿掉一個可用功能，而非單純清死碼。

  **選項 B：讓 `arc-debugging`/`arc-planning`（及/或 `arc-brainstorming`）真的委派給這兩個 agent，比照 `arc-dispatching-teammates` 用 `subagent_type=` 分派的既有寫法**
  - 支持證據：分派模式在 repo 內有現成範本可循（`Agent(subagent_type='arcforge:spec-reviewer')` / `Agent(subagent_type='arcforge:verifier')`）；`agents/debugger.md` 的 4-phase 方法論與 `agents/planner.md` 的三階段規劃+報告格式寫得非常完整、針對性強，讀起來像是當初就是為了支撐這兩個 skill 而寫、只是接線工作沒做完；`README.md` 現在的宣稱本來就假設這個分派存在，把它做成真的等於讓文件與行為一致。
  - 反對證據：這是對兩個現行、常用 discipline skill 的行為變更，不是機械清理——需要設計決策（`arc-debugging` 什麼情況該分派給 subagent、什麼情況該在主 context 內處理？完整 4-phase 流程搬進 subagent 還是只在卡關時才呼叫？）；`skills/arc-planning/SKILL.md` 本質是 DAG 產生工作流程，不是自由規劃的架構師角色，把 `agents/planner.md` 接上去語意上是否貼合需要重新確認；照 arcforge 慣例（arc-writing-skills 的 Iron Law）任何 skill 行為變更都該先有 RED/GREEN eval 佐證，工作量遠超本批次「機械式清理」的範疇。

  **選項 C：只修正 README 的宣稱，不刪檔也不改 skill 行為**
  - 支持證據：風險最低，直接對症「宣稱與事實不符、誤導讀者」這個具體問題，不動任何 skill 行為或刪除已出貨的能力；與 RV-8 的處理精神一致（「宣稱不實 → 修宣稱，留檔案」），只是把同一手法套用到目前唯一還沒修的殘留宣稱（README 表格）上。把第 199 行的 `(arc-planning, arc-brainstorming)`、第 204 行的 `(arc-debugging)` 拿掉，或把第 195 行「Skills delegate focused work to ... the parenthesized skill dispatches them」改寫成不預設每一列都有 skill 分派（例如註明部分 agent 可獨立手動呼叫）。
  - 反對證據：兩個未被使用、也沒有任何文件說明「如何/為何直接呼叫」的 agent 定義會繼續無限期隨插件出貨，本質上只是把「這兩個檔案到底是死重還是缺功能」的問題延後，沒有真正解決。

- **Acceptance Criteria**（僅適用於「選項已被選定之後」的驗證，本項本身不驗收，因為尚未決定走哪個選項）：
  1. 若選 A：`git ls-files agents/debugger.md agents/planner.md` → 空輸出；`grep -n "\`planner\`\|\`debugger\`" README.md` → 空輸出；README 第 195 行的「11 specialized subagents」改為「9 specialized subagents」（或依實際剩餘列數調整）；`npm test` 全綠。
  2. 若選 B：`grep -n "subagent_type='arcforge:debugger'" skills/arc-debugging/SKILL.md` 與 `grep -n "subagent_type='arcforge:planner'" skills/arc-planning/SKILL.md`（或 `arc-brainstorming/SKILL.md`）→ 至少各一筆命中；新增或更新對應 eval（`evals/scenarios/` 或 `evals/workspaces/`）佐證行為改變；`npm test` 全綠。
  3. 若選 C：`grep -n "arc-planning, arc-brainstorming\|arc-debugging" README.md` 附近的 `planner`/`debugger` 兩列文字已更新為不宣稱分派；`npm test` 全綠（本選項不觸及任何測試邏輯）。

- **Stop Condition**: 不要在沒有使用者明確選定 A/B/C 之一的情況下逕自刪除 `agents/debugger.md`/`agents/planner.md` 或改寫 `arc-debugging`/`arc-planning`/`arc-brainstorming` 的行為——這是產品範疇決策，機械式清理批次不應該替使用者做這個選擇。

---

## Batch 2 — Functional bug fixes (real defects, highest priority)

### TS-1: `hooks/quality-check/typescript.js` — 型別檢查在無祖先 tsconfig 時靜默失效

**Files**: `hooks/quality-check/typescript.js`, `hooks/__tests__/quality-check.test.js`, `hooks/quality-check/README.md`

**Problem**:
`runTypeCheck` 從未把被編輯的檔案路徑傳給 `tsc` 的 argv。`buildTscArgs` 只在 `tsconfigPath` 非 null 時加入 `--project <path>`;若 `findUpwards('tsconfig.json', fileDir)` 從檔案目錄往上找不到任何 `tsconfig.json`(例如 monorepo 中 tsconfig 只放在子套件目錄,被編輯的 `.ts` 檔案位於其上層),`tsc` 會在完全沒有輸入檔案的情況下執行,只印出 usage 說明文字並以 exit code 1 結束。已用真實 `tsc`(6.0.2)重現:對一個含真實型別錯誤(`const x: number = "this is not a number"`)、且祖先目錄鏈中無任何 `tsconfig.json` 的檔案執行 `runTypeCheck(file, 'npm', { execCommand: 'tsc' })`,回傳 `{ errors: [], warnings: [] }`——此輸出既不含 `incremental` 字樣(不會觸發 `isIncrementalFlagRejected` 退避重試),也不符合 `file(line,col): error TSxxxx:` 格式(`errorRegex` 比對不到),對呼叫者與最終看到 PostToolUse 回饋的模型而言,這與「型別檢查通過」完全無法區分。直接牴觸 `hooks/quality-check/README.md` 第 30 行「type-checking is never silently dropped — only the speedup」的宣稱。程式碼自身的註解(`buildTscArgs` 對 `--incremental`/`--tsBuildInfoFile` 的「single-file mode」說明,以及 `buildInfoPathFor(tsconfigPath || fileDir)` 的 fallback key)顯示作者原本就預期有這個 fallback 分支,只是忘了真的把檔案路徑塞進 argv——這是一處實作遺漏,不是需要重新設計的問題。

**Fix**:
在 `buildTscArgs` 新增一個 `filePath` 參數(預設 `null`);當 `tsconfigPath` 為 `null` 且 `filePath` 有值時,把它作為最後一個 positional 參數加入 `args`(不可與 `--project` 同時出現——兩者混用 `tsc` 會直接報錯拒絕);當 `tsconfigPath` 有值時維持現狀,不加檔案參數(project 模式,交由既有的 `errorFilePath === absolutePath` 過濾邏輯篩到被編輯檔案)。

```js
function buildTscArgs(baseArgs, { tsconfigPath = null, buildInfoPath = null, filePath = null } = {}) {
  const args = [...baseArgs, '--noEmit', '--pretty', 'false'];

  if (buildInfoPath) {
    args.push('--incremental', '--tsBuildInfoFile', buildInfoPath);
  }

  if (tsconfigPath) {
    args.push('--project', tsconfigPath);
  } else if (filePath) {
    // 沒有任何祖先 tsconfig.json 時,退回單檔案獨立檢查,
    // 避免 tsc 在零輸入檔案的狀況下靜默「通過」。
    args.push(filePath);
  }

  return args;
}
```

`runTypeCheck` 內兩處呼叫 `buildTscArgs`(目前第 113 行的第一次嘗試、第 118 行的退避重試)都要多帶 `filePath: absolutePath`(`absolutePath = path.resolve(filePath)` 沿用現有變數,只需把它的宣告移到這兩次呼叫之前)。

已用等價邏輯的沙盒腳本驗證修好後行為:同一份含真型別錯誤、無祖先 tsconfig 的檔案,`errors` 陣列正確回傳 `["Line 1: Type 'string' is not assignable to type 'number'. (TS2322)"]`。

已知取捨(需在實作 PR 描述中明講,不要隱藏):沒有 tsconfig 覆蓋時的獨立檢查,是用 `tsc` 的預設編譯選項執行,不會套用專案原本 tsconfig 的設定(no lib/types/paths/strict 等)。已實測驗證:這會讓原本合法的程式碼冒出跟專案設定無關的雜訊,例如對 `import { readFileSync } from 'node:fs'` 回報 `TS2591: Cannot find name 'node:fs'... npm i --save-dev @types/node`。在真實 monorepo 中,一個上層鬆散檔案若參照 workspace 內部套件或 path alias,每次編輯都可能冒出不可行動的「cannot find module」雜訊。這是本次修正刻意接受的成本:「有雜訊但誠實地跑了檢查」優於「安靜地宣稱乾淨但其實什麼都沒查」——修正的目標是消除「靜默假陰性」,不是保證零雜訊。採**最小方案**:不額外加「skipped」註記欄位,原因是 `main.js` 第 90 行目前只讀 `tsResult.errors`,若要讓「這是退化檢查」的提示真正傳到模型端,還需同步修改 `main.js` 的 channel 路由邏輯,超出本 bug 的最小修復範圍;真型別錯誤現在會如實浮現,乾淨的獨立檢查看起來與一般乾淨通過無異——這是可接受的,因為此時「有真的檢查過」,不再是被鎖定的「宣稱乾淨但什麼都沒查」缺陷。

不在本次範圍內:「祖先 tsconfig 存在,但其 `include`/`exclude` 沒涵蓋被編輯的檔案」是同一類「靜默通過」問題的另一種變形(tsc 會拿到 `--project` 但該檔案不在編譯範圍內,一樣不會報錯),不在此次修正範圍內,需另開項目處理。

**Acceptance Criteria**:
1. 手動 repro(before/after,可用系統上任一 `tsc` 執行檔驗證):
   - 建立 `/tmp/ts-repro/root-file.ts` 內容 `const x: number = "bad";\nexport {};\n`,且其目錄鏈(往上到檔案系統根目錄)不含任何 `tsconfig.json`。
   - **修復前**:`node -e "console.log(require('./hooks/quality-check/typescript').runTypeCheck('/tmp/ts-repro/root-file.ts', 'npm', { execCommand: 'tsc' }))"` 輸出 `{ errors: [], warnings: [] }`(靜默通過,實際上有真型別錯誤)。
   - **修復後**:同一指令,`errors` 陣列非空且包含 `TS2322`。
2. 新增/擴充 `hooks/__tests__/quality-check.test.js`:
   - `buildTscArgs` 新測項:`buildTscArgs(['tsc'], { tsconfigPath: null, buildInfoPath: null, filePath: '/x/a.ts' })` 回傳的陣列包含 `'/x/a.ts'`,且不包含 `'--project'`。
   - `runTypeCheck` 新測項(比照既有第 334-416 行的 `run` 注入樣式):在無 `tsconfig.json` 的 `testDir` 中寫入 `a.ts`,注入的 `run(cmd, args)` stub 斷言 `args` 包含該檔案的絕對路徑且不含 `'--project'`,回傳一則以該路徑開頭的 `file(line,col): error TSxxxx:` 字串,斷言 `runTypeCheck` 回傳的 `errors` 陣列非空並含對應的 TS 代碼。
   - 既有第 236-280 行的 `buildTscArgs` 測項(`tsconfigPath` 非 null 的既有案例)在改動後原樣通過,不需修改——確認新參數 `filePath` 預設 `null` 且僅在 `tsconfigPath` 為 `null` 時生效,對既有呼叫方 backward-compatible。
3. `npm run test:hooks` 全數通過。
4. `grep -n "type-checking is never silently dropped" hooks/quality-check/README.md` 仍能比對到該行(宣稱維持,且修復後為真)。

**Stop Condition**:
若在兩處呼叫都加上 `filePath: absolutePath` 之後,發現獨立檢查模式下 `--incremental` + `--tsBuildInfoFile` + 單一檔案這個組合在專案實際支援的某個舊版 `tsc` 上被拒絕(不同於 `isIncrementalFlagRejected` 已知涵蓋的 TS5023/TS5074 情境),需要新增額外一輪退避邏輯——停下來回報,不要自行擴大 `isIncrementalFlagRejected` 的比對範圍或新增更多重試分支,那已超出本 bug 修復的最小範圍。若既有 `buildTscArgs`/`runTypeCheck` 測試(第 236-416 行)在改動後失敗,先找出失敗根因(是否為既有測試依賴了「無輸入檔案」的舊行為),不要直接修改測試斷言來配合新行為。

---

### DOC-1: `docs/guide/composable-skill-eval-coverage.md` — 3 個已刪除 eval scenario 的引用失效

**Files**: `docs/guide/composable-skill-eval-coverage.md`

**Problem**:
文件的 Scenario Matrix(第 28、29、32 行)與 Recommended Commands(第 82、83、86 行)引用了 3 個已在 `evals/scenarios/` 中不存在的檔名:`eval-optional-learning-release-flow-active-skill`、`eval-optional-learning-self-improvement-candidate`、`eval-optional-learning-pending-candidate-boundary`。已用 `node scripts/cli.js eval lint <name>` 逐一重現,3 個都回傳 `Error: scenario "<name>" not found in evals/scenarios/`(exit code 1),誤導照文件操作的貢獻者。追查 git 歷史發現:這 3 個(以及第 4 個未在文件中被引用的 `eval-optional-learning-closed-loop-self-improvement`)是在 commit `5f8c8b5`(v3.1.0 Learning Curator 3.1 pivot,2026-06-02)中被整批刪除、由 11 個新 scenario 取代的舊「pre-pivot statistical pipeline」eval,但該次 pivot commit**完全沒有觸碰**這份文件(`git log` 顯示本文件最後一次實質修改是更早的 `d96f189`,之後只在 `e8ba4a8` 被 CI doc-reference linter 觸發過一次「加註解壓下 R1 告警」的局部修補,未修正根本的「scenario 檔名已不存在」問題)——文件從 pivot 那一刻起就已經失準,而現行 CI 的 doc-reference linter(R1/R2/R3)只檢查「文件引用的 skill/CLI flag 是否存在」,並不檢查「文件引用的 eval scenario 檔名是否存在」,所以這個缺口至今未被 CI 攔截。三者中只有第 32 行(`eval-optional-learning-pending-candidate-boundary`)有確鑿證據:`evals/scenarios/pending-candidate-boundary.md` 檔案開頭明文寫著「**Status**: Active — Slice H.1 post-pivot rewrite. Replaces eval-optional-learning-pending-candidate-boundary.md.」;第 28、29 行則在全部現存 scenario 檔案中找不到任何一句「Replaces」宣告,是我依語意比對推論出的候選,信心度較低。

**Fix**:
逐一處理(同一檔案,故合併為一個修復項目):

- **第 32 行 / 第 86 行**(高信心,證據明確):`eval-optional-learning-pending-candidate-boundary` → `pending-candidate-boundary`。已驗證 `node scripts/cli.js eval lint pending-candidate-boundary` 回傳 `pending-candidate-boundary: ok`(exit 0)。Scope/Target 欄位維持 `skill` / `--skill-file skills/arc-learning/SKILL.md` 不變(`pending-candidate-boundary.md` 的 Target 一致)。

- **第 28 行 / 第 82 行**(需決策,見下方 Decision Required):`eval-optional-learning-release-flow-active-skill` 引用的 `skills/arc-releasing/SKILL.md` 本身也不存在(`ls` 確認;e8ba4a8 已加註解 `<!-- doc-ref-lint: ignore R1 eval target is a contributor-only skill that does not ship in skills/ -->` 壓下這條 CI 告警,而非修正)。此列在語意上的風險描述(「Activated learned release skill is ignored or ungated」→「Project release plan covers version/changelog/tests and gates destructive actions」)與同一份表格中緊接著的第 30、31 行(`eval-plugin-dir-activated-release-skill`、`eval-release-flow-destructive-action-gate`,兩者都已存在且都能 lint 通過)幾乎完全重疊,但測試方式不同(`--plugin-dir .` 而非 `--skill-file`),不是嚴格 1:1 對應。

- **第 29 行 / 第 83 行**(需決策,見下方 Decision Required):`eval-optional-learning-self-improvement-candidate` 引用的 `--skill-file scripts/lib/learning.js`——該檔案本身仍存在且是現行程式碼(`git log` 顯示它在 pivot 後仍持續被維護),但對應的 eval scenario 已被刪除且無替代品的明確宣告。語意最接近的現存候選是 `daemon-candidate-generation`(`node scripts/cli.js eval lint daemon-candidate-generation` → ok;Target 為 `scripts/lib/learning-curator/batch-assembler.js, scripts/lib/learning-curator/proposal-ingestor.js`,驗證「Layer 3→4→5 pipeline 產生合法 pending candidate」),但它是**純 code-grader**(無 Claude agent trial),舊項目則是 **skill-scope 行為測試**——測試類型不同,不是同等替代。

**Acceptance Criteria**:
1. `grep -n "eval-optional-learning" docs/guide/composable-skill-eval-coverage.md` 沒有任何輸出(所有 4 個舊名稱字串,包含未被引用但同族的 `eval-optional-learning-closed-loop-self-improvement`,皆不再出現於文件中)。
2. 對文件 Recommended Commands 區塊中列出的每一個 scenario 名稱執行 lint,全部 exit 0:
   ```bash
   for n in $(grep -oE "eval lint [a-zA-Z0-9_-]+" docs/guide/composable-skill-eval-coverage.md | awk '{print $3}'); do
     node scripts/cli.js eval lint "$n" >/dev/null 2>&1 || echo "FAIL: $n"
   done
   ```
   預期輸出:無任何 `FAIL:` 行(修復前這條指令會印出 3 行 `FAIL: eval-optional-learning-*`,已重現確認)。
3. Scenario Matrix 表格第一欄每一個反引號括起的名稱,都對應到一個實際存在的檔案 `evals/scenarios/<name>.md`:
   ```bash
   for n in $(grep -oE '^\| `[a-zA-Z0-9_-]+`' docs/guide/composable-skill-eval-coverage.md | sed -E 's/^\| `//; s/`$//'); do
     test -f "evals/scenarios/${n}.md" || echo "MISSING: $n"
   done
   ```
   預期輸出:無任何 `MISSING:` 行。
4. 若第 28、29 行的處理方式是「刪除該列」而非「改名指向替代 scenario」,確認刪除後 Scenario Matrix 與 Recommended Commands 兩處的列數/命令數同步減少(不留下孤立的表格列或指令行),且第 30、31 行(release-flow 相關)與 `daemon-candidate-generation` 等既有現存列未被誤刪。

**Stop Condition**:
若在確認替代 scenario 內容時,發現 `daemon-candidate-generation` 或 `eval-plugin-dir-activated-release-skill` / `eval-release-flow-destructive-action-gate` 的 Scope/Target/Risk 描述其實無法涵蓋舊項目原本要測的行為(例如舊項目測的是「已啟用的自我改進技能是否遵守保守閘門」,而新項目測的是「pipeline 是否產生合法 candidate 紀錄」,兩者驗證的斷言完全不同),不要為了讓文件「看起來完整」而硬寫一段牽強的對應說明——停下來,只做「刪除失效引用」這一步,並在 PR 描述中如實記錄「沒有找到對等替代」。

**Decision Required**:
第 28、29 行沒有像第 32 行那樣的明文「Replaces」證據,是否要保留這兩列取決於文件維護者對「近似覆蓋是否算數」的判斷,不應由我逕自代為決定。列出選項:

- **第 28 行(`eval-optional-learning-release-flow-active-skill`)**:
  - (a) **刪除該列與對應指令行**(推薦預設):理由是同一份表格中第 30、31 行已經涵蓋幾乎相同的風險描述,保留舊列只是重複且已知死連結。
  - (b) 改名指向 `activated-skill-behavior` 或 `eval-plugin-dir-activated-release-skill`:若維護者認為需要保留一個「skill-scope、非 plugin-dir」的對照組,才選這個選項——但需要重寫 Risk/Expected 欄位的描述文字以符合該 scenario 實際驗證的內容,而非只是換個檔名。

- **第 29 行(`eval-optional-learning-self-improvement-candidate`)**:
  - (a) **刪除該列與對應指令行**(推薦預設,信心最低但最安全):理由是找不到任何行為層級(skill-scope)的對等替代,現存最接近的 `daemon-candidate-generation` 是純 code-grader,測試性質不同,勉強對應可能誤導未來的維護者以為「這項行為風險已被涵蓋」。
  - (b) 改名指向 `daemon-candidate-generation`,並同步把 Scope 欄位從 `skill` 改為 `learning`、Target 欄位改為 `scripts/lib/learning-curator/batch-assembler.js, scripts/lib/learning-curator/proposal-ingestor.js`、拿掉 `--skill-file` 用法(因為它是 code-grader-only,不透過 `--skill-file` 呼叫),且需要在 Expected Treatment Behavior 欄位加註「structural/code-grader assertion only,非行為層級驗證」以免誤導讀者。

---

## Batch 3 — Cross-skill contract fixes (SKILL.md files, not docs/guide)

### R3-1: arc-implementing Phase 1 誤指派 arc-writing-tasks 做 epic→features(連帶修正 arc-writing-tasks 過度宣稱的能力描述)

- **Files**:
  - `skills/arc-implementing/SKILL.md`(第 38-41 行 Phase 1、第 60 行 Skills Called 表)
  - `README.md`(第 60、150 行)
  - `skills/arc-writing-tasks/SKILL.md`(**驗證後結論:不需修改** —— 見下方 Problem/Fix 說明)
  - 範圍外但同一根因:`docs/guide/skills-reference.md:253`(見 Stop Condition 之後的備註,本 batch 標題明訂「SKILL.md files, not docs/guide」,故此行**不**包含在本項目的修改範圍內,需另開一個 docs 批次追蹤,以免掉進縫隙)

- **Problem**: `arc-implementing` 的 Phase 1(第 38-41 行)與 Skills Called 表第 1 列(第 60 行)指示呼叫 `arc-writing-tasks`,以 `epic.md` 為輸入、產出「features breakdown」;但 `arc-writing-tasks/SKILL.md` 的實際契約(description 第 3 行、`argument-hint: "<feature-name>"`)自始至終只做 feature → tasks,全文 grep "epic" 為 0 筆,毫無 epic→features 能力。已讀 `arc-planning/SKILL.md` Phase 3(第 106-145 行)確認:features/*.md 與 epic.md 是 planner 在同一次 in-memory two-pass write 中**一起**產出並經 Phase 4 驗證(每個 requirement 必須對映恰好 1 個 feature),所以在正常 SDD v2 流程下,`arc-implementing` 觸發時 features 早已存在——Phase 1 的委派呼叫是多餘且指向錯誤契約的殘留指示,會誤導執行者以為需要對 arc-writing-tasks 下達 epic 級輸入。README.md 第 60、150 行的「Break epics or features into executable tasks」則是把這個過時契約寫進使用者可見的能力描述,同樣誤導。

- **Fix**:
  1. `skills/arc-implementing/SKILL.md` 第 38-41 行,將
     ```
     3. Phase 1: Epic → Features.
        - Call `arc-writing-tasks`
        - Input: `specs/<spec-id>/epics/<epic-id>/epic.md`
        - Output: features list (may already exist in `specs/<spec-id>/epics/<epic-id>/features/*.md`)
     ```
     改為不再委派任何 skill,僅作為 orientation/確認步驟,例如:
     ```
     3. Phase 1: Confirm features exist.
        - `specs/<spec-id>/epics/<epic-id>/features/*.md` is produced by `arc-planning`
          Phase 3 (co-created with `epic.md` in the same two-pass write) — it already
          exists by the time this skill triggers. No skill call here; read the feature
          files directly and proceed to Phase 2.
     ```
  2. 同檔第 60 行 Skills Called 表,刪除 `| 1 | arc-writing-tasks | .../epic.md | features breakdown |` 這一列(其餘列不動,不需重新編號其他列的 Phase 標籤)。
  3. `README.md` 第 60、150 行,將「Break epics or features into executable tasks」改為「Break features into executable tasks」(兩處一致修改,使用 replace_all)。
  4. `skills/arc-writing-tasks/SKILL.md` **不需修改**——其現有 description、argument-hint、Output Structure 已正確界定為 feature→tasks,問題根因在呼叫方(arc-implementing)與描述方(README),不在此檔案本身。若想加保險,可選擇性加一行 scope clarifier(例如在 Overview 補一句「Input is a single feature spec, not an epic」),但預設不做——避免無需求的擴權編輯。

- **Acceptance Criteria**:
  1. `grep -n "arc-writing-tasks" skills/arc-implementing/SKILL.md` 的結果中,Phase 1 段落("Confirm features exist" 附近)不再出現 `Call \`arc-writing-tasks\``。
  2. `grep -n "features breakdown" skills/arc-implementing/SKILL.md` 回傳 0 筆(Skills Called 表該列已刪除)。
  3. `grep -n "Break epics or features" README.md` 回傳 0 筆;`grep -n "Break features into executable tasks" README.md` 回傳 2 筆(對應原第 60、150 行附近)。
  4. `grep -n "epic" skills/arc-writing-tasks/SKILL.md` 維持 0 筆(或若採用可選的 scope clarifier,則恰好新增 1 筆,且該行明確排除 epic 語意,例如包含 "not an epic")——用以證明此檔案未被誤加 epic→features 邏輯。
  5. `npm run test:skills` 全數通過(pytest 對 `arc-implementing`、`arc-writing-tasks` 的既有測試不因此修改而失敗)。

- **Stop Condition**: 本項目的「Phase 1 多餘」結論建立在「arc-planning 一定會同時產出 epic.md 與 features/*.md」這個前提上。若之後發現有支援流程可以只產出 `epic.md` 而沒有 planner 產出的 `features/*.md`(例如人工手寫 epic 而跳過 arc-planning),則本結論不成立——此時應停止並詢問使用者:該流程是否在 arc-implementing 的支援範圍內,以及若在範圍內,Phase 1 是否需要改為呼叫別的 skill(而非直接刪除委派)。這是唯一會讓本項目的機械推導失效的情況。

---

### R3-2: arc-managing-sessions 的 `alias` 指令契約前後矛盾(`<id>` vs `<session-path>`)

- **Files**: `skills/arc-managing-sessions/SKILL.md`(frontmatter 第 4 行、Quick Reference 第 108 行、Advanced 區段標題第 189 行)

- **Problem**: 同一份文件對 `alias` 指令的參數名稱前後不一致——frontmatter 的 `argument-hint`(第 4 行)、Quick Reference(第 108 行)、以及 Advanced 區段的小標題(第 189 行)都寫 `alias <id> <name>`,但緊接在第 189 行標題之後的實際範例程式碼(第 194 行)卻是 `alias <session-path> <name>`,與 `scripts/sessions.js` 的 usage 訊息(第 145、218 行:`alias <session-path> <name>` / `alias <path> <name>`)一致。`session-aliases.js` 的 `setAlias`(第 108-114 行)只驗證字串非空,不驗證路徑存在,因此使用者若照著三處錯誤指示傳入 session id,會成功建立一個指向不存在路徑的 alias,直到之後 `resume <name>` 才會發現失敗(輸出 'Session not found')。

- **Fix**:
  1. 第 4 行 `argument-hint`:`alias <id> <name>` → `alias <session-path> <name>`。
  2. 第 108 行 Quick Reference 表格列:`` `/arc-managing-sessions alias <id> <name>` `` → `` `/arc-managing-sessions alias <session-path> <name>` ``。
  3. 第 189 行小標題:`### \`alias <id> <name>\` / \`aliases\`` → `### \`alias <session-path> <name>\` / \`aliases\``。
  4. 第 194 行的程式碼範例維持不變(已經正確)。
  5.(選用、非必須)`scripts/lib/session-aliases.js` 的 `setAlias` 目前不驗證 `sessionPath` 是否真實存在——可選擇性加入存在性檢查,但依 CLAUDE.md 的「不為不太可能發生的情境加防呆」原則,預設不做此項,僅記錄為可選的次要項目。

- **Acceptance Criteria**:
  1. `grep -n "alias <id> <name>" skills/arc-managing-sessions/SKILL.md` 回傳 0 筆。
  2. `grep -n "alias <session-path> <name>" skills/arc-managing-sessions/SKILL.md` 回傳 3 筆(對應第 4、108、189 行附近)。
  3. `grep -n "alias <" skills/arc-managing-sessions/scripts/sessions.js` 與修改後的 SKILL.md 用詞一致(皆為 `<session-path>` 或 `<path>`,不再出現 `<id>` 的表述)。
  4. `npm run test:skills` 通過。

- **Stop Condition**: 若修正過程中發現需要同時變更 `sessions.js` 的 CLI 參數名稱或行為(例如打算讓指令同時接受 id 或 path),應停止並詢問使用者——本項目的預設範圍是「僅修文件、不改程式碼」;一旦牽涉程式碼契約變更,就超出本項目範圍,需要另一個決策。

- **Decision Required**(次要、非必須): 是否要在 `session-aliases.js` 的 `setAlias` 加入路徑存在性驗證。選項:(a)不加,維持現狀,只修文件(預設建議);(b)加入驗證,`alias` 指令在路徑不存在時立即報錯,而非等到 `resume` 才失敗。這是產品行為決策,不在本次文件修正的必要範圍內,若使用者要,再另開項目處理。

---

### R3-3: arc-managing-sessions 的 Storage Layout 誤將 diary 檔案畫在 sessions 目錄樹下

- **Files**: `skills/arc-managing-sessions/SKILL.md`(第 198-208 行 Storage Layout)

- **Problem**: Storage Layout 的 ASCII 目錄樹(第 200-208 行)把 `diary-{sessionId}.md`(來自 `arc-journaling`)畫成 `~/.arcforge/sessions/{project}/{YYYY-MM-DD}/` 底下的一個子項目,但已讀 `skills/arc-journaling/SKILL.md`(第 57、149、216-217、223 行)與 `scripts/lib/session-utils.js`(`getDiaryPath`、`getProjectDiariesDir` 等)確認:diary 實際寫入的是完全獨立的 `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`,`arc-journaling/SKILL.md` 第 223 行甚至特別註明「Diary files live under `~/.arcforge/diaries/` (not `~/.claude/sessions/`)」。使用者若依 `arc-managing-sessions` 這份文件去 sessions 目錄底下找 diary,會找不到檔案。

- **Fix**: 修改第 198-208 行,把 `diary-{sessionId}.md` 這一列從 `~/.arcforge/sessions/{project}/` 樹狀圖中移除,並在樹狀圖後另外補一行說明其真實位置。具體改為:
  ```
  ## Storage Layout

  ```
  ~/.arcforge/sessions/{project}/
  ├── aliases.json                          # Project-scoped alias registry
  ├── {YYYY-MM-DD}/
  │   ├── {sessionId}.json                  # Auto-saved session metrics
  │   ├── session-{alias}.md                # User-archived session (from save)
  │   ├── handover-{slug}.md                # Optional handover file (from handover --save)
  ```

  Diary entries (from `arc-journaling`) live under a separate tree, not here:
  `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`
  ```

- **Acceptance Criteria**:
  1. `sed -n '198,212p' skills/arc-managing-sessions/SKILL.md` 顯示 `~/.arcforge/sessions/{project}/` 這棵 ASCII 樹狀圖中不再包含 `diary-{sessionId}.md` 這一行。
  2. `grep -n "arcforge/diaries" skills/arc-managing-sessions/SKILL.md` 回傳 ≥1 筆。
  3. `grep -n "arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md" skills/arc-managing-sessions/SKILL.md skills/arc-journaling/SKILL.md` 兩檔的路徑字串完全一致。
  4. `npm run test:skills` 通過。

- **Stop Condition**: 若之後 `scripts/lib/session-utils.js` 的 `getDiaryPath` 實作路徑改變(不再是 `~/.arcforge/diaries/...`),應以程式碼(`session-utils.js`)為準重新推導,而不是直接照抄 `arc-journaling/SKILL.md` 的文字——程式碼是權威來源,文件是次要來源。若兩者本身就不一致,停下來先確認哪一邊該修,而不是把不一致複製到第三份文件。

---

### R3-4: arc-finishing 的 Merge Conflict(Multi-Teammate)區段引用已不存在的「Shared Files section」與「lead 的 step 4 掃描」

- **Files**: `skills/arc-finishing/SKILL.md`(Step 4.1 情境表第 333-337 行、Merge Conflict (Multi-Teammate) 範本第 506-541 行)

- **Problem**: `arc-finishing` 的 Step 4.1 情境表(第 336-337 行)與 blocked-format 範本(第 520-521、535-541 行)要求 teammate 回報衝突檔案時註明「是否列在我的 spawn prompt 的 Shared Files section 中」,並在未列出時觸發一段 ALERT 文字,聲稱「lead 在 arc-dispatching-teammates step 4 的掃描可能漏掉了這個檔案」。但已讀 `skills/arc-dispatching-teammates/SKILL.md`(第 12 行「Don't pre-identify conflicts」、第 98 行 Red Flag 明確禁止告知 teammates 要避開哪些共享檔案、Core Workflow 第 39-84 行的 Step 4 是「Expand worktrees and dispatch teammates in parallel」,並無任何共享檔案掃描)與 `references/spawn-prompt-template.md`(第 143-150 行明文禁止在 spawn prompt 加入 ownership、file-level constraints,現行範本裡完全沒有 "Shared Files" 這個章節)確認:這套機制在現行設計中已被刻意移除。因此 teammate 依 `arc-finishing` 的格式回報時,每個衝突檔都只能填「listed in my Shared Files: no」(因為根本沒有這個 section),並被要求觸發一則指控 lead 掃描失誤的誤導性 ALERT——而 lead 也會被引導去「更新其他 teammates 的 ownership」,一個已不存在的機制。

- **Fix**:
  1. Step 4.1 情境表(第 333-337 行),把現行 3 列合併為 2 列,刪除「conflict is on a file listed in your spawn prompt's Shared Files section」與「NOT listed」的區分,兩種情況本來就走同一條路徑:
     ```
     | Context | Resolution Path |
     |---|---|
     | **Solo epic** — you (or a human user) invoked this skill directly, no team-lead in the loop | Present the conflict to the user. Show the unmerged files, the conflicting hunks verbatim, and ask for resolution guidance. Wait for explicit direction before editing. |
     | **Multi-teammate dispatch** — you are a teammate spawned via `arc-dispatching-teammates`, a lead is present | **SendMessage to `team-lead`** using the Merge Conflict (Multi-Teammate) blocked format below. Do NOT auto-resolve. The lead has the global view of which teammates landed in what order and is the correct arbiter. |
     ```
     (原本第三列整列刪除,不保留任何「未列在 Shared Files」的變體路徑)
  2. Merge Conflict (Multi-Teammate) 範本(第 519-521 行),移除逐檔的 Shared Files 註記:
     ```
     Conflict files:
     - <path1>
     - <path2>
     ```
  3. 刪除第 535-541 行整段(「If the conflict is on a file NOT listed in your spawn prompt's Shared Files section...」及其後的 ALERT 文字區塊),因為既沒有 Shared Files section,也沒有 step 4 的掃描可供引用。
  4. 第 309 行提到「touching a shared file」屬於描述衝突成因的一般敘述文字,不是在引用被移除的機制,**不需要改動**。

- **Acceptance Criteria**:
  1. `grep -n "Shared Files" skills/arc-finishing/SKILL.md` 回傳 0 筆。
  2. `grep -n "lead's scan in arc-dispatching-teammates\|shared-file scan" skills/arc-finishing/SKILL.md` 回傳 0 筆。
  3. `grep -rn "Shared Files" skills/` 對整個 skills 目錄回傳 0 筆(確認沒有其他檔案仍引用這個已移除的概念)。
  4. `sed -n '330,340p' skills/arc-finishing/SKILL.md` 顯示 Step 4.1 情境表恰好 2 個內容列(Solo epic、Multi-teammate dispatch),不再有第三列。
  5. `npm run test:skills` 通過。

- **Stop Condition**: 若移除 Shared Files 區分後,重新檢查發現兩種情況原本就導向完全相同的處理(SendMessage 給 lead)——目前已確認如此,合併是安全的。但若日後重新閱讀 `arc-dispatching-teammates` 發現有任何「部分恢復檔案歸屬預測」的跡象(與其第 98 行 Red Flag 矛盾),應停止修改 `arc-finishing`,先確認 `arc-dispatching-teammates` 的現行設計是否真的沒有異動,以哪一邊為準協調後再動手,避免修好 `arc-finishing` 又立刻被上游的設計變更打臉。

---

## Batch 4 — arc-evaluating reference-doc corrections

# Batch 4 — arc-evaluating reference-doc corrections: remediation plan

---

### AE-1: verdict-policy.md 與 SKILL.md 的 `NO_CHANGE` 應為 `INCONCLUSIVE`

**Files**:
- `skills/arc-evaluating/references/verdict-policy.md`
- `skills/arc-evaluating/SKILL.md`

**Problem**: `verdict-policy.md` 全篇(enum 表、k<5 說明、Acting on Verdicts 表等共 8 處)使用 `NO_CHANGE` 作為 A/B 統計不顯著時的 verdict 名稱,但 `scripts/lib/eval-stats.js`(`verdictFromDelta` 第 280 行、`verdictFromDeltaCI` 第 371 行)實際回傳的字串是 `'INCONCLUSIVE'`,且 `tests/scripts/eval-stats.test.js`、`tests/scripts/eval-integration.test.js`、`tests/scripts/eval-preflight.test.js` 皆以 `INCONCLUSIVE` 斷言。使用者依文件在 CLI 輸出、`grading.json`/測試斷言中尋找 `NO_CHANGE` 永遠找不到。`SKILL.md` 第 84 行「REQUIRED BACKGROUND」摘要句也重複了同一個錯誤名稱,若只修 `verdict-policy.md` 會留下一個仍然誤導的殘留點,所以一併列入(此為調查中發現、非原始 audit 條目點名,但屬同一個錯字的第二個出現位置)。

**Fix**:
1. `skills/arc-evaluating/references/verdict-policy.md`:對全部 8 處 `NO_CHANGE` 執行字面替換為 `INCONCLUSIVE`(第 14、19、25、35、37、55、56、75 行,含 enum 表的 `**NO_CHANGE**` 粗體標記、行為對照表、Acting on Verdicts 表)。不改動其他驗證邏輯敘述(SHIP/NEEDS WORK/BLOCKED/IMPROVED/REGRESSED/INSUFFICIENT_DATA 均已與程式碼一致,不動)。
2. `skills/arc-evaluating/SKILL.md` 第 84 行:
   - 原文:`**REQUIRED BACKGROUND:** references/verdict-policy.md — full verdict enum (SHIP, NEEDS WORK, BLOCKED, IMPROVED, REGRESSED, NO_CHANGE, INSUFFICIENT_DATA), why k<5 triggers INSUFFICIENT_DATA, asymmetric delta thresholds.`
   - 改為:將 `NO_CHANGE` 換成 `INCONCLUSIVE`,其餘文字不變。

**Acceptance Criteria**:
1. `grep -rn "NO_CHANGE" skills/arc-evaluating/` 回傳 0 筆(注意:`CHANGELOG.md` 中的 3 筆歷史紀錄不在此 grep 範圍內,不需改動——見下方 Stop Condition)。
2. `grep -c "INCONCLUSIVE" skills/arc-evaluating/references/verdict-policy.md` 回傳 `8`。
3. `grep -n "INCONCLUSIVE" skills/arc-evaluating/SKILL.md` 回傳恰好第 84 行的 1 筆命中。
4. 手動核對:`verdict-policy.md` 的 enum 表、k<5 段落、Acting on Verdicts 表三處讀起來與 `scripts/lib/eval-stats.js` 的 `verdictFromDelta`/`verdictFromDeltaCI` 回傳值(`'IMPROVED' | 'INCONCLUSIVE' | 'REGRESSED' | 'INSUFFICIENT_DATA'`)一致。
5. `npm run test:scripts`(涵蓋 `tests/scripts/eval-stats.test.js`)維持全綠——本項僅動文件,不應影響任何測試結果,綠燈是「未誤觸程式碼」的確認,不是本 fix 的驗證目標本身。

**Stop Condition**: 若在替換過程中發現 `CHANGELOG.md` 或其他非 `skills/arc-evaluating/` 路徑下的 `NO_CHANGE` 提及其實需要一併訂正(例如已發現的 `CHANGELOG.md:308`),不要動它——changelog 是歷史紀錄,記載的是撰寫當時的措辭,不隨後續程式碼改名回溯修改;若不確定某筆歷史紀錄是否需要訂正,停下來問使用者,不要自行擴大範圍。

---

### AE-2: audit-workflow.md(及重複出現處)promotion 語意反轉、資料來源錯誤

**Files**:
- `skills/arc-evaluating/references/audit-workflow.md`
- `skills/arc-evaluating/references/grading-and-execution.md`(調查中發現的第二個出現點,非原始 audit 條目點名)

**Problem**: `audit-workflow.md` 第 9、15、17 行聲稱 promotion candidates 是「`passed: true` 且被人類驗證後可 canonicalize 進 skill 指令集」的 claims,但 `scripts/lib/eval-audit.js`(`buildPromotionCandidates`,第 117-172 行)實際做法是:對每個 normalized claim 計算 `frequency`(出現次數)與 `failure_rate`(`passed:false` 的比例),以 `score = frequency × failure_rate` 由大到小排序——全數通過(`failure_rate = 0`)的 claim 分數必為 0、排在最後。CLI 輸出標題(`scripts/cli/eval-command.js:261`)直接寫著 `## Promotion Candidates (frequent + failing claims)`,程式碼註解(`eval-audit.js:6-8`)也明講「這些應該被 promoted into formal assertions」,三個獨立訊號(排序邏輯、程式碼註解、CLI 標題)彼此一致,共同指向程式碼是權威版本、文件是過期的。此外第 17 行「passed in 3+ trials, across 2+ distinct scenarios, with no contradicting trials」是虛構的門檻——程式碼沒有任何最小次數/場景數過濾,是「全部 bucket 依分數排序、CLI 依 `--top`(預設 10)截斷」。第 50 行另聲稱 audit 讀取 `evals/benchmarks/latest.json`,但 `collectGradingData`(`eval-audit.js:53-114`)只走訪 `evals/results/<scenario>/<runId>/grading/trial-*.json`,從未讀取 `evals/benchmarks/latest.json`(該檔案是 `arc eval report` 產生、由 `scripts/check-benchmark-freshness.js` 消費,與 audit 無關)。同樣的「passed: true → promotion」錯誤敘述也出現在 `grading-and-execution.md` 第 112 行,調查中發現、非原始 audit 條目所列,但屬同一個實質錯誤的第二處,若不一併修正,使用者讀到該檔仍會被誤導。

**Fix**:
1. `audit-workflow.md` 第 9 行,原文:
   > `discovered_claims` from grading.json entries where `passed: true` across multiple trials. These are behaviors the eval harness has observed consistently. A promotion candidate has passed the empirical bar but not yet been validated by a human and canonicalized into the skill.

   改為:
   > `discovered_claims` from grading entries, ranked by `score = frequency × failure_rate` (see `buildPromotionCandidates` in `scripts/lib/eval-audit.js`). These are NOT the claims that passed most consistently — they are claims that occurred often AND failed often. A promotion candidate is a frequent, failing behavior pattern: one the agent exhibits regularly but does not reliably get right, and therefore a candidate to formalize as an explicit assertion so future evals grade it directly instead of relying on the grader noticing it incidentally.

2. 第 15 行("How Promotion Works" 開場句),原文:
   > Promotion is the process of moving a discovered claim from eval evidence into the skill's canonical instruction set. The steps:

   改為:
   > Promotion is the process of moving a discovered claim — one that recurs often and fails often — from incidental grader observation into a formal, explicit assertion. Where the human arbitrator judges the pattern reflects a systemic skill gap rather than a scenario-specific gap, they may instead (or additionally) canonicalize it into the skill body — see Step 3. The steps:

3. 第 17 行(Step 1),原文:
   > **Candidate surfaces** — The audit command identifies a discovered claim with sufficient evidence (passed in 3+ trials, across 2+ distinct scenarios, with no contradicting trials).

   改為:
   > **Candidate surfaces** — `arc eval audit` buckets all `discovered_claims` by normalized claim text, computes `frequency` and `failure_rate` per bucket, scores each bucket `frequency × failure_rate`, and sorts descending. The CLI prints the top N (default 10, override with `--top`) under `Promotion Candidates (frequent + failing claims)`. There is no minimum-trial or minimum-scenario-count filter — all-pass claims are still included but sort to the bottom (score 0).

4. 第 50 行,原文:
   > Audit reads from `evals/benchmarks/latest.json` and the grading.json entries in `evals/results/`.

   改為:
   > Audit reads grading entries from `evals/results/<scenarioName>/<runId>/grading/trial-*.json` (see `collectGradingData` in `scripts/lib/eval-audit.js`). It does not read `evals/benchmarks/latest.json` — that file is written by `arc eval report` and consumed separately by `scripts/check-benchmark-freshness.js`.

5. `grading-and-execution.md` 第 112 行,原文:
   > Promotion candidates for `arc eval audit` come from `discovered_claims` entries where `passed: true` appears consistently across multiple trials. An agent cannot self-promote a discovered claim — human arbitration is required (see references/audit-workflow.md).

   改為:
   > Promotion candidates for `arc eval audit` are `discovered_claims` entries ranked by `frequency × failure_rate` — claims that recur often AND fail often, not claims that consistently pass. An agent cannot self-promote a discovered claim — human arbitration is required (see references/audit-workflow.md).

**明確排除於本次修正之外**:`audit-workflow.md` 第 20 行「The promoted claim is marked in the audit log with the commit hash and promotion date」——這是描述人類事後如何記錄的期望流程(aspirational process),不是本 finding 點名的「promotion 篩選邏輯反轉」或「latest.json 資料來源」問題,程式碼中也確實沒有「audit log」機制可供核對真偽。刻意不觸碰,避免範圍外重構;若之後要查證這句是否也失真,應是獨立的 finding。

**Acceptance Criteria**:
1. `grep -n "passed: true" skills/arc-evaluating/references/audit-workflow.md skills/arc-evaluating/references/grading-and-execution.md` 回傳 0 筆。
2. `grep -n "latest.json" skills/arc-evaluating/references/audit-workflow.md` 回傳 0 筆(或若保留提及,必須明確寫「audit 不讀取此檔案」而非暗示會讀)。
3. 手動核對:`audit-workflow.md` 修正後的 "What Audit Covers" 與 "How Promotion Works" 段落中,「promotion 篩選依據」與「promotion 目標(formal assertion / 視情況才進 skill body)」兩處敘述彼此不矛盾(即不會出現「篩出失敗的行為,拿去典範化成教學指令」這種自相矛盾的句子)。
4. `node -e "const {buildPromotionCandidates} = require('./scripts/lib/eval-audit'); const c = buildPromotionCandidates([{text:'x',passed:true,scenario:'s'},{text:'x',passed:true,scenario:'s'},{text:'y',passed:false,scenario:'s'}]); console.log(JSON.stringify(c))"` 執行後,`text: 'y'`(有失敗)排在 `text: 'x'`(全通過,score=0)之前——用來現場驗證文件描述的排序方向與程式碼行為一致。

**Stop Condition**: 若你發現任何跡象顯示維護者其實有意讓 promotion 篩選「passed: true」而程式碼(`eval-audit.js` 的 `score = frequency × failure_rate` 排序、CLI 標題「frequent + failing claims」、程式碼註解「promoted into formal assertions」)才是那個意外引入的 bug——例如某次 PR 描述、issue、或 commit message 明確説明排序邏輯是誤植——停下來,不要逕自修文件,回報使用者:這變成「該修程式碼還是該修文件」的產品決策,而非單純的過期文件修正。

---

### AE-3: preflight.md 誤述自動執行時機,且未記載真正的豁免機制 `## Preflight\nskip`

**Files**: `skills/arc-evaluating/references/preflight.md`

**Problem**: 第 57 行聲稱 preflight 會在 `arc eval run` 與 `arc eval ab` 開始時「自動執行」,但 `scripts/cli/eval-command.js` 的 `run` 分支(第 121-175 行)完全沒有任何 preflight 呼叫;`ab` 分支(第 293-302 行)只呼叫 `checkPreflightGate()` 檢查「是否已存在該 (scenario, model) 的快取 PASS 紀錄」,若不存在則回傳錯誤訊息要求手動執行 `arc eval preflight <name>`,並不會自動幫你跑 preflight。第 42 行提到的 `--skip-preflight` 旗標在全 repo 不存在(`grep -rn "skip-preflight"` 除了這份文件自己以外零命中);真正能讓 `arc eval ab` 跳過此 gate 的機制是 scenario 檔內的 `## Preflight\nskip`(對應 `shouldSkipPreflightGate()`,`scripts/lib/eval-preflight.js` 第 33-35 行),這是一個受版控、需要在 scenario 檔案裡明文寫下並過 code review 的合法豁免(用於 non-regression/non-interference 場景),而非文件目前語氣暗示的「作弊旗標」,但整份 skill 的 reference 檔案(含 `cli-and-metrics.md`)都沒有記載這個機制。

**Fix**:
1. 第 57 行,原文:
   > Preflight also runs automatically at the start of `arc eval run` and `arc eval ab`.

   改為:
   > Preflight does NOT run automatically. `arc eval run` has no preflight logic at all — it never checks the ceiling. `arc eval ab` only *checks* for an existing cached preflight record for the current (scenario, model) pair via `checkPreflightGate()`; if none exists, it errors out with the exact remediation command (`arc eval preflight <name>`) rather than running preflight itself. You must run `arc eval preflight <name>` explicitly before your first `arc eval ab` on a given scenario+model pair.

2. 第 42 行,原文:
   > When preflight blocks, respect the block. Do not bypass it by deleting history, lowering the threshold manually, or running trials with `--skip-preflight`. Each of those actions defeats the purpose of the gate and corrupts the benchmark signal.

   改為:
   > When preflight blocks, respect the block. Do not bypass it by deleting history, lowering the threshold manually, or hand-editing a cached preflight file's `verdict` field to `PASS`. Each of those actions defeats the purpose of the gate and corrupts the benchmark signal. The only legitimate way to skip the gate is the scenario-level `## Preflight\nskip` directive (see next section) — reserved for non-regression/non-interference scenarios, not a general escape hatch.

3. 新增一個小節(建議插在第 42 行之後、"Preflight is Exempt from INSUFFICIENT_DATA" 之前),內容:
   > ## Scenario-Level Opt-Out: `## Preflight\nskip`
   >
   > A scenario file may include a `## Preflight` section whose body is `skip` to explicitly opt out of the `arc eval ab` gate:
   >
   > ```
   > ## Preflight
   > skip
   > ```
   >
   > `shouldSkipPreflightGate()` (`scripts/lib/eval-preflight.js`) checks for this exact directive, case-insensitive. When present, `arc eval ab` prints `Preflight: skipped by scenario policy (<name>)` and proceeds without checking for a cached PASS record. This exists for non-regression / non-interference scenarios where a ceiling-effect check does not apply. Because it lives in the version-controlled scenario file, bypassing the gate for an existing scenario requires editing and committing that file — visible in code review, unlike a CLI flag.

**Acceptance Criteria**:
1. `grep -n "skip-preflight" skills/arc-evaluating/references/preflight.md` 回傳 0 筆。
2. `grep -n "runs automatically" skills/arc-evaluating/references/preflight.md` 回傳 0 筆(或若保留該詞,必須是否定句)。
3. `grep -n "## Preflight" skills/arc-evaluating/references/preflight.md` 至少有 1 筆命中(新增小節存在)。
4. 手動 repro:於乾淨的 scenario(無 `evals/preflight/` 快取紀錄)執行 `node scripts/cli.js eval ab <existing-scenario-name> --skill-file <path>`,預期看到 `Error: No preflight record found for scenario "<name>" ...` 並以非 0 結束(`echo $?` 非 0),而不是自動觸發 preflight 執行——驗證文件修正後的敘述與實際 CLI 行為一致。
5. `grep -rn "preflight" skills/arc-evaluating/references/cli-and-metrics.md` 若已有提及 CLI 指令列表(`arc eval preflight <name>`),不需重複新增 `## Preflight skip` 說明到該檔——單一文件記載一次即可,避免重複維護點。

**Stop Condition**: 若你發現 `checkPreflightGate` 或 `shouldSkipPreflightGate` 在你查證時的行為與這裡描述的不同(例如未來有人加了真的 `--skip-preflight` CLI 旗標,或 `ab` 分支被改成真的會自動跑 preflight),先重新核對 `scripts/cli/eval-command.js` 與 `scripts/lib/eval-preflight.js` 的當下版本,不要照抄本計畫的固定文字——這份 Fix 描述是基於本次調查當下的程式碼快照。

---

### AE-4: eval-schemas.md 為孤兒文件且內容與現行 schema 矛盾——需決定刪除或重寫

**Files**: `skills/arc-evaluating/references/eval-schemas.md`(可能同動 `skills/arc-evaluating/SKILL.md` 第 179-185 行,視決策而定)

**Problem**: `SKILL.md` 的 reference 清單(第 179-185 行,共列 6 個 reference 檔)獨漏 `eval-schemas.md`,全 repo 搜尋(`grep -rln "eval-schemas"`)僅 `CHANGELOG.md`(歷史紀錄)與 `docs/plans/claude-completeness-2026-06-06-design.md`(貢獻者用設計文件,不屬 shipped 範圍)提及它,shipped 範圍內沒有任何檔案引用或連結它——是真孤兒。內容本身有兩層過期:(1) 第 3 行仍寫「used by arc-writing-skills evaluation agents」,但依 `docs/plans/claude-completeness-2026-06-06-design.md`(option C 決策記錄)所述,該批 agent 早已遷入 `arc-evaluating`,`arc-writing-skills` 已不再擁有評測職責;(2) 其 `comparison.json` schema(`winner`/`rubric.{A,B}.{compliance,robustness,generalization,overall_score 1-10}`)與 `eval-blind-comparator.md`(`skills/arc-evaluating/agents/eval-blind-comparator.md` 第 62-81 行)實際規定的輸出格式(`score_a`/`score_b` 0-1 兩位小數、`rubric: [{criterion, weight}]` 陣列、weight 總和 1.0)完全不同;其 `evals.json` schema(`pressures`/`options`/`correct_option`/`combined_pressure_count`)也與目前實際使用中的 `evals/evals.json` 格式(例如 `skills/arc-evaluating/evals/evals.json`、`skills/arc-maintaining-obsidian/evals/evals.json` 皆用 `id`/`eval_name`/`prompt`/`expected_output`/`files`/`assertions`)不符;其 `grading.json` schema(`assertions[]`/`summary`/`rationalizations[]`/`scenario_feedback`)也未提及 `discovered_claims[]`/`weak_assertions[]`——而這兩個欄位正是 `arc eval audit`(`scripts/lib/eval-audit.js`)實際消費的核心資料,已在 `grading-and-execution.md` 第 87-136 行被正確、完整記載。整份文件描述的是一套已被 CLI + Markdown scenario 架構取代的舊式 JSON subagent 評測管線。`docs/plans/claude-completeness-2026-06-06-design.md` 第 83-85、99 行本身留有一條未完成的 Follow-up:「Reconcile `eval-schemas.md` with arc-evaluating's existing reference docs」——代表這個落差是遷移當下就已知、被刻意延後、至今未處理的技術債。

**Fix — 兩個選項,需決策**:

- **選項 (a) 重寫**:將 `eval-schemas.md` 改寫成準確反映現行 schema(`comparison.json` 對齊 `eval-blind-comparator.md` 的 `score_a`/`score_b`/加權 `rubric` 陣列;`evals.json` 對齊 `id`/`eval_name`/`prompt`/`expected_output`/`files`/`assertions`;`grading.json` 補上 `discovered_claims[]`/`weak_assertions[]`),並在 `SKILL.md` 第 179-185 行的 reference 清單補上一行 `references/eval-schemas.md`。缺點:這會與 `cli-and-metrics.md`(CLI/metrics/storage)、`grading-and-execution.md`(grader schema)、`eval-blind-comparator.md`(comparison.json 的權威定義)三份既有文件在內容上重疊——`eval-schemas.md` 存在的唯一附加價值會是「把三處 JSON 範例集中在一個檔案」,這需要維護者確認是否值得多一份要同步維護的文件。

- **選項 (b) 刪除**:直接刪除 `skills/arc-evaluating/references/eval-schemas.md`,不動 `SKILL.md` 的 reference 清單(反正它本來就沒被列入,刪除後清單依然正確、不需改動)。理由:它是孤兒(無 shipped 檔案引用)、內容四個 schema 中至少三個已確認與現行實作矛盾、且它想記載的每一份「仍然正確」的資訊已經分別存在於 `cli-and-metrics.md`、`grading-and-execution.md`、`eval-blind-comparator.md`——重寫等於在三份文件之外再造一份會持續漂移的重複來源。

**建議**:採選項 **(b) 刪除**。證據不含糊——不是「這份文件品質不好」的模糊判斷,而是三個獨立、可驗證的事實(孤兒、schema 矛盾、`docs/plans` 自己記錄的未完成 reconcile 待辦)同時成立。刪除不會遺失任何「目前正確且無處記載」的知識:唯一一個目前確實在用但沒被任何文件記載的格式(`eval_name`/`prompt`/`expected_output`,`skill-creator` 方法論用的 `evals/evals.json`)不屬於 `arc-evaluating` 的 CLI scenario 系統,幫它新增文件屬於範圍外的新增工作,不在本次 finding 範圍內。

**Decision Required**: 若維護者的立場是「即使目前沒人引用,仍希望有一份集中式 schema 速查表存在,方便未來查閱四種 JSON 格式」,則應選 (a) 重寫 + 補上 SKILL.md 引用,而非 (b)。這是「要不要讓這種文件繼續存在」的產品/資訊架構決策,不是可從程式碼機械推導的事實問題——本計畫不擅自代為決定,列出兩個選項供使用者選擇,並標記為 Decision Required。

**Acceptance Criteria(若選 (b) 刪除)**:
1. `test -f skills/arc-evaluating/references/eval-schemas.md` 回傳非 0(檔案不存在)。
2. `grep -rn "eval-schemas" skills/ .claude-plugin/ scripts/ agents/ templates/ docs/guide/` 回傳 0 筆(排除 `docs/plans/`、`CHANGELOG.md`,兩者為歷史/貢獻者文件,不需同步修改)。
3. `grep -c "references/" skills/arc-evaluating/SKILL.md` 修改前後行數差 0(清單本來就沒有它,不需要編輯 SKILL.md)。

**Acceptance Criteria(若選 (a) 重寫)**:
1. `skills/arc-evaluating/references/eval-schemas.md` 第 3 行不再出現 `arc-writing-skills` 字樣。
2. 文件內 `comparison.json` 範例的欄位名稱與 `skills/arc-evaluating/agents/eval-blind-comparator.md` 第 62-81 行逐欄核對一致(`score_a`/`score_b`/`rubric: [{criterion, weight}]`)。
3. 文件內 `evals.json` 範例欄位與 `skills/arc-evaluating/evals/evals.json` 實際格式逐欄核對一致(`id`/`eval_name`/`prompt`/`expected_output`/`files`/`assertions`)。
4. 文件內 `grading.json` 範例補上 `discovered_claims[]`/`weak_assertions[]`,且與 `grading-and-execution.md` 第 87-136 行的欄位定義一致。
5. `grep -n "references/eval-schemas.md" skills/arc-evaluating/SKILL.md` 回傳 1 筆(已補入清單)。

**Stop Condition**: 在使用者對「刪除 vs 重寫」做出決定之前,不要動這個檔案。若使用者選重寫,而重寫過程中發現 `evals/evals.json` 這個格式其實有第二種、彼此不相容的變體同時在用(例如某些 skill 的 `evals/evals.json` 用了本計畫未檢查到的第三種欄位組合),停下來回報——這代表「目前用的格式」本身尚未收斂,重寫 schema 文件前需要先確認要記載哪一種當作標準。

---

## Batch 5 — docs/guide/ user-facing guide sync (skills-reference.md + hooks-system.md)

### B5-1: docs/guide/skills-reference.md — 同步 arc-maintaining-obsidian / arc-managing-sessions 條目、修正技能總數、對齊 arc-implementing Phase 1 措辭

- **Files**: `docs/guide/skills-reference.md`（唯讀參照：`skills/arc-maintaining-obsidian/SKILL.md`、`skills/arc-maintaining-obsidian/presets/{llm-wiki,minimal,news,project-tracker}/{AGENTS,SCHEMA}.md`、`skills/arc-managing-sessions/SKILL.md`、`skills/arc-implementing/SKILL.md`）

- **Problem**:
  1. `docs/guide/skills-reference.md` 第 3 行與第 62 行都寫「33 skills / 33 arcforge skills」，但 `skills/` 目錄實際有 32 個技能，文件自己的分類清單（Planning～Meta 八類加總）也是 32 個 —— 兩處數字都過時，任何用這份文件核對技能總數的人都會得到錯誤答案。
  2. 第 755–772 行的 `arc-maintaining-obsidian` 條目仍描述改版前的單一 vault 設計：宣稱固定「6 page types (Source, Entity, Synthesis, MOC, Decision, Log)」（實際上型別由各 vault 的 `SCHEMA.md` 宣告，那 6 種只是 `llm-wiki` preset 的型別，`news`/`project-tracker` preset 各自宣告完全不同的型別如 Article/Task/Milestone）；宣稱輸出一律是 bilingual `[!multi-lang-{code}]` callout（實際語言政策現在是 per-vault 由 `AGENTS.md` 的 Language Policy 決定，`news`/`project-tracker` preset 預設單語、無 callout）；audit 報告路徑寫成 `audit-YYYY-MM-DD-<subcommand>.md`，但現行 `SKILL.md` 第 164 行是 `_audits/audit-YYYY-MM-DD-<scope>.md`。整份條目完全沒提到現在 argument-hint 主打的 `init-vault`、`register`、presets、多 vault registry 功能。
  3. 第 462–480 行的 `arc-managing-sessions` 條目仍是 v3 改版前「以 archive 為主」的框架：Purpose 寫「User-controlled session saves」、Key workflow 只列 Save/Resume/List/Alias 四步，完全沒提到 v3 已把預設行為翻轉為 handover（Quick Handover / Full Context Summary / Tail Handover 三種輕量模式），而 save/resume/list/alias 現在只是「Archive (Advanced)」這個進階、非預設路徑。
  4. 第 253–254 行 `arc-implementing` 條目的「Phase 1: Epic to features via arc-writing-tasks」措辭，需要與 Batch 3 針對 `skills/arc-implementing/SKILL.md` Phase 1 契約的修正結果保持一致 —— 這裡不獨立發明新措辭。

- **Fix**（逐項列出確切的舊文字 → 新文字；舊/新文字本身維持英文原樣，只有下方說明用中文）：

  1. **技能總數**：兩處都把 `33` 改成 `32`。
     - 第 3 行：`This is the offline reference for all 33 arcforge skills.` → `This is the offline reference for all 32 arcforge skills.`
     - 第 62 行：`arcforge's 33 skills are organized into a three-layer model:` → `arcforge's 32 skills are organized into a three-layer model:`

  2. **arc-maintaining-obsidian 條目**（第 755–772 行），只改這個條目本身，不動第 77 行分類總表那一行（該行措辭本來就籠統，未做失實宣稱，保持手術式最小改動）：
     - **Purpose**（第 759 行）改為強調 vault-interface + 多 vault 框架，例如：
       `Vault interface — resolves which registered Obsidian vault to operate on (via --vault=<name>, cwd match, or the single-vault default), then dispatches one of three universal actions (ingest, query, audit) against that vault's paired contract (AGENTS.md runtime contract + SCHEMA.md domain schema). Vaults are domain-agnostic; init-vault bootstraps a new vault from a preset (minimal, llm-wiki, news, project-tracker).`
     - **When to use**（第 761 行）末尾補上：
       `...or ingesting raw files (Excalidraw, PDFs, screenshots, papers); also when initializing a new vault (init-vault), registering an existing vault (register), or managing the multi-vault registry (list-vaults, unregister, set-default).`
     - **Key workflow**（第 763–766 行）：在 Ingest 條目前新增一條 Registry-level bullet，並修正 Ingest 條目裡「6 page types」的措辭：
       - 新增：`Registry-level (vault-agnostic): init-vault <path> --name <name> [--preset=<minimal|llm-wiki|news|project-tracker>] runs an 11-step bootstrap that authors AGENTS.md + SCHEMA.md from the chosen preset and registers the vault; register / unregister / set-default / list-vaults manage ~/.arcforge/obsidian-vaults.json.`
       - Ingest bullet改為：`Ingest pipeline: Classify → Confirm → Create → Visuals → Index → Propagate → Log — page types are declared per-vault in that vault's SCHEMA.md (the llm-wiki preset ships Source, Entity, Synthesis, MOC, Decision, Log + a Paper variant; news/project-tracker declare their own domain-specific types). Raw-first-then-wiki rule preserves re-extraction ability.`
       - Query / Audit 兩條 bullet 維持原樣不動。
     - **Artifacts**（第 768–770 行）改為：
       `Output: typed notes per the vault's SCHEMA.md; language format (e.g. bilingual [!multi-lang-{code}] callouts under the llm-wiki/minimal presets, vs single-language body text under news/project-tracker) is declared in that vault's AGENTS.md Language Policy; audit reports under _audits/audit-YYYY-MM-DD-<scope>.md, rolling index.md and log.md.`

  3. **arc-managing-sessions 條目**（第 462–480 行）：
     - **Purpose**（第 466 行）改為：
       `Lightweight, user-controlled session continuity. Default = handover, not archive — most handoffs need only a short handover (quick bullet list, full context summary, or a tail marker); reach for a durable archive snapshot only when the session holds decisions or patterns worth preserving weeks or months later.`
     - **When to use**（第 468 行）改為：
       `When ending a session and handing off to a future session — default is a lightweight handover (quick bullets, full context summary, or a tail "you are here" marker, no file written unless asked). Escalate to an archive snapshot (save) only when the archive-recommendation heuristics fire (explicit ask, high decision density, lasting value); use resume/list/alias to work with archived sessions.`
     - **Key workflow**（第 470–474 行）改為兩步框架，取代原本 Save/Resume/List/Alias 四步並列：
       1. `Handover (default): pick the lightest mode that unblocks the next session — Quick Handover (5–10 line bullets, no file by default), Full Context Summary (longer, for cross-agent/cross-person handoff), or Tail Handover (last exchanges + immediate next step only).`
       2. `Archive (advanced, opt-in): only when the archive-recommendation heuristics say the work is worth preserving — save [alias] reflects on the conversation and writes an enriched durable file; resume [alias] resolves the alias, reads the file, presents a structured briefing, and WAITs for user confirmation; list browses history (--limit, --date, --query); alias creates friendly names.`
     - **Artifacts**（第 476–478 行）改為：
       `Output: handovers print inline by default (optional handover-{slug}.md if asked); archive snapshots write ~/.arcforge/sessions/{project}/{date}/session-{alias}.md, aliases.json.`

  4. **arc-implementing Phase 1 措辭**（第 253–254 行）：**不要獨立發明新措辭**。等 Batch 3 對 `skills/arc-implementing/SKILL.md` Phase 1 的修正定案後，把這裡的「Phase 1: Epic to features via arc-writing-tasks」改到與該檔案最終的 Phase 1 文字一致。目前 `skills/arc-implementing/SKILL.md:38` 是「3. Phase 1: Epic → Features. Call `arc-writing-tasks`」——語意已相同，但字面用詞（箭頭記法、「Call X」vs「via X」）不同；若 Batch 3 最終不改動該檔案，這裡就只需要做字面一致化，不需等待任何新決策。

- **Acceptance Criteria**:
  1. `grep -n "33 skill" docs/guide/skills-reference.md` 回傳 0 筆結果；`grep -c "^### arc-" docs/guide/skills-reference.md` 與 `ls skills | wc -l` 兩者相等（皆為 32）。
  2. `grep -n "6 page types" docs/guide/skills-reference.md` 回傳 0 筆結果；`grep -n "audit-YYYY-MM-DD-<subcommand>" docs/guide/skills-reference.md` 回傳 0 筆；`grep -n "_audits/audit-YYYY-MM-DD-<scope>" docs/guide/skills-reference.md` 回傳至少 1 筆。
  3. 在 `arc-maintaining-obsidian` 條目範圍內（`sed -n '755,774p' docs/guide/skills-reference.md`）能同時看到 `init-vault`、`register`、`preset`（或 `presets`）、`registry` 這幾個詞至少各出現一次。
  4. `grep -n "User-controlled session saves" docs/guide/skills-reference.md` 回傳 0 筆；`grep -n "Default = handover, not archive" docs/guide/skills-reference.md` 回傳至少 1 筆；`sed -n '462,482p' docs/guide/skills-reference.md` 人工確認 Key workflow 以 Handover 為第一步、Archive 標示為「advanced, opt-in」第二步（與 `grep -n "^### " skills/arc-managing-sessions/SKILL.md` 顯示的章節順序一致）。
  5. Phase 1 一致性：修正後，`sed -n '253,255p' docs/guide/skills-reference.md` 的措辭與當時 `skills/arc-implementing/SKILL.md` 裡 Phase 1 那一行的字面用詞可對應（不要求逐字相同，但語意與動詞選擇需一致，例如統一用 "Epic → Features" 或統一用 "Epic to features"）。
  6. `npm run lint` 通過（此檔案不在 Biome 的 `.js` scope 內，但確保沒有破壞 Markdown 格式，例如 heading 層級、table 對齊）。

- **Stop Condition**: 若 Batch 3 尚未定案 `skills/arc-implementing/SKILL.md` 的 Phase 1 措辭，第 4 點（Phase 1 對齊）先擱置，其餘 3 項修正可先行套用並各自驗收；不要為了完成這個 batch 而自行臆測或搶先定義 Phase 1 的新契約。若在核對 preset 型別時發現 `news`/`project-tracker` 之外還有其他 preset 尚未涵蓋（例如未來新增的 preset），以當下 `presets/` 目錄實際內容為準重新列舉，不要照抄本計畫寫死的四個 preset 名稱。

- **Decision Required**: 第 4 點（Phase 1 措辭）不是機械可derive的修正，而是依賴 Batch 3 對 `arc-implementing` Phase 1 契約的修正結果。選項：(a) 等 Batch 3 PR 合併後再回頭同步這裡的一行文字（推薦，避免兩個 batch 互相搶跑）；(b) 這個 batch 先只做「箭頭記法/動詞用詞」的字面一致化（不涉及語意變更），之後 Batch 3 若改變語意再二次修正。若選 (b)，需在 PR 描述中註明這行文字仍可能被 Batch 3 覆寫。

---

### B5-2: docs/guide/hooks-system.md — 補齊 Registered Hooks 表格缺漏的 4 個 hook、修正 additionalContext 的 PostToolUse 限制描述

- **Files**: `docs/guide/hooks-system.md`（唯讀參照：`hooks/hooks.json`、`scripts/lib/utils.js`、`hooks/arc-remind/main.js`、`.claude/rules/hooks.md` 作為已修正措辭的內部對照）

- **Problem**:
  1. 第 209–223 行「Registered Hooks (Current)」表格漏列 4 個實際已在 `hooks/hooks.json` 註冊、且皆為同步（無 `async: true`）的 hook：`arc-guard`（PreToolUse，matcher `Bash`/`Edit`/`Write`）、`sdd-ledger-guard`（PreToolUse，matcher `Edit`/`Write`）、`sdd-ratify-guard`（PreToolUse，matcher `Bash`）、`arc-remind`（PostToolUse，matcher `Bash`/`Edit`/`Write`）。README 第 213 行明確說本指南是「the full list」，使用者依此文件會誤以為 session 中沒有這些 guard/remind hook 在運作。
  2. 第 143 行宣稱 additionalContext「Available on: SessionStart and UserPromptSubmit events only. Other events ignore this field.」，但出貨的 `arc-remind` hook（`hooks/arc-remind/main.js:316`）正是透過 PostToolUse 的 `outputPostToolUseFeedback`（`scripts/lib/utils.js:449`）把 `hookSpecificOutput.additionalContext` 注入模型，且 `scripts/lib/utils.js:412-420` 的程式碼註解與 `.claude/rules/hooks.md` 都明確記載這是「spike-verified on Claude Code v2.1.172」的可用機制。文件這條限制描述已過時，會誤導自訂 hook 作者放棄這個實際可用的管道。

- **Fix**:
  1. 在第 209–223 行的表格中新增 4 列（依事件分組插入，PreToolUse 三列接在既有 `PreToolUse | observe | async` 之後、PostToolUse 一列接在既有三個 PostToolUse 列之後、`PreCompact` 之前）：
     ```
     | PreToolUse | arc-guard | sync | Block Worktree Rule violations (raw git merge/loop in epic cwd) and locked research-config.md edits |
     | PreToolUse | sdd-ledger-guard | sync | Enforce append-only immutability on specs/<id>/decisions.yml |
     | PreToolUse | sdd-ratify-guard | sync | Deny arcforge ratify while an autonomous loop is live |
     | PostToolUse | arc-remind | sync | User-facing nudges: verify/review before PR, prefer CLI worktree add, eval-before-ship, branch-before-edit |
     ```
     （Purpose 欄位文字可依實作者對 `hooks/arc-guard/README.md`、`hooks/sdd-ledger-guard/README.md`、`hooks/sdd-ratify-guard/README.md`、`hooks/arc-remind/README.md` 的當下內容微調用詞，但事件欄、hook 名稱欄、Sync/Async 欄必須與 `hooks/hooks.json` 當時的實際註冊內容一致，不要照抄本計畫寫死的字串。）
  2. 第 143 行改為（措辭需與 `.claude/rules/hooks.md` 目前記載的修正版本對齊，且保留版本號限定語）：
     `**Available on**: SessionStart, UserPromptSubmit, and PostToolUse (PostToolUse spike-verified on Claude Code v2.1.172, including Task-subagent tool calls; rendered to the model as "PostToolUse:<Tool> hook additional context: <text>"). Other events ignore this field. For PostToolUse, use outputPostToolUseFeedback(reason, { systemMessage }) from scripts/lib/utils.js (see hooks/arc-remind/main.js for a working example) — the plain outputContext helper is scoped to SessionStart/UserPromptSubmit.`

- **Acceptance Criteria**:
  1. `grep -n "arc-guard\|sdd-ledger-guard\|sdd-ratify-guard\|arc-remind" docs/guide/hooks-system.md` 回傳至少 4 筆（每個 hook 名稱在表格中各出現一次）。
  2. 手動核對：對 `hooks/hooks.json` 執行 `grep -n '"matcher"\|hooks/.*\/main.js' hooks/hooks.json`，確認表格中新增列的 Event 欄與 Sync/Async 欄和 `hooks.json` 當下實際內容一致（尤其 Sync/Async 欄：新增的 4 列都不應含 `"async": true`，可用 `grep -B5 "arc-guard\|sdd-ledger-guard\|sdd-ratify-guard\|arc-remind" hooks/hooks.json | grep async` 應無輸出來驗證）。
  3. `grep -n "SessionStart and UserPromptSubmit events only" docs/guide/hooks-system.md` 回傳 0 筆。
  4. `grep -n "PostToolUse.*spike-verified\|spike-verified.*PostToolUse" docs/guide/hooks-system.md` 回傳至少 1 筆。
  5. `grep -n "outputPostToolUseFeedback" docs/guide/hooks-system.md` 回傳至少 1 筆（確認有指向正確 helper，而非只改限制敘述卻沒告訴讀者該用哪個函式）。
  6. 執行 `npm test` 中的 hook 相關測試（`npm run test:hooks`）確認本次僅為文件變更、未觸碰任何 `hooks/*/main.js` 邏輯，測試應維持原本綠燈狀態不變。

- **Stop Condition**: 套用修正前，重新以當下的 `hooks/hooks.json` 為準（而非本計畫文字）derive 一次完整 hook 清單與其 matcher/async 狀態 —— 如果屆時 `hooks.json` 的註冊內容已經和本次調查時不同（新增/移除/改變 async 狀態），以檔案當下內容為準，不要照抄本計畫寫死的表格列。若「PostToolUse additionalContext 可用」這件事在套用修正時於當前安裝的 Claude Code 版本上出現與 v2.1.172 不同的行為（例如某次升級後失效），停止修改第 143 行的敘述，先回報版本落差，不要在未重新驗證的情況下沿用舊的 spike 結論。

---

## Batch 6 — hooks README sync (hooks/README.md + per-hook READMEs)

Baseline green (556 passed). Now writing the final remediation plan.

---

### batch6-1: hooks/README.md 與 docs/guide/hooks-system.md 對 inject-skills 的描述過時（合併 finding #1、#3 — 同一項指涉相同文件，判定為一個修正）

**Files**: `hooks/README.md`（第 12、57 行）、`docs/guide/hooks-system.md`（第 213 行）

**Problem**: `hooks/README.md` 第 12 行「Injects arc-using skill at session start」與第 57 行「Injects arc-using skill content」、以及 `docs/guide/hooks-system.md` 第 213 行「Inject arc-using skill content into Claude」都宣稱 inject-skills 會注入完整的 `arc-using` skill 內容。但實際上 `hooks/inject-skills/main.sh`（第 38-49 行）只注入一段極簡的 bootstrap 文字，且 `hooks/inject-skills/README.md` 第 15 行與 `.claude/rules/architecture.md` 都明確說明這是刻意設計、不注入完整 `arc-using` 內容。使用者讀這兩份隨插件出貨的文件會對 SessionStart 行為建立錯誤認知。

**Fix**:
- `hooks/README.md:12`：`├── inject-skills/          # Injects arc-using skill at session start` → `├── inject-skills/          # Injects a minimal ArcForge bootstrap at session start`
- `hooks/README.md:57`：`| inject-skills | startup, resume, clear, compact | Injects arc-using skill content |` → `| inject-skills | startup, resume, clear, compact | Injects a minimal ArcForge bootstrap (not the arc-using skill content) |`
- `docs/guide/hooks-system.md:213`：`| SessionStart | inject-skills | sync | Inject arc-using skill content into Claude |` → `| SessionStart | inject-skills | sync | Inject minimal ArcForge bootstrap context into Claude |`
- 用詞對齊 `hooks/inject-skills/README.md:3` 既有的權威措辭（"minimal ArcForge bootstrap"），不要自創新詞彙。

**Acceptance Criteria**:
1. `grep -n "arc-using skill" hooks/README.md docs/guide/hooks-system.md` → 無匹配（目前應有 3 處：`hooks/README.md:12`、`hooks/README.md:57`、`docs/guide/hooks-system.md:213`，修正後歸零）。
2. `grep -n "minimal ArcForge bootstrap" hooks/README.md docs/guide/hooks-system.md hooks/inject-skills/README.md` → 三個檔案都至少各一筆匹配，確認措辭對齊。
3. `pytest tests/skills/test_minimal_toolkit_docs.py -v` → 全部 PASSED（尤其 `test_sessionstart_bootstrap_does_not_smuggle_spec_sync_or_routing_pressure`，目前只檢查 `main.sh`，不應因本次文件修改而破壞既有斷言）。
4. `npm run check:docs` → 輸出仍是 `No gating doc-reference violations.`（確認未引入新的失效交叉引用）。

**Stop Condition**: 若在改寫過程中發現 `hooks/inject-skills/README.md` 本身的措辭與 `main.sh` 實際行為又不一致（三方出現新的矛盾),停止並回報,不要自行決定新的權威措辭。

**Decision Required**: 本次调查同時發現 `tests/skills/test_minimal_toolkit_docs.py`（第 120-121 行）只檢查 `hooks/inject-skills/main.sh`，未涵蓋 `hooks/README.md` 或 `docs/guide/hooks-system.md`，這正是本次漂移未被既有守門測試攔截的原因。修正文件本身不會關閉這個守門缺口，有兩個選項，需要人決定，不要默默選一個：
  - (a) 僅修正文件內容，把「擴充守門測試涵蓋這兩份上層文件」列為獨立的後續強化項目（不在本 batch 範圍內）。
  - (b) 同時擴充 `test_minimal_toolkit_docs.py`，新增斷言確認 `hooks/README.md` 與 `docs/guide/hooks-system.md` 不再宣稱 inject-skills 注入完整 arc-using 內容（例如比照現有 `test_architecture_describes_arc_using_as_bounded_router` 的模式,加一個等價測試)。

**額外標記（非本項修正範圍，僅供路由）**: 調查過程中發現 `hooks/README.md` 第 58 行「`| session-tracker/inject-context | startup, resume, clear | Loads previous session context |`」與第 61-64 行的說明（宣稱只有 inject-skills 涵蓋 `compact`,其他都不涵蓋)同樣與 `hooks/hooks.json:14`（`inject-context.js` 實際註冊在 `startup|resume|clear|compact`,包含 compact）不符 —— 這與 finding #2 是同一類型的錯誤，但發生在不同檔案（`hooks/README.md` 而非 `hooks/session-tracker/README.md`),不在本次 6 個 confirmed findings 之列。本項不修正它，僅記錄以便使用者決定是否併入本 batch 或另開一個 finding。

---

### batch6-2: hooks/session-tracker/README.md 的 Triggers、Storage、Session File Format、Editing Notes 與對應 Output Examples 全部過時（合併 finding #2、#5 — 同一檔案的兩類過時描述)

**Files**: `hooks/session-tracker/README.md`（Triggers 段 46-49 行、Storage 段 51-59 行、Session File Format 段 61-75 行、Output Examples 段 77-101 行、Editing Notes 段 103-110 行）

**Problem**: 兩個獨立錯誤共用同一份文件，且第二個錯誤在檔案中出現不只一次：(1) Triggers 段宣稱 SessionStart 只在 `startup|resume` 觸發、clear/compact 由 inject-skills 處理，但 `hooks/hooks.json` 顯示 `inject-context.js` 實際註冊在 `startup|resume|clear|compact` 全部四種、`start.js` 註冊在 `startup|resume|clear`（僅 compact 除外），且 inject-skills 從未處理 context 注入；(2) Storage / Session File Format / Editing Notes 三段宣稱 session 檔為扁平路徑 `~/.arcforge/sessions/my-project-2025-01-24.json`、範例 JSON 含 `notes` 欄位、並教使用者手動編輯 `notes` 留言給下個 session，但實際路徑是巢狀的 `~/.arcforge/sessions/{project}/{date}/{sessionId}.json`（`scripts/lib/utils.js` 的 `getSessionDir`），且整個 codebase（含 `inject-context.js`）都不讀取 `notes` 欄位——同一個扁平路徑與 `notes` 迷思還分別重複出現在下方的 Output Examples 段（「Session saved to: ~/.arcforge/sessions/my-project-2025-01-24.json」與「Notes from last session: ...」），若只改 Storage/Format/Editing Notes 三段而不改 Output Examples，文件內部會自相矛盾。本項的修正範圍限定在「同一批既有的兩個錯誤（觸發表不符、扁平路徑/notes 迷思）在檔案中所有出現處」，不擴及本文件中其他未被指出的落差。

**Fix**:
- **Triggers 段**（46-49 行）整段改為區分兩支 script 各自的實際 matcher，移除「compact 由 inject-skills 處理」的錯誤說法：
  ```
  ## Triggers

  - **SessionStart** (`inject-context.js`): `startup|resume|clear|compact` — runs on every SessionStart source, including compact.
  - **SessionStart** (`start.js`): `startup|resume|clear` — does not run on `compact` (background init should not re-run mid-compaction).
  - **Stop** (`end.js`): all Stop events.
  ```
- **Storage 段**（51-59 行）改為巢狀路徑，例如：
  ```
  ## Storage

  Sessions stored in `~/.arcforge/sessions/{project}/{date}/` as JSON:
  ```
  ~/.arcforge/sessions/
  ├── my-project/
  │   ├── 2025-01-24/
  │   │   └── {sessionId}.json    # Machine-readable
  │   └── 2025-01-23/
  │       └── {sessionId}.json
  └── other-project/
      └── 2025-01-24/
          └── {sessionId}.json
  ```
  ```
- **Session File Format 段**（61-75 行）刪除 `"notes": "Working on hooks implementation"` 這一行，範例應只保留 `getOrCreateSession()`（`hooks/session-tracker/end.js`）實際寫入的欄位：`sessionId`、`project`、`date`、`started`、`lastUpdated`、`toolCalls`、`filesModified`（可選 `compactions`）。
- **Output Examples 段**（77-101 行）：
  - 「Session Start」子區塊（79-92 行,「If previous session exists: ... Notes from last session ...」）整段刪除——經 `grep -n "toolCalls\|filesModified\|loadSession\|Previous Session" hooks/session-tracker/inject-context.js` 確認零匹配，這個範例描述的是已被移除的舊行為（讀取上一 session 的 notes/tool calls/files modified 直接顯示給使用者），現行行為已經在上方 Features 段（15-28 行）用 pending-actions / instinct-injection 正確描述過，不需要重造一份範例。
  - 「Session End」子區塊保留，只修正路徑：`Session saved to: ~/.arcforge/sessions/my-project-2025-01-24.json` → `Session saved to: ~/.arcforge/sessions/my-project/2025-01-24/{sessionId}.json`。
- **Editing Notes 段**（103-110 行）整段刪除，因為它教使用者編輯一個永遠不會被讀取的欄位。若要保留「怎麼留話給下一個 session」的指引，改指向 `arc-managing-sessions` skill 實際支援的 `save`/`handover --save` 機制（`session-{alias}.md` / `handover-{slug}.md`），而不是自創新內容。

**Acceptance Criteria**:
1. `grep -n "clear/compact.*inject-skills\|handled by inject-skills" hooks/session-tracker/README.md` → 無匹配。
2. `grep -n "my-project-2025-01-24.json" hooks/session-tracker/README.md` → 無匹配（確認扁平路徑字串已在所有出現處被替換）。
3. `grep -n '"notes"' hooks/session-tracker/README.md` → 無匹配。
4. `grep -n "Notes from last session" hooks/session-tracker/README.md` → 無匹配。
5. `grep -n "{project}/{date}\|{project}/{YYYY-MM-DD}" hooks/session-tracker/README.md` → 至少一筆匹配，確認巢狀路徑格式已寫入。
6. `node -e "require('./hooks/session-tracker/inject-context.js')"` 之後手動核對：`grep -n "toolCalls\|filesModified\|loadSession" hooks/session-tracker/inject-context.js` 仍為零匹配（回歸檢查，確保本次修正的前提——inject-context.js 不讀 session JSON——沒有在同批次被意外改變）。
7. `npm run test:hooks` → 全部通過（回歸檢查，本項不改動任何 `.js` 邏輯，僅文件）。
8. `npm run check:docs` → 仍輸出 `No gating doc-reference violations.`

**Stop Condition**: 若移除「Editing Notes」段後，找不到任何等效的、已存在的使用者留言機制文件可供指向（即 `arc-managing-sessions` 的 `save`/`handover` 未如預期支援跨 session 留言），停止並詢問使用者是否要保留一個「目前無此功能」的說明，而不是自行發明新機制或新增程式碼。

**Decision Required**: 調查中另外發現「Session End」範例本身的多行格式（`📝 Session Summary: Duration / Tool calls / Files modified / Session saved to:`）與 `hooks/session-tracker/end.js` 實際輸出（`formatShortMessage`/`formatTriggeredMessage`，只在 diary 門檻觸發時才對使用者可見，且格式是單/雙行的「📝 Session paused. (N messages, M tool calls) / Diary captured; counters reset...」）不符——這是本次 investigation 中新發現、原本 6 個 confirmed findings 未點名的落差。是否要在同一個修正裡把整個「Session End」範例改寫成如實反映 `end.js` 現況，還是只修正本項明確點名的路徑字串、把範例格式的落差留給另一個後續 finding 處理？兩者都合理，需要人選：
  - (a) 只修路徑（本項 Fix 所寫的最小修正），格式落差另開 finding。
  - (b) 一併把整個「Session End」範例改寫為如實反映 `formatShortMessage`/`formatTriggeredMessage` 的實際輸出。

---

### batch6-3: hooks/arc-remind/README.md「What it does」段落與實作有四處落差（finding #4，四個子問題合併為一個修正，因為同一段落的定位互相牽動）

**Files**: `hooks/arc-remind/README.md`（10-19 行）

**Problem**: 「What it does」的觸發表只列 4 個 nudge，漏掉 `main.js` 第 338-348 行已實作的 SDD spec→dag nudge；第 17 行用「the last one」指涉表格最後一列，但新增 spec→dag 列之後，「最後一列」的指涉會進一步偏移（目前它想講的是 eval-before-ship 那一列,即目前表格第 3 列),用位置代詞描述會隨表格增列持續跑位；第 19 行宣稱「Edit/Write events are observed only to track which SKILL.md files were edited」，但 Edit/Write 事件其實會直接發出 spec→dag nudge 與 main-branch nudge（`main.js:330-358`），並非只用於追蹤；第 18 行「(the plugin is disabled here)」是貢獻者專屬事實（見 `.claude/rules/dev-context.md`），不應出現在隨插件出貨給使用者的 README 裡。這四點都在同一段落、彼此互相牽動（改動表格會連動改動下方引用位置的句子），因此合併為一次修正。

**Fix**:
- 在觸發表（10-15 行）新增一列 spec→dag nudge，例如：
  ```
  | `specs/<id>/spec.xml` written but its `dag.yaml` is missing (once per spec-id) | Edit/Write | SDD stage nudge: prompts `arc-planning` to plan next (`main.js:338-348`) |
  ```
- 第 17 行改為用具名方式指涉，不再用「the last one」，例如：
  `The eval-before-ship nudge (` + backtick + `git commit` + backtick + `/` + backtick + `push` + backtick + ` after a SKILL.md edit) is the shippable, user-facing half of eval-before-ship; the ` + backtick + `ci.yml` + backtick + ` annotation is the arcforge-repo half.`
  （同時砍掉「(the plugin is disabled here)」這個貢獻者專屬 aside，不要保留在任何形式的括號註解裡。）
- 第 19 行改為如實描述 Edit/Write 的完整行為，例如：
  `Edit/Write events are also used to track which SKILL.md files were edited (feeding the eval-before-ship freshness check below), and directly emit the spec→dag and main-branch nudges (` + backtick + `main.js:330-358` + backtick + `).`
- 不要動 `hooks/README.md:88`——finding 本身引用它作為「spec planning 這個 nudge 確實存在」的佐證，該行本身沒有錯。

**Acceptance Criteria**:
1. `grep -n "spec→dag\|spec.xml.*dag.yaml\|dag.yaml.*missing" hooks/arc-remind/README.md` → 觸發表中新增至少一筆匹配。
2. `grep -n "the last one" hooks/arc-remind/README.md` → 無匹配。
3. `grep -n "the plugin is disabled here" hooks/arc-remind/README.md` → 無匹配。
4. `grep -n "observed only to track" hooks/arc-remind/README.md` → 無匹配。
5. `grep -n "main.js:338-348\|main.js:330-358" hooks/arc-remind/README.md` → 至少各一筆匹配，確認新描述有指到正確的實作行號區間。
6. `npm run test:hooks` → 全部通過（`hooks/__tests__/arc-remind.test.js` 不應受文件修改影響，作為回歸檢查）。
7. `npm run check:docs` → 仍輸出 `No gating doc-reference violations.`

**Stop Condition**: 若修正過程中發現 `main.js:330-358` 或 `338-348` 的行號因未來程式改動而位移（本次讀取時的行號與此刻不符），停止並重新用 `grep -n` 定位實際行號後再寫入 README，不要照抄本文件裡的行號區間貼上去。若發現 spec→dag nudge 事實上也會在 autopilot 模式下額外走 model channel（像 PR-boundary/eval-before-ship 那樣），而觸發表新增列的措辭沒有涵蓋這點，停止並向使用者確認是否要在新列裡也註明 autopilot 行為，不要自行假設。

---

### batch6-4: skills/arc-managing-sessions/SKILL.md 的 Storage Layout 誤將 diary 檔案歸入 sessions 目錄樹（finding #6）

**Files**: `skills/arc-managing-sessions/SKILL.md`（198-208 行）

**Problem**: Storage Layout 把 `diary-{sessionId}.md` 畫在 `~/.arcforge/sessions/{project}/{YYYY-MM-DD}/` 目錄樹底下，但 `arc-journaling` 實際寫入的是 `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md`（`scripts/lib/utils.js` 的 `getDateDiariesDir`/`getProjectDiariesDir` 與 `getSessionDir`/`getProjectSessionsDir` 是兩組不同函式，指向兩個不同的根目錄），且 `arc-journaling` 的 SKILL.md 第 223 行特別註明「Diary files live under `~/.arcforge/diaries/` (not `~/.claude/sessions/`)」。使用者依本文件到 sessions 目錄找 diary 檔案會找不到。

**Fix**: 把 `diary-{sessionId}.md` 這一行從 sessions 樹中移除，改成樹狀圖下方一句獨立說明，指向 `arc-journaling` 的實際路徑，例如：
```
## Storage Layout

```
~/.arcforge/sessions/{project}/
├── aliases.json                          # Project-scoped alias registry
├── {YYYY-MM-DD}/
│   ├── {sessionId}.json                  # Auto-saved session metrics
│   ├── session-{alias}.md                # User-archived session (from save)
│   ├── handover-{slug}.md                # Optional handover file (from handover --save)
```

Diary entries are stored separately under `~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}.md` (owned by `arc-journaling` — not under the sessions tree).
```

**Acceptance Criteria**:
1. `grep -n "diary-{sessionId}.md" skills/arc-managing-sessions/SKILL.md` → 匹配行不應再是 `~/.arcforge/sessions/{project}/` 樹狀圖縮排底下的一行，而是獨立句子並含 `diaries` 字樣。
2. `grep -n "diaries/{project}" skills/arc-managing-sessions/SKILL.md` → 至少一筆匹配。
3. `grep -n "diaries/{project}" skills/arc-journaling/SKILL.md` → 應仍有 3 筆匹配（57、149、216 行），確認兩份文件現在指向同一個權威路徑，沒有互相矛盾。
4. `pytest tests/skills/test_skill_arc_managing_sessions.py tests/skills/test_arc_managing_sessions_eval_scenarios.py -v` → 全部 PASSED（回歸檢查，這兩個測試檔目前不斷言 Storage Layout 內容，修正不應破壞既有斷言）。
5. `npm run check:docs` → 仍輸出 `No gating doc-reference violations.`

**Stop Condition**: 若發現 `arc-journaling` SKILL.md 本身對 diary 路徑的描述在三處（57、149、216 行）彼此不一致，停止並先確認 `arc-journaling` 內部一致，再回頭修正本文件——不要在權威來源本身有分歧的情況下挑一個抄過來。

---

## Batch 7 — arc-journaling draft-workflow documentation gap

### B7-1: 為 arc-journaling 補上「草稿確認 → 就地補完 → finalize」工作流程說明

**Files**
- `skills/arc-journaling/SKILL.md`（唯一需要修改的檔案；本項為純文件補完，不涉及程式碼變更）

參考但不修改（用於驗證文件內容與實際行為一致）：
- `skills/arc-journaling/scripts/diary.js`（`finalize` 子指令，line 44-64，行為為 `fs.renameSync(draftPath → finalPath)`，非合併）
- `skills/arc-journaling/scripts/auto-diary.js`（`generateDraft()`，line 124-215：`## Session Metrics`／`## Tool Usage Summary` 為**決定性產生**，`<!-- TO BE ENRICHED -->` 區塊留給背景 enricher）
- `scripts/lib/diary-capture.js`（`runDiaryCapture`／`spawnDiaryEnricher`，line 142-218：enricher 是 detached、fire-and-forget 的背景 Haiku 進程）
- `scripts/lib/utils.js`（`getDiaryDraftPath`，line 575-580：草稿檔名樣式 `diary-{sessionId}-draft.md`）
- `hooks/pre-compact/main.js`（line 101, 113：呼叫 `runDiaryCapture` **未傳入** `transcriptData`）
- `hooks/session-tracker/end.js`（line 141-160：Stop 路徑**有**傳入 `transcriptData`）
- `hooks/session-tracker/inject-context.js`（line 244：SessionStart 顯示的 nudge 文字）

**Problem**

`SKILL.md` 的 Quick Reference 只列出 `path` 與 `save` 兩個子指令，完全沒有記載草稿檔（`diary-{sessionId}-draft.md`）的存在、也沒有記載 `diary.js` 已實作的 `finalize` 子指令。當 SessionStart 因背景管線（PreCompact/Stop hook → `auto-diary.js generate` → 背景 Haiku enricher）產生草稿而注入「Diary draft ready — use /arcforge:arc-journaling to review and finalize.」時，依 `SKILL.md` 現有「## Process」操作的 agent 只會執行 step 1「Reflect on Conversation (Context-First)：DO NOT read files」，接著直接 `save` 一份全新日記到正式路徑——這既會遺留孤兒草稿檔，也會蓋掉 `auto-diary.js generate` 已決定性填入的 `## Session Metrics`／`## Tool Usage Summary` 內容（這兩節是產生腳本寫入的，不是像原稽核描述的「背景 enricher 填入」；enricher 只負責填 `<!-- TO BE ENRICHED -->` 佔位區塊，且 PreCompact 路徑呼叫 `runDiaryCapture` 時未傳 `transcriptData`，enricher 收到的是空物件，實務上該路徑產生的草稿其佔位區塊很可能仍是空的）。「## When to Use」明列 PreCompact hook 觸發情境，卻沒有對應到任何處理草稿的段落，形成文件與實際行為的落差，誤導依文件操作的 agent。

**Fix**

只修改 `skills/arc-journaling/SKILL.md`，新增/調整以下四處：

1. **Quick Reference 表格**（現行 line 12-20）：在「Save diary」列（line 17）之後新增一列：
   ```
   | **Finalize draft** | `node "${SKILL_ROOT}/scripts/diary.js" finalize --project {p} --date {d} --session {s}` |
   ```
   並把「Key principle」列（line 18）改為：
   ```
   | **Key principle** | Reflect from memory, NOT by reading files — **except** an existing draft (see "Draft Finalization Workflow"): read it first, never rewrite it from memory |
   ```
   （保留 "from memory" 字樣，讓既有 pytest `test_documents_no_file_reading_rule` 維持通過。）

2. **新增頂層章節 `## Draft Finalization Workflow`**，插入位置在「## When NOT to Use」（現行 line 84-90）之後、「## Process」（現行 line 92）之前。內容：

   ```markdown
   ## Draft Finalization Workflow

   When SessionStart shows **"📝 Diary draft ready — use /arcforge:arc-journaling to review and finalize."**, a background pipeline (PreCompact or Stop hook → `auto-diary.js generate` → detached Haiku enricher) has already written a draft to:

   ```
   ~/.arcforge/diaries/{project}/{YYYY-MM-DD}/diary-{sessionId}-draft.md
   ```

   Do this instead of writing a new entry from scratch:

   1. **Read the draft file.** Its `## Session Metrics` section (duration, tool calls, user messages, compactions, files modified) is always deterministically filled — preserve it, never regenerate or discard it. It may also have a `## Tool Usage Summary` section. Its `<!-- TO BE ENRICHED -->` placeholder sections (Decisions Made, Challenges & Solutions, etc.) *may* already be filled by a background enricher — check, don't assume either way.
   2. **If placeholders remain and you have conversation memory of that session**, edit the draft file in place to replace the `<!-- TO BE ENRICHED -->` blocks with real content — do not create a separate entry via `save`. If you do NOT have memory of the flagged session (e.g. the nudge surfaced in a later, unrelated session), leave the placeholders as-is rather than fabricating content.
   3. **Promote the draft to the final diary:**
      ```bash
      node "${SKILL_ROOT}/scripts/diary.js" finalize \
        --project {project} \
        --date {YYYY-MM-DD} \
        --session {sessionId}
      ```
      `finalize` renames the draft to the final path — it does **not** merge content, so any edits from step 2 must already be written to the draft file before calling it.
   4. **If `finalize` reports `No draft found at: ...`**, there is no pending draft — fall back to the normal "## Process" workflow below (reflect from memory, then `save`).

   Never respond to the draft-ready nudge by reflecting from memory and calling `save` directly — that creates a duplicate final diary and leaves the auto-generated draft as an orphaned file.
   ```

3. 在「## Process」→「### 1. Reflect on Conversation (Context-First)」標題（現行 line 94）下方加一句：
   `(This flow is for a fresh entry with no pending draft. If a draft exists, use "Draft Finalization Workflow" above instead.)`

4. **`## Common Mistakes`**（現行 line 172-202）新增一個子項：
   ```markdown
   ### Rewriting an Existing Draft From Scratch

   **Wrong:** Seeing "Diary draft ready" and reflecting from memory into a brand-new `save` call
   **Right:** Read the draft first, fill only remaining placeholders in place, then `finalize` it (see "Draft Finalization Workflow")
   ```

5. **`## Output Location`**（現行 line 213-225）在既有 diary 目錄樹加一行：
   ```
   └── diary-{sessionId}-draft.md    # Auto-generated draft (PreCompact/Stop hook); promote with `finalize`, do not overwrite with `save`
   ```

**Acceptance Criteria**

1. `grep -n "diary-{sessionId}-draft.md" skills/arc-journaling/SKILL.md` — 至少 2 處命中（Draft Finalization Workflow 章節 + Output Location 章節）。
2. `grep -n "finalize" skills/arc-journaling/SKILL.md` — 至少 3 處命中（Quick Reference 新列、Draft Finalization Workflow step 3/4、Common Mistakes 新項）。
3. `grep -n "TO BE ENRICHED" skills/arc-journaling/SKILL.md` — 至少 1 處命中。
4. `grep -n "^## " skills/arc-journaling/SKILL.md` — 確認 `## Draft Finalization Workflow` 恰好出現 1 次，且排在 `## When NOT to Use` 之後、`## Process` 之前。
5. `cd /Users/gregho/GitHub/AI/arcforge && npm run test:skills` — 全數通過，尤其 `tests/skills/test_skill_arc_journaling.py::test_documents_no_file_reading_rule` 因保留 "from memory" 字樣而仍為綠燈（此為既有結構性測試的回歸檢查，非本次修復的行為驗證——見 Stop Condition）。
6. 反例重現（無草稿）：
   ```bash
   cd /Users/gregho/GitHub/AI/arcforge
   node skills/arc-journaling/scripts/diary.js finalize --project doctest --date 2099-01-01 --session nodraft
   echo "exit=$?"
   ```
   預期 stderr 輸出 `No draft found at: .../diary-nodraft-draft.md`，`exit=1`，與文件 step 4 所述行為一致。
7. 正例重現（有草稿）：
   ```bash
   cd /Users/gregho/GitHub/AI/arcforge
   DRAFT=$(node -e "console.log(require('./scripts/lib/utils').getDiaryDraftPath('doctest','2099-01-01','hasdraft'))")
   mkdir -p "$(dirname "$DRAFT")" && echo "# stub draft" > "$DRAFT"
   node skills/arc-journaling/scripts/diary.js finalize --project doctest --date 2099-01-01 --session hasdraft
   ls "$(dirname "$DRAFT")"
   rm -rf ~/.arcforge/diaries/doctest
   ```
   預期輸出 `Finalized: .../diary-hasdraft.md`；`ls` 顯示 `diary-hasdraft.md` 存在、`diary-hasdraft-draft.md` 已不存在。
8. 人工讀測：找一位沒看過原稽核的人只讀「Draft Finalization Workflow」章節，應能正確覆述：(a) 草稿檔的確切路徑樣式、(b) `finalize` 是搬移而非合併，因此任何補寫內容必須先落到草稿檔再呼叫、(c) 有草稿待處理時不可使用 `save`。

**Stop Condition**

- 依 `.claude/rules/skills.md`：「若編輯改變了 skill 指示 agent 做什麼／如何決策，出貨前需重跑該 skill 的 eval」。本項新增的是行為性指示（草稿檢查、就地編輯、finalize 決策），但目前 arc-journaling **沒有任何行為性 eval**（`tests/skills/test_skill_arc_journaling.py` 僅為結構性 pytest，只檢查子字串存在，不驗證 agent 實際行為）。若準備出貨此文件修改，**先停下來問使用者**：(a) 要不要為 draft-finalization 這段新指示補一個最小行為 eval，還是 (b) 接受現有結構性測試作為本批次的足夠覆蓋、把 eval 缺口記為後續追蹤項——不要在沒有確認的情況下擅自選邊。
- 若在撰寫章節文字時發現 `diary.js finalize` 與 `auto-diary.js finalize` 的實際行為（錯誤訊息、路徑邏輯）已經或即將分岔，導致文件描述的指令輸出對不上任兩個實作中的任一個，停下來，將該分岔視為獨立的程式碼層級發現，不要在這個「純文件」項目裡順手修正兩支腳本的重複邏輯。
- 若 Acceptance Criteria #6/#7 的重現步驟實際跑出來的錯誤文字、結束碼或檔案行為與本項描述不符，停下來重新對照 `scripts/lib/utils.js::getDiaryDraftPath` 與 `skills/arc-journaling/scripts/diary.js` 的目前程式碼，修正文件敘述後才可繼續——不要憑印象改寫成猜測的行為。

**Decision Required**

是——上述「arc-evaluating 出貨門檻」屬於產品/流程層級的決定，不能機械推導：
- **選項 A**：在 `evals/`（或既有 evals 慣例目錄）下新增一個針對「看到 draft-ready nudge 後是否會 read → 就地補完 → finalize，而非 reflect-from-memory → save」的行為 eval，作為本次文件變更的出貨前置條件（增加範圍與時間）。
- **選項 B**：本批次僅以既有結構性 pytest（`test_skill_arc_journaling.py`）作為回歸保障出貨，並將「arc-journaling 缺少行為 eval」記錄為獨立的後續追蹤項（不在本項範圍內解決）。

兩者皆不應由實作者單方面靜默選擇；請使用者裁定後再繼續。

---

## Batch 8 — arc-writing-skills platform-location table fix

### batch8-1: arc-writing-skills 平台安裝路徑表格修正

**Files**:
- `skills/arc-writing-skills/SKILL.md` (lines 98–105, table under `### Skill Locations by Platform`)

**Problem**:
`skills/arc-writing-skills/SKILL.md` 的「Skill Locations by Platform」表格內容與 repo 自身的平台安裝文件矛盾且過時：Codex 列的路徑寫成 `~/.codex/skills/`，但 `.codex/INSTALL.md` 實際指示的是 `mkdir -p ~/.agents/skills` 再 symlink（`~/.agents/skills/arcforge` → `~/.agents/arcforge/skills`）；表格列出「Cursor」，但 Cursor 並非 arcforge 支援的平台（`CLAUDE.md` 與 `.claude/rules/plugin.md` 明確列出四個支援平台為 Claude Code、Codex、Gemini CLI、OpenCode，repo 中也確認無 `.cursor/` 目錄）；同時遺漏了實際支援的 OpenCode（依 `.opencode/INSTALL.md` 應為 `~/.config/opencode/skills/`）。維護者若依此表撰寫或審查平台相關內容（例如新增平台文件、回答使用者安裝問題）會被誤導成 arcforge 支援 Cursor、且會給出錯誤的 Codex 安裝路徑。

**Fix**:
將 SKILL.md 第 100–105 行的表格替換為以下內容（欄位語意維持為「該平台掃描 skills 的通用目錄」，與既有 `Claude Code | ~/.claude/skills/` 及 `Gemini | ~/.gemini/skills/` 兩列的語意一致，不混用 arcforge 專屬 symlink 路徑）：

```
| Platform | Skills Directory |
|----------|------------------|
| Claude Code | `~/.claude/skills/` |
| Codex | `~/.agents/skills/` |
| Gemini CLI | `~/.gemini/skills/` |
| OpenCode | `~/.config/opencode/skills/` |
```

並在表格下方新增一行註解（非強制格式，但需保留機制細節不遺失），例如：

> arcforge 本身透過 symlink 安裝進上述目錄：Codex 為 `~/.agents/skills/arcforge` → `~/.agents/arcforge/skills`（見 `.codex/INSTALL.md`）；OpenCode 為 `~/.config/opencode/skills/arcforge` → `~/.agents/arcforge/skills`（見 `.opencode/INSTALL.md`）；Gemini CLI 則是逐一 skill symlink 進 `~/.gemini/skills/`（見 `.gemini/INSTALL.md`）。

補充說明：原表格第三列寫的是「Gemini」，本次順手改為「Gemini CLI」以對齊 `CLAUDE.md` 與 `.claude/rules/plugin.md` 的canonical平台命名——這是本次表格重寫的附帶對齊，非稽核發現直接要求的核心修正項，供審查者知悉此非「超出範圍的新增」而是同一次表格編輯內的命名一致化。

**Acceptance Criteria**:
1. `grep -n "Cursor" skills/arc-writing-skills/SKILL.md` 回傳無匹配（exit code 1）。
2. `grep -n '~/.codex/skills/' skills/arc-writing-skills/SKILL.md` 回傳無匹配（exit code 1）。
3. `grep -n "OpenCode" skills/arc-writing-skills/SKILL.md` 有匹配，且該行位於「Skill Locations by Platform」表格內。
4. `grep -n '~/.agents/skills/' skills/arc-writing-skills/SKILL.md` 有匹配（Codex 列）。
5. `grep -n '~/.config/opencode/skills/' skills/arc-writing-skills/SKILL.md` 有匹配（OpenCode 列）。
6. 手動確認表格恰好有 4 個平台列，且平台名稱與順序與 `CLAUDE.md` 第 5 行「Claude Code, Codex, Gemini CLI, and OpenCode」一致（不多不少、不含 Cursor）。
7. 手動比對表格三個平台路徑與對應 INSTALL 文件一致：`.codex/INSTALL.md`（`~/.agents/skills` + symlink）、`.opencode/INSTALL.md`（`~/.config/opencode/skills` + symlink）、`.gemini/INSTALL.md`（`~/.gemini/skills` 逐一 symlink）。
8. 依 `.claude/rules/skills.md` 的 eval-gate 規則：本次編輯僅修正表格中的路徑/平台清單（reference 內容更正），不改變 `arc-writing-skills` 指示 agent 做的任何決策或行為，屬於「no behavioral footprint（metadata/reference-only）」的例外情形，**不需要**重跑 arc-evaluating。實作者應在 PR 描述中明確寫出此判定（例如「僅表格文字修正，無行為足跡，依 `.claude/rules/skills.md` 豁免 eval-gate」），不可留白讓下一位審查者自行猜測。

**Stop Condition**:
若在修正過程中發現 `.codex/INSTALL.md`、`.opencode/INSTALL.md` 或 `.gemini/INSTALL.md` 本身的安裝路徑已經與此讀取結果不同（例如它們之後又被其他 PR 修改過），則停止直接編輯此表格，先重新確認三份 INSTALL.md 的最新內容，再回頭核對此表格是否仍需要調整——不要在未重新核對來源文件的情況下憑記憶修改。若對「Skills Directory」欄位語意（通用掃描目錄 vs. arcforge 專屬 symlink 路徑）有不同意見導致無法決定要放哪種路徑形式，停止並詢問使用者採用哪種語意，而不要自行選擇後直接實作。

---

## Batch 9 — arc-learning legacy/global-scope description fix

Confirmed: `transitionCandidate` (line 246) matches on `candidate.id`, not `candidate_id`. All evidence checks out.

### B9-1: arc-learning SKILL.md legacy-CLI description is false for `--global` scope

- **Files**: `skills/arc-learning/SKILL.md` (line 33)

- **Problem**: SKILL.md 第 33 行宣稱 legacy 子指令（`analyze|review|inbox|approve|reject|materialize|activate|inspect|drafts`）「do not read or write the candidate queue」，但這只在 `--project` scope 下成立。在 `--global` scope 下，`scripts/lib/learning.js` 的 `getCandidateQueuePath`（62-69 行）解析出的路徑與 curator 的 canonical queue 完全相同（`~/.arcforge/learning/candidates/queue.jsonl`，已用 `node -e` 實測驗證路徑相等），因此 `arcforge learn review|inbox|inspect|drafts --global` 確定會讀取 curator 寫入的 canonical queue —— 這使得「不會讀取」的說法直接為假，會誤導使用者以為 legacy 指令與 dashboard/curator 資料完全隔離。次要風險：`arcforge learn approve <id> --global` 會走 `transitionCandidate`（237-260 行）→ 全檔覆寫 `rewriteCandidates`（225-235 行），且全程未取得 curator 在 `queue-writer.js` 定義的 `store.lock`；目前唯一擋住這條寫入路徑的是欄位名稱不巧不同（curator 記錄用 `candidate_id`，schema.js:179-183；legacy 用 `candidate.id` 比對，learning.js:246）導致 `findIndex` 找不到、提早拋出 `candidate not found`（learning.js:247），寫入通常不會真正發生 —— 但這是巧合而非設計上的保護，一旦欄位命名日後對齊，就會變成「無鎖全檔覆寫 curator queue」的實際資料損毀風險。`docs/guide/learning-dashboard.md` 49-55 行已經用明確的 `--project` 字樣限定這些 legacy 指令的說明，與 SKILL.md 的概括性說法不一致。

- **Fix**: 把 SKILL.md 第 33 行的概括說法改為依 scope 拆分：`--project` scope 維持原意（legacy 指令操作的是 project-local queue，與 dashboard/curator 無關），並新增 `--global` scope 的明確警告（讀取 canonical queue 是確定行為；寫入雖目前因欄位不符通常失敗，但屬於未上鎖的全檔覆寫，不應依賴）。

  具體替換第 33 行為以下文字（保留 "use the dashboard" 及 `analyze/approve/materialize/activate` 等字樣，維持既有 pytest 斷言通過）：

  ```
  Legacy `arcforge learn analyze|review|inbox|approve|reject|materialize|activate|inspect|drafts` subcommands remain in the CLI. Under `--project` scope they read/write a project-local queue that the dashboard and curator never touch — informational only, safe to ignore. Under `--global` scope, `review|inbox|inspect|drafts` read the *same* canonical `~/.arcforge/learning/candidates/queue.jsonl` file the curator populates (verify: `getCandidateQueuePath({scope:'global'})` in `scripts/lib/learning.js` resolves to the identical path as the curator's `queue-writer.js`); `approve|reject|materialize|activate --global` additionally rewrite that file wholesale without acquiring the curator's `store.lock` — do not run these against a queue the daemon/dashboard may be actively writing. Use the dashboard instead of any legacy subcommand, in either scope.
  ```

  （為何不能只是把 docs/guide/learning-dashboard.md 49-55 行的措辭原封搬過來：那段文字之所以「謹慎」，是因為它**完全不提** `--global` scope，只描述 `--project`；直接複製只會把「概括性錯誤」換成「概括性沉默」，一樣沒有告訴 `--global` 使用者實際會發生什麼。因此修法必須是「限定 `--project` 語意」+「明確補上 `--global` 的行為說明與風險警語」兩者都做，不能只做前者。)

- **Acceptance Criteria**:
  1. `grep -n "do not read or write the candidate queue" skills/arc-learning/SKILL.md` 回傳空（舊的錯誤概括陳述已被移除）。
  2. `grep -n -- "--global" skills/arc-learning/SKILL.md` 命中新增段落，且該行同時提到 `queue.jsonl` 與 `store.lock`（用 `grep -n "store.lock" skills/arc-learning/SKILL.md` 確認至少一處命中）。
  3. `grep -n "use the dashboard" skills/arc-learning/SKILL.md` 仍有命中（既有 pytest 斷言依賴此字串）。
  4. `node -e "const {getCandidateQueuePath}=require('./scripts/lib/learning'); const os=require('os'),path=require('path'); const g=getCandidateQueuePath({scope:'global'}); const c=path.join(os.homedir(),'.arcforge','learning','candidates','queue.jsonl'); console.log(g===c)"` 輸出 `true`（佐證修訂文字中「same canonical queue.jsonl」的宣稱屬實，供未來稽核者重驗）。
  5. `npm run test:skills`（或縮小範圍 `pytest tests/skills/test_skill_arc_learning.py -v`）全部通過，尤其 `test_documents_retired_legacy_cli`（斷言 `"use the dashboard"` 及 `analyze/approve/materialize/activate` 等字樣仍存在）。
  6. `npm run lint` 通過（若編輯以 Markdown 為主通常不受影響，但仍需確認不觸發既有 CI lint gate）。

- **Stop Condition**: 如果為了讓陳述完全正確，發現必須修改**程式碼**本身（例如讓 legacy `--global` 寫入指令直接拒絕執行、或改寫 `transitionCandidate`/`rewriteCandidates` 使其在 `--global` scope 下改走 curator 的 `store.lock`），而不只是修正文件用詞 —— 停下來，這已超出本項「stale doc」的範圍，應標記給維護者另開項目決定是否修程式碼。另外，如果修正後的文字迫使既有 `tests/skills/test_skill_arc_learning.py` 斷言需要跟著改（而不是新增文字後原斷言依然成立），也停下來，因為那意味著本次修訂動到了測試契約，需要額外確認是否在本 batch 授權範圍內。

---

All verification complete. Here is the drafted section.

## Batch 10 — Low-Severity Polish Sweep

52 筆低嚴重度發現逐一抽查後：41 筆可歸入 32 個檔案群組的機械式修正、5 筆列為不予處理（skip）、6 筆歸入需設計決策的獨立項目清單（pull-out，其中 arc-guard 1 筆、arc-using 3 筆、arc-writing-skills 1 筆、arc-maintaining-obsidian 1 筆）。以下先列修正項目，再列 skip 與 pull-out 清單，最後是整批的 Stop Condition。

### 修正項目（機械式一句話修正）

1. **skills/arc-auditing-spec/evals/README.md** — Fix：把「To be added in future output-and-interaction epics」表中已被 oi-002/oi-003/oi-004 三檔覆蓋的列移到「Landed」表，並補上 threshold-change1-coverage.md、threshold-change1-n-high-1-full.md 的收錄列。Verify：`ls skills/arc-auditing-spec/evals/*.md` 逐一對照 README 兩張表是否都列出。

2. **skills/arc-brainstorming/SKILL.md** — Fix：第 114 行「same as … above」改成「below」（D6 段落實際在第 172 行，位於本段之後）。Verify：`grep -n "Decision-Ledger Output (D6)" skills/arc-brainstorming/SKILL.md`。

3. **skills/arc-coordinating/SKILL.md** — Fix：第 41、67 行「skill loader header (`# SKILL_ROOT: ...`)」改為描述現行機制（`ARCFORGE_ROOT` 環境變數 + 第 44 行既有的 `: "${SKILL_ROOT:=...}"` fallback）；另第 21 行「except for `merge` (allowed)」補上「sync」為 worktree 內允許操作（CLI 的 `_syncWorktree --direction from-base` 已支援，docs/guide/worktree-workflow.md:347 視為正常流程），順帶解掉與 arc-implementing/SKILL.md:35 的矛盾。Verify：`grep -n "SKILL_ROOT: \|except for" skills/arc-coordinating/SKILL.md`。（旁註：同一句「# SKILL_ROOT: ...」措辭在 arc-planning、arc-recalling、arc-journaling、arc-reflecting、arc-observing 與 skills-reference.md:427 也重複出現，不在本次 52 筆之列，若採用本修正建議一併排查。）

4. **skills/arc-diagramming-obsidian/SKILL.md** — Fix：第 170 行「per Step 4」改為「per Process Invariants」（規則實際在第 31 行）。Verify：`grep -n "per Step 4\|Process Invariants" skills/arc-diagramming-obsidian/SKILL.md`。

5. **skills/arc-dispatching-parallel/SKILL.md** — Fix：第 211 行「the Step 4 verification gate」改為「the "Review and Integrate" gate (§4 of The Pattern)」，避免與 DAG 工作流自己的 Step 4（Present Parallelization Plan）混淆。Verify：`grep -n "Step 4 verification gate\|^### 4\." skills/arc-dispatching-parallel/SKILL.md`。

6. **skills/arc-dispatching-teammates/references/tmux-timing-race.md** — Fix：第 70 行「per Core Workflow step 6 continuous dispatch」改為「per Core Workflow Step 5 continuous dispatch」，與 SKILL.md 第 54 行現行編號同步。Verify：`grep -n "step 6 continuous dispatch" skills/arc-dispatching-teammates/references/tmux-timing-race.md`。

7. **skills/arc-dispatching-teammates/SKILL.md** — Fix：第 26 行「REQUIRED BACKGROUND: arc-using (injected at SessionStart)」移除「(injected at SessionStart)」括號，改為提示按需自行呼叫 arc-using。Verify：`grep -n "REQUIRED BACKGROUND" skills/arc-dispatching-teammates/SKILL.md`。

8. **skills/arc-learning/SKILL.md** — Fix：第 67 行「approve/reject, materialize, and activate via dashboard or CLI」刪掉「or CLI」（CLI 子指令已於第 31-33 行標示 Retired/Deprecated）；第 69 行「refuses to overwrite existing active artifacts」改為與第 46 行一致的「defaults to `supersede_with_backup`；only refuses when the policy is not `supersede_with_backup`」。Verify：`grep -n "via dashboard or CLI\|refuses to overwrite" skills/arc-learning/SKILL.md`。

9. **skills/arc-managing-sessions/SKILL.md** — Fix：frontmatter 的 `argument-hint` 補上 `handover [--mode quick|full|tail]`，置於現有 archive 子命令之前。Verify：`grep -n "argument-hint" skills/arc-managing-sessions/SKILL.md`。

10. **skills/arc-observing/SKILL.md** — Fix：Storage 樹狀圖第 90 行「.observer.pid」改為「.observer.lock/pid」，並將「~/.arcforge/instincts/config.json」改為「~/.arcforge/learning/config.json」（對照 scripts/lib/learning.js:57-59 的實際路徑）。Verify：`grep -n "observer.pid\|observer.lock\|instincts/config.json\|learning/config.json" skills/arc-observing/SKILL.md`。

11. **skills/arc-observing/scripts/observer-daemon.sh** — Fix：刪除第 16 行 `GLOBAL_INDEX=...` 與第 38 行 `OBSERVER_PROMPT=...` 兩個賦值後從未讀取的變數，讓 tests/run-tests.sh 對 `OBSERVER_PROMPT` 的環境變數設定不再被無條件覆寫。Verify：`grep -n "GLOBAL_INDEX\|OBSERVER_PROMPT" skills/arc-observing/scripts/observer-daemon.sh`。

12. **skills/arc-planning/SKILL.md** — Fix：第 83 行「Read `parsed.latest_delta`」改為「Read `header.latest_delta`」，與 Phase 1（第 59-69 行）欄位名稱一致。Verify：`grep -n "parsed\.latest_delta\|header\.latest_delta" skills/arc-planning/SKILL.md`。

13. **skills/arc-recalling/SKILL.md** — Fix：第 45 行「confidence: 0.50」改為反映 recall.js 預設 evidence-count=1 時實算的 0.55（或直接寫成公式 `min(0.9, 0.5 + 0.05*evidence_count)`）；Quick Reference 第 17 行的 save 指令範本補上 `[--evidence "..."] [--evidence-count N]`。Verify：`grep -n "confidence: 0.50\|--evidence" skills/arc-recalling/SKILL.md`。

14. **skills/arc-receiving-review/SKILL.md** — Fix：第 83 行「Called by: arc-agent-driven, arc-requesting-review」移除「arc-agent-driven,」（其 SKILL.md 與三個 prompt 檔均未引用本 skill）。Verify：`grep -rln "arc-receiving-review" skills/arc-agent-driven/` 應無輸出。

15. **skills/arc-using-worktrees/SKILL.md** — Fix：第 155 行「Called by: arc-coordinating (single-epic expansion)」移除「arc-coordinating (single-epic expansion),」（arc-coordinating 全文未呼叫本 skill，呼叫方向相反）。Verify：`grep -n "arc-using-worktrees" skills/arc-coordinating/SKILL.md` 應無輸出。

16. **skills/arc-researching/SKILL.md** — Fix：Phase 2 第 6 步的 dashboard 指令補上背景執行指示（例如「run in the background; do not block on this step」），避免前景阻塞式 HTTP server 卡住 session。（同檔案的 test_gap 發現已在 evals/skill-eval-coverage.md 記錄為已知缺口，非新問題，不予處理。）Verify：`grep -n "dashboard\|Press Ctrl+C\|background" skills/arc-researching/SKILL.md`。

17. **skills/arc-writing-skills/SKILL.md** — Fix：第 354-355 行 `./render-graphs.js ../some-skill` 範例改套用自己章節規定的 `${SKILL_ROOT}` 慣用寫法，例如 `"${SKILL_ROOT}/render-graphs.js" ../some-skill`。（字數超標另列入下方「需設計決策」清單。）Verify：`grep -n "render-graphs.js ../some-skill" skills/arc-writing-skills/SKILL.md`。

18. **hooks/__tests__/arc-guard.test.js**（main.js 的比對邏輯本身見下方「需設計決策」清單）— Fix：第 126-128 行「the --abort/--continue lookahead still applies through the `-C` operand」改為準確描述——`GIT_MERGE_RE` 對任何 `-C` 形式一律不匹配、與 lookahead 無關，`-C` 發起式 merge 因此不受 G2 攔截；並在 hooks/arc-guard/README.md 第 25-27 行補記此已知限制。Verify：`grep -n "the -C operand" hooks/__tests__/arc-guard.test.js`。

19. **hooks/arc-remind/main.js** — Fix：第 367-370 行移除 `bump('arc-remind-test-seen'); return;` 裡的 `return`，讓複合指令（如 `npm test && gh pr create`）記錄 test-seen 後仍會繼續判斷 `isPrBoundary`，並修正第 365-366 行「a test command is never also one of the trigger commands below」的失準註解。Verify：`node -e "const {isTestCommand,isPrBoundary}=require('./hooks/arc-remind/main');console.log(isTestCommand('npm test && gh pr create --fill'),isPrBoundary('npm test && gh pr create --fill'))"`（兩者皆為 true，即重現此 bug 的觸發條件）。

20. **hooks/compact-suggester/README.md** — Fix：「Output Examples」段落改成與 main.js 一致的單一格式「📊 ${count} tool calls (${label}) — possible compaction boundary. See arc-compacting for whether to /compact now.」，並補上 ICL-10 雙通道行為說明（threshold 命中時同時送出 additionalContext 的 arc-compacting indicator）。Verify：`grep -n "tool calls this session\|ICL-10" hooks/compact-suggester/README.md hooks/compact-suggester/main.js`。

21. **hooks/inject-skills/main.sh** — Fix：第 12、24 行 `echo ... >> "$CLAUDE_ENV_FILE"` 後補上 `|| true`，避免 `set -euo pipefail` 下寫入失敗時讓 bootstrap JSON 完全印不出來。（escape_for_json 缺少控制字元逃逸一項，屬 .claude/rules/hooks.md 明文允許的 bash 例外、僅病態輸入下失效，不予處理。）Verify：`sed -n '10,14p;22,26p' hooks/inject-skills/main.sh`。

22. **hooks/run-hook.cmd** — Fix：第 6 行 `HOOK_SCRIPT="$1"` 改為 `HOOK_SCRIPT="${1:-}"`，讓第 7-9 行的 `-z` usage 檢查可被執行到，而非被 `set -u` 提前以 unbound variable 中止。（`.cmd` 副檔名在 Windows 上無法用 bash 執行一事，檔案頂端已有自解釋的 NOTE 註解，CHANGELOG 的「Windows-compatible」字樣屬歷史紀錄不做回溯修改，故不另外處理。）Verify：`bash hooks/run-hook.cmd`（無參數執行，預期印出 Usage 而非 unbound variable 錯誤）。

23. **hooks/observe/** — Fix：比照其餘 10 個 hook 目錄慣例新增 `hooks/observe/README.md`（可依 hooks/README.md 第 47、79、86 行既有描述整理出最小版本）。Verify：`ls hooks/*/README.md | wc -l` 修正後應為 11。

24. **hooks/README.md** — Fix：pre-compact 一列描述從「Logs compaction event, marks session file with compaction timestamp」改為反映現行行為（門檻式 runDiaryCapture、重置 compact-suggester 狀態、排入 diary-ready pending action）；quality-check 一列（結構圖第 27 行 + PostToolUse 表格第 85 行）的觸發條件從「Edit on .ts/.tsx/.js/.jsx」改為「Edit|Write on .ts/.tsx/.js/.jsx」，與 hooks.json 第 112 行 matcher 一致。Verify：`grep -n "Logs compaction event\|Edit on \.ts" hooks/README.md`。

25. **hooks/pre-compact/main.js** — Fix：`updateSessionFile()` 內手組的 session 路徑改用 scripts/lib/utils.js 已匯出的 `getSessionFilePath()`，與同一 `main()` 內 `loadSession()`/`saveSession()` 共用同一套推導邏輯。Verify：`grep -n "getSessionDir\|getSessionFilePath" hooks/pre-compact/main.js`。

26. **hooks/sdd-ratify-guard/main.js** — Fix：module.exports 中 `sentinelPresent` 的註解「kept for backwards-compat with unit-test exports」改為準確描述（測試檔只 import `evaluate`，`sentinelPresent` 目前僅供第 54 行內部使用），或確認外部無人依賴後直接移除該匯出項。Verify：`grep -n "sentinelPresent" hooks/sdd-ratify-guard/main.js hooks/__tests__/sdd-ratify-guard.test.js`。

27. **hooks/session-tracker/README.md** — Fix：「Output Examples」改為現行輸出——SessionStart 顯示 instincts / pending actions / stale-draft 警告（非「Previous Session Context」摘要），SessionEnd 顯示門檻觸發時的「📝 Session paused ... Diary captured」；第 42 行「Records modified files from git status」改為「from transcript parsing (parseTranscript)」。Verify：`grep -n "Previous Session Context\|Records modified files" hooks/session-tracker/README.md`。

28. **hooks/session-tracker/start.js** — Fix：檔頭註解「import findRecentSessions、formatSessionContext … from inject-context.js」改為指向現行實際匯出的函式名（如 `loadAutoInstincts`、`loadPendingActions`）。Verify：`grep -n "findRecentSessions\|formatSessionContext" hooks/session-tracker/start.js`。

29. **hooks/user-message-counter/main.js** — Fix：第 5-7 行 docblock 與第 46 行「Export for use by session-tracker」改為「used by diary-capture.js (via createSessionCounter)」；第 31-33 行「for hook chaining」的註解修正為準確描述（hooks 之間不會把前一個的 stdout 接成下一個的 stdin），行為本身不動（e2e 測試已鎖定）。Verify：`grep -n "Export for use by session-tracker\|for hook chaining" hooks/user-message-counter/main.js`。

30. **README.md**（專案根目錄）— Fix：第 205 行 agent 表格 verifier 一列「(arc-verifying)」改為「(arc-dispatching-teammates / loop --verifier gate)」，並將第 139 行「All 33 skills」改為「All 32 skills」。Verify：`grep -n "verifier.*arc-verifying\|33 skills" README.md`。

31. **hooks/session-tracker/session.json.template** — Fix：刪除此死檔案（start.js 全程以 inline 物件建構 session JSON，從未讀取此 template），同步移除 hooks/README.md 第 42 行結構圖中的引用。Verify：`grep -rln "session.json.template" hooks/ scripts/` 修正後應無輸出。

32. **docs/guide/skills-reference.md** — Fix：第 3、62 行「33 個 skills」改為「32」，與文件自己逐條列出的清單對齊；arc-looping 條目的裸形式 `node scripts/cli.js loop ...` 改為 `node "${ARCFORGE_ROOT}/scripts/cli.js" loop ...`，符合 docs/guide/cli-invocation.md 的規範。Verify：`grep -n "33 skill\|node scripts/cli.js loop" docs/guide/skills-reference.md`。

### 不予處理（Skip）

- **skills/arc-evaluating/evals/evals.json** — 零引用的死檔案，但 methodology 標記為 skill-creator 慣例，可能供外部 plugin 工具讀取；刪除前需先確認有無外部消費者，屬調查而非機械修正，故不處理。
- **skills/arc-researching/SKILL.md 的 test_gap**（無行為 eval scenario）— 已由 evals/skill-eval-coverage.md 記錄為已知缺口，非新發現，不處理。
- **evals/skill-eval-coverage.md 對 arc-writing-tasks 的 test_gap** — 同上，已有記錄的既知缺口，不處理。
- **hooks/compact-suggester/main.js 的 `readCount`/`getStateFilePath`** 測試專用匯出 — 符合 .claude/rules/hooks.md 明文鼓勵的「測試用途匯出與 entry point 分離」慣例（user-message-counter 也是同一模式），死重量僅兩行別名，不值得為此churn。
- **hooks/inject-skills/main.sh 的 escape_for_json** 與 canonical escapeForJson 之間缺少控制字元逃逸的落差 — 屬 .claude/rules/hooks.md 明文允許的 bash 例外，只在路徑含控制字元的病態輸入下才失效，不處理。

### 需設計決策（Pull-out，非本批次機械修正範圍）

- **hooks/arc-guard/main.js 的 GIT_MERGE_RE 比對邏輯** — (a) `-C` 形式的發起式 merge 完全不受 G2 攔截，(b) 對整段指令做子字串匹配導致 `echo "git merge later"` 這類無害指令在 epic worktree 內被誤擋。修正需要重新設計比對策略（是否支援 `-C` 操作數、如何排除引號內文字）並補測試，非一行修正——請拉成獨立項目由 arc-guard owner 裁決方向。
- **skills/arc-using/SKILL.md 的三個路由缺口**（arc-managing-sessions、arc-researching、arc-writing-tasks 均未列入路由表）— arc-using 依 architecture.md 是刻意的 bounded router，另有其餘 skills 同樣未列入；是否擴大路由範圍屬 router 的邊界政策決定——請拉成獨立項目請 arc-using 維護者裁決。
- **skills/arc-writing-skills/SKILL.md 字數超標**（3598 字 vs. 自訂 Meta 類 <2500 字上限，超出約 44%）— 修正需要決定砍哪些段落或外移到 references/（如與 testing-skills-with-subagents.md 重疊的部分），屬編輯裁量——請拉成獨立項目排入下一輪內容瘦身。
- **skills/arc-maintaining-obsidian/evals/evals.json 的過時 eval** — 兩個情境的 expected_output 建立在已被現行 vault-contract 封鎖設計取代的行為之上，修正需要重新設計 scenario 的 prompt/expected_output 以符合現行 block-first 規則——請拉成獨立項目請 arc-evaluating owner 重新編寫。

### Stop Condition（整批適用）

若本批次任何一項在實際動手修正時，發現它其實需要一個設計決策（例如：要不要擴大 router 涵蓋範圍、要不要改變某個 hook 的攔截語意、要刪去多少內容），而不是單純的文字/一行程式碼機械修正——立刻把該項目拉出這個批次，另開一個獨立項目並標記清楚，不要硬塞進本輕量批次裡處理。

---

## Definition of Done

本計畫視為完成，需同時滿足以下條件：

1. **35 筆已確認發現逐一有交代。** 每一筆 confirmed finding（含 Batch 1–9 內所有帶編號的項目，如 B1-1…B1-9、TS-1、DOC-1、R3-1…R3-4、AE-1…AE-4、B5-1、B5-2、batch6-1…batch6-4、B7-1、batch8-1、B9-1）都必須有下列兩者之一：
   - 一個已合併的 commit 參照（commit hash 或 PR 連結），且該 commit 的 diff 內容對應得上該 finding 的 Fix 描述；或
   - 一則明確的「no action — reason」註記（例如：該項因使用者選擇某個 Decision 選項而判定不需改動、或該項與另一 finding 重複而合併處理）。
   對於**逐字重複的發現**（B1-5 與 Batch 10 #31、R3-3 與 batch6-4、B5-1 技能總數與 Batch 10 #32），兩個 id 只需對應**同一個** commit；未實際套用第二次編輯的那個 id，應標記為「covered by <另一 id 的 commit 參照>」，而不是留白或被誤判為「未處理」。

2. **上方 Decisions Needed 清單中第 1–9 項（批次內明確標記的 Decision Required）全部已由使用者裁定**，且裁定結果已反映在對應批次的實作中（選了哪個選項、為什麼選、對應的驗收標準是否因選項不同而調整，都應可從最終 diff 或 PR 描述回溯）。第 10–13 項（Batch 10 拉出的設計決策：arc-guard 比對邏輯、arc-using 路由缺口、arc-writing-skills 字數瘦身、arc-maintaining-obsidian 過時 eval）**不是**本計畫完成的必要條件——它們已被明確判定為超出本次機械/低嚴重度批次範圍，應拆成獨立的後續項目追蹤；本計畫完成的要求只是「這 4 項已被登記為獨立追蹤項、沒有在合併過程中悄悄消失」，不要求在本分支上解決它們。

3. **`npm test`（5 個 runner 全綠）與 `npm run lint` 在分支最終狀態下皆為綠燈。** 不是「每個批次各自綠燈後就忘記」，而是所有批次疊加完畢後，在 `fix/skills-hooks-audit-remediation` 分支的最終 HEAD 上重新完整跑一次，確認批次之間彼此疊加沒有產生新的交互作用問題（尤其是上方 Execution Order 提到的多處同檔案、不同批次的疊加編輯點）。

4. **沒有掉入 Global Rules (d) 所禁止的範圍蔓延。** 抽查最終 diff，每一處變更都能對應回某個 finding id；若發現有無法追溯來源的「順手改動」，視為未完成，需回頭要嘛補上對應 finding、要嘛還原該處改動。
