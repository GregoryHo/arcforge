# arcforge roadmap：6.5.0

## Context

- main 停在 `ddcbf667`：v6.4.0（tag 在 `20536307`）之後只合併了 #279、#280，`node scripts/check-benchmark-freshness.js` 是綠的。這一版會改 `skills/` 與 `evals/`，所以本來就要付一輪量測；維護者 2026-10-12 表示額度不是限制。
- 三件事在這一版會合：
  1. 前兩輪量測留下的儀器債：同一個 checkout 跑兩個 live eval 會互相中止（D-058 的事故）、preflight 不寫 result row、row 沒記 Node 版本與 scenario hash、operator 的 `PATH` 進到 trial、`eval compare` 一定花一次 analyzer。
  2. 三項量測因為同一個引擎缺口被擱置：verify-exit 句子（D-057）、#185、#184 都需要「skill 的檔案只給 treatment、放在 trial 樹外」，verify-exit 與 #185 另外需要「兩份 skill 文字之間的 A/B」與「scenario 可宣告的 trial 環境」（`docs/plans/v6.4/wp-d/design-gate.verify-exit.md` 末節）。
  3. 6.4.0 讓 archive 回來了，但新 session 開始時沒有任何 hook 讀它（D-056 的 Residual；D-031 把這個承諾拿掉、留成 wish `session-continuity-injection`）。

產品狀態的正本在 `product/`：6.5.0 的列、D-059 到 D-062、五份 spec 的 B-item（eval B-15 到 B-21、hooks B-8、skill-system B-11 與 B-12、obsidian B-10、cli B-9）。本文件是排程與執行方式；兩者不一致時以 decision 為準。

## 已定案（維護者 2026-10-12 決定）

D-059（版本）：

1. 6.5.0 是 minor：新的 hook 行為、新的 eval 旗標，前例是 6.2.0（D-020）。內容是儀器修補（D-062）、session 延續（D-061）、`sessions` 的 `SKILL.md` 瘦身、D-060 的 `speccing` 措辭紀錄，加一輪量測。
2. 量測四項，依此順序：(i) `eval-sessions-handover-and-resume` Version 2（skill-system B-11，經由真的 `arcforge session resume`）；(ii) `executing` → `dispatching` 交接（#184）；(iii) `diagramming-obsidian` 的 verify-exit 句子（obsidian B-10）；(iv) 該 skill 的 `references/` 版面（#185）。
3. 有條件的第五項（維護者 2026-10-12 對 Codex 意見的裁示）：(i) 到 (iv) 結束時花掉的 session 不超過 67（80 − 13），就以 `--stage-skill-files` 跑 `eval-sessions-handover-completeness` 的現行 Version（preflight 3、A/B 10、不補跑），讓瘦身後的 handover 撰寫路徑有一次看得到範本的 A/B；否則維持 D-059 的 Residual。它排最後，而且比 (i) 到 (iv) 的任何補跑先被放棄。不延後 #283。
4. 每項量測前面有一道離線設計關卡，在 D-062 的引擎變更合併之後、花任何 session 之前寫。判定 NOT MEASURABLE 就記為發現，花 0 個 session。
5. 上限約 80 個 trial session；整輪依序跑，一個 checkout 一次只跑一個 live eval（D-058）。
6. `eval-router-skill-selection` 不重跑，本版任何變更都不得改它的 scenario 檔。
7. 各關卡的判定、每支 scenario 的 k、補跑與重跑的額度，在讀任何結果之前另記一條 decision，`Refines: D-059`。量測輪的結果再記一條（照 D-058 的形狀）。這兩條的編號取當時的下一個空號，本文件不預先指定。
8. #256 不在範圍內，維持開啟。

D-060（`speccing`）：`Refines: D-055`（第 3 點）。6.4.0 出貨的文字是產品的說法：README 與 `docs/guide/skills-reference.md` 稱 `speccing` 是 v5 spec-driven pipeline 的檔案式「後繼者」，保留產品意圖、不保留自動化；D-055 第 3 點的「replaces」依這句話解讀。這一條只記錄，沒有程式或文件要改。

D-061（session 延續）：`Supersedes: D-031`，D-031 的狀態行已翻成 `Superseded-by: D-061`。

1. SessionStart 的 `source` 是 `startup` 或 `clear` 時，`inject-context` 加一行：專案最新一份 session archive 的名稱（有 alias 指向它就用 alias，沒有就用檔案）、存檔日期，以及讀它的指令 `arcforge session resume <alias|path>`。
2. `resume` 與 `compact` 不加（同一個 session 還在繼續）；專案沒有 archive 也不加。
3. 不注入 archive 的五個段落。
4. 不受 learning 開關影響（archive 不含使用者訊息，learning B-20）。
5. 找 archive 時只看名稱：日期目錄、archive 檔名（存檔時間戳在檔名裡）、專案的 alias 索引；不開任何 archive。

D-062（儀器），七項：

| 項 | 內容 | spec |
|---|---|---|
| (a) | run lock：`eval run`、`eval preflight`、`eval ab`、`eval report` 在 `.eval-trials/` 底下取鎖，記 PID，每條結束路徑都釋放（含 preflight BLOCK）；第二個立刻被拒絕並指出持有者；行程已不存在的鎖會被回收 | eval B-15 |
| (b) | preflight 每個 trial 寫一筆 result row，標籤獨立，任何 pool 讀取端都不回傳它 | eval B-16 |
| (c) | 每筆 row 與每筆 preflight 紀錄帶 Node 版本、scenario hash 與 checkout 的 commit（`node_version`、`scenario_hash`、`repo_commit`）；只記錄、不分組 | eval B-17 |
| (d) | trial 環境重建：operator 的 `PATH` 不進 trial 與 fixture Setup，`claude`、`node` 仍解析得到；scenario 以 `## Environment` 宣告 `PATH` 增減與放進 trial 內的快取目錄；`HOME` 保留；兩臂相同，記進 row | eval B-18 |
| (e) | `--stage-skill-files`（opt-in）：skill 檔所在目錄複製到 trial 樹外，注入以 host 格式的「Base directory for this skill」開頭；是 pool 條件 | eval B-19 |
| (f) | `--baseline-skill-file`：兩份 skill 文字的 A/B；每筆 row 記該臂注入文字的 hash；baseline 文字是 pool 條件；`eval preflight` 接受同一旗標，紀錄以 baseline 文字的 hash 為鍵 | eval B-20 |
| (g) | `eval compare --no-analyzer`：印出判定，不啟動 eval-analyzer session | eval B-21 |

寫進 decision 的設計選擇（核可的計畫原本列為假設，維護者 2026-10-12 一併核可）：

- Node 版本只記錄、不分組：不進 `ranWith()`，升級 Node 不會讓 6.3.0／6.4.0 的 pool 失效，eval B-8 的分組條件不變（D-062 (c)）。
- scenario 宣告的環境覆寫兩臂相同，記進 row；兩臂只差注入，eval B-7 仍成立（D-062 (d)）。
- 指引只在 `startup` 與 `clear` 出現（D-061）。
- D-031 整條被取代，不是部分修訂（D-061）。
- `sessions` 的 `SKILL.md` 本體從 206 行修到 150 行以下，一起進這版：參考資料搬到 `references/`，不刪行為指示；非回歸由本輪的 `sessions` V2 A/B 承擔（D-059，skill-system B-12）。這是唯一可以拿掉而不影響量測輪的項目。
- `eval-router-skill-selection` 不重跑：任何 PR 都不得改 `evals/scenarios/eval-router-skill-selection.md`，否則照 D-055 (ii) 要多 13 個 session，會超過上限（D-059）。

墓碑（`product/BACKLOG.md`）：`eval-concurrent-run-guard`、`preflight-result-rows`、`eval-record-node-and-hash`、`eval-trial-path`、`eval-compare-skip-analyzer`、`eval-skill-files-outside-trial`（以上 D-062）、`session-continuity-injection`（D-061）。`skill-body-trim` 不是墓碑：只有 `sessions` 那一支由 6.5.0 處理，其餘六支留著。

不在範圍內、維持開啟或留在 backlog：#256（`lint_vault` 的 block model，skill-local script）；Harness 底下的每一項 wish；`bound-transcript-parse`、`project-keyspace-collision`；`cli-human-output`；`eval-trial-sandbox`（D-062 (d) 比它窄，不是它）；`product-cli`、`speccing-spec-in-sync-eval`、`speccing-router-adjacency-eval`、`plugin-eval-corpus-migration`、`executing-discriminating-claim`；`diagramming-headless-fallback`；`secrets-guard-staged-scan`；`skill-body-trim` 其餘六支。

## 執行規則（本輪適用，沿用 v6.4）

- **Worker 模型**：只有主 session 用 Fable。每個 worker、`pm`、`qa` 派工時一律帶 `model: "opus"`。
- **停用 advisor**：每份 worker brief 都寫明不得呼叫 advisor 工具。
- **對外動作**：push、開 PR、squash merge、建立或關閉 issue 由主 session 執行；worker 可在 brief 授權下 push 與開 PR。
- **合併條件**：CI 全綠、Codex 自動審查完成且每則意見都已修正或回覆、`qa` 審查無未處理的發現。三者缺一不合併。
- **打 tag**：6.5.0 的 tag 由主 session 推送，條件是 release PR 已合併、CI 全綠、發版前查核通過。
- **live eval**：一律由主 session 啟動，一次一個，不超過上限。
- **spec 與程式的順序**：Codex 審查回報「spec 在另一個 PR」是順序問題，先合併 spec 的 PR。
- **B-item 的措辭**：程式 PR 改變了某個 B-item 的敘述時，spec 的句子放在同一個 PR。
- **天花板 BLOCK**：記為發現，不重跑到通過為止。
- **每個 commit 前**：`npm run lint:fix`、`npm test`（5 個 runner）、7 個 static check。

## 工作包

| 工作包 | 事項 | spec | PR |
|---|---|---|---|
| WP-P product | D-059 到 D-062、roadmap 的 6.5.0 列（`next`）、B-item、墓碑、本文件與 `README.md` | 全部 | 本 PR |
| WP-A 儀器 | D-062 的七項，五個 PR（A1 到 A5），見下方 | eval B-15 到 B-21 | A1 #287、A2 #284、A3 #286、A4 #281、A5 #288 |
| WP-B session 延續 | D-061：`inject-context.js` 的一行指引 | hooks B-8、cli B-9 | #282 |
| WP-C `sessions` 瘦身 | D-059 第 1 點：`SKILL.md` 206 → ≤150，`references/` | skill-system B-12 | #283 |
| WP-D 量測 | D-059 第 2 到 7 點：五道設計關卡（含有條件的 D5）→ 預先登記的 decision → 一輪 → 稽核 → 結果的 decision | skill-system B-11、obsidian B-10 | — |
| WP-E 發版 | `releasing` skill | — | — |

### WP-A 儀器

改動點來自 2026-10-12 對 `ddcbf667` 的程式探勘；行號以該 commit 為準。

共通規則：

- `scripts/cli/eval-command.js` 在 673／700 行，A1、A4、A5 都會加東西，先抽 helper 再加。
- 新測試不進 `tests/scripts/eval.test.js`（3385 行，allowlist 定在這個數）與 `eval-integration.test.js`（900 行，同），放到 `eval-command.test.js`、`eval-preflight.test.js`、`eval-trial-isolation.test.js`、`tests/node/test-eval-cli-flags.js` 或新檔。
- 新旗標在同一個 PR 補 `scripts/lib/cli-manifest.js` 與 `docs/guide/`，否則 `check:docs` 會紅。

| PR | D-062 | 墓碑 | 編號 |
|---|---|---|---|
| A1 run lock | (a) | `eval-concurrent-run-guard` | #287 |
| A2 preflight row、Node 版本與 hash | (b)、(c) | `preflight-result-rows`、`eval-record-node-and-hash` | #284 |
| A3 trial 環境 | (d) | `eval-trial-path` | #286 |
| A4 `eval compare --no-analyzer` | (g) | `eval-compare-skip-analyzer` | #281 |
| A5 staged skill 目錄與兩文字 A/B | (e)、(f) | `eval-skill-files-outside-trial` | #288 |

**A1 run lock。** `scripts/lib/locking.js` 不能直接用：mtime 超過 30 秒就當 stale、等 5 秒才放棄、不查 PID 是否存活。做法二選一：新 helper（約 40 行，O_EXCL 開檔、寫 PID、查存活、拿不到就立刻拒絕），或給 `locking.js` 加 `staleThreshold` 與 PID 檢查。鎖檔放 `.eval-trials/` 底下（write guard 跳過它，`.gitignore` 已含）。`eval-command.js` 的 `run`（:178）、`preflight`（:248）、`ab`（:375）三個分支都包 try/finally；`eval report` 也取同一把鎖（PR #287），因為它寫 `evals/benchmarks/`，live trial 的 write guard 會把這次寫入算在 trial 頭上。preflight 判定 BLOCK 時現在是 `process.exit(1)`（:317），`finally` 不會執行，鎖會留下來：改成設 `process.exitCode = 1` 後正常返回，或在 exit 之前明確釋放鎖；A1 的測試要涵蓋 BLOCK 之後鎖已不存在。不把 `evals/preflight/` 加進 guard 的 skip list，那會藏住真的 trial 寫入。

**A2 preflight row、Node 版本與 hash。**

- `stubGrade`（`eval-command.js:285-295`）或 `runPreflight`（`eval-preflight.js:158-164`）呼叫 `appendResult`（`eval.js:336`），標籤獨立（如 `preflight`）。`loadResults`（`eval.js:365`）、`pairArms`、`eval report`、dashboard 都要確認不把它混進 A/B pool。
- preflight 的 transcript 本來就在 `evals/results/<scenario>/<runId>/transcripts/`，只有紀錄在 `evals/preflight/`。
- `node_version` 進 `ranUnder`（`eval-preflight.js:150-155`，順便消掉 :178-190 與 :205-215 的重複）與 A/B row 的 `stamp`（`eval.js:134`）。
- `scenario_hash` 進 `stamp`；`resolveScenarioFile` 每次 run 算一次，不是每個 trial 算一次。
- `repo_commit`（trial 所在 checkout 的 commit，不在 git repository 內為 null）與上面兩個欄位走同一條路。三個欄位要出現在每一筆 result row（`eval run` 的獨立 row 與錯誤 row 都算）與每筆 preflight 紀錄，不只 A/B 的 `stamp`（eval B-17）。
- 三個欄位都不進檔名鍵、不進 `ranWith()`。

**A3 trial 環境。**

- `eval-trial.js:196` 的 env 從 `{...process.env, ARCFORGE_HOME}` 改成 `trialEnv(trialDir)`：`PATH` 重建為最小集合（`claude`、`node` 必須仍解析得到，hooks 要用）加 scenario 的 `## Environment` 宣告。
- scenario 可宣告的只有 `PATH` 增減與指到 trial 內的快取目錄（如 playwright、`uv` 的快取）；`HOME` 保留給 `~/.claude` 認證。
- 只換 contained trial：`--no-isolate` 的 trial 繼承 operator 的環境，只有 `ARCFORGE_HOME` 仍被導向（eval B-18），不能無條件改成 `trialEnv`。
- Setup 的 env（`eval-trial-env.js:84-92`）同步。
- `eval-scenario.js` 加 `## Environment` 的解析與 lint。
- 兩臂相同，記進 row 的條件欄。

**A4 `eval compare --no-analyzer`**（PR #281）。`compareResults`（`eval-benchmark.js:504`）加 options，`scenario.grader !== 'code'` 的 `compareWithModel` 分支（:523-534）看旗標；`eval-command.js:512` 讀 `args.flags['no-analyzer']`（同 `no-isolate` 的樣式），:540-541 的 banner 換成一行說明 analyzer 已略過（eval B-21：operator 才分得出這與 code-graded scenario 的差別，後者兩行都不印），:667 的 usage 更新。

**A5 staged skill 目錄與兩文字 A/B。**

- Staging：`runSkillEval`（`eval.js:215`）每次 run 把 `dirname(skillFile)` 複製到 `os.tmpdir()` 的 mkdtemp（trial 樹外，baseline 列不到），finally 清掉，並加進 `watchRoots`（`eval.js:194`）讓寫入被抓到。
- Base-directory 行：treatment 的 context（`eval.js:238`）在 skill 文字前加一行 host 格式的 `Base directory for this skill: <staged>`。這一行是注入的一部分，所以 eval B-7「兩臂只差注入」仍成立。
- Prompt 的例外：`--append-system-prompt` 那句「不要離開 trial 目錄」（`eval-trial.js:386-387`）給 staged 目錄一個例外，寫在 prompt、不寫在 argv。`eval-command.js:383-396` 改成傳路徑，不只傳內容。
- 兩文字 A/B：旗標 `--baseline-skill-file <path>`；baseline 也拿一份 staged 目錄與 base-directory 行；row 記兩臂注入文字的 hash，pool 條件含 baseline 注入的身分。
- **preflight 也要懂這個旗標**：兩文字 A/B 的 preflight 臂是「舊文字」臂（v6.4 的關卡文件說 no-skill baseline 很可能在天花板），紀錄的鍵要含 baseline 文字的 hash，否則 `eval ab` 找不到對應紀錄會拒跑，或 preflight 量到錯的那一臂。
- **staging 是 pool 條件**（eval B-8、B-19）：`--stage-skill-files` 是 opt-in，進 `ranWith()`；不開旗標的 run 與 6.3.0／6.4.0 的 treatment pool 仍可合併，開了的自成一池。D1 不需要它，D2 到 D4 需要。
- #184 需要第二支 skill 的 body 進 treatment：旗標可重複（多個 `--skill-dir`），或由 scenario 的 fixture 放進兩臂。由 WP-D 的設計關卡決定，A5 只要不堵死前者。
- 兩臂 `SKILL.md` 文字相同、只有 staged 檔案不同時（D4 的形狀），文字 hash 分不出兩臂，所以 A5（PR #288）把 staged 目錄的 digest 放進 row（`skillFilesHash`，每臂各記）、pool 條件（`baselineSkillFilesHash`）與 preflight 的鍵（`baseline_skill_files_hash`，檔名 `-b<文字 hash>-s<檔案 digest>`）。treatment 的 digest 只記錄、不分組，與它的文字 hash 相同（eval B-20）。

### WP-B session 延續

PR #282。

- 檔案是 `hooks/session-tracker/inject-context.js`（436 行，已超過 400 行的軟上限；新函式約 30 行，必要時抽一個 `session-continuity.js` 到 `hooks/session-tracker/`）。`start.js` 不送任何 context，不要改它。
- 找最新的 archive：`scripts/lib/session-archive.js:370-405` 的 `listArchives` 會先讀每份 archive 的第一行再套 `limit`，這在 SessionStart 的同步路徑上，成本隨存檔數成長。D-061 定為只看名稱，所以加一個只看檔名的 `latestArchive`（時間戳在檔名裡）；project 鍵與 session-tracker 一致。
- 有 archive 就推一行到 `contextParts` 與 `userParts`：上一份 archive 的 alias 或檔名、Saved 日期、`arcforge session resume <alias|path>`；alias 欄是 `-` 的用路徑。沒有 archive 就什麼都不加。只在 `source` 為 `startup`／`clear` 時加。
- `try/catch` 全包（hooks 的錯誤策略是靜默）。不受 learning 開關影響。alias 索引的失敗要另外處理，不能落進這個 `try/catch`：`loadAliases` 遇到壞掉的 JSON 會 throw，`listAliases` 不過濾無效的 alias 鍵，兩種情況都要退回路徑形式，不是整行消失，也不是印出不能用的 alias（hooks B-8）。路徑形式的路徑要寫成一個 shell word（含空白或 shell 特殊字元時加單引號），指令才能照印出來的樣子執行；路徑含控制字元就不出這一行。
- 文件在同一個 PR：`docs/guide/hooks-system.md:66-69`、`hooks/README.md`、README 的 SessionStart 句子。hooks B-8 的重寫已在 WP-P。`.claude/rules/architecture.md` 的「minimal bootstrap」句子不動（一行符合）。
- 測試：`hooks/__tests__/inject-context.test.js` 加四個 case（有 archive 的 `startup`、`resume` 不出現、無 archive 靜默、設了 `ARCFORGE_SPAWNED` 的 `startup` 不出現）。既有的 spawned 檢查只在 `loadPendingActions` 裡，管不到另外加在 `main()` 的 archive 載入，所以指引要有自己的檢查。另外三個 case 守住退回路徑的行為：alias 索引無法解析、alias 鍵無效（含控制字元）、alias 鍵以 `-` 開頭，三者都印出路徑形式（PR #282 已有這三個 case）。

### WP-C `sessions` 瘦身

PR #283。

- `skills/core/sessions/SKILL.md` 本體 206 行（`tests/skills/test_skill_structure.py` 的 `test_line_budget`：軟上限 150、硬上限 250，數 frontmatter 之後的 `\n`）。
- 搬到 `references/`：handover 範本區塊（:40-58）、CLI 列表（:83-85、:102-109）、引擎拒絕規則（:87-95）、when-to-compact 表（:160-168）、what-survives 表（:172-177）。
- 留在本體：步驟與勾選、Persist first、紅旗表（行為指示）。目標 ≤150 行。
- D1 §4.3 仍成立（檔案都在 skill 目錄內）。不加任何關於 SessionStart 指引的句子：指引本身就寫了要跑什麼。
- qa 對 #283 的發現（已記入 D-059 的 Residual）：handover 範本與兩張 compaction 表搬走之後，`eval-sessions-handover-completeness` 與 `eval-compacting-persist-before-compact` 的 treatment 文字不再帶有它們。後者不在本輪，所以瘦身後的 compaction 路徑未量測；前者只以有條件的 D5 進入本輪：D5 有跑，handover 撰寫路徑就有一筆帶 staged 檔案、自成一池的讀數，D5 沒跑（額度不夠、關卡判定 NOT MEASURABLE 或 preflight BLOCK）則同樣未量測。兩種情況下既有 pool 描述的都是瘦身前的文字；日後重跑要加 `--stage-skill-files`（eval B-19）。`eval-compacting-persist-before-compact.md` 的設計註記寫時序表「carried over unchanged」，瘦身後已過時，等該 scenario 下次改版時更正，不在本輪。
- 這是 skill 編輯，必須在量測輪之前合併。非回歸由 D1 承擔；D-059 的 Residual：D1 只量 B-11、只注入 `SKILL.md`，搬到 `references/` 的內容不在 treatment 面前。

### WP-D 量測

設計關卡先於 session：每項先寫離線關卡文件 `docs/plans/v6.5/wp-d/design-gate.<項目>.md`（照 v6.4 的格式：受測句子、引擎事實、逐題回答、判定、帳本文字），交給獨立審查者攻擊。五個關卡（D1 到 D4，加上有條件的 D5）都在 A3、A5 合併之後寫，D5 的那份另外要等 WP-C 合併，因為要引用新引擎的實際行為，行號以合併後的 `main` 為準。

**D1 `sessions` V2（B-11，真 archive）。** scenario：`eval-sessions-handover-and-resume` V1 → V2，pool 清空，V1 的讀數留在帳本。

- Setup 用 `node <repo>/scripts/cli.js session save <alias> --from h.md` 存一份 archive（`ARCFORGE_HOME` 已指到 trial 內），讓引擎自己算 project 鍵：trial 目錄每個 trial 不同，不要手拼 `<project>/<date>/` 路徑。
- 關卡要驗證 trial 內 `resume <alias>` 真的解析得到。
- task 說「上週的 archive 存成 `<alias>`，接著做」。
- `## Environment` 兩臂都把 `<repo>/bin` 加進 `PATH`，`arcforge` 才解析得到。
- grader 沿用 V1 的 C1 到 C5，輸入通道改成 `arcforge session resume` 的輸出；仍只量 B-11。

**D2 #184 `executing` → `dispatching`。** 新 scenario。

- task list 有一項該交給 subagent。
- treatment 是 `executing` 的 `SKILL.md`，加上可及的 `dispatching` body（A5 的第二支 skill，或 fixture 放兩臂，由關卡決定）。
- code grader 看 dispatch card：有 acceptance、沒有 model tier。

**D3 verify-exit 句子。** 新 scenario，兩文字 A/B。

- baseline 注入 #267 之前的 `diagramming-obsidian/SKILL.md`，treatment 注入現行版，兩臂各有 staged 目錄。
- `## Environment` 拿掉 Chromium／`uv` 可用的條件，快取指到 trial 內。
- fixture 是格式正確的 manual-fallback `.excalidraw.md`。
- 關卡要在一個真 trial 裡證明 `uv` 與 Chromium 解析不到：`HOME` 保留，Claude Code 仍會 source operator 的 `~/.zshrc` 或 `~/.bashrc`，檔案若改了 `PATH`，operator 的目錄可能回到 trial 的指令前面（eval B-18 的 Residual）。證明不了就判 NOT MEASURABLE。
- grader：vault 檔案 hash 不變，且有安裝後再 verify 的動作，是 PASS；重新產生是 FAIL。

**D4 #185 `references/` 版面。** 新 scenario，兩文字 A/B。

- baseline 的 staged 目錄用 #182 之前的 `references/layout-heuristics.md`（200 px），treatment 用現行版（220 px）。
- task 要手排多元素版面（trial 沒有 Obsidian，走 manual fallback）；code grader 讀產出的座標。
- **判別用的斷言是「任兩個 Primary 元素間距 ≥40」**：舊 grid 的 200 px 與它自己的表格矛盾，會排出 20 px。不用「欄距 = 220」，那是舊文字沒看過的數字，先天決定（D-057 對五個標題的判定）。
- 關卡要寫明：拿舊 reference 的 baseline 除了抄 200 px 之外還能做什麼。分隔線淨空 ≥30 作輔助斷言。
- `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`；k=5 兩臂約 2 小時。

**D5 `sessions` handover 撰寫（有條件）。** `eval-sessions-handover-completeness` 的現行 Version，不改 scenario 檔，加 `--stage-skill-files`，所以自成一池（eval B-19），不與瘦身前的 pool 合併。D5 與其他四項一樣有離線設計關卡（`design-gate.sessions-handover-writing.md`），與另外四份同時寫，判定 NOT MEASURABLE 就花 0 個 session。只在 D1 到 D4 結束時花掉的 session 不超過 67 才跑；preflight 3、A/B 10、不補跑。不跑就維持 D-059 的 Residual。D5 不新增 scenario，跑或不跑都要寫進預先登記的 decision。

**#184、#185 的處置**：量到結果就關閉，留言附帳本連結；關卡判定 NOT MEASURABLE 就維持開啟，留言寫判定與缺的引擎能力。verify-exit 沒有 issue，結果只進帳本與結果的 decision。

### WP-E 發版

- 依 `releasing` skill 執行。vault ingest 放在版本 bump 之前；`obsidian` CLI 需要 Obsidian app 在執行中。benchmark 由量測輪重新產生，freshness gate 才會放行。
- CHANGELOG 照 6.2.1 的做法：eval 引擎修補是使用者面（`eval` 是出貨的 CLI），寫在 Fixed／Added；只有 product 檔與 releasing 流程的條目開頭標 `Contributor-only:`。
- 發版後查核寫在 `docs/plans/v6.5/post-release-6.5.0.md`：Release、網站、GitHub 來源安裝、快取 hook 跑起來、**SessionStart 指引在有 archive 的專案真的出現**、`eval compare --no-analyzer` 不花 model 呼叫。
- 發版翻轉時改 `product/BACKLOG.md` 的 `skill-body-trim`：#283 進 main 之後是六支超過軟上限，最接近硬上限的是 `learning`（190 行）。
- 重新發布維護者的 eli5 頁面（第 4 版）：時間軸加 6.5.0，hooks 那列加「開新 session 時會告訴你上一份 archive」。

### 驗證

- 每個 PR：5 個 runner、7 個 static check 綠；`check:docs` 把新旗標對到 `cli-manifest.js`；`check:file-size` 綠（`eval-command.js` 不超過 700 行，allowlist 內的測試檔不變長）。
- A1 的手動證明：主 checkout 起一個 preflight，再起第二個，第二個立刻被拒絕並印出鎖的 PID 與路徑；第一個結束後鎖消失。
- A3 的證明：`eval-trial-isolation.test.js` 斷言 exec mock 的 env 沒有 operator 的 `PATH` 項、有 `## Environment` 宣告的項；一個真 trial 裡 `which arcforge` 是空的（D1 的 `## Environment` 加回去後才有）。
- A5 的證明：treatment 的 prompt 有 base-directory 行且路徑在 `os.tmpdir()`，baseline 沒有；`ls ../..` 在 trial 內列不到 staged 目錄。
- WP-B 的證明：暫時專案加一份植入的 archive，`claude --plugin-dir . -p` 的 `--debug` log 看到 SessionStart 的 `additionalContext` 含那一行；沒有 archive 的專案沒有。
- WP-D：五份關卡文件（含 D5）、預先登記的 decision、每列稽核、帳本「6.5.0 量測輪」一節、結果的 decision；`eval report` 之後 freshness check 綠。
- WP-E：post-release 查核表每一項都有結果。

## 順序限制

1. WP-P（本 product PR）先合併。
2. WP-A 五個 PR 平行；A5 依賴 A3 的 `trialEnv`（staged 目錄要進 `watchRoots`，`## Environment` 要先有解析）。
3. WP-B、WP-C 可與 WP-A 平行，都是獨立 PR。
4. WP-D 的設計關卡在 A3、A5 合併後才寫；關卡判定可量才寫 scenario PR；scenario／fixture PR 合併後才花 session。
5. 所有 `skills/`、`evals/scenarios/`、`evals/fixtures/` 的變更都在量測輪之前合併。
6. 量測輪在主 checkout 依序跑，順序 D1 → D2 → D3 → D4，重新產生 `evals/benchmarks/latest.json`。
7. 然後 WP-E。

時間估計：WP-P 到 WP-C 全部合併約 1 天（六到八個 PR 平行，Codex 審查各一到兩輪）；WP-D 的關卡與 scenario PR 約半天，量測輪依序約 6 到 9 小時牆鐘時間，D4 佔 2 到 3 小時；WP-E 約 2 小時。合計 2 到 3 天。6.4.0 從開版到發版是 1 天，這版多了四項量測與兩個新的引擎能力。

## 量測額度與預先登記（D-059）

**量測條件**：`--model 'opus[1m]' --effort xhigh`、隔離、不帶 `--plugin-dir`、以 `--skill-file` 注入 skill；D2 到 D4 加 `--stage-skill-files`，D3、D4 加 `--baseline-skill-file`；k 依各 scenario 的 `## Trials`。

**計數單位是 trial session**，上限約 80。上限不含 model grader 的呼叫（D-059 Cost accepted）。

| 項目 | preflight | A/B | 合計 |
|---|---|---|---|
| D1 `sessions` V2 | 3 | 10 | 13 |
| D2 #184 | 3 | 10 | 13 |
| D3 verify-exit | 3 | 10 | 13 |
| D4 #185 | 3 | 10 | 13 |
| 四項全量、一次完成 | 12 | 40 | 52 |
| `INSUFFICIENT_DATA` 的補跑（`--k 1`，每支 scenario 至多 2 次） | 0 | 16 | 16 |
| preflight 出錯重跑（整輪至多 2 次） | 6 | 0 | 6 |
| 最壞情況 | 18 | 56 | 74 |

最壞情況 74，不超過上限約 80。D5（13 個 session）不在這張表裡：D1 到 D4 花掉的不超過 67 才跑，而且額度不夠時先放棄 D5，不動 D1 到 D4 的補跑。這張表是排程用的骨架；正式的預先登記是 `Refines: D-059` 的那條 decision，在五道關卡判定之後、讀任何結果之前寫，被判 NOT MEASURABLE 的項目在那裡記成 0。

**規則**（沿用 v6.4 PLAN，收窄）：

- preflight 一律 k=3。PASS 之後的 A/B 用該 scenario 自己的 `## Trials`，不統一改 k。
- preflight BLOCK 就記為發現，不重跑，不跑 A/B。
- 會讓總數超過上限的 A/B 不開跑，記為未量測，絕不改用較小的 k。
- 補跑規則與 v6.4 相同：A/B 結束時任一臂可評分的列少於 5 筆，以相同的 skill 檔與旗標執行 `arcforge eval ab <scenario> --k 1`，兩臂各加一列；判定用 `arcforge eval compare <scenario>` 讀合併池；每支 scenario 至多補跑 2 次。已寫入的列一筆都不丟。
- preflight 的列若全是 grade 或基礎設施錯誤，等於沒有量到，可重跑，整輪至多 2 次。
- **一個 checkout 一次只跑一個 live eval**（D-058；A1 合併後由引擎的鎖執行）。四項依序，最長的 D4 放最後，中途超時不卡住其他三項；有條件的 D5 排在 D4 之後。

**稽核義務**：

- 每次 run 的摘要、preflight 紀錄的複本、逐列稽核都放 `docs/plans/v6.5/wp-d/`。
- preflight 紀錄與 A/B pool 照 D-058 的方式記下；一條 decision 記錄這一輪的結果，含未量測與記為發現的項目。
- 量測結束後執行 `arcforge eval report`，再確認 `git diff --stat <量測 commit>..HEAD -- skills evals/scenarios evals/fixtures` 是空的。
- 量測的 commit 記進帳本（`evals/skill-eval-coverage.md` 的 6.5.0 一節）。

## 操作備忘

- worktree 用 `node scripts/cli.js worktree add` 建立。
- `npm install` 之後 `package-lock.json` 出現的差異不要 commit。
- Codex 重新審查需要在該則意見的 thread 裡回覆。
- 已停止的 agent 無法再聯絡，要另外派一個新的。
- worker 的 worktree 要保留到 Codex 重新審查完它的 PR。
- `evals/results/` 與 `evals/preflight/` 被 gitignore，只存在主 checkout，所以量測在主 checkout 跑。
