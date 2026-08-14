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
