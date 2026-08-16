# P4 落點對照表 — code-review 吸收來源逐條對照

> P4 gate 的人工 AC 交付物（verifier 覆核載體）。產出者：p4-finisher 稽核 worker；
> 持久化：orchestrator（P4 gate FAIL 補救——原表只存在於 agent 訊息中，不可覆核）。
> 來源七份，主張逐條列出：**落地 / 部分 / 捨棄（附理由）/ 反轉（附理由）**。

## 縮寫

- **S1–S4** = `skills/code-review/SKILL.md` Step 1–4
- **ATR** = 同檔 `## Answering the review`；**OPEN** = `### Openings that are not answers`
- **PUSH** = `### Push back when`；**RF** = `## Red flags`
- **CE** = `skills/code-review/references/completion-evidence.md`

## 統計

**73 條**（A10 / B14 / C6 / D15 / D′11 / E11 / F6）→ 落地或部分 **58**｜完全捨棄 **14**｜純冗餘 **1**。
完全捨棄五類：①載體消失（P2 刪 agents/templates/SDD）②與反諂媚紀律直接矛盾
③無 file:line 錨點的普適評語（no-op 且排擠真 finding）④第二份事實來源 ⑤開後門或無停止條件。
**6 條刻意反轉**（勿讀成遺漏）：B7b、C1、C5/D'8、D8、D9、B3。

## A. `gate-p1:agents/code-reviewer.md`（48 行）

| # | 來源主張 | 落點 |
|---|---|---|
| A1 | agent 身分／`model: opus`／description | **捨棄** — P2 刪 `agents/`；v6 以內聯 prompt dispatch，模型選擇交呼叫端 |
| A2 | Plan Alignment：比對原始計畫、指出偏離、確認功能都實作 | **S3 Part 1**（Missing/Extra/Misunderstood 三分） |
| A3 | Code Quality：慣例、錯誤處理、型別安全、組織命名、測試覆蓋、安全、效能 | **S3 Part 2** |
| A4 | Architecture：SOLID／關注點分離／鬆耦合／整合／可擴展性 | **部分** — 關注點分離進 S3 Part 2；SOLID/可擴展性/鬆耦合捨棄：普適架構口號不是觀察到的 baseline 失敗，只會逼出無 file:line 的抽象評論 |
| A5 | Documentation and Standards：註解/檔頭/專案編碼標準 | **捨棄** — 各專案 linter 的事，已由 S1 承接；再查一次是重工且會蓋掉真缺陷 |
| A6 | 嚴重度三分 + 具體例子 + 可執行建議 | **S3 Part 2** + S3 收尾（file:line／impact／fix）。`Suggestions`→`Minor` 統一字彙 |
| A7a | 偏離重大時請 coding agent 確認 | **捨棄** — v6 reviewer 是單次唯讀回報；追問等於把驗證責任推回被審方 |
| A7b | 計畫本身有問題就建議更新計畫 | **S3 Part 2 保留為更強形式** — 「計畫要求的缺陷仍是 finding，標 plan-mandated」 |
| A7c | 「Always acknowledge what was done well before highlighting issues」 | **捨棄（刻意反轉）** — 正是 P4 要消滅的諂媚開場；留著與 OPEN 表直接矛盾 |
| A8 | 「structured, actionable, thorough but concise」收尾語 | **捨棄** — 無行為足跡的形容詞堆疊 |

## B. `gate-p1:agents/task-reviewer.md`（76 行）

| # | 來源主張 | 落點 |
|---|---|---|
| B1 | 一趟讀完回兩個 verdict；whole-branch review 另辦 | **S3 骨幹 + S4** — "Return exactly these two parts, in this order, each with its own verdict line"。整支 skill 的中心 |
| B2 | 唯讀工具 + 只跑單一聚焦測試 | **部分** — 顯式 tool 白名單捨棄（無 agent 檔可放），改由 prompt 行為約束達成同效 |
| B3 | 指向 `templates/task-reviewer-prompt.md` | **指標捨棄、契約全內聯（反轉）** — templates/ P2 已刪；外部路徑指標違反 D1。契約分別落到 B1/B6/B4/A6；tests-already-ran 反轉見 B7b |
| B4 | 不信實作者報告；「YAGNI/刻意從簡」本身也是主張，永不降 severity | **S3 近乎逐字保留** + RF「the summary is the claim under test」 |
| B5a | review package（commit list + `--stat` + `-U10`），讀一次 | **部分** — 保留 `--stat` + `-U10` 兩行；預建 package 捨棄（SDD 工作區產物，P2 已刪） |
| B5b | 絕不 `HEAD~1` | **S2 + RF 保留**（含多 commit 被截斷的理由；另補 blank/HEAD/「look at my recent changes」與「asked to skip for speed」堵漏） |
| B5c | 只為具名風險看 change 以外的碼 | **S3 更嚴** — "Report only what you read in the diff."；代價由 B6 承接 |
| B6 | Part 1 三分 + ⚠️ Cannot verify from diff（說出呼叫端該查什麼，就地停） | **S3 Part 1 全數保留**（emoji 去除，語意不變） |
| B7a | Part 2 覆蓋每一個改動過的函式 | **S3 Part 2** — "Assess every changed function, not only the ones a requirement covers" |
| B7b | 「實作者已跑過測試 — 不要重跑 suite」 | **反轉，反轉點在派工端** — 跑測試上移為 S1（第一步、派工者自己跑、紅燈停），reviewer 端只讀 diff。淨效果相同（reviewer 不跑 suite）但責任歸屬相反：原檔信實作者，v6 不信 |
| B7c | 錯誤處理分層／cleanup／DRY／edge cases／security／test quality／size | **S3 Part 2 濃縮保留**；arcforge 專屬三層分層規則捨棄（單一專案約定不得內建於出貨 skill） |
| B7d | 計畫明訂的缺陷仍是 finding，標 plan-mandated | **S3 Part 2 + RF 保留**；唯一改動：不再硬指定 Important，改「by actual impact」避免與 A6 打架 |
| B7e | Part 2 verdict Approved/Needs fixes | **S3** — "Verdict: APPROVED \| NEEDS FIXES" |
| B8 | Critical Rules 1–5 | **純冗餘** = B4/B1/A6/B5c/B7b，無新增內容 |

## C. `gate-p1:agents/spec-reviewer.md`（93 行）

| # | 來源主張 | 落點 |
|---|---|---|
| C1 | 獨立第一道 spec 閘，跑在 quality review 之前 | **形式捨棄、實質保留（反轉）** — v6 是一趟兩軸不是兩趟兩階段；「先後」由 "in this order" + S4 呈現順序承接。兩趟 = 讀兩次 diff，成本翻倍無額外訊號 |
| C2 | 唯讀工具 Read/Grep/Glob | **捨棄** — 同 B2 |
| C3 | 不信實作者報告（Never/Always 兩組清單） | **與 B4 合流至 S3**，單一事實來源 |
| C4 | Three-Check 細部定義 | **S3 Part 1 濃縮保留**（判別核心全在）；子條列舉例捨棄：同一判準的例子不是新規則 |
| C5 | PASS/FAIL 兩個輸出樣板區塊 | **樣板捨棄、必填槽位保留（反轉）** — 保留 verdict line + file:line + impact + fix 三槽。兩份來源（C5/D'8）樣板互斥，硬留會出現兩種輸出形狀 |
| C6 | Critical Rules，末條「spec compliance 先於 code quality，不得混談」 | **升格為 S4 主段** — 本 skill 的存在理由；S4 Done-when 與 RF 各釘一次。其餘四條 = C3/C4 重複 |

## D. `gate-p3:skills/arc-reviewing/SKILL.md`（144 行）

| # | 來源主張 | 落點 |
|---|---|---|
| D1 | description：request review + 以技術嚴謹處理回饋 | **frontmatter 保留語意**（兩半都在 trigger 內，符合 register） |
| D2 | When to Request Review（Mandatory 3 + Optional 3） | **捨棄（上移 description）** — model-invoked 的觸發條件屬 description；body 再列一次是兩份事實來源，Optional 三條無 baseline 失敗支撐 |
| D3 | 取 SHA 的 bash（`TASK_BASE_SHA` fallback `git merge-base`）+ never HEAD~1 | **S2 逐字保留** + P4 新增堵漏（見 B5b） |
| D4 | 用 code-reviewer.md 範本檔 dispatch，填 5 個 placeholder | **S3 改內聯**；槽位 5→4（REQUIREMENTS/IMPLEMENTER_REPORT/BASE/HEAD）。WHAT_WAS_IMPLEMENTED+DESCRIPTION 合併捨棄：都是實作者自述，降級為單一「待驗證主張」槽 |
| D5 | Triage：Critical 立刻／Important 先修／Minor 記下／錯就 push back | **ATR 第 4 步** |
| D6 | Worked Example（Task 2 完整示範） | **捨棄** — 綁 SDD 世界觀（P2 已刪），占 ~30 行 budget 不新增規則 |
| D7 | Verify before implementing / Ask before assuming / 技術正確優於社交舒適 | **ATR 開場改可執行形式** — "Feedback is a claim about the code, not an instruction to change it." |
| D8 | Response Pattern 六步 | **ATR 五步（反轉）** — EVALUATE+RESPOND 併為 Decide（可觀察產物同為一個 per-item 決定）；每步補上可檢查內容 |
| D9 | Forbidden Responses 四條禁令 | **OPEN 表升級為「Instead of → Write」對照表（反轉）** — 對 shaping failure 用純禁令實測會產出更多不想要的輸出 |
| D10 | Unclear Feedback：STOP，一次問完所有不清楚項 | **ATR 第 2 步保留** |
| D11 | Source-Specific Handling（人類夥伴 = 可信） | **捨棄** — 按來源分級開「夥伴說的不必驗證」後門，正是 No nuance clauses 點名的重開談判形狀 |
| D12 | When To Push Back 四條 + 兩段話術 | **PUSH 表保留四條並補「Evidence that settles it」欄**；話術捨棄（例句是措辭不是規則） |
| D13 | YAGNI Check（grep 用量 → 沒人叫就問移掉） | **PUSH 表第 2 列保留** |
| D14 | Review Loop → 重審至 approve → arc-verifying → /finishing | **部分** — 收尾改「答完 + 檢查回綠 → `/finishing`」。arc-verifying 這一站消失（整份成為 CE）；無界重審迴圈捨棄（無停止條件），改以「每個 finding 配上改動或成立理由」為可檢查終點 |
| D15 | Integration 段 | **捨棄** — skill 關係由 router 單一承載，再寫一份是第二份路由表 |

## D′. `gate-p3:skills/arc-reviewing/code-reviewer.md`（146 行，被 dispatch 的範本）

| # | 來源主張 | 落點 |
|---|---|---|
| D'1 | 任務框架五點 | 前四點 → S3（見 A2/A3/A6）；production readiness 見 D'7 |
| D'2 | 四槽位 + 兩行 git diff | **S3 保留並收緊**（槽位改 4 個；diff 加 `-U10`） |
| D'3 | Checklist — Code Quality | **S3 Part 2**（型別安全併入語言無關敘述；DRY → duplication） |
| D'4 | Checklist — Architecture（設計合理／scalability／performance／security） | **僅 security 保留** — 其餘捨棄：無 file:line 錨點的主觀評語（no-op），排擠有錨點的 finding |
| D'5 | Checklist — Testing | 拆兩處 — test quality → S3 Part 2；all tests passing → S1（派工前跑，不由 reviewer 判斷） |
| D'6 | Checklist — Requirements | **S3 Part 1**（scope creep = Extra）；breaking changes documented 捨棄（S1 + `/finishing` 承接） |
| D'7 | Checklist — Production Readiness（migration／相容性／文件／no obvious bugs） | **整段捨棄** — 四條無一能從 diff 判定，要求回答只會逼出臆測；對應機制是 Cannot verify from diff |
| D'8 | Output Format：Strengths／Issues／Recommendations／Assessment(Ready to merge?) | **形狀被取代（反轉）** — 改 `## Part 1` + `## Part 2` 各帶 verdict。Strengths 捨棄（反諂媚）；Recommendations 捨棄（無 file:line 建議欄）；單一 "Ready to merge?" 捨棄——單一總 verdict 正是 two-axis eval 判 0 分的形狀 |
| D'9 | 每個 issue 要有 file:line／哪裡錯／為何重要／怎麼修 | **S3 收尾逐字保留** |
| D'10 | Critical Rules DO/DON'T 十條 | 五條保留（= A6/D'9/D'9/B1+B7e/B5c）；acknowledge strengths 捨棄（同 A7c）；其餘 DON'T 為冗餘 |
| D'11 | 長篇 Example Output（~40 行） | **捨棄** — 示範的正是 D'8 已被取代的單一嚴重度清單形狀，留著直接抵銷 S4 |

## E. `gate-p3:skills/arc-verifying/SKILL.md`（111 行，整支被 CE 吸收）

| # | 來源主張 | 落點 |
|---|---|---|
| E1 | 「未經驗證就宣稱完成是不誠實，不是效率」 | **CE 開場** — 去道德指控，保留可觀察後果 |
| E2 | Boundary 段（未來的 arc-syncing-spec） | **捨棄** — 為一支從未出貨的 skill 而寫的邊界宣告 |
| E3 | Iron Law：沒在這則訊息跑過就不能說它過 | **CE 逐字保留** — "Evidence produced earlier describes an earlier tree." |
| E4 | Gate Function 五步 | **CE `## The gate` 五步保留**；「Skip any step = lying」捨棄（道德標籤不改變行為） |
| E5 | Common Failures 五列 | **CE 擴充至 7 列** — 新增 "Nothing else broke" 與 "Review answered"（後者把 CE 縫回 code-review） |
| E6 | Red/Green 三步 | **CE 逐字保留** |
| E7 | Requirements Verification | **CE 保留並收緊** — 補「只報通過項的清單等於宣稱其餘不存在」 |
| E8 | 無法驗證時三列情境表 | **CE 保留三列** |
| E9 | Red Flags 八項 | **拆兩處** — 措辭類 → CE `## Words that mean the evidence is missing`；其餘 → CE Rationalizations。「Feeling tired」捨棄：情緒不是可觀察述詞 |
| E10 | Rationalization Prevention 十列 | **CE 九列保留** + 新增「The logs look fine」「Too simple to check」 |
| E11 | Integration（顯式呼叫、嵌在他處） | **捨棄，由 P4 裁決取代** — completion-evidence 不是 skill；reference 檔 + 各 skill 就地內聯。無 router 列、無 invocation 類別 |

## F. `gate-p1:agents/verifier.md`（80 行；AC 點名來源，原表漏標——本節補齊）

> 注意：`scripts/lib/prompts/verifier.md` 是同一內容的引擎副本，**仍活著**、由
> loop-verifier 消費（P2 搬遷）。本節的「吸收」指 code-review/CE 對其概念的承接，
> 引擎副本不受影響。對應關係經 verifier 探針逐條核實（P4 gate 覆核報告 §抽驗 4）。

| # | 來源主張 | 落點 |
|---|---|---|
| F1 | 身分：無實作 context 的獨立驗證者，不採信自報 | **S3 dispatch 框架**（fresh subagent、只讀 diff + 主張）+ B4 合流 |
| F2 | 五步 Gate Function：命名指令→現在跑→讀完整輸出→比對主張→據輸出陳述 | **CE `## The gate` 五步一一對應** |
| F3 | 「Verified no regressions (full test suite)」 | **CE Common Failures「Nothing else broke \| Full-suite run after the change」** |
| F4 | 「Found the implementing code (file:line)」 | **CE「Requirements met \| 逐項 file:line」** |
| F5 | Never Accept 四句（"Should work now" / "I ran it earlier" / "The agent said it succeeded"…） | **CE Rationalizations 表逐句對應** |
| F6 | 檢查有無多做（scope beyond the task） | **S3 Part 1 的 Extra 分類** |

---

## 附錄：two-axis result 池排除紀錄（可重現性存檔）

- **被排除的 run**：`evals/results/eval-code-review-two-axis/20260813-005153`
  （另兩個 8/1 目錄 `20260801-063901`、`20260801-064449` 只有 transcripts+grading、
  無 .jsonl，對 pooling 貢獻為 0，一併移出）
- **排除理由**：該 run 執行於舊儀器（trial timeout 300s）。treatment 5 趟中 4 趟
  duration 釘在 302,333–302,568 ms（= 300s 上限 + kill overhead），其中 3 趟被
  SIGTERM 砍在兩軸報告產出之前、半截 transcript 以 0.2 計分；這些列不帶
  `gradeError`/`infraError` 旗標，不會被 `scorableResults()` 自動排除（儀器缺陷 A，
  掛帳 P7）。baseline 兩次 run 均遠低於上限（max 233.7k ms）——偏誤單向不利
  treatment。
- **處置**：整 run 對稱移除（兩 condition 一起），移至 session scratchpad
  `quarantine-two-axis/`（非破壞性；該路徑會被 GC，故本紀錄為耐久證據）。
  headline 數字 **+0.40 CI[0.4,0.4]** 出自儀器修正（timeout 600s，
  `scripts/lib/eval.js`）後的乾淨 run `20260813-031707`（5v5，無 error 旗標）。
- **舊 run 關鍵數據存檔**：treatment durations = 302568/302561/302548/160429/302333 ms；
  scores = 0.2/0.2/0.2/1.0/1.0；被砍且完成報告的 trial 5（302,333ms、1.0）證明
  「killed ≠ 無效量測」，故 P7 的缺陷 A 修法必須是「killed 且最終輸出未完成」。
