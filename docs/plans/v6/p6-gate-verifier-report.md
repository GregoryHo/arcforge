# P6 phase gate — 獨立 verifier 判詞

> Fresh-context verifier，未參與 P6 實作。分支 `v6-p6-workflow` @ `64446f7`。
> 原則：機械宣稱一律親自重跑；行為數字一律自 `evals/results/` 原始 JSONL 重算。
> 轉述不採信——本檔每一格都對應一次 verifier 自己執行的命令。

## 0. 預登記完整性（先驗查）

門檻寫死於 `79e2b2c`（2026-08-14 17:42:55 +0800，P6 開跑同日）。verifier 對
`79e2b2c:docs/plans/v6/progress.md` 與 HEAD 逐字 diff「預登記行為門檻」整節：
**IDENTICAL** — 六條門檻自開跑後未被改動一字。事後定義門檻的嫌疑排除。

## 1. 機械 AC（逐項親自重跑）

| # | AC | 命令／方法 | 結果 |
|---|---|---|---|
| M1 | `npm test` 5 runner | `npm test` | **PASS**（exit 0；pytest 192 passed／node 16 passed） |
| M2 | 5 check 全綠 | 逐條 `npm run check:<c>` | **PASS** ×5（versions／docs／cli-consumers／hooks／eval-targets） |
| M3 | skill 目錄數 == 15 | `ls -d skills/*/ \| wc -l` | **15** ✓ |
| M4 | legacy-skills.json 清空 | `node -e ...legacy.length` | **0** ✓（P6 清空承諾兌現） |
| M5 | router bijection 14 列 ↔ 15 支 | 親自數 `skills/using/SKILL.md` Skill Map | **14 列**；第 15 支 = `using` 本身（router，自身不列）✓ |
| M6 | ROUTER_SKILL 單一來源 | 4× mutation，見下 | **PASS**（負向驗證由 verifier 自證，非採信 Track C 報告） |
| M7 | `git grep arc-finishing -- skills/` | 同命令 | **0** ✓ |
| M8 | 4 新 skill + 合併後 sessions 過 pytest 全規則 | `pytest --collect-only` 列舉 | 15 支全數被收集並受檢；14 skipped 係 cross-ref 參數化案例、**非 skill 層跳過** ✓ |
| M9 | invocation-table 四列落地 + 預填表收束 | 讀 `decisions/invocation-table.md` | 四列皆有完整重推導；預填表明載全數收束 ✓ |

### M6 — ROUTER_SKILL mutation 覆核（verifier 親自執行）

`tests/router-skill.json` 是唯一來源，jest（`router-contract.test.js:31`）與
pytest（`test_skill_structure.py:30`）皆讀它。四次 mutation，每次改完即復原：

| Mutation | jest | pytest |
|---|---|---|
| `router_skill` → `finishing` | **RED** | **RED** |
| `skill_map_heading` → 偽標題 | **RED** | **RED** |
| Skill Map 插入不存在的 `/ghost-skill` 列 | **RED** | — |
| Skill Map 刪去 `/looping` 列 | **RED** | — |

四次全紅：單一來源確實同時武裝雙 runner，且 bijection 兩個方向（滿射／單射）
皆可證偽。復原後 `git diff --quiet` 確認工作樹乾淨。

## 2. 行為門檻（逐條）

| 門檻 | 判定 | 證據指標（verifier 自證） |
|---|---|---|
| 1 觸發矩陣 ≥80% | **MET** | **verifier 獨立重跑 A 面全 45 trial**：15/15 列 = **100%**，寬鬆與嚴格計分皆 100% |
| 2 looping e2e（binary） | **MET** | verifier 親自重跑 `tests/e2e/loop-probe.sh` **兩次**，預登要件全 PASS（見 §2.2） |
| 3 新四支 delta>0 且 CI 下界 ≥0 | **2 MET／2 unmet-but-covered** | brainstorming、looping MET；dispatching、executing 依逃生條款 |
| 4 sessions⊕compacting 再驗 | **MET** | sessions post-merge 單獨 +0.234 CI[0.13,0.34]；compacting non-reg PASS |
| 5 回歸 | **MET** | `git diff gate-p5..HEAD` 對九支未動 skill **輸出全空** |
| 6 量測紀律 | **MET（證據面）** | 全部 run dir 落在主 repo（非 agent worktree）；無 P5 式死池 |

### 2.1 門檻 1 — 不採信謄錄，verifier 全額重跑

耐久紀錄（`p6-gate-probes-evidence.md` §1）記 A 面 15/15。但原始 90 個 trial
輸出存於 session scratchpad（短命），且儀器第 79 行的命中判準是
`grep -qF`（寬鬆：只驗正確 token 在場，散彈式多名並列亦算命中）。
**謄錄 + 寬鬆判準 + 原始資料已消失 = 此門檻無法以閱讀覆核。** 故 verifier 重跑。

- 範圍：A 面（預登記指定的 gate 面；B 面為診斷，不 gate）15 列 × k=3 = **45 trial**
- 儀器：verifier 自寫腳本，**不改動 repo 儀器**，原始輸出全數落 `/tmp/verifier-matrix/out`
- 結果：**45/45 trial 皆為單一 token 精確答案**，無一散彈

| 計分法 | 結果 | 門檻 |
|---|---|---|
| 寬鬆（repo 儀器判準） | 15/15 = **100%** | 80% |
| **嚴格**（含正確 token 且不含任何第二個 skill token） | 15/15 = **100%** | 80% |

兩種計分同值 → **寬鬆 grep 的缺陷在本資料上不具實質影響**，此結論出自 verifier
自己的資料而非謄錄。儀器亦確實實作預登記定義（列命中 = ≥2/3，總命中率 =
通過列/15），無 gate 定義偷換。

**情境是否引用 skill 措辭**：`router-matrix.tsv` commit `892b53f` 於
08-14 17:49，四支新 skill 的 description 落於 17:56–18:25 —— 情境**結構上不可能**
引用新 description 措辭，設計聲稱成立。情境文本亦無 skill 名稱 token。
敏感度：即令把領域詞最接近技能名的三列（`/learning` 學習系統、`/writing-skills`
寫一個新的 skill、`/diagramming-obsidian` 畫圖入 vault）全判為 0，仍 12/15 = 80%
達標；折損第四列才會跌破。折損閾值如實記錄。

### 2.2 門檻 2 — 亦親自重跑（未採信謄錄）

`tests/e2e/loop-probe.sh` 為硬斷言腳本（首個失敗即 exit≠0）。verifier 親自重跑，
**預登記的每一項要件皆 PASS**：

```
0. Guards and preflight            PASS  (isolated)
1. Fixture (2-task D3 list)        PASS  (T1、T2 pending，已 commit)
2. Phase A — --max-runs 1          PASS  (1 iteration, status max_runs, finished_at stamped)
                                   PASS  (T1 [x]、T2 仍 pending —— 清單就地更新)
                                   PASS  (T1 工作落地；T2 未動)
3. Phase B — resume, --max-runs 5  PASS  (累計 3 iterations, 兩任務各完成一次, status complete)
                                   PASS  (清單全勾)
                                   PASS  (T2 工作落地)
```

對照預登門檻 2 逐項：**≥2 輪迭代**（累計 3 ✓）、**兩個 stop condition 正確停止**
（`max_runs` → `complete`，走不同代碼路徑 ✓）、**檔案面證據**（loop state 欄位 +
任務勾選就地更新 ✓）。**門檻 2 = MET。**

**步驟 4（隔離檢查）在 verifier 首跑報 FAIL——肇因是 verifier 自己。** 該步比對
probe 前後的 `git status --porcelain`；verifier 在 probe 執行期間把本報告檔寫進
repo，diff 精確指出唯一變更：

```
0a1
> ?? docs/plans/v6/p6-gate-verifier-report.md
```

三點須說清楚：
1. **這不是 loop 缺陷，也不是 probe 缺陷**，是 verifier 的操作汙染；
2. **隔離檢查不在預登門檻 2 的文字內**（預登只要求迭代數、stop condition、
   檔案面證據），屬 probe 自帶的衛生檢查，非 gate 要件；
3. **這反而是對該 probe 的一次免費 mutation 驗證**——lead 原本准許此腳本「可讀
   不必重跑」，而多數 e2e 的「未觸及外部」斷言從未被觸發過，綠燈不證明它有效。
   本次它**確實對一個真實變更發火並精準指名該檔**，證明該斷言非空洞。

**第二次重跑（報告檔已在基線快照內，執行期間未動 repo）：全部四步 PASS，
`EXIT=0`**，含步驟 4「arcforge repo 與 ~/.arcforge 皆未觸碰」。兩次重跑的
行為數字逐項相同（phase A 1 iteration、累計 3、`max_runs` → `complete`、
completed `T1,T2`），確認 probe 具決定性，且首跑步驟 4 的 FAIL 已明確歸因於
verifier 汙染而非受測物。

### 2.4 靜態 check 的可證偽性（防「空洞檢查」）

P5 曾抓到一個恆真的檢查（`npm pack | grep -c .venv` 因清單走 stderr 而恆為 0）。
本次對承載 verifier 自身結論的 `check:eval-targets` 補做 mutation：把某 scenario
的 `## Target` 指向不存在的 `skills/does-not-exist/SKILL.md` →
**check 轉紅（可證偽）**，復原後乾淨。故 §1 M2 的「綠」對此檢查而言有實質意義，
偏離 h 的「4 scenario retarget 已解析」為真實驗證而非空洞綠燈。

### 2.3 門檻 3／4 — 自原始 JSONL 重算

以 repo 自身 `scripts/lib/eval-stats.js`（`ciForDelta`／`computeDelta`／
`verdictFromDeltaCI`）與 verifier 獨立實作的 Welch-t 雙路計算，兩者逐位元一致。

| Scenario | 池 | baseline | treatment | delta | CI | verdict | 門檻 |
|---|---|---|---|---|---|---|---|
| brainstorming | `20260814-123604` k=5/5，0 void | 0.4500 | 0.9500 | **+0.5000** | **[0.24, 0.76]** | IMPROVED | **MET** |
| looping | 合池 `142207`+`150603`，b=9 有效/1 void，t=10 | 0.7767 | 0.9670 | **+0.1903** | **[0.07, 0.31]** | IMPROVED | **MET** |
| executing | `20260814-151252` k=10/10 | 0.9000 | 1.0000 | +0.1000 | [−0.13, 0.33] | INCONCLUSIVE | unmet-but-covered |
| dispatching | 無 ab（v2 preflight 3/3 天花板） | — | — | — | — | — | unmet-but-covered |
| sessions（post-merge 單看） | `20260814-131808` k=5/5，0 void | 0.7660 | 1.0000 | **+0.2340** | **[0.13, 0.34]** | IMPROVED | **MET** |
| sessions（合池 P4+P6） | b=14 有效/1 void，t=10 有效/**5 void** | 0.7121 | 1.0000 | +0.2879 | [0.18, 0.40] | IMPROVED | 補充 |
| compacting | `20260814-134048` k=5/5 | 0.9600 | 1.0000 | +0.0400 | [−0.07, 0.15] | **non-reg PASS** | **MET** |

**所有落帳數字逐項重現，無一有出入。**

## 3. 偏離 a–h 逐項裁定

### a. trial timeout 600→900s（`e20abb7`）— **接受**

儀器修正，與 P4 的 300→600 同 lineage（commit 本文自陳）。時序親驗：修正
08-14 20:35(+0800) = 12:35 UTC，brainstorming 重跑首 trial 12:36:04 UTC —— 重跑
**全程在新天花板下**，未跨儀器邊界。舊池未混入（見 b）。殘留風險：跨 scenario
比較若橫跨此修正則不可直接對齊；本 phase 無此類比較。

### b. brainstorming 首輪池隔離 — **接受，且方向對量測不利（保守）**

親驗：`evals/results/eval-brainstorming-.../20260814-103919/` 僅含 3 份
transcript（k=3 preflight），**遭隔離的 ab 輪確實不在 `evals/results/`**——
「隔離至 session scratchpad」屬實，非留在池中悄悄不計。計分池
`20260814-123604` 為 5/5 有效、**0 void、0 ETIMEDOUT**。
方向查核：被削斷的 transcript 計分必然偏低 → 留下會**拉低 baseline、灌大
delta**；捨棄是保守方向而非有利方向。P4 缺陷 A 同類第三例，儀器面已修。

### c. dispatching redesign 1/2 即止步 — **成立（verifier 親自覆核預登診斷）**

止步依據不是 quota，而是 scenario 檔內**寫於量測之前**的決策規則。時序親驗：
v2 scenario commit `eca2a85` 於 08-14 21:05(+0800) = **13:05 UTC**，v2 preflight
run `20260814-131523` = **13:15 UTC** —— 診斷早於量測 10 分鐘，預登記成立。

預登記規則（scenario「The expected baseline route, pre-registered」節）：
- baseline 若**引用迴圈內的 early return／`ok !== false`** → tell 洩在 diff 裡，
  redesign 2 有具體槓桿（把 `ok`/`error` 映射移出迴圈體）
- baseline 若**自 `src/jobs.js` 到達** → 正當路徑，agent 本就會追失敗慣例，
  本 scenario 降為 non-regression guard

verifier 親讀三份 baseline transcript：

| trial | 到達路徑 | 原文證據 |
|---|---|---|
| trial-1 | `src/jobs.js` | 「A job that fails the way THIS PROJECT's job factories fail: returns {ok:false}」；結論引 `src/jobs.js` 的回傳慣例 |
| trial-2 | `src/jobs.js` | 「A real project job that fails the way `src/jobs.js` says failures are reported: it RETURNS `{ok:false}`, it does not throw」 |
| trial-3 | `src/jobs.js` | 「`src/jobs.js:3-4` documents *the* failure channel」 |

**3/3 皆走正當路徑（route 2），無一以 diff 側 tell 破題。** 依預登規則，
redesign 2 的具名槓桿（移走 diff 側 tell）**對此無目標**——它要遮蔽的東西
baseline 根本沒用到。止步成立，且必須記為**未達成**（已如此記，coverage 檔
line 418）。preflight 3/3 天花板亦親驗（grading trial-1..3 全 score=1）。
先例對齊：P5 `evaluating` 正是同形狀（preflight BLOCK → 逃生條款 → unmet-but-covered），
預登文字「redesign ≤2 仍不達」為上限而非須用罄之配額。

### d. executing preflight 重擲一次 — **在本案接受，但須把規則寫死**

三點使本次重擲無害：
1. **理由預先書面化**（當時信念 p≈0.4，3/3 機率 6.4%），非事後補述；
2. **ab 兩臂獨立重抽**，證據不繼承 preflight 樣本；
3. **最終判為未達成**——重擲只換到「繼續量測」，不可能製造出通過。

反諷且誠實的一點：ab baseline 回來 9/10 = 90%，**反證了當時 p≈0.4 的信念**，
即 roll-1 的 3/3 BLOCK 很可能本來就是對的。coverage 檔已如實記此非平穩性
（2/5 → 3/3 → 9/10，trial 內容逐位元同）。
但**作為通則這是對 gate 的 optional stopping**：若某次重擲後結果轉正，同一
程序就會產出無法辯護的通過。故必須在 P7 把重擲政策寫死（事前宣告或抬高
preflight k），不得留作個案判斷。

### e. looping 同日同版合池 — **成立（親驗未跨 redesign 邊界）**

此裁定**是結果決定性的**，不是形式問題：兩 run 單看皆不達門檻——
`142207` 因 baseline 有效 n=4（<5）判 INSUFFICIENT_DATA；`150603` 為
+0.102 CI[−0.10, 0.30] INCONCLUSIVE。合池才 IMPROVED。故必須驗邊界：

- v2 redesign commit：`05c05e1` 21:38、`c4ee273` 21:41 (+0800) = **13:38／13:41 UTC**
- 兩 pooled run：`142207` = **14:22–14:59 UTC**、`150603` = **15:06–15:43 UTC**
- 兩者之間（13:41 UTC 之後）**無任何 commit 觸及 `skills/looping/` 或該 scenario**

→ 同儀器、同 skill 版本、同條件、同日，僅補足有效 n。與「跨 treatment 混池」
性質不同，**接受**。附讀法約束：耐久紀錄須註明合池是達標的必要條件，
不得讓讀者以為任一單 run 即達標。

### f. sessions treatment 池跨 P4/P6 — **接受，但應改以 post-merge 單看為主述**

親驗池組成，發現一項落帳未言明的事實：合池 treatment 15 筆中**有 5 筆全 void**
（`20260801-064430` 該臂 5/5 皆 gradeError），有效 treatment 實為 10 筆；
合池 baseline 則含 P4 的三筆低分（0.33／0.33／0.5），把 baseline 均值自
0.766 拉到 0.712 —— **合池方向對主張有利**（delta 由 +0.234 膨脹至 +0.288）。

但此爭點無須裁決即可消解：門檻 4 對 sessions 的預登文字是
**「delta ≥ 0（非退化）」**，比門檻 3 寬。post-merge 單一 run（`20260814-131808`，
5/5 有效、0 void）自身即 **+0.2340 CI[0.13, 0.34] IMPROVED**，遠超「≥0」。
**故 gate 以最乾淨的讀法即已通過，合池非必要。** 要求：耐久紀錄改以
post-merge 數字為主述，+0.29 降為補充，並註明合池 treatment 的 5 筆 void。

### g. 合併裁決 18→15 全兌現 — **成立**

18（預填，`completion-evidence` 不計）− `worktrees`→`dispatching` − `compacting`→`sessions`
− `task-list`→`executing` = **15**，與 `ls -d skills/*/ | wc -l` == 15 對齊。
預填表三列皆已關閉並註記去向。**惟**「已知張力」節仍停在進行式（見 §4 缺陷 2）。

### h. arc-using 刪除（`e015f53`）— **成立**

刪 `skills/arc-using/`（99+37 行）、ratchet 剪 1、4 支 scenario `## Target`
retarget 至 `skills/using`，README 與 skills-reference 同步。`check:eval-targets`
親驗綠。scenario 檔名仍帶 `arc-using` 字樣，coverage 檔已聲明 P7 整體重建時
一併處理——屬已知且已掛帳，非遺漏。

## 4. verifier 發現的缺陷（皆不阻擋 gate，但須於 tag 前修正）

### 缺陷 1 — 耐久紀錄不實：compacting「史上第一筆成功 A/B」為假 ⚠️

`evals/skill-eval-coverage.md:918` 寫：
> first successful A/B on record for this scenario (all pre-merge attempts aborted before trials)

親驗四筆 run：

| run | baseline | treatment | void | 狀態 |
|---|---|---|---|---|
| `20260801-064746` | [1,0,0,0,0] | [0×5] | b=4 t=5 | 中止 |
| `20260801-065349` | [0×5] | [0×5] | b=5 t=5 | 中止 |
| **`20260813-023618`** | **[1,1,1,0.8,1] = 0.96** | **[1×5] = 1.00** | **0** | **乾淨成功的 A/B** |
| `20260814-134048` | [1,1,1,1,0.8] = 0.96 | [1×5] = 1.00 | 0 | 乾淨成功的 A/B |

`20260813-023618` 是一筆完整有效的 pre-merge A/B，**該括號內宣稱為假**。
這正是 P5 首驗 FAIL 的 F1 類別（耐久紀錄與事實不符），故必須改。
**但更正方向對 P6 有利**：pre-merge 0.96→1.00 與 post-merge 0.96→1.00 **數字全同**，
這是比「首次成功」強得多的非退化證據——合併前後行為逐格一致。應改寫為此。

### 缺陷 2 — `decisions/invocation-table.md`「已知張力」節停在進行式

該節仍寫「**P6 收斂進行中**……兩者兌現後本表 18 → 16，其餘缺口由 P6 其他
track 的合併裁決收束」。P6 已收束且答案是 15（第三個 −1 為 task-list）。
資訊在同檔上方的收束註記中已存在，但本節未結案。須改為已結案並寫明 18→15。

### 缺陷 3 — P5 掛帳 P6 的 router 重疊項未處理

`progress.md:79` 把兩件事掛給 P6：（i）`/tdd` 與 `/finishing` 在「實作完成但無測試」
狀態重疊、表無優先序；（ii）ROUTER_SKILL 雙處硬編。
（ii）已完成（`tests/router-skill.json`，verifier 已 mutation 覆核）。
（i）**未完成**：P6 任務卡的 orchestrator 列明寫「14 列 + tdd/finishing/debugging
重疊優先序註記」，但 `skills/using/SKILL.md` 全文 40 行內**無任何優先序註記**，
且 `/finishing` 列自 gate-p5 起逐字未改。
風險評估：低——矩陣 row1（`/tdd`）與 row4（`/finishing`）在 verifier 自己的
重跑中皆 3/3，但**兩列都沒有探測那個重疊態本身**，所以「低風險」是推論而非量測。
處置：tag 前補一行註記，或明文改掛 P7 並記為未處理。不得靜默略過。

### 缺陷 4 — P7 掛帳清單缺三項

現況只有「天花板家族 skill 價值重估」明文掛帳（coverage line 418、665）。
以下三項散見於行文但未進掛帳清單，須補列：

| 應補掛帳項 | 現況 |
|---|---|
| **preflight 重擲政策**（k=3 隨機閘的 optional stopping） | 僅在 executing 節記為「procedural note」，未成 P7 待辦 |
| **grader void 根因**（looping `142207` baseline trial-3 `gradeError`；sessions `064430` treatment 5/5 全 void） | 僅在數字旁註記 n，未追根因 |
| **900s trial 天花板複審** | 僅記於 brainstorming 列；天花板連抬兩次（300→600→900）本身是訊號，須複審是否掩蓋真實遲滯 |

## 5. 重跑實錄（verifier 親自執行者）

| 動作 | 結果 |
|---|---|
| `npm test` | exit 0 |
| `npm run check:{versions,docs,cli-consumers,hooks,eval-targets}` | 5×PASS |
| ROUTER_SKILL mutation ×4 | 4×RED（雙 runner），復原乾淨 |
| `check:eval-targets` mutation ×1 | RED（可證偽，非空洞綠燈），復原乾淨 |
| 觸發矩陣 A 面 45 trial 重跑 | 15/15 = 100%（寬鬆與嚴格同值） |
| `loop-probe.sh` 重跑 ×2 | 首跑步驟 0–3 全 PASS（步驟 4 因 verifier 汙染 FAIL）；**次跑四步全 PASS，EXIT=0** |
| 原始 JSONL 重算 ×7 池 | 與落帳逐項一致 |
| `git diff gate-p5..HEAD -- <9 支未動 skill>` | 空 |
| P6 全部 run 的 `trialDir` 路徑 | 皆為主 repo `.eval-trials/`，無 agent worktree（門檻 6 佐證） |

### 交接註記（給執行 tag 的人）

判詞產出時工作樹為 dirty：本檔 `docs/plans/v6/p6-gate-verifier-report.md` 為
untracked。`gate-p6` 開 tag 前應先 commit 本檔（連同 §4 四項缺陷的修正）。

## 6. 判定

六條預登記門檻：**1 MET（verifier 全額重跑）、2 MET（verifier 重跑）、
3 兩達成兩依逃生條款如實記為未達成、4 MET（以最乾淨讀法）、5 MET、6 MET**。
PLAN 的 P6 機械 AC 九項全綠，皆由 verifier 親自重跑。
偏離 a–h **八項全部成立**，其中 c、e 兩項為結果決定性、已逐一以原始證據覆核。
所有落帳行為數字自原始 JSONL 重算**無一出入**。

四項缺陷皆為**耐久紀錄與掛帳面**問題，無一動搖任何門檻結論。與 P5 首驗 FAIL 的
F1 須明確區分：F1 是耐久紀錄**與 gate 主張相矛盾**（照紀錄讀會得出「未達成」），
本次四項皆非——每一條 gate 主張都由 verifier 自原始資料獨立重現。缺陷 1 屬
「附帶史實不實」，方向上甚至對 P6 有利（更正後非退化證據更強）。
故判 **PASS**，但缺陷 1 與缺陷 3 必須於 tag `gate-p6` 前落地，缺陷 2、4 隨同修。

**Final verdict: PASS**

補救動作（tag 前）：
1. 修 `evals/skill-eval-coverage.md:918` 的「first successful A/B on record」不實
   宣稱，改寫為 pre-merge `20260813-023618`（0.96→1.00）與 post-merge
   `20260814-134048`（0.96→1.00）數字全同的非退化論證。
2. 處理 `progress.md:79` 掛給 P6 的 router `/tdd`↔`/finishing` 重疊優先序——
   補註記或明文改掛 P7，不得靜默略過。
3. 結案 `decisions/invocation-table.md`「已知張力」節（18→15）。
4. P7 掛帳補三項：preflight 重擲政策、grader void 根因、900s 天花板複審。
5. 耐久紀錄讀法校正：looping 註明「合池為達標必要條件」；sessions 改以
   post-merge +0.234 CI[0.13,0.34] 為主述、註明合池 treatment 有 5 筆 void。
