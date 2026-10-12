# `sessions` handover 撰寫設計關卡（D-059 有條件的第五項）

**判定：MEASURABLE，但只能讀成 treatment 的非回歸，不是鑑別力的證據。** 引擎支援這次 run，池與 preflight 的鍵都解析得出來。現行斷言的 delta 有 2/7 是先天決定的，既有的 +0.29 正好就是這 2/7。條件不變：D1 到 D4 結束時花掉的 session 不超過 67 才跑；preflight 3 + A/B 10，不補跑。

本文件只閱讀程式與已提交的 benchmark，並在不啟動 session 的前提下執行引擎函式。行號以 `main` 的 `c1d2da73` 為準。

## 受測的內容

#283（`ed7dee3e`）把 handover 範本從 `SKILL.md` 搬到 `skills/core/sessions/references/handover-template.md`。本體留下的是 `SKILL.md:36-44`：

> Open `references/handover-template.md` and write `.handovers/<YYYY-MM-DD>-<slug>.md` from it: five sections in this order — `Where it stands`, `Done`, `Unfinished`, `Decisions`, `Next` — every slot filled, the word `none` in a slot with nothing in it, never a deleted heading.

D5 以 `eval-sessions-handover-completeness` 的現行 Version 4、不改 scenario 檔，加 `--stage-skill-files` 跑一次，讓 treatment 讀得到搬走的範本。

## 引擎事實

1. **staging 把 `references/` 交給 treatment，baseline 什麼都沒有。** 不帶 `--baseline-skill-file` 時 baseline 沒有文字，`buildInjection` 對它回傳空的注入，不建複本（`scripts/lib/eval-skill-staging.js:271-272`）；treatment 拿到 base-directory 行與整個 `skills/core/sessions/` 的複本（`:278-291`），含 `references/` 的三個檔案。
2. **staging 是 pool 條件，兩臂的列都記。** `runSkillEval` 把 `staged: stageSkillFiles` 交給兩臂（`scripts/lib/eval.js:315-320`），`ranWith()` 據此寫 `stageSkillFiles: true`（`scripts/lib/eval-trial.js:165-167`），它在 `CONDITION_FIELDS` 內（`scripts/lib/eval-pools.js:29-39`）。這次 run 的列自成一池，不與 Version 4 既有的列合併。讀取端判定的是最新條件的那一池，其餘列在旁邊（`eval-pools.js:57-73`），所以 `eval report` 之後這支 scenario 的快照會換成 staged 這一池。
3. **preflight 的鍵不受 staging 影響。** 沒有 baseline 文字時，`preflightBaseline` 回傳的 conditions 是空的（`scripts/cli/eval-skill-options.js:105-111`；離線以 `{ stage: true }` 呼叫確認，`staged: false`、沒有監看目錄），`conditionsSuffix` 只在有 baseline 文字時才加 `-b…-s…`（`scripts/lib/eval-preflight.js:97-100`）。紀錄檔名是 `<hash>-opus_1m_-t40-exhigh.json`（`## Max Turns` 40）。帶不帶 `--stage-skill-files` 跑 preflight，量的是同一個 baseline、寫的是同一個檔。
4. **mixed grader 的通過門檻是 0.8。** 七個斷言（兩個 behavioral、五個 model），model 分數以 0.8 二值化，分數是通過數除以 7，`passed: score >= 0.8`（`scripts/lib/eval-graders.js:175-201`）。通過需要 6/7；5/7 是 0.71，不通過。
5. **既有讀數（已提交的 `evals/benchmarks/latest.json`）**：baseline 五列都是 0.71，stddev 0；treatment 五列都是 1.00；delta 0.29，`last_run` 2026-08-15。帳本把這一池列在「未重跑的池：修復前、unrecorded 條件」（`evals/skill-eval-coverage.md`，6.1.1 量測輪）。0.71 是 5/7，0.29 是 2/7。
6. **scenario 自己說兩個斷言是先天的。** Design Notes 的 Version 3 一節：A5「is **not** part of the discrimination claim … expected to separate the arms by construction」。`[tool_called] Write:re:^\S*handovers/` 同理：沒看過這個慣例的一臂不會寫進名為 `handovers/` 的目錄。
7. **`sessions` 的 `SKILL.md` 沒有教 agent 怎麼解析 `references/`。** `diagramming-obsidian/SKILL.md:20-23` 明寫要從 base-directory 行解析；`sessions/SKILL.md` 沒有這一段，只有 `:38` 的相對路徑。treatment 靠注入的第一行與 system prompt 的例外句（`eval-trial.js:491-495`）自己推得出來，但引擎不保證它會去讀。
8. **`Read` 的路徑留在 transcript。**（`scripts/lib/eval-transcript.js:123-124`）看得出 treatment 有沒有打開 staged 的 `handover-template.md`。
9. **這個 run 沒有 `uv`，也不寫 staged 目錄。** skill 的流程是跑 `npm test`、寫 `.handovers/` 下的檔案，都在 trial 目錄內；verify-exit 關卡的 `.venv` 問題不適用。`npm` 在 shim 裡（`scripts/lib/eval-trial-environment.js:193`）。Setup 的檔案都以 heredoc 寫出，不依賴 operator 的工具。`eval lint eval-sessions-handover-completeness` 回報 `ok`。

## 逐題回答

**池會怎麼變？** 多一池：Version 4、`stageSkillFiles: true`、`opus[1m]`、`xhigh`、turn 上限 40。既有那一池（2026-08-15，條件未記錄）留在磁碟上，成為「others」。兩池不合併，也不該合併：既有那一池量的是瘦身前的文字，範本還在本體裡。

**現行斷言還能鑑別嗎？** 依已提交的數字，本來就沒有靠行為鑑別過。baseline 五列一律 5/7、零變異，最直接的解釋是它每次都剛好輸掉先天的那兩個（`Write:re:^\S*handovers/` 與 A5），A1 到 A4 兩臂都在天花板。逐斷言向量不在已提交的匯出裡，但 operator 本機未提交的 `evals/results/` 留有 Version 4 的列，逐列確認了這個解釋：`20260815-074644` 與 `20260815-050346` 兩次 run 共 9 筆有計分的 baseline 列，向量都是 `[1,0,1,1,1,1,0]`，輸掉的正是 `.handovers/` 的寫入與 A5；同一次 run 的 treatment 五列都是七個 1。scenario 的 Design Notes 把鑑別主張放在 A1 到 A4，那一部分在既有讀數裡是 0。

**加了 staging，這一點會變嗎？** 不會往鑑別的方向變。baseline 還是什麼都沒注入，A1 到 A4 的 baseline 表現與 staging 無關。treatment 已經是 7/7，沒有上升空間。staging 能改變的只有一個方向：treatment 掉下來。

**那 D5 回答得了什麼？** 一個問題：瘦身之後、讀得到 `references/` 的 treatment，是不是仍然 7/7。是，就是非回歸的讀數；不是，就是 #283 的回歸訊號，要逐列看掉的是哪一個斷言。它回答不了「範本搬走有沒有影響」：本體 `:38-42` 仍然寫著路徑慣例與五個標題，A1 到 A4 對應的規則在第 1 步（`:22-34`）與紅旗表（`:144-150`），不靠範本也能 7/7。要把範本的貢獻分出來，得另跑一臂「瘦身後、不 stage」，那不在 D-059 的範圍。

**preflight 有用嗎？** 判定沒有用，列有用。baseline 要 6/7 才算通過（事實 4），而它幾乎一定輸掉先天的兩個，所以 preflight 會 PASS，這個 PASS 不代表 A1 到 A4 有鑑別力。但 6.5.0 起 preflight 每個 trial 寫一筆 row（eval B-16），三列的逐斷言向量會在 `preflight.jsonl`。那是花 3 個 session 就能看到的 A1 到 A4 baseline 表現。引擎要求先有 PASS 紀錄才放行 `eval ab`（`scripts/cli/eval-command.js:412-418`），這 3 個 session 省不掉。

**treatment 會去讀範本嗎？** 無法離線回答（事實 7）。稽核時逐列記錄有沒有 `Read` staged 的 `handover-template.md`。沒有任何一列讀它的話，這一輪量到的就是「瘦身後的本體」，D-059 Residual 的那一句（搬走的內容不在 treatment 面前）對這一輪依然成立，要照實寫進結果的 decision。

**model grader 的呼叫算不算 session？** 不算（D-059 Cost accepted）。這支是本輪唯一有 model grader 的 scenario，每個可計分的 trial 都會呼叫它（`eval-graders.js:166-168`）。

## 判定

MEASURABLE，預先登記時要把讀法寫死：

1. 主讀數是 treatment 的通過率與 A1 到 A4 的逐斷言比率，兩臂分開列。
2. delta 照引擎回報的數字記，但註明其中 2/7（約 0.29）是先天的；delta 等於 0.29 讀成「treatment 未回歸，A1 到 A4 無鑑別」，不讀成 IMPROVED 的證據。
3. 稽核表多一欄：treatment 各列有沒有讀 staged 的範本。
4. preflight 的 PASS 不引用為鑑別力的證據；preflight 三列的 A1 到 A4 向量照實列出。

若審查者認為「只能讀成非回歸」不值 13 個 session，放棄 D5 與 D-059 的規定一致：它排最後，而且比任何補跑先被放棄，放棄時維持 D-059 的 Residual。

## 帳本用的發現文字

> `eval-sessions-handover-completeness` 加 `--stage-skill-files`（D-059 有條件的第五項）：6.5.0 離線設計關卡判定可以跑，但只能讀成 treatment 的非回歸。staging 只影響 treatment，baseline 仍然什麼都沒注入，preflight 的鍵與不 stage 時相同；staged 的列自成一池。這支 scenario 的七個斷言裡有兩個是先天決定的（`.handovers/` 的寫入與 A5），mixed grader 的通過門檻是 0.8，baseline 最多 5/7，所以 preflight 的 PASS 不代表有鑑別力。已提交的既有讀數是 baseline 五列都 0.71、treatment 五列都 1.00，delta 0.29 正好是 2/7。本體仍寫著路徑慣例與五個標題，treatment 不讀範本也可能 7/7；有沒有讀，由 transcript 的 `Read` 路徑逐列記錄。

## Scenario 骨架

- **檔案**：`evals/scenarios/eval-sessions-handover-completeness.md`，Version 4，一個字都不改（改了 hash 就變，preflight 與池都要重來）。
- **Scope**：`skill`。**Target**：`skills/core/sessions/SKILL.md`。
- **Fixture／Setup**：scenario 內建的 heredoc，不變。**`## Environment`**：沒有，不加。
- **旗標**：preflight `arcforge eval preflight eval-sessions-handover-completeness --model 'opus[1m]' --effort xhigh`；A/B 多加 `--stage-skill-files`。不帶 `--baseline-skill-file`。
- **k**：preflight 3；`## Trials` 5，兩臂共 10；不補跑。
- **Grader**：mixed，不變。
- **鑑別用的斷言**：scenario 宣告的是 A1 到 A4，但既有讀數顯示它們兩臂都在天花板，本關卡不主張這一輪會不同。A5 與 `.handovers/` 的寫入是先天的：baseline 不知道這個目錄名，不可能通過。treatment 在 A1 到 A4 上通過靠的是行為（跑 suite、把沒有測試的 exporter 記成未驗證、寫下被否決的 `csv-parse`、給出具體的下一步），這四項 baseline 不需要任何 skill 才有的名稱也做得到，而且看來每次都做到了。
