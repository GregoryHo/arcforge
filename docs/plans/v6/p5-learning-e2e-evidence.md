# P5 learning 行為證據 — 兩項 AC 未執行，附阻塞證據

> Track A 兩項行為面 AC 的交付物：**§1–§7** 是旗艦 e2e probe
> （`progress.md` P5 預登記門檻 #1），**§8** 是 +1 eval scenario 的 A/B
> （門檻 #2）。兩項都**未執行**，阻塞原因不同，逐項附一手證據。
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
