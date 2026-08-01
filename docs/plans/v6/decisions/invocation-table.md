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

## 已落地（P3，類別由 frontmatter 讀出）

| Skill | 類別 | 理由 |
|---|---|---|
| `using` | model-invoked | router 的價值在使用者**不知道**該用哪支時自動出現；要求先打 `/using` 等於要求使用者先知道答案。 |
| `writing-skills` | **user-invoked** | 撰寫方法論是人刻意開始的工作；在無關任務中途自行載入只會把 authoring 規則套到不是 authoring 的事情上。 |
| `tdd` | model-invoked | 觸發條件（要動實作碼、修 bug、發現沒測試的碼）出現在任務中途，等使用者想起來喊就已經來不及——碼已經寫下去了。 |
| `finishing` | model-invoked | 觸發條件（實作完成、分支待處理）同樣是任務中途的狀態；這支存在的目的正是攔下「順手合併」，靠使用者主動呼叫就攔不到。 |

## 預填（P4–P6，**非約束**）

下表是依 `PLAN.md` 的 phase 集合預先推導的**建議值**，不是裁決。落地該 skill 的
phase 必須用同一句判準重新推導一次，並在該 phase 的 PR 更新本表為「已落地」。
理由欄寫的是推導依據，方便後續 phase 反駁而不是照抄。

| Skill | Phase | 預測類別 | 依據 |
|---|---|---|---|
| `debugging` | P4 | model-invoked | 條件是「出現不明失敗」，在任務中途冒出來，必須當場改變行為。 |
| `code-review` | P4 | model-invoked | 條件是「有一份改動待交付」；審查若要靠使用者記得要求，最該被審的那次就會漏掉。 |
| `completion-evidence` | P4 | **未定** | `PLAN.md` 寫作 `completion-evidence`（reference），字面在「獨立 skill」與「`code-review` 內的 reference 檔」之間有歧義，而兩種讀法後果不同：skill 需要 router 列與 invocation 類別，reference 檔兩者皆不需要。**由 P4 裁決，不在此代決。** |
| `compacting` | P4 | model-invoked | 條件是「context 快用完」，agent 比使用者更早看得到；使用者能打的 `/compact` 是 Claude Code builtin，與本 skill 不同物。 |
| `sessions` | P4 | model-invoked | 條件是「工作要跨 session 交接」，出現在收尾當下。 |
| `learning` | P5 | **user-invoked** | 學習子系統是控制面：啟用、審查候選、啟用 instinct 都是使用者對自己環境的決定，agent 自行伸手等於自我授權。 |
| `evaluating` | P5 | model-invoked | 條件是「出現一個關於行為的主張、而它需要被量測」，這個條件在任務中途成立。 |
| `maintaining-obsidian` | P5 | model-invoked | 條件是「有東西要進 vault 或要查 vault」，隨任務出現。 |
| `diagramming-obsidian` | P5 | model-invoked | 同上，條件是「需要一張關係圖」。 |
| `brainstorming` | P6 | model-invoked | 條件是「使用者帶著還沒收斂的構想來」，從第一句話就看得出來。 |
| `task-list` | P6 | model-invoked | 條件是「工作大到需要一份清單」，在拆解當下成立。 |
| `executing` | P6 | model-invoked | 條件是「已有一份清單待執行」。 |
| `dispatching` | P6 | model-invoked | 條件是「工作可平行且已具備平行前提」。 |
| `looping` | P6 | **user-invoked** | 無人值守迴圈會在使用者離席時持續花錢與改碼；自行啟動等於自己批准自己不受監督。 |
| `worktrees` | P6 | model-invoked | 條件是「需要隔離的工作區」，在動手前成立。 |

## 已知張力（P6 收斂時必須處理）

- **數量對不上**：本表列名 18 支（`completion-evidence` 懸而未決則 19），`PLAN.md`
  P6 的 AC 卻是 `ls -d skills/*/ | wc -l` ≤15、正文寫「總數 ≈14」。缺口只能靠 P4–P6
  進一步合併補上；本表**不代為發明合併**，只把差額標出來。哪幾支合併是 P6 的裁決。
- **預測集中在 model-invoked**：15 支預填只有 2 支 user-invoked。這可能是對的
  （多數紀律型 skill 的觸發條件確實在任務中途），也可能是預填時偷懶的預設值。
  每個 phase 落地時重新推導，就是為了讓這個偏斜有機會被推翻。
