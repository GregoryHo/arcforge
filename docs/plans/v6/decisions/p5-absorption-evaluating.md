# P5 落點對照表 — `evaluating` 吸收來源逐條對照

> P5 Track B 的人工 AC 交付物（verifier 覆核載體）。來源逐條列出：
> **落地 / 部分 / 捨棄（附理由）/ 反轉（附理由）**。「已合併」不算對照。
>
> 形式沿用 `decisions/p4-absorption-map.md`。

## 來源枚舉（與任務卡數字的差異）

任務卡寫「9 個 references」。實際磁碟上 `skills/arc-evaluating/` 是
**1 SKILL.md + 7 references + 1 agent 檔 + 1 evals.json = 10 檔**：

| 檔 | 行數 | 類別 |
|---|---|---|
| `SKILL.md` | 169 | 本體 |
| `references/preflight.md` | 70 | reference |
| `references/verdict-policy.md` | 76 | reference |
| `references/grading-and-execution.md` | 136 | reference |
| `references/cli-and-metrics.md` | 119 | reference |
| `references/audit-workflow.md` | 63 | reference |
| `references/common-mistakes-catalog.md` | 29 | reference |
| `references/eval-schemas.md` | 101 | reference |
| `agents/skill-grader.md` | 165 | agent 檔（P2 已刪 `agents/` 層，此為 skill-local 殘留） |
| `evals/evals.json` | 27 | skill-creator 批次語料 |

「9」對得上「7 references + agent 檔 + evals.json」= 9 個**非 SKILL.md 支援檔**。
本表以磁碟實況為準，10 檔全數對照，不依任務卡的計數。

## 縮寫

- **P1–P5** = `skills/evaluating/SKILL.md` 的 Phase 1–4 與 `## Keeping the result pool honest`
  （P1 命名主張／P2 trap／P3 grader／P4 讀數字／POOL 池效度）
- **RAT** = 同檔 `## Rationalizations`；**RF** = `## Red flags`；**STOP** = `## When the numbers will not move`
- **SD** = `references/scenario-design.md`；**RR** = `references/reading-results.md`

## 統計

**126 條**（A16 / B8 / C9 / D14 / E9 / F16 / G23 / H8 / I8 / J4 / K11）→
落地或部分 **87**｜完全捨棄 **39**｜其中刻意反轉 **2**（D6、K9；另有 G 節整體形式反轉，見該節末）。

逐節：A 13/3、B 5/3、C 5/4、D 10/4、E 7/2、F 11/5、G 20/3、H 3/5、I 6/2、J 0/4、K 7/4
（落地或部分／完全捨棄）。捨棄比例最高的三節是 J（4/4）、H（5/8）、C（4/9）——
三者分別是 JSON schema 副本、CLI 與 metrics 表、preflight 機制，正好是引擎面最密集的三份。

完全捨棄的五類理由，全表統一引用：

1. **①引擎機制**——已由 `arcforge eval …` 的 CLI help／實作承載。skill 再寫一份
   就是第二份事實來源，且會與引擎漂移（本次即已漂移：舊檔全篇寫 `arc eval`，
   出貨形式是裸 `arcforge eval`）。
2. **②D1 違規載體**——內容只能靠指名 `scripts/lib/...` 引擎檔才說得清楚。
   「只能靠指名引擎內部解釋」本身就是「這是機制不是方法論」的判準。
3. **③規格數字**——閾值、enum、k 預設值、JSON 欄位型別。數字的真值在引擎，
   寫進 prose 會在引擎改動時靜默過期。判斷（「區間跨零就是沒量到」）保留，
   數字（「0.8」「k=5」）不保留。
4. **④載體已消失**——P2 已刪 `agents/`、`templates/`。
5. **⑤純冗餘**——同一主張在來源內重複出現。

**2 條刻意反轉**（勿讀成遺漏）：**D6**（原檔自稱 IMPROVED/REGRESSED「不對稱」，
但其自身條件是對稱的，v6 按對稱寫）、**K9**（原檔要 grader 從嚴，v6 要設計者
先把 assertion 寫到不需從嚴）。此外 **G 節整體形式反轉**——23 條事後清單中
6 條前移為事前 checklist，見該節末。

---

## A. `skills/arc-evaluating/SKILL.md`（169 行）

| # | 來源主張 | 落點 |
|---|---|---|
| A1 | frontmatter `category: meta` / `status: promoted` | **捨棄③** — v6 凍結 schema 廢除兩欄（skill-schema §2） |
| A2 | description：量測 skill/agent/workflow 是否真的改變行為 | **落地**，改 model-invoked register（`<identity>. Use when <triggers>`，243 字元） |
| A3 | 「你評的是 AI agent（LLM+工具），不只是 LLM 文字輸出」 | **落地** — P2 的環境段（「agent 有工具且會去用」）+ SD `## Environment and response shape` |
| A4 | When to Use：新 skill／改 skill／比較方案；無行為足跡則免 | **落地** — 移入 description 的 trigger 半邊（觸發條件屬 description，body 再列一次是兩份事實來源，比照 P4 D2 裁決） |
| A5 | Three Eval Scopes（skill/agent/workflow 三段落 + 各自 measure） | **P1 三列表落地**，但改寫為「你在問哪個問題 → 兩次 run 之間什麼在變」。原檔按「scope 名稱」組織，讀者要先知道 scope 名才查得到；改按問題組織，判準才在入口處生效 |
| A6 | Scope Alignment（MANDATORY）三問 | **P1 落地**（第 3 問「若只是 side-effect 檔案 → 用單元測試」是本節最有價值的一條，保留為獨立段落） |
| A7 | Scope Alignment 四列表（問題→scope→什麼在變→primary signal） | **部分** — 前三欄併入 P1 表；`primary signal` 欄捨棄③（`delta`/`pass@k`/`pass^k` 是引擎指標名，非判斷） |
| A8 | 「答不出第 2 問就不要進 scenario 設計」 | **落地** — P1 Done-when |
| A9 | The Process 七步流程圖 | **捨棄①** — 逐步流程即 `arcforge eval` 的子命令序列；v6 以四個 Phase 承載「每步要做的判斷」而非步驟清單 |
| A10 | Scenario Design Rules 五問 checklist | **P2 + SD 落地**（第 3 問「說得出 baseline 為何失敗嗎」升格為 SD 開篇的 baseline-failure sentence——原檔埋在五問之中，實測 9 支舊 scenario 有 5 支 baseline 觸頂，正是這條沒有生效） |
| A11 | Scenario validity rules 五條（single-condition／one behavior／trap／ground truth／3-5 narrow） | **落地** — single-condition 一條捨棄①（是 harness 契約：`eval ab` 擁有 A/B 迴圈）；其餘四條進 P2 + SD |
| A12 | Grader Selection 三 grader + 「配對性質而非便利」 | **P3 落地** |
| A13 | Grader selection principle（結構化輸出不等於語意確定） | **P3 逐字保留**（`**Structure is not quality.**`） |
| A14 | Model/human grader calibration（rubric+anchors+repeat+CI/variance/agreement+blind/spot-check） | **P3 落地並精簡** — 保留「task-derived rubric with concrete anchors, repeat trials, 分數互相一致」；blind comparator／independent adjudication 捨棄①（引擎有 `eval-blind-comparator`，呼叫方式屬 CLI 面） |
| A15 | Deterministic proxy warning | **P3 落地並強化** — 原檔是警告，v6 改為可執行動作：「先拿刻意膚淺的答案與 adversarial 答案在腦中跑一遍你的 grader」。實測依據：`adversarial-proxy-grader` baseline 20%（delta +0.24），是舊語料最有鑑別力的三支之一，值得升級為 Done-when |
| A16 | Step 6 Report：行為與營運成本分開報 | **P4 落地**（`metric-regression-separation` 對應此條） |

## B. `SKILL.md` — Verdict 表（A 節內，獨立列出因為整表捨棄）

| # | 來源主張 | 落點 |
|---|---|---|
| B1 | SHIP：code 100% / model CI95 下界 ≥ 0.8 | **捨棄③** — 閾值真值在引擎 |
| B2 | NEEDS WORK：60% ≤ pass rate < SHIP | **捨棄③** |
| B3 | BLOCKED：pass rate < 60% | **捨棄③** |
| B4 | INSUFFICIENT_DATA：k < 5 | **判斷落地、數字捨棄③** — P4「趟數太少就是沒有 verdict，不是弱 verdict」；RAT「Close enough to the trial minimum」；不寫 5 |
| B5 | 「Full verdict semantics in references/verdict-policy.md」 | 指標改指 RR |
| B6 | Rationalization Table 六列 | **RAT 落地五列**（preflight 那列改寫為 RF 末條「the block is the finding」） |
| B7 | Red Flags 六項 | **RF 落地四項**（見 E 節逐條）；其餘為 B6 重複 |
| B8 | Common Mistakes 五列（inline 摘要） | **P2/P3 + SD 落地**（完整表見 G 節） |

## C. `references/preflight.md`（70 行）

| # | 來源主張 | 落點 |
|---|---|---|
| C1 | Ceiling threshold = 0.8，達標即 block | **判斷落地、數字捨棄③** — P2 Done-when（「preflight 顯示 baseline 尚未通過」）+ RR `## Redesign, or abandon the claim` |
| C2 | 「0.8 baseline 不代表 skill 沒必要，代表 scenario 太簡單」 | **落地** — RAT「The baseline already passes — that proves it's unnecessary」。本次實測正是此條的最佳證據：舊語料 5/9 baseline ≥94% |
| C3 | 重設計手法：加難 trap／縮範圍／移除答案洩漏 | **落地** — SD `## Building the trap` 六種 trap 形狀 + `## Answer-leak checklist` 六問 |
| C4 | Scenario hash = SHA-256 of raw file bytes | **捨棄①②** — 雜湊演算法是引擎實作 |
| C5 | bump `## Version` 改變 hash → `--since` 濾掉舊結果 | **POOL 第 1、4 條落地** — 保留「改 rubric 就 bump Version 並重跑兩側」的紀律；`--since` 濾法屬 CLI |
| C6 | 「為何用 raw file SHA-256」provenance 論證 | **部分** — provenance 概念進 RR `## Pool validity` 的 **Provenance** 段（記下 scenario 版本與 model）；演算法理由捨棄① |
| C7 | PASS/BLOCK 四項檢查 + 四列 remediation 表 | **捨棄①** — `arcforge eval lint` / `preflight` 的輸出即為此；SD 收尾以「lint 過再 preflight」承接 |
| C8 | 「尊重 block；不得刪歷史／手改 cached verdict／降閾值」 | **落地** — RF 末條 + RR `## Redesign, or abandon the claim`（「lowering a threshold, deleting history, or editing a cached gate record … converts the gate into a formality」） |
| C9 | `## Preflight\nskip` 逃生門 + `shouldSkipPreflightGate()` | **捨棄①②** — scenario 檔語法 + 引擎函式名。刻意不寫進新 skill：舊 9 支全帶 `skip`，等於 ceiling 檢查從未生效；把逃生門寫進方法論會讓它成為預設 |

## D. `references/verdict-policy.md`（76 行）

| # | 來源主張 | 落點 |
|---|---|---|
| D1 | Verdict enum 七列定義表 | **捨棄③** — enum 真值在引擎 |
| D2 | 「verdict 由數值算出，不由主觀解讀」 | **落地** — RR 開篇（「引擎算 verdict；以下是那個 verdict 允許你**說**什麼」） |
| D3 | k<5 → CI 無意義的 t 分布論證 | **判斷落地、數字與統計推導捨棄③** — RR 表「Too few trials for an interval → 可宣稱：nothing yet」 |
| D4 | 「k=4 不夠接近 5」 | **RAT 落地**（不寫數字） |
| D5 | IMPROVED 需 CI 下界 > 0；REGRESSED 需上界 < 0 | **P4 + RR 表落地**（改述為「區間整段在零上方／下方」，不綁 enum 名） |
| D6 | 「IMPROVED 與 REGRESSED 的不對稱是刻意的」 | **反轉為「對稱」** — 原檔自稱不對稱，但緊接著寫「both require the CI to be fully on one side of zero」，那是**對稱**條件。v6 RR 表按對稱寫，不沿用自我矛盾的措辭 |
| D7 | INCONCLUSIVE：CI 跨零，+0.15 CI[-0.05,+0.20] 不是 IMPROVED | **P4 + RR 落地** — RR `## The point estimate is not the result` 專段。實測依據：`ab-noisy-delta-interpretation` baseline 40% |
| D8 | Preflight exemption（兩者不同階段） | **捨棄①** — 兩個引擎 gate 的相互關係，非使用者判斷 |
| D9 | 四列 grader × run type × verdict 對照 | **捨棄③** |
| D10 | 「code 單次不產生 INSUFFICIENT_DATA」 | **捨棄③** |
| D11 | Verdict Authority：analyzer 不得覆寫 harness verdict | **部分** — 「引擎算 verdict」保留於 RR 開篇；agent 分工捨棄①（`eval-analyzer` 是引擎元件） |
| D12 | 「不得混淆質性分析與 verdict 權威」 | **落地** — RR 的 licenses 表整體即為此（「可宣稱／不可宣稱」兩欄） |
| D13 | Acting on Verdicts 七列 | **部分** — SHIP/IMPROVED/REGRESSED 三列進 RR 表；INCONCLUSIVE 那列升級為 STOP 段（「兩次誠實重設計後仍為零 → 主張可能為假」） |
| D14 | INSUFFICIENT_DATA「跑更多趟」 | **落地** — P4（「honest response is more trials, not a softer reading」） |

## E. `SKILL.md` Red Flags 六項（逐條）

| # | 來源主張 | 落點 |
|---|---|---|
| E1 | 「手動測過了，eval 是多餘的」 | **RAT 落地**（"I already tried it by hand and it worked" → 「一次 run 量的是你的運氣」） |
| E2 | 「docs-only 不用 eval」 | **RAT 落地**（"It's documentation-only" → 「instruction *is* the behavior」） |
| E3 | 「INSUFFICIENT_DATA 只是警告」 | **RAT 落地**（併入 trial-minimum 那列） |
| E4 | 「我可以自己 promote discovered claim」 | **POOL 末段 + RR 落地** |
| E5 | 「blind comparator 不同意但 assertions 過了」 | **捨棄①** — 綁定 `eval-blind-comparator` 這個引擎元件的存在 |
| E6 | 「preflight 是新的，這次先跳過」 | **RF 末條落地**（改為「the block is the finding」） |
| E7 | RF 抬頭語「每一條都代表停下、重讀 skill、不要繼續」 | **落地並改進** — v6 RF 每項標注**回到哪個 Phase**（比照 `debugging` 形狀）；「重讀 skill」無可觀察動作 |
| E8 | Integration 段（arc-brainstorming／arc-writing-tasks／benchmarks 路徑） | **捨棄** — skill 關係由 router 單一承載（P4 D15 同裁決） |
| E9 | 「Numeric vs qualitative：analyzer 不取代程式化 verdict」 | **與 D11 合流至 RR 開篇** |

## F. `references/grading-and-execution.md`（136 行）

| # | 來源主張 | 落點 |
|---|---|---|
| F1 | Step 2 Prepare Environment 四列表（scenario 類型 → 環境需求 → setup 範例） | **落地並改寫** — SD `## Environment and response shape`。四列改為一條判準（「主張需要的檔案就給，或給足夠 context 讓它不需要檔案」）；`cp $PROJECT_ROOT/...` 範例捨棄①（scenario `## Setup` 語法屬引擎） |
| F2 | 「agent 在空目錄搜到 timeout = scenario 設計問題，不是系統問題」 | **SD 逐字保留語意** |
| F3 | Step 3 三種 run 的 A/B 步驟（skill／agent／workflow） | **捨棄①** — `eval ab` / `eval run` 的行為 |
| F4 | Workflow eval isolation 細節（`buildIsolationSettings()`、`enabledPlugins:false`、`claudeMdExcludes`、`--strict-mcp-config`） | **捨棄①②** — 引擎函式名與設定鍵；D1 直接禁止 |
| F5 | Good/Bad workflow scenario（好：慣例類真實任務；壞：點名某工具／太簡單） | **落地** — P1「把 instruction 貼進 prompt 來測已安裝的 workflow，量到的是 prompt」+ SD 設計錯誤表 |
| F6 | Step 4 三 grader 對照表（Use When／Not For／How） | **P3 落地前兩欄**；`How` 欄捨棄①②（`$TRIAL_DIR`、`A1:PASS` 標記、引擎 prompt 檔路徑） |
| F7 | 「有些行為品質無法由確定性測試捕捉」 | **P3 落地** |
| F8 | 「同時有確定性與判斷面 → 拆成互補的兩個 scenario」 | **P3 逐字保留** |
| F9 | JSON code review 範例（結構 code-grade／品質 model-grade） | **落地為原則、範例捨棄⑤** — P3 已用同一句原則表達，範例不新增規則 |
| F10 | Step 5 Track Results：`evals/results/` JSONL 一行範例 | **捨棄①** |
| F11 | `discovered_claims[]` 欄位表 + category 三分（factual/process/quality） | **捨棄③** — grader 輸出 schema；**概念**由 POOL 末段承接 |
| F12 | 「promotion candidates 依 `frequency × failure_rate` 排序」 | **落地為判斷** — RR「ranked highest are the ones that recur *and* fail, since a behavior that always passes teaches nothing by being written down」；公式不寫 |
| F13 | 「agent 不得自行 promote，需人工裁決」 | **POOL 末段 + RR 落地** |
| F14 | `weak_assertions[]` 欄位表 | **捨棄③** |
| F15 | weak assertion 四種常見原因（circular／ambiguous scope／competence proxy／format proxy） | **落地** — SD `## Ground truth that survives grading` 三條（circular／arguable scope／hidden convention）+ P3 proxy 段。四→三 是合併：competence proxy 與 format proxy 在 v6 分屬 P2（generic competence）與 P3（structure≠quality），依判斷性質歸位而非依「weak assertion 原因」歸位 |
| F16 | 「weak_assertions 比率高 → scenario 需重設計」 | **RAT 落地**（"The grader flagged weak assertions but the score is fine"） |

## G. `references/common-mistakes-catalog.md`（23 條）

23 條逐條 → SD `## Design mistakes worth recognizing by name`（12 列）。合併與捨棄：

| 來源 # | 主張 | 落點 |
|---|---|---|
| 1 | 先寫 scenario 才命名問題 | **SD 第 1 列落地** |
| 2 | 把 baseline/treatment 結構寫進 scenario 檔 | **捨棄①** — harness 契約 |
| 3 | 單一過載 scenario 無 trap | **SD 第 2 列 + 第 10 列**（拆為「無 trap」與「多行為混在一起」） |
| 4 | Baseline 已觸頂 | **SD 第 3 列落地** |
| 5 | Skill 只是把既有行為形式化 | **SD 第 4 列 + STOP 段落地** — 本條是 STOP 段的來源，v6 升格為獨立段落（原檔埋在 23 條表格第 5 列） |
| 6 | Prompt 洩漏修補樣式 | **SD 第 5 列 + 完整 leak checklist** |
| 7 | 以 competence proxy 做 code grading | **SD 第 4 列合流** |
| 8 | 測基礎設施產物而非 Claude 行為 | **SD 第 6 列 + P1 落地** |
| 9 | Ground truth 薄弱或可爭辯 | **SD `## Ground truth` 專節** |
| 10 | comprehension scenario 標成 agent eval | **捨棄①** — `**Eval type: comprehension**` 是 scenario 檔標記 |
| 11 | 對確定性輸出用 model grader | **SD 第 7 列合流** |
| 12 | 空 trial dir 無 Setup/Context | **SD `## Environment` 落地** |
| 13 | assertion 無法被所選 grader 驗證 | **SD 第 7 列合流** |
| 14 | scenario 留了逃生門 | **SD `## Environment and response shape` 末段落地** |
| 15 | 為配合偏好的 grader 改寫 assertion | **P3 落地**（「Never reshape the assertion to fit the grader you prefer」+ SD 第 7 列） |
| 16 | 因輸出是 JSON 就 code-grade 語意品質 | **SD 第 8 列 + P3** |
| 17 | scenario 回應形狀過大 | **SD `## Environment and response shape` 落地** |
| 18 | k=1 就採信 | **SD 第 11 列落地**（不寫 k 數字） |
| 19 | 只看 stdout 主張、不查產物 | **SD 第 9 列落地** |
| 20 | workflow eval 用 `--skill-file` | **P1 落地**（三列表的「什麼在變」欄即為此）；旗標名保留於 P1 敘述外，不進 SD 表 |
| 21 | workflow eval 但沒安裝 plugin | **捨棄①** — 「跑 `claude plugin list` 確認」是操作步驟 |
| 22 | workflow scenario 太綁單一 skill | **SD 第 12 列合流** |
| 23 | 挑最容易量的面而非有意義的面 | **SD 第 12 列落地** |

**G 節形式反轉**（非單一條目，故不計入上方的 2 條）：原檔 23 條是**事後清單**（「這些錯誤浪費最多 run」）。v6 把其中 6 條
（1/4/5/6/8/23）前移為 P1/P2 的**事前 Done-when 與 checklist**，只把「認得出名字就夠」
的 12 條留在查表面。理由：舊語料 5/9 baseline 觸頂，證明「表格裡寫了」不等於「設計時生效」。

## H. `references/cli-and-metrics.md`（119 行）

| # | 來源主張 | 落點 |
|---|---|---|
| H1 | CLI Reference 13 行指令清單 | **捨棄①** — 且已漂移（全篇 `arc eval`，出貨形式是裸 `arcforge eval`）。新 skill 只在開篇列一次子命令名，操作細節交 `--help` |
| H2 | `--since` / `--model` / `--skill-file` / `--interleave` 語意 | **捨棄①** |
| H3 | Metrics 五列公式表（pass@k／pass^k／delta／delta CI／CI95） | **捨棄③** — 公式真值在引擎；判斷面（「區間而非平均」）落地於 P4 |
| H4 | Default trial counts 四格表（run/ab × code/model） | **捨棄③** |
| H5 | Storage layout 目錄樹 | **捨棄①** |
| H6 | Available Agents 三列（eval-grader／eval-analyzer／eval-blind-comparator） | **捨棄①** |
| H7 | 「數值比較是程式化的，analyzer 只加質性分析」 | **與 D11/E9 合流至 RR 開篇** |
| H8 | Scenario Template（12 個 `##` 區段的骨架） | **捨棄①** — scenario 檔格式由引擎 `eval lint` 把關；SD 收尾以「跑 lint 再跑 preflight」承接。**唯一例外**：`## Version` 保留在 POOL 第 1 條，因為「改 rubric 要 bump Version」是紀律不是格式 |

## I. `references/audit-workflow.md`（63 行）

| # | 來源主張 | 落點 |
|---|---|---|
| I1 | promotion candidates = `discovered_claims` 依 `frequency × failure_rate` 排序 | **與 F12 合流至 RR**（判斷保留、公式不寫） |
| I2 | 「不是最常通過的，是常出現**且**常失敗的」 | **RR 逐字保留語意** — 本節最反直覺的一條 |
| I3 | retirement candidates = 語料反駁的既有主張／weak_assertions 樣式 | **RR `## Discovered claims` 末段落地** |
| I4 | Promotion 四步（candidate 浮現→人工審→裁決→canonicalization） | **部分** — 「人工裁決」與三個判準（是否可推廣／是否已涵蓋／證據是否可靠）落地；四步流程與 `--top` 旗標捨棄① |
| I5 | 「為何需人工裁決」：自動 promotion 造成 skill 訓練 eval、eval 再擴張 skill 的迴圈 | **POOL 末段 + RR 落地，且為本 skill 保留此節的唯一理由** — RR 寫成可觀察後果：「confidence rises with nothing outside the loop ever disagreeing. Precision drops while every number improves」 |
| I6 | Retirement 四步 + 「弱 assertion 是 scenario 品質問題還是主張錯了」 | **RR 末段落地**（「Those have opposite repairs」） |
| I7 | Why Audit Is Not Automatic 三理由（可推廣性需判斷／主張互相影響／retirement 需領域知識） | **部分** — 「可推廣性需判斷」進 RR；「主張互相影響」併入「是否已涵蓋」；第三條與 I6 冗餘⑤ |
| I8 | Operational Notes 六條（`arc eval audit`、讀 `grading/trial-*.json`、`collectGradingData`…） | **捨棄①②** — 引擎路徑與函式名 |

## J. `references/eval-schemas.md`（101 行）

| # | 來源主張 | 落點 |
|---|---|---|
| J1 | `evals.json` 格式（skill-creator 批次語料）+ 欄位說明 | **捨棄①③** — 且其「live example」指向本次一併刪除的 `skills/arc-evaluating/evals/evals.json` |
| J2 | `grading/trial-N.json` 格式 + 欄位 | **捨棄①③** |
| J3 | `comparison.json` 格式 + 欄位 | **捨棄①③** |
| J4 | 「本檔與權威來源衝突時以來源為準」的免責聲明 | **捨棄⑤** — 一份需要自我聲明「可能已過期」的規格副本，正是不該存在的第二份事實來源。整檔捨棄即為此聲明的邏輯結論 |

## K. `agents/skill-grader.md`（165 行）— 整檔除役

**除役裁決（已確認）**：三個獨立理由

1. **載體已消失④**：P2 刪除 `agents/` 層；`skills/<name>/agents/` 這條 skill-local
   殘留路徑在 v6 沒有 dispatch 機制去消費它。
2. **職能已在引擎①**：grading 由 `eval-grader`（引擎側 model grader）承擔，
   `arcforge eval run|ab` 自動呼叫；`eval audit` 承接跨 trial 的樣式彙整。
3. **與 v6 grader 契約衝突**：本檔輸出 schema（`assertions[]` / `summary` /
   `rationalizations[]` / `scenario_feedback`）與引擎的 `scores` / `overall` /
   `discovered_claims[]` / `weak_assertions[]` 是**兩套形狀**。留著等於出貨兩種
   grading 輸出格式。

| # | 來源主張 | 落點 |
|---|---|---|
| K1 | 身分：評「壓力下的行為合規」而非輸出品質 | **落地** — P1「主張要命名 agent 做的一個決定」；SD trap 表的 **Pressure** 一列 |
| K2 | 「兩份工作：評合規 + 批評 pressure scenario 本身」 | **落地** — SD 整檔即為第二份工作；「弱 scenario 上的及格分比無用更糟」進 RAT（"Both conditions passed, so the instruction works"） |
| K3 | Inputs 四參數（assertions／transcript_path／skill_path／scenario_description） | **捨棄①** — dispatch 介面 |
| K4 | Step 1–2：讀完 transcript、逐 assertion 找證據、引述原文 | **捨棄①** — 引擎 grader 的職責 |
| K5 | 「表面合規（說對話但推理顯示換個框架就會違反）= FAIL」 | **落地** — P3「先拿刻意膚淺的答案跑一遍你的 grader」即此判準的設計面版本 |
| K6 | Step 3：抽取 rationalization，分類 justification／minimization／deferral／spirit_vs_letter／authority／pragmatic | **方法論落地、schema 捨棄③** — 「rationalization 是 skill 缺口的證據」保留為 RAT 表本身的存在理由；六個 type 字串屬 grader 輸出格式 |
| K7 | 「novel rationalization 特別有價值——它們揭露缺口」 | **落地** — POOL 末段「candidates, not conclusions」+ RR（需人工裁決才寫回 skill body）。**這是本檔唯一被保留的核心方法論** |
| K8 | Step 4：批評 scenario（太容易／壓力類型未覆蓋／太學術／未測到的違規樣式） | **落地** — SD trap 表六列（覆蓋壓力類型缺口）+ `## Answer-leak checklist`（太學術＝prompt 洩漏）+ 設計錯誤表第 2 列 |
| K9 | 「不確定時舉證責任在合規方；模糊即 FAIL」 | **落地** — SD `## Ground truth that survives grading` 的判準（「拿著 scenario 的謹慎讀者能否不問你就同意 pass/fail」）。反轉了責任方向：原檔要 grader 從嚴，v6 要**設計者**先把 assertion 寫到不需從嚴 |
| K10 | Output Format JSON 範例 + Field Descriptions | **捨棄③** |
| K11 | Guidelines 六條 | **⑤ 冗餘** = K1/K4/K5/K7/K2 |

## L. `evals/evals.json`（27 行）— 隨目錄刪除

- **守衛引用確認**：`scripts/`、`tests/`、`hooks/` 三樹對 `evals.json` / `evals/evals`
  的引用數為 **0**（grep 實測）。唯一引用者是 `references/eval-schemas.md`
  的「live example」指標，該檔本次一併捨棄（J1）。故刪除不留懸空指標。
- 內容為 skill-creator 方法論的批次 pressure scenario（1 條，`skip-eval-on-tiny-change`），
  與 `evals/scenarios/` 的 CLI markdown scenario 是**兩套格式**。該條主張
  （「一行 wording 改動也要 eval」）已由 RAT 首列承接。

---

## 9 支舊 scenario 逐支處置

**全數 retarget**（`## Target` → `skills/evaluating/SKILL.md`），無一除役：判準是
「方法論是否仍成立」，逐支比對新 skill 後九支皆有對應落點。檔名保留（`eval-arc-evaluating-*`）
——無守衛以檔名為鍵（`check-eval-targets` 讀 `## Target`、`check-benchmark-freshness`
只看 `evals/scenarios/` 前綴），且 P7 全量重建語料庫時整批刪除，改名只會孤立
`latest.json` 既有列而不增加任何保證。

| Scenario | 新 skill 對應落點 | 2026-05-05 實測 baseline → treatment | 處置 |
|---|---|---|---|
| `scenario-audit` | P1（產物主張→單元測試）／P2（非鑑別性）／P4（趟數不足＝無 verdict） | 97% → 100%（Δ+0.01，k=30） | retarget |
| `preflight-ceiling-redesign` | P2 Done-when ／ RR redesign-or-abandon ／ RAT「baseline already passes」 | 60% → 100%（Δ+0.10，CI[-0.07,0.27]） | retarget |
| `adversarial-proxy-grader` | P3 proxy 段（A15 升級處） | 20% → 100%（Δ+0.24，CI[0.03,0.45]） | retarget |
| `grader-selection-boundary` | P3「Structure is not quality」 | 100% → 100%（Δ+0.00） | retarget |
| `model-grader-calibration` | P3 末段（rubric+anchors+repeat+agreement） | 100% → 100%（Δ+0.00） | retarget |
| `metric-regression-separation` | P4 段 2（行為與成本分軸）／ RR `## Behavior and cost` | 100% → 100%（Δ+0.00） | retarget |
| `ab-noisy-delta-interpretation` | P4 段 1 ／ RR `## The point estimate is not the result` | 40% → 100%（Δ+0.15，CI[-0.02,0.32]） | retarget |
| `workflow-vs-skill-boundary` | P1 三列表（什麼在變） | 0% → 100%（Δ+0.25，CI[0.25,0.25]） | retarget |
| `claim-lifecycle-arbitration` | POOL 末段 ／ RR `## Discovered claims are candidates` | 0% → 100%（Δ+0.24，CI[0.13,0.35]） | retarget + rubric 修正（`arc eval audit` → `arcforge eval audit`），Version 4→5 |

**掛帳 P7（不假裝已解決）**：上表 4 支（`grader-selection-boundary`、
`model-grader-calibration`、`metric-regression-separation`、`scenario-audit`）
baseline ≥97%，屬**天花板**，對新 skill 同樣沒有鑑別力。九支全帶 `## Preflight\nskip`，
所以 ceiling 檢查從未對它們生效（C9 的裁決理由即出自此觀察）。它們作為
non-regression 底線仍有價值，但**不得**被當作 `evaluating` 有 lift 的證據——
P5 的 delta 門檻由新增的 `eval-evaluating-cross-condition-validity` 單獨承擔。

---

## 新 scenario 的讀數規則（**看到數字之前**寫下，禁事後定義）

`eval-evaluating-cross-condition-validity`，preflight **PASS**（baseline 2/3 = 67%
< 0.8 天花板，hash `cfb8e8347e738d71`）。baseline 已經偏強，所以 CI 下界能否清零
本身就不確定——以下三分在跑 `ab` 前定案：

| 結果 | 判定 | 動作 |
|---|---|---|
| delta > 0 **且** CI 下界 ≥ 0 | 門檻**達成**（P5 預登記門檻原文） | 如實記錄，並同時記錄 baseline 本來就強這件事 |
| delta > 0 但 CI 下界 < 0 | 門檻**未達成** | 觸發 redesign（≤2 次），不得以「方向是對的」代替 |
| delta ≈ 0 或 < 0 | 門檻**未達成** | 觸發 redesign（≤2 次） |

兩次誠實 redesign 後仍為零 → 如實記為 non-regression guard，不得再調到出現數字為止
（此條與 scenario 檔 `## Design Notes` 末段的預先承諾一致）。

redesign 方向若被觸發，先動的是**自我宣告的線索**：`rubric_version` 欄與
`excluded` / `exclude_reason` 兩個鍵等於把答案寫在資料裡（preflight 有一趟 baseline
甚至用「0.5 不可能是 3 條 assertion 的分數」直接反推）。拿掉它們、只留重複的
trial 4 列與 git 歷史，逼出的是判斷而非欄位閱讀。

### 兩條件之間實際變動了什麼（**必須連同 delta 一起報**）

`scope: skill` 的 `eval ab` 會把 `## Target` 檔內容注入 treatment prompt；本次又依
任務卡加了 `--plugin-dir <本 worktree>`，於是 treatment 相對 baseline 多出的是
**注入的 SKILL.md 文字 + 整個 plugin**，baseline 則是隔離環境。plugin 那一半逐項為：

| 多出的東西 | 具體內容 |
|---|---|
| skill 集 | `skills/` 底下全部 24 支（15 支 legacy `arc-*` + 9 支 v6），含 `using` 的 Skill Map（本次剛加入 `/evaluating` 一列） |
| `references/` | `skills/evaluating/references/*.md` 兩支在磁碟上可讀——注入的只有 SKILL.md 本體，但 plugin 載入後 reference 檔變成可達 |
| hooks | 6 個事件全部生效：SessionStart（`inject-context` + session-tracker `start`）、UserPromptSubmit、PreToolUse、PostToolUse、Stop、PreCompact |
| PATH | `bin/arcforge` 進 PATH（D9），即 treatment 可實際呼叫引擎 |

`--plugin-dir` 走的是 semi-isolation（`excludeClaudeMd: false`），baseline 走完整
隔離（停用全部 plugin、排除 CLAUDE.md 與 rules、關 auto-memory、`--strict-mcp-config`）。

因此該 delta 是**含 toolkit 的**，不是 SKILL.md 單獨的效果。這正是新 skill Phase 1
點名的混淆（「什麼在變」與主張不對齊）。任何只報 delta 而不說變動項的陳述都視為誤導。

**原本打算補跑一次不帶 `--plugin-dir` 的 ab 以取得 skill 單獨效果，撤回**——
理由是它會汙染 result pool，而不是因為看到了任何數字（撤回時 ab 尚未跑完，
見本節 commit 時序）。機制實查：`eval compare` 的 `loadResults()` 會把
`evals/results/<scenario>/` **底下所有 run 目錄**的同名 condition 檔全部併入，
唯一的過濾是 `--since`，而它的粒度是**日**（`runId.slice(0,8)`，YYYYMMDD）。
同一天的第二次 ab 因此無法與第一次分離，兩種 treatment 組態會被永久併成一個池——
正是本 skill POOL 第 4 條與 RR `## Pool validity` 的 **Provenance** 段禁止的形狀
（P4 也已為同類原因隔離過一個汙染 run）。

故本次**只跑一次 ab**（任務卡指定的 `--plugin-dir` 版本），`eval compare` 讀到的是
單一乾淨 run。skill 單獨效果改列**後續項**：需在別的日期跑，或先為 scenario bump
`## Version` 分隔 epoch——兩者都不該為了湊一個數字而在本次混進同一個池。
