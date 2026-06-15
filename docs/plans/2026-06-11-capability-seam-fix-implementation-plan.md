
# arcforge 最終實作計畫（v-Next 統整版）

> 本文件是唯一執行依據。所有先前查證事實（`/tmp/arcforge-audit-items.json`、`/tmp/arcforge-goal-analyses.json`、`/tmp/arcforge-capability-first-blueprint.md`）已吸收；七大情境走查發現的每一條 seam 均已併入對應任務（以【S*-*】標註）。實作者依波次執行，遇停止條件即上報，不得自行繞道。

> **執行狀態（2026-06-12）**：Wave 0 全數完成並合併 — CORE-1 (#64)、CORE-2 (#69)、AF-1 (#65)、AF-2 (#66)、RV-1 (#67)、WT-1 (#68)。RV-1 spike 結論：`decision:block` 與 `additionalContext` 均達模型（v2.1.172，含 Task-subagent 輪）；helper 採 additionalContext 形態，RV-3/RV-5/ICL-10 解凍。CORE-2 的 ≤450 門檻經停止條件上報後由 owner 修訂為 (b)+(c) 方案、≤467（見該任務的修訂註記）。
>
> **MATCHER TRIAGE hotfix（2026-06-12，branch `fix/hooks-matcher-triage`）**：RV-2 的 6-cell A/B 證實 expression matcher（`tool == "..."` / `&& tool_input... matches ...`）在 Claude Code v2.1.173 上從未觸發 — matcher 是對 tool name 的 regex，無 expression 語法。guard 層（arc-guard G2/G3、sdd-ledger-guard、sdd-ratify-guard、arc-remind）的 hooks.json matcher 已全數換成 plain tool-name（`Bash`/`Edit`/`Write`）；四個 hook 的 main.js 原本即在 tool_name 上自我把關，無需改動。quality-check 的 matcher 由 RV-2 分支自行修（hunk 保持互斥）。Wave 2.1（guard package）必須以本分支為基底。

---

## 1. 總覽

### 北極星
**人的工作收斂為 review**：review queue、ratification、acceptance。生產工作（寫碼、驗證、合併、記錄）由 harness + toolkit 完成。每個波次的產出都必須讓「人只需審核」更接近事實：deterministic CLI 取代 prose git、verifier gate 取代人工驗收、SessionStart 注入早晨待辦（ratify-pending + loop-finished review queue）取代人工翻檔案。

### 彈性與組合原則（約束所有任務）
- 每個 skill 必須**獨立可用**（standalone），且在其他元件存在時**可組合**（composition）。
- 任何 skill 不得硬性依賴使用者未選用的機制：hooks 是 Claude Code 限定的「增強」，skill 文字不得假設其存在；learning、attended mode、verifier 全為 opt-in；`--verify-cmd` 未開時行為與今日逐 byte 相同。
- 跨平台（Claude Code / Codex / Gemini CLI / OpenCode）只依賴 Node + CLI。

### 與既有藍圖的關係
- **推翻**藍圖 1.7「arc-using-worktrees 併入 arc-coordinating」：依 owner 指令，arc-using-worktrees 改寫為**通用兩層 worktree skill**，不綁 DAG（§2）。
- **維持** Wave 6.1 finishing 雙胞胎合併，但合併方向**反轉**：存活者為 `arc-finishing`（通用名），body 為 epic 超集 + Step 0 marker 判別（WT-6 記錄之決議）。
- 藍圖 1.11 的「arc-verifying dangling arc-syncing-spec」項目**已被反證**（test-pinned 邊界語言），任何包不得移除。
- 新增兩個 Wave 0 級前置任務 **CORE-1（cli.js 分解）**、**CORE-2（loop.js 分解）**——走查證實 cli.js（實測 665 行）與 loop.js（實測 664 行）為多包共用面，照原計畫疊加必然撞 700 行硬上限（【S2-4】【S3-5】【S4-4】）。
- **SRH-6 廢止為獨立任務**：其 arc-using router 列改寫與 WT-6 的批次編輯衝突且指向已刪除的 skill 名（【S1-3】【S2-2】【S6-4】），內容全數併入 WT-6 單一批次；SRH-7 與 WT-8 共用一次路由 eval。

---

## 2. 通用 worktree skill 設計摘要（RFC 精華）

### 架構（已定案，單一建議）
`arcforge worktree add|list|remove` CLI 子指令群 + 新零依賴模組 `scripts/lib/worktree-generic.js` + 重寫的兩層 SKILL.md。不採 prose git，三個承重理由：
1. **never-hardcode-paths 規則使 prose 不可能正確**——canonical path 由 `worktree-paths.js` 執行期推導。
2. **Hooks 看的是 Bash 指令文字**——經 `node .../cli.js worktree add` 路由的操作不會命中 arc-remind 的 `WORKTREE_ADD_RE` 與未來 arc-guard G4，seam 以建構方式自動解決。
3. **北極星**——deterministic CLI + JSON 輸出是可 review 的生產；prose git 是即興。

### 路徑推導與判別
- 通用（非 epic）worktree 重用 `getWorktreePath(projectRoot, /*specId=*/null, slug)`（worktree-paths.js:55-65 的 legacy-null hash 分支）→ `~/.arcforge/worktrees/<project>-<hash6>-<slug>/`。已查證後果全部良性：`parseWorktreePath` 視為 managed、`_findBaseWorktree` 正確跳過、`_syncBase` 對其不可見、與 epic worktree 無 hash 碰撞。
- **不新增 marker 檔**。判別式：`kind = parseWorktreePath × hasArcforgeMarker` → base / epic / generic / external。
- **finish = handoff 不複製**：`.arcforge-epic` 存在 → 合併後的 `arc-finishing` epic 路徑（G2 強制 coordinator merge）；不存在 → 同一 skill 的非 epic 路徑（4 選項 gate），Step 5 cleanup 用 `arcforge worktree remove`。
- **組合層 = 指標不平行文件**：epic 展開只留一小節委派 `node "${ARCFORGE_ROOT}/scripts/cli.js" expand --epic <id> --project-setup`，完整生命週期唯一屬於 arc-coordinating——以委派而非合併的路徑消滅已確認的 drift pair。

### 偵測 + handoff 契約（由上而下，先中先贏）
| # | 訊號 | 路由 |
|---|---|---|
| 1 | cwd 有 `.arcforge-epic` | 已在 epic worktree。絕不巢狀建 worktree。工作→arc-implementing；整合→arc-finishing（epic 路徑）。worktree 內 raw `git merge` 被 G2 拒絕——skill 要說明，不要對抗。 |
| 2 | `specs/<id>/dag.yaml` 存在且工作匹配某 epic id | 組合層：`expand --epic <id> --project-setup`，從 JSON 讀絕對 `path`（cli.js:481 已查證）。branch 為引擎推導的 `<spec-id>/<epic-id>`（修掉陳舊的 `-b <epic-id>` 主張）。 |
| 3 | dag.yaml 存在但工作非 epic（實驗/hotfix/review checkout） | 通用層在 arcforge 專案內合法——彈性要求。`arcforge worktree add`。 |
| 4 | 無任何 arcforge 狀態 | 通用層，完整獨立價值。 |

使用者明示的自訂路徑覆寫一切（raw git 執行；`worktree list` 標註 `external`）。

### Seam 解法（建構式）
- arc-guard **零程式碼變更**：G2/G3 自我閘控於 `hasArcforgeMarker(cwd)`，無 marker 的通用 worktree 命中已測試的 no-op 不變量（加一條回歸測試固定）。
- arc-remind **僅改訊息**：epic→`arcforge expand`；非 epic→`arcforge worktree add`。
- 未來 G4 的協調要求：deny regex 只匹配 raw `git worktree add|remove`，deny 訊息給雙重導向，**必須在 WT-2 之後落地**。
- 【S1-1】跨平台 ARCFORGE_ROOT 解析：invocation header 改用 blessed fallback 形式 `: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"`（三個非 Claude 平台指南都標準化 clone 至 `~/.agents/arcforge`；Claude Code 上 hook 匯出值因 `:=` 只填未設情況而勝出）。

---

## 3. 實作波次

> 每任務格式：**變更**（檔案級）→ **驗收**（可執行檢查）→ **停止**（停下上報的條件）→ 工作量。【S*-*】= 走查 seam 修補，為任務的一部分，不可省略。

### Wave 0 — 決議與基礎前置（全部可並行）

#### CORE-1（新）：scripts/cli.js 指令分派分解
- **變更**：依既有 `scripts/cli/ratify-command.js` 模式（已查證 scripts/cli/ 含 eval/learn/obsidian/ratify-command.js + shared.js），把 cli.js（實測 665 行）的 help 文字與較大的 case 區塊抽出為 `scripts/cli/` 模組，騰出 **≥60 行**淨空——後續 WT-2（worktree case）、WT-5（merge --abort）、SDD-6（sdd-gate case）、AF-8/AF-10（loop flags）、AF-11（parallel --features）合計約 +60~70 行，照原計畫最後落地者必撞 700 硬上限【S2-4】。
- **驗收**：`wc -l scripts/cli.js` ≤ 600；`npm test`（5 runners）+ `npm run lint` 綠；所有既有 CLI 行為逐 byte 不變（tests/node/test-cli.js 不改斷言而通過）。
- **停止**：分解需要改任何子指令的輸出 shape → 停（輸出契約屬 SRH-2/各能力包）；發現 case 之間共享可變狀態無法乾淨切分 → 停並上報。
- **工作量**：hours~1 day。**阻擋**：WT-2、WT-5、SDD-6、AF-8、AF-10、AF-11。

#### CORE-2（新）：scripts/loop.js 狀態層抽離
- **變更**：把 `saveLoopState/loadLoopState/finalizeLoop/recordError` 抽至 `scripts/lib/loop-state.js`（named exports、throw-with-context），loop.js（實測 664 行）保留協調流程——SDD-5、AF-5、AF-7、AF-8、AF-9、AF-10 共六任務、兩個包要動同一檔案，保守估計 +300 行【S3-5】【S4-4】。在兩包的依賴清單登記 `scripts/loop.js` 為共用面；SDD-5 的 finalizeLoop helper 落在分解後版型上。
- **驗收**：`wc -l scripts/loop.js` ≤ 450；`npx jest tests/scripts/loop.test.js` 不改斷言而通過；legacy `.arcforge-loop.json` 仍可載入。
- **停止**：抽離迫使 state 檔案格式變動 → 停（AF-5 擁有 schema 演進）。
- **工作量**：hours~1 day。**阻擋**：AF-5、AF-7、AF-8、AF-9、AF-10、SDD-5。
- **修訂註記（已執行，#69）**：≤450 門檻經停止條件上報證實與下游所有權算術矛盾（四具名函式僅 ~65 行；buildTaskPrompt 屬 AF-4、parseLoopArgs/spawn 層屬 AF-8/AF-10，不可移）。Owner 裁決 (b)+(c)：擴大狀態層（isStalled/isRetryStorm/checkStopConditions/printSummary 併入 loop-state.js，loop.js re-export 保測試不變）+ 新 `scripts/lib/loop-session.js`（extractCost/spawnSession/spawnSessionAsync）。最終門檻 **≤467**（實測 467）。下游影響：AF-5 的 stall 語意修改面在 loop-state.js；AF-10 的 spawn timeout/env 修改面在 loop-session.js。

#### AF-1：blessed invocation 公約文件（修訂版）
- **變更**：新 `docs/guide/cli-invocation.md`（或錨定擴充 README.md:226）：(1) blessed 形式 `node "${ARCFORGE_ROOT}/scripts/cli.js" <cmd>`；(2)【S1-1】**非 Claude 平台解析規則**：blessed fallback header `: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"` + 存在性檢查（鏡像 arc-coordinating 既有 fallback 模式）——一行、四平台皆有效；(3)【S7-3】SKILL_ROOT fallback header 的保留規則改為**屬性式**：「任何自帶 `scripts/` 目錄的 skill 均允許」（實測 9 個 skill 使用 `SKILL_ROOT:=`，含 arc-managing-sessions 等，原「僅 arc-coordinating、arc-finishing-epic 兩個」的列舉與樹不符）；(4) 唯一禁止形式 = 同指令 inline 賦值 `ARCFORGE_ROOT=... node "${ARCFORGE_ROOT}/..."`（POSIX 展開陷阱，附 verbatim 範例）；(5) 裸 `node scripts/cli.js` 僅限本地 checkout。本任務**不改任何 skill 檔**。
- **驗收**：文件含 blessed form、fallback 規則、屬性式 SKILL_ROOT 規則、inline 賦值禁例、local-checkout 限制各一處（grep 可查）；`npm run lint` 綠。
- **停止**：發現另一在途包已發布衝突公約 → 停並與 owner 調解；inject-skills 的 ARCFORGE_ROOT 匯出契約已變 → 停。
- **工作量**：hours。

#### AF-2：lifecycle-aware loop sentinel（修訂：worktree-aware）
- **變更**：`scripts/lib/sdd-decision-ledger.js:356-362` 重寫 `loopSentinelPresent(dir)`：(a)【S6-1】**先解析有效 root**——`dir` 含 `.arcforge-epic` marker 時，經 `readArcforgeMarker(dir).base_worktree`（marker.js:55 已匯出）解析到 base 再檢查 sentinel（loop sentinel 是 projectRoot 下未追蹤檔案，fresh worktree 永遠沒有；否則 AF-7 的 worktree session 內 RV-5 升級與 sdd-ratify-guard 全部失效）；(b) 解析 sentinel JSON：terminal status（任何 `!== 'running'`）或有 `finished_at` → false；`running` 或不可解析 → mtime 心跳（saveLoopState 每輪寫入）——新鮮 → true，超過 `LOOP_HEARTBEAT_STALE_MS`（提案 30 分鐘；改值需 owner 確認）→ false。**不得刪除/搬移 state 檔**（AF-5 resume 依賴）。`scripts/cli/ratify-command.js:162-169` 與 `hooks/sdd-ratify-guard/main.js` 的拒絕文字依最終語意重寫（具名可執行的復原步驟；「Stop the loop first」歸零）。
- **驗收**：`tests/scripts/loop-sentinel.test.js` 矩陣通過：terminal→allow、running+fresh→deny、running+stale→allow、unparseable+fresh→deny（保守）、**marker-worktree + base running sentinel → true、marker-worktree + base terminal → false、無 marker 目錄 → 今日行為**【S6-1】；`hooks/__tests__/sdd-ratify-guard.test.js` 新增 worktree-cwd deny 案例；tmp 專案手動驗證 terminal sentinel 下 ratify 通過 sentinel gate；`npm test` 綠。
- **停止**：既有消費者測試要求 existence-only 安全語意 → 停上報；staleness window 實質影響 ratify 安全（loop.js 出現暫停但存活、mtime 走鐘的模式）→ 停，window 值交 owner；任何「刪 sentinel 即修好」的路徑 → 停（與 AF-5 衝突）。
- **工作量**：days。

#### RV-1：Wave 0.2 keystone — PostToolUse 模型可見回饋 spike + 共用 helper（修訂 API）
- **變更**：(1) 中性 cwd（`/tmp/pthook-spike/`，依 dev-context 規則）spike：PostToolUse hook 分兩輪發出 `{"decision":"block","reason":"HOOK-CANARY-1: …XYZZY…"}` 與 `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"HOOK-CANARY-2: …PLUGH…"}}`，以 `claude -p` 對已安裝版驅動；【S6-3 spike 增補】**第三輪 canary：由 Task-tool subagent 執行 Write**，驗證通道也達 subagent implementer（S6 fan-out 腿）。(2) 確認後**一次**修正 `.claude/rules/hooks.md` Output Visibility 表。(3)【S6-3】helper API **拆分**：`buildPostToolUseFeedback(reason)` → 純欄位物件；`outputPostToolUseFeedback(reason, { systemMessage } = {})` → **單次** `output()` 合併鍵（outputCombined 已驗證之單 JSON 模式；兩行 JSON 從未被驗證）——否則 RV-3/RV-5/ICL-10 三個消費者都得繞過 helper 手組 JSON。加進 `scripts/lib/utils.js`（outputDecision 旁，~392 行）+ exports；JSDoc 記錄驗證版號與 spike 結果。(4) `hooks/__tests__/utils.test.js` 斷言輸出 JSON shape（含「stdout 恰好解析為一個 JSON 物件、同時含兩欄位」）。
- **驗收**：三份 spike transcript（XYZZY / PLUGH / subagent）+ `claude --version` 存入 PR；`node -e` 呼叫 helper 印出 spike 驗證的 shape；`npm run test:hooks` 綠；hooks.md 表僅本任務編輯。
- **停止**：兩機制皆不達模型 → **HALT**（UserPromptSubmit relay 變 blessed pattern 是三消費者的聯合再決策，不得單方退回 systemMessage）；機制有破壞性行為 → 停附 transcript；hooks.md 與他包已落地編輯衝突 → 協調。
- **工作量**：days。**阻擋**：RV-3、RV-5、ICL-10。

#### WT-1：status --json 發出絕對 worktree path（修訂：worktree-cwd pin）
- **變更**：`scripts/lib/coordinator-core.js` status()（94-123 行）每個 epics[] 項目加 `path: epic.worktree ? this._resolveWorktreePath(epic.worktree) : null`（嚴格加法，`worktree` 欄不動）。`docs/guide/worktree-workflow.md`：44 行陳舊主張、169 行 `| .worktree`→`| .path`、情境 3 與 caution #5 一致化。Jest：expanded→path 絕對且 `parseWorktreePath()` 非 null；未 expand→null；multi-spec 聚合分支亦帶 path；【S2-1】**新增 pin 測試：從 worktree cwd 跑 status --json，epic 的 path 為 null**（worktree 本地 dag 副本 `worktree:null`）——固定「不得指示從 worktree 內讀 .path」的事實，供 WT-4 文字依據。
- **驗收**：Jest 全過；fixture 手動 `jq -r '.epics[0].path'` 可 `cd`；`grep -n '| .worktree' docs/guide/worktree-workflow.md` 空；`npm test` + lint 綠。
- **停止**：不得改名/移除 `worktree` 欄——任何消費者需要改名才能動 → 停上報；legacy 相對值解析到 getWorktreeRoot() 之外 → 照解析輸出但停下回報，**絕不**默改推導。
- **工作量**：hours。

---

### Wave 1 — 引擎與獨立修復

#### WT-2：通用 worktree 引擎（依賴 CORE-1）
- **變更**：新 `scripts/lib/worktree-generic.js`（~180 行、零外部依賴、lib 層 throw-with-context）：`addGenericWorktree/listWorktrees/removeGenericWorktree/runWorktreeCommand`。實作要點：`execFileSync('git',[...])` 陣列參數；slug 經 `sanitizeProjectName`；path = `getWorktreePath(projectRoot, null, slug)`；判別 = `parseWorktreePath × hasArcforgeMarker`，**無新 marker**；add：branch 預設 `<name>`、既有 branch 直接 checkout、缺者由 `--from`（預設 base HEAD）建立、`--setup` 重用 `getDefaultInstallCommand`；list：`git worktree list --porcelain` 列舉 + `kind: base|epic|generic|external` 標註（marker 存在時附 epic/spec_id）；remove：marker worktree 拒絕並導向 `arcforge cleanup`、dirty 無 `--force` 拒絕、移除後 prune。cli.js 薄 case（~10-12 行）+ help。新 `tests/scripts/worktree-generic.test.js`：temp repo + `process.env.HOME` 覆寫隔離（auto-diary.test.js:16-24 模式），覆蓋 add 往返、四種 kind 標註、兩種 remove 拒絕、--force、prune。【S2-3 選配引擎強化】給 `cleanupWorktrees` 補上與 `mergeEpics` 相同的 base 委派（coordinator-worktree-ops.js:175-185 模式），附 worktree-cwd Jest 案例——讓 CLI 即使在未來 skill 文字回歸時也誠實。
- **驗收**：fresh temp repo `worktree add t1` exit 0、JSON path 在 getWorktreeRoot() 下且往返 parseWorktreePath、branch 已 checkout；四 kind fixture 標註正確；epic-marker remove exit 1 含 `arcforge cleanup`；dirty 無 --force exit 1；`wc -l scripts/cli.js` ≤ 700（CORE-1 後實際應 ≤ 630）；S2 回歸：全部既有 coordinator 套件不動而過；`npm test` + lint 綠。
- **停止**：null-spec 推導與真實 pre-v2 legacy worktree 碰撞 → 停（絕不默改 hash 輸入）；需要非 stdlib 依賴 → 停；HOME 覆寫不穩而想改 parseWorktreePath 簽名（超出 additive optional homeDir）→ 停（契約與 G4 共用）。
- **工作量**：days。

#### SDD-1：arc-refining Phase 6b 傳入第 4 參數 ledger
- **變更**：`skills/arc-refining/SKILL.md` ~386-411 行：require 解構加入 `parseDecisionLedger`，以 `parseDecisionLedger('specs/<spec-id>/decisions.yml')` 作第 4 參數呼叫 `mechanicalAuthorizationCheck`（引擎簽名 sdd-validators.js:279 已查證；null 在無 ledger 時正確）。Quality Checklist ~436 行補列 ratified ledger values 為第三 trace 來源。
- **驗收**：RED→GREEN fixture（accepted+ratified D-001 + `<trace>D-001:600s</trace>`）：新 recipe exit 0 / valid===true；舊 3 參數形式產生 `No decision ledger provided`（證明 bug 與 fix）；`npm run test:scripts` 過；grep 確認 recipe 含 parseDecisionLedger；eval 延後到 SDD-8。
- **停止**：第 4 參數不收 parseDecisionLedger 回傳形狀 → 停（不得 inline 重新解析 YAML）；SDD-6 已先落地替換 recipe → 跳過本任務、驗證 CLI 有傳 ledger、回報。
- **工作量**：hours。

#### SDD-2：brainstorming/refiner 邊界提交 ledger + decision-log
- **變更**：`skills/arc-brainstorming/SKILL.md` ~254-259 行 commit block 擴為整個 dated plans dir + `specs/<spec-id>/decisions.yml`（容忍式措辭）。`skills/arc-refining/SKILL.md` ATTENDED 路徑（~275-282）在 step 1 之後、stop-for-ratification 之前插入 decisions.yml 的 commit 指示。
- **驗收**：兩處 grep 可查；`npm run test:skills` 過（pytest 若 pin 舊 block 同步更新）；eval 延後 SDD-8。
- **停止**：pytest 因無關原因失敗 → 停（不鬆動斷言）；同節有他包在途編輯 → 協調。
- **工作量**：hours。

#### SDD-3：sdd-ledger-guard on-disk baseline fallback（關 S8 洞）
- **變更**：`hooks/sdd-ledger-guard/main.js` evaluate()（~250 行）：HEAD 內容為 null 且檔案存在可讀時，以**編輯前 on-disk 內容**為 baseline 傳入 `decideLedgerEdit`；HEAD 可用時優先序不變（binding remedy）。on-disk 讀取在 evaluate() 內一次完成（try/catch→null→fail-open），純決策核心與其直呼測試不動。全新檔案維持 previous=null 語意。更新 header COVERAGE BOUNDARY 註解（18-25 行）與 README。
- **驗收**：六個具名測試案例（untracked flip→DENY、frozen text→DENY、append proposed→ALLOW、新檔 proposed-only Write→ALLOW、HEAD-tracked 用 HEAD、fs error→ALLOW fail-open）全過；stdin fixture deny 驗證；全部既有測試不改而過。
- **停止**：發現合法 shipped 流程會 in-place 重寫未提交 proposed 條目而被拒 → 停上報政策問題（不削 detectForgeAttempt、不開暗門）；fail-open 需要 utils 表達不了的檔案狀態區分 → 停提案 helper；任何既有測試把違例 ALLOW 當設計意圖 → 停（設計衝突）。
- **工作量**：days。

#### AF-4：buildTaskPrompt 真實 spec 路徑 + 偵測測試指令（依賴 CORE-2；修訂）
- **變更**：loop.js buildTaskPrompt：(1) 硬編 `npm test`/`npm run lint` 改 `getDefaultTestCommand(projectRoot)` + `hasScript('lint')` 條件行；(2) 刪 `${projectRoot}/epics` 探測，改發任務真實 spec 來源（epic.spec_path + `specs/<spec-id>/epics/<epic-id>/`，feature 經 taskContext 解析父 epic）；legacy dag 無 spec_path → 優雅省略。(3)【S4-2】**定義 spec_path 解析規則**：先對 `specs/<spec-id>/` 解析、再對 projectRoot；**以 spawn cwd 相對形式**寫入 prompt；新增驗收：sdd-v2 fixture（spec-dir-relative `epics/epic-parser/epic.md` 慣例）發出的路徑**從 spawn cwd 存在**——目前三種磁碟慣例（fixture 相對 spec dir、arc-planning 相對 project root、dag-schema 範例 docs/specs/）原樣輸出會從任何 root 都解析不到。
- **驗收**：loop.test.js 新案例（spec_path 在 prompt 且可從 spawn cwd resolve、pyproject→pytest 行、legacy 省略）過；`grep "projectRoot, 'epics'"`、`grep 'npm test'` scripts/loop.js 皆空；`npm test` 綠。
- **停止**：production dag 真缺 spec_path → 停（migration 是設計決策）；getDefaultTestCommand 對 loop 必須支援的專案型別 throw → catch 並省略驗證區塊，如掩蓋真需求則上報。
- **工作量**：hours。

#### AF-10：--task-timeout + permission pass-through + spawn env 衛生（依賴 CORE-2；修訂）
- **變更**：(1) `--task-timeout <seconds>` 取代兩處硬編 600000ms；(2) `--permission-mode` / `--allowed-tools` pass-through，抽 `buildClaudeArgs(options)` 可單測；**任何 code path 不得自動附加 --dangerously-skip-permissions**；(3) permission stall 錯誤附 AF-13 headless 文件指引。(4)【S3-3】【S4-7】**spawn env 衛生**：spawnSession/spawnSessionAsync（及 AF-9 verifier spawn）一律 `env: {...process.env, ARCFORGE_MODE: ''}`——否則 `.arcforge-attended` marker 或 shell export 會把無人值守的 loop session 標成 attended（refiner 在沒人值守的 session 內 draft-then-stop）；(5)【S7-1】同一 env builder 設 `ARCFORGE_SPAWNED` 標記，使 loop 衍生 session 不消費 pending-action relay（ICL-8 的 inject-context guard 讀此標記）。
- **驗收**：parseLoopArgs/buildClaudeArgs 單測過；`grep '600000' scripts/loop.js` 僅剩具名常數；`grep 'dangerously'` 無自動注入路徑；spawn-env stub 測試斷言子環境 `ARCFORGE_MODE !== 'attended'` 且含 `ARCFORGE_SPAWNED`；live smoke `claude -p --permission-mode default` 不報 unknown option；`npm test` 綠。
- **停止**：已安裝 CLI 拒絕該 flags → 停附 help 輸出（不猜名、不用 bypass 替代）；timeout 語意造成孤兒 claude 程序 → 停上報。
- **工作量**：days。

#### RV-2：quality-check 加 Write matcher + console 掃描收斂
- **變更**：hooks/hooks.json PostToolUse 加 Write 註冊（鏡像 Edit matcher 語法）；quality-check/main.js:45 regex 改 `/\bconsole\.(log|debug|info)\s*\(/`（warn/error 為 repo 規定 CLI 錯誤層，不再誤報）+ header 註解；測試翻案（warn/error 不旗標、debug/info 旗標）+ e2e Write fixture。
- **驗收**：`npm run test:hooks` 綠；Write fixture（console.log）發 finding、僅 console.error 者無輸出；hooks.json JSON.parse 過且含兩個 matcher。
- **停止**：組合 matcher 在 `claude --plugin-dir .` live smoke 不觸發 Write → 停回報正確語法；checkConsoleLogs 有 main.js 以外消費者 → 列舉上報。
- **工作量**：hours。

#### RV-7：code-reviewer template 正典化
- **變更**：arc-requesting-review/SKILL.md:33 指向 skill-local template（agents/code-reviewer.md 保持 persona，已正式反證不得改為 placeholder template）；template:18 `{PLAN_REFERENCE}`→`{PLAN_OR_REQUIREMENTS}`；verify-only：arc-agent-driven 的 prompt 檔已用正名；pytest 新增 `{UPPER_SNAKE}` token 集合相等 seam test。
- **驗收**：`mgrep PLAN_REFERENCE` 全 repo 0 hit；pytest 含新測試（pre-fix tree 上 RED 已示範）；agents/code-reviewer.md 與 main byte-identical。
- **停止**：mgrep 揭露三檔之外的硬編面 → 查包所有權再動；set-equality 揭露 dispatch 期填不了的 placeholder → 設計問題上報。
- **工作量**：hours。**阻擋**：AF-12。

#### RV-8：dead-weight 清理批次
- **變更**：刪 `skills/arc-debugging/SKILL.md.backup`；`git mv` teammates 三個 test artifacts 與 parallel baseline-test.md → `evals/workspaces/`（三檔同移以保 green-test 相對引用）；arc-agent-driven 刪 planner/debugger/verifier 三列（agents/*.md 保留）與 199 行雜散 ✅。**明確排除**：arc-verifying 的 arc-syncing-spec 提及為 test-pinned，不清。
- **驗收**：`npm pack --dry-run` 無 backup/三 artifacts；`npm test` 全綠；Available Agents 表恰列 implementer/spec-reviewer/quality-reviewer；`grep -c '✅'` = 1。
- **停止**：任何 shipped 檔引用被刪/搬物 → 停列舉；pytest pin 被刪列 → 上報衝突；想順手清 Never list/Advantages → 超界，停在兩處具名編輯。
- **工作量**：hours。**注意**：WT-6 依賴本任務先行（搬走含 `arc-finishing-epic` 字樣的 in-skills artifacts，否則 WT-6 的 zero-references grep 失敗）【S2-5】。

#### ICL-1：dead-weight 移除（修訂：README tree）
- **變更**：照原任務刪 pre-compact markdown 半邊、`getCompactionLogPath`、session-tracker/summary.js（calculateDurationMinutes 內聯至 end.js）、session.md.template；更新測試與文件。【S7-2】**追加**：`hooks/README.md` 目錄樹 ~38-45 行刪去 `summary.js` 與 `session.md.template` 兩列（原驗收 grep 抓不到檔名列）。
- **驗收**：原四項 grep 全空 + **`grep -n 'session.md.template\|summary.js' hooks/README.md` 空**；fixture PreCompact 只增 compactions[]、不產 .md/log；`npm run test:hooks` 綠。
- **停止**：發現查證集之外的讀者 → 停（刪除前提為零讀者）；移除 import 弄壞 formatTime/formatDate 的無關消費者 → 停列舉。
- **工作量**：hours。

#### ICL-2：刪 legacy learn.js + 四路由轉向 dashboard Evolve
- **變更/驗收/停止**：依原任務（刪 415 行 learn.js、四處路由改 `arcforge learn dashboard`、刪 pin 測試、修 arc-learning:96 警語）。驗收：`test -f` false、`npm test` 全綠、instinct.js evolve 印 dashboard 導向。停止：mgrep 發現非測試 caller、或 packaging globs 引用 → 停協調。
- **工作量**：hours。

#### SRH-1：coordinator reboot 真實 handover
- **變更/驗收/停止**：依原任務（project_goal 由 spec.xml parseSpecHeader 推導、current_task 經 nextTask、research_files 列舉；counts 不動以保 multi-spec 聚合）。驗收含 `grep 'Build a skill-based autonomous agent toolkit' scripts/lib/` 零 hit、fixture reboot JSON 驗證。停止：發現硬編字串消費者 / spec 缺 title 需產品決策 / 聚合 shape 要變 → 停。
- **工作量**：hours。

#### RV-6：freshness-aware eval-before-ship nudge
- **變更/驗收/停止**：依原任務（hook-local session state 記 SKILL.md 路徑、比對 evals/benchmarks/latest.json `generated`/mtime、三分支訊息、無檔案則 byte-identical 退化、malformed fallback、once-per-session 限流不破）。停止：需動 utils.js 共用 API → 協調；`generated` 語意被併行任務改 → 重新錨定。
- **工作量**：days。

---

### Wave 2 — 技能層與通道

#### WT-3：arc-using-worktrees SKILL.md 兩層重寫（依賴 WT-2；修訂 header）
- **變更**：依 §2 大綱重寫（~150 行、名稱保留、4 列偵測表、通用層 add/list/switch/remove + path-from-JSON、組合層單一委派小節、finishing 雙目標 handoff〔WT-6 後塌縮為一〕、5 紅旗、✅/⚠️ 格式）。【S1-1】invocation header 用 **AF-1 blessed fallback** `: "${ARCFORGE_ROOT:=$HOME/.agents/arcforge}"`（非裸 `:?` 中止形式——後者在三個非 Claude 平台會把第一個指令變成死路，再被紅旗 5 強制拒絕）。重寫 pytest 與 pressure fixture（CLI-failure 拒絕情境逐字保留）。
- **驗收**：pytest 綠；pressure scenario A 重跑 PASS 附 transcript；`grep 'SKILL_ROOT}/scripts/coordinator.js'`、`grep '\-b <epic-id>'` 皆空；組合層節僅一個 expand 指令 + JSON-path 規則（該節 grep 'merge'/'cleanup' 為零）；eval gate 排入 WT-8。
- **停止**：pressure 拒絕在 2 次 prompt 迭代後仍回歸 → 停交 owner（不削弱情境）；偵測表在 eval transcript 中歧義 → 停重設計訊號（不用 prose 補丁）；非 Claude 平台指南缺可用的 ARCFORGE_ROOT 解析 → 停（惟 AF-1 fallback 落地後此條件應已消除——若仍觸發代表 fallback 設計有誤，照停）。
- **工作量**：days。

#### WT-4：arc-finishing-epic 真實 branch 名 + 誠實刪 branch（依賴 WT-1；修訂 cd-to-base）
- **變更**：每個 `<epic-name>` git 運算元改為「current epic branch（`git branch --show-current`；引擎 branch 為 `<spec-id>/<epic-id>`）」。【S2-1】**Option 1 尾段重排——先遷移再破壞**：自 `.arcforge-epic` 擷取 epic branch + base_worktree → `finish-epic.js merge`（worktree cwd 無妨）→ **`cd "<base_worktree>"` 之後**才跑 `finish-epic.js cleanup`（cleanup 從 worktree cwd 是 silent no-op：dagPath 解析到 worktree 自己的 dag 副本，`worktree:null`，且 cleanupWorktrees 無 base 委派——已實測）→ Step 4.6 的 status --json 與 `git branch -d <spec-id>/<epic-id>` 都在 base cwd 執行（去掉 `git -C`，也避免在已刪目錄下執行指令）。Option 4 同樣 cd-to-base-first（cleanup + `branch -D`）。Options 2/3（worktree 保留）的 path 查詢經 marker 的 base_worktree 指向 **base** dag。與 WT-5 同檔編輯合批。更新 pytest 與 pressure fixture。
- **驗收**：grep `<epic-name>` 作 git 運算元為零；**fixture 以 cwd=worktree 逐字執行 skill 指令序列**（非從 base 呼叫 coordinator 方法——原 Jest 寫法會遮蔽 seam）斷言 removed:1 且 `-d` exit 0；Option 1 完成格式與實跑一致（刪了才說刪）；pytest 綠；pressure C 排入 WT-8。
- **停止**：`-d` 在真合併過的 fixture branch 失敗 → 停（不默轉 -D）；marker 缺 base_worktree → 停（引擎問題）。
- **工作量**：hours~1 day。

#### WT-5：conflict recovery 在 BASE checkout 中止（依賴 WT-4、CORE-1）
- **變更/驗收/停止**：依原任務（coordinator-worktree-ops.js 新 `abortMerge()` 經 `_findBaseWorktree`；cli.js merge case `--abort` flag；SKILL.md Step 4.1 改 `finish-epic.js merge --abort` + base 清潔檢查；Jest conflict fixture；arc-guard 兩個 allow-case 回歸測試 pin `git -C … merge --abort` 不被 GIT_MERGE_RE 匹配）。停止含：cli.js 超 700（CORE-1 後不應發生）、no-merge no-op 需要 porcelain 啟發式、GIT_MERGE_RE 竟匹配 -C 形式（→ 與 Wave 2.1 guard 包協調，絕不單方改 regex）。
- **工作量**：days。**阻擋**：AF-7（硬前置）。

#### AF-3：loop 啟動面 blessed 化（依賴 AF-1）
- **變更/驗收**：arc-looping 全部 repo-relative 呼叫（7 處）、loop-operator.md:46、arc-researching:107 改 blessed form（不留 loop.js 直呼，cli.js `loop` 為前門）。驗收：`grep 'node scripts/'` 三面為零；blessed form ≥6 處；pytest 綠；中性 cwd smoke（空目錄 no_dag 屬正確）。【S4-6】smoke 增補：驗證文件化的啟動指令**在父 shell 退出後存活**（與 AF-13 的 Launching overnight 小節配套）。
- **停止**：真實 plugin session 缺 ARCFORGE_ROOT → 停回報 ICL 包（不退回 repo-relative）；AF-1 公約未定 → 停。
- **工作量**：hours。

#### AF-5：loop resume 工效（依賴 AF-2、CORE-2）
- **變更/驗收/停止**：依原任務（state 持久化 pattern/max_runs/max_cost/run_id；recordError 戳 run_id；isStalled/isRetryStorm 只計本 run；`--reset` 歸檔至 `.arcforge-loop.archive/<started_at>.json`；loop-operator 預算分母 + 迭代餘裕檢查）。停止：run-scoping 改變既有測試**意圖** → 停（安全機制語意屬 owner）；歸檔時序與 AF-2 sentinel 衝突（活 loop 出現無 sentinel 窗口）→ 停調解。
- **工作量**：hours~1 day。

#### AF-6：arc-dispatching-teammates 批次（依賴 AF-1）
- **變更/驗收/停止**：依原任務（main/master 上先 `git switch -c dispatch/<spec-id>-<date>`〔條件式，尊重使用者明示 branch〕；新紅旗；line-97 紅旗只禁 inline 賦值；blessed form 替換含 references/ 兩檔；cap-5 預設 + 使用者明示覆寫）。**不**搬 test artifacts（RV-8 擁有）。停止：Wave 1.1 未落地時不即興 path 重建指示；dev-branch 步驟若被要求無條件化 → 上報 owner。
- **工作量**：hours。

#### RV-3：quality-check findings 對準模型（依賴 RV-1、RV-2）
- **變更/驗收/停止**：依原任務，惟輸出一律經 **RV-1 修訂後的合併式 helper**（單一 stdout JSON；驗收 pin「恰好一個 JSON 物件同含兩欄位」【S6-3】）：tsc errors + console findings 走模型通道，`Formatted:` 為唯一 systemMessage；README 重寫（除 stderr/passthrough 陳舊主張）；e2e 斷言改模型欄位。live smoke：`claude --plugin-dir .` 故意 type error → 模型下一回合自行修復（transcript 附 PR）。停止：RV-1 halt → blocked；模型通道誘發 re-edit 迴圈 → 停提案限流；單 JSON 多鍵未被處理 → 回報不擅切多次寫。
- **工作量**：days。

#### RV-5：arc-remind autopilot 升級（依賴 RV-1、AF-2）
- **變更/驗收**：依原任務（PR-boundary 與 eval nudge 在 `loopSentinelPresent(cwd)` 為 true 時**加發**模型通道；attended 不變；README Audience 節更新）。測試三組：有 sentinel cwd → 雙欄位；無 → 僅 systemMessage；【S6-1】**新增 cwd = marker worktree、base 有 running sentinel → 雙欄位**（AF-2 的 worktree-aware 解析使然）。live A/B transcript 附 PR。
- **停止**：RV-1 halt → blocked；AF-2 未落地且 attended smoke 出現 stale-sentinel 誤升級 → 不在 arc-remind 內重作 lifecycle 解析，協調 AF-2；A/B 顯示 attended 模式被誘發儀式性跑測試 → 停回報。
- **工作量**：days。

#### ICL-3：instinct keyspace 統一（依賴 ICL-2；修訂）
- **變更**：依原任務統一到 name-keyed `getInstinctsDir()`，惟【S5-2】**project name 來源改為 `candidate.scope.project`**（proposal-ingestor.js:117-121 自 batch manifest 設定，值即捕捉時的 getProjectName() slug——與注入端 key 恆等），僅在 scope.project 缺席時 fallback getProjectName()——dashboard 是 HOME-global、無 project 過濾，用 launcher cwd 名會把別專案的 candidate 歸錯目錄，注入端永遠找不到。一次性 lazy migration（hash dir → name dir、collision skip、冪等）自 start.js main() 呼叫。ActivationRecords **不重寫**（append-only），下游以 `<candidate_id>.md` basename 解析。【S5-6】**關閉首 session 視窗**：start.js 是 async 且不在 source=compact 跑，injection 在 inject-context 同步執行——於 inject-context 的解析路徑在 basename miss 時 lazy 呼叫一次冪等 migration（便宜呼叫），或在驗收中明文記錄並測試一-session 注入延遲（擇一，建議前者）。
- **驗收**：learning-curator-activate.test.js 過（activation 落 name dir）；temp HOME 整合檢查（activate→name dir；deactivate→.disabled/）；migration 檢查（搬移、collision skip、二跑 no-op）；decay 觸及搬移後 fixture；**跨專案 fixture：dashboard 自他 cwd activate，檔案落在 scope.project 對應 dir**。
- **停止**：呼叫路徑解析不出 project name → 停（不發明 hash→name 映射檔）；**cwd 名 ≠ candidate scope.project 的不一致** → 停（停止條件由「解析不到」擴為「解析到錯的」【S5-2】）；hash 佈局有 activate.js/dashboard 之外依賴 → 停列舉。
- **工作量**：days。

#### SDD-6：sdd-gate CLI 抬升（依賴 SDD-1、CORE-1；修訂 scope）
- **變更**：依原任務（新 `scripts/cli/sdd-gate-command.js`；stages：dag/design/context/header/authorize/conflict；穩定 JSON + exit 0/1/2；draft 走 stdin（heredoc 保 zero-filesystem-state-on-block）+ `--draft` fallback；authorize 失敗時 deterministic 寫 `_pending-conflict.md`；六個 inline node -e recipe 換成一行 blessed 呼叫；消除 `_draft_spec.xml` 磁碟讀矛盾）。【S3-2】**header stage 契約擴充**（或加 sibling `scope` stage）：穩定 JSON 必須帶出解析後 header——`spec_id`、`spec_version`、`latest_delta {version, iteration, added[], modified[], removed[], renamed[]}`——並重寫 arc-planning Phase 1 從該 JSON 讀 sprint scope；否則「`grep -c 'node -e'` 歸零」驗收與 planner 的 delta 擷取需求**互斥**（原 inline recipe 一身兼二職）。
- **驗收**：各 stage CLI fixture 檢查（含 unauthorized→exit 1 + marker axis_fired:'3'；ratified→exit 0 無 marker）；**sdd-v2 fixture 的 delta refs 出現在 gate JSON 輸出**【S3-2】；`npm run test:node` 含新測試檔綠；arc-refining/arc-planning 的 node -e 歸零（任何殘留須為 PR 中具名的單一例外）；`_draft_spec` 無磁碟讀指示；eval 延後 SDD-8。
- **停止**：cli.js 超 700（CORE-1 後不應發生，發生即停）；Wave 0.1 公約未定 → 停 SKILL.md 編輯；stdin draft 與模型實際多檔輸出不相容（details/*.xml 同樣要 gate）→ 停浮出介面問題（不發明 tar 式協議）；R3 marker 寫入權責在 CLI 與 refiner prose 間出現雙寫/矛盾 → 停先收斂於一處。
- **工作量**：week+。

#### SDD-7：decision-log 發射 branch-agnostic 化（依賴 SDD-2）
- **變更/驗收/停止**：依原任務（fr-bs-009 節抬升為共用節；spec-id 末定時序：穩定 q_id 緩衝、確認後立即寫入、續行增量寫；repo 自身 spec 已 branch-agnostic 故無 spec 變更）。停止：fr-bs-009 AC 竟為 iterate-scoped → 停（spec 先迭代）；時序解法需發明新 artifact → 停提選項。
- **工作量**：days。

#### SRH-2：CLI 輸出形狀 manifest + 契約測試（依賴 SRH-1）
- **變更/驗收/停止**：依原任務（`scripts/lib/cli-manifest.js` 凍結各子指令 flags + --json shape；contract test 雙向比對 case 標籤與 live 輸出；不穩定指令 output:null）。停止：輸出環境相依無法 pin → output:null 並回報（不默改成 subset 比對）；pin 形狀需要改 cli.js 輸出 → 停（屬能力包）。
- **工作量**：days。

---

### Wave 3 — 組合層

#### ICL-4：loadAutoInstincts 接線 + ActiveInstinctFile 內容契約（依賴 ICL-3；修訂——含 materialize/activate 轉換）
- **變更**：依原任務（lifecycle-filtered 注入：fold ActivationRecords by candidate_id、latest wins；basename 解析於統一 dir；confidence 只排序 cap-5 不作 gate；`inject_activated_instincts` kill-switch **預設 ON**；layer-8 文件作為 reviewed slice 2 修訂）。【S5-1】**前置內容契約（本任務內或拆 ICL-3.5 先行）**：activate()（scripts/lib/learning-curator/activate.js:288-298,362）由 verbatim copy 改為 draft→active **轉換**——剝除 `<!-- INACTIVE DRAFT … -->` banner、發出 YAML `---` frontmatter（id、**confidence 初值**〔0.5 或 evidence_quality 映射〕、source: curator、domain、trigger），否則 materialize.js 的 JSON code-block header（無 frontmatter、無 confidence）會被 `loadInstinctFiles` 的 `frontmatter.confidence === undefined` 過濾，**每一個真實 dashboard-activated instinct 都注入不了**，同時打斷 ICL-6 feedback counts、instinct.js 可見性、decay。record schema 已分存 source_draft_content_hash / active_content_hash，轉換 audit-compatible。
- **驗收**：六個 fixture 案例（activated 注入 / deactivated 不注入 / 同 dir 非 activated 高信心不注入 / kill-switch / cap 5 按 confidence / zero-state 無學習輸出）；端到端 fixture（SessionStart stdout 含 'Active Behavioral Instincts'；config false 時消失）；7 個 activated → 恰 5 行；**契約測試：真實 materialize()→activate()→loadInstinctFiles() 鏈，instinct 載入且 confidence 為數值、instinct.js status 列出它**【S5-1】（嚴禁手寫 YAML fixture 偽證）；layer-8 diff 審閱、deferred decision 3 標記 resolved；test:scripts + test:hooks 綠。
- **停止**：review 否決 default-on → 停浮出 binding 決議（不默改 opt-in）；ActivationRecords 無法以 basename 解析（命名漂移）→ 停（不放寬為 confidence-based）；SessionStart 延遲顯著（>100ms 大 fixture）→ 帶數據與 index 提案回報。
- **工作量**：days。

#### ICL-8：diary-capture.js 抽取（依賴 ICL-1；修訂——三項）
- **變更**：依原任務（counter-ownership 契約：user-count 唯 user-message-counter 寫、tool-count 唯 compact-suggester 經新 `incrementSharedToolCount()` 增、讀+重置唯 diary-capture；`readCounts()`/`runDiaryCapture()` API；enricher 對 Stop 與 PreCompact **雙路徑 ON**；pre-compact README 重寫）。三項修補：(1)【S5-4】pre-compact/main.js 在任何 counter/state 存取前 `parseStdinJson` + `setSessionIdFromInput`（一行；去除未文件化的 CLAUDE_SESSION_ID env 依賴——現行測試以 env 注入遮蔽分歧），並由 diary-capture 匯出**唯一** suggester state 檔路徑 helper 供 ICL-9 的 compaction reset 使用，禁止重推檔名；(2)【S5-5】把 inject-context 的 `draftIsStale` 'TO BE ENRICHED' 2KB 探針移至共用位置，batch-assembler 的 diary `readRecentEvidence` **跳過**命中之 stub（enricher 失敗退化為缺證據而非模板證據）；(3)【S7-1】spawnDiaryEnricher 對子程序設 `env: {...process.env, ARCFORGE_SPAWNED:'enricher'}`，且 inject-context loadPendingActions 在 `process.env.ARCFORGE_SPAWNED` 存在時**不消費直接跳過**（鏡像 observe hook 的 eval 隔離先例）——否則 enricher/loop session 的 SessionStart 會在使用者下個 session 之前吃光 diary-ready / reflect-ready / ratify-pending。
- **驗收**：diary-capture.test.js 過（threshold gating、reset-on-trigger-only、雙路徑 enricher spawn——PATH stub claude）；PreCompact fixture：draft 生成 + enricher stub 被呼叫 + diary-ready 排隊 + counter 重置；Stop 低於閾值無動作；pipeline 唯一實作（無殘留複本）；binding 契約測試（incrementSharedToolCount×50 → readCounts 50 → shouldTrigger）；**stdin-only session_id 子程序測試（CLAUDE_SESSION_ID 明確 unset）reset 命中 suggester 實寫之檔**；**batch-assembler 種一 enriched + 一 stub，僅 enriched 被攝取**；**種 pending action + ARCFORGE_SPAWNED=1 跑 inject-context → pending-actions.json 不變；無標記 → 被消費**。
- **停止**：PreCompact context 下 enricher 不可行（claude CLI re-entrancy 實測）→ 停帶替代方案上報（宣告 draft 為 arc-journaling 交接 + assembler 排除 '-draft.md'），不再默默 no-enricher；契約需動 user-message-counter 寫入路徑 → 停。
- **工作量**：days。

#### AF-7：runDag worktree 隔離 + 併發上限（依賴 AF-4、AF-5、AF-6、AF-10、WT-5、CORE-2；修訂——四項）
- **變更**：依原任務（per-epic expandWorktrees、spawn cwd=worktree、`--max-parallel` 預設 5、session 成功後 completeTask+mergeEpics+cleanup〔失敗者保留〕、衝突→WT-5 base abort+blockTask 續輪、main/master 警示）。四項修補：(1)【S4-1】**移除 `parallelEpics.length > 1` 條件**——1..N ready epics 的每一輪都走隔離路徑（chain DAG 與 diamond join 輪今日全部漏接，session 裸跑 base、無 marker、無 guard、無 merge-back）；**定義 IN_PROGRESS resume 語意**：對已有 worktree 的 feature-less IN_PROGRESS epic 經 `_resolveWorktreePath` 重導 respawn（parallelTasks 只回 PENDING，中斷的隔夜 run 否則隱形、晨間重啟誤報 All tasks complete!）；(2)【S4-3】【S6-2】expand 帶 **`projectSetup: true`**（或 `--project-setup` loop flag，dag 模式預設 ON、`--no-project-setup` 可退）——fresh worktree 無 node_modules 時 AF-8 的 `--verify-cmd "npm test"` 對每個 epic 必败、quality-check tsc 腿靜默空轉；(3)【S4-2】dag 模式把 worktree path 傳入 buildTaskPrompt，`## Project Root:` 指 session 實際工作區（否則 headless session 被告知 root 是 base，可能直接編輯 base、繞過隔離與 merge-back）；(4)【S7-1】spawn 經 AF-10 的 env helper（ARCFORGE_SPAWNED + ARCFORGE_MODE 淨空）。
- **驗收**：loop-rundag.test.js：stub claude 記錄 cwd 全在 canonical worktree root（永不 projectRoot）；7 ready cap 5 → 批 5+2；--max-parallel 2 生效；**chain-DAG fixture（每輪一 ready epic）逐輪 worktree cwd + merge commits**；**中斷-run fixture resume IN_PROGRESS epic 而非 All complete**；merge-back：base log 含 integrate commits、status 顯示 completed；conflict：blocked + base porcelain 乾淨；**各 worktree 安裝指令有跑（stub getDefaultInstallCommand 或 _runSubprocess seam 斷言）**；loop.test.js（sequential 契約）不動而過；`npm test` 綠。
- **停止**：WT-5 base-abort 未落地 → **HALT merge-back 部分**（隔夜把 base 卡在 mid-conflict 比不出貨更糟）；EXPAND_LOCK_TIMEOUT 病態爭用 → 停回報（不加長 timeout、不繞 locking）；G3 與 worktree 內 session 互動不良 → 截取 deny 停下與 guard 包協調；安裝失敗的處置如不應整輪中止 → 記為該 epic 的 blockTask reason 而非 loop 級 throw。
- **工作量**：week+。

#### SDD-5：pending-ratification 通知（依賴 AF-2、ICL-8、CORE-2；修訂——三項）
- **變更**：依原任務（finalizeLoop 掃 specs/*/decisions.yml 計 proposed、addPendingAction('ratify-pending')、去重；inject-context 專屬分支渲染）。三項修補：(1)【S3-1】【S4-5】**訊息文字用可解析形式**：模型可見行 `ARCFORGE_MODE=attended node "$ARCFORGE_ROOT/scripts/cli.js" ratify <spec-id> <D-id>`、文件指向 `${ARCFORGE_ROOT}/docs/guide/sdd-pipeline.md`——裸 `arcforge` bin 只在 npm install 存在（包未上 npm；marketplace 安裝是 git clone 無 PATH bin），專案相對 doc 路徑在使用者專案不存在；(2)【S4-5】finalizeLoop 同時排 **'loop-finished'** action `{status, completed_count, blocked:[{id,reason}], base_branch, total_cost}` + inject-context 專屬渲染（「Loop finished: N merged on <branch>, M blocked — review before ratifying」）——隔夜 loop 的成果目前只活在沒人看的 stdout，晨間 review queue 是北極星的核心面；(3)【S3-4】【S7-1】明確 dependsOn AF-2（否則晨間通知指示一條被 sentinel 確定性拒絕的指令——existence-only 語意下 finalize 後檔案仍在）與 ICL-8 relay guard（否則最後一個 task session 的 detached enricher 吃掉通知）。
- **驗收**：Jest：2 proposed + 1 accepted → 一筆 ratify-pending payload.count=2、二跑無重複；0 proposed → 不排；SessionStart fixture stdout 同時含 ratify 計數行**與 loop-outcome 行**；**terminal-status sentinel 在盤、通知指名的 ratify 指令通過 sentinel gate（端到端斷言）**；**ratify-pending 在 ARCFORGE_SPAWNED=1 的 SessionStart 存活、僅被無標記 SessionStart 消費**；test:scripts + test:hooks 綠。
- **停止**：pending-actions 無法依既有模式測試隔離 → 停（不寫真 ~/.arcforge）；Wave 3.2 對 inject-context 有在途衝突重構 → 排序協調；specs 掃描需多層遞迴/歧義 marker → 停在 canonical glob。
- **工作量**：hours~1 day。

#### WT-6：finishing 雙胞胎合併為 `arc-finishing` + arc-using 單一批次（依賴 WT-1..5、RV-8；修訂——四項，**吸收 SRH-6**）
- **變更**：依原任務（存活 `skills/arc-finishing/SKILL.md`、epic 超集 body + Step 0 marker 判別、共用區塊唯一、finish-epic.js shim 搬遷、刪 `skills/arc-finishing-epic/`、arc-guard deny 訊息更新、pytest 合檔、pressure fixture 轉靶）。四項修補：(1)【S1-2】**非 epic 路徑改寫為 base-checkout 執行**（epic 路徑在 WT-5 得到的同等待遇）：Option 1 → 經 `arcforge worktree list --json` 的 kind:base（或 porcelain 首項）定位 base，`git -C <base> pull && git -C <base> merge <branch>`（或先 cd base）——實測 git 2.52 從 linked worktree `git checkout <base-branch>` exit 128；Option 4 → branch 刪除只在 `arcforge worktree remove` **之後**、於 base checkout 執行；Step 5 順序規則：**先離開 worktree（cd base）再 remove**（移除自身 cwd 會 strand persistent shell）；新紅旗：「絕不在 linked worktree 內 `git checkout <base-branch>`」。驗收追加：**fixture 從 generic worktree 內逐字執行非 epic Option 1 全程 exit 0**。(2)【S2-3】【S6-4】inbound migration 清單**補列四檔**：`skills/arc-looping/SKILL.md:179`、`skills/arc-verifying/SKILL.md:168`、`skills/arc-receiving-review/SKILL.md:76`、`skills/arc-requesting-review/SKILL.md:75`（已 grep 證實四檔今日皆含該名），各塌縮為單一目標「arc-finishing（Step 0 依 .arcforge-epic 判別）」；arc-requesting-review 的編輯與 RV-7/RV-9 協調（同檔兩包）；這四個一行轉靶的 behavioral/exempt 裁定記入 WT-8。(3)【S2-5】排序：**RV-8 先行**（teammates green/phase4-test.md 含該名、在 skills/ 下，否則 zero-references grep 失敗），或在驗收 carve-out 中具名該批檔案。(4)【S1-3】【S2-2】【S6-5】**吸收 SRH-6**：arc-using 的單一批次編輯同時承載——Worktree Rule（43-54 行）scope 到 marker-bearing worktrees、epic→arc-coordinating expand、generic→arc-using-worktrees、re-entry 讀 status --json `.path`（WT-1 後為真）、generic path 經 `worktree list --json` 永不 status --json；chooser 表加 generic-worktree 列；finish 列指向 **arc-finishing**（SRH-6 原文指向 arc-finishing-epic 為前指令方向的殘留，作廢）；`tests/skills/test_skill_arc_using.py` 斷言新列（斷言字串為 'arc-finishing'）。
- **驗收**：`skills/arc-finishing-epic/` 不存在；shim 自 epic-worktree fixture 可跑；`grep -rn 'arc-finishing-epic' skills/ docs/ README.md hooks/` → 零 shipped 引用（tests/ 凍結 transcript 可留註記）；4-option/typed-discard/test-gate 各恰一次（grep 計數）；pytest 合檔綠 + test_skill_arc_using.py 綠；test:hooks 綠（guard 訊息斷言更新）；**非 epic Option 1 worktree-cwd fixture run 過**；arc-using routing eval 重跑**一次**（與 SRH-7 共用，排入 WT-8）；S1/S2 路由在 eval transcript 中正確。
- **停止**：merged-skill eval 顯示 epic 路徑回歸（模型在 marker worktree 內略過 coordinator merge）2 次迭代後仍在 → 停交 owner（fallback「保留 arc-finishing-epic 為 description-only pointer」是 owner 決策）；grep/eval 揭露 repo 外對 /arc-finishing-epic 名稱依賴（namespaced 呼叫、marketplace cache）→ 刪目錄前停；另一在途包有未提交 arc-using 編輯 → 停協調（單一 change set、單次 eval）。
- **工作量**：days。

#### WT-7：seam 遷移——hook 訊息、docs、README（依賴 WT-2、WT-3；修訂——平台 INSTALL）
- **變更**：依原任務（arc-remind worktreeAddNudge 雙導向訊息 + README + 測試；arc-guard 零碼變更 + markerless no-op 回歸測試；worktree-workflow.md 新「Generic (non-epic) worktrees」節〔null-spec 推導、kind 標註、sync/merge 不可見保證、finish handoff〕；README:155 與 skills-reference 描述更新）。【S1-1】**追加**：`.codex/INSTALL.md`、`.gemini/INSTALL.md`、`.opencode/INSTALL.md` 各加 ARCFORGE_ROOT 說明（標準 clone 位置 `~/.agents/arcforge` 即 AF-1 fallback 的依據）與 **Node 前置需求**（現行指南只列 Git）。
- **驗收**：test:hooks 綠（nudge 雙導向、CLI 形式不觸發、markerless generic no-deny）；`grep 'Fine for a non-epic worktree' hooks/` 空；`grep 'coordinator.js" expand' docs/ README.md` 空；repo-wide：無 shipped 指示教人從 status --json 推 generic path；worktree-workflow.md generic 節與 **WT-2 實作後的真實 JSON 欄位名**一致（對碼不對 RFC）；**三平台 INSTALL.md 含 ARCFORGE_ROOT + Node 需求（grep 可查）**。
- **停止**：任何 hook 測試顯示 guard/remind 對 CLI-routed 操作開火 → 停（regex 變更屬 Wave 2.1 G4 包）；PostToolUse systemMessage 機制與實測矛盾 → 停回報（Wave 0.2 擁有驗證）。
- **工作量**：hours~1 day。

#### SRH-3：deterministic pipeline smoke（依賴 SRH-1、SRH-2、WT-1）
- **變更/驗收/停止**：依原任務（Jest 進 CI；mkdtemp repo + fake HOME；七道 seam 鏈斷言：header/dag-schema/expand path+marker+branch/status-manifest 吻合/worktree 內 complete/sync+merge+cleanup/reboot 真實 goal+task；隔離證明；seam 回歸證明〔暫時 revert SRH-1 → step 7 失敗〕）。停止：綠路徑引擎缺陷 → 停**歸檔給 worktrees 包**（不在此包補 coordinator）；WT-1 未落地 → 該單一斷言 pending/skip 附追蹤註記；CI 無法建 worktree → 停附 CI 錯誤（不 mock git）。
- **工作量**：days。

#### SRH-4：doc-reference linter（依賴 SRH-2；修訂——R4）
- **變更**：依原任務（doc-refs.js + check-doc-refs.js；R1 路徑、R2 CLI 呼叫對 manifest、R3 JSON 欄位承諾；`<!-- doc-ref-lint: ignore … reason -->` 逃生口、理由必填；fixtures 含兩個真實缺陷的回歸）。【S6-6】**新增 R4 驗證器**：shipped 面中反引號的 `arc-<name>` skill 引用必須解析到既存 `skills/<name>/` 目錄——dangling skill 名（S1/S2/S6 三度命中的缺陷類）目前無任何機制攔截；R4 於 WT-6 落地後轉 gating（之前 warn-only，避免追著在途改名跑）。
- **驗收**：doc-refs.test.js 綠（含 R4 fixtures：好/壞 skill 名）；pre-reconciliation tree exit 1 恰列已知違例無誤報；seeded-mutation 三類 + **R4 一類**（殘留 `arc-finishing-epic` 引用 → 違例）各觸發；lint 綠、零外部依賴。
- **停止**：R3 假陽性 >5 → R1+R2 gating、R3 降 warn-only 並上報設計；需要 >10 個 ignore → 抽取規則錯置，停重設計；R2 需要 manifest 沒有的 flag 資料 → 擴 manifest（含契約測試），絕不在 linter 內硬編第二份。
- **工作量**：days。

---

### Wave 4 — 進階能力

#### SDD-4：ARCFORGE_MODE 可達性——sdd-pipeline.md + attended opt-in（依賴 SDD-1、SDD-5；修訂——三項）
- **變更**：依原任務（指南 a–g 節；inject-skills 在 `.arcforge-attended` marker 存在時 append `export ARCFORGE_MODE=attended` 至 CLAUDE_ENV_FILE，既有兩契約 byte-for-byte 保留；arc-refining 加 cross-link）。三項修補：(1)【S3-1】(d) 節加「**plugin 安裝下解析 CLI**」步驟：session 內 `echo $ARCFORGE_ROOT`（或 `claude plugin list` 路徑檢視）→ 終端執行 `ARCFORGE_MODE=attended node "<該路徑>/scripts/cli.js" ratify <spec-id> <D-id>`；明文：確認為**人在終端**，模型不得 pipe 答案進 ratify（piped 分支為測試而生——閉 stdin 下空輸入靜默取消、pipe 'yes' 則擊穿反橡皮圖章設計）。驗收追加：**walkthrough 從非 arcforge checkout 的目錄、只靠指南的路徑解析步驟完成**。(2)【S3-3】【S4-7】(b) 節明文：**自治 loop 永遠以 unattended 跑**，marker/export 不適用於 loop-spawned sessions（AF-10 在 spawn env 強制淨空；本指南記錄該決策）；同步修正包級情境措辭——proposed 條目由 attended（loop 前）session 產生，晨間計數反映的是那些，而非 loop 端起草。(3)【S3-7】(a) 節 pipeline 鏈的「tasks」階段對映 planner 真實產出（dag.yaml + specs/<id>/epics/，交棒 arc-coordinating/arc-implementing）——不存在第四個 pipeline skill，不得發明無引擎 artifact 背書的階段。
- **驗收**：bash fixture：有 marker → env file 含兩個 export、無 marker → 僅 ARCFORGE_ROOT、stdout JSON 不變；`grep -rl 'ARCFORGE_MODE' docs/guide/` 回 sdd-pipeline.md；arc-refining cross-link 在；**非 checkout 目錄 fresh-user walkthrough 端到端成功（需 SDD-1）**；eval 延後 SDD-8。
- **停止**：Wave 0.3/AF-2 未落地 → (f) 節持留或出貨不含（絕不記錄 existence-only 語意）；owner 指定不同 opt-in 機制 → main.sh 變更前停；CLAUDE_PROJECT_DIR 在已安裝版 SessionStart 不可用 → 停回報（不在 bash 解析 stdin）；guard 包 2.1 未落地時邊界表**必須**寫 Bash 未圍欄——不可接受就升級排序問題，不得誇大。
- **工作量**：days。

#### AF-8：--verify-cmd deterministic 驗收地板（依賴 AF-7）
- **變更/驗收/停止**：依原任務（argv 陣列 exec 無 shell 插值；session exit 0 後、completeTask 前執行；dag 模式 cwd=epic worktree〔AF-7 的 projectSetup 修補使 fixture 環境真實〕；非零→任務失敗走 retry/block；flag 缺席行為逐 byte 同今日；逐次結果持久化進 state 餵 AF-9）。停止：verify-cmd 需要 shell 特性 → 停（security.md）owner 簽核；dag 模式被要求在 AF-7 前對共用 checkout 出貨 → 拒絕並上報（sequential 可獨立先行）。
- **工作量**：days。

#### AF-11：parallelFeatures 引擎查詢 + arc-dispatching-parallel 修復（依賴 AF-1、CORE-1）
- **變更/驗收/停止**：依原任務（coordinator-core 加 parallelFeatures；cli `parallel --features` JSON；skill 批次編輯：手解析/偽碼換真指令、非可執行字面修正、Step 4/5 委派 arcforge:verifier（spec-backed 加 spec-reviewer）、Key Distinction epic 列改指 arc-dispatching-teammates/arc-coordinating——**不再指 arc-using-worktrees**（owner 指令））。停止：readiness prose 用非 TaskStatus enum 狀態且真實 fixture 在用 → 停（schema 問題）；併行 feature completeTask 需要引擎級鎖 → 上報範圍。
- **工作量**：days。

#### ICL-5：save-record 接線（依賴 ICL-4）
- **變更/驗收/停止**：依原任務（arc-reflecting/arc-recalling 工作流步驟 + 指令表；recall.js help 補 save-record；`^reflect-`/`^recall-` 前綴 fail-fast 驗證保證 batch-assembler 模式匹配；round-trip 測試）。停止：assembler schema 與 writer 輸出不匹配 → 停（不鬆 pattern）；Wave 0.1 未落地 → 用既有 in-file 形式並標記 sweep。
- **工作量**：hours。

#### ICL-9：compact-suggester 大修（依賴 ICL-8；修訂）
- **變更**：依原任務（三私有 counter 併單一 JSON state 檔；pre-compact 每次 compaction 重置 suggester state；rolling-window 相位偵測；suggestions[] 記入 session JSON；README 誠實化）。【S5-4】重置一律經 **ICL-8 匯出的共用 state 檔路徑 helper**，並繼承 pre-compact 的 stdin session-id 修補——否則 reset 與 suggester 寫的是不同 key 的檔案，「compaction 後歸零」永遠不落地（現行測試以 CLAUDE_SESSION_ID env 注入遮蔽）。
- **驗收**：reset/window/diary-threshold 案例過；60 事件→50 建議→模擬 pre-compact→再 30 事件無 stale 建議；40R+20W→第二快照 writeHeavy；$TMPDIR 僅一個 state 檔 + 共用 tool-count；session JSON 有 suggestions[]；**binding 回歸：合併期間 diary threshold 始終可觸發**；test:hooks 綠。
- **停止**：diary-threshold 回歸測試任何時點失敗 → 停先修（隱性耦合即批判決議要防的事故）；併發 state 寫序列化假設破裂 → 停升級至 locking.js 問題。
- **工作量**：days。

#### ICL-11：Stop 通道閾值閘控（依賴 ICL-8）
- **變更/驗收/停止**：依原任務（'Session paused' 僅 triggered 分支發、低於閾值 stderr log）。停止：有 shipped doc/test 依賴每-Stop 訊息作 liveness → 回報。
- **工作量**：hours。

#### RV-4：quality-check tsc 成本上界（依賴 RV-3）
- **變更/驗收/停止**：依原任務（--incremental + tmpdir buildinfo、Unknown-option 退避重試、arg 構造測試、二跑計時證據、stub 拒絕 fallback 測試）。停止：incremental+noEmit 跨版不一致（stale buildinfo 掩錯）→ 停改走 project-size 啟發 opt-in 並聲明；需動 execCommand 共用簽名 → 協調。
- **工作量**：days。

#### SRH-5：CI 接線 + 歸零 reconcile（依賴 SRH-4、WT-1 docs、WT-3/WT-6 落地）
- **變更/驗收/停止**：依原任務（package.json `check:docs`、ci.yml 步驟、跨包不越界 reconcile、CONTRIBUTING 一節、annotation 預算 ≤3 各附理由、刻意壞 commit 證明 gate 真擋）。停止：歸零需要編輯在途包擁有的面 → 停排序其後；落地窗內 main 新增 findings → 重 reconcile 一次，再現即升級排序。
- **工作量**：hours。

---

### Wave 5 — 收尾能力

#### AF-9：verifier-agent + retry 協議（依賴 AF-8；修訂）
- **變更**：依原任務（`--verifier` 疊在 AF-8 之上；attempts schema；verifier prompt = agents/verifier.md body + epic 驗收準則 + verify-cmd 證據指令 + 組裝層的 'Final verdict: PASS|FAIL' 指示〔不改 agents/verifier.md〕；FAIL → 前置累積逐字 feedback 重 spawn ≤ --max-retries（預設 2）→ blockTask；成本入 total_cost）。【S4-8】**缺準則退化**：`specs/<spec-id>/epics/<epic-id>/` 缺席（repo 內兩個 spec 無 epics/；legacy dag 更早）→ 退至解析後 epic.spec_path 內容 + dag feature 名；**絕不以空準則 spawn verifier**（跳過 verifier 記 warning；AF-8 deterministic 地板仍把關）。
- **驗收**：FAIL→逐字 feedback retry→PASS→completeTask；FAIL 耗盡→blocked 附末次 verdict；attempts 持久化往返；verifier cwd=worktree、成本入帳；`--verifier` 缺席零額外 session；`git diff --stat agents/verifier.md` 空；**缺 epics/ fixture：verifier 跳過 + warning、verify-cmd 仍把關**；`npm test` 綠。
- **停止**：verdict 無法可靠解析（stub vs real 分歧）→ 停升級 verdict 協議設計（**不**退回 exit-code 推斷 PASS）；retry 成本越過 --max-cost 的優先序有歧義 → 停與 owner 確認（cost stop > retry）；reviewer 推 default-on → 上報 owner（違組合指令）。
- **工作量**：week+。

#### AF-12：templates/ 三件組跨平台 dispatch 面（依賴 AF-11、RV-7）
- **變更/驗收/停止**：依原任務（placeholder 集合對齊 RV-7 正名 {PLAN_OR_REQUIREMENTS}；剝除 Task/subagent_type 假設；arc-agent-driven 與 arc-dispatching-parallel 加跨平台段落；README 模板列更新；skill-local 複本非死碼、agents/ 不薄包——反證裁定）。停止：RV-7 未落地 → **HALT**（避免鑄第三命名）；RV-8 未落地 → 照落引用但標記殘留缺陷不在此修；review 否決 rewire → fallback 是刪三件組 + README 列（owner 決策），不得默默留孤兒。
- **工作量**：days。

#### AF-13：arc-looping 操作指南合併（依賴 AF-2、AF-3、AF-5、AF-7、AF-8、AF-9、AF-10、**WT-6**；修訂——兩項）
- **變更**：依原任務（After the Loop、Headless Permissions、Resume vs Reset、flag 階梯文件化、worktree/DAG 節更新、state schema 區塊）。兩項修補：(1)【S1-4】【S2-2】【S6-4】After-the-Loop 的 handoff 指標寫 **`arc-finishing`**（epic 路徑由 Step 0 自動選中），北極星情境文字同步改「arc-finishing close-out」——**新增對 WT-6 的依賴**，禁止落地一個指向已刪 skill 的新引用（SRH-4 R4 落地後 CI 會擋，但本任務不得倚賴 CI 當設計）；(2)【S4-6】新「**Launching overnight**」小節：背景啟動（run_in_background / nohup+disown）+ 被殺 loop 的後果鏈（sentinel 留 status:'running'；AF-2 心跳在 staleness window 後自清 ratify gate）+ 終端啟動配方（plugin 安裝者在 ARCFORGE_ROOT 缺席時如何找 plugin root）——dag loop 是 N×600s 的 wall-clock，文件化的前景啟動會在 Bash tool timeout 被殺。
- **驗收**：兩新節 grep 可查；引擎 flags 與 SKILL.md 清單雙向零差（對 `node scripts/loop.js --help` 交叉核對）；state 範例 JSON 可解析且鍵為 saveLoopState 實寫子集；troubleshooting 指名 .arcforge-loop.json 與 --reset；**grep 'arc-finishing-epic' 該檔為零**；pytest 綠。
- **停止**：所文件化的引擎任務落地語意與 task spec 不同 → 停先對 merged code 重驗（文件寫 spec 不寫 code 即 seam-drift 缺陷類重演）；SKILL.md 膨脹失去可掃性（>~300 行）→ flag 參考拆 references/。
- **工作量**：hours~1 day。

#### ICL-6：confirm/contradict 與 candidate lifecycle 對齊（依賴 ICL-5；修訂）
- **變更**：依原任務（contradiction-archive 觸發且匹配 activated candidate 時，經 `lifecycle.isLegalAction` 閘控 append deactivate 轉換事件；檔案留 archived/，不繞 activate.js 的 reviewer_ack 同意模型；dashboard card 加 feedback counts；batch-assembler 加有界 recent-feedback 摘要）。【S5-3】**candidate 查找改用 `queue-writer.readCurrentCandidates()`**（HOME-global 事件日誌、store lock 下事件重放）——原任務文字指的 `learning.js getCandidateQueuePath` project scope 回傳的是 **project-local legacy 檔**，照做會掃空檔、永不匹配、deactivate 事件永不寫（讀寫兩端分裂）。驗收追加斷言：匹配到的 candidate 帶 `lifecycle.status` 欄（證明讀的是 curator store 非 legacy 檔）。
- **驗收**：instinct/learning-dashboard/batch-assembler 套件過；activated fixture 反覆 contradict 至 archive → queue.jsonl 得 deactivate 事件、dashboard 顯示 deactivated；非 curator instinct → 無事件無 crash；card JSON feedback 與 frontmatter 一致；**lifecycle.status 斷言**。
- **停止**：legality 矩陣不許非 dashboard actor 的 activated→deactivate → 停升級 actor-model 問題（絕不繞 isLegalAction）；reviewer 要求物理搬檔進 .disabled/ → 停（Layer-8 同意語意變更）；queue 鎖與 instinct.js 程序模型死鎖 → 回報（不無鎖寫）。
- **工作量**：days。

#### ICL-7：學習面 doc/CLI 真相清掃（依賴 ICL-6）
- **變更/驗收/停止**：依原任務（描述 ICL-4 後的真實行為：activation-gated 注入、top-5、kill-switch；arc-observing/instinct.js/arc-learning/arc-reflecting 措辭收斂；session-tracker 與 user-message-counter README 重寫；thresholds.js 死引用；aliases/global-promotions 升入 userParts、刪 stderr 版）。**排序護欄為其第一停止條件：ICL-4 未 merge 即停**（清掃必須描述 shipped 行為非計畫行為）；行錨漂移者跳過註記，不修未審計 prose。
- **工作量**：hours。

#### ICL-10：model compaction-prep 通道（依賴 ICL-9、RV-1）
- **變更/驗收/停止**：依原任務（threshold 命中時雙通道：既有 systemMessage + 經 **RV-1 合併式 helper** 的模型可見一行；buildMessage 相位建議瘦身為 arc-compacting 指標；fallback 僅在 0.2 spike 正式失敗時啟用 UserPromptSubmit relay）。驗收 pin 單一 JSON 物件雙欄位【S6-3】；live `claude --plugin-dir .` 驗證。停止：spike 失敗/回歸 → 停記錄後才切 fallback（**絕不**默默用 systemMessage 送模型導向文字）；helper 未落地 → 停（canonical-source 規則）；不從本任務動 hooks.md。
- **工作量**：hours。

#### ICL-12：閾值資料驗證（依賴 ICL-9）
- **變更/驗收/停止**：依原任務（compaction-analysis.js 關聯 suggestions[] × compactions[]；常數只憑證據調、否則記 insufficient data；fixture 確定性測試）。停止：真實 compaction 事件 <~20 → 出工具不調參；調 MIN_TOOL_CALLS 影響 ICL-8/9 測試 → 停重跑 binding 回歸。
- **工作量**：hours。

---

### Wave 6 — Iron Law 驗證批次（各包一次、互相錯開）

#### WT-8：worktrees 包 eval 批次 + S1–S4 情境回歸（修訂）
- **變更**：依原任務（arc-using-worktrees pressure A + tier-detection eval；合併後 arc-finishing pressure C + epic/非epic 路由；**arc-using 路由 eval 套件與 SRH-7 合併為同一次執行**【S1-3】；S1–S4 腳本化證據）。【S1-1】S1 驗收**追加一輪 harness 不預先 export ARCFORGE_ROOT 的執行**，斷言文件化 fallback 自行解析（封死腳本化情境遮蔽 env 遞送缺口的可能）。
- **驗收**：全部批次 eval 無 INSUFFICIENT_DATA、對 latest.json 無回歸；S1（含無預設 env 輪）：add→work→4 選項 finish→remove→`git worktree list` 僅 base、零 arcforge 狀態、hooks 缺席可用；S2：expand→G2 deny→coordinator merge（含 conflict abort 路徑）→cleanup→**真實刪 branch**→dag 一致；S3：sync 只掃 epic、_findBaseWorktree 正確、零 guard/remind 誤報、list 雙 kind 標註；S4：新 session status --json `.path` cd 入、sync from-base 成功；`npm test` + lint 綠。
- **停止**：任一 eval 在 2 次 skill-text 調整後仍回歸 → 停附 benchmark delta，不出貨；任一 S1–S4 步驟需要 shipped 文字中不存在的即興 → 停（那是 seam——修文字或上報，絕不在 eval run 內糊弄）。
- **工作量**：hours~1 day。

#### SRH-7：路由 eval（**併入 WT-8 批次執行**）
- **變更/驗收/停止**：四個 arc-using 情境 k=5 重跑 + `eval report` 更新 latest.json，結果與 WT-6 同 PR（check-skill-eval-annotation 找得到證據）。非回歸判準：三個 1.0 基線維持 1.0；harness-isolation 落在先前 CI95（0.68–1.0）內且 pass_at_k true。停止：超噪音回歸 → 改 wording 一次重跑，二次失敗停附 transcripts；harness 跑不動 → 停整批（紅 eval 不出貨）；基線本身壞 → 回報 eval owner，本包不改 scenario。
- **工作量**：hours。

#### SDD-8：SDD 包 eval 批次
- **變更/驗收/停止**：依原任務（編輯落地**前**為 NO-RUNS 情境建 RED 基線；落地後各情境跑一次；對 latest.json 比對；RED/GREEN/REFACTOR 段落備 PR）。停止：可歸因回歸 → 停（不為 grader 改詞、不削斷言）；flaky → 走 arc-evaluating variance 協議；in-repo plugin 禁用規則 → `claude --plugin-dir .` 或 harness 隔離，皆不適用則上報。
- **工作量**：hours。

#### RV-9：review-gates 包 eval 批次
- **變更/驗收/停止**：依原任務（為 arc-requesting-review 撰最小情境 eval-arc-requesting-review-dispatch-fidelity，pre-fix RED / post-fix GREEN；arc-agent-driven 經 arc-evaluating 邊界明確裁定 behavioral/exempt 並記錄；coverage 計數更新）。停止：preflight BLOCK（0.8 天花板）一次重設計後仍 BLOCK → 改列 non-regression 層記錄裁定，不硬磨；eval infra 本身 BLOCKED → 回報缺口不默出貨；grader 歧義 → 升級判準不調 grader。
- **工作量**：days。

#### ICL-13：ICL 包 eval 批次
- **變更/驗收/停止**：依原任務（觸及 skill 對映情境；注入行為改變者**先**更新情境期望（檢查 eval-sessionstart-minimal-bootstrap、activated-skill-behavior 是否斷言「SessionStart 永不注入」舊真相）再重跑；`eval report` 刷新基準；中性 cwd + --plugin-dir 執行）。停止：情境失敗源於舊真相且修法歧義 → 停升級情境意圖；eval trial 隔離破損污染 live queue → 停全部 eval 並回報（本包 observe 改動是可能原因）。
- **工作量**：days。

#### AF-14：autonomy 包 eval 批次
- **變更/驗收/停止**：依原任務（arc-looping/teammates/parallel 需新撰情境——`eval list` 現無註冊，teammates 的 baseline/green-test.md 為素材；arc-agent-driven、arc-researching 確認門檻；重跑 eval-arc-coordinating-cli-no-manual-fallback；刷新 latest.json 使 RV-6 freshness gate 見到比 skill 編輯新的證據）。停止：preflight BLOCK → 重設計不降閾值；k=5 後 INSUFFICIENT_DATA → 停（不挑 trial）；eval 揭露包內編輯造成回歸 → 停止出貨、附 transcript、回owning task 修。
- **工作量**：days。

---

## 4. 七大情境走查表

| 情境 | 走查結果 | 斷裂 seam（摘要） | 吸收位置 |
|---|---|---|---|
| **S1** 非 arcforge repo 通用 worktree（四平台） | seams-found ×3 | ① 非 Claude 平台 ARCFORGE_ROOT 不可解析，紅旗 5 強制死路 ② 合併後非 epic finish 自 worktree 內不可執行（checkout base 被 git 拒、remove 自身 cwd strand shell） ③ WT-6/SRH-6 對同列互斥編輯、指向已刪名 | ① AF-1(fallback 規則)+WT-3(header)+WT-7(三平台 INSTALL)+WT-8(無預設 env 輪) ② WT-6(base-checkout 非 epic 路徑+紅旗+fixture 驗收) ③ SRH-6 廢止併入 WT-6；AF-13 轉靶 |
| **S2** epic worktree 全流程 | seams-found ×5 | ① Option 1/4 尾段在 worktree cwd：cleanup no-op、branch -d 失敗、.path 恆 null ② WT-6/SRH-6 衝突 ③ AF-13 鑄新死引用 + WT-6 遷移清單漏 4 檔 ④ cli.js 700 行共用預算無人持有 ⑤ WT-6 grep 撞 RV-8 未搬 artifacts | ① WT-4(cd-to-base 重排+逐字 fixture)+WT-1(pin 測試)+WT-2(cleanup base 委派) ② 同上 ③ AF-13 修訂+WT-6 清單補列 ④ **CORE-1（新）** ⑤ WT-6 依賴 RV-8 |
| **S3** SDD attended 迴圈 | seams-found ×5 | ① ratify 指令在 marketplace 通路無可執行形 ② sdd-gate 抬升毀掉 planner 的 delta 擷取 ③ ARCFORGE_MODE 洩入 loop spawn ④ SDD-5 可先於 AF-2 落地→通知指一條被確定拒絕的指令 ⑤ loop.js 兩包共編、無分解任務 | ① SDD-4(路徑解析步驟)+SDD-5(blessed 訊息) ② SDD-6(header/scope stage 擴充) ③ AF-10(env 淨空)+SDD-4(文件化) ④ SDD-5 加 AF-2 依賴+端到端測試 ⑤ **CORE-2（新）** |
| **S4** 隔夜自治 fan-out → 晨間 review | seams-found ×7 | ① runDag 單-ready fallback 繞過全部隔離機制、IN_PROGRESS 不可 resume ② prompt 的 Project Root/spec_path 與 spawn cwd 不一致 ③ 無 projectSetup → verify 地板必败 ④ loop.js 行數 ⑤ 晨間無 loop 成果 review queue、通知不可執行 ⑥ 啟動存活無文件 ⑦ attended 洩漏語意未定 | ① AF-7(移除 >1 條件+resume 語意) ② AF-7+AF-4(解析規則+存在性驗收) ③ AF-7(projectSetup:true) ④ CORE-2 ⑤ SDD-5(loop-finished action+blessed 文字) ⑥ AF-13(Launching overnight)+AF-3(smoke) ⑦ AF-10+SDD-4；AF-9(缺準則退化) |
| **S5** ICL 迴圈回本 | seams-found ×6 | ① active 檔格式與所有消費者不相容（JSON header/banner/無 confidence） ② 啟用執行緒接錯 project name ③ ICL-6 指向錯誤 store ④ pre-compact session-id 鍵分歧 ⑤ 'TO BE ENRICHED' stub 入證據 ⑥ 首 session migration 視窗 | ① ICL-4(activate 轉換+真鏈契約測試) ② ICL-3(scope.project) ③ ICL-6(readCurrentCandidates) ④ ICL-8/9(stdin parse+共用 path helper) ⑤ ICL-8(assembler 排除) ⑥ ICL-3(lazy migration) |
| **S6** review 中心品質閘 | seams-found ×4 | ① sentinel 在 worktree cwd 永遠 false→升級失效 ② 無 projectSetup → tsc 靜默空轉 ③ helper API 單呼叫單 JSON 與雙欄位需求矛盾 ④ finishing 死名鏈（4 skill+SRH-6+AF-13） | ① AF-2(worktree-aware)+RV-5/guard 測試 ② AF-7 ③ RV-1(API 拆分+subagent canary) ④ WT-6 清單+SRH-6 併入+AF-13+SRH-4 R4 |
| **S7** session handover | seams-found ×3 | ① spawned session 吃光 pending-action relay ② hooks/README 目錄樹殘留 ③ AF-1 SKILL_ROOT 兩-skill 列舉與樹不符（實為 9） | ① ICL-8(ARCFORGE_SPAWNED guard)+AF-10(loop 標記)+SDD-5(存活驗收) ② ICL-1 ③ AF-1(屬性式規則) |

---

## 5. 跨包依賴圖（文字版）與 PR 切分

### 依賴圖（→ = 阻擋）

```
Wave 0（並行）：AF-1   AF-2   RV-1   CORE-1   CORE-2   WT-1
  AF-1  → AF-3, AF-6, AF-11, WT-3(header), SDD-6(skill 編輯), ICL-5/ICL-2(呼叫形式), SRH-4(R2)
  AF-2  → AF-5, RV-5, SDD-5, SDD-4(f 節), Wave2.1 guard fold(外部), AF-13
  RV-1  → RV-3, RV-5, ICL-10        （RV-1 失敗 = 三消費者聯合再決策，全鏈凍結）
  CORE-1→ WT-2, WT-5, SDD-6, AF-8, AF-10, AF-11
  CORE-2→ AF-4, AF-5, AF-7, AF-8, AF-9, AF-10, SDD-5
  WT-1  → WT-4, SRH-3, WT-6(arc-using .path 規則), AF-6(措辭成真)

主鏈：
  WT-2 → WT-3 → WT-7
  WT-1 → WT-4 → WT-5 → AF-7
  RV-8 → WT-6（grep 前置）；WT-1..5 + RV-8 → WT-6 → AF-13, SRH-5(歸零), SRH-4 R4 gating
  ICL-1 → ICL-8 → ICL-9 → ICL-10, ICL-12；ICL-8 → ICL-11, SDD-5
  ICL-2 → ICL-3 → ICL-4 → ICL-5 → ICL-6 → ICL-7
  SDD-1 → SDD-6；SDD-2 → SDD-7；AF-2+ICL-8+CORE-2 → SDD-5 → SDD-4
  AF-4+AF-5+AF-6+AF-10+WT-5+CORE-2 → AF-7 → AF-8 → AF-9
  AF-11 → AF-12（且 RV-7 → AF-12）
  SRH-1 → SRH-2 → SRH-3, SRH-4 → SRH-5
  各包尾：WT-8(+SRH-7 同批)、SDD-8、RV-9、ICL-13、AF-14
外部協調（非本計畫任務）：Wave 2.1 G4（須在 WT-2 後、繼承 AF-2 文字）；Wave 3.2 與 ICL/SDD 的 inject-context 共編排序。
```

### 建議 PR 切分（每個 PR 自含測試、CI 綠才合）

1. **PR-0a** CORE-1（cli.js 分解）｜**PR-0b** CORE-2（loop.js 分解）——純重構、行為零變。
2. **PR-0c** AF-1（公約文件）｜**PR-0d** AF-2（sentinel + 兩處拒絕文字 + 測試矩陣）｜**PR-0e** RV-1（spike transcript + helper + hooks.md 一次修正）。
3. **PR-1a** WT-1｜**PR-1b** WT-2（引擎 + cleanup base 委派）｜**PR-1c** SDD-1+SDD-2｜**PR-1d** SDD-3｜**PR-1e** AF-4+AF-10｜**PR-1f** RV-2｜**PR-1g** RV-7+RV-8｜**PR-1h** ICL-1+ICL-2｜**PR-1i** SRH-1｜**PR-1j** RV-6。
4. **PR-2a** WT-3｜**PR-2b** WT-4+WT-5（同檔合批，pressure C 證據隨 WT-8 補）｜**PR-2c** AF-3+AF-5+AF-6｜**PR-2d** RV-3+RV-5｜**PR-2e** ICL-3｜**PR-2f** SDD-6（大，可再切 engine/skill 兩段）｜**PR-2g** SDD-7｜**PR-2h** SRH-2。
5. **PR-3a** ICL-4（含 activate 轉換契約）｜**PR-3b** ICL-8｜**PR-3c** AF-7｜**PR-3d** SDD-5｜**PR-3e** **WT-6（含 arc-using 唯一批次 + SRH-7 eval 證據同 PR）**｜**PR-3f** WT-7｜**PR-3g** SRH-3+SRH-4。
6. **PR-4** SDD-4｜AF-8｜AF-11｜ICL-5+ICL-9+ICL-11｜RV-4｜SRH-5（各自獨立 PR）。
7. **PR-5** AF-9｜AF-12｜AF-13｜ICL-6+ICL-7｜ICL-10+ICL-12（各自獨立 PR）。
8. **PR-6** 各包 eval 批次（WT-8+SRH-7、SDD-8、RV-9、ICL-13、AF-14）——eval 證據必須與對應 skill 編輯在可追溯的同一 change set 或緊鄰 PR（check-skill-eval-annotation 規則）。

**共用面合併序**（明文登記，先到先改、後到 rebase）：`scripts/lib/utils.js`（RV-1 / guard 包 2.1）、`hooks/hooks.json`（RV-2 / 2.1）、`hooks/session-tracker/inject-context.js`（ICL-3/4/7、SDD-5、Wave 3.2）、`scripts/loop.js`（CORE-2 後：AF-*、SDD-5）、`scripts/cli.js`（CORE-1 後：WT-2、WT-5、SDD-6、AF-8/10/11）、`skills/arc-using/SKILL.md`（**唯 WT-6 一次**）、`skills/arc-requesting-review/SKILL.md`（RV-7 先、WT-6 轉靶後、RV-9 取證）。

---

## 6. 風險與護欄

### Iron Law——必須 eval 重跑的行為性編輯（一包一批，絕不逐修重跑）
| 批次 | 涵蓋 skill | 證據要求 |
|---|---|---|
| WT-8（含 SRH-7） | arc-using-worktrees（全重寫=總體足跡）、arc-finishing（合併）、arc-using（唯一批次） | pressure A/C transcript、四個路由情境 k=5 非回歸（1.0 基線守住；harness-isolation 留在 CI95 0.68–1.0）、S1–S4 腳本證據 |
| SDD-8 | arc-refining、arc-brainstorming、arc-planning | NO-RUNS 情境先建 RED 基線再 GREEN；attended-draft-then-ratify 不退 SHIP |
| RV-9 | arc-requesting-review（新情境 RED→GREEN）、arc-agent-driven（裁定記錄） | preflight 通過、k≥5 無 INSUFFICIENT_DATA |
| ICL-13 | arc-observing、arc-recalling、arc-reflecting、arc-learning、arc-journaling、arc-compacting | 注入語意翻轉者**先**改情境期望再跑；latest.json 刷新 |
| AF-14 | arc-looping、arc-dispatching-teammates、arc-dispatching-parallel（皆需新撰情境）、arc-agent-driven、（arc-researching 確認門檻） | latest.json mtime 新於最後 SKILL.md 編輯（餵 RV-6 freshness gate） |

### 高機率觸發停止條件的任務（預先排好上報路徑）
1. **RV-1 spike 失敗**（中高風險、最大爆radius）：兩機制皆不達模型 → RV-3/RV-5/ICL-10 全部凍結，UserPromptSubmit relay 需三消費者聯合再決策。**先做**，Wave 0 即出結果。
2. **WT-6 合併 eval 回歸**（模型在 marker worktree 內略過 coordinator merge）：fallback（保留 pointer skill）是 owner 決策——兩次迭代即停，不磨。
3. **WT-3 偵測表歧義**：停止條件明定「重設計訊號、不打 prose 補丁」。
4. **SDD-6 stdin draft 介面**與模型實際多檔輸出不容（details/*.xml）：week+ 任務中最可能的設計回爐點，儘早以 eval transcript 驗證介面假設。
5. **AF-9 verdict 解析**：stub 與 live 分歧時禁止 exit-code 推斷——此停止條件是任務存在理由本身。
6. **RV-9 / AF-14 preflight 0.8 天花板**：現代模型可能無輔助即通過 trap——一次重設計後改列 non-regression 層並記錄，屬正常出口非失敗。
7. **ICL-4 default-on 審查阻力**：layer-8 文件既有不變量與 binding 決議（ON + kill-switch）衝突時上報，不默改 opt-in。
8. **700 行硬上限**：CORE-1/CORE-2 把此風險從「最後落地者必停」降為「不應發生」；若仍觸發代表分解不足，照停。
9. **跨包同檔競態**：arc-using（唯 WT-6）、inject-context、utils.js、hooks.json——任何任務發現目標檔有未登記在途編輯，一律停下協調，這是計畫級規則不是建議。

### 結構性護欄（建構式防回歸）
- **SRH-3 smoke** 把 worktree 生命週期七道 seam 永久進 CI；**SRH-4 R1–R3 + R4**（skill 名解析）把「文件承諾 vs 引擎真相」與「dangling skill 名」兩個缺陷類變成 PR 級失敗；**SRH-2 manifest** 是 smoke 與 linter 的單一共用契約——下游加指令/欄位不更新 manifest 即紅，by design。
- **組合不變量測試**：S1（零 arcforge 狀態、無 hooks、無預設 env）、sequential loop 零 flag 逐 byte 不變、`inject_activated_instincts:false`、`--verifier` 缺席零額外 session——這四條是「彈性與組合」原則的機械化身，任何波次回歸即停。
- **北極星驗收（總收斂檢查，於 Wave 6 末人工確認一次）**：隔夜 `loop --pattern dag --verify-cmd --verifier` 之後，人的全部動作 = 讀 SessionStart 的 loop-finished review queue → review dev branch → `ratify` → merge。若任何一步仍需人去「生產」而非「審核」，回到對應任務的 seam 表，那就是還沒修完的縫。

---

計畫完。實作者自 Wave 0 起依序領取；任何停止條件觸發時，附上「已試、已敗、目前假設、最小下一步選項」上報，不得在等待裁示期間做推測性變更。