# D6 — Mode-Split SDD Pipeline:完整設計

> 狀態：設計 / 待實作核准（contributor design note，不進 shipped surface）
> 日期：2026-06-06
> 決策前提：**評判視角 = shipped toolkit 的 unattended autonomous 受眾**(使用者已選定)
> 範圍：`arc-brainstorming` → `arc-refining` → `arc-planning` + `arc-auditing-spec`
> 前置研究：`./research.md`(兩專案對比、五方向評審、三層 anchor 模型)
> 所有 file:line 整合點皆已親自核實(非 subagent 轉述)。

---

## 1. 設計前提與一句話

使用者選定的視角是「**arcforge 作為服務廣大 unattended autonomous agent 的 toolkit**」。在這個視角下,研究的核心結論是:

> **「人給粗規格 → LLM 收斂」中,「收斂(撰寫具體值)」本質上是 attended-only 功能;在 unattended 引擎裡無法機械證明「批准者是人類」,所以 unattended 必須保留硬擋。**

D6 因此把使用者的請求拆成**三條獨立的軸**,各自有不同的安全性與模式相依度:

| 軸 | 對應準則 | 模式相依 | 結論 |
|---|---|---|---|
| **A. 三層 artifact**(anchor + 決策日誌 + decision-annotated delta) | 2/3/4 | **無**——兩模式都安全有益 | 直接做 |
| **B. LLM 稽核**(spec↔decision↔anchor 一致性) | 5 的「稽核」半 | **無**——稽核不撰寫,沒有 provenance 漏洞 | 直接做 |
| **C. LLM 收斂**(撰寫具體值) | 5 的「撰寫」半 | **有**——attended 啟用 / unattended 硬擋 | 模式分流 |

軸 A、B 是無爭議的淨增益;軸 C 是唯一需要小心的部分,也是 D6 名字裡「Mode-Split」的由來。

---

## 2. 三層 artifact(軸 A)—— anchor 模型落地

把研究 §3 的三層突變率模型變成具體檔案與 schema。

### 2.1 T1 — `vision.md`(恆定 anchor)

| 屬性 | 設計 |
|---|---|
| 路徑 | **已定案:兩層(無日期)。** ① 產品北極星 `product/vision.md`(單一,跨 spec 的不變原則 `P-1, P-2…`)= 你說的「raw idea, 產品方向」;② per-spec 章程 `specs/<spec-id>/vision.md`(在地 scope,引用產品 `P-n`)。決策的 `principle_ref` 指向**產品級 `P-n`**;per-spec 章程不是競爭北極星,只是在地落地。`decisions.yml` 仍 per-spec。 |
| 為何不被擋 | `DESIGN_DOC_RULES.path_regex`(`sdd-utils.js:35`)只管轄 `docs/plans/<id>/<date>/design.md`。`vision.md` 在 `specs/` 下、無日期,**結構上在該 validator 管轄之外**——這正是它能恆定的原因。 |
| 內容 | 北極星:raw idea、產品方向、不變的設計原則(`P-1`, `P-2`…可編號,供決策引用)。**不含**具體 criterion。 |
| 變更儀式 | 人類手改、commit。**LLM 唯讀。** |
| 機械保護 | `validateVision`:存在性 + 「LLM-readonly」以**寫入路徑封鎖**實現(見 §5.4 誠實限制)。 |

`vision.md` 是 unattended 收斂的「量尺」。**量尺絕不能被被評者(agent)偷改**,否則整個 ratification 迴圈是空的——這是 D6 對 vision 採唯讀的根本理由。

### 2.2 T2 — 決策日誌 ledger(append-only,supersede move)

| 屬性 | 設計 |
|---|---|
| 路徑 | `specs/<spec-id>/decisions.yml`(**project/spec-family 級,跨迭代持久**;與現有 per-session `decision-log.yml` **並存,不取代**) |
| Schema | 新增 `DECISION_LEDGER_RULES` 常數,**鏡像** `DECISION_LOG_RULES` 的 `{key,type,description}` 凍結形狀(`sdd-rules.js:132-188`),供 `print-schema.js` / cross-rules lint 統一迭代。 |
| 條目欄位 | `D-id`(單調 `D-001`…)、`date`、`spec_version`、`status`(`proposed` / `accepted` / `superseded-by:D-NNN`)、`decision`、`why`、`authorized_values`(**結構化清單,非散文**——見 §4.5)、`supersedes`(選填)、`ratified_by`(見軸 C)、`principle_ref`(選填,指 vision 的 `P-n`) |
| supersede move | port Traveling `ROADMAP.md:27-29`:append 新 `D-id` 帶 `supersedes:`,把舊條目 status 翻一行成 `superseded-by:`,**Decision/Why 原文不動**。 |

**為什麼與既有 `decision-log.yml` 並存而非合併**(研究 §1.1):既有的是 refiner 機械引用的 **per-session Q&A trace**(`mechanicalAuthorizationCheck` 按 `q_id` 查),改它的四欄 schema 會破壞 refiner 的 deterministic citation。新 ledger 是 **跨時間的策略 WHY 日誌**——兩者形狀與範圍都不同,是純加法。

**機械強制(這是 Traveling 留給人類紀律、agent 會跳過的部分,研究 §1.2-3):** 新 `validateDecisionLedger` 必須擋下:
1. **D-id 單調且唯一**(非遞增 / 重號 = ERROR)。
2. **已記錄的 `decision`/`why` 文字不可編輯**——對前一版 commit 做 diff,任何已存在條目的 `decision`/`why` 被改 = ERROR(用 git 或一個 append-only hash-chain;見 §5.4)。
3. **只有 supersede 才能翻 status**——`accepted → superseded-by:D-NNN` 合法;其餘 status 轉移要有對應的新 `supersedes` 條目。

### 2.3 T3 — 迭代 specs + decision-annotated deltas

讓 `<delta>` 與 `<criterion>` 能引用 decision-id,把研究 §3 指出的「`<added>/<modified>` 零理由」洞補上。

**A) delta 子元素加 `decision` 屬性**(非破壞,已驗證):
```xml
<added ref="fr-auth-007" decision="D-014" />
<modified ref="fr-auth-002" decision="D-015" />
```
`parseDeltaItems`(`sdd-utils.js:401-411`)的正則 `<${tag}\s+ref="([^"]*)"[^>]*\/>` 中 `[^>]*` **忽略 sibling 屬性**——`.ref` 照常解析,**現有 parser 零改動即相容**。`decision` 屬性是給人/稽核讀的 WHY 連結。

**B) `<trace>` 文法擴充可引用 decision-id**:
```xml
<trace>D-014:window=60s</trace>
```
這是 criterion 5(收斂)的授權載體,語意嚴格受限——見軸 C §4.3。

**關鍵實作陷阱(已親自驗證 `sdd-validators.js:27-31, 459-475):** `classifyTrace` 順序是 legacy → design → qa。`D-014:…` 會被 `TRACE_QA_RE = /^([a-zA-Z][a-zA-Z0-9_-]*):(.+)$/` 誤判為 qa(`D` 是字母)。**必須**新增 `TRACE_DECISION_RE = /^(D-\d+):(.+)$/` 並把 decision 分支插在 **design 之後、qa 之前**。

---

## 3. 模式判定(軸 C 的前提)

收斂安全與否,完全取決於「現在是不是 attended」。判定來源**不能是 refiner agent 自報**(否則 loop 裡的 agent 自稱 attended 即破功)。

| 選項 | 機制 | 強度 | 採用 |
|---|---|---|---|
| (i) CLI flag / env | `ARCFORGE_MODE=attended` 由叫用環境設 | 中(可被謊報,但那是使用者自己的選擇) | **採**(預設值用) |
| (ii) out-of-band 批准 artifact | 人類跑 `arcforge ratify`,agent 無法代跑互動式確認 | 強(收斂授權專用) | **採**(收斂授權專用,見 §4.3) |
| (iii) 預設 unattended-safe + 顯式 opt-in | 無訊號 = 硬擋;收斂要顯式開 | 強(fail-safe) | **採**(預設姿態) |

**採用組合(fail-safe 優先):**
- **預設 = unattended**(硬擋)。沒有明確 attended 訊號就當無人值守。
- attended 收斂要 (i) 顯式 flag **且** (iii) 收斂授權走 (ii) 的 `ratify` 命令。
- **最終 gate 推到 harness permission 層**:`arc-looping` / agent-driven 流程中,**拒絕 agent 取得執行 `arcforge ratify` 的權限**(一條 permission 規則)。如此 loop **物理上無法 mint 收斂授權**。這是 zero-dep/file-based 引擎裡能拿到的最強真實 gate(誠實限制見 §5.4)。

---

## 4. 軸 C —— 收斂的模式分流(D6 的核心)

### 4.1 把「決策」的兩個角色拆開(讓 D6 不重蹈 D4 覆轍)

研究對 D4 的最強反駁是:**若 criterion 引用的 D-id body 是 LLM 自己寫的,則 `mechanicalAuthorizationCheck` 變成 LLM-text-vs-LLM-text,反發明真空。** D6 用一個關鍵區分閃避這個陷阱:

| 決策的角色 | 允許的模式 | 滿足準則 | 是否授權具體 MUST |
|---|---|---|---|
| **A. 理由記錄(WHY)** | **所有模式**(含 unattended)。agent 可為 `<added>/<modified>` 記 `status: proposed` 的決策,純為可追溯。 | 4 | **否** |
| **B. 授權來源** | **僅 attended-minted `accepted` 條目** | 5 | **是,但僅限 §4.3 條件** |

→ 決策 ledger 的 **WHY 價值(準則 4)在兩模式都交付**;決策的 **收斂授權力(準則 5)只在 attended 由 `ratify` mint 的 `accepted` 條目才有**。unattended agent 可以「記下它想怎麼做」(proposed),但那**不授權**任何具體 MUST。

### 4.2 unattended 路徑 —— 硬擋保留

refiner 在 unattended 模式遇到需要收斂的 unbound/質化軸時,**合法動作仍是今天的三條**(`arc-refining/SKILL.md:185-191`):降為 SHOULD/MAY、留 unbound、或 BLOCK 走既有 `_pending-conflict.md` 彈回人類。**新增一條明文封鎖:**

> unattended 模式下,refiner **MUST NOT** 寫入 `status: accepted` 的 ledger 條目,**MUST NOT** 把 `D-NNN:` decision-trace 當作具體 MUST 的授權來源。違反 = `validateDecisionLedger` / `mechanicalAuthorizationCheck` ERROR。

並**顯式關閉 D4 的逃生口**:沒有「agent 自標 low-risk 自動升 accepted」這種路徑。風險分類由人在 attended 做,不由 agent 自評。

### 4.3 attended 路徑 —— draft-then-ratify

1. 人類在 `vision.md` / design 給粗方向(允許模糊:「make auth secure and rate-limited」)。
2. refiner **草擬**具體值,寫成 `status: proposed` 的 ledger 條目:`decision`/`why` 是散文敘述,**而 `authorized_values: ["window=60s"]` 是結構化清單**。**此時尚未授權任何 MUST。**
3. 人類核可 → 跑 `arcforge ratify <spec-id> D-014`(out-of-band,選項 ii)。命令**先把 `authorized_values` 逐項印出來要人類顯式確認/編輯**(informed ratify,見 §4.5),確認後才翻 `status: accepted` 並寫 `ratified_by`(人類標記/時間)。
4. criterion 以 `<trace>D-014:window=60s</trace>` 引用。`mechanicalAuthorizationCheck` 的 decision 分支驗證:
   - (a) `D-014` 存在於 ledger;
   - (b) `status === accepted` **且** 有 `ratified_by`(非 agent-mint);
   - (c) cited 值 `window=60s` **完全比對 `authorized_values` 清單裡的某一項**(**不是**對 `decision`/`why` 散文做子字串包含——見 §4.5 為何);
   - (d) **該 mint 發生在 attended 模式**(由 `ratify` 命令保證,agent 在 loop 無權跑)。
   全部通過才授權。

→ 「LLM 撰寫、人類批准」在 attended 是**真的**:`ratify` 把 `authorized_values` 逐項攤給人類**知情確認**,人類核可的是**具體值本身**(可當場改),provenance 因此回到接近「人類撰寫」而非「人類蓋章」;授權物是結構化清單而非散文,封死值盲漏洞。velocity 提升(殺掉逐題問),provenance 仍綁人類(`ratify` 命令)。

### 4.4 deferral 條款的範圍化重解(`fr-rf-013`)

今天 `fr-rf-013`(`sdd-rules.js:164-170, 180-187`):`use defaults`/`you decide` = unbound = **不授權具體 MUST**。D6 **不改它的 unattended 語意**(保留硬擋),只**在 attended 增加一條出口**:

> attended 模式下,deferral 訊號(`you decide` 等)觸發 **draft-then-ratify**:refiner 草擬 `proposed` 決策、等 `ratify`。unattended 模式下,deferral 語意**不變**(unbound / 三條合法動作)。

這是對單一凍結常數的**範圍化擴充**而非反轉——unattended 行為位元不動,符合使用者選定的視角。

### 4.5 收斂授權的不變式:對結構化值授權,不對散文授權

> **若不加這條,D6 的 attended 路徑會重蹈本研究判定為致命的兩個弱點。** 走一遍天真版的 attended 流程就會看到:LLM 草擬值 `60s` → 人類只翻一個 status 位 → 授權檢查拿 criterion 的值對 LLM 自己寫的 `decision`/`why` **散文**做子字串包含。這同時是 (1) 研究指派給 **D2** 的「human-approved ≠ human-authored、可蓋章」弱點(只是搬到 CLI),與 (2) keystone 的**值盲**漏洞——若 `why` 寫「考慮過 30s–600s,選 60s」,則 `MUST window=600s` 也會通過。使用者**正是因為不信任 LLM 自撰值才選 unattended 視角**;attended 路徑留一個盲蓋章,等於掏空 D6 存在的理由。

兩條收緊(同軌微調,非轉向):

1. **對 `authorized_values` 結構化清單授權,不對 `decision`/`why` 散文授權。** decision-trace 的值必須**完全等於**清單裡的一項(精確比對,非子字串)。這殺死「值出現在敘述某處就算數」的 keystone 漏洞。
2. **`ratify` 必須把 `authorized_values` 攤給人類知情確認(最好讓人類當場 type/edit)。** 批准因此是**值粒度**且知情的,把 provenance 從「對 LLM 草稿蓋章」拉回接近「人類撰寫該值」。

**不變式(寫進 `arc-refining` 的 Iron Law 旁):授權粒度是「值」,不是「decision-id」。** 引用一個 `accepted` 決策**不等於**該決策能授權任意值——只授權它 `authorized_values` 明列、且人類在 `ratify` 時確認過的那些值。

---

## 5. 軸 B —— LLM 稽核(每個模式都安全)

`arc-auditing-spec` 今天是 **READ-ONLY ADVISORY、NEVER MUTATE、never auto-invoked**(研究對 D4 的驗證:`SKILL.md:10,25`,`fr-sc-001-ac3`)。D6 **保持它唯讀**,只擴充它檢查的內容:

新增 spec↔decision↔anchor **圖一致性**稽核(純讀、可機械化):
- 每個 `<delta>` 的 `<added>/<modified>` 是否都有 `decision` 屬性指向存在的 D-id?
- 每個授權型 `D-NNN:` trace 是否指向 `accepted`+`ratified_by` 條目?
- 每個 `accepted` 決策的 `principle_ref` 是否指向 `vision.md` 存在的 `P-n`?
- ledger 是否 append-only / 單調(交叉驗證 `validateDecisionLedger`)?

**為何稽核是安全的那一半:** 稽核**不撰寫**——它沒有 provenance 漏洞,因為它從不 mint 授權,只報告不一致。所以軸 B 在 unattended loop 裡也能放手交給 LLM。**保持 `arc-auditing-spec` 不被 pipeline 自動叫用**(維持其 `never-auto-invoke` 不變式);若要在 refiner Phase 6 跑這些**結構**檢查,讓 refiner **吸收結構檢查**(機械、確定性),稽核 agent 仍是獨立的 advisory 層——不把 advisory 變成 pipeline-integral(這是研究對 D4 的關鍵修正)。

---

## 6. 確切的程式碼 / 規則改動清單

| 檔案 | 改動 | 風險 |
|---|---|---|
| `scripts/lib/sdd-rules.js` | 新增 `DECISION_LEDGER_RULES`(鏡像 `DECISION_LOG_RULES` 形狀)+ `VISION_RULES`;`fr-rf-013` 加 attended-scope 註解 | 低,純加法常數 |
| `scripts/lib/sdd-validators.js` | 新增 `TRACE_DECISION_RE`;`classifyTrace` 插 decision 分支(**design 後、qa 前**);`mechanicalAuthorizationCheck` 加 decision-trace 處理(§4.3 a–d 條件);新增 `validateDecisionLedger`、`validateVision` | **中**——classifyTrace 順序是正確性關鍵 |
| `scripts/lib/sdd-utils.js` | 新增 `parseDecisionLedger`、`parseVision`;`parseDeltaItems` **零改動**(已相容);`checkDagStatus` **零改動** | 低 |
| `scripts/cli.js` | 新增 `arcforge ratify <spec-id> <D-id>`:**攤開 `authorized_values` 逐項要人類知情確認/編輯**(§4.5),確認後才 mint `accepted`+`ratified_by` | 中——這是收斂授權的真實 gate |
| `skills/arc-brainstorming/SKILL.md` | vision 處理(讀,不寫);改 ledger(proposed 條目);模式感知 | 中(行為 spec,需重跑 eval) |
| `skills/arc-refining/SKILL.md` | 模式分流 BLOCK 邏輯;decision-trace 授權;範圍化 deferral 出口;unattended 明文封鎖 | **高**(碰 Iron Law 措辭,需重跑 eval) |
| `skills/arc-planning/SKILL.md` | **零行為改動**(確認:planner 只讀 spec + latest_delta,不讀 trace/ledger/vision) | 無 |
| `agents/`(arc-auditing-spec) | 擴讀 spec↔decision↔anchor 圖一致性(維持唯讀 / never-auto-invoke) | 低 |
| `hooks/` permission 規則 | loop/agent-driven 流程拒絕 agent 跑 `arcforge ratify` | 中——§3 最終 gate |

### Iron Law 措辭(`arc-refining`)的最小改寫

- 今天:`NO INVENTION WITHOUT AUTHORIZATION`(授權 = design phrase ∪ Q&A row)。
- D6:`NO INVENTION WITHOUT AUTHORIZATION`——授權來源**新增**第三類:**attended-minted `accepted` 決策(`ratified_by` 標記)**。**unattended 模式下,第三類不可由 agent 產生**,三條合法動作不變。

---

## 7. Migration(純加法,已驗證無 XML→markdown 重排)

1. 既有 shipped XML specs:adoption 時 **start-empty** 的 `decisions.yml` + 人類寫的 `vision.md`(**不回填**舊迭代)。
2. **先修 `classifyTrace` 順序 bug**,才能寫任何 `D-NNN:` trace(否則誤判為 qa)。這是 migration 的**前置**步驟。
3. 既有 `date:` / `q_id:` / `REQ-F*` traces 行為**不變**(classifyTrace 既有分支動不到)。
4. 既有 `decision-log.yml`(per-session Q&A)**保留**,refiner 既有引用不動。
5. legacy spec 首次 attended re-refine 時,可選擇性為既有 MUST 補 `accepted` 決策(屬人類批准債,非自動)。

---

## 8. Pipeline ripple 確認(親自驗證)

| 機制 | 是否受影響 | 證據 |
|---|---|---|
| `checkDagStatus`(DAG 完成 gate) | **無** | `sdd-utils.js:729-748` 純讀 epic status,動不到 trace/ledger/vision |
| `parseDeltaItems`(delta 解析) | **無**(`decision` 屬性被 `[^>]*` 忽略) | `sdd-utils.js:403,407` |
| planner / `dag.yaml` / epics | **無** | planner 只讀 spec + `latest_delta`,不讀 trace(`arc-planning/SKILL.md:12,28`) |
| coordinator / worktree / `arc-looping` / `arc-implementing` | **無** | 消費 `dag.yaml` + `features/*.md`,不讀 spec trace/ledger |
| 既有 `date:`/`q_id:` trace 授權 | **無** | classifyTrace 既有分支不變 |

→ **D6 的可執行管線 ripple 為零。** 全部改動收在 refining/brainstorming/ledger/vision/audit + 一條 CLI + 一條 permission 規則。

---

## 9. 誠實限制(§5.4 引用點)

1. **vision 與 ledger 的「LLM 唯讀 / 人類批准」在純 LLM agent 下不是密碼學可證的。** 真實 gate 是 **harness permission 層**:loop 裡 deny agent 對 `vision.md` 的寫入、deny `arcforge ratify` 的執行。這把最終人類在場保證推到 arcforge 已倚賴的 permission/hook 層——這是 zero-dep/file-based 引擎能拿到的最強防線,但它**不是引擎內的數學證明**。
2. **「已記錄文字不可編輯」依賴 git diff 或 append-only hash-chain。** hash-chain(Node `crypto` stdlib,不破 zero-dep)較強但帶來「合法 typo 修正要 re-chain」的修復難題;git diff 較弱但零新機制。建議起步用 git diff(`validateDecisionLedger` 對 `HEAD` 比對),日後若需要再上 hash-chain。
3. **足夠強的 agent 仍可能 shell out 跑 `ratify`。** 故 §3 的 permission deny 是必要的;沒有它,out-of-band 退化為 in-band。這條限制要寫進 `arc-looping` 的 permission 預設。

→ D6 的姿態不是「假裝能在引擎內證明人類在場」,而是「**承認證明不可能,於是 unattended 預設不開收斂(無需證明),attended 收斂的人類 gate 落在 permission 層**」。這對使用者選定的「unattended 受眾」視角是誠實且 fail-safe 的。

---

## 10. 分階段 rollout

| 階段 | 內容 | 依賴 | 可獨立交付? |
|---|---|---|---|
| **P1**(軸 A) | `vision.md` + `decisions.yml` + `validateVision`/`validateDecisionLedger` + delta `decision` 屬性 + classifyTrace 順序修正 | 無 | **是**——滿足準則 2/3/4,零模式邏輯 |
| **P2**(軸 B) | `arc-auditing-spec` 擴 spec↔decision↔anchor 圖稽核 | P1 | 是 |
| **P3**(軸 C) | 模式判定 + `arcforge ratify` CLI + refiner 模式分流 + decision-trace 授權 + permission deny | P1, P2 | 是(但這是碰 Iron Law 的高風險步,最後做) |

**建議:先做 P1 + P2**(低風險、無爭議、滿足你五個準則中的四個半),把高風險的 P3(收斂模式分流、碰 Iron Law)留到 P1/P2 落地、團隊對新 ledger 有實感之後再迭代。

---

## 11. 決策紀錄(已定案 2026-06-06)

| # | 問題 | 定案 |
|---|---|---|
| 1 | 模式判定預設 | **Option A** —— 預設 unattended-safe(硬擋)+ 顯式 attended flag + 收斂授權走 `ratify` CLI + loop 裡 harness permission deny agent 跑 `ratify`。最終 gate 在 harness 層。 |
| 2 | 不可編輯強制 | **git-diff** —— `validateDecisionLedger` 對 `HEAD` 比對,已存條目 `decision`/`why` 被改 = ERROR。起步輕、零新依賴。日後需要再上 hash-chain。 |
| 3 | `decisions.yml` 範圍 | **per-spec-id**(`specs/<id>/decisions.yml`),與既有 per-spec 佈局一致。 |
| 4 | rollout 範圍 | **三階段全做**(P1+P2+P3,依 §10 順序;P3 最後)。 |
| 5 | eval 重跑 | 必然 —— P1/P3 改 `arc-refining`/`arc-brainstorming` 行為 spec,依 Iron Law(`.claude/rules/skills.md`)各自重跑 eval。 |
| 6 | `vision.md` 範圍 | **兩層** —— 產品北極星 `product/vision.md`(單一,`P-n`)+ per-spec 章程 `specs/<id>/vision.md`(引用 `P-n`)。`principle_ref` 指產品級 `P-n`。 |

→ 可執行拆解見 `./p1-tasks.md`(P1 詳拆 + P2/P3 里程碑)。

---

## 附錄:親自核實的 file:line 錨點

- `sdd-validators.js:27-31` — TRACE 正則定義(LEGACY/DESIGN/QA);**需插 DECISION_RE 於 design 後 qa 前**。
- `sdd-validators.js:348,384` — `mechanicalAuthorizationCheck` 子字串檢查(value-blind,keystone)。
- `sdd-validators.js:459-475` — `classifyTrace` 順序 legacy→design→qa。
- `sdd-utils.js:35` — `DESIGN_DOC_RULES.path_regex`(vision.md 在其管轄外)。
- `sdd-utils.js:401-411` — `parseDeltaItems`,`[^>]*` 忽略 sibling 屬性(decision 屬性相容)。
- `sdd-utils.js:729-748` — `checkDagStatus`,DAG gate 不受影響。
- `sdd-rules.js:132-188` — `DECISION_LOG_RULES` 凍結形狀(新 `DECISION_LEDGER_RULES` 鏡像之)。
- `sdd-rules.js:164-170,180-187` — `fr-rf-013` deferral 條款(attended 範圍化出口)。
