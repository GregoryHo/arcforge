# `diagramming-obsidian` 版面 reference 設計關卡（D-059 (iv)，#185）

**判定：MEASURABLE，只限「只交出座標計畫」的 task 形狀。** PLAN 描述的形狀（走 manual fallback 存檔）不可量，原因與 verify-exit 關卡相同：任何一次 `uv run` 都會把 `.venv` 寫進 staged 複本並中止 run。預算照 PLAN：preflight 3 + A/B 10，共 13 個 session。

本文件只閱讀程式，並在不啟動 session 的前提下執行引擎函式與 `git show`。行號以 `main` 的 `c1d2da73` 為準。

## 受測的變更

#182（`1fed56d0`，A3／A4）對 `skills/core/diagramming-obsidian/references/layout-heuristics.md` 的修改。以 `1fed56d0~1`（`53c7f088`）為舊版：

| 位置 | 舊 | 新（現行，`:16`、`:20`、`:167-168`） |
|---|---|---|
| 格線 | `Columns: x = 50, 250, 450, 650, 850, ... (200px increments)` | `x = 50, 270, 490, 710, 930, ... (220px increments)` |
| 格線說明 | 「This ensures minimum 40px gap between Primary-sized elements (180px wide, 200px column spacing = 20px gap on each side).」 | 「220px columns leave a 40px gap between Primary-sized elements (180px wide)」 |
| Part 2 預防 | 「x increments of 200px」「Leave 200px vertical gap between zone separator lines and the elements」 | 「220px」「at least 30px …, 60px where an arrow must cross the separator」 |

兩版都沒動的：間距表「Same-level shapes 40px」「Separator line to nearest element 30px」（現行 `:229-236`）、「Minimum 40px gap between shapes at the same hierarchy level」（`:162`）、Arrow Corridor「at least 60px between shapes」（`:64`）、Zone Layout Template（`:28-39`）。舊格線排 180 px 寬的元素會留下 20 px，與同一份檔案的 40 px 矛盾。

`layout-heuristics.md` 從 #182 之後沒有再改過（`git log --follow`）。#182 同時改了 `SKILL.md` 的一段（`:82-84`）與 `depth-enhancements.md`，那些不在本項範圍，兩臂都用現行版。

## 引擎事實

1. **兩臂文字相同、staged 檔案不同的 A/B 有支援。** `--baseline-skill-file` 指到另一個目錄裡的 `SKILL.md`，加 `--stage-skill-files`，baseline 的複本取自那個目錄（`scripts/cli/eval-skill-options.js:43-61`、`scripts/lib/eval-skill-staging.js:183-199`）。文字 hash 分不出兩臂，row 與 pool 靠目錄 digest：每臂記 `skillFilesHash`，兩臂都記 `baselineSkillFilesHash`，後者是 pool 條件，也在 preflight 的鍵裡（`scripts/lib/eval-trial.js:171-179`、`scripts/lib/eval-pools.js:29-39`、`scripts/lib/eval-preflight.js:98-100`）。
2. **離線組出 baseline 目錄並算過鍵。** `git archive HEAD skills/core/diagramming-obsidian` 解開後，把 `references/layout-heuristics.md` 換成 `git show 1fed56d0~1:…` 的內容；`diff -rq` 與現行目錄只差這一個檔案。`readBaselineSkill(…, stage=true)` 回報文字 hash `51fe7cc9f5373b7e`（與現行版相同）、目錄 digest `0f3c574c1e448946`；現行目錄的 digest 是 `42ec93e5d9d42cec`。ceiling 設 1800000 時 preflight 紀錄檔名是 `<hash>-opus_1m_-exhigh-c1800000-b51fe7cc9f5373b7e-s0f3c574c1e448946.json`。digest 涵蓋路徑、可執行位元與內容，不含時間戳（`eval-skill-staging.js:53-77`）。
3. **在 staged 的 `references/` 執行 `uv` 會中止 run，兩臂皆然。** uv 0.10.11 在該目錄建立 `.venv`（在 scratch 複本實測）；write guard 不跳過 `.venv`（`scripts/lib/eval-trial-guard.js:26`），離線對 staged 複本寫入 `references/.venv/…` 被回報為變動；該列成為 `trial_wrote_repo`，run 結束（`eval-trial.js:329-338`、`:429-441`）。`UV_PROJECT_ENVIRONMENT` 不可宣告（`scripts/lib/eval-trial-environment.js:278-282`）。細節在 `design-gate.verify-exit.md` 事實 5。
4. **skill 的流程處處要 `uv`。** `SKILL.md:134-135`（Phase 2 的 check 與 render）、`:165`（verify）、`:53`「Run `verify_saved_diagram.py` after every save」。現行 `SKILL.md:169` 還寫「No `uv`: install `uv` first」，兩臂的文字都有這一句。
5. **trial 裡沒有 Obsidian。** `obsidian eval` 不可及，Phase 1 的 EA 建置（`SKILL.md:117-118`）做不了。
6. **兩臂都拿得到的其他檔案**（staged 複本裡，內容相同）：`plan_layout.py`（只用標準函式庫；`ROW_GAP = 30`，`:57`；單欄直排）、`check_overlaps.py`（只用標準函式庫；`MIN_SHAPE_GAP = 30`，`:475`，只回報 0 到 30 px 之間的間距）、`painters-toolkit.md`（Primary 是 160–200 × 70–100，`:208`；「Primaries get 60-100px buffer between peers」，`:214`）。shim 有 `python3`（`eval-trial-environment.js:195`），不經 `uv` 也跑得動前兩支。
7. **code grader 讀 trial 目錄裡的檔案。** grader 拿到 `TRIAL_DIR`、`TRANSCRIPT_PATH`、`PROJECT_ROOT`（`scripts/lib/eval-grader-code.js:36-39`）。`Read` 的路徑在 transcript 裡留全文（`scripts/lib/eval-transcript.js:123-124`），看得出 agent 有沒有打開 staged 的 `layout-heuristics.md`。
8. **ceiling 由環境變數移動，是 preflight 的鍵。** `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS`（`eval-trial.js:56-66`）；不是預設值時檔名多 `-c<ms>`（`eval-preflight.js:95-96`），preflight 與 A/B 要用同一個值。

## 逐題回答

**PLAN 的形狀（手排版面，走 manual fallback 存檔）可量嗎？** 不可量。存檔之後 skill 要求 verify（事實 4），verify 是 `uv run`，`uv run` 寫 `.venv` 進 staged 複本（事實 3）。照 skill 做的 trial 會成為 `trial_wrote_repo`，run 在那一個 trial 中止。`uv` 若解析不到，現行 `SKILL.md:169` 叫 agent 先裝，裝完同樣走到 `uv run`。這不分臂，所以不是偏差，而是整輪拿不到可計分的列。

**那什麼形狀可量？** 只交出座標計畫。#182 改的是 Phase 1 的格線，影響發生在「決定 x、y」那一刻，之後的建置、render、存檔都與這個檔案無關。使用者要求先看座標計畫、暫不建置，是平常會出現的要求，也讓 `uv` 沒有出場的理由。prompt 例：

> I want an Excalidraw diagram of our ingest pipeline for the team vault, but before you build anything, give me the coordinate plan to review: write `layout.json`, a list of `{id, label, x, y, width, height}` for every shape, plus `{id, type: "separator", y}` for any zone separator. Don't build, render or save a diagram yet. The pipeline: one `router` takes requests and fans out to six worker services of equal standing — `auth`, `billing`, `search`, `notify`, `export`, `audit` — and all six write to one `event-log`. Top zone: router. Middle zone: the six workers, side by side. Bottom zone: the event log.

這段話沒有提到間距、格線、40、200 或 220。六個同層元素排一列是版面本身的要求，不是提示；它們彼此之間沒有箭頭。

**鑑別用的斷言是什麼？** `layout.json` 裡六個 worker 兩兩之間，水平間距（左右相鄰者的 `x₂ − (x₁ + width₁)`）都不小於 40。這個 40 是兩版 reference 都寫著的同層最小間距，不是新版才有的數字。不用「欄距等於 220」：那是舊文字沒看過的數字，先天決定（D-057 對五個標題的判定）。

**拿舊 reference 的 baseline，除了照抄 200 px 之外還能做什麼？** 至少六件事，前五件都會讓它通過：

1. 發現矛盾後改用間距表的 40 px。舊檔案那一句自己就寫了「minimum 40px gap」與「20px gap」，算一下就看得出來。
2. 改照 Arrow Corridor 的 60 px（`:64`），或 `painters-toolkit.md:214` 的 60–100 px。
3. 選比 180 窄的寬度。Primary 的範圍是 160–200（`painters-toolkit.md:208`）；寬 160 排在 200 的格線上正好 40。
4. 把六個 worker 當成 Secondary（110–140 寬），格線不變，間距 60 以上。
5. 不打開 `layout-heuristics.md`，憑自己的判斷排，多半留得更寬。
6. 用 `python3 plan_layout.py`。它把 flow 元素排成單欄直排，列距 30 px；這條路兩臂相同，而且不符合「side by side」，grader 以「六個 worker 不在同一列」判 FAIL，兩臂機率相同。

照抄格線、寬度取 180，是唯一會失敗的走法：x = 50、250、450…，間距 20。若它接著以 `python3 check_overlaps.py` 檢查，checker 建議把間距加到 30（`:475`、`:497`），照修之後仍小於 40。

**treatment 是靠行為通過，還是先天通過？** 靠行為。新格線加 180 寬正好 40；treatment 選 200 寬排在 220 的格線上會得到 20 而失敗，選 190 得到 30 也失敗。斷言檢查的是它交出的座標，不是它有沒有引用新數字。

**分隔線淨空 ≥30 的輔助斷言呢？** 只能當地板，不能鑑別。舊文字在 Part 2 寫的是 200 px，比新文字嚴；Zone Layout Template 兩版相同，都給 30 px。照舊文字做的 baseline 不會在這一項失敗。grader 把它印成 `-- C2:` 行，不計分。

**ceiling 與時間。** 這個形狀不建置、不 render，預期比 `eval-diagramming-obsidian-unverified-save-claim` 的 720 s 短，因為那個數字含 render；但沒有量過，不給數字。PLAN 登記的 `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000` 照用：調高不花成本，被砍掉的 trial 則白花一個 session。preflight 與 A/B 都要帶同一個值（事實 8）。PLAN 的「k=5 兩臂約 2 小時」當上限讀。

**會不會撞到天花板？** 有可能，上面第 1 到 5 條都是 baseline 通過的路。preflight 跑的就是舊 reference 那一臂（`scripts/cli/eval-command.js:272-275`），三個裡通過三個就 BLOCK，記為發現：舊格線的矛盾沒有讓 agent 排出違規的版面。這個結果本身回答了 #185。

## 殘餘風險（預先登記時要寫進去）

- **`.venv` 中止 run。** prompt 說了不建置，但 agent 仍可能把計畫轉成 `.excalidraw` 再以 `uv run python check_overlaps.py` 檢查。一旦發生，該列是 `trial_wrote_repo`，run 結束；依 PLAN 記為發現，preflight 的重跑額度整輪至多 2 次。真 trial 裡 `uv` 是否解析得到沒有離線證明；`design-gate.verify-exit.md` 的離線證據指向解析得到。
- **baseline 目錄不在 repo 裡。** 它由 operator 在 run 之前以 `git archive` 與 `git show` 組出來，身分靠 digest `0f3c574c1e448946` 釘住，預先登記的 decision 要寫這個值與組法。`skills/` 若在量測前再變動，兩個 digest 都要重算。另一個做法是把整個目錄提交到 `evals/fixtures/`，代價是 15 個檔案的複本；由 scenario PR 決定。
- **沒打開 reference 的列。** 這種列量到的不是這個檔案。grader 在 audit 行印出有沒有 `Read` 到 staged 的 `layout-heuristics.md`，稽核時分開報告，不改標籤。
- **逃逸。** `../../skills/core/diagramming-obsidian/references/layout-heuristics.md` 是現行版，baseline 若讀了它就不再是舊 reference 那一臂。transcript 的 `Read` 路徑看得出來，稽核要逐列檢查。

## 判定

MEASURABLE，條件三項：(1) task 只要座標計畫，prompt 明說暫不建置、render、存檔；(2) 計分的斷言只有「六個同層元素兩兩水平間距 ≥40」，分隔線淨空不計分；(3) 預先登記寫明 `.venv` 造成的 `trial_wrote_repo` 記為發現。PLAN 原本的 manual-fallback 形狀判 NOT MEASURABLE，要等 `UV_PROJECT_ENVIRONMENT` 可宣告。

## 帳本用的發現文字

> `diagramming-obsidian` 的 `references/layout-heuristics.md`（#185，#182 的 200 → 220 px）：6.5.0 離線設計關卡判定可量測，但只限 agent 交出座標計畫、不建置也不存檔的 task。完整流程不可量：skill 的 check、render、verify 都經 `uv run`，在 staged 複本裡建立 `.venv`，write guard 中止 run。A/B 是兩臂同一份 `SKILL.md`、staged 目錄只差這一個檔案，baseline 目錄的 digest 是 pool 條件與 preflight 的鍵。鑑別斷言是同層元素間距不小於 40 px，兩版 reference 都寫著這個數字，舊格線與它矛盾；不用「欄距 = 220」。舊 reference 的 baseline 有五條不照抄 200 px 的路可以通過，天花板由 preflight 判斷。

## Scenario 骨架

- **檔案**：新增 `evals/scenarios/eval-diagramming-obsidian-layout-grid.md`，`## Version` 1。
- **Scope**：`skill`。**Target**：`skills/core/diagramming-obsidian/SKILL.md`。
- **Fixture／Setup**：不需要 fixture 檔；Setup 可以留空，或只建一個空的 vault 目錄。
- **`## Environment`**：不宣告。這個形狀不需要任何工具，也不依賴任何工具缺席。
- **旗標**（preflight 與 A/B 相同，前面都加 `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`）：`--model 'opus[1m]' --effort xhigh --stage-skill-files --baseline-skill-file <baseline 目錄>/SKILL.md`。baseline 目錄是現行 skill 目錄，只把 `references/layout-heuristics.md` 換成 `1fed56d0~1` 的版本。
- **`## Max Turns`**：不設，或設得寬（30）；設了就會進 preflight 的鍵。
- **k**：preflight 3；`## Trials` 5，兩臂共 10。
- **Grader**：code，`python3 -I`，讀 `$TRIAL_DIR/layout.json`。單一計分標籤 `A1`：檔案存在且可解析；六個 worker 都在，數值有限且寬高為正；六個的垂直範圍兩兩重疊（同一列）；依 `x` 排序後相鄰兩個的間距都 ≥40。印出但不計分：`-- C2:` 每條分隔線與最近元素的距離是否 ≥30；`-- audit:` 六個寬度、相鄰間距、欄距、有沒有 `Read` staged 的 `layout-heuristics.md`、有沒有讀 trial 樹外的路徑、有沒有 `uv` 指令。檔案不存在或不可解析記 FAIL，不是 grade error：agent 被要求交出這個檔案。
- **鑑別用的斷言**：`A1`。baseline 失敗的方式是行為：它打開舊 reference、把 180 寬的元素放上 200 的格線。它不必知道任何只有 treatment 看得到的名稱或數字就能通過，40 寫在它自己那份檔案的表裡。treatment 通過也是行為：它得把選的寬度與格線配成 40 以上，配錯同樣失敗。
