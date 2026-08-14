# v6 Invocation 二分表（P3 定案）

> 逐支記錄 v6 目標 skill 集的 invocation 類別與**理由**。規格在
> `decisions/skill-schema.md` §3（不得在此重定義）；本檔記的是決策與其依據。
>
> **真值來源是 frontmatter**，不是本表。已落地的四支，下表的類別直接由
> `skills/<name>/SKILL.md` 的 `disable-model-invocation` 讀出；本表與檔案不一致時，
> 以檔案為準並修本表。

## 硬規則（每一列都受這四條約束）

1. **每支恰屬一類**，由 `disable-model-invocation` 決定：缺省 = model-invoked，
   `true` = user-invoked。沒有第三類，沒有「兩者皆可」。
2. **user-invoked 不可被其他 skill 的內文 prose-invoke**（schema §3.1）。
   user-invoked 代表「使用者顯式意圖」的入口，別的 skill 用 `/name` 叫它等於
   繞過那道意圖閘。守衛：`test_user_invoked_skills_are_not_prose_invoked`。
3. **豁免只有一個**：`skills/using` 的 `## Skill Map` 表列是**索引**，不是呼叫。
   沒有這條豁免，§3.1 與 router bijection 直接互斥。索引列在 Use-when 欄尾標注
   `(user-invoked)`，讓讀者看得出該列不是可被呼叫的入口。
4. **description register 跟著類別切換**：model-invoked 走
   `<identity>. Use when <triggers>`（60–280 字元）；user-invoked 走純人話一行
   （≤120 字元、不得出現 `use when`）。守衛：`test_description_register`。

判準只有一句（`skills/writing-skills/` 的教學面）：**agent 該不該自己伸手去拿？**
使用頻率不是判準——每天都用的 skill，只要自行載入會打斷無關工作，仍是 user-invoked。

## 已落地（P3–P4，類別由 frontmatter 讀出）

| Skill | 類別 | 理由 |
|---|---|---|
| `using` | model-invoked | router 的價值在使用者**不知道**該用哪支時自動出現；要求先打 `/using` 等於要求使用者先知道答案。 |
| `writing-skills` | **user-invoked** | 撰寫方法論是人刻意開始的工作；在無關任務中途自行載入只會把 authoring 規則套到不是 authoring 的事情上。 |
| `tdd` | model-invoked | 觸發條件（要動實作碼、修 bug、發現沒測試的碼）出現在任務中途，等使用者想起來喊就已經來不及——碼已經寫下去了。 |
| `finishing` | model-invoked | 觸發條件（實作完成、分支待處理）同樣是任務中途的狀態；這支存在的目的正是攔下「順手合併」，靠使用者主動呼叫就攔不到。 |
| `debugging` | model-invoked | P4 重新推導維持預填值：觸發條件是「有個失敗還解釋不了」，它在任務中途冒出來，而且第一個動作就決定了結果——等使用者想起來打 `/debugging`，那個要被攔下的猜測式修補通常已經送出去了。壓力最大的時點（趕發版、使用者直接遞來一個 patch）正是最不可能有人記得呼叫的時點。 |
| `code-review` | model-invoked | P4 重新推導維持預填值：觸發條件是「有一份改動已經寫完、要交出去」，這是任務中途的狀態，agent 比使用者更早看見。要求使用者記得喊 `/code-review` 的失敗模式是不對稱的——記得喊的那次通常本來就會被審，忘記喊的那次正是最該被審的那次（趕時間、覺得改動很小、對自己的實作有信心）。回饋回來要處理的那半同理：回饋抵達時 agent 正在讀它，此刻才是紀律要生效的時點。 |
| `completion-evidence` | **不是 skill（P4 裁決）** | 判準問「agent 該不該自己伸手去拿」，但這支的內容是「宣稱完成前要有證據」——一個會在它最該生效時被略過的 agent，同樣不會伸手去載入它；一個會伸手的 agent 已經在遵守它了。獨立成 skill 的結構是自我否證的。改以 `skills/code-review/references/completion-evidence.md` 承載（查表面），並由各 skill 在自己的完成判準內就地內聯。**無 router 列、無 invocation 類別**——reference 檔兩者皆不需要，schema §5.3 的 supporting-file 存在性守衛即為其把關。 |
| `sessions` | model-invoked | P4 重新推導維持預填值：觸發條件是「工作要停在半途、之後要被別人或明天的自己接手」。使用者說「我先走了」時已經在離場，此刻要求他先想起打 `/sessions` 正好落在最不可能發生的時點；agent 該自己伸手。resume 方向同理——使用者說「昨天做到哪」時要的是狀態，不是先學會一個指令名。 |
| `learning` | **user-invoked** | P5 重新推導維持預填值，但依據與預填不同。預填說的是「控制面＝使用者的決定」；重推導後真正的依據是**自動化已經不在 skill 這一層**：diary 草稿由 PreCompact/Stop hook 自動產生，observation→candidate 由 daemon＋curator 自動跑完。skill 手上只剩下**人要拍板的那一半**——要不要留這篇 diary、三篇算不算 pattern、這條 instinct 該不該存、要不要啟用。這半邊照定義不該由 agent 自己伸手。<br><br>第二個依據：這個子系統**預設關閉**。做成 model-invoked，等於在每一輪無關對話上收 cognitive load，去評估一個多數使用者根本沒開的功能——成本天天付，觸發條件多半不成立。<br><br>反向檢查（推翻預填的機會）：hook 確實會在 diary 草稿就緒／反思到期時發 nudge，看似「條件在任務中途出現、agent 該自己接手」。但 nudge 的存在正好是 user-invoked 的證據而非反證——系統已經把這件事建模成「提示人、等人決定」。既然如此，nudge 措辭本次一併從「叫模型去 invoke」改為「告訴使用者可以執行」（`hooks/session-tracker/inject-context.js`），讓載體與類別一致。<br><br>連帶效果：這是第二支 user-invoked skill，清掉 P3 掛帳的 §3.1／§5.2 mutation 重跑（見 `p5-absorption-learning.md` §5）。 |
| `evaluating` | model-invoked | P5 重新推導維持預填值，但理由換成**不對稱失敗**（預填只寫「條件在任務中途成立」，那對 user-invoked 也成立，不構成判準）：觸發條件是「有一組數字回來了、有人正要從它讀出一個結論」。記得喊 `/evaluating` 的那次，通常本來就會謹慎看區間；忘記喊的那次正是最該被攔的那次——delta 是正的、期限在逼、treatment 綠了。**考慮過並否決 user-invoked**：`learning` 與 `looping` 之所以是 user-invoked，是因為它們動使用者的環境或花使用者的錢，agent 自行啟動等於自我授權。`evaluating` 兩者皆非——它只判斷一個**已經在場**的主張，不寫入任何使用者狀態、不啟動無人值守迴圈；沒有需要被 gate 的授權，就沒有理由要求使用者先知道答案。 |
| `diagramming-obsidian` | model-invoked | P5 重新推導維持預填值：觸發條件是「這件事講不清楚，需要一張圖」——它在解釋途中冒出來，而且最常由 agent 先察覺（`maintaining-obsidian` 的 Visuals 步驟走到 Q4 就是這個時點）。要求使用者先打 `/diagramming-obsidian` 等於要求他在還沒看到解釋之前就決定需要圖。**另有結構性約束**：本支是 `maintaining-obsidian` 的 prose 委派 target，依 schema §3.1，user-invoked 不可被 prose-invoke——落地為 user-invoked 會使那條委派非法，只能改成叫使用者手動轉場，而委派發生的時點（ingest 途中）使用者不在場。判準與守衛在此指向同一結論。 |
| `dispatching` | model-invoked | **P6 合併裁決：`worktrees` 併入本支**，預填的兩列合為一列（下表同時刪去 `worktrees` 列）。合併理由不是「都跟平行有關」，而是**兩者是同一個決定的兩半**：舊 `arc-using-worktrees` 的全部內容是「工作需要隔離時怎麼取得一棵樹」，而唯一會讓那個需求同時發生在多處的條件就是派工——把隔離獨立成 skill，等於要求 agent 在派工中途另外想起第二支 skill，而漏掉它的後果（兩個 agent 寫同一個 checkout）正是派工最貴的失效。合併後隔離成為 Step 2 的前提，不再是可選的鄰居。<br><br>類別重推導（預填兩列皆為 model-invoked，本次維持但依據改寫）：預填寫的是「條件在動手前成立」——那對 user-invoked 也成立，不構成判準。真正的依據是**不對稱失敗**：觸發條件是「手上的工作大到想分出去」，而這個念頭出現時 agent 正在做拆分的那個決定。記得喊 `/dispatching` 的那次通常本來就會謹慎拆；忘記喊的那次正是最該被攔的那次（趕時間、覺得三件事互不相干、對自己的分組有信心）。驗收那半同理——報告抵達時 agent 正在讀它，此刻才是「不採信自報」要生效的時點，使用者看不到那份報告，無從呼叫。<br><br>**考慮過並否決 user-invoked**：`looping` 與 `learning` 之所以是 user-invoked，是因為它們在使用者離席時持續花錢改碼、或動使用者的長期狀態，agent 自行啟動等於自我授權。`dispatching` 兩者皆非——它派出去的 agent 全程在使用者的 session 內、不啟動無人值守迴圈、不寫入任何使用者長期狀態；沒有需要被 gate 的授權，就沒有理由要求使用者先知道答案。 |
| `brainstorming` | model-invoked | P6 重新推導維持預填值，但依據比預填強：預填寫「從第一句話就看得出來」——那對 user-invoked 也成立。真正的依據是**這個條件使用者看不見**：請求之所以未收斂，正是因為提出的人覺得它已經夠清楚（「clarity is what an assumption feels like from the inside」，寫進 skill 本文）。要求先打 `/brainstorming` 等於要求使用者先察覺自己的請求含糊——與 `using` 同構的失敗。<br><br>反向檢查（推翻預填的機會）：`learning`／`looping` 是 user-invoked，因為它們動使用者的環境或在無人監督下花錢，agent 自行啟動等於自我授權。`brainstorming` 兩者皆非——它只是一段對話，不寫入任何使用者狀態、不啟動任何無人值守流程。沒有需要被 gate 的授權，就沒有理由把入口綁在使用者的記憶上。 |
| `executing` | model-invoked | P6 重新推導維持預填值，但預填的依據（「已有一份清單待執行」）在合併後不足以涵蓋本支——它同時包含**寫清單**與**走開模式開關**，兩者都不在預填的射程內。<br><br>依據一（不對稱失敗）：本支要攔的失敗——進度只留在 context 裡、沒跑 `verify:` 就打 `[x]`、重做一個已 `[x]` 的任務——全部發生在執行途中，而且發生時使用者正好不在看。等使用者想起來喊，狀態早已遺失。<br><br>依據二（走開開關**不是**授權面，明確處理）：合併帶進 arc-agent-driven 的走開模式後，必須回答「這是否讓本支變成像 `looping` 一樣的授權入口」。答案是否：`looping` 之所以 user-invoked，是因為啟動一個無人值守迴圈會在使用者離席時持續花錢與改碼，agent 自行啟動＝自我批准。`executing` 只做**模式選擇**，並要求在走開前先向使用者說明；真正把迴圈跑起來的入口仍在使用者手上（`looping`，user-invoked，本支只中性提及、不得 prose-invoke）。寫清單與在場執行都落在使用者已經委託的工作範圍內，沒有新的授權被自我授予。 |
| `maintaining-obsidian` | model-invoked | P5 重新推導維持預填值：觸發語句是「這個存一下」「我筆記裡對 X 有寫什麼」——說出這句話的人腦中沒有任何指令名，他甚至不必知道 vault 系統存在。要求先打 `/maintaining-obsidian` 等於要求使用者先知道答案（與 `using` 同構的失敗）。反向也成立：query 模式存在的目的是攔下「用通識回答一個該由 vault 回答的問題」，而那個誤答正是 agent 自己在任務中途做出的選擇，使用者看不到、無從呼叫。**附帶約束**：本支的 Visuals 步驟以 prose 呼叫 `/diagramming-obsidian`，依 schema §3.1 該 target 必須是 model-invoked——兩支同為 model-invoked 才使這條委派合法。 |

## 預填（P4–P6，**非約束**）

下表是依 `PLAN.md` 的 phase 集合預先推導的**建議值**，不是裁決。落地該 skill 的
phase 必須用同一句判準重新推導一次，並在該 phase 的 PR 更新本表為「已落地」。
理由欄寫的是推導依據，方便後續 phase 反駁而不是照抄。

| Skill | Phase | 預測類別 | 依據 |
|---|---|---|---|
| `compacting` | P4 | model-invoked | 條件是「context 快用完」，agent 比使用者更早看得到；使用者能打的 `/compact` 是 Claude Code builtin，與本 skill 不同物。 |
（`learning`、`evaluating`、`maintaining-obsidian`、`diagramming-obsidian` 已於 P5 落地，移入上表。
`brainstorming`、`executing` 已於 P6 落地，移入上表。`task-list` 之預填面依 P6 合併裁決併入
`executing`，該列由 orchestrator 於 router 收斂時關閉——不會有 `skills/task-list/`。）
| `looping` | P6 | **user-invoked** | 無人值守迴圈會在使用者離席時持續花錢與改碼；自行啟動等於自己批准自己不受監督。 |
（`dispatching` 已於 P6 落地並吸收 `worktrees`，移入上表；`worktrees` 預填列隨該合併刪除。）

## 已知張力（P6 收斂時必須處理）

- **數量對不上**：本表原列名 18 支（P4 裁定 `completion-evidence` 不是 skill，故不計），`PLAN.md`
  P6 的 AC 卻是 `ls -d skills/*/ | wc -l` ≤15、正文寫「總數 ≈14」。缺口只能靠 P4–P6
  進一步合併補上；本表**不代為發明合併**，只把差額標出來。哪幾支合併是 P6 的裁決。
  **P6 收斂進行中**：`worktrees` 併入 `dispatching`（本 phase Track B 已落地，−1）；
  `compacting` 併入 `sessions`（Track C，−1）。兩者兌現後本表 18 → 16，其餘缺口由
  P6 其他 track 的合併裁決收束（進度見 `progress.md` P6 節）。
- **預測集中在 model-invoked**：15 支預填只有 2 支 user-invoked。這可能是對的
  （多數紀律型 skill 的觸發條件確實在任務中途），也可能是預填時偷懶的預設值。
  每個 phase 落地時重新推導，就是為了讓這個偏斜有機會被推翻。
