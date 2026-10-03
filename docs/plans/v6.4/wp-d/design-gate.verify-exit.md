# verify-exit 設計關卡（D-055 (iii)）

**判定：NOT MEASURABLE。** 現行引擎無法讓兩臂在這一句上產生差異。本項記為發現，花 0 個 session；PLAN 預留給它的 13 個 session（preflight 3 + A/B 10）不動用。

本文件只閱讀程式與紀錄，沒有啟動任何 trial。行號以 `main` 的 `da311fe3` 為準。

## 受測的句子

`skills/core/diagramming-obsidian/SKILL.md:168-176`（PR #267，c5328ba4），接在 `:164-166` 的 verifier 指令之後：

- 非零退出時先讀印出的那一行再行動；
- 缺 `uv`、playwright 或 Chromium 是安裝問題，不是檔案損毀，不要重新產生；
- 缺 `uv` 就先裝 `uv`，缺 playwright 或 Chromium 就跑上方的 setup 指令（`:28-29`），然後再 verify 一次；
- 只有格式損毀或 render 不符，才從 `references/save-format.md` 的 canonical template 重新產生。

它修正的是舊句「Non-zero exit means format corruption or a render mismatch … On failure, regenerate」：自從 #228（PR #257）讓 verifier 在缺相依套件時也非零退出，舊句會讓 agent 因為缺 Chromium 而重做一張沒壞的圖。

## 引擎事實

1. **treatment 只拿到 `SKILL.md` 的文字。** `eval ab` 把 `--skill-file` 讀成字串（`scripts/cli/eval-command.js:383-396`），`runSkillEval` 把它接在 scenario 的 `## Context` 前面（`scripts/lib/eval.js:236-239`），`buildTrialPrompt` 再把 Context 與 Task 拼成唯一一則 user message（`scripts/lib/eval-trial.js:422-435`），從 stdin 餵給 `claude -p`（`:159`、`:178-180`）。argv 裡沒有任何指向 skill 目錄的參數（`buildClaudeArgs`，`:371-395`）。
2. **treatment 解析不到 `references/`。** `SKILL.md:19-30` 要求從 host 載入 skill 時附上的「Base directory for this skill」那一行解析 `references/`，而且明說不要對使用者的工作目錄解析。注入模式沒有那一行（事實 1），所以 treatment 讀得到「跑 `verify_saved_diagram.py`」，卻不知道它在哪裡。這正是 D-049 Residual 所說的限制。
3. **script 進得了 trial 的路只有兩條，兩條都不能用。**
   - fixture 複製：`runSetup` 給 Setup `PROJECT_ROOT`（`scripts/lib/eval-trial-env.js:84-93`），Setup 可以把 `references/` 複製進 trial。但兩臂跑同一個 Setup，baseline 一樣看得到；`eval-maintaining-obsidian-audit-runs-lint-script` 在 6.3.0 離線關卡就是因此判定需要引擎修改（`evals/skill-eval-coverage.md`，6.3.0 量測輪「不花 session 的發現」）。
   - 逃出 trial：trial 目錄建在 `<projectRoot>/.eval-trials/` 底下（`eval-trial-env.js:28-34`），所以 `../../skills/core/diagramming-obsidian/references/verify_saved_diagram.py` 在磁碟上確實存在。擋住它的只有 `--append-system-prompt` 的一句建議（`eval-trial.js:385-388`）。P5 曾記錄五個 treatment trial 全部逃出去讀真的 `references/`，整個 delta 因此作廢（`evals/scenarios/eval-diagramming-obsidian-unverified-save-claim.md`，Version 2 一節）。靠逃逸才拿得到的 script，量到的就是逃逸。
4. **缺相依套件的出口無法由 scenario 製造。** trial 的環境沿用 operator 的 `process.env`，只改了 `ARCFORGE_HOME`（`eval-trial.js:196`）；Setup 的 env 只在 Setup 裡有效（`eval-trial-env.js:85-98`），scenario 沒有欄位能改 trial 的 `PATH`。量測主機上 `uv` 在 `~/.local/bin/uv`，`~/Library/Caches/ms-playwright/` 已有 Chromium，`references/.venv` 也已存在，因此在這台主機上實際執行 verifier，不會走到缺相依套件的分支。
5. **照這句去安裝，會改到 trial 之外的主機狀態。** `uv` 與 playwright 寫進使用者層的快取；write guard 只監看 `projectRoot` 與 plugin 目錄（`eval-trial.js:176`、`scripts/lib/eval-trial-guard.js:97-99`），看不到這些寫入。第一個 trial 裝好之後，之後每個 trial 的環境都已裝好這些套件，trial 之間不再獨立。要在 Setup 先裝好也不行：Setup 有 30 秒上限（`eval-trial-env.js:96`）。
6. **trial 裡沒有 Obsidian。** `ea.create()` 不可及，只剩 manual fallback 這條存檔路徑（`eval-diagramming-obsidian-unverified-save-claim.md` 的 Design Notes 開頭）。

另一個細節：`SKILL.md:165` 的指令本身就是 `uv run python verify_saved_diagram.py`。沒有 `uv` 時，失敗的是 shell（`command not found`），verifier 根本沒跑，不會印出 `VERIFY FAILED:`；verifier 自己那句 `` `uv` not found on PATH ``（`verify_saved_diagram.py:159-160`）只出現在它內層呼叫 renderer 的時候。這和 D-055 第 4 點對 6.3.0 CHANGELOG 的更正一致。

## 逐題回答

**trial 裡跑得到 `verify_saved_diagram.py` 嗎？在哪個路徑？** 合法的路只有 fixture 複製，路徑是 Setup 放的位置（例如 `./references/`），兩臂相同。另一個「可及」的路徑是 `../../skills/core/diagramming-obsidian/references/`，那是逃出 trial（事實 3）。

**baseline 會去 verify 嗎？** 不會。沒有 skill 文字，baseline 不知道有 verifier，也不知道存檔後要驗證。要讓它跑，就得在 prompt 或 fixture 裡寫明，受測的指令就成了兩臂共有的內容。

**fixture 放 script 加一個會失敗的假 `uv` 呢？** 假 `uv` 要排在 `PATH` 前面才會被叫到，scenario 改不了 `PATH`（事實 4）。剩下兩種做法：叫 agent 用明確路徑跑 `./bin/uv`，這又是把指令寫進 prompt；或改寫 verifier，讓它永遠印出缺相依套件的那一行。後者量的是假 verifier，而且 agent 照句子安裝後再 verify，假 verifier 還是失敗。第二次失敗之後，重新產生反而是合理的下一步，判讀就由 fixture 決定了。

**那量到的是句子還是 fixture？** fixture。

**更根本的問題：對照組錯了。** 這句修正舊句造成的錯誤。baseline 不注入 skill 文字，也就不受舊句誘導：它看到 `playwright not installed. Run: cd … && uv sync && uv run playwright install chromium`（`render_excalidraw.py:186`），多半會照那行去安裝，不會重畫。所以 skill 對 no-skill 的 A/B，baseline 在這一點上很可能已經在天花板，preflight 會 BLOCK。能把差異歸到這一句的對照是舊 `SKILL.md` 對新 `SKILL.md`，但 `eval ab` 只比較「不注入」與「注入一份 skill」（`eval.js:202-262`、`eval-command.js:383-396`），其他子指令都不注入 skill 文字。

## 判定

NOT MEASURABLE。事實 2、3 讓 treatment 碰不到真的 verifier（除非逃逸）；事實 4、5 讓缺相依套件的出口無法重現，就算重現了也會污染後續 trial；最後一點讓 no-skill baseline 很可能在天花板。只解決其中一項仍然量不到。

## 帳本用的發現文字

> `diagramming-obsidian` verify-exit 句子（#267，`SKILL.md:168-176`）：6.4.0 離線設計關卡判定以現行引擎無法量測，未花 session。skill-scope 的 A/B 只把 `SKILL.md` 文字接在 prompt 前面，沒有 skill 的 base directory，treatment 找不到 `references/verify_saved_diagram.py`；fixture 若把它放進 trial，baseline 也看得到，P5 的結果作廢，正是因為 script 要逃出 trial 才拿得到。缺相依套件的退出也無法製造：trial 沿用 operator 的環境，scenario 改不了 `PATH`，量測主機上 `uv` 與 Chromium 都已安裝，照句子安裝又會寫進 write guard 看不到的使用者快取，讓後面的 trial 跑在不同環境。改寫 verifier 讓它假裝缺相依套件，量到的是 fixture。再者，這句修的是舊句的誘導，no-skill baseline 沒有那個誘因，照錯誤訊息安裝即可通過，能歸因到這句的對照是舊版對新版 `SKILL.md`，`eval ab` 不支援。這句以文字出貨，與 #228、#210 的 script 修改相同（D-049 Residual）。

## 要怎樣的引擎修改才量得到

三項都要，缺一不可：

1. **wish `eval-skill-files-outside-trial`**（`product/BACKLOG.md:103-107`）：只給 treatment 一行 host 格式的「Base directory for this skill」，並把該 skill 的檔案放在 baseline 列不到的 trial 樹之外。這讓 treatment 能跑到真的 verifier，baseline 碰不到。
2. **trial 範圍的環境覆寫**：讓 scenario 宣告 trial 的 `PATH`（例如拿掉 `uv` 所在目錄，或前置一個只對這個 trial 有效的目錄），並讓每個 trial 有自己的 `HOME`／快取目錄，安裝寫不出 trial。這樣缺相依套件可以穩定重現，trial 之間仍然獨立。它和 wish `eval-trial-sandbox`（`product/BACKLOG.md:88-91`）相鄰，但需求更窄。
3. **兩份 skill 文字的 A/B**：baseline 也注入一份 `SKILL.md`（#267 之前的版本），treatment 注入現行版本，兩臂只差這一句。沒有這項，baseline 沒有舊句的誘導，差異量不出來。

三項都到位之後，scenario 的骨架是：fixture 放一個 manual-fallback 格式正確的 `.excalidraw.md`，prompt 要求確認它能在 Obsidian 打開，trial 的 `PATH` 拿掉 Chromium 可用的條件；判定看 agent 在缺相依套件退出之後是重新產生檔案（vault 檔案的雜湊改變），還是安裝後再 verify。這只是方向，不是本輪的設計。
