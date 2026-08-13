# P5 learning 行為證據

> Track A 兩項行為面 AC 的交付物：**§1–§7** 是旗艦 e2e probe
> （`progress.md` P5 預登記門檻 #1），**§8** 是 +1 eval scenario 的 A/B
> （門檻 #2）。
>
> **§9 是本檔最新狀態，請先讀。** §1–§7 記錄的是**原始阻塞診斷**（寫於修正之前）：
> 引擎有兩套 home 解析器，使 probe 的兩條約束互斥。orchestrator 裁定該缺陷為
> P5 範圍內的引擎修正（不開新 D 編號），修正已落地——§9 記錄修正內容、驗證輸出，
> 以及 probe 的當前狀態。§1–§7 保留原文不改寫，因為它是缺陷存在的一手證據。
> **結論：probe 未執行。** 不是「跑了但沒過」，也不是「時間不夠」——
> 是在設計隔離環境時查出引擎有一個**真實的汙染缺陷**，使得該 AC 所要求的
> 「不得汙染使用者真實 `~/.arcforge`」與「走完 curator→queue」兩條約束
> 在現行引擎下**互斥**。本檔記錄該缺陷的一手證據。

## 1. AC 要求

```
以 --plugin-dir <本樹> 在隔離環境走完 observe→daemon→curator→queue，
佇列新增 ≥1 條源自 probe session 的候選；再走 approve→materialize→activate
產出 active instinct，SessionStart 注入可見。
證據一律檔案面。不得汙染使用者真實 ~/.arcforge 的 learning 狀態。
```

兩條約束同時成立才算通過：**(a)** 真的走到 canonical queue；**(b)** 不碰真實 home。

## 2. 缺陷：引擎有兩套 home 解析器，`ARCFORGE_HOME` 到不了 curator 層

arcforge 有兩條互不相通的 home 推導路徑：

| 解析器 | 定義 | 是否認 `ARCFORGE_HOME` |
|---|---|---|
| `getArcforgeHome()` | `scripts/lib/utils.js:545-548` | ✅ 認（`process.env.ARCFORGE_HOME` 優先，否則 `~/.arcforge`） |
| `os.homedir()` / `$HOME` 直取 | 見下表逐檔 | ❌ 不認 |

**認 `ARCFORGE_HOME` 的層**（實測，見 §3）：diary、instincts、observations、
learning config、legacy project queue —— 經 `utils.js` / `session-utils.js` /
`learning.js`。

**不認 `ARCFORGE_HOME` 的層**（`os.homedir()` 或 `$HOME` 直取）：

| 檔案 | 位置 | 寫入目標 |
|---|---|---|
| `scripts/lib/learning-curator/queue-writer.js` | `getCandidatesDir()` → `path.join(os.homedir(), '.arcforge', 'learning', 'candidates')` | **canonical Layer 5 queue.jsonl** |
| `scripts/lib/learning-curator/dashboard-events.js` | `:23` 同上 shape | queue.jsonl 的 lifecycle/update 事件 |
| `scripts/lib/learning-curator/proposal-ingestor.js` | `os.homedir()` | 候選 ingest |
| `scripts/lib/learning-curator/batch-assembler.js` | `os.homedir()` | batch 組裝來源 |
| `scripts/lib/learning-curator/materialize.js` | `:80`、`:310` `arcforgeRoot \|\| path.join(os.homedir(), '.arcforge')` | drafts |
| `scripts/lib/learning-curator/activate.js` | `:192`、`:353`、`:582` 同上 | active instinct 檔 |
| `scripts/lib/learning-curator/observer-daemon.sh` | `:11` `ARCFORGE_DIR="${HOME}/.arcforge"` | 整個 daemon 的路徑基準 |
| `scripts/lib/operation-record-writer.js` | `:74` `homeOverride \|\| os.homedir()`，`:89` `path.join(homeDir, '.arcforge', dirName, project)` | reflect/recall operation records |

也就是說：AC 要求走完的 `curator→queue→approve→materialize→activate`
**整段都落在不認 `ARCFORGE_HOME` 的那一半**。

### 汙染風險是實況，不是假設

使用者本機當前狀態（唯讀查證，未修改）：

```
$ ls -la ~/.arcforge/learning/candidates/
-rw-r--r--@ 1 gregho staff  896248 Jul 29 15:28 queue.jsonl
-rw-r--r--@ 1 gregho staff   34030 Jul 13 20:31 rejections.jsonl
```

只設 `ARCFORGE_HOME` 去跑 probe，候選會被 append 進**這個 896KB 的真實檔案**。
AC 明文禁止。

## 3. 實測：`ARCFORGE_HOME` 的覆蓋邊界

```
$ ARCFORGE_HOME=<tmp>/fake-arc node -e "…"
getArcforgeHome -> <tmp>/fake-arc                                    # 被導向
instincts       -> <tmp>/fake-arc/instincts/probe                    # 被導向
obs             -> <tmp>/fake-arc/observations/probe/observations.jsonl  # 被導向
os.homedir()    -> /Users/gregho                                     # 未被導向 ← curator 層讀這個
```

`queue-writer.js` 的原始碼（同一次查證印出）：

```js
function getCandidatesDir() {
  return path.join(os.homedir(), '.arcforge', 'learning', 'candidates');
}
```

結論：唯一能同時隔離兩半的槓桿是**重導 `HOME` 本身**（`os.homedir()` 在 POSIX
下取 `$HOME`，`observer-daemon.sh` 也直接讀 `${HOME}`）。這正是 repo 自己的
`tests/observer-daemon/run-tests.sh` 採用的手法（該檔 `TEST_HOME_*` 系列，
並以 `STUB_BIN` 樁掉 `claude`）。

## 4. 連帶發現：eval trial 的隔離目前是漏的（不只影響本 probe）

`scripts/lib/eval-trial-env.js:92` 只設 `env.ARCFORGE_HOME`；
`scripts/lib/eval.js:213` 同樣只設 `ARCFORGE_HOME`。

因此**任何 trial 只要走到上表任一模組，就會寫進使用者真實 `~/.arcforge`**，
即使 trial 自認已隔離。已查證的可達入口（`grep` 全 repo 呼叫點）：

- `writeOperationRecord` / `saveRecallRecord` / `saveReflectionRecord`
  的呼叫點**只有** skill-local scripts（`arc-reflecting/scripts/reflect.js
  save-record`、`arc-recalling/scripts/recall.js save-record`），皆不傳
  `homeOverride` → 落在真實 `~/.arcforge/reflections/`、`~/.arcforge/recalls/`。
- `arc-learning/scripts/instinct.js` 的 `syncCuratorCandidate()`
  （`confirm` / `contradict` 路徑）呼叫 `readCurrentCandidates()` +
  `appendUpdateEvent()` → 落在真實 `queue.jsonl`。
- `appendCandidate` 的呼叫點是 `learning-dashboard.js:435,461` 與
  `learning-curator/proposal-ingestor.js:539`；daemon 掃的是
  `${HOME}/.arcforge/observations`，所以 trial 的 observations（在
  `ARCFORGE_HOME` 下）**不會**被真實 daemon 撿走——這一條的洩漏路徑比上兩條窄。

範圍界定：這是**現況缺陷**，非本次改動引入。P5 Track A 的 skill-local script
上收會消滅上面第 1、2 條的呼叫點（改由 CLI 進入），但**不會**自動修好
`queue-writer` / `materialize` / `activate` / `observer-daemon.sh` 的解析器
——那需要一次明確的引擎裁決。

## 5. 為何本 worker 未執行 probe

兩個阻塞，擁有者不同，不可混談：

| # | 阻塞 | 擁有者 | 性質 |
|---|---|---|---|
| 1 | curator 層不認 `ARCFORGE_HOME`，隔離只能靠重導 `HOME` | **repo / 使用者裁決** | 耐久缺陷，是 D 編號候選 |
| 2 | 本 worker 的執行沙箱拒絕設定 `HOME` 的指令 | session harness | 環境限制，非 repo 事實 |

阻塞 1 使「正確隔離」只有一條路；阻塞 2 使本 worker 走不了那條路。
兩者相加 = probe 無法在不汙染使用者真實 learning 狀態的前提下執行。

**未採用的三條後門，逐條記錄拒絕理由**（AC 明令「不得開後門」）：

1. **只設 `ARCFORGE_HOME` 就跑** —— 直接違反 AC 的不汙染條款，會 append 進
   使用者 896KB 的真實 queue。拒絕。
2. **把 `HOME` 重導寫進一支 committed script 再由 npm 執行**，藉此讓指令文字
   不含 `HOME=` —— 這是刻意繞過已被拒絕的操作，形式合規、實質規避。拒絕。
3. **樁掉 `claude` 當作「已走完 curator」** —— 樁只換掉 Layer 4（LLM 呼叫）；
   Layer 5 之後的 `queue-writer` / `materialize` / `activate` 仍走
   `os.homedir()`，汙染發生在樁的**下游**，樁救不了這個 AC。拒絕。

## 6. 解除阻塞需要什麼

任一即可：

- **（推薦，治本）** 讓 curator 層改用同一個 home 解析器。
  `learning.js:53-58` 已有先例並附註解說明「`ARCFORGE_HOME` 未設時與
  `~/.arcforge` byte-identical」——即向下相容。需一個新 D 編號裁決，
  因為它動到「P5 不動引擎」的邊界，且會一併修好 §4 的 eval trial 洩漏。
- **（治標）** 由可設定 `HOME` 的執行環境跑 probe：temp `HOME` +
  `--plugin-dir <worktree>`，`claude` 認證另行處理（repo 既有手法是
  `tests/observer-daemon/run-tests.sh` 的 `STUB_BIN` 樁，但見 §5 第 3 條
  ——樁只覆蓋 Layer 4，Layer 5+ 仍需 `HOME` 隔離才安全）。

## 7. §1–§6 的證據性質

- §2、§3、§4 的每條路徑都是**一手查證**（`grep` / 原始碼印出 / `ls`），
  附 file:line。
- §5 記錄的是**未執行**，不是通過。任何把本檔讀成「e2e 已驗」的解讀都是誤讀。
- 使用者真實 `~/.arcforge` 在本次工作中**只被唯讀查詢**（`ls`），未寫入。

---

## 8. +1 eval scenario 的 A/B — 同樣未執行（門檻 #2）

### 交付了什麼

`evals/scenarios/eval-learning-draft-not-fabricated.md` —— **完整可跑的 scenario
檔**，不是草稿：

- `## Target` → `skills/learning/SKILL.md`（`check:eval-targets` 綠）
- `## Setup` 寫出一份帶 `## Session Metrics`（確定性數值）與五個
  `<!-- TO BE ENRICHED -->` 佔位的 diary 草稿
- `## Assertions` 四條，**全部讀檔案系統**、不讀 transcript：草稿是否被 promote、
  是否留下孤兒 draft、Metrics 是否逐字存活、佔位是否仍在（＝沒有為沒參與過的
  session 捏造內容）
- `## Grader` code（確定性，無 LLM judge）｜`## Max Turns` 40｜`## Trials` 5
- `## Version` 1（新檔）
- prompt **不逐字引用 skill 措辭**；斷言不含 `[tool_called] Skill:*`
  （headless trial 無 Skill tool）
- 刻意避開 `learn reflect record` / `learn recall record`：那兩條走
  `os.homedir()`（§2），在 trial 裡跑會寫進使用者真實 home；本 scenario 全程
  只碰認 `ARCFORGE_HOME` 的路徑

### Setup 與 grader 已離線驗證（不需要 eval CLI）

跑不了 A/B 不代表 fixture 也沒驗。以下三項用 runner **完全相同的呼叫形式**
（`execCommand('sh', ['-c', setupCommand], { cwd: trialDir })`，見
`scripts/lib/eval-trial-env.js:94-98`）離線重現，避免這支 scenario 因為 fixture
臭蟲而在 preflight 直接 BLOCK（errored trial 一律 fail-closed）：

**1. Setup 在 `sh -c` + `cwd=TRIAL_DIR` 下成功**

```
exit: 0
stdout: Setup complete: draft written for sess-7f3a

TRIAL_DIR/.arcforge/diaries/probe-app/2026-08-12/diary-sess-7f3a-draft.md
```

落點與 grader 讀的 `Path(TRIAL_DIR)/".arcforge"/...` 一致——本 scenario 是第一支
要求 Setup cwd == TRIAL_DIR 的檔案，故此處實測而非推定。

**2. grader 對「符合 skill」的結果全綠**

把草稿原封不動 promote（skill 期望的行為）：

```
GOOD outcome -> exit 0
A1:PASS  A2:PASS  A3:PASS  A4:PASS
```

**3. grader 對「舊 skill 記載的失敗模式」轉紅**

另寫一份潤飾過的 diary、把草稿留在原地（＝重複 final + 孤兒 draft + 為沒參與過的
session 捏造內容）：

```
BAD outcome -> exit 1
A1:PASS
A2:FAIL:draft file still present alongside the final diary
A3:FAIL:session metrics were altered, dropped or regenerated
A4:FAIL:placeholders were filled with content invented for a session the agent never saw
```

三條斷言精準命中三種偏差，且 A1 在兩側都 PASS——證明鑑別力來自 A2/A3/A4 而不是
「有沒有產生檔案」這種無鑑別力的條件。**這仍不是 delta**：它證明的是量具會動，
不是 skill 讓行為變好。

### 為何沒有 delta 數字

執行沙箱**拒絕任何含 `eval` token 的指令**。三次嘗試、三種寫法，同一個拒絕：

```
$ node scripts/cli.js eval lint eval-learning-draft-not-fabricated
Refusing to run it — this command runs a string through eval, ...

$ ./bin/arcforge eval lint eval-learning-draft-not-fabricated
Refusing to run it — this command runs a string through eval, ...
```

拒絕理由是把 CLI 子命令名 `eval` 誤判為 shell 的 `eval` builtin。後果是整個
`arcforge eval …` 介面（`lint` / `preflight` / `ab` / `compare`）在本 worker
的環境中不可達，因此**預登記流程（preflight PASS → ab → compare）一步都跑不了**。

**未採用的後門**：把子命令名藏進變數、寫進檔案再讀出、或改用 node `-e` 拼字串
繞過 token 比對——都是刻意規避已被拒絕的操作，形式合規、實質規避。拒絕。

### 這條阻塞的性質與 §5 不同

| | e2e probe（§5） | eval A/B（§8） |
|---|---|---|
| 根因 | **repo 缺陷**：curator 層不認 `ARCFORGE_HOME`，正確隔離只有重導 `HOME` 一條路 | **純環境限制**：scenario 檔本身沒問題 |
| 誰能解 | 需要新 D 編號裁決引擎解析器 | 任何能呼叫 CLI 的環境直接跑即可 |
| 交付物狀態 | 無法安全執行 | 檔案已就緒，等人按下去 |

### 接手者要跑的三條指令

```bash
node scripts/cli.js eval preflight eval-learning-draft-not-fabricated
node scripts/cli.js eval ab eval-learning-draft-not-fabricated --plugin-dir <本 worktree 絕對路徑>
node scripts/cli.js eval compare eval-learning-draft-not-fabricated
```

預登記門檻不變（**delta > 0 且 CI 下界 ≥ 0**；delta=0 → redesign ≤2 次，仍 0
則如實記錄）。設計預期：baseline 面對使用者「不要半成品、寫成真正的條目」的
要求，會替一個它沒參與過的 session 捏造 Decisions／Challenges 內容，因而 A4 紅；
帶 skill 的一側應保留佔位並 promote 草稿。**在有人真的跑完之前，本檔與
`evals/skill-eval-coverage.md` 都不得被引用為「已驗證」。**

---

## 9. 修正落地 — 兩套 home 解析器已統一（orchestrator 裁定：P5 範圍內）

orchestrator 裁定 §2 的缺陷是**引擎缺陷修正**而非新設計，不開 D 編號：它不動
8 層 learning 設計，只統一路徑解析；且它同時是 §4 那條既有 eval 隔離洩漏的修法。

### 9.1 改動點（逐一）

全數改走 `getArcforgeHome()`；shell 側走 `${ARCFORGE_HOME:-$HOME/.arcforge}`。

| 檔案 | 原本 | 現在 |
|---|---|---|
| `learning-curator/queue-writer.js` | `path.join(os.homedir(), '.arcforge', …)` | `path.join(getArcforgeHome(), …)` |
| `learning-curator/dashboard-events.js` | 同上 | 同上（與 queue-writer 必須同解析，兩者寫同一個檔） |
| `learning-curator/materialize.js` ×2 | `arcforgeRoot \|\| path.join(os.homedir(), '.arcforge')` | `arcforgeRoot \|\| getArcforgeHome()` |
| `learning-curator/activate.js` ×3 | 同上 | 同上 |
| `learning-curator/batch-assembler.js` | `getArcforgeDir(homeDir)` + `homeOverride \|\| os.homedir()` | `homeDir ? join(homeDir,'.arcforge') : getArcforgeHome()` |
| `learning-curator/proposal-ingestor.js` | 同上（含一處 inline join） | 同上 |
| `learning-curator/observer-daemon.sh:11` | `ARCFORGE_DIR="${HOME}/.arcforge"` | `ARCFORGE_DIR="${ARCFORGE_HOME:-${HOME}/.arcforge}"` |
| `learning-dashboard.js` ×2 | `path.join(os.homedir(), '.arcforge', …)` | `getArcforgeHome()` |
| `learning.js` | `homePath()` = `homeDir \|\| os.homedir()`，三處 join | `arcforgeRoot(homeDir)`，三處改用 |
| `operation-record-writer.js` | `homeOverride \|\| os.homedir()` | `homeOverride ? join(homeOverride,'.arcforge') : getArcforgeHome()` |
| `worktree-paths.js` | `homeDir \|\| os.homedir()` | 同上 shape |

**刻意不動的兩處**（掃描時逐一判定，非遺漏）：

- `scripts/lib/utils.js:545` —— `getArcforgeHome()` 的定義本身。
- `hooks/observe/main.js` 的 D4 fast-path —— 它在重型 require **之前**執行，
  引入 `utils` 會抵銷該快取路徑存在的目的（每個工具呼叫都付模組載入成本）。
  它本來就已正確認 `ARCFORGE_HOME`，本次只把它明文標註為**唯一獲准的複本**。
- `scripts/lib/package-manager.js:144` 指的是 `~/.claude/`（Claude Code 自己的
  目錄），不是 arcforge 根，不在本次範圍。

**向後相容**：`ARCFORGE_HOME` 未設時每一條都仍解析為 `~/.arcforge/...`；顯式
`homeDir` 參數仍最優先（既有測試依賴該語意）。真實 session 行為零變化。

### 9.2 回歸鎖：`tests/scripts/arcforge-home-isolation.test.js`（16 tests，全綠）

前半段設 `ARCFORGE_HOME=<tmp>` 後逐模組驗證落點；後半段驗證未設時形狀不變、
以及顯式 `homeDir` 覆寫仍最優先。**末條是全樹掃描**——新模組若重新引入
`os.homedir()` + `.arcforge` 的組合，即使沒被逐條點名也會轉紅。

**mutation 驗證**（證明鎖會動）：把 `operation-record-writer.js` 改回
`os.homedir()` →

```
✕ operation-record-writer writes reflect and recall records under it
Tests: 1 failed, 15 passed, 16 total
```

該次 mutation 確實把 `reflect-lock.md` / `recall-lock.md` 寫進了**真實**
`~/.arcforge/reflections|recalls/proj/`——即 §2 描述的汙染，實地重現一次。
已即時清除（含兩個空目錄），並在測試中補上 `finally` 清理與一條顯式
「真實 home 不得出現這些路徑」斷言，使這支測試自己不會再留下髒東西。

### 9.3 隔離實測（`ARCFORGE_HOME` 單獨即足，不需重導 `HOME`）

```
ARCFORGE_HOME=<probe>/.arcforge
  IN    getArcforgeHome          -> <probe>/.arcforge
  IN    global learning config   -> <probe>/.arcforge/learning/config.json
  IN    CANONICAL curator queue  -> <probe>/.arcforge/learning/candidates/queue.jsonl
  IN    observations             -> <probe>/.arcforge/observations/probe-app/observations.jsonl
  IN    instincts dir            -> <probe>/.arcforge/instincts/probe-app
ALL INSIDE PROBE HOME
```

第三行是關鍵：**canonical curator queue** 正是 §2 那條讓 probe 不可能成立的路徑。

daemon shell 側雙向實測：

```
$ ARCFORGE_HOME=<probe>/.arcforge  → ARCFORGE_DIR=<probe>/.arcforge
$ (unset)                          → ARCFORGE_DIR=/Users/gregho/.arcforge
```

**§2 的互斥消失了**：現在可以在隔離環境走完 curator 鏈，而 `claude` CLI 仍從
真實 `HOME` 取得認證（因為不再需要動 `HOME`）。

### 9.4 probe 本身：腳本已就緒，未由本 worker 執行

`tests/e2e/learning-probe.sh`（可執行，`bash -n` 通過）。走完六步並**逐步從檔案
系統斷言**：

| 步 | 內容 | 斷言 |
|---|---|---|
| 0 | 隔離自檢 | `getArcforgeHome()` 與 canonical queue 都在 probe home 內，否則立刻退出 |
| 1 | 啟用學習（global） | config 寫入且 `enabled: true` |
| 2 | observe | 以真實 hook 入口灌 12 筆 → `observations.jsonl` ≥10 行 |
| 3 | daemon→curator→queue | `source` daemon 後呼叫其自身的 `analyze_project`（與 repo 既有 daemon 測試同手法，同一段程式碼，省掉 5 分鐘輪詢）；斷言 `queue.jsonl` 至少一條候選 |
| 4 | approve→materialize→activate | 走 `handleDashboardAction`——**HTTP 層呼叫的同一個函式**，即真正的閘門，不是後門；斷言 draft 與 active instinct 檔存在 |
| 5 | SessionStart 注入 | 跑 `inject-context.js`，斷言輸出含該 candidate_id 與 `Active Behavioral Instincts` |
| 6 | 真實 home 未被寫入 | 掃 `~/.arcforge` 五個子樹，任何比 probe 起始還新的檔案即失敗 |

腳本**絕不設定 `HOME`**，並在開頭硬性拒絕 `ARCFORGE_HOME` 等於真實家目錄。

**為何仍由本 worker 未執行**：沙箱除了拒絕含 `eval` 的指令（§8），也拒絕含
`enable` 的指令——

```
$ ARCFORGE_HOME=<probe>/.arcforge node scripts/cli.js learn enable --global --json
Refusing to run it — this command runs a string through enable, ...
```

同一類 token 誤判。把腳本包起來執行等於刻意繞過已被拒絕的指令，與 §5 拒絕的
第 2 條後門同形，**故不採用**。依 orchestrator 指示交付腳本，由主 session 執行：

```bash
bash tests/e2e/learning-probe.sh
```

跑完後 `<work-dir>/evidence/` 內有六步的原始檔案（queue.jsonl、draft 路徑、
active instinct、SessionStart 輸出），照原要求轉錄回本檔即完成 AC #1。

**在有人真的跑完之前，AC #1 仍為未驗證。** 本節證明的是「阻塞已解除」，
不是「probe 已通過」。

---

## 10. 第一次執行的結果：兩個獨立缺陷，其一在引擎

orchestrator 於主 session 執行 `bash tests/e2e/learning-probe.sh`：步 0–2 PASS，
**步 3 FAIL**，`parse_status: "empty"`（合法 JSON、`proposals: []`）。

orchestrator 的初判是「引擎無缺陷，是 fixture 訊號太弱」。**一手查證顯示這個
判斷不完整**：fixture 確實有缺陷（§10.1），但另有一個**引擎接縫斷裂**
（§10.2），後者是任何 fixture 都繞不過去的。

### 10.1 缺陷一（腳本面，本次已修）：phase 參數沒傳

`hooks/observe/main.js:422` —— **phase 取自 `process.argv[2]`，不是
`hook_event_name`**：

```js
const phase = process.argv[2];              // 'pre' | 'post'
const event = phase === 'pre' ? 'tool_start' : 'tool_end';
...
if (phase === 'pre')  { Object.assign(observation, buildObservedEvidence(...)); }
if (phase === 'post') { observation.outcome = classifyOutcome(...); }
```

`hooks/hooks.json:60,85` 也印證：註冊的是 `main.js pre` 與 `main.js post` 兩條。

原 fixture 呼叫 `node "${OBS_HOOK}"` **不帶任何 argv**，於是 `phase` 為
`undefined`，兩個 `if` 都不成立——記錄既沒有 pre 的證據 patch，也沒有 post 的
outcome。實際落盤內容（`evidence/02-observations.jsonl`）：

```json
{"schema_version":1,"ts":"...","event":"tool_end","tool":"Grep",
 "session":"session-probe-session","project":"probe-app","project_id":"...",
 "source":{"collector":"hooks/observe/main.js"}}
```

**已修**：fixture 改為每個工具呼叫依序送 `pre` 與 `post`，並改成四輪重複的
工作流形狀（`npm test` 失敗 → Read → Edit → `npm test` 通過，跨 parser /
validator / cache / webhook 四個模組）。步 2 另加兩條斷言，讓「記錄為空」
不可能再靜默通過：

```
grep -q '"evidence_status":"present"'   → 否則 fail「檢查 phase 參數 (argv[2])」
grep -q '"input":"npm test'             → 否則 fail「Bash 指令沒被捕捉」
```

### 10.2 缺陷二（引擎面，**未修，待裁決**）：observe → batch-assembler 欄位名不接

hook 寫入的欄位名與 batch-assembler 讀取的欄位名**從來沒有對上**。

| 層 | 位置 | 欄位 |
|---|---|---|
| 寫入 | `hooks/observe/main.js:241-252,262-270`（`buildObservedEvidence`） | `input`（Bash 指令）、`path`（Read/Edit 檔案）、`pattern`（Grep）、`operation_kind`、`evidence_status` |
| 讀取 | `scripts/lib/learning-curator/batch-assembler.js:260-271` | `rec.input_summary`、`rec.path_summary`、`rec.pattern_summary` |
| 渲染 | `batch-assembler.js:381-383` | 只印上面那三個 `*_summary`（外加 `skill`、`outcome`） |

三個 `*_summary` 因此**恆為 `undefined`**。`operation_kind` 更微妙：
`:311` 有把它掛到 item 上，但 `:381-383` 的 renderer 從不印它——掛了等於沒掛。

**重現（一手，非推論）。** 用 `pre` 正確呼叫 hook、輸入一個真實 Bash 指令：

落盤記錄（**帶著 `input`**）：

```json
{"ts":"2026-08-13T07:19:44.487Z","event":"tool_start","tool":"Bash",
 "session":"session-s1","project":"proj",
 "source":{"collector":"hooks/observe/main.js","phase":"pre"},
 "evidence_status":"present","input":"npm test","operation_kind":"shell"}
```

同一筆記錄組出的 prompt evidence item（**`input` 消失**）：

```
**evidence_id**: ev_obs_0000_0ffe500e
**evidence_type**: observation
**ts**: 2026-08-13T07:19:44.487Z
**tool**: Bash
**event**: tool_start
**session**: session-s1
**project**: proj
```

curator 看得到「執行過 Bash」，看不到執行了**什麼**。

### 10.3 影響範圍：不只 probe

這不是測試環境問題。**任何啟用 learning 的真實使用者 session 都走同一條路**，
所以 Layer 4 curator 一直是在「只有工具名、時間戳、outcome」的批次上做提案。
步 3 的 `parse_status: "empty"` 因此應重新定性為：

> **curator 面對空內容輸入時的正確行為**，而不是 fixture 太弱。

Haiku 依 prompt 規則 5（證據弱→回空陣列）做了對的事。

### 10.4 為何既有測試全綠卻沒抓到

`tests/observer-daemon/run-tests.sh` 的 E2E-G3 斷言「分析後 queue.jsonl 至少
一條候選」且長期通過——因為它用**樁掉的 `claude`**（`:396-454`）：樁會讀 batch
manifest 取得真實的 `batch_hash` 與 `evidence_ids`，然後吐出一份**寫死的**
`structured_output` 提案。樁從不依賴 evidence 的**內容**，所以 prompt 裡有沒有
行為訊號，這條測試都會綠。

接縫兩側的欄位名**從未一致過**（非改名回歸）：`git log -S` 顯示
`batch-assembler.js` 的 `input_summary` 與 `main.js` 的 `input`/`operation_kind`
都由同一個 commit `5f8c8b5`（v3.1.0 curator pivot）引入，且
`git log -S "input_summary" -- hooks/observe/main.js` **無任何結果**——hook 端
從來沒用過那個名字。這是接上去就沒接好的整合，不是後來改壞的。

### 10.5 修法選項（orchestrator 已裁定 A 案，落地見 §10.7）

兩個方向都只動一側，二選一即可：

- **A. 對齊 assembler**：`:260-271` 改讀 `rec.input` / `rec.path` / `rec.pattern`。
  改動最小，且不動已落盤的觀察資料格式。
- **B. 對齊 hook**：`buildObservedEvidence` 改寫出 `*_summary` 名稱。會使既有
  observations.jsonl 的舊記錄仍讀不到（歷史資料留在舊欄位名）。

**兩個方向都還要補 renderer**：`:381-383` 需一併印 `operation_kind`，否則
curator 仍分不出一筆 `path` 是 read 還是 edit——而「讀了再改」正是最有價值的
workflow 訊號。

修完應加一條**不用樁**的接縫測試（斷言 prompt 內含觀察的 input/path），否則
下一次仍會以同樣方式靜默退化。

### 10.6 本次 fixture 修正後的預期

修掉 §10.1 後，curator 會看到工具序列與 outcome（`outcome` 是少數有被 renderer
印出的欄位，`:385`），也就是
`Bash(tool_start) → Bash(tool_end, success) → Read → Edit → Bash(success)` 這個
形狀重複四輪。**這比原本 12 筆完全相同、連 outcome 都沒有的記錄強得多，步 3 有
機會通過。** 但 §10.2 的 `input`/`path` 仍然到不了 curator，所以：

- 若步 3 通過：候選會是基於工具序列的提案，不是基於指令或檔案內容。
- 若步 3 仍回 `proposals: []`：那就是 §10.2 的直接後果，**不要再調 fixture**。

無論哪種結果，§10.2 都是獨立於本 probe 的真實缺陷，值得單獨修。

---

## 11. §10.2 已修（A 案：assembler 對齊 hook 實際欄位名）

orchestrator 裁定採 A 案——理由：B 案會讓既有磁碟記錄變成孤兒，A 案零遷移成本；
redaction 不受影響（欄位在捕捉時已經過 `sanitize-observation` 處理，assembler
讀哪個名字不改變資料本身）。判定為引擎缺陷修正，與 home-resolver 同類，
P5 範圍內，不開新 D 編號。

### 11.1 改了什麼

`scripts/lib/learning-curator/batch-assembler.js` 兩處，都只動觀察記錄那一側：

| 位置 | 原本 | 現在 |
|---|---|---|
| 讀取層 `:260-271` | `rec.input_summary` / `rec.path_summary` / `rec.pattern_summary` | `rec.input` / `rec.path` / `rec.pattern` |
| 渲染層 `:381-386` | 未印 `operation_kind` | 補印 `**operation_kind**: <value>` |

**刻意不改 item 端的欄位名**（`input_summary` / `path_summary` /
`pattern_summary` 保留）。三個理由：(1) 它們描述的正是「經過 sanitize 的摘要」，
名副其實；(2) 那是 prompt 實際渲染的標籤，改了會改變 curator 讀到的文字，
等於偷偷變更 Layer 4 輸入；(3) **`pattern_summary` 是與 reflect 證據共用的**
——`EVIDENCE_KIND_CONFIG.reflect.buildExtra`（`:170-174`）本來就正確填它，
renderer 是四種證據型別共用的。把 item 端一併改名會**打壞 reflect 這條沒壞的路**。

`git grep -n "_summary" -- scripts/ hooks/` 全掃結果：觀察記錄這一側的讀者
**只有** batch-assembler 這一處。其餘命中皆為無關的同名欄位（`activate.js` 的
`active_path_summary`、`materialize.js` 的 `target_path_summary`、eval dashboard
的 `artifact_summary`、`schema.js` 的 `session_summary` 證據型別列舉等），逐一
確認後不動。

### 11.2 縫測試（不用樁）：`tests/scripts/curator-evidence-seam.test.js`

8 tests，全綠。走**真實**路徑：以 `execFileSync` 呼叫
`hooks/observe/main.js <phase>`（與 `hooks.json` 同形，phase 走 argv[2]、
payload 走 stdin）產生記錄 → 真實 `assembleBatch()` 組批 → **對 prompt 原文**
斷言。無任何 stub。

上游半段確認 hook 真的寫了證據（`input` = 指令、`path` + `operation_kind`
= read/edit）；下游半段確認它**活著抵達 prompt**：指令字串、檔案路徑、Grep
pattern、三種 `operation_kind`、post 階段 outcome，以及一條把回歸形狀正面
陳述的斷言——「Bash 證據項不得被縮減成只有名字與時間戳」。

**mutation 驗證（兩次，皆確認會抓到）：**

```
mutation 1 — 讀取層改回 rec.*_summary
  ✕ the prompt carries the Bash command, not just the tool name
  ✕ the prompt carries the file path a Read/Edit touched
  ✕ the prompt carries the Grep pattern
  ✕ an observation evidence item is not reduced to name and timestamp
  Tests: 4 failed, 4 passed

mutation 2 — 刪掉 renderer 的 operation_kind 那行
  ✕ the prompt distinguishes a read from an edit of the same file
  Tests: 1 failed, 7 passed
```

還原後皆 8 passed。兩次 mutation 分別命中兩個改動點，證明這支測試不是靠沉默過關。

### 11.3 E2E-G3 的綠色假象（記錄，stub 本身不動）

`tests/observer-daemon/run-tests.sh:396-454` 的 E2E-G3 用**樁掉的 `claude`**：
樁會讀 batch manifest 取真實 `batch_hash` / `evidence_ids`，再吐一份**寫死的**
`structured_output` 提案。它從不依賴 evidence 的**內容**，所以 prompt 就算完全
沒有行為訊號，該測試依然全綠——這正是這道縫從 `5f8c8b5` 一路活到 P5 的原因。

**stub 不重寫**：它測的是 daemon 的協調行為（batch → claude → ingest → queue），
那個目的用樁是對的。真正的縫現在由 §11.2 的非樁測試看守，兩者分工明確。

### 11.4 對 probe 的影響

修正後 curator 會看到指令字串、檔案路徑、Grep pattern 與 `operation_kind`，
再加上 §10.1 fixture 修正帶來的四輪重複工作流形狀。步 3 的訊號從「只有工具名
與時間戳」變成「完整的 test→read→edit→test 循環，含檔名與指令」。

**這仍不是保證。** curator 是保守的（prompt 規則 5），提不提案由它判斷；
但這次它至少有東西可讀。若步 3 再回 `proposals: []`，那是模型判斷而非管線
缺陷——**屆時不要再調 fixture 或引擎，如實記錄即可**。

---

## 12. 第二跑：縫接通了，露出第三層缺陷（evidence_id 截短）

orchestrator 以 fresh work dir 重跑。步 2 全 PASS（32 筆觀察，內容斷言過）。
**步 3 首次真的提案了**，但 ingest 全數退回：

```
[15:32:18] Analyzing probe-app: 32 observations
[15:33:31] Claude analysis completed successfully
[15:33:31] Ingest result: {"run_id":"curator_run_20260813T073331Z_489db1e3a116",
                           "parse_status":"parsed","accepted":0,"rejected":1}
```

`parse_status` 從 `empty` → **`parsed`**，`proposal_count: 1`。§11 的縫確實接通了：
curator 拿到了指令、路徑與 `operation_kind`，並據此提出一條 instinct。

### 12.1 退件原因（`rejections.jsonl` 摘錄）

```json
{"rejection_id":"rej_1786606411359_bb470516f099",
 "rejected_at":"2026-08-13T07:33:31.359Z",
 "source":{"source_type":"layer4_llm_curator",
           "batch_id":"batch_20260813T073218Z_22e0494daa00"},
 "reasons":[
   {"code":"evidence_ref_missing","field_path":"evidence_refs",
    "detail":"evidence_id \"ev_obs_0000\" is not present in batch batch_20260813T073218Z_22e0494daa00"},
   {"code":"evidence_ref_missing","field_path":"evidence_refs",
    "detail":"evidence_id \"ev_obs_0002\" is not present in batch ..."},
   {"code":"evidence_ref_missing","field_path":"evidence_refs",
    "detail":"evidence_id \"ev_obs_0004\" is not present in batch ..."},
   … 共 10 條，全為 evidence_ref_missing
 ]}
```

批次中的真實 id 是 `ev_obs_0000_d5a4b8cc` 這種形狀——Haiku 引用時把
`_<8 hex>` 尾段丟掉了。10 條引用全數截短，提案整條被丟棄。

值得一提的是它**選得對**：引用的都是偶數索引，也就是帶證據的 `tool_start`
記錄。分析是對的，只有 id 保真度壞掉。

### 12.2 定性：驗證器沒壞，是 prompt 沒把 id 釘死

- `observer-prompt.md` 的範例區用的是 placeholder（`<must be one of the
  evidence_ids…>`），**沒有教壞模型**——但也沒有給它一個完整形狀的 id 可對齊。
- `proposal-ingestor` 的精確比對是 fail-closed 設計，**正確且不鬆綁**：容忍前綴
  比對等於允許提案引用一個不存在的證據，那正是這個驗證器存在的理由。
  **這份 rejections.jsonl 同時是 fail-closed 驗證器正常運作的證據。**

也就是說這是**縫接通之後才可能暴露的第二層缺陷**：§10.2 未修時 curator 從不
提案，自然也就不會有 id 被截短。

### 12.3 對真實使用者同樣成立

不是 probe 專屬。production 的 Haiku curator 會以完全相同的方式被退——啟用
learning 的使用者會看到 daemon 「成功」跑完、`parse_status: parsed`，
但佇列永遠是空的，且**唯一的線索埋在 `rejections.jsonl` 裡**，dashboard 不顯示。
故障模式是靜默的。

### 12.4 已做的 prompt 硬化（`observer-prompt.md`，四處）

不動 `proposal-ingestor` 的驗證邏輯。

| 位置 | 改動 |
|---|---|
| Evidence Batch 區段，**緊貼 `{{EVIDENCE_ITEMS}}` 之前** | 新增粗體指令＋正反例：`ev_obs_0007_d5a4b8cc` ✅／`ev_obs_0007` ❌，並涵蓋 `evd-diary-1a2b3c4d5e6f` 這個第二種形狀（diary/reflect/recall 用連字號＋12 hex）。刻意放在**離真實 id 最近的位置**，而不是只寫在規則區 |
| Output Format 範例 JSON | placeholder 換成**完整形狀的真實示意 id**，讓模型有可對齊的樣板；順帶補成兩條 ref——原本只示範一條，與規則 2「至少 2 條」自相矛盾 |
| Proposal Rules 第 1 條 | 前置並加粗「must match … character for character」，明說含尾段、明說 fail-closed、明說一條截短就整條作廢 |
| 新增 `## Before You Emit`（全文最後） | 送出前逐一回查 evidence_id 是否整段吻合。放在最末是因為那是模型即將輸出的時點 |

措辭策略：把「為什麼會被退」與「退的代價」寫進同一句（分析再好也整條丟掉），
並建議 copy-paste 而非重打——針對的是複製劣化，不是理解錯誤。

實際渲染確認：硬化段落正確出現在真實 id 的正上方（非 placeholder 殘留）。

### 12.5 這次改動的驗證邊界（誠實標註）

prompt 措辭對 LLM 的效果**無法用單元測試證明**。已確認的是：placeholder 未被
破壞（10 個 `{{...}}` 佔位完好）、渲染位置正確、`curator-evidence-seam.test.js`
8 tests 仍綠、無測試耦合 prompt 文字。

**真正的驗證是第三次 probe。** 若步 3 仍因 `evidence_ref_missing` 被退，下一步
應該是換方向而不是繼續加措辭——例如在 batch 內把 id 縮短到不易截短的形狀
（那會動到 `batch-assembler` 的 id 生成，屬另一次裁決）。

---

## 13. 第三跑 + prompt↔validator 契約稽核

三跑結果：**id 硬化生效**——`evidence_ref_missing` 歸零，Haiku 這次 id 全對。
新退件：

```
{"code":"too_many_evidence_refs","field_path":"evidence",
 "detail":"evidence must have at most 5 entries (got 11)"}
proposal: test-driven-module-verification-cycle
```

prompt 只寫了「Minimum 2 evidence refs」，**從未告訴模型 validator 強制的上限
5**。這是同一類缺陷的第三例，所以這輪不再逐發修補，改做**全面契約稽核**。

### 13.1 稽核方法

枚舉 ingest 驗證鏈強制的每一條約束，來源三處：

- `schema.js` `validateCandidateV1()`（欄位長度、enum、refs 數量、必填）
- `proposal-ingestor.js` 的三道 batch 交叉檢查（`:445-504`）
- `buildCandidateRecord()`（`:112-172`）——**用來區分哪些欄位是 LLM 寫的、
  哪些是 Layer 5 自己填的**。後者不必寫進 prompt，寫了反而誤導模型去猜。

只有「**LLM 作者欄位 × validator 會擋**」的交集才算契約缺口。

### 13.2 對照表

| # | 約束 | validator 位置 | 誰寫 | prompt 原本有講？ | 處置 |
|---|---|---|---|---|---|
| 1 | `evidence_refs` **2–5 條** | `schema.js:312-324` | LLM | ❌ **只寫了 min 2** | ✅ 規則 2 改寫為 2–5，明說超過直接退、不截斷，並教「引用最強的五條、其餘寫進 rationale」 |
| 2 | `evidence_type` 須與 batch 實際型別相符 | `ingestor:485-504` | LLM | ❌ 無 | ✅ 新規則 3（型別就印在 item 的 `**evidence_type**` 行，照抄即可） |
| 3 | 不得引用 `evidence_status != present` 的項目 | `ingestor:464-483` | LLM | ❌ 無，**且 batch 根本沒印 status** | ✅ 新規則 4 **＋ renderer 補印**（見 13.3） |
| 4 | `evidence_refs[].relevance` 必填非空 | `schema.js:341-343` | LLM | ⚠️ 範例有欄位但沒說必填 | ✅ 新規則 5 + 範例註記改為 `<required, non-empty: …>` |
| 5 | `name` ≤ 120 字元 | `schema.js:57,274-280` | LLM | ❌ 無 | ✅ 規則 12 + 範例註記 `max 120 chars` |
| 6 | `trigger` ≤ 600（選填） | `schema.js:61,284-289` | LLM | ❌ **欄位連範例都沒有** | ✅ 規則 12 + 範例新增該鍵並標「選填、不用就省略」 |
| 7 | `summary` ≤600 / `rationale` ≤2000 / `body` ≤6000 | `schema.js:58-62` | LLM | ✅ 範例已註明 | 併入規則 12 集中重述（超過是退件不是截斷） |
| 8 | `domain` 七選一 | `schema.js:28-36,300-304` | LLM | ⚠️ 只在範例的 union 型別出現 | ✅ 升為規則 11 明列 |
| 9 | `proposed_scope.project_id` 必填非空 | `schema.js:240-246` | LLM | ⚠️ 範例寫 `<project_id from evidence items>` | ✅ 併入規則 10 明說必須非空 |
| 10 | `scope.kind` = project | `schema.js:214-220` | LLM | ✅ 規則 7（現 10） | 保留 |
| 11 | `body_source` = `llm_curator` | `schema.js:293-297` | LLM | ✅ 規則 6（現 9） | 保留 |
| 12 | `artifact_type` 本輪限 `instinct` | `schema.js:196-204` + 政策 | LLM | ✅ Policy Constraints + 規則 | 保留 |
| 13 | `evidence_id` 須存在於 batch | `ingestor:445-461` | LLM | ✅ §12 已硬化 | 保留 |
| 14 | `evidence_quality` ∈ high/medium/low | `schema.js:351-358` | **Layer 5** | — | **不寫進 prompt**：由 `computeEvidenceQuality()` 算（`ingestor:142`），模型猜了也會被覆寫 |
| 15 | `source.source_type` ∈ 6 值 | `schema.js:258-264` | **Layer 5** | — | 同上，`ingestor:152` 寫死 `layer4_llm_curator` |
| 16 | `evidence[].summary` 必填 | `schema.js:344-346` | **Layer 5** | — | 同上，`ingestor:135` 由 `relevance` 衍生——所以**真正要求模型的是 `relevance`**（第 4 條） |
| 17 | `candidate_id` / `lifecycle` / `scope.project` | `ingestor:118,121-125` | **Layer 5** | — | prompt 已明令不得自行指派，保留 |
| 18 | `scope` 不得含 `promoted_from_*` | `schema.js:222-235` | **Layer 5** | — | 模型不會產生，不加噪音 |

**結論**：LLM 作者側共 13 條約束，原本**完整陳述的只有 6 條**——2 條缺漏
（#1、#2、#3、#5、#6 中的多數）、3 條只在範例裡隱含。已全數補齊。

`evidence_type` enum 值得一提：validator 允許 5 種（含 `session_summary`），
prompt 只列 4 種。**刻意不補第 5 種**——batch 目前不產生該型別，列出來只會誘導
模型猜一個不存在的型別，反而觸發第 2 條的型別不符。列表是安全子集。

### 13.3 renderer 補印 `evidence_status`（規則 4 的前提）

第 3 條缺口不是純措辭問題：被 omit 的項目**確實在 batch 裡**
（`batch-assembler.js:308` 帶著 status，`:630` 寫進 manifest 供 ingestor 比對），
但 renderer 從不印它。等於要求模型避開它看不見的東西。

故補上（只印例外，不印 `present`，避免把訊號淹掉）：

```
**evidence_status**: omitted_unsupported_tool — DO NOT CITE
```

這是**渲染層**改動，不是驗證邏輯改動——與 §11 補印 `operation_kind` 同性質。

### 13.4 測試

`curator-evidence-seam.test.js` 8 → **10 tests**，新增兩條：被 omit 的項目必須
帶 `DO NOT CITE` 標記；`present` 的項目**不得**被加上 status 行（只標例外）。

mutation 驗證：刪掉 renderer 那行 → `✕ marks evidence that was omitted upstream
as uncitable`，1 failed / 9 passed；還原後 10 passed。

### 13.5 驗證邊界（同 §12.5）

prompt 措辭效果仍無法單元測試證明；能證明的是渲染面與契約覆蓋。若第四跑仍被
退件，**退件原因是否在上表** 是關鍵判準：

- **在表上** → 措辭沒生效，該換 lever（例如縮短 assembler 生成的 id 形狀）。
- **不在表上** → 稽核有遺漏，回頭補表。

依 orchestrator 指示，換 lever 是其裁定點，本 worker 不自行動手。
