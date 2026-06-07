# SDD Pipeline 重新設計 — 研究與方向書

> 狀態：研究 / 待決策（contributor design note，不進 shipped surface）
> 日期：2026-06-06
> 範圍：arcforge 的 `arc-brainstorming` → `arc-refining` → `arc-planning` 管線
> 參照專案：`~/GitHub/Traveling/product`（輕量 markdown SDD）
> 方法：14-agent 工作流(4 深掘分析 → 5 設計方向 → 5 對抗式評審)

---

## 0. 一句話結論（先讀這個）

**好消息先講：你描述的流程是可達成的。** 你說的是「**你**發想產品方向、提供粗規格大方向、**LLM 收斂**」——這是一個 **attended(你在場)** 的流程。在那個視角下,真正的硬問題不存在;它只存在於**你沒有要求的模式**(無人值守的 autonomous loop)。

你的需求可以拆成**兩半**,難度天差地別:

| 需求 | 難度 | 結論 |
|---|---|---|
| 恆定 anchor + 決策日誌 + 可追溯迭代(準則 2/3/4) | **低風險、普遍有益** | 三個新 artifact，五個方向全部給 4–5 分。**該做，且跟選哪個方向、哪個視角都無關。** |
| LLM **稽核**(spec↔decision↔anchor 一致性) | **低風險、每個模式都安全** | 稽核**不撰寫**,所以完全沒有 provenance 漏洞。LLM 分工請求裡**安全的那一半**,attended/unattended 都可放手交給 LLM。 |
| 人給粗規格 → LLM **撰寫/收斂**(準則 5 撰寫的那一半) | **唯一的硬問題,且只在 unattended 模式硬** | 在 attended 視角下 D2/D4/D5 是強的;只有在 unattended 視角下才全部退化(見下)。 |

**唯一的硬問題長這樣(且只在無人值守時硬):** 在 zero-dep / file-based / 多平台的引擎裡,**沒有任何機械手段能證明「批准的人是人類、而不是 agent 自己」**。所以「LLM 收斂、人類批准」在**無人值守(unattended)的 `arc-looping`** 場景會退化成「LLM 自己批准自己的發明」——而且 validator 還是綠燈,製造**假的保證**(比沒有 validator 更危險,因為下游與審查者都信任那個綠勾)。

> **關於 §4 的「2/2/2/2/2」那一欄:** 那是評審在「**unattended autonomous toolkit 受眾**」視角下打的(這個視角是我在分析時注入給評審 agent 的,不是你提的)。**在你實際描述的 attended 個人/小團隊視角下,D2/D4/D5 的分工準則應該是 4,不是 2。** 分數會隨視角翻轉——所以**選哪個視角是第一個、也是最關鍵的決策**(見 §7 問題 1)。

→ 結論:真正的設計決策不是「選哪個方向」,而是先定**評判視角**。若是 attended(你描述的),draft-then-ratify(D2/D5)直接可用。若 arcforge 仍要服務 unattended 受眾,則「收斂」本質上是 attended-only 功能,對 loop 保留硬擋——這就是 §6 的 D6 模式分流。

---

## 1. 兩專案研究

### 1.1 arcforge SDD(機械強制 / heavyweight)

```
arc-brainstorming → docs/plans/<id>/<date>/design.md + decision-log.yml
arc-refining      → specs/<id>/spec.xml + details/*.xml   (權威契約)
arc-planning      → specs/<id>/dag.yaml + epics/          (純函數, 可丟棄)
                  → arc-coordinating / arc-implementing / arc-looping(worktree 隔離)
```

**深掘後對「機械強制」名聲的三項重大修正(都有 file:line 佐證):**

1. **`mechanicalAuthorizationCheck` 比傳說中弱很多。** 它做的是對 `<trace>` 引用字串的**大小寫無關子字串包含**(`designLower.includes(cited)` / `verbatim.includes(cited)`,`sdd-validators.js:348,384`)。它驗證「被引用的字串存在於來源」,**不驗證「criterion 裡的具體數值有來源」**。所以 `MUST window=60s` 只要 `<trace>` 指向 design 裡真實存在的模糊語句 `rate-limited`,就**通過**——發明的 `60` 從未被檢查。它只抓「捏造引用」,不抓「用真實鄰近語句包裝的收斂」。而且:**沒有 `<trace>` 的 criterion 完全不被檢查**(`extractTraceEntries` 只迭代實際存在的 trace)。
2. **真正的反發明牆是 LLM 判斷層 + 一個凍結常數,不是 validator。** 擋下收斂的是 refiner 的 Phase 4 axis-3 / Phase 5.5b 的 LLM 判斷、Quality Checklist、以及 deferral 條款 `DECISION_LOG_RULES`(`fr-rf-013`,`sdd-rules.js:164-170`):`use defaults` / `you decide` / `skip` / `covered.` 標記某軸為 **unbound,且明文「不授權具體 MUST」**。`deferral_signal` 布林值是 brainstormer **自報**的,validator 只 type-check、從不重算。**→ 含意:改變「誰能把 spec 具體化」主要是 SKILL/prompt 改寫 + 改一個 code 常數,不是深層 validator 重寫。代價比想像低——但也代表現有的「機械保證」比團隊以為的弱。**
3. **`details/*.xml` 裡的實際 criterion 完全沒有 schema 驗證。** `parseSpecHeader` 只解析 `<overview>`。所以 XML→markdown 在 criterion 層其實**幾乎不損失機械覆蓋,因為現在本來就沒有**。

**真正 load-bearing 的機械件(改任何方向都要正面處理):**
- `checkDagStatus`(`sdd-utils.js:729-748`)——唯一**無逃生口**的 gate:前一個 sprint 的 epic 未全 `completed` 就 BLOCK 迭代。`dag.yaml` 不存在才回 `null`(放行)。這是 refining↔DAG 最強耦合。任何砍掉/弱化 DAG 的方向必須重新定義「上個 sprint 完成」是什麼意思。
- `writeConflictMarker` / `_pending-conflict.md`——refiner(寫)↔brainstorming(讀/刪)之間唯一的權威狀態交接,有 schema 驗證 + round-trip self-test。它是「擋下、不發明」的結構性化身。
- `DESIGN_DOC_RULES.path_regex`(`sdd-utils.js:35`)——**硬性要求 design.md 路徑帶日期**。這在結構上**主動阻止 design.md 成為恆定 anchor**:每次迭代都鑄造新的日期資料夾,raw idea 被逐次轉換掉。

**優勢:** 防禦縱深的反發明(一個發明要躲過 4 層);凍結常數的單一真相源(schema 自動生成、有 drift 測試);delta ledger 的 append-only 結構驗證;zero-dep、可移植四平台。
**局限:** 反發明的「機械」名實不符(見上);無大局視圖(per-iteration dated design.md,看不到「現在在哪、下一步」);無恆定 anchor(被 path_regex 結構性擋住);decision-log 是 **session-scoped 的 Q&A transcript**,不是跨時間的決策日誌;高 ceremony、可讀性低。

### 1.2 Traveling/product(慣例強制 / lightweight)

```
specs/<slug>.md   一個 feature 一份 living spec(Purpose / Scope / Behavior B-n / Data model / Decisions)
ROADMAP.md        semver 里程碑表(大局索引) + append-only Decision Log(D-NNN)
BACKLOG.md        低摩擦願望池
```

它的 **D-001 本身就是對 arcforge 過重的明文反動。**

**深掘後的關鍵發現(都有 git/file 佐證):**

1. **Supersede move 是最乾淨的決策反轉原語。** 要反轉:append 一條新 `D-NNN` 帶 `Supersedes: D-NNN`,把舊條目的 `Status:` 翻**一行**成 `Superseded-by:`,**Decision/Why 原文不動**。真實反轉對是 **D-011+D-012 → D-015**。日誌由上而下讀成「選了 X → 改成 Y → 因為 Z」。**這是對你準則 4 最可移植的點子**——兩個小編輯、全血緣保留、歷史不可變。
2. **致命細節:Traveling 的 decision log 是「人類事後追述」,不是「系統即時捕捉」。** `git show` 證實 D-011 一進 commit 就已是 `Superseded-by` 狀態(從未以 `Accepted` 存在於任何 commit);整條 D-011→D-015 弧是**在同一個 PR 裡原子地寫出來的**。它能成立,是因為一個用心的**人類在一次坐定中追述出一條連貫的推理軌跡**。**autonomous agent 沒有這個追述 pass**,也沒有動機去原文保留舊條目、只翻一行、不偷改歷史。**→ arcforge 若要採 supersede move,必須用腳本機械強制 (a) D-id 單調遞增、(b) 已記錄文字不可編輯、(c) 只有 supersede 才能翻 status——因為對人類免費的紀律,正是 agent 會跳過的。**
3. **整個系統唯一的機械強制是 `validateTrip`(資料 schema)。** 其餘全是慣例,零機械後盾:沒有腳本檢查 decision-log 的 append-only、沒有 test 引用 B-id、沒有東西強制「改 code 就更新 spec」。對 solo 人類這是對的取捨(把強制預算全花在最該防 drift 的 schema 上);**對 autonomous agent 正好相反**——schema 是最容易保持誠實的(兩邊都已有 validator),而決策/spec 紀律才是 agent 會跳過的。
4. **Traveling 也**沒有**恆定 anchor。** ROADMAP 只有「已承諾的里程碑 + 決策」,沒有持久的 vision 陳述;原始 PRD 已**退役**、溶進各 feature spec。`grep '## Vision'` 全空。
5. **Living-spec 格式對「從中維護/擴充 feature」比 spec.xml 更**豐富**(明確 MUST/SHOULD、顯式 out-of-scope 防止默默遺漏、完整 data model、B-n 可逐條追溯/supersede),但對機器**更**薄**(無 `<trace>`/`<delta>`/DAG)。**→ 格式(XML vs markdown)是便宜的部分;強制層才是昂貴、load-bearing 的部分。兩者應該正交看待。**

**優勢:** supersede move;單一 append-only decision 真相源(spec 只 by-id 指過去、不複製);living-spec 實質(lightweight ≠ thin);big-picture 里程碑表;優雅 scale-down。
**局限:** 幾乎全靠慣例(唯一機械件是資料 schema);decision log 是事後人工策展、非即時捕捉;無恆定 anchor;「不要把 instance 當 contract」三 register 紀律是純散文、連用心的人類都**反覆失守**(D-018 需要三輪稽核 + 新增視覺驗證規則);**無可執行 DAG**(對 arcforge 的 coordinator/looping/worktree 毫無供給);**完全無任何反發明 gate。**

---

## 2. 核心矛盾:誰能把 spec 具體化

你的準則 5「人給粗規格 → LLM 收斂」與 `arc-refining` 的開國 Iron Law「**NO INVENTION WITHOUT AUTHORIZATION**」**結構性互斥**。

走一遍今天的失敗模式(粗輸入「make auth secure and rate-limited」,沒有數字):refiner 對「質化語句 / 已 defer 的軸」**只有三個合法動作**(`arc-refining/SKILL.md:185-191`):(1) 保留為 SHOULD/MAY(非綁定,永遠不是可測的 MUST);(2) 留 unbound(完全不產 criterion);(3) BLOCK 並丟 `_pending-conflict.md` 把工作彈回人類。**沒有一個是「LLM 挑一個具體數字寫成 MUST」**。它自己的反例就是:「多數 rate-limiter 用 60 秒,所以 MUST window=60s」——明文「不在清單上,違反 Iron Law 第一條」。

→ **管線在現行規則下結構上無法交付準則 5。** 每個重設計方向,本質上都是對同一問題的不同答案:**誰被允許把 spec 具體化。** 三個解法原型:
- **(a)** LLM 取得收斂權,反發明放寬成「人類必須**批准**、而非預先撰寫」。
- **(b)** 「收斂」= LLM 起草具體值 → 人類核准(保留反發明,把逐題問換成 draft-then-ratify)。
- **(c)** **雙層**:粗的人類 intent 層(允許模糊)+ 細的 LLM contract 層(在批准下填充),反發明只作用於 contract→intent。

**但所有三個原型在 unattended 模式撞同一面牆**(見 §0、§6):無法機械證明「批准者是人類」。

---

## 3. 恆定 anchor 是全新的 — 三層突變率模型

兩專案都沒有持久 north-star,所以 anchor 必須**設計**、不能借。建議的三層(按突變率排序,引用方向**往上**指):

| 層 | 突變率 | artifact | 變更儀式 |
|---|---|---|---|
| **T1 願景 / raw idea** | 近乎恆定(罕見、要大聲) | 全新 `vision.md`(無日期,**刻意放在 `path_regex` 管轄之外**,所以結構上不被擋) | 人類手改、commit、**LLM 絕不自動改寫**(這就是「yardstick 不能被被評者偷改」) |
| **T2 append-only 決策日誌** | 頻繁 | 全新 project/spec-family 級 ledger(把 decision-log 從 dated 資料夾**抬出來**),條目 `{D-id, Date, spec_version, Status, Decision, Why, Supersedes}` | Traveling 的 supersede move,但**機械強制**單調/不可編輯/只 supersede 才翻 status |
| **T3 迭代 specs** | 連續 | 現有 `spec.xml` + `<delta>` + `details/`(維持) | 照舊每 sprint churn |

**接線(最低 ripple 的縫):** 擴充現有 `<trace>` 文法,讓 criterion 除了 design-phrase 與 q_id 外,**也能引用 decision-id**,重用 `mechanicalAuthorizationCheck`/`classifyTrace`——**無新 validator 子系統,不波及 planner/coordinator/dag**。
**注意陷阱(評審實證):** `D-014:...` 會被 `TRACE_QA_RE`(`/^([a-zA-Z]...:.+$/`)誤判為 qa,因為 `D` 是字母。decision 分支**必須插在 qa 分支之前**。
**為什麼 WHY 今天無家可歸(validator 層實證):** `<delta>` 只有 `<removed>` 強制 `<reason>`;`<added>`/`<modified>`(最常見的迭代動作)**零理由欄位**。decision-log.yml 又是 session-scoped Q&A。所以準則 4 要的「跨時間的 WHY」目前**哪裡都不存在**,是純加法,不是改 delta ledger。

**這三個 artifact(vision.md + 機械強制的 append-only 決策日誌 + decision-annotated deltas)是普遍有益的**:五個方向在 anchor/traceable/decision-log 全拿 4–5 分,且「**無論有沒有人讀都存在**,所以是 audience-independent 的勝利」。

---

## 4. 五個方向

> 設計階段對每個方向展開完整提案,評審階段立即對抗式評分。下表是 5 評審的結構化結果。

| 方向 | 一句話 | spine 解法 | pipeline ripple | migration |
|---|---|---|---|---|
| **D1 極簡嫁接** | 保留 XML 管線;反發明從「人預授權」改成「LLM 起草、人翻 `Accepted` 位」;anchor+log 當旁支 | (b)+(a),未強制的 status 位 | **零可執行 ripple**(實證) | 最低、純加法 |
| **D2 雙層 Intent/Contract** | 人寫粗 intent 層、LLM 收斂細 contract 層;反發明改成 contract→intent | (c) | 中(refining 改形,planning 不變) | 加法 + 一個「design 直接寫數字」的 carve-out |
| **D3 輕量化轉向** | 採 markdown living-spec + ROADMAP,反發明降為 opt-in linter,保留薄 DAG | (a) 慣例優先 | **最大**(重寫全部 spec、retire validator) | 最高、四平台重測 |
| **D4 Decision-Log 為脊** | 決策日誌當中軸,spec/anchor 掛其下;LLM 稽核 spec↔decision↔vision 圖一致性 | (a) 提議→批准 | 中高(重用 append-only/trace 機制) | 中 + 每個 legacy spec 首次 re-refine 要補批准債 |
| **D5 雙格式 SoT** | 機器契約 + 人類可讀視圖經 schema 綁定;人永不編輯 XML | (b) | 中(契約格式不變) | 視圖生成近零風險;conflict-rail 重用要改 enum |

### 評分矩陣(1–5)

> **視角注意:** 「人/LLM分工」欄是 **unattended autonomous 受眾**視角下的分數(評審被指定此視角)。**在 attended 個人/小團隊視角(= 你描述的流程)下,D2/D4/D5 此欄應讀作 4。** 其餘四欄是 audience-independent,不隨視角變。

| 方向 | SDD精神 | 可追溯迭代 | 恆定anchor | 決策日誌 | **人/LLM分工**<br>(unattended視角) | 最強反駁(濃縮,unattended 視角) |
|---|:--:|:--:|:--:|:--:|:--:|---|
| **D1** | 4 | 4 | 4 | 4 | **2** | `Accepted` 位是 author-blind;agent 自寫決策+自翻 Accepted,validator 拿 agent 的 spec 比對 agent 自己的 ledger,provenance 迴圈 LLM→LLM 閉合,還製造假保證 |
| **D2** | 4 | 5 | 4 | 5 | **2** | value-inspection 在無人時是循環論證;`ratified` 位比它類比的 `deferral_signal` **整合性更差**——deferral 守的是「降級」、ratified 守的是「升級」,翻一位就直接授權 agent 自寫的值;且把今天**機械上不可能**的「LLM 自挑值」變成**被認可的預設路徑** |
| **D3** | 3 | 4 | 4 | 3 | **2** | 預設 config **沒有反發明地板**;刪掉兩個硬 BLOCK + 把授權檢查降為 opt-in warn;無人值守的 overnight loop 裡「LLM 發明了它,附一張紙條」 |
| **D4** | 4 | 5 | 5 | 5 | **2** | 用它自己的風險分類:真正的收斂**永遠是 high-risk → 跳過 epic**;唯一逃生是 agent 自己把推斷值標成 low-risk 自動升 `Accepted`=無界發明;且 criterion 引用的 D-id body 是 **LLM 自己寫的**,檢查變 LLM-text-vs-LLM-text,反發明真空 |
| **D5** | 4 | 4 | 5 | 4 | **2** | 沒有任何機械證明「是人類做了 `proposed:→accepted:` 那個編輯」(grep 證實機器裡零人類在場訊號);loop 中 agent 自己改視圖、把草稿值寫進名為 `user_answer_verbatim` 的欄位,檢查被「正在造假的人」餵料 |

### 共通結論

1. **「同分」是視角回聲,不是五個獨立發現。** 五個方向 human_llm_division 都被打 2,是因為我給五個評審 agent **注入了同一個 unattended 視角**(並明示「若收斂重新引入發明就打低分」)。所以這是**一個 framing 被覆誦五次**,不是五次獨立撞牆。底層的洞(author-blind 批准漏洞)**是真的**——但它的**範圍**是「在 unattended 視角下失敗」,不是「無條件失敗」。
2. **死因(僅在 unattended 視角下)同一個。** 「**無法機械證明批准者是人類**」。在 zero-dep/file-based/多平台引擎裡,validator 不能把 `Accepted`/`ratified:true`/視圖編輯**綁定到人類作者**;`arc-looping` 中 agent 在自己 worktree 以 user 身分 commit,git 作者也不是訊號。validator 照常綠燈,製造**假保證**——比沒有 validator 更糟。
3. **三個新 artifact 普遍該做。** anchor/log/decision-annotated delta 與選哪個方向、哪個視角都無關,五方向全給高分。
4. **每個方向的 best-for 都指向 attended solo/small-team**——正是你描述的、也是靈感來源(Traveling)的情境。**換句話說:在你實際要的情境裡,這些方向是強的;它們只在「我額外要求的更廣 autonomous 情境」裡才弱。** 硬問題只存在於你沒要求的模式。

---

## 5. 各方向的「在什麼情況下贏」

- **D1** — workflow 合約裡確實有在場的人做 `Proposed→Accepted`/supersede。最低 ripple、最乾淨 migration、spec.xml 不動,把 Traveling 的純慣例紀律變成真機制。
- **D2** — attended、互動式 refining。殺掉逐題問的摩擦;真正的跨時間 decision ledger(WHY 一等公民 + 機械 supersede,補上 `<added>/<modified>` 零理由的洞);全新 undated `intent.md` north-star。本質是 Traveling solo 流程的「一般化 + 機械化」。
- **D3** — 已從「solo-autonomous」轉向「team-with-reviewer」的專案。最高可讀性、最直接滿足準則 5、最乾淨的 WHY-ledger 原語。**只有當 arcforge 定位自覺地從 autonomous-agent-toolkit 轉成 human-curated-team-tool 才選它。**
- **D4** — solo/small-team attended,人在 decision-granularity 批准(審 ~5 條粗決策而非 ~30 條 micro-MUST)。交付全部三個新 artifact、ripple 真的被收住(planner/DAG/worktree 實證未動)。**採用它的 artifact,拒絕它「status-gating 能對 unattended agent 保住反發明牙齒」的主張。**
- **D5** — attended single-author(Traveling 的字面情境):人讀生成視圖、逐個看 `proposed:` 數字、自己改 `accepted:`。表徵紀律最嚴謹(契約/視圖分離),anchor 5 分,migration/ripple 最乾淨。

---

## 6. 綜合建議:把兩半拆開 + 模式分流(D6)

評審一致指向一個沒有任何單一方向完全擁抱、但全部都指向的誠實解。我把它命名為 **D6 — Mode-Split Synthesis**:

### 半 A —— 現在就做(低風險,滿足準則 2/3/4,與 spine 無關)

採用三個新 artifact,**機械強制 Traveling 留給人類紀律的部分**:
1. `vision.md`(T1)——無日期、人類 gated、LLM 唯讀。放在 `path_regex` 管轄外。
2. project/spec-family 級 **append-only 決策日誌**(T2)——機械強制 D-id 單調、已記錄文字不可編輯、只 supersede 才翻 status(這正是 agent 會跳過、而 Traveling 靠人類免費獲得的紀律)。port supersede move。
3. **decision-annotated deltas**(T3)——擴 `<trace>` 文法可引用 decision-id(decision 分支插在 qa 分支前);讓 `<added>/<modified>` 能帶 WHY。

這部分 ripple 收在 refining 內,planner/DAG/worktree/coordinator 不動,migration 純加法(start-empty,不回填)。

### 半 B —— spine 衝突:按模式分流,不要一刀切

**「收斂」本質上是 attended-mode 功能。** 不要把它設成 unattended loop 的預設。

- **Attended session**(人在鍵盤前):啟用 draft-then-ratify(D2 的雙層 / D5 的視圖批准)。人寫粗 intent → LLM 收斂具體 contract → **人在 session 內批准**,批准把具體值寫進 `user_answer_verbatim`(非 'yes'),沿用既有非-deferral 授權路徑。此時 ratify gate 是真的,不是劇場。
- **Unattended `arc-looping` / agent-driven**:**保留今天的硬擋。** 遇到需要收斂的 unbound 軸 → 走既有 `_pending-conflict.md` 交接彈回人類,**絕不**讓 agent 自批。亦即:把 D4 風險分類的「high-risk → skip/handoff」當成 unattended 的**唯一**合法行為,並**移除**「agent 自標 low-risk 自動升 Accepted」這個逃生口。

**為什麼這是誠實解:** 它把「LLM 收斂」明確 scope 到「ratify gate 真實存在」的情境,對「ratify gate 必然是劇場」的情境保留 arcforge 的核心價值(autonomous-drift 抵抗)。它不假裝在 file-based 引擎裡能機械證明人類在場——而是**承認那證明不可能,於是只在不需要它的模式啟用收斂**。

**未解問題(需要你定):** 「attended vs unattended」如何被管線可靠判定?選項:(i) 顯式 CLI flag / 模式參數(最簡單、可被謊報但那是使用者自己的選擇);(ii) 一個 agent 證明上**無法**自寫的 out-of-band 批准 artifact(最強但最重,可能需要踩出 zero-dep);(iii) 預設 unattended-safe(硬擋),attended 收斂要顯式 opt-in。建議從 (iii)+(i) 起步。

---

## 7. 給決策者的問題

1. **【最關鍵、先答這題】我該用哪個評判視角?** 這直接翻轉五個方向的分數:
   - **(a) attended 個人/小團隊**(= 你描述的「你發想、LLM 收斂」)→ draft-then-ratify(D2/D5)直接可用,分工準則 4 分,硬問題消失。
   - **(b) arcforge 作為 shipped toolkit 的 unattended autonomous 受眾** → 收斂是 attended-only 功能,半 B 模式分流(D6)必須,D3 出局。
   - 註:無論選哪個,**LLM 稽核(spec↔decision↔anchor 一致性)在兩個視角都安全**——因為稽核不撰寫、沒有 provenance 漏洞。`arc-auditing-spec` 已是 read-only,可直接擴。這是你分工請求裡可以**現在、無條件**交給 LLM 的一半。
2. **半 A 要不要先獨立做掉?** 它低風險、滿足你三個準則中的兩個半,且不綁定 spine 決策。建議先做,把硬問題(半 B)留給更慎重的迭代。
3. **「attended/unattended 判定」用哪個選項?**(§6 的 i/ii/iii)
4. **migration 起點:** 既有 shipped XML specs 的決策日誌 **start-empty 不回填**(推薦)還是回填?

---

## 附錄:方法與證據鏈

- 工作流:`sdd-pipeline-redesign-research`(14 agents,~1.0M tokens,~17 分鐘)。
- Phase 1 分析(4 並行,全部有 file:line 佐證):arcforge 強制機械、Traveling 架構、spine 衝突、anchor/traceability gap。
- Phase 2 設計(5 方向)→ Phase 3 對抗式評審(5,每個方向設計完立即被評)。
- 完整結構化輸出(JSON):見工作流 transcript。本文件是綜合,非逐字轉錄。
- 關鍵 file:line 錨點:`sdd-validators.js:348,384`(子字串檢查)、`:459-475`(classifyTrace)、`sdd-utils.js:35`(path_regex)、`:729-748`(checkDagStatus)、`:684-710`(只有 removed 要 reason)、`sdd-rules.js:164-170`(fr-rf-013 deferral)、`arc-refining/SKILL.md:185-191`(三個合法動作)、Traveling `ROADMAP.md:27-29`(supersede 規則)、`git show 0274d81`(D-011 一進場即 superseded)。
