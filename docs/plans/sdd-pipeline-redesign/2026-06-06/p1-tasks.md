# D6 實作拆解：P1 詳拆 + P2/P3 里程碑

> 狀態：task plan / 待實作核准（contributor note，不進 shipped surface）
> 日期：2026-06-06
> 上游：`./d6-design.md`(§11 決策已定案)
> 定案前提：vision 兩層 · 三階段全做 · 不可編輯用 git-diff · 模式判定 Option A

紀律(依專案規則):每個 lib 改動 **TDD**(先寫失敗測試再實作);`scripts/lib/` 為 canonical,hooks 直接 import;改 skill 行為 spec 依 Iron Law 必須**重跑該 skill 的 eval**;commit 前 `npm run lint:fix && npm test`。

---

## P1 —— 軸 A:三層 artifact(低風險、無爭議、滿足準則 2/3/4)

P1 只建「理由/錨點」層:vision、decision ledger(**僅記錄,尚不授權 MUST**)、delta 的 `decision` 連結、`<trace>` 的 D-NNN 文法識別(**僅存在性檢查,授權力留給 P3**)。零模式邏輯、零 Iron Law 改動。

### P1-T1 — 新 schema 常數(`sdd-rules.js`)
- **做**:新增 `VISION_RULES`(產品級 `P-n` + per-spec 章程兩種形狀)與 `DECISION_LEDGER_RULES`,**鏡像** `DECISION_LOG_RULES` 的 `Object.freeze({canonical_path, required_fields:[{key,type,description}], …})` 形狀(`sdd-rules.js:132-188`)。ledger 欄位:`D-id/date/spec_version/status/decision/why/authorized_values/supersedes?/ratified_by?/principle_ref?`。
- **verify**:`module.exports` 露出兩常數;deep-frozen(mutation 拋錯);cross-rules lint(既有)能統一迭代新常數。
- **depends_on**:—

### P1-T2 — vision 解析/驗證(兩層)
- **做**:`parseVision`(`sdd-utils.js`)+ `validateVision`(`sdd-validators.js`)。產品 `product/vision.md` 解析 `P-1, P-2…`;per-spec `specs/<id>/vision.md` 解析其 `principle_ref` 並驗證**每個引用都解析到產品級 `P-n`**。兩者皆**無日期**、在 `DESIGN_DOC_RULES.path_regex`(`sdd-utils.js:35`)管轄外。
- **verify(先寫測試)**:valid fixture 過;per-spec 引用不存在的 `P-n` = ERROR;產品 vision 缺 `P-n` 編號 = ERROR;無日期路徑**不**被 design 驗證器攔(回歸:`validateDesignDoc` 不碰這些路徑)。
- **depends_on**:P1-T1

### P1-T3 — decision ledger 解析/驗證(append-only,git-diff 不可編輯)
- **做**:`parseDecisionLedger` + `validateDecisionLedger`。強制:(a) `D-id` 單調遞增且唯一;(b) **已記錄條目的 `decision`/`why` 不可編輯** —— 對 `git show HEAD:<path>` 比對,既有條目該兩欄被改 = ERROR;(c) **status 只能透過 supersede 轉移** —— `accepted → superseded-by:D-NNN` 需有對應的新 `supersedes:` 條目,否則 ERROR。
- **verify(先寫測試)**:重號/非遞增 D-id = ERROR;改舊條目 decision/why(git-diff)= ERROR;合法 supersede 對(新條目 `supersedes:D-007` + 舊條目翻 `superseded-by`,Decision/Why 原文不動)= OK;無對應 supersede 卻翻 status = ERROR。**注意**:git-diff 需處理「新檔(HEAD 無此檔)」= 全新,放行。
- **depends_on**:P1-T1

### P1-T4 — `<trace>` 識別 D-NNN(修順序 bug,僅存在性)
- **做**:`sdd-validators.js` 新增 `TRACE_DECISION_RE = /^(D-\d+):(.+)$/`;`classifyTrace`(:459-475)插 decision 分支於 **design 之後、qa 之前**(否則 `D-014:…` 被 `TRACE_QA_RE` 誤判,:31)。P1 的 `mechanicalAuthorizationCheck` 對 decision-trace **僅檢查 D-id 存在於 ledger**(授權語意 §4.3 a–d 留 P3)。
- **verify(先寫測試)**:`D-014:x` classify 成 `decision` 非 `qa`;**回歸**:既有 `2026-06-06:…`(design)、`q1:…`(qa)、`REQ-F1`(legacy)分類與授權**完全不變**(跑既有 sdd-validators 測試全綠);decision-trace 指向不存在 D-id = ERROR。
- **depends_on**:P1-T1, P1-T3

### P1-T5 — delta `decision` 屬性(相容性 + 解析)
- **做**:文件化 `<added ref="x" decision="D-014" />` 慣例。`parseDeltaItems`(`sdd-utils.js:401-411`)**零改動**(`[^>]*` 已忽略 sibling 屬性);新增從 delta 子元素**選擇性讀出** `decision` 屬性以供 P2 稽核。
- **verify(先寫測試)**:帶 `decision` 屬性的 delta,`.ref` 解析**不變**(回歸);讀得出 `decision` 值;無 `decision` 屬性的舊 delta 照常解析。
- **depends_on**:P1-T1

### P1-T6 — schema 文件 + drift 測試
- **做**:`print-schema.js` 生成 `sdd-schemas/vision.md`、`sdd-schemas/decision-ledger.md`;把新常數納入既有 cross-rules invariant 測試 + freshness 測試(確保 code↔doc 不漂移)。
- **verify**:`npm test` 全綠;生成的 schema 文件與常數一致(freshness 測試是 gate)。
- **depends_on**:P1-T1…T5

### P1-T7 —(eval-bearing)SKILL 最小接線
- **做**:`arc-brainstorming` **讀** vision 的 `P-n` 當脈絡、把每次迭代的理由 **append** 成 `status: proposed` 的 ledger 條目(純加法,不碰任何硬 gate);`arc-refining` 讀 ledger/vision 當脈絡、為 `<added>/<modified>` 標 `decision` 屬性。**P1 不引入收斂、不引入授權力。**
- **verify**:**重跑 `arc-brainstorming` 與 `arc-refining` 的 eval**(Iron Law 要求);確認既有 RED→GREEN 行為無回歸;`npm run test:skills` 綠。
- **depends_on**:P1-T2, P1-T3, P1-T5
- **註**:這是 P1 唯一觸發 eval 重跑的任務。若要先把 P1-core(T1–T6,純 lib/schema)落地驗證,可把 T7 切成獨立 PR。

**P1 完成準則(可驗證):** vision(兩層)與 decisions.yml 可被解析/驗證;ledger append-only + 不可編輯 + supersede 由 `validateDecisionLedger` 機械強制;`<trace>` 認得 D-NNN 且既有 trace 零回歸;delta 可帶 `decision` 連結;schema 文件不漂移;`npm test` + skill eval 全綠。→ 此時準則 2(可追溯)、3(恆定 anchor)、4(WHY 日誌)已交付,**完全不碰 Iron Law / 收斂**。

---

## P2 —— 軸 B:LLM 稽核(read-only,每模式安全)

- **里程碑**:擴 `arc-auditing-spec`(維持 `READ-ONLY` / `never-auto-invoke`,`fr-sc-001-ac3`)做 **spec↔decision↔anchor 圖一致性**:每個 delta 的 `decision` 解析得到?每個 `accepted` 決策的 `principle_ref` 指到存在的產品 `P-n`?ledger append-only 交叉驗證?
- **若要在 refiner Phase 6 跑這些結構檢查** → 讓 refiner **吸收機械結構檢查**,稽核 agent 仍是獨立 advisory(不把 advisory 變 pipeline-integral)。
- **verify**:注入不一致(斷掉的 decision 連結、principle_ref 指向不存在 P-n)→ 稽核確實報;稽核**不寫任何檔**(read-only 回歸測試)。
- **depends_on**:P1

---

## P3 —— 軸 C:收斂模式分流(碰 Iron Law,最後做)

- **模式判定(Option A)**:預設 unattended-safe(無訊號=硬擋);attended 顯式 flag(`ARCFORGE_MODE=attended` 由叫用環境設,非 agent 自報);**`arc-looping` permission 預設 deny agent 跑 `arcforge ratify`**(最終 harness gate)。
- **`arcforge ratify <id> <D-id>` CLI**:攤開 `authorized_values` 逐項要人類**知情確認/編輯**(§4.5),確認後 mint `accepted` + `ratified_by`。
- **`mechanicalAuthorizationCheck` decision-trace 授權(§4.3 a–d + §4.5)**:cited 值**精確比對** `authorized_values` 清單(**非**對散文子字串);要求 `accepted` + `ratified_by`;要求 attended-mint。
- **`arc-refining` 模式分流**:attended = draft-then-ratify;unattended = 既有三條合法動作 + **明文禁止 self-ratify / 禁止 agent 自標 low-risk**;deferral 條款(`fr-rf-013`)**範圍化** attended 出口(unattended 語意不變)。
- **Iron Law 改寫**:授權來源新增第三類「attended-minted `accepted` 決策」;不變式「授權粒度是值,不是 decision-id」。
- **verify**:attended fixture 走 ratify → criterion 授權通過;**unattended fixture 嘗試 self-mint accepted = BLOCK**;`MUST window=600s` 對 `authorized_values:["window=60s"]` = ERROR(值盲漏洞已封);**重跑 refining + brainstorming eval**;loop permission deny 的 e2e。
- **depends_on**:P1, P2

---

## 建議的 PR 切法

1. **PR-1**:P1-T1…T6(純 lib/schema,零 skill 行為改動,零 eval 風險)。
2. **PR-2**:P1-T7(skill 接線 + eval 重跑)。
3. **PR-3**:P2(稽核擴充)。
4. **PR-4**:P3(收斂模式分流 + CLI + Iron Law + eval 重跑 + permission 預設)—— 高風險,獨立 PR、獨立審查。

每個 PR 依 `.claude/rules/git-workflow.md`:conventional commit、`npm run lint:fix && npm test`、skill PR 在描述裡記 Iron Law 的 RED/GREEN/REFACTOR。
