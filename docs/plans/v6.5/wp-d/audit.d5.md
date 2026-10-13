# Operator 稽核：D5 `eval-sessions-handover-completeness` V4（6.5.0 量測輪）

Repo `main` `853ea820`。稽核只閱讀：沒有啟動 `claude`，沒有 live eval，沒有重新計分。preflight run `20261013-001453` 的 3 份與 A/B run `20261013-002124` 的 10 份 transcript 全部讀完，並對照各列的 `assertionScores`、`evidence` 與 preflight 紀錄。

儀器限制：transcript 只記工具呼叫與 assistant 文字，不記工具輸出；`Write` 的內容有留全文，所以 handover 檔可以逐字讀。

## 讀法（D-063 第 7 點）

這一項只讀成 treatment 的非回歸，不讀成改善。引擎的 delta 照實記錄，不引用為改善的證據；preflight 的 PASS 不引用為鑑別力。「treatment 沒有回歸、A1 到 A4 不具鑑別力」這一句，要三個條件都成立才寫：每一個 treatment 列七項全過；每一個 baseline 列的 A1 到 A4 都過；baseline 失去的斷言只有兩臂先天不同的那兩項，也就是寫入 `.handovers/` 底下，以及 A5。

## 條件

每一列：`opus[1m]`、`xhigh`、`maxTurns 40`、`pluginDir false`、isolated、Version 4、scenario hash `708742f7f80f88f1`、Node `v24.13.1`、`repo_commit 853ea820…`、ceiling 900 s、`environment` 空。scenario 檔沒有修改。A/B 帶 `--stage-skill-files`：兩臂的列都記 `stageSkillFiles true`；treatment 列另記 `skillTextHash 951cd2d8ab6f57d0` 與 `skillFilesHash cc8e5da279b238b6`；baseline 沒有注入文字，也就沒有東西可以 stage，列上沒有 `skillFilesHash`。preflight 的 3 列沒有 `stageSkillFiles` 欄位，紀錄的鍵也不含它，所以 preflight 帶了旗標這件事由下面的指令紀錄證明，不是由列證明。沒有 `infraError`，沒有 `gradeError`。

D5 的啟動條件是 D1 與 D4 結束時花掉的 session 不超過 67；實際是 19（D1 13、D4 6），條件成立。

preflight 紀錄（`preflight.eval-sessions-handover-completeness.json`）：k=3、`pass_rate 0`、PASS、2026-10-13T00:21:04Z。三列的分數都是 0.71；mixed grader 的通過門檻是 0.8，所以通過率是 0。

## 指令

取自 operator session 的指令紀錄（該 session transcript 裡的 `Bash` 呼叫），時間是呼叫送出的時間；輸出導向 log 的部分略去。

| 時間 | 指令 |
|---|---|
| 2026-10-13T00:14:52Z | `node scripts/cli.js eval preflight eval-sessions-handover-completeness --skill-file skills/core/sessions/SKILL.md --stage-skill-files --model 'opus[1m]' --effort xhigh` |
| 2026-10-13T00:21:24Z | `node scripts/cli.js eval ab eval-sessions-handover-completeness --skill-file skills/core/sessions/SKILL.md --k 5 --stage-skill-files --model 'opus[1m]' --effort xhigh` |

preflight 與 A/B 都帶 `--stage-skill-files`，都沒有 baseline 文字，也都沒有帶 `--max-turns`，turn 上限取 scenario 自己的 40（列上是 `maxTurns 40`）。與 D-063 第 3 點相符。

## 斷言向量的七個位置

| 位置 | 斷言 | grader |
|---|---|---|
| 1 | `[tool_called] Bash:npm test` | code |
| 2 | `[tool_called] Write:re:^\S*handovers/`（寫入 `.handovers/` 底下） | code |
| 3 | A1：不照抄使用者說的「exporter 做完了」，記為未測試 | model |
| 4 | A2：回報自己實際取得的測試結果，並說明涵蓋範圍 | model |
| 5 | A3：記下留在 in-house 的決定、被否決的 `csv-parse`、理由 | model |
| 6 | A4：一個具體的下一步，點名檔案、函式或指令 | model |
| 7 | A5：檔案在 `.handovers/` 底下、檔名帶日期、五個段落齊全 | model |

`eval ab` 的輸出把七個位置依序標成 A1 到 A7，所以它印的「A2 ✗、A7 ✗」就是位置 2 與位置 7：寫入 `.handovers/`，以及 scenario 的 A5。本文件一律用 scenario 的名稱。

## 逐列

| 列 | 向量 | 讀了 staged 的 `handover-template.md` | handover 寫到哪裡 | 標題 | exporter 怎麼記 | 工具呼叫 | 耗時／output tokens | 分數 |
|---|---|---|---|---|---|---|---|---|
| P1 | `1,0,1,1,1,1,0` | 否 | `HANDOVER.md`（repo 根目錄） | State／Decision／Next／Watch out | 「done. Untracked, no tests.」 | 5 | 39.0 s／3,760 | 0.71 |
| P2 | `1,0,1,1,1,1,0` | 否 | `HANDOVER.md` | Left to do／Done／Decision／Before you start | 列在 Done，另寫「The exporter has no tests.」 | 4 | 47.8 s／4,555 | 0.71 |
| P3 | `1,0,1,1,1,1,0` | 否 | `HANDOVER.md` | Where things stand／Decision／Next／Watch out | 「done, but untracked and has no tests」 | 5 | 34.2 s／3,269 | 0.71 |
| B1 | `1,0,1,1,1,1,0` | 否 | `HANDOVER.md` | Next／State／Decision／Watch out | 「written, but untracked and untested」 | 5 | 35.2 s／3,458 | 0.71 |
| B2 | `1,0,1,1,1,1,0` | 否 | `HANDOVER.md` | Next／Done／Decision／Watch out | 列在 Done，另寫「The exporter has no tests.」 | 5 | 34.6 s／3,299 | 0.71 |
| B3 | `1,0,1,1,1,1,0` | 否 | `HANDOVER.md` | Next／State／Decision／Open question | 「written, no tests yet」 | 5 | 40.7 s／3,957 | 0.71 |
| B4 | `1,0,1,1,1,1,0` | 否 | `HANDOVER.md` | State／Decision／Next／Watch out | 「done. No tests yet.」 | 4 | 32.3 s／3,051 | 0.71 |
| B5 | `1,0,1,1,1,1,0` | 否 | `HANDOVER.md` | State／Next／Decision／Watch out | 「done, but has no tests and is not in git yet」 | 4 | 42.9 s／4,233 | 0.71 |
| T1 | `1,1,1,1,1,1,1` | 是（第 2 個工具呼叫） | `.handovers/2026-10-13-feat-csv.md` | Where it stands／Done／Unfinished／Decisions／Next | 列在 Unfinished：「written but untested」 | 7 | 67.1 s／6,722 | 1 |
| T2 | `1,1,1,1,1,1,1` | 是（第 2 個） | `.handovers/2026-10-13-feat-csv.md` | 同上五個 | 列在 Unfinished：「written but untested」 | 5 | 43.5 s／4,388 | 1 |
| T3 | `1,1,1,1,1,1,1` | 是（第 2 個） | `.handovers/2026-10-13-feat-csv.md` | 同上五個 | 列在 Unfinished：「written but untested」 | 6 | 37.7 s／3,721 | 1 |
| T4 | `1,1,1,1,1,1,1` | 是（第 3 個） | `.handovers/2026-10-13-feat-csv.md` | 同上五個 | 列在 Unfinished：「written but untested」 | 8 | 42.3 s／3,943 | 1 |
| T5 | `1,1,1,1,1,1,1` | 是（第 3 個） | `.handovers/2026-10-13-feat-csv.md` | 同上五個 | 列在 Unfinished：「written but untested」 | 6 | 40.0 s／3,820 | 1 |

13 列都跑了 `npm test`，也都另外以 `node -e` 手動試過 exporter，並把 `toCsv` 與 `parseRow` 對引號處理不一致的缺陷寫進 handover。

## 每臂在每一項斷言上的通過數

| 斷言 | preflight（無 skill） | baseline | treatment |
|---|---|---|---|
| `Bash:npm test` | 3/3 | 5/5 | 5/5 |
| 寫入 `.handovers/` 底下 | 0/3 | 0/5 | 5/5 |
| A1 | 3/3 | 5/5 | 5/5 |
| A2 | 3/3 | 5/5 | 5/5 |
| A3 | 3/3 | 5/5 | 5/5 |
| A4 | 3/3 | 5/5 | 5/5 |
| A5 | 0/3 | 0/5 | 5/5 |
| 通過（分數 ≥ 0.8） | 0/3 | 0/5 | 5/5 |

## 判讀：treatment 沒有回歸，A1 到 A4 不具鑑別力

三個條件都成立：五個 treatment 列七項全過；五個 baseline 列的 A1 到 A4 都過；baseline 失去的只有寫入 `.handovers/` 與 A5。所以 D-063 的那一句可以寫，而且只寫那一句。

引擎的判定是 IMPROVED，delta +0.29 CI[0.29, 0.29]（baseline 平均 0.71、treatment 平均 1.00）。這個 0.29 正好是 2/7，就是那兩項先天不同的斷言：沒看過慣例的一臂寫不出 `.handovers/<日期>-<slug>.md` 與五個標題。它不是行為改善的證據，本輪不這樣引用。preflight 的 PASS 也只是同一件事：baseline 在那兩項上各失一分，5/7 低於 0.8 的門檻。

這次 run 要回答的問題是：把範本移進 `references/handover-template.md`、`SKILL.md` 本文只留一句指向它之後，treatment 會不會掉分。沒有掉。

## staged 的範本有沒有到 treatment 面前

有，五列都有。每一個 treatment 列都在寫檔之前以 `Read` 打開 `<tmp>/arcforge-eval-skill-15344-<id>/references/handover-template.md`，那是該 trial 自己的 staged 複本。五列寫出的檔案用的是同一組五個標題，`Done` 的條目都帶「verified by `npm test`」這種寫法。baseline 與 preflight 的 8 列沒有任何 staged 路徑。

所以 D-059 的 Residual（移走的內容沒有到 treatment 面前）在本輪不成立。這證明的是 staging 把檔案送到了、treatment 也照 `SKILL.md` 的指示打開了；它不證明範本搬家這件事本身有沒有影響，那需要一個本文已修剪、但不 stage 的第三臂，不在 D-059 的範圍內（D-063 Residual）。

沒有一列寫進 staged 複本：treatment 的寫入都在 trial 目錄裡，列上沒有 `trial_wrote_skill_files`。

## A1 到 A4 以外看得到、但不計分的差別

- **exporter 放在哪一格。** 五個 treatment 都把 exporter 放在 `Unfinished`，寫「written but untested」。無 skill 的 8 列有 6 列仍用「done」這個字，再補一句沒有測試（P1、P2、P3、B2、B4、B5），2 列寫「written」（B1、B3）。A1 的評分準則接受「done, though untested」，所以兩種都過，A1 分不出來。treatment 的格子是範本給的，這個差別有一部分是結構造成的，不解讀成行為證據。
- **`.git/info/exclude`。** T1 以 `Edit`、T4 以 `echo '.handovers/' >> .git/info/exclude` 把 `.handovers/` 加進該 trial 自己的 git 排除清單，並在回覆裡說明。`SKILL.md` 與範本都沒有這個指示。寫入在 trial 的 `.git/` 裡，不在 staged 複本，也不影響任何斷言。

## 花費

| 臂 | 平均耗時 | 平均 output tokens |
|---|---|---|
| preflight（無 skill，3 列） | 40.3 s | 3,861 |
| baseline（5 列） | 37.1 s | 3,600 |
| treatment（5 列） | 46.1 s | 4,519 |

treatment 多出來的是讀範本與較長的 handover，引擎沒有標成本旗標。13 個 session：preflight 3、A/B 10，沒有補跑（D-063 不給這一項補跑）。13 列各經 model grader 評過一次，這些呼叫不計入 session 上限。

## 快照裡的池

`eval report` 之後，這支 scenario 在 `evals/benchmarks/2026-10-13.json` 的讀數是本輪 staged 的池（baseline 0.71、treatment 1.00，各 5 列）。修剪之前的池（2026-08-15，條件未記錄，兩臂各 5 列）列在 `other_pools`，沒有被併進來；原始列都在 `evals/benchmarks/raw/2026-10-13.json`。

## 儀器觀察

A/B run 的 `grading/` 只有 5 個檔（`trial-1.json` 到 `trial-5.json`），內容是 treatment 臂的：檔名只帶 trial 編號，後跑的一臂覆寫了先跑的一臂。兩臂的 `assertionScores` 與 `evidence` 都還在各自的列上，本稽核用的是列，不是這些檔。

## 有爭議的標籤

沒有。13 列的向量逐項對過 transcript 裡的 handover 檔，與 grader 的 `evidence` 一致。

## 無法在本稽核確認的事

- `npm test` 的實際輸出（transcript 不記）；「1 個測試、1 個通過」取自 13 份 handover，與 fixture 只有一個測試檔相符。
- baseline 臂的 `grading/` 檔（已被覆寫，見上）。
