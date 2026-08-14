# P6 gate — probe 證據謄錄（耐久載體）

> 兩個 probe 的原始輸出謄錄。執行者：orchestrator 主 session（P5 教訓：長時量測不掛
> subagent）。原始 work dir 在 session scratchpad（短命），本檔為耐久紀錄。
> 儀器：`tests/e2e/router-matrix-probe.sh` + `tests/e2e/router-matrix.tsv`、
> `tests/e2e/loop-probe.sh`（皆已入庫，可重跑覆核）。

## 1. 觸發矩陣（預登門檻 1：A 面 ≥ 80%）— **PASS 100%/100%**

15 情境列 × k=3 × 雙表面（A 面 = 注入 `skills/using/SKILL.md` 全文，gate 依據；
B 面 = 僅注入各 skill frontmatter name+description，觸發面診斷）。情境措辭寫於
P6 worker 產出新 description **之前**（結構上不可能引用 skill 措辭）。
`claude -p --disable-slash-commands --model sonnet --max-turns 1`。

```
row  1 /tdd                   A 3/3  B 3/3
row  2 /debugging             A 3/3  B 3/3
row  3 /code-review           A 3/3  B 3/3
row  4 /finishing             A 3/3  B 3/3
row  5 /sessions (handover)   A 3/3  B 3/3
row  6 /sessions (compaction) A 3/3  B 3/3
row  7 /learning              A 3/3  B 3/3
row  8 /evaluating            A 3/3  B 3/3
row  9 /maintaining-obsidian  A 3/3  B 3/3
row 10 /diagramming-obsidian  A 3/3  B 3/3
row 11 /writing-skills        A 3/3  B 3/3
row 12 /brainstorming         A 3/3  B 3/3
row 13 /executing             A 3/3  B 3/3
row 14 /dispatching           A 3/3  B 3/3
row 15 /looping               A 3/3  B 3/3

surface A (router map, gate): 15/15 = 100%  (threshold 80%)
surface B (descriptions, diagnostic): 15/15 = 100%
MATRIX: PASS   — 90/90 trials
```

散彈式回答抽查（防寬鬆 grep 假陽性）：抽 5 個 trial 原始輸出
（row1-A-t1、row6-A-t2、row14-B-t3、row15-A-t1、row8-B-t2），全部為**單一
token 回答**（如 `/tdd`），無多名並列。

### 1b. 優先序註記後的重量測（verifier 缺陷 3 補救）— **PASS 16/16**

verifier 指出 P5 掛帳的 `/tdd`↔`/finishing` 重疊優先序註記缺席。補救採「補註記
＋重量測」而非再掛帳：`skills/using/SKILL.md` 增 Precedence 段（紀律列優先於
收尾列；`/debugging` 未解釋 vs `/tdd` 已知要改什麼），`router-matrix.tsv` 增第
16 列**重疊態情境**（「功能被描述為已完成，但有回報 bug 且無測試」→ 期望
`/tdd`），全矩陣重跑：

```
surface A (router map, gate): 16/16 = 100%  (threshold 80%)  ← 含 row16 3/3
surface B (descriptions, diagnostic): 15/16 = 93%
```

出貨物與量測物重新對齊：A 面在含優先序註記的 router 上 100%，重疊態列本身
3/3。B 面唯一失分列為 `/debugging`（1/3）：「CI 測試昨天開始紅、原因未明」在
**只看 descriptions** 時 2/3 被 `/tdd` 吸走（其 description 的 "fix a bug"
外溢）；router 表在場時 3/3 正確。此為 description register 的 tdd/debugging
邊界問題，掛帳 P7，不影響 gate（B 面為診斷面，且 93% 仍逾 80%）。

## 2. loop e2e（預登門檻 2，binary）— **PASS**

`tests/e2e/loop-probe.sh`，隔離：`CLAUDE_PROJECT_DIR` + `ARCFORGE_HOME` 指向
拋棄式樹，未動 HOME。兩相位設計（兩個 stop condition 走不同代碼路徑，
單一 run 只能觀察其一）：

```
0. Guards and preflight            PASS  (isolated)
1. Fixture (2-task D3 list)        PASS  (T1、T2 pending，已 commit)
2. Phase A — --max-runs 1          PASS  (1 iteration, status max_runs, finished_at stamped)
                                   PASS  (T1 [x]、T2 仍 pending —— 清單就地更新)
                                   PASS  (T1 工作落地；T2 未動)
3. Phase B — resume, --max-runs 5  PASS  (累計 3 iterations, 兩任務各完成一次, status complete)
                                   PASS  (清單全勾)
                                   PASS  (T2 工作落地)
4. Nothing outside probe tree      PASS  (arcforge repo 與 ~/.arcforge 皆未觸碰)
迭代數：Phase A = 1，Phase B 後累計 = 3（≥2 ✓）
stop reasons：max_runs（A）→ complete（B）（兩種 stop condition 皆正確 ✓）
```

## 3. 執行紀律（預登門檻 6）

全部 preflight／ab／compare／probe 由 orchestrator 主 session 執行；worker 僅
交付 scenario 與 instrument（離線驗證）。無任何量測掛在 subagent 背景程序上。

---

# P6.5 gate — 載入 probe 證據（AC 1，orchestrator 執行）

儀器：spike 同法（`claude --plugin-dir <repo> --model haiku -p`，**中性 cwd**——repo 內
cwd 會讓 probe 讀到 `.claude/settings.json` 的 dev 停用設定並自行推理回空集，第一輪
實測踩到，改中性 cwd 後排除）。

## 模態 1 — model-invoked 可見面

```
SKILLS=arcforge:brainstorming,arcforge:code-review,arcforge:debugging,
arcforge:diagramming-obsidian,arcforge:dispatching,arcforge:evaluating,
arcforge:executing,arcforge:finishing,arcforge:maintaining-obsidian,
arcforge:sessions,arcforge:tdd,arcforge:using
```

12/12 model-invoked 全載入；識別字 `arcforge:<name>`，**零 bucket 段**（判定點 3 重驗）。

## 模態 2 — user-invoked 以 slash 呼叫實載

user-invoked（`disable-model-invocation: true`）不注入描述，模態 1 天然不可見——
以直接呼叫驗證：

```
/arcforge:writing-skills → LOADED=writing-skills
/arcforge:learning       → LOADED=arcforge:learning
/arcforge:looping        → LOADED=arcforge:looping
```

3/3 載入（LOADED 回應由注入的 skill 內容產生）。合計 **15/15 == 白名單**。

**數量閉合（verifier D3 補強）**：frontmatter 掃描恰好 3 支帶
`disable-model-invocation: true`（learning／looping／writing-skills），與模態 1
缺席的 3 支**完全同集**——15 − 3 = 12，零筆無法解釋的缺席。另一條獨立證據：
模態 2 的 slash 呼叫**解析成功本身**即證明識別字無 bucket 段——若識別字含
bucket 段，`/arcforge:<name>` 形式的呼叫會直接失敗。

## 負向 — deprecated 不載入

臨時樣本 `skills/deprecated/probe-zzz/`（**model-invoked 描述**——若載入必出現在
模態 1）：未出現於任何 probe 輸出 → deprecated bucket 不載入（判定點 2 重驗 +
「目錄項載入整個 bucket」在 15 支下重驗成立）。**Provenance 順序（verifier D4
補強）**：樣本於兩個模態執行期間全程在磁碟上（建立 → 模態 1 → 模態 2 → 移除），
「未出現」因此是有效的負向觀察；且此負向為佐證非主證——載入機制由 P0.0 spike
與 `plugin.json` 僅白名單 `./skills/core/` 獨立確立。樣本已移除。
