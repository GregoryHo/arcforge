# `executing` → `dispatching` 交接設計關卡 Version 2（D-066 D1，#184）

**判定：MEASURABLE，條件五項（見「判定」）。** 6.5.0 判 NOT MEASURABLE 的三個缺口，兩個由引擎補上（`--also-stage`，eval B-22、D-067；transcript format 2 保留 Agent 呼叫的整個輸入，eval B-17、D-065），第三個由改寫主張補上（D-066：讀數是交接句加上可及的 `dispatching` 本體，不是那一個字）。預算照 PLAN：preflight 3 + A/B 10，共 13 個 session，D1 先於 D2。天花板 BLOCK 是實際可能的結果；本文件判斷它不是最可能的結果，理由在「天花板」一節。

本文件只閱讀檔案，並在不啟動 session 的前提下執行引擎函式（`resolveSkillOptions`、`preflightBaseline`、`digestSkillDir`、`hashSkillText`）。行號以 `main` 的 `d1ae3060` 為準。6.5.0 的關卡是 `docs/plans/v6.5/wp-d/design-gate.executing-dispatching.md`；本文件只寫哪些事實變了、新的設計，以及 PLAN 留給關卡決定的事。

## 受測的主張

交接句仍是 `skills/core/executing/SKILL.md:95-96`：

> Handing individual tasks to subagents is a dispatch problem — the `dispatching` skill covers fan-out, isolation, and acceptance.

它在 Unattended 一段裡（`:92-98`）。句子指向的規則在 `skills/core/dispatching/SKILL.md` Step 3：card 的欄位表 `:62-69`，其中 `:67`「Acceptance criteria, verbatim | The agent decides for itself what done means」，以及 `:71`：

> Paste the text, never a file path to the text.

D-066 把主張改寫成兩支 skill 合起來的行為：兩臂都注入同一份 `executing`，只有 treatment 多拿到可及的 `dispatching`；讀數是「交接句加上讀得到的本體」對「交接句、本體不在」，不是兩支 skill 對沒有 skill，也不是 plugin 的路由（D-066 Residual；D-024、D-044）。#182 改的那一個字（「model tier」→「acceptance」）本身沒有可觀察的行為後果，6.5.0 關卡已論證，本輪不量它。

## 6.5.0 的事實，哪些變了

| 6.5.0 事實 | 現在 | 依據 |
|---|---|---|
| 1. trial 帶 `--disable-slash-commands`，不能依名稱載入 skill | **沒變**。替代品是 B-22 的一行列名 | `scripts/lib/eval-trial.js:529` |
| 2. staging 只複製被注入檔案的一個目錄 | **補上**。`--also-stage <skill-dir>` 為 treatment 另 stage 一個目錄 | `scripts/cli/eval-skill-options.js:117-150`、`scripts/lib/eval-skill-staging.js:313-342` |
| 3. `skills/core/executing/` 只有 `SKILL.md` | 沒變，也不再重要：`dispatching` 走第二個目錄 | `ls` |
| 4. fixture 的檔案兩臂都有 | 沒變；本設計的 fixture 不放任何 skill 文字 | — |
| 5. Agent 呼叫只留前 200 字元 | **補上**。Agent／Task 保留整個輸入，單行 JSON | `scripts/lib/eval-transcript.js:181-185`、`:193` |
| 6. 一個 trial 只有一則 user message，`executing:84-86` 會先問模式 | 沒變；prompt 必須先指定模式 | `skills/core/executing/SKILL.md:84-86` |

## 引擎事實（離線驗證）

1. **兩臂同文字不會被拒。** `resolveSkillOptions`（`eval-skill-options.js:220-252`）沒有「baseline 文字等於 treatment 文字就拒收」的檢查；拒收只有 workflow scope（`:223-229`）、缺 skill 檔（`:230-234`）、`--also-stage` 的形狀（`readAlsoStage`，`:117-150`）與 treatment 文字為空（`:239-243`）。以本關卡的旗標實際呼叫：

   ```
   resolveSkillOptions({scope:'skill', target:'skills/core/executing/SKILL.md'}, root,
     {skillFile:'skills/core/executing/SKILL.md', baselineSkillFile:'skills/core/executing/SKILL.md',
      stage:true, alsoStage:'skills/core/dispatching'})
   → treatment 文字 hash 17fa36f1535cb446、baselineSkillHash 17fa36f1535cb446、
     baselineSkillFilesHash 1ef6e3967679cf2b、alsoStage {name:'dispatching', description:'Dispatch discipline for …'}
   ```

2. **`dispatching` 的 description 通過單行檢查。** `readDescriptionLine`（`:75-106`）拒收 block scalar、跨行、引號不閉合、行內註解、`: ` 等形狀。`dispatching/SKILL.md:3` 是一行 plain scalar，不以 indicator 開頭，沒有 `: `，沒有 `#`；上面的呼叫回傳完整的 description，沒有拋錯。
3. **注入的內容。** treatment 是「base-directory 行、`executing` 全文、空一行、一行列名」（`eval-skill-staging.js:334-336`），列名是：

   > Skill \`dispatching\` (\<description\>) is available; its base directory is \`\<copy\>\` — read \`\<copy\>/SKILL.md\` to use it.（`:285-287`）

   `--append-system-prompt` 的例外句在 treatment 列出兩個目錄（「The exceptions are … and …, the base directory of the \`dispatching\` skill」），baseline 只列一個（`eval-trial.js:480-487`、`:537-538`）。`dispatching` 的本體不注入，讀不讀由 agent 決定（B-22）。
4. **row 上的欄位。** 兩臂的 row 都記 `alsoStaged: true` 與同一個 `alsoStagedFilesHash`（`scripts/lib/eval.js:330-333`，註解「Both arms record the treatment's second skill」；`eval-trial.js:186-192`）。`alsoStaged` 在 `CONDITION_FIELDS`（`scripts/lib/eval-pools.js:30-41`），也就在 `PAIR_FIELDS`（`:94`），兩臂相同所以配得起來。**與 brief 不一致的一處**：兩臂的 row 不是「只差 `alsoStaged`／`alsoStagedFilesHash`」，這兩個欄位兩臂相同；`skillTextHash` 兩臂也相同（同一份文字）。兩臂靠 row 的 arm 分開，差別在注入內容多那一行與第二個 staged 目錄，row 上看不出來。
5. **preflight 跑的是 baseline，不帶第二支 skill。** `preflightBaseline`（`eval-skill-options.js:183-207`）對 `--also-stage` 直接拋錯，離線呼叫得到：「eval preflight refuses --also-stage: the second skill reaches the treatment only, and a preflight runs the baseline. …」。不帶它時的鍵條件是 `{baselineSkillHash: 17fa36f1535cb446, baselineSkillFile: 'skills/core/executing/SKILL.md', baselineSkillFilesHash: 1ef6e3967679cf2b}`。B-22：「a run with it is gated by the same preflight as one without」。
6. **transcript format 2 的 Agent block。** `summarizeToolInput` 對 `Agent` 與 `Task` 回傳 `JSON.stringify(input)`（`eval-transcript.js:183-185`），整行寫成 `[Tool: Agent] <json>`（`:61-62`），block 之間以空行分隔（`:79`）。JSON 把 prompt 裡的換行轉成 `\n`，所以 block 是單行。測試 `tests/scripts/eval-transcript-fidelity.test.js:83-94` 以一份超過 2000 字元、含空行的 prompt 驗證：`parseActionsFromTranscript` 得到一個 action，`JSON.parse(actions[0].args)` 等於原輸入 `{description, prompt}`。grader 讀的就是存檔 transcript 裡這一行，不是 `raw/`。row 記 `transcript_format`（`eval-trial.js:331`）。
7. **subagent 的呼叫沒有標記。** 解析器只看 `event.type` 與 `content`，不讀 `parent_tool_use_id`（`eval-transcript.js:54-63`），subagent 的工具呼叫與主 agent 的混在一起。grader 無法分辨一個 `[Tool: Agent]` 出自主 agent 還是 subagent。
8. **ceiling 預設 900 s，被砍的 trial 不計分。** `DEFAULT_TRIAL_TIMEOUT_MS = 900000`（`eval-trial.js:53`），「A killed trial never scores」（`:52`，`trial_killed_incomplete`，`:387-399`）。
9. **trial 的 `PATH` 沒有 `arcforge`，除非 scenario 宣告。** eval B-18（`product/specs/eval.md:267` 起，`PATH` 的部分在 `:286-297`）：trial 的 `PATH` 是建出來的，只有 `.eval-trials/.bin` 的 shim（`claude`、`node`、`npm`、`npx`、`python3`）加上 `/usr/bin`、`/bin`、`/usr/sbin`、`/sbin`，operator 自己的 `PATH` 不帶過去，「`arcforge` included — is not something a trial can run unless the scenario says so」。本文件第一版引用 D-064 (1) 說 `arcforge` 在真 trial 解析得到，那是錯的引用：D-064 (1) 是 resume scenario，它自己在 `## Environment` 宣告了 `PATH+=${PROJECT_ROOT}/bin`（`evals/scenarios/eval-sessions-handover-and-resume.md` 的 `## Environment`；依據是 `docs/plans/v6.5/wp-d/design-gate.sessions-resume.md` 的「離線驗證」表）。不宣告，treatment 照 `dispatching` Step 2（`dispatching/SKILL.md:30-44`）執行 `arcforge worktree add … --json` 會得到 `command not found`，可能在 `A1` 評分的那個 Agent block 之前就停下或改道，而 baseline 直接派工，實驗量到的就成了 CLI 在不在。所以本 scenario 宣告 `${PROJECT_ROOT}/bin`，但以 `PATH^=` 放在最前面，不是 resume scenario 的 `PATH+=`：附加在系統目錄之後，主機上的 `arcforge`（例如 `/usr/bin/arcforge`）會蓋過這個 checkout 的 CLI（見「`## Environment`」）。`ARCFORGE_HOME` 設在 trial 目錄下的 `.arcforge`（`scripts/lib/eval-trial-environment.js:404`），`getWorktreeRoot` 經 `getArcforgeHome()` 跟著它走（`scripts/lib/worktree-paths.js:36-42`），所以 worktree 落在 trial 樹裡。worktree 需要 git repo，fixture 的 Setup 要 `git init` 並設定身分，前例是 `evals/scenarios/eval-code-review-range-fidelity.md:59-61`。

## scenario 設計

- **檔案**：新增 `evals/scenarios/eval-executing-dispatch-acceptance.md`（名稱由 scenario PR 定），`## Version` 1。
- **Scope** `skill`；**Target** `skills/core/executing/SKILL.md`；`## Trials` 5。

### fixture（Setup）

```bash
git init -q -b main
git config user.email eval@example.com
git config user.name "Eval Fixture"
mkdir -p src specs test
# package.json: name "edge-api", "test": "node --test"
# src/server.js: 一個以 node:http 寫的最小 server，兩條 route（/login、/search），無相依套件
# specs/limiter.md、TASKS.md：見下
git add -A && git commit -qm "fixture"
```

`TASKS.md` 用 `executing` 自己的格式（`SKILL.md:25-43` 的 banner 與四種記號），三項：

```markdown
- [ ] T1 — Add a `GET /health` route to `src/server.js` that returns 200 with body `ok`
  - verify: `npm test`
- [ ] T2 — Implement the limiter in `src/limiter.js` per `specs/limiter.md` — hand this one to a subagent
  - verify: `npm test`
- [ ] T3 — Log each request's method and path to stdout in `src/server.js`
  - verify: `npm test`
```

### `## Environment`（提議全文）

```
## Environment
# arcforge is what dispatching's Step 2 runs to make a worktree; the trial PATH has no arcforge otherwise (eval B-18), and it is prepended so a host arcforge cannot shadow this checkout's
PATH^=${PROJECT_ROOT}/bin
```

只有這一行。`^=` 把 `bin/` 放在 `PATH` 最前面（`scripts/lib/eval-trial-environment.js:102`、`:255`）；`bin/` 只有 `arcforge`，不會蓋過 trial 的任何 shim。resume scenario 另有一行 `PATH^=${TRIAL_DIR}/.arcforge/bin` 與 Setup 寫的包裝 script，用途是把每次 `arcforge` 呼叫的 exit code 記進 log，因為當時 transcript 不記 exit code（`design-gate.sessions-resume.md`「離線驗證」表最後兩列；D-063 第 5 點的 per-row 規則）。format 2 已經把失敗的 Bash 呼叫記成 `[Result: Bash] error (exit N)`（`scripts/lib/eval-transcript.js:103-110`），本 scenario 不需要那支包裝，也就不宣告第二行。

**離線驗證（未啟動 session）。** 以引擎的 `trialEnv(<trial>, {environment: ['PATH+=${PROJECT_ROOT}/bin']}, {projectRoot})` 建環境：`parseEnvironment` 接受這一行（`{name: 'PATH', op: 'append'}`），`PATH` 是 `<repo>/.eval-trials/.bin:/usr/bin:/bin:/usr/sbin:/sbin:<repo>/bin`，`ARCFORGE_HOME` 是 `<trial>/.arcforge`。在 `<trial>` 以這個環境執行：

| 檢查 | 結果 |
|---|---|
| `command -v arcforge` | `<repo>/bin/arcforge`（shim 轉到 `scripts/cli.js`） |
| Setup 的 `git init -q -b main`、`git config user.*`、`git add -A && git commit -qm fixture` | 成功 |
| `arcforge worktree add limiter --json` | exit 0；`"branch_created": true`，`"path": "<trial>/.arcforge/worktrees/<trial 目錄名>-<hash>-limiter"` |
| `arcforge worktree list --json` | 兩筆：`<trial>`（`kind: base`）與上面那個 worktree |
| `git status --short` | `?? .arcforge/` |

這次檢查的 `command -v git` 印出 `/opt/homebrew/bin/git`，與 B-18 說的「`git` 只在系統目錄」不符；`/usr/bin/git` 存在，原因可能是執行檢查的 shell，不是 trial 的環境，本文件沒有追。worktree 的結果不受影響。

**worktree 在 trial 樹裡。** 路徑在 `<trial>/.arcforge/worktrees/` 下，`-- audit: outside the trial tree` 不會因它出現（它比對的是 trial 目錄以外的路徑），隔離不受影響，也不寫到專案根目錄（不觸發 `trial_wrote_repo`）。一個副作用：`.arcforge/` 在 trial repo 裡是未追蹤的目錄，agent 之後若在 trial 根目錄 `git add -A`，會碰到裡面的 worktree（git 把它當成嵌入的 repo 並警告）。這只會在 treatment 建了 worktree 之後發生，在 T2 的 writer 派工之後，不影響 `A1`。

T1 與 T3 是 T2 之外的工作，讓 task list 是一份真的要跑完的清單；兩者都碰 `src/server.js`，T2 只碰 `src/limiter.js`，依 `dispatching` Step 1（`:16-24`）T2 是獨立的一塊。路徑寫在 T2 裡，兩臂都找得到 spec；baseline 若沒開 spec，失敗原因就是沒開，不是沒照貼，稽核行會分開（見 grader）。

`specs/limiter.md`：一段背景（每個 client 的請求限制，超過回 429），一節 `## Acceptance criteria`，三條：

1. `A burst of exactly 10 requests within 1000 ms is allowed; the 11th gets 429.`
2. `` `Retry-After` is rounded up to whole seconds. ``
3. `` The counter key is `${ip}:${route}`, never `ip` alone. ``

三條照 PLAN 不改。理由：每一條都有一個常見改寫會失去的細節：第 1 條的「exactly 10 … the 11th」（常被寫成「10 per second」）、第 2 條的「rounded up」（常被寫成「in seconds」）、第 3 條的「never `ip` alone」（常被省略）。三條都短，這是天花板風險（見下），但加長只會讓「逐字」更難、量到的是複製長文的耐性，不是交接。

### prompt（提議全文）

`## Context`：

> You are in the `edge-api` project folder. It is a git repository with a task list at `TASKS.md`.

`## Scenario`：

> Work through `TASKS.md` from top to bottom and finish every task. Run it unattended — I'm stepping away, so don't ask me which mode to use or wait for my answers; just do what each task says.

「don't ask me which mode」對到 `executing:84-86`（trial 只有一則訊息，6.5.0 事實 6）；`executing` 也要求 unattended 開始前「say so out loud」（`:85-86`），agent 照做不影響任何斷言。prompt 沒有提到 subagent 的寫法、acceptance criteria、貼上、路徑或 `dispatching`；派給 subagent 的要求只在 T2 那一行。

## grader（code，`python3 -I`）

讀 `TRANSCRIPT_PATH`（只讀一般檔案、有大小上限，照 `eval-diagramming-obsidian-layout-grid.md` 的 `regular_bytes` 寫法），以空行切 block，取所有以 `[Tool: Agent] ` 或 `[Tool: Task] ` 開頭的 block，對其餘部分 `json.loads`，取 `prompt`（不是字串就當空字串）。

**grader 不給判定的情形。** `TRANSCRIPT_PATH` 未設定、檔案不存在、是空檔，或不是 32 MiB 以下的一般檔案時，grader 印出超出範圍的 `A0` 標籤並以 exit 3 結束，引擎把它記成 grade error（`scripts/lib/eval-grader-code.js:141`），不是 FAIL：這一列沒有判定。前例是 `evals/scenarios/eval-sessions-handover-and-resume.md` 的「When the grader gives no verdict」。

**A1，唯一計分的斷言**：T2 的 writer 派工帶著三條 acceptance criteria。grader 依下面的規則找出 writer 派工，再看它的 `prompt` 是否同時含有三條條件。

**正規化**（認定與比對共用）：轉小寫、`-` 換成空格、去掉反引號、連續空白併成一個空格。比對條件時兩邊再去掉句尾句點。

**認定 writer 派工**：對 Agent／Task block 依 transcript 順序走一遍，每個 block 當場分類，第一個分到 `writer` 的就是 writer。

1. **可讀**：`json.loads` 失敗的 block 歸為 `unreadable`，不參與以下各步。
2. **提到 limiter**：正規化後含 `limiter` 或 `rate limit`（涵蓋 `specs/limiter.md`、`src/limiter.js`、rate limiter、rate limiting、rate-limit）。沒有任何 block 的 `description` 或 `prompt` 提到 limiter，`A1` 判 FAIL，原因 `T2 not dispatched`。
3. **驗收型 description**：正規化後的 `description` 含下列任一個完整的字：`review`、`reviewer`、`verify`、`verification`、`validate`、`validation`、`accept`、`acceptance`、`check`、`checks`、`audit`、`inspect`、`examine`、`test`、`tests`、`testing`、`qa`、`assess`、`confirm`、`evaluate`、`judge`、`compliance`、`suite`；**除非**它也含 `implement` 或 `build` 這兩個完整的字。
4. **limiter 已經寫過**：這個 block 之前，transcript 裡已有 `[Tool: Write]` 或 `[Tool: Edit]` 的路徑以 `src/limiter.js` 結尾，或 `[Tool: Bash]` 的指令有一個 `>`／`>>` 重導向或 `tee`（可帶 `-a`）的目標是以 `limiter.js` 結尾的路徑（`cat > src/limiter.js <<'EOF'` 算；`ls src/limiter.js 2>/dev/null` 不算，它的重導向目標是 `/dev/null`）。
5. **歸屬或否定句**：把正規化後的 `prompt` 切成句子：`;`、`:` 與換行一律切，`.`、`!`、`?` 只在後面接空白或字串結尾時切（否則 `src/limiter.js is owned by T2` 會在 `.js` 切開，`src/limiter` 落在沒有記號的那一半）。一個句子含下列任一個完整的字（或片語）記號就是歸屬或否定句（`whenever` 不是 `never`，`downstream` 不是 `owns`）：`do not`、`don't`、`never`、`must not`、`avoid`、`leave`、`out of scope`、`owns`、`owned by`、`belongs to`、`another agent`、`other agent`、`in parallel`。
6. **分類**，每個提到 limiter 的可讀 block 依序套第一條成立的：第 3 步成立 → `acceptance`；第 4 步成立 → `after-write`；`description` 提到 limiter，或 `prompt` 至少有一句提到 limiter 而不是歸屬或否定句 → `writer`；其餘 → `ownership-mention`。不提 limiter 的 block 是 `other`。
7. **評分**：第一個 `writer` 的 `prompt` 在正規化後同時含三條條件，`A1` PASS；不含則 FAIL，原因寫出缺哪幾條。沒有任何 `writer`，FAIL，原因 `no T2 writer dispatch identified`（與第 2 步分開，稽核才分得出「沒派」與「派了但認不出」）。之後的 block 照樣分類、印進 audit，不計分。

- **為什麼要認定 writer，不是「至少一個 block 含三條」**：「至少一個」會讓 treatment 在它要被抓的那個失敗上通過。`dispatching` Step 4（`:91-96`）要求把 acceptance 交給另一個 fresh-context agent，檢查「does the delivered code satisfy every criterion」；照做的 treatment 可以只給 writer `specs/limiter.md` 的路徑，再把三條條件貼給 acceptance agent。這條指示只有 treatment 讀得到，假 PASS 只會出現在 treatment 一邊。format 2 沒有 parent／top-level 的標記（事實 7），所以要靠別的特徵。
- **為什麼是一次照順序走完，不分兩層**：上一版先在整份 transcript 用 `description` 找，找不到才回頭用 `prompt` 的句子找。那會讓後面的驗收贏過前面的 writer：writer 的 description 是「T2 implementation」（不提 limiter）、prompt 只給路徑，驗收的 description 是「Test limiter acceptance」，第一層跳過 writer、選中驗收，驗收貼的三條給出假 PASS，只在 treatment。照順序走一遍、每個 block 當場用兩種訊號分類，writer 在自己的位置就被認出（它的 prompt 有「Implement … `src/limiter.js`」這種句子），驗收根本輪不到。`dispatching` 的 writer 在 Step 3 派出（`:56-78`），驗收在 Step 4、writer 回報之後（`:82-84`「A completion report is a claim」、`:91-96`），所以 writer 本來就在驗收之前，順序是站得住的特徵。
- **這個順序接受的代價**：T1 的 card 若有一句提到 limiter 卻沒有任何記號（「Coordinate with T2, which handles the limiter」），而 T1 先派，它會在後面那張 description 寫著 limiter 的 writer 之前被分成 `writer`，`A1` 對 T1 評分而判 FAIL。`dispatching` 的歸屬與整批派出（`:21-22`、`:66`、`:71-72`）讓這種列多在 treatment，是 treatment 的假 FAIL，縮小 delta。兩種漏洞互相競爭時選 FAIL：假 FAIL 的後果是 #184 維持開啟，句子照 D-049 以文字出貨（6.5.0 關卡的帳本文字），與今天相同；假 PASS 的後果是以錯的讀數關閉 #184，把一個沒有成立的主張記成量到的結果。所以 selector 在兩者之間一律偏向 FAIL。
- **為什麼還有第 4 步**：它不靠字彙擋住最容易造成假 PASS 的形狀：agent 自己寫了 `src/limiter.js`，再派驗收並貼條件。主 agent 自己的 `Write`／`Edit` 一定在 transcript 裡，而真正的 writer 派工一定在 limiter 被寫之前；在那之後才提到 limiter 的派工是驗收或重做，不是 T2 的交接。第 3 步的字彙只剩一種情形要擋：驗收派出時 transcript 裡看不到任何 limiter 的寫入（例如 writer 本身沒被認出、它的 subagent 的寫入又沒出現在 transcript）。
- **為什麼 `description` 是訊號**：Agent 呼叫的 `description` 是幾個字的任務摘要（`tests/scripts/eval-transcript-fidelity.test.js:89` 的形狀是 `{description, prompt}`）。T1 的 card 不論 prompt 怎麼寫 limiter 的歸屬，description 是「Add health route」這一類。這個訊號兩臂都有，與 `dispatching` 的用詞無關：它是 Agent 工具自己的欄位，不是 card 的欄位。
- **為什麼驗收看 `description` 而不是 `prompt`**：writer 的 prompt 照 `dispatching:67` 會有「Acceptance criteria」，照 T2 的 `verify:` 行會有「verify」；拿 prompt 的字判驗收，會把照規矩寫的 writer card 判成驗收，正好打在 treatment 身上。
- **字彙從哪來**：Step 4 與它指向的 `references/acceptance.md` 用的字：「Accept on evidence」（`:80`）、「Check the claim against the tree … run the project's own checks」（`:86-87`）、「the tests that exist pass」（`:88`）、「hand acceptance to a fresh-context agent」（`:91`）、「Two checks … does the suite pass」（`:94-96`）、「Both pass, accept」（`:96`）；`acceptance.md` 的兩節是「Check 1 — Does the delivery satisfy the criteria」與「Check 2 — Does it pass from an empty context」，並稱之為「a compliance check」。另外加上驗收 agent 常見的 description 用字（review、verify、validate、qa、assess、confirm、evaluate、judge、examine、inspect、audit）。
- **實作動詞的例外，決定**：只留 `implement` 與 `build`，拿掉上一版的 `write`、`create`、`add`。
  - 「Implement and verify the rate limiter」：含 `verify`，也含 `implement` → `writer`。對。
  - 「Write limiter acceptance tests」、「Add limiter tests」：含 `acceptance`／`tests`，`write`／`add` 不再是例外 → `acceptance`。對。
  - 判錯的一邊：真正的 writer 寫成「Write the rate limiter with tests」或「Add rate limiting and tests」→ `acceptance`，跳過；若後面沒有別的 `writer`，判 FAIL。兩臂都可能這樣寫（`executing:103`「Implementation code goes through `/tdd`」在兩臂的文字裡）。這是假 FAIL，照上面的規則偏向它。
  - 保留的另一邊：「Build the limiter acceptance harness」含 `build` → `writer`；它若是在任何 limiter 寫入之前派出、又貼了三條，給出假 PASS。這要驗收描述裡帶 `build`、又在第 4 步看得到的寫入之前，本文件判斷少見。
- **自己做 T2、只派驗收的列**：驗收在 `src/limiter.js` 被寫之後（第 4 步 `after-write`），或 description 是驗收型（第 3 步），都不是 `writer`；找不到 writer，判 FAIL `no T2 writer dispatch identified`。這是對的：T2 寫著交給 subagent，自己做就沒有交接。
- 6.5.0 的關卡沒有討論這個 acceptance agent 的混淆：它的論點是 card 的全文讀不到、「有 acceptance criteria」量的是 `dispatching` Step 3（`design-gate.executing-dispatching.md`「兩個斷言能鑑別嗎？」），沒有走到「讀得到全文之後，哪一個 block 才是 card」這一步。
- **為什麼去反引號與大小寫**：第 2、3 條含反引號，agent 把條件改寫成清單時常拿掉或加上 code 標記、句首大小寫跟著清單格式變；這些不改變條件的字。逐字比對要抓的是改寫（「10 per second」），不是排版。
- **依賴的格式**：grader 依賴 format 2 的單行 JSON（事實 6）。format 1 的 row 只有 200 字元，條件幾乎一定不在裡面，所以 grader 不必判斷格式；量測在 `d1ae3060` 之後跑，每一列都是 format 2，稽核逐列確認 `transcript_format: 2`。

**grader 的離線測試**（scenario PR 要以合成 transcript 逐條驗證，每條寫出預期的標籤與原因）：

| 案例（transcript 裡的順序） | 預期 |
|---|---|
| T1 card（description「Add health route」，prompt 含「do not touch `src/limiter.js`, T2 owns it」），然後 T2 writer（description「Implement rate limiter」，prompt 含三條） | PASS；T1 `ownership-mention`，評第 2 個 block |
| 同上的 T1 card，然後 T2 writer 只給路徑（prompt「Implement the limiter per `specs/limiter.md`」） | FAIL，缺三條 |
| 只有上面那張 T1 card | FAIL `no T2 writer dispatch identified`；T1 `ownership-mention` |
| T2 writer（description「T2 implementation」，prompt「Implement the limiter in `src/limiter.js` per `specs/limiter.md`.」，沒有條件），然後驗收（description「Test limiter acceptance」，prompt 含三條） | FAIL，評的是 writer（由 prompt 的句子認出）；驗收 `acceptance` |
| T2 writer 只給路徑，然後驗收（description「Verify limiter」，prompt 含三條） | FAIL，評的是 writer |
| `[Tool: Write] …/src/limiter.js`，然後驗收（description「Write limiter acceptance tests」，prompt 含三條） | FAIL `no T2 writer dispatch identified`；驗收 `acceptance`（`write` 不是例外） |
| `[Tool: Write] …/src/limiter.js`，然後派工（description「Second opinion on limiter」，沒有驗收字眼，prompt 含三條） | FAIL `no T2 writer dispatch identified`；那個 block `after-write` |
| 只有驗收（description「Review limiter implementation」，prompt 含三條），之前沒有寫入 | FAIL `no T2 writer dispatch identified`；驗收 `acceptance`（`implementation` 不是 `implement`） |
| T2 writer 的 description「Implement and verify the rate limiter」，prompt 含三條 | PASS（`implement` 例外） |
| T2 writer 的 description「Add rate limiting and tests」，prompt 含三條，之後沒有別的派工 | FAIL `no T2 writer dispatch identified`；那個 block `acceptance`。已知的假 FAIL（見「實作動詞的例外，決定」） |
| T1 card（description「Add health route」，prompt 含「Coordinate with T2, which handles the limiter」），然後 T2 writer（description「Implement rate limiter」，prompt 含三條） | FAIL，評的是 T1（`writer`，沒有記號）。已知的假 FAIL，偏向 FAIL 的代價 |
| T1 card 的 prompt 寫「`src/limiter.js` is owned by T2.」，然後 T2 writer（description「T2 implementation」，prompt「Implement the limiter.」加三條） | PASS；T1 `ownership-mention`（`.js` 不切句） |
| T2 writer 的 prompt 含三條，但第 2 條寫成「Retry-After in seconds」 | FAIL，缺第 2 條 |
| 條件含反引號與大小寫差異（「`retry-after` is rounded up to whole seconds」） | 與原文相符 |
| 沒有任何 Agent／Task block | FAIL `T2 not dispatched` |
| 一個 Agent block 的 JSON 不可解析，其餘無 | FAIL `T2 not dispatched`；該 block `unreadable` |
| `[Tool: Bash] $ ls src/limiter.js 2>/dev/null`，然後 T2 writer（description「Implement rate limiter」，prompt 含三條） | PASS；`ls` 不是寫入 |
| `[Tool: Bash] $ cat > src/limiter.js <<EOF …`，然後提到 limiter 的派工（prompt 含三條） | FAIL `no T2 writer dispatch identified`；那個 block `after-write` |
| T2 writer 的 description「T2 implementation」，prompt「Whenever a client exceeds the rate limit, respond 429.」加三條 | PASS；`whenever` 不是記號 `never`，該句認出 writer |
| `TRANSCRIPT_PATH` 未設定、不存在或是空檔 | 沒有判定：`A0` 標籤，引擎記 grade error，不是 FAIL |

**印出、不計分的 audit 行**：

- `-- audit: specs/limiter.md opened`：有沒有 `[Tool: Read]`、或 `Bash` 指令含 `specs/limiter.md`。沒開 spec 的 FAIL 與開了卻沒照貼的 FAIL 分開報告。
- `-- audit: dispatching/SKILL.md opened`：`[Tool: Read]` 與 `[Tool: Bash]` 讀到的 staged `SKILL.md`（路徑是 `arcforge-eval-skill-<pid>-<random>/SKILL.md`），連同所在的目錄；只把路徑交給 subagent 的 card 不算打開。兩份 staged 複本的目錄名形狀相同，transcript 也不帶說明哪一份是哪一支的注入內容，所以只有同一份複本底下也讀過 `references/` 的路徑時，才標成 `dispatching` 的（`executing` 的複本只有 `SKILL.md`）；其餘標「copy not identified」，稽核者到該列的 raw stream 找 base-directory 行。treatment 的地板指標。
- `-- audit: agent calls`：Agent／Task block 的總數。
- `-- audit: limiter dispatch`：每一個提到 limiter 的 block 一行（第 2 步的定義），依 transcript 順序：它在所有 Agent／Task block 中的位置、分類（`writer`、`ownership-mention`、`acceptance`、`after-write`、`unreadable`）、提到 limiter 的地方（description／prompt／both）、是否被評分（只有第一個 `writer`）、含幾條條件（0–3）、`description` 的前 80 字元、`prompt` 是否含 `specs/limiter.md` 這個路徑。稽核者看得到 T1 的歸屬 card、writer 與驗收的 prompt 並排，也看得到驗收失敗後再派的 writer。
- `-- audit: not top-level`：無法判斷。format 2 不標記 subagent 的呼叫（事實 7），這一行固定印出這句，提醒稽核者一個含條件的 block 理論上可能出自 subagent。
- `-- audit: model tier`：prompt 裡有沒有 `model:`、`haiku`、`sonnet`、`opus` 這類欄位。不計分：6.5.0 關卡與 D-066 都判它在兩臂都是天花板，不斷言。
- `-- audit: arcforge errors`：每個指令含 `arcforge` 的 `[Tool: Bash]` block，若緊接著的是 `[Result: Bash] error (exit N)`，印出指令的第一行與 exit code。format 2 只記失敗的結果、不記內容（`eval-transcript.js:20-22`、`:103-110`），所以這一行只能說「失敗了、exit 多少」，不能說為什麼。
- `-- audit: outside the trial tree`：照 layout-grid grader 的寫法，列出指向 trial 目錄外的路徑；baseline 若去找 repository 裡的 `skills/core/dispatching`，就不再是「本體不在」那一臂。

## 兩臂

| 臂 | 注入 | staged | row |
|---|---|---|---|
| baseline | `executing` 全文 + base-directory 行 | `executing` 的複本（digest `1ef6e3967679cf2b`） | `skillTextHash 17fa36f1535cb446`、`alsoStaged: true`、`alsoStagedFilesHash 9479e63210fdc2be` |
| treatment | 同上 + 一行 `dispatching` 列名 | `executing` 的複本 + `dispatching` 的複本（`9479e63210fdc2be`） | 同上 |

旗標：兩臂都 `--stage-skill-files`；baseline `--baseline-skill-file skills/core/executing/SKILL.md`；treatment `--skill-file skills/core/executing/SKILL.md --also-stage skills/core/dispatching`。兩臂都看到交接句與 `dispatching` 這個名字；只有 treatment 看到「它可用、在這裡」與讀得到的本體。

**B-20 的 A/B 一半第一次跑。** D-064 記錄 6.5.0 只跑了 B-20 的 preflight 一半；D-066：「When D1 passes its preflight, its A/B is the first A/B between two skill texts the engine has run」。嚴格說兩臂是同一份文字（B-20 的 baseline text 機制，文字相同），D2 若也走到 A/B，是第二次。

## 天花板

baseline 通過，要三條條件在它的 Agent prompt 裡逐字出現，而它手上沒有任何一句叫它貼原文：`executing` 只說「dispatch problem」（`:95-96`），沒有 card 的規則。通過的路：

1. **Opus 不必提醒就把短條件原文貼上。** 這是主要風險，PLAN 也這樣寫。條件短、是清單、agent 剛讀過 spec，複製比改寫省事。
2. **把整份 spec 貼進 prompt。** 三條自然都在。
3. **把 `specs/limiter.md` 以 `cat` 的方式嵌入**，或在 prompt 裡附上 spec 全文以外的其他複製手段。與 2 相同。

失敗的路是 PLAN 預期的：只給路徑（「implement per `specs/limiter.md`」）——subagent 與主 agent 共用檔案系統，這在 baseline 看來完全合理，也正是 `dispatching:71` 禁止的；或給摘要／改寫。

**判斷。** preflight k=3、門檻 `CEILING_THRESHOLD = 0.8`（`scripts/lib/eval-preflight.js:34`），BLOCK 要 3/3。repo 裡最接近的前例方向不利：`eval-dispatching-report-not-evidence` 兩個版本都在天花板（`evals/skill-eval-coverage.md:34`、`:995`），`executing` 在 6.1.1 的 preflight 也 BLOCK（`:60`）——Opus 在派工與執行上本來就做得好。對抗的是斷言的嚴格：三條都要逐字，任何一條改寫就失敗；而只給路徑對 baseline 是自然的寫法，因為 subagent 讀得到檔案。本文件判斷 BLOCK 有實際可能，但不是最可能的結果；沒有本 task 的任何量測，不給機率。BLOCK 的處置見最後一節。

## 地板

- **treatment 從未打開 staged 的 `dispatching/SKILL.md`。** B-22 Residual：那一行是模仿 host 的列名，不是真的列名。這種列量到的是「交接句 + 一個沒被讀的名字」，與 baseline 幾乎相同。audit 行逐列報告，不改標籤。
- **treatment 讀了，卻只貼路徑或改寫。** 這是真的讀數，不是地板問題。
- **treatment 跑得比較久而被砍。** `dispatching` 的 Step 2 建 worktree、Step 4 再派 acceptance agent（`:91-96`），treatment 的 trial 預期比 baseline 長；被砍的列不計分（事實 8），兩臂損失不對稱。所以本關卡要求 ceiling 1800 s（見執行計畫）。PLAN 的「量測條件」對 D1 沒有寫 ceiling，D2 有；這是本關卡補的條件，預先登記時要寫進去。
- **沒有派工。** prompt 沒說，T2 說了；`executing:95-96` 說派工是 dispatch 問題。兩臂都可能自己做 T2，FAIL，機率相近。

「沒有 model-tier 欄位」兩臂都是天花板，不斷言（D-066）。

## 執行計畫

- **條件**：`--model 'opus[1m]' --effort xhigh`、隔離、不帶 `--plugin-dir`、`ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`（preflight 與 A/B 同值，它在 preflight 的鍵裡，`eval-preflight.js:129-136`）。`## Max Turns` 不設：subagent 與 acceptance agent 會吃掉回合，設了就進鍵。`## Environment` 宣告上面那一行，兩臂相同：它屬於 scenario，不屬於任何一臂，`trialEnv` 對兩臂以同一個 scenario 建環境。它不是獨立的 preflight 條件，而是經由 scenario hash 進鍵：preflight 紀錄的檔名是 `<scenario hash>-<model><條件>.json`（`scripts/lib/eval-preflight.js:67-70`），hash 是整份 scenario 檔內容的 SHA-256 前 16 碼（`scripts/lib/eval-scenario.js:132-140`、`eval-preflight.js:362-364`），所以改這一行就要重跑 preflight。
- **preflight**（baseline 臂，不帶 `--also-stage`）：

  ```bash
  ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 arcforge eval preflight <scenario> \
    --model 'opus[1m]' --effort xhigh \
    --stage-skill-files --baseline-skill-file skills/core/executing/SKILL.md
  ```

- **A/B**（PASS 才跑）：

  ```bash
  ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 arcforge eval ab <scenario> \
    --model 'opus[1m]' --effort xhigh \
    --skill-file skills/core/executing/SKILL.md \
    --stage-skill-files --baseline-skill-file skills/core/executing/SKILL.md \
    --also-stage skills/core/dispatching
  ```

- **預期的 digest**（`d1ae3060`，`digestSkillDir` 離線計算）：`skills/core/executing` `1ef6e3967679cf2b`、`skills/core/dispatching` `9479e63210fdc2be`；`executing/SKILL.md` 的文字 hash `17fa36f1535cb446`。量測前在量測 commit 重算，不同就停下、重新登記，不花 session。`alsoStagedFilesHash` 不是 pool 條件（B-22），所以這一步是唯一確認 `dispatching` 沒有在量測前被改的地方。
- **session**：preflight 3；A/B 兩臂各 5，共 10。補跑與 preflight 出錯重跑照 PLAN 的額度表，與 D2 共用。
- **順序**：D1 先跑，結束後才開始 D2；一個 checkout 一次一個 live eval。
- **稽核**：逐列報告 A1、所有 audit 行（`limiter dispatch` 裡被評分的那一行是不是 T2 的實作 card 逐列判讀）、`transcript_format`、耗時與是否被砍、treatment 有沒有開 `dispatching/SKILL.md`、baseline 有沒有往 trial 樹外找。

## 殘餘風險

- **列名不是 host 的列名**（B-22 Residual）：treatment 讀本體的頻率可能與真實 session 不同。讀數只說明「本體可及時」的行為，不是 plugin 載入後的行為。
- **subagent 的呼叫沒有標記**（事實 7）。被認定為 writer 的 block 若出自 subagent，仍會被評分；稽核者逐列看那個 block 前後的工具呼叫。
- **認定規則仍會判錯的列。** 規則對兩臂相同，但下列情形不是兩臂同樣常見。前兩種是刻意接受的假 FAIL（兩種漏洞競爭時偏向 FAIL，理由見 A1 的說明）：
  - **T1 的 card 被當成 writer（treatment 較常見，縮小 delta）。** T1 先派，它的 prompt 有一句提到 limiter 卻沒有記號（「Coordinate with T2, which handles the limiter」）。`dispatching` 的歸屬與整批派出（`:21-22`、`:66`、`:71-72`）讓 treatment 比較會寫這種句子、也比較會先派 T1。
  - **writer 的 description 是驗收型而被跳過（兩臂都可能，縮小或放大視哪一臂較多）。** 「Write the rate limiter with tests」、「Add rate limiting and tests」：`write`、`add` 不是例外。`executing:103` 的 `/tdd` 在兩臂都有，所以兩臂都可能；之後若沒有別的 `writer`，判 FAIL。
  - **writer 被當成歸屬句而跳過（treatment 較常見，縮小 delta）。** writer 的 description 不提 limiter，而 prompt 裡每一句提到 limiter 的句子都碰巧帶記號，例如「Implement the limiter in `src/limiter.js` and do not touch `src/server.js`」整句只有一個句子。treatment 的 card 有 Constraints 一欄，比較常把限制與任務寫在同一句。
  - **主 agent 先寫了 `src/limiter.js` 的骨架再派 writer（兩臂都可能，假 FAIL）。** 第 4 步把那次派工分成 `after-write`。
  - **驗收被當成 writer（只有 treatment，放大 delta）。** 只剩一種形狀：驗收的 description 帶 `implement` 或 `build`（「Build the limiter acceptance harness」），或完全不帶驗收字眼，而且它之前 transcript 裡看不到任何 limiter 的寫入（writer 沒被認出、它的 subagent 的寫入也沒出現）。三個條件要同時成立，本文件判斷少見。
  - **探索或規劃的 agent 被當成 writer（baseline 較常見，放大 delta）。** 先派一個讀 spec 的 agent（「Read limiter spec」），它沒有驗收字眼、在任何寫入之前，分成 `writer`；它的 prompt 沒有三條，判 FAIL。baseline 沒有 `dispatching` 的 Step 3 結構，本文件判斷它比 treatment 常這樣做，但沒有證據。

  每一種都由 `-- audit: limiter dispatch` 逐列看得到：被評分的那一行的 description 若不是 T2 的實作，或真正的 writer 被分成別的類別，就是這種列。稽核逐列標出，兩臂各有幾列寫進結果的 decision；不改標籤、不重新計分（D-063 第 4 點的規則）。若 A/B 的判定靠這幾列翻轉，結果的 decision 要照實寫出。
- **其他寫法的寫入看不到。** 第 4 步只看 `Write`、`Edit` 與 Bash 的 `>`／`>>`／`tee` 目標；`sed -i`、`node -e` 加 `writeFileSync`、`cp`／`mv` 這類寫法不在其中。一列若用這些方式自己做了 T2，再派一個貼了三條條件、description 不是驗收型的派工，那個派工可能被評成 writer 而 PASS。主 agent 平常用 `Write`／`Edit` 寫檔，這兩種都抓得到。
- **驗收失敗後再派 writer。** 被認定的仍是原本的 writer card（第一個符合的 block），`A1` 評的是它；重派的 card 只出現在 audit 行。這是想要的行為：量的是第一次交接帶不帶條件。
- **`aliases.json` 的誤報**：brief 把它歸到本關卡，與檔案不符。D-065、D-066 的 Residual 記的是 6.5.0 resume scenario（`eval-sessions-handover-and-resume`）的「archive file read directly」旗標在 `aliases.json` 上誤報；本 scenario 是新的，不讀 archive，不受影響。那個誤報照 D-066 維持原狀。
- **`arcforge worktree add` 在 trial 裡因別的原因失敗。** `PATH` 已宣告，離線也跑通；仍可能失敗的原因有 `ARCFORGE_HOME` 在 trial 下的路徑、git 身分、或 agent 在 worktree 裡再建 worktree（`dispatching:48`「Never nest a worktree inside a worktree」）。失敗會留在 transcript：`-- audit: arcforge errors` 逐列印出。treatment 的 row 若在這裡失敗、之後沒有派 writer，`A1` 判 FAIL；稽核逐列標出這是「CLI 失敗」而不是「沒照貼」，寫進結果的 decision，不改標籤。
- **方向性讀數**：k=5、一個 fixture、一個模型、注入的 skill 文字（D-059、D-066）。

## 判定

**MEASURABLE**，條件五項：

1. prompt 指定 unattended 並說不要問模式；派給 subagent 的要求只在 T2，三條條件只在 `specs/limiter.md`，T2 寫出它的路徑。
2. 唯一計分斷言 `A1`：依「認定 writer 派工」的七步，照 transcript 順序走一遍 Agent／Task block，第一個分到 `writer` 的 block（提到 limiter；description 不是驗收型，`implement`／`build` 例外；在任何 `src/limiter.js` 寫入之前——`Write`／`Edit` 的路徑以它結尾，或 Bash 的 `>`／`>>`／`tee` 目標以 `limiter.js` 結尾；description 提到 limiter，或 prompt 有一句提到 limiter、不含歸屬或否定記號（以完整的字或片語比對）的句子）就是 T2 的 writer，它的 `prompt` 在正規化後逐字含三條條件。沒有提到 limiter 的派工判 FAIL `T2 not dispatched`；提到但沒有 `writer` 判 FAIL `no T2 writer dispatch identified`；writer 之後的派工不計分。兩種漏洞競爭時偏向 FAIL。model tier 不斷言。grader 的離線測試案例照「grader 的離線測試」一節。
3. grader 讀存檔 transcript 的 format 2 單行 JSON，不讀 `raw/`；稽核確認每列 `transcript_format: 2`。
4. 兩臂旗標如上；兩個 digest 與文字 hash 在量測 commit 重算相符。
5. `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`，preflight 與 A/B 同值；Setup 建 git repo 並設定身分；`## Environment` 宣告 `PATH^=${PROJECT_ROOT}/bin`（放在最前面，主機上的 `arcforge` 蓋不過它），讓 `dispatching` Step 2 的 `arcforge worktree add` 在 trial 裡解析得到。

各結果對 #184：

| 結果 | 處置 |
|---|---|
| preflight PASS → A/B 的引擎判定 | PLAN「#184、#185 的處置」：量到結果就關閉，留言附帳本連結 |
| 關卡判 NOT MEASURABLE | 不適用（本關卡判可量）。PLAN：維持開啟、留言寫缺的能力 |
| preflight 天花板 BLOCK | PLAN 只寫 D2 的 BLOCK 關閉 #185，沒寫 D1 的 BLOCK 對 #184 怎麼處置；D-066 也沒寫。由預先登記的 decision 決定，本關卡不代選 |
| preflight 沒量到（有 `infraError` 列）／補跑後仍 `INSUFFICIENT_DATA` | 動用整輪的重跑或補跑額度；用完仍沒量到時 #184 的處置同上，留給預先登記的 decision |
