# Operator 稽核：D4 `eval-diagramming-obsidian-layout-grid` V1（6.5.0 量測輪）

Repo `main` `853ea820`。稽核只閱讀：沒有啟動 `claude`，沒有 live eval，沒有重新計分。兩次 preflight（run `20261012-224014` 與 `20261012-235207`）的 6 份 transcript 全部讀完，並對照各列的 `graderOutput` 與兩份 preflight 紀錄。本項沒有 A/B（D-063 第 4 點）。

儀器限制：transcript 只記工具呼叫與 assistant 文字，不記工具輸出。`which uv` 印了什麼、`uv run` 的 exit code 是多少，transcript 都沒有；下文關於 `uv` 的判讀取自 agent 接下來的動作與回覆。

## 條件

每一列：`opus[1m]`、`xhigh`、`maxTurns` 未設、`pluginDir false`、isolated、Version 1、scenario hash `003f6bda689dafb4`、Node `v24.13.1`、`repo_commit 853ea820…`、ceiling 1,800 s（`ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`）、`stageSkillFiles true`、`environment` 空。preflight 跑的是舊 reference 那一臂：`baselineSkillHash` 與 `skillTextHash` 都是 `51fe7cc9f5373b7e`（兩臂同一份 `SKILL.md`），`baselineSkillFilesHash` 與 `skillFilesHash` 都是 `0f3c574c1e448946`，與 D-063 登記的 baseline 目錄 digest 相同。treatment 目錄的 digest `42ec93e5d9d42cec` 沒有出現在任何一列，因為 treatment 一個 session 都沒有跑。

## 兩份 preflight 紀錄

| 紀錄 | run | 時間 | `pass_rate` | 判定 | 引擎的理由 |
|---|---|---|---|---|---|
| `preflight.eval-diagramming-obsidian-layout-grid-1.json` | `20261012-224014` | 2026-10-12T22:55:18Z | `null`，`errored 1` | BLOCK | 3 個 trial 有 1 個出錯，沒有鑑別力訊號 |
| `preflight.eval-diagramming-obsidian-layout-grid-2.json` | `20261012-235207` | 2026-10-13T00:14:25Z | `1` | BLOCK | baseline 通過率 100%，達到 80% 的天花板 |

兩份紀錄的鍵相同，第二份覆寫了快取裡的第一份；第一份取自 operator 在重跑之前留下的複本。

第一份不是天花板的讀數：引擎寫下 BLOCK 而沒有通過率，這是 D-063 第 5 點列的第一種「沒有量到」，可以重跑。重跑用掉整輪 2 次額度的 1 次。第二份是天花板的 BLOCK，依第 4 點記為發現，不再跑第二次 preflight，也不跑 A/B。

## 逐列

「讀了什麼」欄只列 staged 複本裡的檔案，路徑都是 `<tmp>/arcforge-eval-skill-<pid>-<id>/references/…`。六個 worker 的寬度、相鄰間距與欄距取自 grader 的 `-- audit:` 行。

| 列 | 讀了 staged 的 `layout-heuristics.md` | 還讀了 | worker 的大小宣告 | 寬度 | 相鄰間距 | 欄距 | 有沒有引用 200 px | `uv` 指令 | 寫入 | 工具呼叫 | 耗時／output tokens | 標籤 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| run 1，trial 1 | 有 | `plan_layout.py`、`painters-toolkit.md`、`visual-patterns.md`、`element-templates.md`、`check_overlaps.py` | `secondary` | 140 ×6 | 60 ×5 | 200 ×5 | 有（「a grid of 200px columns and 150px rows」，檢查腳本斷言 `(x - 50) % 200 == 0`） | 0 | `<trial>/layout.json` | 11 | 425.3 s／40,541 | PASS |
| run 1，trial 2 | 有 | 同上，少 `check_overlaps.py` | `secondary` | 140 ×6 | 60 ×5 | 200 ×5 | 回覆被截斷，沒有文字；座標是 x = 250、450、…、1250 | 1（`uv run --no-project python -B …/plan_layout.py /dev/stdin`） | `<trial>/layout.json` | 9 | 472.7 s／44,167 | PASS（見下：最後一輪被 session 上限截斷） |
| run 1，trial 3 | — | — | — | — | — | — | — | — | — | 0 | 2.5 s／0 | 出錯：`provider_refusal` |
| run 2，trial 1 | 有 | `plan_layout.py`、`painters-toolkit.md`、`visual-patterns.md`、`element-templates.md` | `secondary`（router 與 event-log 為 `primary`） | 140 ×6 | 60 ×5 | 200 ×5 | 有（「the workers sit on a 200px column grid」） | 1（`cd "$BASE/references" && … uv run --no-project python -B plan_layout.py /dev/stdin`） | `<trial>/layout.json` | 11 | 468.0 s／45,360 | PASS |
| run 2，trial 2 | 有 | 同 run 1 trial 1，另 `cat` 了 `pyproject.toml`、`.gitignore`、`color-palette.md` | `secondary` | 140 ×6 | 60 ×5 | 200 ×5 | 有（「Boxes sit on a grid of 200px columns and 150px rows」） | 0 | `<trial>/layout.json` | 11 | 471.2 s／44,977 | PASS |
| run 2，trial 3 | 有 | `plan_layout.py`、`painters-toolkit.md`、`visual-patterns.md`、`element-templates.md` | `secondary` | 140 ×6 | 60 ×5 | 200 ×5 | 有（「columns every 200px from x=50」） | 0 | `<trial>/layout.json` | 9 | 395.5 s／38,475 | PASS |

五個計分列的 `layout.json` 都是 25 個元素（box 8、connector 12、label 3、separator 2），六個 worker 的 `x` 都是 250、450、650、850、1050、1250，`y` 相同。不計分的 `-- C2:` 行：10 條分隔線離最近的 box 80 到 115 px，都高於 30 px 的地板。

## 逃逸：舊 reference 的 baseline 把方塊做窄

五個計分列走的是同一條路，也就是設計關卡預先列出的第 4 條：照舊文字的 200 px 格線排，但把六個 worker 當成 Secondary，寬 140，間距 60，高於斷言的 40。

- 五列都打開了 staged 的舊 `layout-heuristics.md`，也都讀了 `painters-toolkit.md`（Primary 160–200、Secondary 110–140 的大小表在那裡）。
- 五列都先把這份 pipeline 餵給 `plan_layout.py`，六個 worker 的 `size` 都寫 `secondary`；四列的回覆說明 planner 把元素排成單欄、與「side by side」矛盾，所以改用手排。手排沿用了 140 的寬度。
- 有終局回覆的四列都明說格線是 200 px。沒有一列提到舊文字自己的矛盾（180 寬加 200 欄距只剩 20 px），沒有一列改用 220，也沒有一列引用間距表的 40 px 當理由。回覆裡把 60 px 的間距當成結果陳述（「with 60px gaps」）。
- 設計關卡預期會失敗的唯一走法，寬 180 排在 200 的格線上，一列都沒有出現。

所以這個 BLOCK 對 #185 的回答是：在這個 task 上，舊格線的矛盾沒有讓 agent 排出違規的版面。agent 沒有發現矛盾再繞開；它選的元素大小本來就不會碰到矛盾。「六個地位相同的服務」被讀成 Secondary，只有 router 與 event-log 被當成較大的 hub（340 寬，或 run 2 trial 1 的 200 寬）。斷言量的那一個數字，新舊文字都不影響這個選擇。

## 逐項稽核（D-063 第 8 點）

| 項目 | 結果 |
|---|---|
| 是否打開 staged 的 `layout-heuristics.md` | 5 個計分列都有，都是第 2 個工具呼叫 |
| baseline 是否讀了 repository 裡的現行檔案（逃逸） | 沒有。`-- audit: outside the trial tree: none`；transcript 裡沒有 `skills/core/diagramming-obsidian` 也沒有 `../` 路徑 |
| 寫進 staged 複本的列（`trial_wrote_skill_files`） | 沒有。5 列的寫入都只有 `<trial>/layout.json`，以絕對路徑寫 |
| `uv` | 2 列各 1 次，見下節 |
| 建置、render、存檔 | 沒有一列。5 列的回覆都說沒有建置、render 或存檔 |

## `uv` 與 staged 複本

run 1 trial 2 與 run 2 trial 1 各跑了一次 `uv run --no-project python -B …/plan_layout.py /dev/stdin`，緊接著下一個工具呼叫都是同一份輸入改用 `python3 -B` 重跑。`--no-project` 不建立 `.venv`，`-B` 不寫 `.pyc`，輸入走 stdin、輸出走 stdout，所以即使 run 2 trial 1 先 `cd` 進了 staged 的 `references/`，也沒有寫入，write guard 沒有回報。其餘三列直接用 `python3 -B`。

D-063 的 Residual 寫「跑了 `uv` 的 D4 列會損失」。本輪兩列跑了 `uv` 而沒有損失，原因是旗標，不是 guard 放行：會寫 `.venv` 的 `uv run`（不帶 `--no-project`）一次都沒有出現。

`uv` 在真實 trial 的 shell 裡解析得到嗎？run 2 trial 1 的回覆寫「`uv` is not installed on this machine」，run 2 trial 2 寫「the `obsidian` command and `uv` are not installed in this environment」（它跑的是 `which uv python3 obsidian`，沒有跑 `uv run`）；兩個跑了 `uv run` 的列都立刻改用 `python3`。三個獨立的列指向同一個方向：在引擎建置的 trial 環境裡 `uv` 解析不到。這是 agent 的陳述加上它的後續動作，不是儀器的紀錄，transcript 不記輸出；D-063 把這一點留作「尚未確立」，本輪給的是第一筆真實 trial 的跡象，不是證明。

## run 1 trial 2：最後一輪被 session 上限截斷，仍計為 PASS

run 1 trial 2 的最後一個 block 不是 agent 的回覆，而是「You've hit your session limit · resets 7:50am (Asia/Taipei)」。它在那之前已經以 `Write` 寫好 `layout.json`，grader 讀檔案，判 PASS；該列沒有 `infraError`，`duration_ms` 472,674、output tokens 44,167 都是正常 trial 的量級。trial 3 在 2026-10-12T22:55:14Z 啟動，整輪都被拒絕（2.5 s、0 token），引擎記為 `provider_refusal`、`infraError`。

也就是說，引擎認得「拒絕取代了 agent 的整個回合」，認不得「拒絕出現在工具呼叫之後」。這一列的標籤在本 scenario 下沒有錯，檔案在截斷之前就寫好了，而且它所屬的 preflight 依第 5 點本來就不算讀數。但在以終局回覆計分的 scenario（例如 D1 的 C5），同樣的截斷會被記成普通的 FAIL。記為儀器缺口，見 backlog wish `eval-provider-limit-mid-trial`。

重跑在 2026-10-12T23:52:07Z 開始，在上限重置（23:50Z）之後。

## 花費

| 項目 | session |
|---|---|
| preflight 1（`20261012-224014`） | 3（2 個跑完，1 個被拒絕） |
| preflight 2，出錯重跑（`20261012-235207`） | 3 |
| A/B | 0 |
| **合計** | **6** |

5 個跑完的 trial 耗時 395.5 到 472.7 s（平均 446.5 s），output tokens 38,475 到 45,360（平均 42,704），都遠低於 1,800 s 的 ceiling。沒有 model grader 呼叫。

## 有爭議的標籤

沒有。5 個 PASS 依斷言都正確：六個 worker 同一列，相鄰間距 60 ≥ 40。run 1 trial 2 的截斷另記於上，不改標籤。

## 無法在本稽核確認的事

- `which uv` 的輸出與 `uv run` 的 exit code（transcript 不記）。
- 各列讀到的 `layout-heuristics.md` 內容本身；依據是列上的 `skillFilesHash 0f3c574c1e448946` 與 D-063 登記的 digest 相同，baseline 目錄不在 repository 裡。
- treatment（現行 reference）在這個 task 上會怎麼排：沒有跑。
