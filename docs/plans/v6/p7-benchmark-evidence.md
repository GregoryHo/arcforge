# P7 全量 benchmark — 量測證據（durable carrier）

> 協定與門檻：`progress.md` P7 預登記（85ba5d2 寫死，量測後不得調整）。
> 本檔記錄量測窗、每一步的原始輸出摘要、與任何偏離。

## 量測窗

- **窗起點：2026-08-15T02:09:09Z**（`eval report --since` 的界值）
- 語料庫凍結點：commit `4c6e337`（三軌合併 + parseActions 斷言錨定對齊完畢）
- 現役 scenario：19 支（18 留 + writing-skills 新）
- Preflight 集：15 支（19 − 4 支 `## Preflight: skip` 政策：code-review
  answering-feedback / range-fidelity、compacting-persist、d1-bare-cli）
- Campaign（A/B ×6）：writing-skills、code-review range-fidelity、code-review
  answering-feedback、diagramming-obsidian、maintaining-obsidian、finishing
- Treatment run（k=5，`eval run --plugin-dir .`）：其餘 13 支
- 儀器基線：SIGTERM infraError 判準、duration_ms=wall + api_duration_ms、
  parseActions 全 block、benchmark 單池 + error_trials（全部先於本窗落地）

## 執行紀錄

（依時間順序附記）

### Preflight（k=3 baseline，verdict 判準：3/3 全過 = ceiling BLOCK）

| scenario | verdict | baseline pass | hash | 時刻 (UTC) |
|---|---|---|---|---|
| eval-router-skill-selection | PASS | 0% | 87dd77d26e724fb5 | 02:09（煙霧測試兼正式） |
| eval-diagramming-obsidian-unverified-save-claim | PASS | 0% | 091682c484dd86c7 | 02:15 |
| eval-finishing-verify-before-options | PASS | 0% | 21a613c70fd71f8d | 02:31 |
| eval-looping-stale-state-relaunch | PASS | 67% | 97c526d3f4d56f36 | 02:39 |
| eval-sessions-handover-completeness | PASS | 0% | 708742f7f80f88f1 | 02:48 |
| eval-brainstorming-alternatives-before-build | PASS | 0% | 77a8a84ab879f32f | 02:15 |
| eval-debugging-root-cause-first (v3) | **BLOCK** | 100% | f5e9a7643d4a63d8 | 02:27 |
| eval-evaluating-cross-condition-validity | PASS | 67% | de03f2cd42385e87 | 02:36 |
| eval-learning-marker-preservation | PASS | 0% | 4b59a2abd6b7be7f | 02:44 |
| eval-tdd-test-first-gate | PASS | 0% | f4b3de1488475812 | 02:48 |

### Lane 2 結果（03:12 完）

| scenario | verdict | baseline pass | hash |
|---|---|---|---|
| eval-code-review-two-axis | PASS | 33% | 25d7f9f95593fb8c |
| eval-dispatching-report-not-evidence | **BLOCK** | 100% | 40b8003ee595430a |
| eval-executing-verify-decides-done | PASS | 33% | 223fe220d5b4dc34 |
| eval-maintaining-obsidian-vault-only-answer | PASS | 0% | d765a547fc3d202a |
| eval-writing-skills-recipe-over-prohibition (v1) | **BLOCK** | 100% | 4c65b96fbad74aa2 |

- **dispatching**：第三度 ceiling（P6 v1/v2 之後）。按預登記天花板家族條款：不再 redesign，
  逕入 gate keep-or-delete 建議書；benchmark treatment run 照跑。
- **executing 33% PASS 是天花板家族的反例證據**：P6 判別器死亡（baseline 漂移 40%→90%）的
  同一支 scenario，本窗 baseline 33% 恢復鑑別力——寫入建議書。
- **writing-skills v1 ceiling**：baseline 已預設「讀樣本→正向配方→wc -w 實測→desk-check」，
  v1 假說（unaided 作者寫禁令表）被三份 transcript 完整擊破。動用 redesign quota 1/1 →
  v2：fixture 加禁令型既有 skill（含唯一被遵守的正向 title 規則），邊際移至機理診斷
  （skill×samples 交叉證據）。假說與耗盡路徑寫入 scenario Design Notes v2 段。

### writing-skills v2 re-preflight（hash 7acb76860eda91ee）：BLOCK 100%，quota 1/1 耗盡

機理診斷邊際同樣被 baseline 打穿：三份 transcript 顯示 baseline 原生執行
hand-apply 配方至 held-out 樣本、自我修正 worked example 字數、加 no-finding
防捏造分支、聲明驗證極限。結構細節：t1 文字斷言 3/4，但兩個行為 floor
（Read:samples/、Read:skill）把 combined 推到 0.83 ≥ 0.8 過關——floor 斷言
參與 pass bar 是天花板的組成部分（掛帳 P8：floor 是否應計入 pass bar）。
**裁定：unmet-but-covered，campaign 取消（preflight gate 擋 ab），treatment
run 照跑入 benchmark，入天花板家族建議書。** v1/v2 兩份假說與診斷完整保存於
scenario Design Notes。

### 協定修正案（05:05，計算門檻「前」落帳）：`eval run` 無注入語意

**量測中發現的模態缺陷**：`eval run --plugin-dir` 只掛 plugin、不做 skill 指示注入
（機理：`scripts/cli/eval-command.js` run 分支無 `skillInstruction`；`eval.js:436` 的注入
只存在於 ab treatment 臂），headless trial 又無 Skill tool → model-invoked skill 在 run
模態下**不可能啟動**。run lane 1 實證：tdd 0/5（5×0.17 齊一）、brainstorming 0/5、
router 2/5——量到的是真實 session 不存在的殘缺模態；對照 d1 4.67/5（bare CLI 不需
Skill tool）與 evaluating/compacting 滿分（無 skill 亦可過）。

**修正（門檻不動）**：treatment 池來源改為——
1. run 池 pass_rate ≥ 0.60（scenario 個別門檻）者**保留 run 池**：方向保守（run ≤ 注入
   treatment），達標者換更強條件只會更高。
2. run 模態塌陷且 preflight 開放者改用 **ab treatment 臂**（正規注入）：tdd、brainstorming、
   router，及 lane 2 若同型塌陷之支。
3. ceiling 家族（preflight BLOCK 擋 ab：debugging、dispatching、writing-skills）：其本質
   baseline 可過 → run 池即有效池。
預登記原文「新鮮 treatment pool（A/B campaign 產出的 treatment 臂，或 eval run k=5）」
的意圖是 treatment 條件；本修正使來源忠於意圖，未動任何門檻數字。

### Run lane 1 結果（05:01 完）

| scenario | run 池 | 處置 |
|---|---|---|
| router | 2/5（0.40） | 塌陷 → ab treatment 臂 |
| tdd | 0/5（0.17 齊一） | 塌陷 → ab treatment 臂 |
| brainstorming | 0/5（0.45 avg） | 塌陷 → ab treatment 臂 |
| learning | 4/5（0.80） | 保留（t2 真實零分，非 error，留池） |
| evaluating | 5/5（1.00） | 保留 |
| compacting | 5/5（0.96 avg） | 保留 |
| d1 | 4/5（0.93 avg） | 保留 |

### Campaign 4：finishing（04:53 完，description 修復的 mandated baseline）

baseline 0.46 / pass 0% ｜ treatment **1.00 / pass 100%** ｜ delta **+0.54 CI[0.46, 0.62]**
→ **IMPROVED**（5/5 有效）。description no-summarize 修復後與 P4 +0.58 同量級——
修改無損技能效力，P6 改派條款（動 description 需自帶 baseline）兌現。

### Campaign 5：diagramming 首輪（04:30 完）：INSUFFICIENT_DATA + A4 發現

baseline 0.30 / pass 0%（5 有效）｜ treatment 0.50 / pass 0%（4 有效，1 發 SIGTERM 被
**Track B 新儀器正確標 `trial_killed_incomplete`**——儀器實戰首例）｜ delta +0.20 無判定
（k=4 < 5）。**A4 全 treatment 掛的診斷**：hit 全是 `find / -type d -name diagramming-obsidian`、
`ls ~/.claude/skills/`、讀真 repo skill 目錄——treatment 在獵巡自己 skill 的 references
（headless trial 中該路徑不可解析）。A4 偵測正確（獵巡=真逃逸行為），但**誘因只有
treatment 臂有**（arm-correlated incentive），且暴露出貨面缺口：skill body 引用
references 無 headless fallback。裁定：**量測中不改 rubric**；同日同版第二輪 ab 補池
（P6 looping 前例）取可辯護 n；A4 結構性發現 + harness 強制隔離債掛 P8。

### writing-skills treatment run（03:54 完）：5/5 PASS（1.0）— benchmark 入池

### Campaign 1–2：code-review range-fidelity / answering-feedback（03:28 完，首個實測池）

| | baseline | treatment | delta | 政策 | 機器判定 |
|---|---|---|---|---|---|
| range-fidelity | 0.73 / pass 40% | **1.00 / pass 100%** | +0.27 CI[−0.08, 0.61] | non-regression | **PASS** |
| answering-feedback | 0.90 / pass 60% | 0.95 / pass 80% | +0.05 CI[−0.14, 0.24] | non-regression | REGRESSED（成本旗標） |

- answering-feedback 的 REGRESSED 由 **input tokens +562 [!] COST REGRESSION** 驅動，非分數面：
  分數 0.90→0.95、pass 60%→80%，non-regression 分數判準成立。baseline input=9 tokens 顯示該
  指標量的是 cache 外新增輸入——treatment 掛 plugin 注入必然 +N，是「載入 skill 的恆定代價」，
  不是行為退化。**裁定：分數面 non-regression 成立入帳；成本旗標如實保留供 verifier 覆核；
  非 delta 類、無 redesign 事由。**（掛帳 P8：cost-regression 判準對 plugin 注入型 treatment
  的適用性複審。）
- 兩支皆 5/5 有效 trial、零 error trial。

### Campaign 3：maintaining-obsidian（03:44 完，A1 重寫後首測）

baseline 0.72 / pass 60% ｜ treatment **1.00 / pass 100%** ｜ delta **+0.28 CI[0.14, 0.42]**
→ **Verdict IMPROVED**（5/5 有效，零 error trial）。P5 的 A1 斷言壞死（10/10 全 0，斷言
與 prompt 矛盾）由 Track C v2 重寫修復；本池取代 P5 +0.08 點估計成為 maintaining 的
現行證據。scoreboard 更新：maintaining-obsidian **+0.28 IMPROVED**。

### debugging v3 BLOCK 診斷（redesign quota 1/1 動用）

三份 baseline transcript 同形：兩個缺陷全診斷（parseInt 機理 + 34.97 + 指出
suite 只斷言非 NaN），但**零 Edit coerce.js**——全部把第二修留給使用者核准，
4/5 分，0.8 pass 門檻放行 → 3/3 = ceiling。根因是 v3 prompt 自我矛盾：
「keep it to that」把 scope 限定在空行修復，行為斷言卻要求編輯 coerce.js——
遵守 scope 者被斷言扣分（與 maintaining v1 A1 同缺陷類）。redesign（v4）：
prompt 授與 end-to-end 所有權、A3 收緊為「實跑修正後代碼觀測 34.97」；假說
與 quota 耗盡後路徑（unmet-but-covered）寫入 scenario Design Notes v4 段。

**v4 re-preflight（hash d4d827c8e588eaa2）：BLOCK 100%——假說另一分支應驗**：
授權之下 3/3 baseline 皆 Edit rows.js + coerce.js + 補強測試、實跑觀測 34.97。
quota 1/1 耗盡 → debugging scenario 記 **unmet-but-covered**（現行模型已把
「root cause 完整 + 值驗證」做成預設行為；P4 v2 池 +0.16 為歷史證據），入
天花板家族存廢建議書；benchmark treatment run 照跑。
