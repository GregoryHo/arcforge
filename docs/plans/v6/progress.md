# arcforge v6 — progress

> 北極星計畫：`docs/plans/v6/PLAN.md`（靜態基準，不追蹤進度）。本檔為唯一進度載體（D3 checkbox 格式 v0，格式規格於 P1 凍結後如有變動，本檔跟著改——那是格式 churn 的早期警報）。
>
> **main 凍結政策**：v6 開發期間 `main` 凍結 v5 patch（不出 hotfix）。所有工作在 `v6` 長期分支，每個 phase 一個 PR 進 `v6`，phase exit 打回滾 tag，v6 完成後一次合入 main。
>
> **寫入時機規範**（P0.0 verifier 發現後補）：本檔的 gate 狀態與勾選只在 gate step 4（verifier 判定之後）更新——phase 進行中預寫「完成態」等於 worker 自評 AC，禁止。
>
> Progress artifact（人看的儀表板）：https://claude.ai/code/artifact/e709b090-6920-4858-9d66-1429ad261e97

## Phase 狀態

- [x] P0.0 前置閘 — gate: PASS (2026-07-31)
- [x] P1 強制層可用化 + 契約凍結 — gate: PASS (2026-07-31, PR #136, tag gate-p1)
- [x] P2 引擎瘦身 + 反向耦合翻正 — gate: PASS (2026-07-31, PR #137, tag gate-p2)
- [x] P3 meta skill + 2 pilots + 最小 eval 迴路 — gate: PASS (2026-08-01, PR #138, tag gate-p3)
- [x] P4 紀律叢集 — gate: PASS (2026-08-13, PR #139, tag gate-p4；首次 FAIL→補救→再驗)
- [x] P5 保留系統叢集（D1/D8 驗證場）— gate: PASS (2026-08-14, PR #140, tag gate-p5；首驗 FAIL→補救→再驗 PASS)
- [x] P6 workflow 叢集 + router 收斂 — gate: PASS (2026-08-15, PR #141, tag gate-p6；verifier PASS 附 6 項補救全兌現)
- [x] P6.5 bucket 落地 — gate: PASS (2026-08-15, PR #142, tag gate-p6.5；verifier 一次過)
- [ ] P7 eval 語料庫重建 + 全量 benchmark
- [ ] P8 文件、規範、發版 → v6.0.0-rc

## P0.0 任務

- [x] 開 `v6` 分支
- [x] `ci.yml` 觸發條件加入 `v6`（push + pull_request）
- [x] bucket spike → **PASS**（見 `spikes/plugin-skills-whitelist.md`；白名單採目錄項形式，P6.5 照計畫執行。注意：「目錄項載入整個 bucket」是額外發現、非三判定點之一，P6.5 落地時需重新驗證）
- [x] main 凍結政策（見本檔 header）
- [x] 進度載體建立（本檔 + progress artifact）
- [x] no-op PR 驗證 CI 三個 job 觸發且綠

## P1 任務（全數完成，PR #136）

- [x] pytest schema 凍結（category/status 移除、frozen 鍵集、ratchet ×3、slash cross-ref）+ `decisions/skill-schema.md`
- [x] D1 lint（skill-path-discipline 反轉刪除）、D8 lint（精確 allowlist，P5 歸零）、doc-refs R4 雙軌 + floor（runner 級）
- [x] router stub（`skills/using/`）+ 雙向契約測試
- [x] D3 任務清單格式凍結：`scripts/lib/task-list.js` + `decisions/task-list-format.md`
- [x] CI 補 check:hooks/check:eval-targets；hooks 子 npm 專案收斂；test:diary/reflect 移除
- [x] 承重規則改寫 ×5 + hooks.md/CLAUDE.md/README/AGENTS/CONTRIBUTING 假敘述清除
- [x] 負向驗證：router 壞列→router-contract 紅；反引號假引用→check:docs+pytest 雙紅；task-list 壞樣本→10+4 負向案例

### P1 gate 備註（verifier 發現）
- verifier 否決實作者對 AC2 的保守解讀：canonical 反引號列形式下 check:docs 會紅，AC2 字面成立
- worker 自報刪檔與實況不符一例（skill-path-discipline），orchestrator 補刪——「不採信自報」原則生效
- 已知前瞻風險：R4 slash floor 現靠 v5 legacy 文件撐（router 表尚空）；P8 刪 v5 文件前 v6 rows 必須先補上
- `tests/skills/test_minimal_toolkit_docs.py` 是 v5 doctrine 快照測試，P2 刪檔時必須同 commit 處理（無主，已指派給 P2）

## P2 任務（全數完成，PR #137，兩波五 worker）

- [x] Wave1-E：hooks 14→6 實體（刪 8 目錄+兩支派送器；session-tracker 拔 SDD 渲染）
- [x] Wave1-F1：D8 翻正——daemon/auto-diary/eval prompts/dashboard 搬引擎側；allowlist 7→1
- [x] Wave1-F2：loop 任務來源 DAG→D3 清單（--tasks）；loop-verifier 去 SDD
- [x] Wave2-D-core：scripts/lib −19 檔、CLI 22→5、agents/templates/Codex/dogfood/integration 全刪、website sdd 頁移除、task-list blocked note 參數
- [x] Wave2-D-skills：6 支 doomed skills 刪除、legacy 30→24、ARCFORGE_ROOT 四出貨目錄歸零、v5 快照 pytest 刪除、check:docs 52 條追到 0
- [x] verifier 修正：README/plugin.json/marketplace.json 出貨面假敘述（ARCFORGE_ROOT/SDD 宣傳）清除

### P2 gate 備註
- 「不採信自報」再度生效：兩個 worker 的 `git grep "a\|b\|c"` 單模式寫法會靜默回 0（假綠），D-skills 自查發現後改 `-e` 多模式，追回 11 處 R4 掃不到的 dangling 引用
- `${CLAUDE_PLUGIN_ROOT}` 在 skill Bash 區塊的 runtime 可用性「形式合規、runtime 未證」——P3 的 D1 scenario（[tool_called] 斷言）是驗收點
- 留給 P7/P8：cli-invocation.md 與 worktree-workflow.md 敘事層重寫（守衛掃不到的過期教學）、website Codex 卡片/skill 計數、evals 歷史紀錄、retired scenarios
- D8 allowlist = 1（session-tracker→reflect.js），P5 歸零

## P3 任務（全數完成，PR #138）

- [x] D9 spike + 裁決 + 落地（bin/arcforge shim、D1 lint 更新、16 支呼叫改裸形式）
- [x] writing-skills（142→150 行 + 2 refs，user-invoked）+ REFACTOR 回饋 ×5
- [x] pilot tdd：IMPROVED **+0.86** CI[0.75,0.96]（6v6）
- [x] pilot finishing：IMPROVED **+0.58** CI[0.55,0.62]（10v10 併池，525→154 行、零 PERMANENT 例外）
- [x] D1/D9 runtime 實證：transcript 記錄裸 arcforge 執行 + `external` kind 字串（僅真實 CLI 可產生）
- [x] router scenario IMPROVED +0.32（保守下界）；invocation-table 定案
- [x] skill-schema 三守衛（§3.1/§5.2/§7gap2）mutation 轉紅驗證；eval 引擎修兩缺陷（re: 斷言、error-trial 排除）

### P3 gate 備註（verifier 修正與掛帳）
- **verifier 否決兩項實作者敘事**：(1) d1「policy 錯位」定性不成立——真因 treatment 觸發不穩（3/5），任何 policy 都不 PASS；AC3 依「行為斷言已證」判 met-with-interpretation，行為閘對 d1 未乾淨通過。(2)「skill 一行未改」僅窄義成立（v1→v2 有未提交視窗的 treatment 輸入變動）；頭條數字 provenance 閉合（全部晚於 skill commit）。
- **磁碟級發現**：harness 對每個 trial 無條件加 `--disable-slash-commands`——headless trial 永無 Skill 工具；D6/P6 的 router 觸發矩陣與任何 `[tool_called] Skill:*` 斷言在此模態下結構不可能，scenario 設計必須繞開。
- finishing 的 eval 與 skill 高度耦合（四選項與規避語句逐字對應）——delta 真實但不得讀作泛化證據。
- **掛帳 P4**：finishing description 違反 no-summarize 規則（動它需自帶 baseline）；第二支 user-invoked skill 落地時重跑 §3.1/§5.2 mutation。
- **掛帳 P6**：router `/tdd` 與 `/finishing` 列在「實作完成但無測試」狀態上重疊、表無優先序；ROUTER_SKILL 在 pytest/jest 雙處硬編。
- **掛帳 P7**：rubric 編輯→Version bump 的 lint（防靜默混池）；eval report 與 compare 的 trial 數不一致；parseActions 只留 Bash 首行；d1 scenario 穩定性；Design Notes 改引 --disable-slash-commands。

## P4 任務（全數完成，PR #139，四路 worker + p4-finisher 稽核）

- [x] debugging（127 行+2 refs）：IMPROVED +0.16 CI[0.05,0.27]
- [x] code-review（155 行+completion-evidence ref）：two-axis IMPROVED **+0.40 CI[0.4,0.4]**（treatment 5/5 滿分）
- [x] compacting（66 行）：non-regression PASS（天花板誠實記錄，不宣稱 lift）
- [x] sessions（純 prose + `.handovers/` 慣例）：IMPROVED +0.17 CI[0.17,0.17]
- [x] 5 支 legacy 刪除（debugging/reviewing/verifying/compacting/managing-sessions），json 21→16；router 7 列
- [x] 落點對照表 73 條：`decisions/p4-absorption-map.md`（52+6 落地/14 捨棄/1 冗餘；6 條刻意反轉）
- [x] 儀器修正：eval trial timeout 300s→600s、analyzer 接收 assertionScores、two-axis 汙染池隔離（附錄存檔）

### P4 gate 備註
- **首次 verifier FAIL→補救→再驗**：FAIL 原因是 AC3 落點表只存在於 agent 訊息（不可覆核載體）+ 漏標 agents/verifier.md。補救 = 73 條全表持久化 + F 節 + 排除紀錄存檔。教訓：**gate 交付物必須落在 repo 內的耐久載體，agent 訊息不算證據**。
- two-axis 的 +0.40 證明的是「報告形狀」（兩軸不合併 + plan-mandated 缺陷仍報），非 dispatch 機制本身（1/5 trial 內聯自審仍滿分）——如實定位。
- **掛帳 P7（儀器）**：缺陷 A（SIGTERM trial 不標 infraError；修法約束＝killed 且最終輸出未完成，見 absorption-map 附錄）；duration_ms 低報（eval.js:228 優先採 stream-json 值）；finishing description no-summarize 違規（**明確改派 P7**，前提「動它需自帶 baseline」不變）；sessions 的 scenario 結構守衛等價物；range-fidelity/answering-feedback 兩 scenario 無實測池。
- P3 掛帳的 §3.1/§5.2 mutation 重跑：P4 無新 user-invoked skill，N/A，順延至下一支 user-invoked 落地時。

## P5 任務（全數完成，PR #140，三路 worker + orchestrator 接手量測）

**預登記行為門檻**（開跑前寫死，禁事後定義）：

1. **learning e2e（旗艦 AC，binary）**：以 `--plugin-dir <本樹>` 在隔離環境走完
   observe→daemon→curator→queue，佇列新增 ≥1 條源自 probe session 的候選；再走
   approve→materialize→activate 產出 active instinct，SessionStart 注入可見。
   證據一律檔案面（queue.jsonl／drafts／instincts／注入輸出），不採信 agent 自述。
   不得汙染使用者真實 `~/.arcforge` 的 learning 狀態（隔離或事後可證清理）。
2. **eval scenario**：`learning`、`evaluating` 各 ≥1 scenario delta > 0（CI 下界 ≥0）；
   `maintaining-obsidian`、`diagramming-obsidian` 各 ≥1 scenario delta ≥ 0（非退化底線）。
   delta=0 → redesign（≤2 次）仍 0 → 如實記錄，不得宣告有效。
3. **回歸**：P3/P4 既有 scenario 全數非退化。

任務：

- [x] Track A — `learning`（L，loop，四支合一）：skill-local scripts（diary/reflect/instinct/recall.js）
  邏輯上收 `scripts/lib`，CLI `learn` 新增 diary/reflect/instinct/recall 子群（cli-manifest 同 commit）；
  `hooks/session-tracker/end.js` 改 require canonical lib → **D8 allowlist 歸零**（測試翻轉為
  `toEqual([])`）；inject-context nudge 改指新 skill；jest 四支測試改指 lib/CLI；
  `skills/learning/SKILL.md`（≤250 行+refs，invocation 以判準重推導，預填 user-invoked）；
  刪 4 legacy dirs + legacy-skills.json 同 commit 剪 4 條；router 列；invocation-table 更新已落地；
  instinct/diary/operation-record schema 測試（壞樣本紅）；+1 scenario；e2e probe
- [x] Track B — `evaluating`（M）：方法論 prose only（機制已在 `arcforge eval ...`）；刪
  arc-evaluating + json 剪 1 條；9 支 eval-arc-evaluating-* scenario 的 Target retarget 或除役
  （check:eval-targets 綠）；router 列；+1 scenario
- [x] Track C — obsidian 兩支（M）：`maintaining-obsidian`（registry 操作走 `arcforge obsidian ...`）、
  `diagramming-obsidian`（Python 工具留 skill 內自足，`npm pack` 無 .venv）；刪 2 legacy dirs +
  json 剪 2 條；router 兩列；各 +1 scenario
- [x] 機械 AC（gate step 1）：npm test 5 runner + 5 check 全綠；D8 歸零斷言；schema 測試 ×3；
  `npm pack --dry-run 2>&1 | grep -c .venv`==0（Track C 發現原式空洞：清單走 stderr，
  `2>/dev/null` 版恆為 0；修正版經 mutation 驗證可證偽）；test:observer-daemon 綠；4 支新 skill 過 pytest 全規則；
  router bijection；legacy json 16→9（ratchet 同 commit）；`git grep` 四支 learning 舊名於
  hooks/、scripts/ 歸零
- [x] §3.1/§5.2 mutation 重跑（若 `learning` 落地為 user-invoked——即第二支 user-invoked，清 P3 掛帳）
- [x] gate 五步（機械→行為→verifier→進度/tag `gate-p5`→使用者確認）

### P5 gate 備註

- **首驗 FAIL→補救（ac7c696）→再驗 PASS**。FAIL 兩因：(F2) diagramming 最終 run 的 +0.30 無效——treatment 5/5 逃逸隔離讀走真 repo references（baseline 0/5；一 trial 主動 `find` 外搜），全額 delta 落在效力前提「references 不在磁碟」被摧毀的 A0/A3；(F1) 耐久紀錄與 gate 主張矛盾（coverage 檔仍寫 NOT RUN／舊 INSUFFICIENT_DATA）——**P4 教訓（gate 交付物必須落耐久載體）第二次觸發**。診斷全文：`evals/skill-eval-coverage.md` F2 節。
- **行為門檻結果（約束性措辭，per verifier）**：
  - `learning`：e2e 旗艦 AC **PASS**（五輪收斂：空證據→id 截短→refs 上限→safety ack→全鏈路，證據 `p5-learning-e2e-evidence.md` §15）；scenario v2 IMPROVED **+0.25 CI[0.25,0.25]**——讀作「機器可讀標記保留」，**不得讀作**名稱宣稱的「反捏造」（該行為兩臂天花板；改名掛 P7）。
  - `evaluating`：**unmet-but-covered**（−0.16 全額為工具形狀 artifact，方法論斷言 10/10 兩臂天花板；v2 preflight BLOCK；依預登逃生條款如實記錄，非達成）。
  - `maintaining-obsidian`：**+0.08** 達 ≥0 底線（點估計；A1 斷言缺陷 10/10 全 0 如實記錄，掛 P7）。
  - `diagramming-obsidian`：**unmet-but-covered，且「非退化」本身未經檢查**——無任何有效量測，不是通過，是未檢查；P7 不得寫成底線已驗。
  - 回歸（門檻 3）：以不變性成立（9 支 P3/P4 scenario diff 全空；7 skill 目錄僅 `using` +4 純新增列）；引擎有動（偏離 a），P7 全量 benchmark 為必要收口。
- **偏離裁定**：a 引擎缺陷修正接受——home resolver 統一／curator evidence 縫接通／渲染補 operation_kind／observer-prompt 契約補齊，mutation 回歸鎖 **3/4**（prompt 硬化無單元測試，僅 live probe，邊界已標註）；b npm pack 檢查式修正（`2>&1`）接受；c、d 依逃生條款；e 接受附殘留風險；f 接受附讀法約束；g 池隔離接受（第二次逃逸未被揭露係 orchestrator 接手量測後未做逃逸稽核，缺口實存、非隱瞞）。
- **e2e AC 的實質產出**：三個影響真實使用者的靜默引擎缺陷被挖出並修復（daemon 記成功、退件只進 dashboard 不顯示的 rejections.jsonl）：curator 一直在空證據上提案（欄位縫自 5f8c8b5 未接通）、隔離依賴雙 home resolver、Haiku 提案被 prompt↔validator 契約缺口系統性退件。
- **事實更正（verifier）**：evaluating／maintaining 的 run dir 位於 agent worktree（數字經 verifier 從原始 JSONL 重算後才清除 worktree）；P3/P4 回歸清單為 9 支 scenario 非 8。
- **掛帳 P7（儀器，本 gate 產出）**：harness 強制隔離（`--append-system-prompt` 是勸告不是沙箱）；位置相關 `model_grader_failed`（兩環境重現）；learning scenario 改名；maintaining A1 重寫；evaluating skill 存廢重估（天花板證據在案）；**subagent 背景 eval 程序隨 agent 睡眠被回收——長時量測必須由常駐 session 執行**（本 phase 兩次死池的根因）。
- **掛帳 P7/P8（出貨面缺陷，來自被捨棄的逃逸 diff 的真發現）**：`diagramming-obsidian/references/render_template.html` 未 pin 的 esm.sh import 在 runtime 因傳遞相依 `@braintree/sanitize-url@6.0.2` 404 而掛住 module load；`@excalidraw/excalidraw@0.18.0` 經該 trial 實測可載入。不採納未審查寫入；修復須自帶驗證重做。
- **掛帳 P6/P7**：dashboard 不呈現 `rejections.jsonl`（curator 提案被退對使用者不可見）。

## P6 任務（全數完成，PR #141，三路 worker + 3 redesign worker + orchestrator 量測）

**合併裁決（P6 權限，invocation-table 18 支 vs AC ≤15 的缺口收束）**：P6 落 4 支——
`brainstorming`、`executing`（吸收 arc-writing-tasks 的 D3 使用面 + arc-executing-tasks +
arc-agent-driven，含在場/走開開關）、`dispatching`（吸收 parallel + teammates +
arc-using-worktrees；worktree 面走 `arcforge worktree` CLI）、`looping`（user-invoked）；
另 `compacting` 併入 `sessions`（context 生命週期同域，−1）。終局出貨 = **15 dirs**。

**預登記行為門檻**（開跑前寫死，禁事後定義）：

1. **router 觸發矩陣**：全部 14 支非 router skill 各 ≥1 情境列（prompt 不得引用 skill 名稱
   或 description 措辭）；headless 無 Skill tool → 文字斷言（回應指名正確 skill）；
   每列 k=3、列命中 = ≥2/3；**總命中率 ≥ 80%**。低於門檻 → 不進 P7，回 description 調整。
2. **looping e2e（binary）**：`arcforge loop --tasks <fixture>` 對 D3 清單完成 ≥2 輪迭代並在
   stop condition 正確停止；檔案面證據（loop state / 任務勾選）。
3. **新四支 scenario**：各 ≥1，delta > 0 且 CI 下界 ≥ 0；redesign ≤2 仍不達 → 依 P5 逃生條款
   如實記錄，不得調門檻。
4. **sessions⊕compacting 合併再驗**：兩支既有 scenario 對合併後 skill 重跑——compacting
   non-reg PASS 維持、sessions delta ≥ 0（非退化）。合併失敗（任一退化）→ fallback 維持
   兩支分立並如實記 16 dirs 偏離。
5. **回歸**：P3–P5 未動 skill 以不變性論證；動到的（sessions/compacting/using）以實測覆蓋。
6. **量測執行紀律（P5 教訓，約束性）**：所有 preflight/ab/compare 與 e2e probe 由 orchestrator
   主 session 執行；worker 只交付 scenario 與 instrument（subagent 背景 eval 程序隨 agent
   睡眠被回收）。

任務：

- [x] Track A — `brainstorming` + `executing`（L）：吸收 arc-brainstorming(242)/arc-writing-tasks(109)/
  arc-executing-tasks(137)/arc-agent-driven(135+agents)；SDD 殘影（specs/、dag、refiner 鏈）不得帶入；
  刪 4 legacy dirs + json 同 commit 剪 4；router 兩列；+2 scenario；吸收對照檔
- [x] Track B — `dispatching`（M）：吸收 dispatching-parallel(107)/teammates(140)/using-worktrees(103)；
  worktree 操作一律 bare `arcforge worktree ...`；刪 3 + 剪 3；router 一列；+1 scenario；吸收對照檔
- [x] Track C — `looping`（M，user-invoked）+ sessions⊕compacting 合併：looping 接 loop CLI 殼層、
  loop e2e fixture+probe 腳本（orchestrator 執行）；compacting(66) 併入 sessions 後刪 skills/compacting；
  ROUTER_SKILL 單一來源（jest+pytest 雙處硬編收斂）；刪 arc-looping + 剪 1；router 列調整；+1 scenario
- [x] Orchestrator — arc-using 刪除 + json 剪 1（同 commit）；router 最終收斂（14 列 + tdd/finishing/
  debugging 重疊優先序註記）；eval-arc-using-* 兩支 scenario 處置；觸發矩陣 probe 撰寫與執行；
  全部量測執行；11 支 legacy-targeting scenario 處置後 check:eval-targets 綠
- [x] 機械 AC（gate step 1）：`ls -d skills/*/ | wc -l` == 15；legacy-skills.json == []（P6 清空承諾
  兌現）；router bijection 14 列 ↔ 15 支；npm test 5 runner + 5 check 全綠；arc-finishing dangling
  隨 legacy 刪除消滅（`git grep arc-finishing -- skills/` 歸零）
- [x] gate 五步（機械→行為→verifier→進度/tag `gate-p6`→使用者確認）

### P6 gate 備註

- **verifier PASS（一次過），附 6 項 tag 前補救——全數兌現**：coverage 檔不實宣稱更正（sessions 的
  「首次成功 A/B」為假——`20260813-023618` 是乾淨的 pre-merge run，更正為「前後數字全同 0.96→1.00」
  的更強非退化論證）；invocation-table 張力節結案（18→15）；**router 優先序註記補上並重量測**
  （P5 掛帳兌現：`skills/using` 增 Precedence 段 + 矩陣加重疊態第 16 列 → A 面 **16/16 = 100%**，
  出貨物與量測物重新對齊）；讀法校正（looping 合池為達標必要條件、sessions 以 post-merge
  +0.234 CI[0.13,0.34] 為主述）；verifier 報告入庫（`p6-gate-verifier-report.md`）。
- **行為門檻結果（約束性措辭）**：矩陣 A 面 100%（verifier 自寫腳本全額重跑 45 trial，嚴格計分同值；
  註記後重量測 16/16）；loop e2e PASS（verifier 親跑 ×2）；`brainstorming` **+0.50 CI[0.24,0.76]**、
  `looping` **+0.19 CI[0.07,0.31]**（合池承重）、`sessions` **+0.234 CI[0.13,0.34]**（post-merge 單看）、
  `compacting` non-reg PASS；`dispatching`、`executing` **unmet-but-covered**——各經兩次量測 + redesign
  （dispatching 1/2 依預登診斷止步、executing 2/2 用罄且鑑別器 baseline 非平穩 40%→90%），treatment
  合計 20/20 滿分但無穩定區分，與 `evaluating` 同族（天花板家族），skill 價值重估掛 P7。
- **偏離 a–h 八項全獲接受**，其中兩項結果決定性經時序覆核：dispatching 止步（診斷早於量測 10 分鐘）、
  looping 合池（兩 run 之間無 commit 觸及 skill/scenario）。executing 的 preflight 重擲獲個案接受但
  **通則須寫死**（對 gate 的 optional stopping 風險）。
- **儀器修正（本 phase）**：trial timeout 600→900s（brainstorming 2/5 baseline 遭削斷仍計分——
  P4 缺陷 A 同類第三例）；preflight 實測為 k=3 固定（worker 的 defaultK 宣稱被證偽）。
- **掛帳 P7（verifier 覆核後定版）**：preflight 重擲政策寫死（k=3 隨機閘 + optional stopping）；
  grader void 根因（looping 1 筆、sessions 舊 run 5 筆 gradeError）；900s 天花板複審（300→600→900
  連抬兩次本身是訊號）；天花板家族（dispatching/executing/evaluating）skill 價值重估；
  description register 的 tdd/debugging 邊界（矩陣 B 面 `/debugging` 1/3 被 `/tdd` 吸走，A 面 3/3）；
  scenario 檔名帶舊 skill 名的整體重建。
- **P5 移交事項處置**：router 重疊優先序 ✅（本 gate 補救）；ROUTER_SKILL 單一來源 ✅（mutation ×4 驗證）；
  「subagent 長時量測必由常駐 session 執行」✅（門檻 6 全程遵守，trialDir 全在主 repo）；
  dashboard rejections.jsonl 呈現 → 續掛 P7。

## P6.5 任務（全數完成，PR #142，單一 worker + orchestrator probe）

**預登記 AC**（開跑前寫死；stop condition = 任一守衛改不乾淨 → 回滾 flat，tag gate-p6 為回滾點）：

1. **載入 probe（binary，orchestrator 執行）**：`claude --plugin-dir .` 載入名單 == 15 支 core
   名單；臨時 `skills/deprecated/` 樣本 skill **不被載入**（負向）；載入識別碼**不含** bucket 段
   （spike 三判定點 + 「目錄項載入整個 bucket」重驗）。
2. **搬移純度**：15 支全為 git R100 純 rename（內容零變更）；任何內容改動需逐筆理由。
3. **pytest 掃到數 == 15 且 floor >10**（防 glob 改壞靜默全過）；jest 全綠（SKILLS_DIR 單點）；
   npm test 5 runner + 5 check 全綠。
4. **skill-eval-annotation 負向驗證**：bucket 內改動仍發 annotation。
5. **benchmark-freshness EVAL_BACKED_PREFIXES 仍成立**。

任務：

- [x] Worker — 原子搬移：15 支 `skills/<name>/` → `skills/core/<name>/`（git mv）；plugin.json 加
  `"skills": ["./skills/core/"]`；守衛同步（pytest SKILLS_DIR、jest `v6-legacy-skills.js` 單點、
  doc-refs 路徑、check-skill-eval-annotation、check-benchmark-freshness、e2e probe 腳本 glob）；
  38 支 scenario `## Target` + 30 份文件路徑 sweep；`.claude/rules/plugin.md`/`architecture.md`
  落地敘述更新
- [x] Orchestrator — 載入 probe（含 deprecated 負向樣本）；R100 純度驗證
- [x] gate 五步（機械→probe→verifier→進度/tag `gate-p6.5`→使用者確認）

### P6.5 gate 備註

- **verifier 一次過 PASS**：R100 純度 63/63（雙端 ls-tree 對帳）、pytest floor 雙層 mutation 驗證
  （==15 抓到 14 的 case、floor 抓到 0 的 case）、annotation 15 筆 warning 實跑、D8 mutation 矩陣
  4 case 證明 bucket-aware 化未弱化（allowlist 仍 []）、載入 probe 證據經數量閉合稽核（3 支
  user-invoked 與缺席集完全相同，零筆無法解釋）。
- **兩項裁定成立**：scenario Target sweep 不 bump Version（Version 只管 pooling；hash 隨全文變，
  bump 與否不改 re-preflight 後果）；docs/plans 刻意不 sweep（provenance 保全，且本就不在
  check:docs 掃描範圍——機械結案）。
- **操作後果（verifier D2，約束性）**：37 支 scenario 全檔 hash 已變 → **preflight cache 全失效，
  P7 全量 benchmark 前需 re-preflight**。
- **掛帳 P7/P8**：bucket 清單 ['core','in-progress','deprecated'] 三處三種編碼硬編
  （check-doc-refs array／d8 Set／pytest regex）——新增第四 bucket 會在 pytest deep-link 產生
  靜默漏檢，收斂為單一來源（verifier D1）；`evals/scenarios/retired/` 不在 eval-targets 掃描
  範圍（5 筆 flat legacy target 不可見，P7 刪除標的）；`package.json` files 含整個 skills/
  （未來 in-progress/deprecated 會被打包但不載入——P8 出貨面複審）。

## P7 任務（進行中）

**預登記（開跑前寫死，2026-08-15；量測後不得調整任何數字）**

**語料庫分類（刪/留判準，開跑前定案）**：
- **留（18 支，P3–P6 現役）**：brainstorming-alternatives-before-build、code-review ×3（two-axis /
  range-fidelity / answering-feedback）、compacting-persist-before-compact、d1-bare-cli-invocation、
  debugging-root-cause-first、diagramming-obsidian-unverified-save-claim、dispatching-report-not-evidence、
  evaluating-cross-condition-validity、executing-verify-decides-done、finishing-verify-before-options、
  learning-draft-not-fabricated（改名）、looping-stale-state-relaunch、maintaining-obsidian-vault-only-answer
  （A1 重寫）、router-skill-selection、sessions-handover-completeness、tdd-test-first-gate。
- **刪（33 支 + retired/ 5 支 + skill-files/ 2 支）**：Target 指引擎內部（scripts/lib、hooks/）或
  v5 慣例（eval-arc-*、eval-plugin-dir-*、eval-release-flow-*、eval-sessionstart-*、eval-icl4-*、
  eval-optional-workflow-*、eval-other-skill-noninterference、eval-trial-observation-exclusion、
  learning 家族引擎 scenario ×10）。引擎行為歸 unit test，不歸 eval 語料庫。
  skill-files 兩支 instinct 檔已 grep 證明無現役引用。
- **補（1 支新寫）**：writing-skills——唯一零 v6 scenario 的 core skill。補完後 15/15 覆蓋
  （compacting scenario 歸 sessions；router 矩陣由 e2e probe + router scenario 覆蓋；D1 路徑由
  d1-bare-cli scenario 覆蓋）。

**AC（機械）**：
1. check:eval-targets 綠（刪除後零 dangling）。
2. hasEvidence 述詞修復：移除 `tests/skills/test_skill_<name>.py` 死慣例，附單元測試。
3. 「每支 core ≥1 scenario Target」寫成 jest 測試 + sanity floor（scenario 數 >10）+
   scenarios/ 子目錄盲區斷言（listScenarios 非遞迴——retired/ 類盲區永久封死）。
4. npm test 5 runner + 5 check 全綠。
5. check-benchmark-freshness 以 prevTag=v5.0.0 模擬判 **not stale**（latest.json 重新生成後）。

**AC（行為，全量 benchmark）**：
- 量測協定：現役語料庫全數 **re-preflight**（P6.5 verifier D2 約束：bucket sweep 已使 hash 全失效）
  k=3；之後 scenario 檔凍結，任何再編輯 = 該支重新 preflight。
- benchmark = 每支現役 scenario 新鮮 treatment pool（A/B campaign 產出的 treatment 臂，或
  `eval run` k=5）；error trial 剔除，有效 <4 補跑；`eval report --since <P7 量測窗起點>` →
  latest.json + 日期版。
- **門檻（事前寫死）**：現役 scenario 未加權平均 pass_rate **≥ 0.70**，且 **≥80%** 的 scenario
  個別 pass_rate **≥ 0.60**。依據：P3–P6 已測 treatment 側多在 0.8–1.0，已知最弱
  maintaining ~0.6（A1 修復前）。
- **A/B 補池 campaign ×6**（P5/P6 掛帳的無池/無效池 + 明確改派項）：writing-skills（新 scenario）、
  code-review range-fidelity、code-review answering-feedback、diagramming-obsidian（首個有效量測；
  隔離逃逸須先由 scenario 側修復）、maintaining-obsidian（A1 重寫後）、finishing（description
  no-summarize 修復自帶 baseline，P6 改派條款）。判讀沿用既有規則：IMPROVED（CI>0）= 過；
  INCONCLUSIVE → redesign quota **1 次/scenario**；仍無 delta → 按 PLAN Stop 條款進入存廢審查
  （裁決權在使用者），不得調門檻。
- **Preflight 天花板處置（事前寫死）**：非回歸類 scenario（compacting-persist）豁免 ceiling BLOCK
  （其主張是不退化，非 delta）；delta 類 BLOCK → redesign（quota 同上）→ 仍 BLOCK 記
  unmet-but-covered 並入存廢審查。重擲政策：k=3 隨機閘，僅允許一次且須具名 infra 缺陷，落帳。
- **改名裁定（事前）**：learning scenario 改名為 marker-preservation 語意，行為主張不變、僅標籤
  更正 → 不強制重跑 A/B，舊池以 durable note 重新歸屬；新檔名照常 re-preflight 進 benchmark。

**天花板家族存廢重估（P5/P6 掛帳）**：evaluating / dispatching / executing 三支 scenario 照常
re-preflight + benchmark；再遇 ceiling 不再開新 campaign，改出具 keep-or-delete 建議書於 gate
呈使用者裁決。diagramming 由 campaign 直接補量測。

**儀器修復（benchmark 有效性前置）**：SIGTERM infraError 判準（killed 且最終輸出未完成）、
duration_ms 低報（採 stream-json 值）、rubric 編輯→Version bump lint、report/compare trial 數
不一致、parseActions 只留 Bash 首行、Design Notes 改引 --disable-slash-commands、
render_template.html esm.sh import pin（修復自帶驗證）。

**明確遞延（P8/掛帳，不入本 phase AC）**：dashboard rejections.jsonl 呈現；bucket 清單三處硬編
單一來源化；tdd/debugging description register 邊界（B 面診斷性）；website/docs 敘事層；
grader-void 與位置相關 grader_failed → 量測期間記發生率，任一池 >10% 才升級調查；900s ceiling
→ benchmark 後以新池時長分布出報告。

任務：

- [ ] Worker A — 語料庫刪除面 + hasEvidence 修復 + 覆蓋測試（AC 機械 1–4）
- [ ] Worker B — 儀器修復 ×7（各自帶單元測試/驗證）
- [ ] Worker C — scenario 補齊面：writing-skills 新寫、learning 改名、maintaining A1 重寫、
  sessions 結構守衛等價物、d1 穩定性強化、finishing description 修復、diagramming 隔離修復
- [ ] Orchestrator — re-preflight 全量、6 campaign、全量 benchmark → latest.json、coverage 文件
  終版數字、天花板家族建議書
- [ ] gate 五步（機械→行為→verifier→進度/tag `gate-p7`→使用者確認）

## 偏離紀錄

| 日期 | 偏離 | 理由 |
|------|------|------|
| 2026-07-31 | 回滾 tag 命名由 `v6-p<N>` 改為 `gate-p<N>` | `release.yml` 的 `on.push.tags: ['v*']` 會被 `v6-p0.0` 誤觸發（跑 release job 並因版本比對噴錯）。`gate-` 前綴避開 glob。 |
| 2026-07-31 | P2 AC「hooks.json 10→6 條目」改判為「hook 實體 14→6」 | verifier 查證：baseline 本來就是 6 events（該讀法無鑑別力），而 6 條目按 check-hooks-schema 自身規則（sync/async 分列）不可達。實體 14→6 精準命中計畫 Context 的「14→6」。條目實況 9。 |
| 2026-07-31 | P0.0 直接 commit 到 v6（未走 phase PR） | v6 分支自舉的雞生蛋問題（分支存在前無法對它開 PR）；P1 起全部走 phase PR。 |

## 新開裁決（D9+）

| # | 日期 | 裁決 | 內容 |
|---|------|------|------|
| D9 | 2026-07-31 | **bin/arcforge shim + 裸呼叫**（D1 機制層修正，使用者拍板） | Spike ground truth：`CLAUDE_PLUGIN_ROOT` 只給 hooks，在 skill 觸發的 Bash 中 UNSET；Claude Code 自動把每個 plugin 的 `bin/` 加進 PATH（實測端到端成功）。skill → 引擎的唯一形式改為裸呼叫 `arcforge <cmd>`；出貨 `bin/arcforge` shim；D1 lint 全面禁止 skill 內出現 CLAUDE_PLUGIN_ROOT；P2 寫入的引擎呼叫已改回裸形式。殘留：12 個 legacy 檔的 skill-local `${CLAUDE_PLUGIN_ROOT}` 路徑（豁免中、runtime 已壞、隨各自重寫 phase 以 base-dir 機制處理）。 |
