# `executing` → `dispatching` 交接設計關卡（D-059 (ii)，#184）

**判定：NOT MEASURABLE。** 以 `c1d2da73` 的引擎，寫不出一支兩臂在這個交接上會因行為而不同的 scenario。本項記為發現，花 0 個 session；PLAN 預留的 13 個 session 不動用。

本文件只閱讀程式、執行 `claude --help` 與不啟動 session 的引擎函式。行號以 `main` 的 `c1d2da73` 為準。

## 受測的句子

`skills/core/executing/SKILL.md:95-96`：

> Handing individual tasks to subagents is a dispatch problem — the `dispatching` skill covers fan-out, isolation, and acceptance.

#182（`1fed56d0`，B1）把句尾的「model tier」改成「acceptance」，因為 `dispatching` 在 v6 已經沒有 model tier 的內容。#184 要的是一支真的走到這個交接的 scenario，斷言落在 dispatch card 上：有 acceptance criteria、沒有 model-tier 欄位。

句子指向的內容在另一支 skill：card 的六個欄位在 `skills/core/dispatching/SKILL.md:56-78`（`:67`「Acceptance criteria, verbatim」、`:71`「Paste the text, never a file path to the text」），範本在 `skills/core/dispatching/references/dispatch-card.md`。

## 引擎事實

1. **trial 裡沒有載入 skill 的管道。** 每個 trial 的 argv 都帶 `--disable-slash-commands`（`scripts/lib/eval-trial.js:482`）；`claude --help` 對這個旗標的說明是「Disable all skills」（Claude Code 2.1.296，離線執行確認）。skill scope 也不接受 plugin dir（`scripts/lib/eval.js:282-287`）。出貨時這句話靠 host 依名稱載入 `dispatching`；trial 裡這個名稱沒有東西可以解析。
2. **注入的是一份文字；staging 複製的是那一份檔案所在的一個目錄。** `resolveSkillOptions` 只讀一個 `--skill-file`（或 `## Target`）（`scripts/cli/eval-skill-options.js:125-143`）；`runSkillEval` 對每臂呼叫一次 `buildInjection`（`eval.js:293-299`），複製的是 `dirname(skillFile)`（`scripts/lib/eval-skill-staging.js:183-199`）。`eval-skill-staging.js:12-14` 的註解說函式可以再被呼叫一次來 stage 第二個目錄，但 `eval ab` 沒有對應的旗標，`runSkillEval` 也沒有對應的選項。
3. **`skills/core/executing/` 只有 `SKILL.md` 一個檔案**（`ls` 確認）。對它加 `--stage-skill-files`，treatment 多拿到的只有 base-directory 那一行與同一份 `SKILL.md` 的複本。staged 目錄建在 `os.tmpdir()` 底下（`eval-skill-staging.js:195`），它的上一層不是 `skills/core/`，`../dispatching/` 不存在。
4. **fixture 放進 trial 的檔案兩臂都有。** Setup 對兩臂執行同一段指令、同一個環境（`eval-trial.js:191-200`）。
5. **Agent 工具呼叫的內容在 transcript 裡只留前 200 個字元。** `summarizeToolInput` 只對 `Write`、`Edit`、`Read`、`Bash`、`Glob`、`Grep` 保留內容，其餘工具走 `JSON.stringify(input).slice(0, 200)`（`scripts/lib/eval-transcript.js:110-134`，截斷在 `:131-132`）。存檔的 transcript 是這份解析後的文字（`eval-trial.js:287-289`），原始 stream-json 不留。row 上的 `actions` 也從同一份文字解析（`:290`）。dispatch card 若是 Agent 工具的 `prompt`，code grader 與 model grader 都讀不到完整內容。
6. **一個 trial 只有一則 user message。** `buildTrialPrompt` 把 Context 與 Task 併成一則（`eval-trial.js:530-543`），`-p` 與 `--no-session-persistence`（`:477-481`）。`executing/SKILL.md:84-86` 要求先問使用者要 attended 還是 unattended；prompt 不先指定模式，照 skill 做的 treatment 會停下來問，不會派工。

## 逐題回答

**`dispatching` 的本體怎麼到 treatment 手上？** 四條路，逐一看。

(a) **第二個 staged 目錄。** 不支援（事實 2）。這是缺的引擎能力。

(b) **fixture 把 `dispatching/SKILL.md` 放進 trial，兩臂都有；Target 是 `executing`。**（brief 列的前兩個選項是同一件事：Target 都是 `executing`，文字都在 fixture。）兩臂都讀得到那份文字，treatment 多的只有一句提到名稱的話。這有前例：`eval-maintaining-obsidian-audit-runs-lint-script` 把 skill 的 `references/` 放進 fixture，baseline 5/5、treatment 5/5，只能當 non-regression 的門檻讀（`evals/skill-eval-coverage.md`，6.3.0「不花 session 的發現」；#182 的 PR 說明）。門檻在這裡也沒有用：不論句尾寫 model tier 還是 acceptance，card 都不會有 model-tier 欄位，因為兩臂讀到的 `dispatching` 文字裡本來就沒有。被修改的那個字不會讓門檻失敗。另外，使用者的專案裡不會有一份 plugin 的 skill 檔，agent 在專案目錄翻到它，量到的是檔案好不好找。

(c) **自組一個目錄，`SKILL.md` 是 `executing` 的原文，底下放 `dispatching/` 的複本，整個 stage 給 treatment。** 引擎今天就支援，baseline 也碰不到。但這不是出貨的版面：出貨時 `dispatching` 在 `executing` 的旁邊，由 host 依名稱載入；這裡它在 `executing` 的 base directory 裡面，要靠 agent 自己 `ls` 才找得到。treatment 沒去找，無法分辨是指標不夠力還是版面是假的；treatment 找到了，card 的內容來自 `dispatching` 的第 3 步，讀數屬於 `dispatching`，不屬於這句話。

(d) **Target 改成 `dispatching`，加 `--stage-skill-files`。** `references/dispatch-card.md` 只到 treatment，引擎支援。但這量的是 `dispatching` 自己的 card 紀律，沒有交接，不是 #184 的問題，也不在 D-059 的四項之內。它還會撞上事實 5。

**card 讀得到嗎？** 讀不到完整內容（事實 5）。要讓 grader 看到全文，只能在 prompt 要求把 card 寫成檔案，這與 `dispatching/SKILL.md:71` 的指示相反，而且等於由 prompt 指定產出物。

**兩個斷言能鑑別嗎？**

- 「沒有 model-tier 欄位」：沒有任何一臂有理由寫出這個欄位。現行文字沒有；#182 之前的 `executing` 文字提到 model tier，但指過去的 `dispatching` 裡沒有對應內容，agent 不會自己發明欄位。每一臂都在天花板，這是地板檢查，不是鑑別。
- 「有 acceptance criteria」：能因行為而不同（baseline 可能只寫「見 spec」或改寫成摘要），但造成差異的是 `dispatching` 第 3 步的文字，不是 `executing` 的這一句。在 (b) 之下兩臂都讀得到那段文字；在 (c)、(d) 之下只有 treatment 讀得到，量的是 `dispatching`。

**以兩文字 A/B（#182 之前的 `executing` 對現行版）隔離那個字呢？** 引擎支援（`--baseline-skill-file`），但兩臂指向同一份到不了的 `dispatching`。就算以 (c) 讓它可及，兩臂讀到的 card 規則相同，預期沒有差異。這個字改的是指標的描述，不是指標指向的內容。

## 判定

NOT MEASURABLE。交接本身（依名稱載入另一支 skill）在 trial 裡不存在（事實 1）；能把 `dispatching` 只交給 treatment 的做法要嘛引擎沒有（事實 2、3），要嘛改掉了出貨的版面，讀數歸不到這句話；card 的全文 grader 讀不到（事實 5）；#184 指定的兩個斷言，一個各臂都在天花板，另一個量的是 `dispatching`。只補其中一項仍然量不到。

## 帳本用的發現文字

> `executing` → `dispatching` 交接（#184，`executing/SKILL.md:95-96`）：6.5.0 離線設計關卡判定以 `c1d2da73` 的引擎無法量測，未花 session。trial 帶 `--disable-slash-commands`，沒有依名稱載入 skill 的管道，句子指向的 `dispatching` 本體到不了 treatment；`--stage-skill-files` 只複製被注入那一份檔案所在的一個目錄，而 `executing/` 只有 `SKILL.md`。把 `dispatching` 放進 fixture 則兩臂都有，前例是 audit-runs-lint-script 的 5/5 對 5/5。transcript 對 Agent 工具的輸入只留前 200 個字元，dispatch card 的全文 grader 讀不到。#184 指定的斷言中，「沒有 model-tier 欄位」各臂都會通過，「有 acceptance criteria」量到的是 `dispatching` 第 3 步，不是被 #182 改掉的那個字。這個字以文字出貨（D-049 Residual）。#184 維持開啟。

## 要怎樣的引擎修改才量得到

三項都要：

1. **可重複的 staging**：`eval ab` 能為 treatment 再 stage 一個 skill 目錄，注入多一行那個目錄的 base-directory 行；兩個目錄的 digest 都記進 row。A5 的函式庫沒有擋住這條路（`eval-skill-staging.js:12-14`），缺的是 CLI 旗標、`runSkillEval` 的選項與 pool 條件。
2. **transcript 保留 Agent 工具的 `prompt` 全文**（`eval-transcript.js:131-132`），grader 才讀得到 card。
3. **scenario 的主張改寫成兩支 skill 合起來的行為**（有 `executing` 與可及的 `dispatching`，card 逐字帶著 task 的 acceptance criteria），並放棄「沒有 model-tier 欄位」作為鑑別斷言。被改掉的那個字本身沒有可觀察的行為後果，這一點引擎修改也改變不了。

三項到位之後的方向：task list 有一項明寫交給 subagent，prompt 先指定 unattended（事實 6）；fixture 的 acceptance criteria 是幾條不易改寫的具體條件；斷言是 Agent 工具的 `prompt` 逐字含有這些條件。這只是方向，不是本輪的設計。
