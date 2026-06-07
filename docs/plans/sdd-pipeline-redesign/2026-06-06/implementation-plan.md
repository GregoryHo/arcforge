# D6 實作計劃 — workflow 編排 + 缺漏盤點 + 驗收/停止條件

> 狀態：實作計劃 / **待你審查核准（批准前不執行任何 code 改動）**
> 日期：2026-06-06
> 上游：`./research.md` · `./d6-design.md` · `./p1-tasks.md`
> 方法：4 個 load-bearing anchor 由本 session **第一手核實**（非轉述）；6-agent 唯讀 gap-hunt workflow 對照真實 repo 機制。
> 性質：contributor note，不進 shipped surface。

---

## 0. 一句話結論

**D6 的地基是穩的**——所有「最低 ripple / 零改動」的關鍵主張都對照真實 code 證實了。但 gap-hunt 找到 **5 個 blocker**:它們不是設計錯誤,而是**設計把自己最弱的環節(P3 的人類在場 gate、validator 何時真正執行、eval 如何判定通過)講得比真實 repo 機制樂觀**。P1(軸 A)在補上「validator 接線」與「facade re-export」後即可安全執行;**P3 在補上「執行點到底是什麼」之前不應執行**,否則會做出一個綠燈卻空心的授權 gate(這正是 research 判定「比沒有 validator 更危險」的假保證)。

建議:**先執行 P1-core + 接線(PR-1/PR-2),P2/P3 待 blocker 決策後再啟動**。

---

## 0.5 決策定案（2026-06-06,使用者核准後鎖定）

| 決策 | 定案 | 後果 |
|---|---|---|
| 執行範圍 | **全做 P1+P2+P3** | 逐 PR 推進,PR 間由主線 review |
| 執行機制 | **Workflow 自動編排** | 一 PR 一 Workflow,task 走 implementer→spec-reviewer→verifier |
| **B1**(P3 enforcement 姿態) | **Engine 為主 + harness 輔** | P3 的 `arcforge ratify` 以 **engine 側 `ARCFORGE_MODE!=attended` / loop-sentinel 拒絕 mint** 為**主** gate(in-engine,不靠 harness);另加 best-effort blocking hook,但 §9 明文承認其可被 `--dangerously-skip-permissions` 削弱。**不**投資「loop 拒絕 skip-permissions 啟動」。 |
| **B2**(P1 不可變 runner) | **hook-runner(不可繞過)** | PR-2 **新增** PostToolUse/Stop hook,對 `decisions.yml` 寫入跑 `validateDecisionLedger`,agent 無法略過 gate→「機械強制 append-only/不可變」成立。新增 hook 測試(`npm run test:hooks`)。refiner 的 node-e gate 仍保留為**第一道**(快速回饋),hook 為**不可繞過**的第二道。 |

→ 受影響的 §3/§4 改動以此定案為準:**PR-2 多一個 hook + hook 測試**(B2);**PR-4 的 ratify 以 engine-side mode check 為主 gate**(B1)。

---

## 1. 第一手驗證結果（地基,已親自核實）

| 主張 | 出處 | 結果 | 證據 |
|---|---|---|---|
| `classifyTrace` 把 `D-014:` 誤判為 qa(順序 bug) | design §2.3 / §7 | ✅ **證實** | `TRACE_QA_RE=/^([a-zA-Z][a-zA-Z0-9_-]*):(.+)$/`(sdd-validators.js:31);`classifyTrace` 順序 legacy→design→qa(:459-475),design 需 4 位日期前綴,故 `D-NNN:` 落到 qa |
| `mechanicalAuthorizationCheck` 是值盲子字串包含 | research §1.1 / design §4.5 | ✅ **證實** | `designLower.includes(cited.toLowerCase())`(:348)、`verbatim...includes(cited...)`(:384)——皆 substring,非值精確 |
| `parseDeltaItems` 的 `[^>]*` 忽略 sibling 屬性(decision 屬性相容) | design §2.3 A | ✅ **證實** | `<${tag}\s+ref="([^"]*)"[^>]*\/>`(sdd-utils.js:403,407)——`.ref` 不受 `decision="..."` 影響;但**讀出** decision 值需新增 capture |
| `checkDagStatus` 不受影響 | design §8 | ✅ **證實** | sdd-utils.js:729-748 純讀 epic status |
| arc-planning 零行為改動(只讀 spec+latest_delta) | design §6/§8 | ✅ **證實**(agent) | planner 只走 `parseSpecHeader`+`latest_delta`;`parseSpecHeader` 只解析 `<overview>`(:288-348),不碰 trace/criterion/ledger/vision |
| arc-auditing-spec READ-ONLY + never-auto-invoke | design §5 | ✅ **證實**(agent) | SKILL.md:9-15 / :25;eval `sc-001-no-pipeline-invocation.sh`;三個 sub-agent `tools: Read, Grep, Glob` |
| coordinator/worktree/looping/implementing ripple=0 | design §8 | ✅ **證實**(agent) | 四者 grep `decisions.yml\|vision.md\|<trace>` 皆零命中;只消費 `dag.yaml`+`features/*.md` |
| migration 前置順序(先修 classifyTrace) | design §7 | ✅ **證實**(agent) | P1-T4 depends_on T1,T3;發射 D-NNN 的 P1-T7 depends_on T2,T3,T5——修正先落地 |

→ **結論:設計的「可執行管線 ripple=零」與「純加法相容」是真的。** 以下 blocker 全部落在設計**自承的弱半部**(收斂授權 / 人類在場 / 強制執行點),不動搖地基。

---

## 2. 缺漏盤點(Gap Analysis)

### 🔴 BLOCKER（執行前必須先決策/補設計）

**B1 — P3 的「最終 gate」沒有可觸發的訊號,且被 unattended 預設姿態繞過。**
設計 §3/§9 說「加一條 permission 規則」讓 loop deny agent 跑 `arcforge ratify`。對照真實 repo:
- plugin **沒有任何 permissions 設定**可掛(plugin.json 無此欄;arc-looping 無 permission-defaults)。**P3 必須從零建這個 primitive。**
- 唯一的 deterministic blocking hook `arc-guard`(commit 355cb63 的「第一個會擋的 hook」)gate 在 `.arcforge-epic` **worktree marker**;但 loop 的正確姿態是**從專案根目錄跑(無 marker)**(arc-looping/SKILL.md:71),arc-guard 在那裡**不會觸發**。沒有「我在 loop 裡」的判別訊號。
- **最致命:** 生產 loop 用 `claude -p` **不帶任何 permission flag**(loop.js:277,299),而 arcforge 自己的 unattended spawn(eval.js:176、end.js:166)**刻意帶 `--dangerously-skip-permissions`**(理由:「unattended…沒有人能批准 permission prompt」)。使用者跑 overnight loop 會自然伸手拿同一個 flag——而那個 flag 繞過**所有** permission 決策。
- **plan_impact:** 
  1. deny **必須是 blocking PreToolUse hook,不能是 settings `permissions.deny` 條目**(後者被 skip-permissions 繞過);且**必須 e2e 驗證該 hook 在 `--dangerously-skip-permissions` 下仍會擋**(此為 Claude Code 機制假設,須實證,不可口頭假定)。
  2. 必須**新建** loop-context 判別訊號(例如 hook 讀 `loop.js` 已維護的 `.arcforge-loop.json` sentinel,SKILL.md:120),並避免 arc-guard README 警告的 base-session 誤報(誤報會讓使用者整包關掉 arcforge hooks)。
  3. **加 engine 側 defense-in-depth:** `arcforge ratify` 本身在 `ARCFORGE_MODE!=attended` **或**偵測到 loop sentinel 時**拒絕 mint**。如此授權有 in-engine backstop,不全靠可被繞過的 harness 層。
  4. deny 只攔 Bash-tool 路徑;須明文 ratify **只能以 Bash 形式叫用(禁止包成 slash command)**,否則 arc-guard 式攔截會 miss。

**B2 — P1 沒有任何 task 真正「執行」`validateDecisionLedger`/`validateVision`。**
真實 repo 裡,SDD validator **只**以 arc-refining/SKILL.md 內嵌的 `node -e` 片段執行(Phase 2 `validateDesignDoc`:91、Phase 6b `mechanicalAuthorizationCheck`:301)。**沒有 CLI / hook / CI gate** 跑任何 validator(CI 只跑 `npm test`;validator 僅在 Jest 單元測試裡被觸及)。P1-T7 只接「資料**產出**」(brainstorming append proposed、refiner 標 decision 屬性),**沒有接「強制執行」**。
- 因此 P1 完成準則「ledger append-only…**由 validateDecisionLedger 機械強制**」**目前是假的**——validator 存在但**永不觸發**。
- 連被它鏡像的 `validateDecisionLog` 都**零 live 呼叫點**(只在測試),所以「鏡像 DECISION_LOG_RULES」給的是 schema 形狀,**不是**現成的 gate pattern。
- **plan_impact:** 新增明確 P1 task——在 arc-refining(且/或 arc-brainstorming)加一個 `node -e` phase 跑新 validator 並在 ERROR 時 BLOCK(exit≠0、不寫權威檔),比照 Phase 2/6b。**且**:`node -e` 的執行者就是被它約束的 agent,自跑 `exit(1)` 可被略過——所以「機械強制」要嘛(a)由 hook 當不可繞過的 runner(對 `decisions.yml` 寫入掛 PostToolUse/Stop hook 跑 validator),要嘛(b)把「機械強制」字眼降級進 §9 誠實限制、明說 node-e 模式下 append-only 是 advisory。

**B3 — git-diff append-only 檢查不能放在 P2 唯讀稽核 agent 裡。**
P1/P2 把「ledger append-only 交叉驗證」指派給稽核 agent,但該 agent 的 tool grant **只有 Read/Grep/Glob,明文不能呼叫 git**(arc-auditing-spec-state-transition-integrity.md:32;git-history 層明文 out-of-scope)。
- **plan_impact:** git-diff 不可變強制**必須**在 refiner 的 `node -e` gate(可經 Bash shell git)或 hook 裡;P2 稽核只能做**非 git 的結構交叉檢查**(decision link 解析得到、principle_ref 指到存在的 P-n)。重新 scope p1-tasks 的 P2「append-only 交叉驗證」= 稽核**轉報** refiner/hook gate 的發現,而非自己跑 git。

**B4 — eval scenario 宣告 `Trials: 1`,任何字面重跑都得到 `INSUFFICIENT_DATA`(硬 gate,非通過)。**
三個 eval-bearing scenario(`sdd-refining-deferral-invention-guard.md` 等)都寫 `## Trials\n\n1`;`defaultK()` 尊重它;`verdictFromDeltaCI` 在任一臂 <5 trials 時回 `INSUFFICIENT_DATA`(`eval-stats.js:366-367`),而 verdict-policy.md:23 明示「INSUFFICIENT_DATA 是硬 gate」。但實際產出 `IMPROVED` 的 benchmark 用的是 **k=5/6/10**。
- **plan_impact:** eval-bearing task(P1-T7、P3)必須指定 **k≥5**(CLI 帶 `--k 5/10`)或先把 scenario 的 `Trials` 改 ≥5;否則 future implementer 照 `arc eval ab <name>` 字面跑會拿 `INSUFFICIENT_DATA`、**過不了 Iron-Law gate**,task 不可完成。

**B5 — P3「重跑 eval」測的是被它推翻的行為;需要全新 scenario。**
現有 refining scenario assert 的不變式正是「deferral『you decide』→ 永不寫具體 MUST」(deferral-invention-guard.md:46-48)。P3 的 attended draft-then-ratify **反轉**這個不變式(§4.4),所以**正確實作 attended 路徑會讓舊 scenario FAIL**。而 `ARCFORGE_MODE` / `ratify` / `authorized_values` / `ratified_by` / `D-NNN trace` **在現有任何 scenario/skill 都零命中**。
- **plan_impact:** P3 必須**先撰寫新 scenario**(attended-ratify-authorizes、unattended-self-mint-blocked、value-blind-leak-blocked),並決定舊 deferral-invention-guard 的命運(其 assertion 變成**只對 unattended 臂正確**,需 mode-conditional 化)。「重跑既有 eval」不足以驗收 P3。另注意 **preflight ceiling**:兩個 scenario baseline 已近 0.8(0.7/0.59),skill 改動若把 baseline 推過 0.8,preflight 會**擋**重跑(非通過),屆時要 redesign trap。

### 🟡 SHOULD-FIX（執行中必須處理,但不擋核准）

| # | 缺漏 | plan 調整 |
|---|---|---|
| S1 | 新常數必須經 **`sdd-utils.js` facade re-export** | print-schema、cross-rules invariant test、sdd-utils.test、sdd-contracts.test **都從 `sdd-utils` import** 規則常數,不是 `sdd-rules`。P1-T1 加一步:在 sdd-rules.js 定義並 export `VISION_RULES`+`DECISION_LEDGER_RULES` 後,**同步加進 sdd-utils.js 的 require(:15)與 module.exports(:750-756)**。否則 print-schema import 拿到 undefined、invariant test import 不到。 |
| S2 | `VISION_RULES` 可能**無法**滿足 cross-rules invariant 契約 | invariant test 要求每個註冊常數有 `{key,type}[]` required-fields 陣列;VISION_RULES 是「產品 P-n list + per-spec 章程」兩種形狀,不符。**拆 P1-T6**:freshness gate 兩者都加;cross-rules registry **只**註冊 `DECISION_LEDGER_RULES`;vision 要嘛把 product-principle list 塑成合規陣列、要嘛明文 exempt(由 validateVision 測試承擔形狀覆蓋)。 |
| S3 | git-diff validator 應**拆 seam**(純函數 + git helper) | validateDecisionLedger 會是 sdd 層**第一個** shell git 的 validator。比照 coordinator.js `_runGit`:一個小 helper `execFileSync('git',['show',`HEAD:${relPath}`],{cwd:projectRoot})` 回 previousContent(或 null),`validateDecisionLedger(currentParsed, previousParsed)` **保持純函數**做 per-entry diff。符合 security.md 的 execFileSync-array 規則,且可不靠 git fixture 單測。 |
| S4 | git-diff 邊界**只**處理了「新檔」一種 | 補:(1)**按 D-id 對齊逐條比對**(非整檔 diff——攻擊是「append 新條目同時偷改舊條目」,整檔 diff 分不出);(2)git 不存在/非 repo/path 不在 HEAD 的**明文行為**(fail-closed ERROR 還是 documented advisory no-op,擇一寫死);(3)detached-HEAD、staged-but-uncommitted 語意;(4)明寫「gate 從專案根目錄跑」並顯式傳 `cwd:projectRoot`。 |
| S5 | `parseDecisionLedger` 需 **root-level YAML sequence** 解析 | 唯一的 sequence helper `parseYamlSequence` 是 sdd-validators.js:48 的**私有**函數,base yaml-parser 只支援 object-root。canonical-source 規則禁止複製→**relocate** 到共用模組讓 sdd-utils 的 parseDecisionLedger 重用。P1-T3 要列此步。 |
| S6 | `arcforge ratify` 是**整個互動式新命令**,非一格表 | 需獨立 sub-task + acceptance test:`ratified_by` provenance 來源(zero-dep 下無 credential 層——timestamp+不可由 agent 偽造的 marker,或接受 human-asserted 而以 permission gate 為真保證);**atomic 單欄 rewrite**(只翻一個 status + 加 ratified_by,不碰凍結的 decision/why);readline 逐值 confirm/edit loop(可參 eval-command.js:135)。§4.5「人類當場 type/edit 值」是**反蓋章的 load-bearing 機制**,要有自己的 acceptance test。 |
| S7 | 兩層 vision **跨檔解析**未指定 | validateVision 從 `specs/<id>/vision.md` 怎麼定位專案根的 `product/vision.md` 來解析 `principle_ref→P-n`?現有 validator 全是單檔(無跨檔先例)。補:projectRoot 解析、fixture layout(temp 專案目錄同時含 `product/` 與 `specs/<id>/`)、以及 `product/vision.md` 缺席時的契約(per-spec vision 可獨立還是 ERROR)。 |
| S8 | §9.2 合法 typo 修正**無補救路徑** | git-diff 規則把改既有 decision/why 變成硬 ERROR,但合法 typo 無出口(supersede 只翻 status,不能改凍結散文)。補:明文補救路徑(只能記一條 correcting supersede,或接受 ERROR 去 amend 前一 commit)。並明寫 **commit 粒度限制**:不可變只相對 HEAD 強制,**同 session pre-commit 的 append-then-edit 逃過檢查**——列為已知限制,測試別誤設「session 內保護」。 |
| S9 | brainstorming「模式感知」(§6 一格)**無對應 task** | §4.1 說記 `proposed` 決策在**所有模式**都允許→brainstorming 可能**根本不需要** mode 邏輯。和解:要嘛 §6 過度宣告(從 brainstorming 那格拿掉「模式感知」),要嘛 P3 加一個明確 brainstorming 行為 sub-task。現狀會讓 implementer 找一個沒人交付的 mode 邏輯。 |
| S10 | P2 改了 shipped skill+agent(有 eval suite)但**無 eval 重跑義務** | 決策 §5 只列 P1/P3。P2 擴 arc-auditing-spec 行為→依 Iron Law 要重跑其 eval。補一個 P2 verify(重跑 arc-auditing-spec eval),或明文豁免(read-only/additive)的理由。**且**:若把結構檢查讓 refiner「吸收」,會造成稽核 advisory copy + refiner mechanical copy **重複**→需單一共用 lib helper 防漂移,並**保住** `sc-001-no-pipeline-invocation` eval(吸收不可變成 auto-invocation)。 |

### 🟢 NICE-TO-KNOW（寫進 plan 註腳即可）

- **ships-vs-user-creates 邊界要明說**:`vision.md`/`decisions.yml` 是**使用者專案**的 artifact(`specs/<id>/`、`product/`),**arcforge repo 不會有真實檔**;交付物是 validator+schema view+skill 行為,**對 fixture 測試**。並消歧:shipped schema view `scripts/lib/sdd-schemas/vision.md`(committed)vs 使用者 artifact `product/vision.md`(永不 commit)——同 basename,有 implementer 誤 commit sample 的風險。
- **無新 fixture 檔**:sdd 單測用 inline `mkdtempSync`+`writeFileSync`,不是 committed `fixtures/` 目錄;新測試照此 pattern。
- **git-in-tempdir fixture 是 sdd 層第一個**(比現有 sdd 單測都重);重用 `tests/scripts/coordinator-test-helpers.js` 的 `execFileSync('git',...)`+`mkdtempSync` pattern。
- **runner 對應**:P1-T1…T6 全 `tests/scripts/`→jest→`npm run test:scripts`;`arcforge ratify`(P3)→`tests/node/`→`npm run test:node`;P1-T7/P3 skill→`npm run test:skills`(pytest)+eval。
- **eval 在本 dev repo 可跑**:skill eval 在隔離/plugin-free trial dir 跑,plugin disablement 不擋它;但需要 live `claude -p` on PATH + API 額度 + k≥5 trials(每 trial ~20–40s、數千 output token)——把這些當前置條件寫明,別假設 eval「免費/離線」。
- arc-planning 引用微漂移(design 寫 `:12,28`,實際「inputs from spec only」在 `:41`)——非 load-bearing。

---

## 3. 修訂後的改動盤點(完整檔案清單)

> 在 design §6 的基礎上,**補上 §6 漏列的 test / schema-doc / facade / hook / git-helper**。標 ⊕ = §6 未列、本盤點新增。

### P1 — 軸 A(lib/schema 核心)

| 檔案 | 改動 | 來源 |
|---|---|---|
| `scripts/lib/sdd-rules.js` | 新增 `VISION_RULES` + `DECISION_LEDGER_RULES`(deep-frozen);`module.exports` 露出 | §6 |
| `scripts/lib/sdd-utils.js` | ⊕ **re-export** 兩新常數(require:15 + exports:750-756);新增 `parseVision`、`parseDecisionLedger` | §6 + ⊕S1 |
| `scripts/lib/sdd-validators.js` | 新增 `TRACE_DECISION_RE=/^(D-\d+):(.+)$/`;`classifyTrace` 插 decision 分支(**design 後、qa 前**);新增 `validateVision`、`validateDecisionLedger`(**純函數**);`mechanicalAuthorizationCheck` 加 decision-trace 分支(P1 僅存在性) | §6 + ⊕S3 |
| `scripts/lib/sdd-utils.js`(或共用模組) | ⊕ **relocate/export** `parseYamlSequence`(現私有於 sdd-validators.js:48)供 parseDecisionLedger 重用 | ⊕S5 |
| ⊕ git helper(sdd-validators.js 內或新檔) | ⊕ `execFileSync('git',['show',`HEAD:${rel}`],{cwd:root})` 回 previousContent\|null | ⊕S3 |
| `scripts/lib/print-schema.js` | ⊕ 新增 `renderVision`+`renderDecisionLedger`;註冊進 `RULES_BY_TARGET`、`RENDERER_BY_TARGET`、HELP、`GENERATED_HEADER` regen 指令;module.exports | ⊕(§6 僅含混提到) |
| ⊕ `scripts/lib/sdd-schemas/vision.md` | ⊕ **新檔**(committed schema view,print-schema 生成) | ⊕ |
| ⊕ `scripts/lib/sdd-schemas/decision-ledger.md` | ⊕ **新檔**(同上) | ⊕ |
| ⊕ `tests/scripts/sdd-schemas-fresh.test.js` | ⊕ SCHEMAS 陣列 + imports 各加 2 entry | ⊕ |
| ⊕ `tests/scripts/sdd-rules-invariants.test.js` | ⊕ RULE_REGISTRY + imports **只**加 `DECISION_LEDGER_RULES`(vision 走 exempt 或重塑) | ⊕S2 |
| ⊕ `tests/scripts/*.test.js`(新增/擴充) | ⊕ validateVision / validateDecisionLedger(含 git-in-tempdir)/ classifyTrace / delta-decision-attr 單測,inline mkdtemp pattern | ⊕ |
| `skills/arc-brainstorming/SKILL.md` | 讀 vision `P-n` 當脈絡;append `status: proposed` ledger 條目(純加法) | §6 |
| `skills/arc-refining/SKILL.md` | 讀 ledger/vision;為 `<added>/<modified>` 標 `decision` 屬性 | §6 |
| ⊕ `skills/arc-refining/SKILL.md`(gate phase) | ⊕ **新 `node -e` phase** 跑 validateVision+validateDecisionLedger,ERROR→BLOCK(比照 Phase 2/6b) | ⊕B2 |
| ⊕(可選)hook on `decisions.yml` 寫入 | ⊕ 若要「不可繞過」的不可變 runner:PostToolUse/Stop hook 跑 validateDecisionLedger | ⊕B2(替代) |

### P2 — 軸 B(唯讀稽核,additive)

| 檔案 | 改動 | 來源 |
|---|---|---|
| `agents/arc-auditing-spec-*.md` | spec↔decision↔anchor **非 git** 圖一致性(decision link 解析、principle_ref→P-n);**維持 Read/Grep/Glob、never-auto-invoke** | §6 + ⊕B3 |
| ⊕ 共用 lib helper | ⊕ 結構檢查抽成單一 helper,稽核 advisory + refiner mechanical 共用,防漂移 | ⊕S10 |
| ⊕ P2 verify:重跑 arc-auditing-spec eval | ⊕ Iron Law(改了行為 spec) | ⊕S10 |

### P3 — 軸 C(收斂模式分流,**高風險,blocker 未決前不啟動**)

| 檔案 | 改動 | 來源 |
|---|---|---|
| `scripts/cli.js`(+ ⊕`scripts/cli/ratify-command.js`) | `arcforge ratify <id> <D-id>`:readline 逐值知情確認/編輯→mint accepted+ratified_by;atomic 單欄 rewrite;⊕ engine 側 `ARCFORGE_MODE!=attended`/loop-sentinel **拒絕 mint**(defense-in-depth) | §6 + ⊕B1/S6 |
| `scripts/lib/sdd-validators.js` | `mechanicalAuthorizationCheck` decision-trace 授權(§4.3 a–d + §4.5):**精確比對** authorized_values、要求 accepted+ratified_by、要求 attended-mint | §6 |
| `skills/arc-refining/SKILL.md` | 模式分流(attended=draft-then-ratify;unattended=三條合法動作+明文禁 self-ratify);`fr-rf-013` 範圍化 attended 出口;Iron Law 加第三類授權來源 | §6 |
| ⊕ `hooks/`(新 blocking PreToolUse hook) | ⊕ deny Bash 形式的 `ratify`,gate 在**新建的 loop-context sentinel**;**禁止 ratify 包成 slash command**;e2e 驗證在 `--dangerously-skip-permissions` 下仍擋 | ⊕B1 |
| ⊕(可選)`scripts/loop.js` | ⊕ 考慮 loop 在「convergence-ratify 可達」時拒絕帶 skip-permissions 啟動 | ⊕B1 |
| ⊕ `evals/scenarios/*.md`(新增) | ⊕ attended-ratify-authorizes / unattended-self-mint-blocked / value-blind-leak-blocked;舊 deferral-invention-guard mode-conditional 化 | ⊕B5 |

---

## 4. 驗收條件(per phase,可證偽)

### P1 完成 = 全部成立
1. `npm run test:scripts` 綠;新單測涵蓋:vision(兩層,含跨檔 principle_ref→P-n)、ledger(D-id 單調唯一、git-diff per-entry 不可變、supersede 翻 status)、classifyTrace(`D-014:x`→decision **且**既有 `2026-..:`/`q1:`/`REQ-F1` 分類零回歸)、delta decision 屬性(`.ref` 不變 + 讀得出 decision)。
2. **接線 gate 真的會擋**:在 fixture 上製造 append-only 違規 / 壞 principle_ref,**跑 arc-refining 的新 node-e phase 確實 exit≠0 且不寫權威檔**(B2 補的 task)。
3. schema freshness gate 綠:`sdd-schemas/vision.md`+`decision-ledger.md` 與常數一致;cross-rules invariant 對 `DECISION_LEDGER_RULES` 通過(vision 依 S2 決議)。
4. `npm test` 全綠(含既有 sdd-validators 測試零回歸)。
5. (P1-T7)arc-brainstorming/arc-refining eval **NON-REGRESSION**:treatment passRate 維持 ~100%、無 `REGRESSED`,**k≥5**(B4);純加法故以非回歸而非 discrimination 判定(S? — 見停止條件)。

### P2 完成
6. 注入不一致(斷掉的 decision link、principle_ref 指不存在 P-n)→稽核**確實報**;稽核**不寫任何檔**(read-only 回歸測試)。
7. `sc-001-no-pipeline-invocation.sh` 仍綠(never-auto-invoke 不破);arc-auditing-spec eval 重跑通過(S10)。

### P3 完成
8. attended fixture 走 `ratify`→criterion 授權**通過**;**unattended fixture 嘗試 self-mint accepted = BLOCK**。
9. `MUST window=600s` 對 `authorized_values:["window=60s"]` = **ERROR**(值盲漏洞已封)。
10. **engine 側 backstop**:`ARCFORGE_MODE!=attended` 時 `arcforge ratify` 拒絕 mint(不靠 harness)。
11. **harness 側 e2e**:blocking PreToolUse hook 在 loop-sentinel 在場時 deny Bash `ratify`,**且在 `--dangerously-skip-permissions` 下仍 deny**(B1——若實證無法達成,見停止條件 X3)。
12. 新 eval scenario(attended-authorizes / unattended-blocked / value-blind-blocked)**verdict IMPROVED,k≥5,preflight PASS(baseline<0.8)**;舊 deferral scenario mode-conditional 後仍通過其(unattended)assertion。

### 每個 PR(共通)
13. `npm run lint:fix && npm test` 綠;conventional commit;skill PR 描述記 Iron Law RED/GREEN/REFACTOR。

---

## 5. 停止條件(escalate,不要硬推)

- **X1 — eval 拿不到有效 verdict:** 字面重跑得 `INSUFFICIENT_DATA`(B4)或 preflight ceiling block(B5)。**停**,回報並決定:改 `Trials`/帶 `--k`,或 redesign trap。不要降標宣稱通過。
- **X2 — B2 的不可變強制只能做成 advisory:** 若決定不加 hook-runner,node-e 自跑可被 agent 略過。**停**並要你裁決:接受 advisory(把「機械強制」字眼降進 §9),還是投資 PostToolUse/Stop hook runner。**不要在文件宣稱機械強制卻只有 advisory。**
- **X3 — B1 的 harness gate 實證無法在 skip-permissions 下擋:** 若 e2e 證明 blocking hook 在 `--dangerously-skip-permissions` 下不 fire,則 P3 的人類在場保證**只剩 engine 側 backstop(B1.3)**。**停**並回報:這把 D6 的姿態從「harness 為真 gate」改成「engine flag 為主 gate + harness 為輔」——是設計層決策,需你確認(research §0 的「假保證比沒有更糟」紅線)。
- **X4 — Iron Law eval 回歸:** P1-T7/P3 改 skill 後若 treatment passRate 掉出非回歸帶,且修一處破另一處。**停**(.claude/CLAUDE.md §5):報已試、失敗、現假設,要你定成功準則是否正確。
- **X5 — VISION_RULES 無法同時滿足 invariant 契約與兩層語意(S2):** 若重塑成 `{key,type}[]` 會扭曲語意。**停**並擇:exempt(明文)或改契約。
- **X6 — 同一 ERROR 修後重現 / 下一步只是上一猜測的變體**(.claude/CLAUDE.md §5):停、escalate。

---

## 6. 執行 workflow(如何 orchestrate)

> ultracode + 專案 TDD 紀律(每個 lib 改動先寫失敗測試)。建議用 **Workflow 工具一個 task 一個 implementer**,每個 task 走 implement→spec-review→verify,PR 為 phase 邊界。**批准後**才啟動。

**PR 切法(沿用 p1-tasks §建議,加 blocker 補丁):**

1. **PR-1 — P1-core(純 lib/schema,零 skill 行為,零 eval 風險)**
   - pipeline,**依賴序**:T1(常數+facade re-export)→{T2 vision、T3 ledger+git-helper、T4 classifyTrace、T5 delta-attr 可並行}→T6(print-schema+freshness+invariant)。
   - 每 task:`implementer`(TDD:先寫失敗測試)→`spec-reviewer`→`verifier`(獨立跑 `npm run test:scripts`)。
   - worktree isolation:這些動同一批 lib 檔,**序列化或單一 worktree**避免衝突(不要 N 個平行 worktree 改 sdd-validators.js)。
2. **PR-2 — P1 接線 + gate(eval-bearing)**
   - T7(skill 讀 vision/append proposed/標 decision)**+ B2 的 node-e gate phase**。
   - verify:`implementer`→`spec-reviewer`→**eval(k≥5,非回歸判定)**。eval 需 live `claude -p`+API。
3. **PR-3 — P2(稽核擴充,additive)**
   - 共用 helper + 稽核 agent 擴讀(非 git)+ P2 eval 重跑 + read-only 回歸。
4. **PR-4 — P3(收斂模式分流,高風險,獨立審查)**
   - **前置:blocker B1 的 enforcement 設計、B5 的新 scenario 先落地。**
   - ratify CLI(+engine backstop)→ mechanicalAuthorizationCheck 授權分支 → refiner 模式分流+Iron Law → blocking hook + e2e → 新 eval。
   - 每步 spec-review + verify;Iron Law eval 重跑。

**編排骨架(示意,待批准):** 一個 Workflow per PR,`pipeline(tasks, implement, specReview, verify)`;eval-bearing task 的 verify stage 呼叫 eval harness 並讀 verdict;任何 stage ERROR→drop 該 task 到 null 並 log,phase 結束彙整由我審。**注意 dev-context.md**:本 repo plugin 停用,skill 行為的真實驗證走 eval harness(plugin-free),不靠 session plugin 載入。

---

## 7. 待你裁決的開放決策

1. **本次執行範圍?**(影響我下一步)
   - (A) 只做 PR-1+PR-2(P1),P2/P3 待 blocker 決策後另議 **(建議)**
   - (B) P1+P2
   - (C) 全做(P1+P2+P3)——需先答 Q2、Q3
2. **B2 不可變強制的真實度?** advisory(node-e,輕) vs hook-runner(不可繞過,重)。
3. **B1 P3 人類在場 gate 的姿態?** 接受「engine flag 為主 + harness 為輔(承認可被 skip-permissions 削弱)」,還是投資讓 loop 拒絕 skip-permissions / 新 loop-context hook(重)。
4. **執行機制?** 用 Workflow 自動編排(implementer/spec-reviewer/verifier 多 agent)vs 我在主線手動 TDD 逐 task。

---

## 12. 實作完成記錄(2026-06-07)

全程 Workflow 編排(implementer→spec-reviewer→verifier),每步 `npm test` 全綠、lint clean、零回歸。branch `feat/sdd-d6-p1`,**本地 commit、未 push/PR**(待你決定)。

| Commit | 內容 | gate |
|---|---|---|
| `aedf82d` docs | research/design/p1-tasks/implementation-plan | — |
| `4b0a7e7` feat(cli) | **PR-1** P1-core lib/schema(VISION/LEDGER rules、parse/validate、classifyTrace decision 分支、delta decision capture、schema docs)+ 84 測試 | ✅ pass |
| `ba5f4e3` feat(skills) | **PR-2** brainstorming/refining 接線 + refiner Phase 2.5 node-e gate + **`sdd-ledger-guard` PreToolUse 不可變 hook** + 12 hook 測試 | ✅ pass |
| `269e12d` feat(skills) | **PR-3** P2 `checkSpecDecisionGraph`(read-only 圖稽核)+ audit agent patterns 7/8/9 + refiner 吸收 + 10 測試;never-auto-invoke 保留 | ✅ pass |
| `337de89` feat(cli) | **PR-4-core** authorization 語意(值盲已封)+ `arcforge ratify` + engine-primary B1 gate + forge-by-Edit hook + `sdd-ratify-guard` + keystone 測試 | ✅ pass |
| `f03bf0e` feat(skills) | **PR-4-skill** refiner mode-split + Iron Law 第三授權源(attended-only、純加法)+ 3 新 eval scenario | ✅ pass |

### 與原計劃的偏差(as-built)
- **validator 落點**:`validateVision`/`validateDecisionLedger` 放 `sdd-utils.js`(非 §3 表的 sdd-validators.js)——符合既有 `validateDesignDoc` precedent,經 facade re-export,consumer 無感。
- **parseYamlSequence relocate** → 放 `yaml-parser.js`(leaf module),比原議「移到 sdd-utils」更乾淨,解了 sdd-utils↔sdd-validators 循環依賴。
- **B2 hook = PreToolUse**(非 §0.5 暫定的 PostToolUse/Stop)——PostToolUse 無法 block;PreToolUse 才能真正擋(closes forge-by-Edit)。這是對 §0.5 B2 的正確細化。
- **新增 forge-by-Edit 封堵**(計劃外但必要):`detectForgeAttempt` deny agent 用 Edit/Write mint `accepted`/`ratified_by`——只有 `ratify`(fs 寫,不過 Edit/Write tool)能 mint。這補上了 B1 engine-primary 下「直接編輯 ledger 偽造 accepted」的洞。
- **loop sentinel gate**:engine 側 `ratify` 檢查 `.arcforge-loop.json` + `ARCFORGE_MODE`;`sdd-ratify-guard` 為 best-effort Bash deny(誠實標註可被 skip-permissions 繞過)。
- **version bump 延後**:per-PR 不 bump,整個 D6 一次 bump 留給 release(`arc-releasing`)。
- 既有 `validateDecisionLedger` 已預留 `proposed→accepted` 放行(P1 實作前瞻),故 ratify 不被自身 validator 誤擋;不可變/單調仍強制。

### Eval 狀態(2026-06-07 跑完,k=5)
| Scenario | preflight | ab verdict |
|---|---|---|
| sdd-refining-attended-draft-then-ratify | PASS(baseline 0%) | **IMPROVED**(baseline 0% → treatment 100%,Δ+0.33,CI[0.33,0.33]) |
| sdd-refining-unattended-self-mint-blocked | **BLOCK**(baseline 100% ≥ 0.8 ceiling) | gated(未跑) |
| sdd-refining-value-blind-leak | **BLOCK**(baseline 100% ≥ 0.8 ceiling) | gated(未跑) |

**判讀(誠實,非 hollow pass):**
- 唯一「prose 教得出」的新正向行為(attended draft-then-ratify)→ **IMPROVED**,zero variance,baseline 做不到、treatment 必做。**Iron Law gate 對可教的行為已滿足。**
- 兩個 ceiling-block 守的是 baseline **本來就不會犯**的失敗(無 skill 也 100%)——因為它們是 **engine deterministic 強制**(PR-4-core forge-by-Edit hook + mechanicalAuthorizationCheck),非 prose 教出。依 `eval.md`「測 infrastructure 用 unit test、非 eval」,這兩者**不該是 skill A/B**;其安全底線已由 deterministic 測試鎖定。
- **安全關鍵保證鎖定處**:值盲洩漏 BLOCK + unattended self-mint REFUSE 在 PR-4-core 的 jest/node 測試(`sdd-d6-classify.test.js`、`test-ratify-cli.js`、`sdd-ledger-guard.test.js`),非 eval。
- 既有 `sdd-refining-deferral-invention-guard`(unattended 非回歸 guard)**未改**;unattended 路徑 diff 證實 byte-for-byte 不變。
- **裁決(使用者核准)**:保留 1 個 IMPROVED 行為 scenario(`sdd-refining-attended-draft-then-ratify`);**退役**兩個 engine-guarantee scenario(`sdd-refining-unattended-self-mint-blocked`、`sdd-refining-value-blind-leak`)——其行為已由 PR-4-core 的 deterministic unit test 覆蓋(符合 eval.md「測 infrastructure 用 unit test 非 eval」),不硬把 baseline 調成會犯錯(那是用 eval 測 engine 的反模式)。

### 待你決定 / 後續
1. eval 結果(背景跑中)→ 若 scenario 撞 preflight ceiling 或 INSUFFICIENT,依停止條件 X1 redesign(不降標)。
2. push `feat/sdd-d6-p1` + 開 PR(或多 PR)?——你的 commit cadence 選的是「本地 commit」,push/PR 是你的下一個 decision。
3. release 時的單次 version bump(`arc-releasing`)。

---

## 附錄:gap-hunt 證據鏈

- workflow `d6-plan-gap-hunt`(6 唯讀 agent,~572k token,~7 分鐘),full output 見 task `wkem3lvms`。
- 第一手 anchor(本 session 直讀):sdd-validators.js:31/348/384/459-475、sdd-utils.js:403/407/729-748、sdd-rules.js:132-188。
