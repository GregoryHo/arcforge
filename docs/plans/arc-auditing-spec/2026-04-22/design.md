# arc-auditing-spec — Design Doc

Date: 2026-04-22
Spec-id: arc-auditing-spec
Author: Gregory Ho

## Problem / Motivation

arcforge 在 2026-04-19 的 SDD v2 重構(commit `c1e4e50`)把上游三階段工作流 `arc-brainstorming → arc-refining → arc-planning` 改成嚴格單向、硬 contract 的設計:每階段產出凍結、下一階段只讀不回寫、違反時 block 不落地。這個設計在 v1 → v2 的 eval 中顯著改善了上游生成品質(refining +43 分、planning +19 分)。

但同期實作 `arc-evaluating-v2`(8 epics、28 features)時暴露了 v2 刻意未碰的盲區。整個 sprint 結束後累積了 7 個整合缺陷,記錄於 `docs/research/sdd-v2-downstream-contract-gap.md`。這 7 個缺陷分屬 4 類不同問題:

1. **生成時語意漂移** — 跨 requirement 內部矛盾(Finding 2.1)、rename 自指 prose(2.6)、rename 掃過結構化 artifact(2.5)
2. **執行時狀態所有權** — merge 後 dag.yaml 不進 commit(2.2)、feature status 不回報(2.3)、worktree cleanup 依賴 drift 掉的欄位(2.4)
3. **生命週期僵化** — design.md 在 refine 後 validator 鎖死,無法接受事實修正(2.7)
4. **上游下游溝通斷層** — v2 現有的兩個驗證點(`validateDesignDoc` / refiner Phase 4 矛盾檢查)都是二元 block-or-pass,沒有「通知人類、讓人類決定」這一檔

使用者在兩個不同 session 重複踩到第 2 類的狀態問題,代表這不是一次性噪音。同時 v2 的 Iron Laws(「永不覆寫 delta」、「block 時零檔案寫入」、「R2 單向」)都是**預防性**而非反應性——當初為了防範 LLM 亂改上游而寫,並無具體事故支撐——在實務使用中過嚴而不實用,使用者卻沒有輕量管道把下游觀察到的問題**反饋回**上游給人類裁決。

整個上游生成鏈(design → spec → DAG)缺少一個**讀 only、advisory-only、走人類仲裁**的審查工具。本 spec 設計這個工具。

## Proposed Solution and Architecture

新增獨立 skill `arc-auditing-spec`,走 ad-hoc 使用者主動呼叫(不改既有 brainstorming / refining / planning 三階段行為)。Skill body 在 main session 中執行,分五個階段:

**Phase 1 — Fan-out**:並行 spawn 三個 sub-agent(fresh context、read-only tools),各自對應一個審查軸:

- **Cross-Artifact Alignment** — 檢查 design.md ↔ spec.xml ↔ dag.yaml 三層語意對齊
- **Internal Consistency** — 檢查單一 artifact 內部 requirement / `<consumes>` / rename prose 的邏輯自洽
- **State Transition Integrity** — 檢查 dag.yaml 記錄狀態是否與 `.arcforge-epic` marker 檔案、worktree 目錄實際存在性、feature-status 檔案一致(純檔案層觀察,不檢查 git 歷史層的漂移——那類屬於另一個 engine-fix spec 範圍,out of scope)

**Phase 2 — 印摘要**:Main session 收齊三組 finding 後,印 Summary table(axis × severity × count,severity 含 HIGH / MED / LOW / INFO)+ Findings Overview table(一 finding 一行,含所有 severity)+ 每條 finding 的 Detail 區塊(Observed、Why it matters、Suggested Resolutions 全部用 markdown table 排版)。

**Phase 3 — Triage (U3 Stage 1)**:以 AskUserQuestion `multiSelect:true` 呈現 HIGH severity finding 清單(最多 4 條),使用者勾選要深入討論的。MED / LOW / INFO 不進入 triage options(只在 Phase 2 的 overview 與 detail 印過),但使用者可透過 AskUserQuestion 自動附加的 "Other" free-text 通道指名任意 finding ID(任何 severity),把它們注入 Phase 4 resolution queue。

**Phase 4 — Resolution (U3 Stage 2)**:使用者挑出的 findings 按每批最多 4 條分批,透過 AskUserQuestion 逐條詢問解法。每 option 附 `preview` 欄位放 diff 片段,讓使用者在方向鍵切換時看到實際套用後的檔案差異。"Other" 自動附,使用者可 free-text 補充或否決所有建議。

**Phase 5 — Decisions 收尾**:印 Decisions table(finding ID × chosen resolution × user note),留在 main session context 中;skill 結束。Main session 拿到這份 context 後,接續怎麼處理(直接 Edit 動手、delegate 回 refining / planning、或僅留存決策等使用者下次開口)**不是 skill 的責任**。

預設不保存報告到磁碟;使用者加 `--save` 旗標時才寫到 `~/.arcforge/reviews/<project-hash>/<spec-id>/<timestamp>.md`(對稱於 v1.4.1 arcforge state 統一在 `~/.arcforge/` 的決策)。

本 spec 的實作階段 delegate 給 `arc-writing-skills`——SKILL.md 的 phase 內容、三個 agent 檔的 system prompt、以及搭配的 eval scenarios,都在 `arc-writing-skills` 的 TDD + eval-driven 流程下產出;本 design doc 不規範這些細節。

## Requirements

### Behavior and structure

**Invocation.** Skill 僅由使用者主動呼叫:`/arc-auditing-spec <spec-id>`,沒有任何 pipeline 階段會自動觸發它。目標 spec-id 若在 `specs/<spec-id>/` 下不存在,skill 必須以清楚訊息失敗並列出當前可用的 spec-ids。`--save` 旗標可選,用來控制是否持久化報告。

**Fan-out.** Skill body 必須透過 Task tool **並行** spawn 三個 sub-agent,每個 sub-agent 在 fresh context 中執行,工具權限限定為 read-only(Read / Grep / Glob,**禁止** Edit、Write、任何會改狀態的 shell 指令)。每個 agent 收到的輸入:spec-id 本身,外加指向 design.md、spec.xml、details/*.xml、dag.yaml 的路徑。三個 agent 對應三個審查軸:`cross-artifact-alignment`、`internal-consistency`、`state-transition-integrity`。

**Finding structure.** 每一條 finding 必須帶有唯一 ID(格式 `A<axis>-<NNN>`,axis 為 1/2/3)、severity(HIGH / MED / LOW / INFO,其中 INFO 保留給 graceful-degradation 這類資訊性通知,不得用於降級的 HIGH / MED / LOW 問題)、一行 title、受影響的檔案清單(含行號,若已知)、一段 "observed" prose、一段 "why it matters" 說明,以及最多四條 suggested resolutions。每條 resolution 包含簡短 label、說明其改動內容的 description,以及——當該 resolution 對應可編輯 artifact 時——一段 diff-preview 字串,供 AskUserQuestion 的 `preview` 欄位使用。當 reviewer 有明確偏好時,第一條 resolution 必須以 "(Recommended)" 前綴標註;若沒有偏好,則不得標註。

**Output format.** Phase 2 的輸出為 markdown:一張 Summary table(axis × severity × count)、一張 Findings Overview table(每行一條 finding:ID / Sev / Axis / Title / primary file)、以及每條 finding 的 Detail 區塊,Observed 證據與 Suggested Resolutions 均以 markdown table 呈現。Prose 僅保留給 "why it matters" 段落。MED / LOW / INFO 的 finding 會出現在 overview 與 detail,但**不進入 triage options**——使用者可透過 Other free-text 通道指名特定 ID 把它們注入 Phase 4。

### UX, boundaries, degradation, delegation

**Triage UX (U3 Stage 1).** Phase 3 為一次 AskUserQuestion call,設 `multiSelect: true`、header `"Triage"`。Options 為 HIGH severity findings,每次 call 最多 4 條;若 HIGH 數量超過 4,以追加 call 分批。MED / LOW / INFO 的 finding 不得進入 triage options,但使用者可透過 AskUserQuestion 自動附加的 "Other" free-text 通道指名任意 severity 的 finding ID,把它們注入 Phase 4 resolution queue。

**Resolution UX (U3 Stage 2).** Phase 4 對使用者勾選的 findings 以每批最多 4 題分批,每題對應一次 AskUserQuestion question。Question 以 finding ID 作為 `header`(≤12 chars)、以 finding title 加 observed 摘要作為 `question` 文字、以 reviewer 的最多 4 條 resolutions 作為 `options`,設 `multiSelect: false`。當有推薦項時,第一個 option 必須以 "(Recommended)" 標註。`preview` 欄位於 resolution 對應可編輯 artifact 變動時必須填入 diff 字串,否則省略。自動附加的 "Other" 必須保留,使用者可透過它提交 free-text。

**Decisions.** Phase 5 輸出 Decisions markdown table,欄位為 Finding ID / Chosen Resolution / User Note(User Note 記錄使用者在 Other 中提交的 free-text)。Table 留在 main session context 中,skill 隨即結束。後續由 main session 決定如何處理決策(直接 Edit、delegate 回 refining / planning、或僅留存等使用者下次開口),明確**排除在本 skill 的職責外**。

**Persistence.** 預設:不寫任何檔案。使用者加 `--save` 旗標時,完整 report 與 decisions 寫至 `~/.arcforge/reviews/<project-hash>/<spec-id>/<YYYY-MM-DD-HHMM>.md`;`<project-hash>` 推導沿用 arcforge 既有 worktree-path 演算法,確保跨 skill 一致。

**Hard boundaries.** 本 skill 及其三個 sub-agent 均 **MUST NOT** 修改 `specs/`、`docs/`、`scripts/`、`skills/`、`agents/`、`hooks/`、`templates/` 下任一檔案,**MUST NOT** 執行 git commit、branch 建立、worktree 建立,或任何檔案刪除。此約束的執行機制為各 agent 定義中的工具授權名單(read-only tool grants),不靠 prompt 指示。

**Graceful degradation.** 當 `specs/<spec-id>/spec.xml` 尚未存在(純 design 階段),A1 跳過「與 spec 對齊」類檢查並以一條 `severity: INFO` 的 finding 記錄跳過原因。當 `specs/<spec-id>/dag.yaml` 尚未存在,A3 回傳單一 `severity: INFO` 的 finding(「DAG 尚未規劃」)而非執行。任一 agent 失敗(token 超限、輸入格式錯誤)時必須回傳部分 findings 並標記 error flag;skill **不得**因一個軸失敗而中斷整個 audit。

**Implementation delegation.** SKILL.md body 的 phase 內容、三個 agent 的 system prompt、以及驗證 audit 正確性的 eval scenarios,均於實作階段透過 `arc-writing-skills` 產出。本 design doc 僅規範可觀察行為與介面 contract,**不規範**上述 artifact 的 markdown 內容。

## Scope

**In scope.** 一個新 skill `arc-auditing-spec` + 三個 axis-aligned sub-agent(`cross-artifact-alignment` / `internal-consistency` / `state-transition-integrity`)。Skill 僅覆蓋 design.md、spec.xml、details/、dag.yaml 這四類 arcforge 既有的 spec-family artifact 的**靜態審查**與**執行時狀態漂移偵測**。以 U3 兩階段 AskUserQuestion UX 收集使用者裁決,結果以 markdown Decisions table 留在 main session context;預設不存檔,`--save` 可寫至 `~/.arcforge/reviews/` 下的 L4 路徑。實作階段透過 `arc-writing-skills` 的 TDD + eval-driven 流程產出。

**Out of scope — 明確排除。**

- **Pipeline auto-invocation**:refining / planning / brainstorming 結束時**不自動呼叫** arc-auditing-spec,始終由使用者主動觸發(T1 設計決定)。
- **Autonomous edits**:reviewer skill 與其三個 agent **絕不修改**任何受審 artifact;決策後是否動手、如何動手,是 main session 的責任,不在本 skill 範疇。
- **Code review / PR review**:本 skill 不審查 source code、不 review pull request。那類任務由 `arc-requesting-review`、`arc-receiving-review`、Claude Code 內建 `/review`、或 `pr-review-toolkit` 等既有工具處理。
- **跨 spec 批次 audit**:一次 invocation 只處理一個 spec-id;要 audit 所有現存 specs 由使用者自行 loop。
- **Finding 2.5 類的 policy 問題**:關於「其他 skill 可否將 dag.yaml / spec.xml 當 free text 編輯」的 write-authority 邊界,屬於跨 skill 的政策議題,由日後獨立 spec(暫稱 `arc-structured-artifact-policy`)處理,非本 spec。
- **Coordinator / engine bug 的修補**:A3 所指出的執行時狀態漂移(例如 `_mergeEpicsInBase` 缺 `git commit`、feature-status 不回報、worktree cleanup 依賴漂移欄位)屬於 `scripts/lib/coordinator.js` 的工程修補,不在本 skill 範圍——reviewer 僅負責**診斷**,不負責修 bug;修 bug 會走另一個專屬 engine-fix spec。
- **改動既有 pipeline skills**:`arc-brainstorming` / `arc-refining` / `arc-planning` 的 SKILL.md、phase 結構、或 Iron Laws **均不更動**。本 skill 以旁路 advisory 通道的形式並存,補足 v2 既有「二元 block-or-pass」驗證機制之不足,而非取代或稀釋它。
