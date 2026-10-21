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
9. **trial 裡的 `arcforge` 與 git。** `ARCFORGE_HOME` 設在 trial 目錄下的 `.arcforge`（`scripts/lib/eval-trial-environment.js:404`）；D-064 (1) 記錄 `arcforge` 在真 trial 的 `Bash` 解析得到。`dispatching` Step 2 要 writer 用 `arcforge worktree add … --json`（`dispatching/SKILL.md:30-44`），那需要一個 git repo；fixture 的 Setup 要 `git init`，前例是 `evals/scenarios/eval-code-review-range-fidelity.md:59-61`。

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

**A1，唯一計分的斷言**：T2 的 writer 派工帶著三條 acceptance criteria。writer 派工以順序與主題認定：transcript 裡**第一個** `prompt` 提到 limiter 的 Agent／Task block，「提到」是正規化後含 `specs/limiter.md`、`src/limiter.js` 或 `limiter` 其中之一。這個 block 的 `prompt` 要同時含有三條條件；沒有任何提到 limiter 的 Agent／Task block 判 FAIL（原因：T2 沒有派工）。之後提到 limiter 的 block 不計分，只進 audit。比對前兩邊都做同樣的正規化：連續空白併成一個空格、去掉反引號、去掉句尾句點、轉小寫。`json.loads` 失敗的 block 記為不可讀，不參與認定。

- **為什麼是「第一個提到 limiter 的派工」，不是「至少一個」**：「至少一個」會讓 treatment 在它要被抓的那個失敗上通過。`dispatching` Step 4（`:91-96`）要求把 acceptance 交給另一個 fresh-context agent，檢查「does the delivered code satisfy every criterion」；照做的 treatment 可以只給 writer `specs/limiter.md` 的路徑，再把三條條件貼給 acceptance agent，「至少一個」就判它 PASS。這條指示只有 treatment 讀得到，所以這個假 PASS 只會出現在 treatment 一邊，會把 delta 往上推，還可能錯誤地關閉 #184。format 2 沒有 parent／top-level 的標記（事實 7），grader 只能靠別的特徵分辨 writer 與 acceptance agent。順序就是那個特徵：`dispatching` 的步驟是 Step 3 寫 card 派 writer（`:56-78`），Step 4 在 writer 回報之後才驗收（`:80-96`，「A completion report is a claim」），所以 writer 的 card 一定在 acceptance 的 prompt 之前。先派 T1 或 T3 不影響認定：它們的 prompt 不提 limiter。6.5.0 的關卡沒有討論這個 acceptance agent 的混淆：它的論點是 card 的全文讀不到、「有 acceptance criteria」量的是 `dispatching` Step 3（`design-gate.executing-dispatching.md`「兩個斷言能鑑別嗎？」），沒有走到「讀得到全文之後，哪一個 block 才是 card」這一步。
- **為什麼去反引號與大小寫**：第 2、3 條含反引號，agent 把條件改寫成清單時常拿掉或加上 code 標記、句首大小寫跟著清單格式變；這些不改變條件的字。逐字比對要抓的是改寫（「10 per second」），不是排版。
- **依賴的格式**：grader 依賴 format 2 的單行 JSON（事實 6）。format 1 的 row 只有 200 字元，條件幾乎一定不在裡面，所以 grader 不必判斷格式；量測在 `d1ae3060` 之後跑，每一列都是 format 2，稽核逐列確認 `transcript_format: 2`。

**印出、不計分的 audit 行**：

- `-- audit: specs/limiter.md opened`：有沒有 `[Tool: Read]`、或 `Bash` 指令含 `specs/limiter.md`。沒開 spec 的 FAIL 與開了卻沒照貼的 FAIL 分開報告。
- `-- audit: dispatching/SKILL.md opened`：有沒有工具呼叫讀 staged 的 `dispatching/SKILL.md`（路徑含 `arcforge-eval-skill-` 與 `SKILL.md`，且不是 `executing` 的那一份）。treatment 的地板指標；baseline 若出現，表示它往 trial 樹外找。
- `-- audit: agent calls`：Agent／Task block 的總數。
- `-- audit: limiter dispatch`：每一個提到 limiter 的 block 一行：它在所有 Agent／Task block 中的位置、含幾條條件（0–3）、`description` 的前 80 字元、`prompt` 是否含 `specs/limiter.md` 這個路徑，以及它讀起來是不是驗收（正規化後含 `review`、`verify`、`accept`、`check against` 其中之一）。第一行就是 `A1` 評分的那個 block。稽核者看得到 writer 與 acceptance 的 prompt 並排，看得到「writer 只給路徑、acceptance 才貼條件」這種列，也看得到驗收失敗後再派的 writer。
- `-- audit: not top-level`：無法判斷。format 2 不標記 subagent 的呼叫（事實 7），這一行固定印出這句，提醒稽核者一個含條件的 block 理論上可能出自 subagent。
- `-- audit: model tier`：prompt 裡有沒有 `model:`、`haiku`、`sonnet`、`opus` 這類欄位。不計分：6.5.0 關卡與 D-066 都判它在兩臂都是天花板，不斷言。
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

- **條件**：`--model 'opus[1m]' --effort xhigh`、隔離、不帶 `--plugin-dir`、`ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`（preflight 與 A/B 同值，它在 preflight 的鍵裡，`eval-preflight.js:129-136`）。`## Max Turns` 不設：subagent 與 acceptance agent 會吃掉回合，設了就進鍵。`## Environment` 不宣告。
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
- **稽核**：逐列報告 A1、所有 audit 行（`limiter dispatch` 的第一行是不是 T2 的實作 card 逐列判讀）、`transcript_format`、耗時與是否被砍、treatment 有沒有開 `dispatching/SKILL.md`、baseline 有沒有往 trial 樹外找。

## 殘餘風險

- **列名不是 host 的列名**（B-22 Residual）：treatment 讀本體的頻率可能與真實 session 不同。讀數只說明「本體可及時」的行為，不是 plugin 載入後的行為。
- **subagent 的呼叫沒有標記**（事實 7）。第一個提到 limiter 的 block 若出自 subagent，仍會被當成 writer；稽核者逐列看那個 block 前後的工具呼叫。
- **第一個提到 limiter 的派工不是 writer 時，`A1` 判 FAIL**，是假陰性。兩種形狀，方向相反，所以不能說它只會縮小 delta：
  - **treatment 一邊（縮小 delta）。** `dispatching` 的 card 有「Constraints」一欄（`:66`），Step 1 要寫下「which piece owns which files」（`:21-22`）；照做的 treatment 若先派 T1，T1 的 card 很可能寫「do not touch `src/limiter.js`, T2 owns it」，這個 block 就成了第一個提到 limiter 的派工，`A1` 對一張 T1 的 card 評分而判 FAIL。`dispatching` 也把 research、review、investigation 列為可派的唯讀工作（`:53-54`），先派一個讀 spec 的 agent 是同一種形狀。這兩條指示只有 treatment 讀得到，所以 treatment 比較容易碰到。
  - **baseline 一邊（放大 delta）。** baseline 若先派一個規劃或探索的 agent 去讀 spec，再派 writer 並貼條件，`A1` 同樣判 FAIL，delta 因此變大。baseline 沒有任何文字叫它這樣做，本文件判斷它比 treatment 少見，但不是不可能。

  兩個方向都由 `-- audit: limiter dispatch` 逐列看得到：第一行的 block 讀起來不是 T2 的實作 card（description 是 T1、T3、research 或 review），就是這種列。稽核逐列標出，兩臂各有幾列寫進結果的 decision；不改標籤、不重新計分（D-063 第 4 點的規則）。若 A/B 的判定靠這幾列翻轉，結果的 decision 要照實寫出。
- **驗收失敗後再派 writer。** 第一個 block 仍是原本的 writer card，`A1` 評的是它；重派的 card 只出現在 audit 行。這是想要的行為：量的是第一次交接帶不帶條件。
- **`aliases.json` 的誤報**：brief 把它歸到本關卡，與檔案不符。D-065、D-066 的 Residual 記的是 6.5.0 resume scenario（`eval-sessions-handover-and-resume`）的「archive file read directly」旗標在 `aliases.json` 上誤報；本 scenario 是新的，不讀 archive，不受影響。那個誤報照 D-066 維持原狀。
- **方向性讀數**：k=5、一個 fixture、一個模型、注入的 skill 文字（D-059、D-066）。

## 判定

**MEASURABLE**，條件五項：

1. prompt 指定 unattended 並說不要問模式；派給 subagent 的要求只在 T2，三條條件只在 `specs/limiter.md`，T2 寫出它的路徑。
2. 唯一計分斷言 `A1`：第一個 `prompt` 提到 limiter 的 Agent／Task 呼叫（T2 的 writer 派工）在上述正規化後逐字含三條條件；沒有提到 limiter 的派工判 FAIL；之後的 limiter 派工（例如 acceptance agent）不計分。model tier 不斷言。
3. grader 讀存檔 transcript 的 format 2 單行 JSON，不讀 `raw/`；稽核確認每列 `transcript_format: 2`。
4. 兩臂旗標如上；兩個 digest 與文字 hash 在量測 commit 重算相符。
5. `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`，preflight 與 A/B 同值；Setup 建 git repo 並設定身分。

各結果對 #184：

| 結果 | 處置 |
|---|---|
| preflight PASS → A/B 的引擎判定 | PLAN「#184、#185 的處置」：量到結果就關閉，留言附帳本連結 |
| 關卡判 NOT MEASURABLE | 不適用（本關卡判可量）。PLAN：維持開啟、留言寫缺的能力 |
| preflight 天花板 BLOCK | PLAN 只寫 D2 的 BLOCK 關閉 #185，沒寫 D1 的 BLOCK 對 #184 怎麼處置；D-066 也沒寫。由預先登記的 decision 決定，本關卡不代選 |
| preflight 沒量到（有 `infraError` 列）／補跑後仍 `INSUFFICIENT_DATA` | 動用整輪的重跑或補跑額度；用完仍沒量到時 #184 的處置同上，留給預先登記的 decision |
