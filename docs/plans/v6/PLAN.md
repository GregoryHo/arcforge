# arcforge v6 實作計畫（北極星）

> 本檔為靜態基準，執行期間不追蹤進度。進度載體：`docs/plans/v6/progress.md`（repo 內，D3 checkbox 格式）+ 獨立 progress artifact（每個 phase gate 更新）。

## Context

arcforge v5 的包袱（SDD/DAG 引擎、ARCFORGE_ROOT 注入、雙平台、肥大共用層）使重構成本高於重寫。已完成藍圖分析（12 agent 掃描 + 8 項裁決，見 blueprint artifact `https://claude.ai/code/artifact/f20812c2-8cc5-41d7-9e98-a7ba5eca3144`），確定 0-to-1 重寫為 v6：自足 skill 集（30→~14）+ 極簡 CLI/hooks（14→6）+ Claude Code 單平台。本計畫將藍圖展開為可執行、可驗收、可回滾的 phase 序列。

**裁決基準（不可重議，變更需開新 D 編號並經使用者裁決）**：
- D1 ECC 黑盒 CLI：skill 腳本絕不 require/import 出自己目錄；引擎功能經 `${CLAUDE_PLUGIN_ROOT}` subprocess 呼叫 CLI
- D2 保留通用 worktree 層；D3 保留 looping + markdown checkbox 任務清單（單一 owner 格式）
- D4 learning 全 8 層保留；D5 researching 廢棄；D6 arc-remind 全砍（eval 實測後再議）
- D7 廢除 arc- 前綴；D8 磁碟格式由 scripts/lib 單一 owner + schema 測試，反向耦合翻正

**執行決策（已確認）**：進度 = repo 清單 + 獨立 artifact；每個 phase gate 停下等使用者確認；v6 長期分支、main 凍結 v5 patch、每 phase 一個 PR 進 v6、每 phase exit 打 tag `gate-p<N>`；bucket spike 失敗時預授權自動 fallback 扁平結構。

## 執行架構

| 角色 | Model | 職責 | 禁止 |
|---|---|---|---|
| Orchestrator | Fable 5 | Workflow graph 編排：拆任務、派發、跑 L1 機械閘、彙整證據、更新進度 | 不得驗收自己派發的成果 |
| Worker | Opus 5 | 實作（S 單次；M 實作+1 驗收輪；L 用 loop engineering：迭代→機械檢查→verifier feedback→重試 ≤2，retry 上限派發前寫死） | 不得自評 AC、不得自行延長 retry |
| Verifier | Opus 5（fresh context） | L3 判定：讀 AC 逐字 + git diff + L1/L2 原始輸出，輸出 `Final verdict: PASS|FAIL` + 逐條 met/unmet | 不得看 worker 推理過程 |
| Eval grader | 沿用 eval harness 現有設定 | L2 行為驗收（`[tool_called]` 行為斷言優先） | — |

- Verifier 與 worker 同為 Opus 是刻意的：可靠性來自零共享 context，不是能力落差。
- Gate 協定沿用 `scripts/lib/loop-verifier.js` 既有契約：verdict 從文字解析、解析不出 = hard stop、FAIL 時逐字 feedback 前置給 worker 重跑。不另發明協定。
- 平行 worker 動檔案時用 worktree isolation；router 檔由 orchestrator 統一 merge（避免平行寫入衝突）。
- 行為 AC 一律寫明執行環境：(a) repo 內 `claude --plugin-dir .`（本 repo settings 停用已安裝版 arcforge）或 (b) 中性 cwd 用已安裝版。

## Phase Gate（每 phase 結束，五步，任一失敗不進下一 phase）

1. **機械閘**（orchestrator）：`npm test` + `check:versions/docs/cli-consumers/hooks/eval-targets` + phase 專屬 lint → 非零 exit 退回 worker
2. **行為閘**（eval harness）：phase 新增 scenario + 全部既有 scenario 回歸；門檻為 phase 開始時寫死的數字
3. **Verifier 判定**（fresh Opus）：PASS/FAIL + 逐條 AC
4. **進度更新**：勾 `docs/plans/v6/progress.md`、更新 progress artifact、記錄偏離/新 D 編號、打 tag `gate-p<N>`（回滾點）
5. **使用者確認**：呈現 AC 對照表、verdict、偏離清單、下一 phase 門檻數字

**全域 stop conditions**：同一任務 verifier 3 輪 FAIL → 凍結升級；任何步驟需改寫已裁決事項 → 停（開新 D 編號問使用者）；機械 AC 無法達成且根因指向藍圖矛盾 → 停。

---

## Phases

### P0.0 前置閘（v6 分支第一批 commit）
依賴：無。
- 開 `v6` 分支；`.github/workflows/ci.yml` 的 `on.push/pull_request.branches` 加入 `v6`（**否則 v6 的 PR 觸發 0 個 job，所有機械 AC 形同虛設**）
- **bucket spike**（binary）：`claude --plugin-dir .` 驗證 (1) plugin.json `skills` 白名單內的巢狀 skill 有載入 (2) 白名單外沒載入 (3) name==dirname 不含 bucket 段；結論寫 `docs/plans/v6/spikes/plugin-skills-whitelist.md`，只准 PASS/FAIL
- main 凍結政策寫入 README of v6 branch 或 progress 檔
- 建 `docs/plans/v6/progress.md`（D3 格式 v0）+ progress artifact 初版

**AC**：`[機械]` v6 分支 no-op PR 出現 lint/test/skill-eval-annotation 三個 job 且綠；`[人工]` spike 結論為 PASS 或 FAIL。
**Stop**：spike FAIL → 依預授權自動 fallback 扁平 `skills/<name>/`（生命週期=刪除+git 歷史），P6.5 取消，撤回記錄寫進 progress。

### P1 強制層可用化 + 契約凍結（不寫任何 skill）
依賴：P0.0。內部 3 路平行（pytest 組 / doc-refs+lint 組 / CI wiring 組）。
- `tests/skills/test_skill_structure.py`：去 `category`/`status` 斷言、去 `arc-` cross-ref 正則、frontmatter 凍結欄位表（name+description，選配 disable-model-invocation/argument-hint）＋ invocation 二分斷言（保留既有 description register 斷言）
- **line budget 決策**：PERMANENT_LINE_BUDGET 的 arc-refining 隨刪除消失；`finishing`（525 行 vs hard cap 250）→ 指定為 P3 的 pilot B 順便瘦身，不開新例外
- `scripts/lib/doc-refs.js` R4：由 `arc-` 前綴比對改為「對照實際出貨 skill 名稱集合」＋補 sanity floor（否則去前綴後 R4 靜默失效）
- **router stub + 雙向契約測試**（前移至此）：出貨 skill ↔ router 表 bijection，之後每個 phase 加 skill 就加列
- **D1 lint**：skills/** 的可執行檔不得 require/source/import 逃出自己 skill 目錄；prose 不得出現 `scripts/lib/`、`ARCFORGE_ROOT`。需**反轉**現有 `tests/scripts/skill-path-discipline.test.js`（現在強制的正是 D1 的反面）
- **D8 lint + allowlist**：scripts/**、hooks/** 不得引用 skills/；起始 allowlist 6 項（eval-command.js:555、eval-grader-model.js×3、diary-capture.js:130、batch-assembler.js:358、package.json test:observer-daemon、jest testMatch），斷言「P5 結束歸零」
- ci.yml 補 `check:hooks`、`check:eval-targets`（存在但不在 CI）
- 收掉 hooks/ 子 npm 專案（測試移 root、刪 hooks/package*.json、ci.yml 去 `cd hooks && npm install`）；刪 `test:diary`/`test:reflect` npm 入口
- D3 任務清單格式規格凍結 + schema 測試（owner 在 scripts/lib）
- `.claude/rules` 承重子集改寫（architecture/skills/testing/plugin/dev-context 中會誤導 v6 的段落；終版留 P8）

**AC**：`[機械]` test:skills、check:docs（含 R4 負向測試：改壞一列→轉紅）、test:scripts（含 router 雙向、D1/D8 lint）、check:hooks、check:eval-targets 全綠；`grep "cd hooks"` 無結果；D3 schema 測試對壞樣本會失敗。
**Stop**：D1/D8 lint 寫不出不誤傷不放水的規則（如 obsidian 的 Python 工具被誤判）→ 收斂為「不得逃出自己目錄」；仍不可行 → 回報使用者重議 D1 邊界。

### P2 引擎瘦身 + 反向耦合翻正
依賴：P1。內部 2–3 路平行；**每路「刪檔+刪測試+改守衛」同 commit**。
- 刪 SDD 管線 + CLI 命令檔 + 13 支 sdd jest + tests/node 對應；刪 DAG/coordinator（19 檔 6,903 行）+ 9 支 coordinator jest
- 刪 6 支 SDD hooks + arc-guard + arc-remind + quality-check + inject-skills；**改寫 dispatch-pre/post.js**（硬 require 這些 guard）；hooks.json 10→6 條目；刪對應 hooks/__tests__
- 刪 agents/（9 檔）+ templates/（3 檔）+ .codex* / .agents/ / AGENTS.md / porting guide + arc-researching + research-dashboard + website sdd 頁；`agents/verifier.md` 搬引擎側（`scripts/lib/prompts/verifier.md`，改 loop-verifier.js 的 VERIFIER_AGENT_PATH）
- 刪 dogfood 產物：根 dag.yaml、specs/、epics/、.arcforge/
- `tests/integration/` 分流：刪 sdd-v2-pipeline / subagent-driven-dev / explicit-skill-requests；skill-triggering 與 claude-code **預設刪除**（CI 未跑=死資產，git 可回收），gate 時可翻案
- D8 翻正：observer-daemon.sh、auto-diary.js、observer-prompt.md、eval-grader/analyzer/blind-comparator.md、eval dashboard 全搬引擎側；learning-curator 升格 CLI 子指令；loop.js 殼層改吃 D3 任務清單（拔 Coordinator/loop-dag）
- 移除 ARCFORGE_ROOT 注入與出貨面殘餘引用

**同 commit 耦合清單（違反=同次 CI 紅）**：刪 .codex*/website sdd ↔ check-version-sync LOCATIONS + arc-releasing 版本表；刪 templates/agents/.codex* ↔ package.json files；改 cli.js switch ↔ cli-manifest.js（雙向 parity 測試）；搬 observer-daemon ↔ test:observer-daemon + ci.yml；搬 eval dashboard ↔ jest testMatch；刪引擎模組 ↔ 其 jest + coverageThreshold 帶理由調整。

**AC**：`[機械]` npm test 全綠 + 5 支 check 全綠；D8 allowlist 大幅縮減（引擎讀 skill 歸零）；`git grep ARCFORGE_ROOT -- skills/ scripts/ hooks/ .claude-plugin/` 無結果；hooks.json==6 且 check-hooks-schema 綠；`npm pack --dry-run` 不含 templates/agents/.codex*；loop-verifier 可載入且 prompt 在引擎側。
**Stop**：jest coverage floor 因大刪失守 → 同 commit 帶理由調門檻，禁止事後回調；3 次調不穩 → coverage 降為 report、P8 復原。

### P3 meta skill + 2 pilots + 最小 eval 迴路
依賴：P1（格式凍結）、P2（harness 搬遷完）。不與 P4 平行。
- meta skill（writing-skills 後繼）初版——只寫教學 prose，schema 已在 P1 凍結，不得重定義
- pilot A：`tdd`（reference-heavy、零依賴）；pilot B：`finishing`（steps-heavy，順便解 525 行問題）
- **最小語料庫 3–5 scenario**：router 觸發 ×1、pilot 行為 ×2、D1 CLI-subprocess 路徑 ×1（用 `[tool_called]` 斷言驗證 `${CLAUDE_PLUGIN_ROOT}` 呼叫真的發生）——同時證明 harness 在 P2 搬遷後還活著
- REFACTOR pass：pilot 經驗回饋 meta skill 與 P1 pytest（允許改測試，須記錄理由）
- invocation 二分表定案（逐支列 model/user-invoked）

**AC**：`[機械]` pilots 過 pytest + router 雙向 + check:cli-consumers；`[行為]` 每 pilot ≥1 scenario 非零 delta（delta=0 → redesign scenario，不得宣告有效）；D1 scenario 行為斷言通過。
**Stop**：pilot B 在 250 行下裝不下必要機制 → 拆 references 或推進 CLI 二選一並記錄；均不可行才回報。

### P4 紀律叢集
依賴：P3。內部 5 支平行（router 由 orchestrator 統一 merge）。
- `debugging`、`code-review`（吸收 code-reviewer/task-reviewer/verifier/spec-reviewer 存留內容，prompt 內聯、two-axis 不得跨軸合併、反諂媚內聯）、`completion-evidence`（reference）、`compacting`、`sessions`；各 +1 scenario

**AC**：`[機械]` pytest + router 雙向 + D1 lint 綠；`[行為]` code-review ≥1 scenario 行為差異；`[人工/verifier]` 4 個被吸收 agent 檔的內容逐條落點對照表（不得只寫「已合併」）。
**Stop**：code-review 超 250 行不可拆 → 重新切分為獨立 reference，不開例外。

### P5 保留系統叢集（D1/D8 落地驗證場）
依賴：P2、P4。learning 家族序列、obsidian 平行。
- learning 家族四支合併重寫（skill 面收斂，全 8 層引擎不動）；磁碟格式 schema 測試（D8 後半）
- `evaluating`（只留方法論 prose）；obsidian 兩支（registry 寫入內收 CLI；確認 diagramming 的 .venv 不進 `npm pack`）；各 +1 scenario

**AC**：`[機械]` **D8 allowlist 歸零斷言**（正式驗收點）；instinct/diary/operation-record schema 測試對壞樣本會失敗；`npm pack --dry-run | grep -c .venv`==0；test:observer-daemon（指引擎側）綠；`[行為]` learning 端到端 observe→daemon→curator→activate→注入，`claude --plugin-dir .` 走完並產出 ≥1 候選。
**Stop**：某 learning 功能在 D1 黑盒 CLI 下確實做不到 → 不開後門，開新 D 編號問使用者。

### P6 workflow 叢集 + router 收斂
依賴：P1（D3 格式）、P2（loop 殼層）、P5。內部 3 路平行。
- `brainstorming`、`task-list`（D3 使用面）、`executing`（executing-tasks+implementing+agent-driven 合併，在場/走開開關）、`dispatching`（parallel+teammates）、`looping`（接 loop.js 殼層）、`worktrees`；router 最終收斂；各 +1 scenario

**AC**：`[機械]` router 雙向綠（core 全在表、每列可解析，總數 ≈14）；check:cli-consumers 綠；`ls -d skills/*/ | wc -l` ≤15；`[行為]` router 觸發矩陣命中率 ≥ 開始前寫死的門檻（建議 80%）；looping 對 D3 清單跑 ≥2 輪並正確停在 stop condition。
**Stop**：觸發矩陣低於門檻 → 不進 P7，回 description register 調整。門檻數字 phase 開始前寫進 progress，禁事後定義。

### P6.5 bucket 落地（僅 P0.0 spike PASS 時存在）
依賴：P6（skill 集已穩定）。
- 搬 core/in-progress/deprecated + plugin.json 白名單；同步四個編碼 `skills/<name>/` 的守衛：pytest glob、check-skill-eval-annotation 正則、doc-refs PATH_PREFIXES、（check-cli-consumers 遞迴掃描實測不受影響）；確認 check-benchmark-freshness 的 EVAL_BACKED_PREFIXES 仍成立

**AC**：`[機械]` `--plugin-dir` 載入名單==白名單且 deprecated 不在其中；pytest 掃到數==白名單數且 floor >10（防 glob 改壞掃到 0 靜默全過）；skill-eval-annotation 對 bucket 內改動仍發 annotation（負向驗證）。
**Stop**：任一守衛改不乾淨 → 回滾 flat（tag gate-p6 為回滾點）。

### P7 eval 語料庫重建 + 全量 benchmark
依賴：P3–P6（scenario 已逐 phase 累積，此處補齊+全量）。
- 刪 64 舊 scenario + retired/ + 過期 skill-files；補齊覆蓋（每支 core ≥1、router 矩陣、D1 路徑）；修 check-skill-eval-annotation 的 hasEvidence 述詞（指向已不存在的慣例）；全量 benchmark → latest.json；coverage 文件重寫或刪

**AC**：`[機械]` check:eval-targets 綠；check-benchmark-freshness 以 prevTag=v5.0.0 判 not stale；「每支 core 有 ≥1 scenario target」寫成測試；`[行為]` benchmark pass rate 達事前門檻。
**Stop**：某 skill 無 delta → 按 eval 規則 redesign ×2 仍 0 → 考慮該 skill 不該存在；不得調門檻過關。

### P8 文件、規範、發版（使用者指定：文件最後一併同步，防脫鉤）
依賴：P7。
- docs/guide：刪 sdd-pipeline、porting-to-a-new-platform；重寫 cli-invocation、hooks-system、skills-reference、worktree-workflow、eval-system、learning-dashboard
- README + assets 圖表重製；website 刪 sdd 頁後導覽修正 + `build:website` 提交編譯產物
- `.claude/rules/` 12 份終版全掃；CLAUDE.md（runner 表已失真）；CONTRIBUTING.md（含 ARCFORGE_ROOT 敘述）；`.claude/skills/arc-releasing` 敘事面 + arc-release-audit.js
- CHANGELOG 加 `## [6.0.0]`（release.yml awk 擷取，缺區段直接 fail，本地先驗）；版本 bump（依 P2 更新後的 LOCATIONS 表）

**AC**：`[機械]` check:docs、check:versions 綠；`git grep "arc-" -- docs/ README.md website/ .claude/rules/` 只剩刻意保留的歷史敘述；CHANGELOG 擷取對 v6.0.0 產出非空 body；`[行為/verifier]` fresh verifier 只讀 README+docs/guide（不讀原始碼）能正確描述 v6 的 skill 集與 CLI 表面（抓「文件描述不存在的東西」）。
**Stop**：check:docs 需要 ignore 註記才能過 → 先判定「文件說謊 vs 引擎缺功能」，ignore 必附理由。
**完成 = tag v6.0.0-rc → 使用者最終確認 → v6 merge main。**

---

## Critical Files
- `.github/workflows/ci.yml`、`release.yml`（觸發條件、check 步驟）
- `tests/skills/test_skill_structure.py`（frontmatter/invocation/line-budget 斷言）
- `scripts/lib/doc-refs.js`（R4 改寫 + floor）、`scripts/lib/cli-manifest.js`（與 cli.js 同 commit）
- `package.json`（scripts、files、bin、version）、`hooks/hooks.json`、`.claude-plugin/plugin.json`
- `scripts/lib/loop-verifier.js`（gate 協定沿用來源）、`scripts/check-version-sync.js`（LOCATIONS）
- `tests/scripts/skill-path-discipline.test.js`（反轉為 D1 lint）

## Verification（端到端）
1. 每 phase：五步 gate（機械→行為→verifier→進度→使用者確認），tag 回滾點
2. P5 結束：D8 allowlist 歸零 = 邊界裁決的最終機械證明
3. P8 結束：release.yml 全綠（ci 重用 + version 比對 + version-sync + benchmark freshness + CHANGELOG 擷取）→ v6.0.0-rc
4. 使用者視角驗證：中性 cwd 安裝 rc 版，跑 learning enable→observe→dashboard、obsidian ingest、一輪 looping——三個保留系統在非開發環境可用
