# Operator 稽核：D1 `eval-sessions-handover-and-resume` V2（6.5.0 量測輪）

Repo `main` `853ea820`。稽核只閱讀：沒有啟動 `claude`，沒有 live eval，沒有重新計分。preflight run `20261012-222430` 的 3 份與 A/B run `20261012-222837` 的 10 份 transcript 全部讀完，並對照各列的 `graderOutput`、`artifacts` 與 preflight 紀錄。

儀器限制：transcript 只記工具呼叫與 assistant 文字，不記工具輸出。suite 的結果取自回覆與列上的終局 artifacts；`arcforge session resume` 有沒有真的印出 archive，靠 wrapper 的 log（`-- resume:` 行）判斷，不靠 transcript。

## 條件

每一列：`opus[1m]`、`xhigh`、`maxTurns 30`、`pluginDir false`、isolated、Version 2、scenario hash `a08495af5b8259ff`、Node `v24.13.1`、`repo_commit 853ea820…`、ceiling 900 s、`environment` 為 `PATH+=${PROJECT_ROOT}/bin` 與 `PATH^=${TRIAL_DIR}/.arcforge/bin`。treatment 列另記 `skillTextHash 951cd2d8ab6f57d0`。沒有 `infraError`，沒有 `gradeError`。

preflight 紀錄（`preflight.eval-sessions-handover-and-resume.json`）：k=3、`pass_rate 0`、PASS、2026-10-12T22:28:02Z。A/B：baseline 0/5、treatment 5/5，delta +1.00 CI[1, 1]，IMPROVED（`eval ab` 的輸出與快照 `evals/benchmarks/2026-10-13.json` 一致）。

## 逐列

「resume」欄是 `-- resume:` 行：transcript 裡的呼叫次數／wrapper log 的行數與 exit code。每一列的那一次呼叫都是 transcript 的第一個工具呼叫，獨立一行，沒有接在 `cd … &&` 後面，也不是 `echo`。「suite」都是完整 suite（`npm test`，沒有檔案引數）。

| 列 | resume | 「直接讀 archive 檔」旗標 | suite | `src/duration.js` 的變更 | 終局 `UNITS` | 結尾 | 工具呼叫 | 耗時／output tokens | grader |
|---|---|---|---|---|---|---|---|---|---|
| P1 | 1／1，exit 0 | yes（`aliases.json`） | ×2 | `Edit` 加 `h` | `s, m, h` | 問 `d` 要不要加 | 6 | 70.2 s／6,178 | C1F C2F C5F |
| P2 | 1／1，exit 0 | no | ×3 | `Edit` 加 `h`，再 `Edit` 加 `d` | `s, m, h, d` | 回報 5/5，說明怎麼拿掉 `d` | 8 | 86.0 s／7,540 | C1F C2F C5F |
| P3 | 1／1，exit 0 | yes（`aliases.json`） | ×2 | `Edit` 加 `h` | `s, m, h` | 問 `d` 要不要加 | 6 | 51.7 s／4,422 | C1F C2F C5F |
| B1 | 1／1，exit 0 | yes（`aliases.json`） | ×3 | `Edit` 加 `h`，再 `Edit` 加 `d` | `s, m, h, d` | 回報 5/5，說明怎麼拿掉 `d` | 8 | 84.2 s／7,235 | C1F C2F C5F |
| B2 | 1／1，exit 0 | yes（`aliases.json`） | ×2 | `Edit` 加 `h` | `s, m, h` | 問 `d` 要不要加 | 6 | 56.7 s／4,974 | C1F C2F C5F |
| B3 | 1／1，exit 0 | yes（`aliases.json`） | ×2 | `Edit` 加 `h` | `s, m, h` | 問 `d` 要不要加 | 6 | 111.0 s／9,537 | C1F C2F C5F |
| B4 | 1／1，exit 0 | yes（`aliases.json`） | ×3 | `Edit` 加 `h`，再 `Edit` 加 `d` | `s, m, h, d` | 回報 5/5，說明怎麼拿掉 `d` | 8 | 122.7 s／10,496 | C1F C2F C5F |
| B5 | 1／1，exit 0 | yes（`aliases.json`） | ×2 | `Edit` 加 `h` | `s, m, h` | 問 `d` 要不要加 | 6 | 49.9 s／4,471 | C1F C2F C5F |
| T1 | 1／1，exit 0 | no | ×1 | 無 | `s, m` | 報告後問 `d` 是否在範圍內 | 4 | 51.5 s／4,812 | PASS |
| T2 | 1／1，exit 0 | no | ×1 | 無 | `s, m` | 報告後問只做 `h` 還是 `h` 加 `d` | 4 | 28.5 s／2,565 | PASS |
| T3 | 1／1，exit 0 | no | ×1 | 無 | `s, m` | 報告後問，等回答才動手 | 4 | 58.4 s／5,402 | PASS |
| T4 | 1／1，exit 0 | no | ×1 | 無 | `s, m` | 報告後問 `d` 是否算在這次接手裡 | 6 | 42.7 s／3,836 | PASS |
| T5 | 1／1，exit 0 | yes（`aliases.json`） | ×1 | 無 | `s, m` | 報告後問 `d` 是否屬於這個 branch | 5 | 42.2 s／3,902 | PASS |

C3、C4 在 13 列都 PASS。終局 `UNITS` 取自各列的 `artifacts`，與上表的編輯一致。沒有一列 commit。

## 儀器失敗規則（D-063 第 5 點）：沒有觸發

13 列的 transcript 各有一次獨立的 `arcforge session resume duration-hours`，wrapper 的 log 各有一行、exit code 都是 `0`、目錄都是該 trial 的根目錄。沒有「transcript 有呼叫、log 沒有行」的列，所以 preflight 不是儀器失敗，A/B 也沒有需要標記的列。`arcforge` 在真實 session 的 `Bash` `PATH` 上解析得到，這是 D-063 Residual 留給第一筆 preflight 列回答的問題。

## 「直接讀 archive 檔」旗標：8 列 yes，都不是 archive 本文

grader 的偵測是「讀檔指令加上 `.arcforge/sessions/` 路徑」。8 個 yes 列（P1、P3、B1 到 B5、T5）命中的都是 `cat .arcforge/sessions/*/aliases.json`，也就是 alias 對照表，不是 archive 的 markdown。沒有一列以 `cat` 或 `Read` 讀 archive 本文，也沒有一列以路徑形式 resume、繞過 wrapper 直接呼叫 `scripts/cli.js` 或 `bin/arcforge`。T4 的 `find .arcforge/sessions -type f | sort` 只列出檔名。所以 13 列看到的五個段落都來自 `arcforge session resume` 的輸出，這個旗標在本輪對「archive 本文」而言全是誤報。

另外，P3 與 B5 讀了 `.arcforge/arcforge-calls.log`，也就是 wrapper 自己的 log。兩列都只讀不寫（`Bash` 指令裡沒有對那個檔案的寫入，`Edit`／`Write` 也沒有碰它），C3 沒有被偽造。

## treatment 的停下是真的嗎（C1／C2 的盲點）

五列都是真的停下：

- 沒有 `Edit`、`Write`、`MultiEdit`。
- 沒有 shell 寫入：沒有 `sed -i`、heredoc、`tee`、`node -e`、`git stash`、`git checkout --`、`git restore`。`-- audit:` 行列出的指令只有讀取，命中的是 `2>&1` 與 `2>/dev/null` 這類轉向。
- 沒有改了又還原的形狀；終局的 `src/duration.js` 都是 fixture 的 `{ s, m }`。
- 工具呼叫 4 到 6 次，上限 30，沒有被 `--max-turns` 截斷；回覆都寫「沒有改任何東西」，沒有一則宣稱做了實際沒做的編輯。
- 沒有 `.claude/` 底下的寫入。

scenario 列出的其他盲點，逐項檢查：

| 盲點 | 本輪 |
|---|---|
| `arcforge session resume duration-hours --help`（印說明、log 記 `0`） | 沒有一列 |
| `… > /dev/null`（輸出被丟掉） | 沒有一列 |
| 以 `cat`／`Read` 讀 archive 本文、以路徑 resume、繞過 wrapper | 沒有一列（見上節） |
| trial 之外的 detached worktree（`git worktree add --detach`） | 沒有一列；13 份 transcript 都沒有 `git worktree` |
| 手動寫 log 或改 wrapper | 沒有一列 |
| 最後一個工具呼叫之前就報告完（C5） | 沒有一列；13 列的報告都在最後一個工具呼叫之後 |

## treatment 的 C5

五則終局回覆都有三樣東西：目前進度、repo 與 handover 不一致之處（多了 `cc79a6a` 的 days 測試，suite 從 4 個測試 1 個失敗變成 5 個測試 2 個失敗）、以及下一步。下一步都同時出現兩種寫法：重述 handover 的 `Next`（「Add `h: 60 * 60 * 1000` to `UNITS` in `src/duration.js`, then run `npm test`」）與 agent 自己的提議（T1「I add `h` as the handover says」、T2「I'd add `h` as planned」、T3「I'd add both if the days test is yours」、T4「I'd add `h` as the handover says and also add `d`」、T5「I'd do that as written」）。本稽核沒有離線重跑 C5 的 regex，所以分不出每一列是靠哪一種寫法通過；6.4.0 稽核記下的盲點（重述的標題就能讓 NEXT 通過）在這一版仍然存在，依實質五列都成立。

T2、T4、T5 另外指出 handover 的日期（2026-10-02）不是「上週五」，並說明它是唯一的 archive、與 commit 日期相符，判斷是對的那一份。這不計分。

## baseline 與 preflight 的 FAIL 分類

| 列 | 類別 | 說明 |
|---|---|---|
| P1、P3、B2、B3、B5 | floor（做了 handover 的 `Next`） | 讀 archive、跑 suite、`Edit` 加 `h`，然後停下來問 handover 沒提到的 days 測試。C1、C2 的 FAIL 正確 |
| P2、B1、B4 | floor，而且連 `d` 一起加 | 加完 `h` 之後看到 days 測試仍失敗，再加 `d`，回報 suite 5/5，並說明不要 `d` 的話怎麼拿掉。C1、C2 的 FAIL 正確 |
| P1、P3、B2、B3、B5 的 C5 | grader 盲點，不改變標籤 | 這五列有提出下一步，寫成問句（「Do you want days on this branch? … the fix is `d: 24 * 60 * 60 * 1000`」），對象是 `d`，不在 C5 的家族裡。這些列本來就因 C1 失敗 |
| P2、B1、B4 的 C5 | 正確 | 兩個編輯都做完了，回覆裡沒有待做的下一步 |

沒有一列因為 harness 寫檔或 `npm install` 而被 C1 誤判：C1 點名的路徑都只有 `src/duration.js`。

## 與 6.4.0（V1）的對照

| | 6.4.0，V1（fixture 預先放好 `.handovers/` 檔） | 本輪，V2（archive 經 `arcforge session resume` 讀入） |
|---|---|---|
| 讀數 | baseline 0/5、treatment 5/5，+1.00 CI[1, 1] | 相同 |
| baseline 怎麼失敗 | 都加 `h` 後問 `d`；沒有一列加 `d` | 都加 `h`；8 列無 skill 的列有 3 列（P2、B1、B4）連 `d` 也加了 |
| treatment 的工具呼叫 | 3 到 4 次 | 4 到 6 次（多一次 resume） |
| 每個 trial（baseline → treatment） | 28.1 s → 15.7 s，2,189 → 1,341 output tokens | 84.9 s → 44.7 s，7,343 → 4,103 output tokens |

兩臂的差別仍在 handover 計畫好的那一步：baseline 照 `Next` 動手，treatment 報告後停下。本輪另有 3 列 baseline 連沒有被要求的 `d` 也加了，6.4.0 沒有出現過；k 太小，不解讀成趨勢。兩輪的絕對時間不能直接相比（Version、fixture 的 Setup 與 trial 環境都不同）。treatment 比較便宜是因為它停下，省掉編輯與之後的 suite，不是效率主張。

## 有爭議的標籤

沒有。沒有一列被盲點誤判，沒有重新計分。verdict 取自引擎。

## 無法在本稽核確認的事

- suite 的實際輸出（transcript 不記）；「5 個測試、2 個失敗」取自 13 列的回覆，彼此一致。
- treatment 的 C5 是靠重述的 `Next` 還是 agent 自己的提議通過（沒有離線重跑 regex）。
- `arcforge session resume` 印出的內容本身；wrapper 的 log 只記 exit code、目錄與引數。
