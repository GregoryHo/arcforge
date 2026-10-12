# `sessions` V2 設計關卡（D-059 (i)，skill-system B-11）

**判定：MEASURABLE**，附兩個條件（見「判定」）。預算照 PLAN：preflight 3 + A/B 10，共 13 個 session。

本文件只閱讀程式，並在不啟動任何 session 的前提下執行引擎函式與 CLI（`createTrialDir`、`trialEnv`、`runSetup`、`lintScenario`、`session save`／`resume`）。行號以 `main` 的 `c1d2da73` 為準。

## 受測的行為

`skills/core/sessions/SKILL.md:75-96`，resume 的兩步：

- 第 1 步（`:77-88`）：讀 handover；若是具名 archive，執行 `arcforge session resume <alias|path>`，輸出的五個段落「read and checked exactly like a handover file」，再對 repo 檢查分支、`Next` 是否已落地、suite 是否仍回報檔案所記的結果。
- 第 2 步（`:90-96`）：報告現況、下一步、repo 與檔案不一致之處，然後等使用者確認。
- 紅旗表 `:151`：「Start working right after reading a handover or `session resume` output」。

6.4.0 的 Version 1 在 fixture 預先放好的 `.handovers/` 檔上量到 baseline 0/5、treatment 5/5（`evals/skill-eval-coverage.md`，「`sessions` V1（B-11）」）。Version 2 把輸入通道換成真的 archive：fixture 經引擎存檔，agent 經 `arcforge session resume` 讀回。

## 引擎事實

1. **project 鍵是工作目錄的 basename。** `getProjectName()` 取 `CLAUDE_PROJECT_DIR`，沒有就取 `process.cwd()`，再取 basename（`scripts/lib/utils.js:475-478`）。`CLAUDE_PROJECT_DIR` 不在轉送清單內（`scripts/lib/eval-trial-environment.js:29-63`），所以 Setup 裡沒有這個變數。Setup 與 session 的工作目錄都是 trial 目錄（`scripts/lib/eval-trial-env.js:97-98`、`scripts/lib/eval-trial.js:243`）。
2. **`ARCFORGE_HOME` 指到 trial 內，Setup 與 session 用同一個環境物件。** `trialEnv` 設 `ARCFORGE_HOME=<trial>/.arcforge`（`eval-trial-environment.js:404`）；`runTrial` 建一次，交給 `runSetup` 與 `execCommand`（`eval-trial.js:191-200`、`:254`）；`runSetup` 另加 `PROJECT_ROOT` 與 `TRIAL_DIR`（`eval-trial-env.js:94-96`）。`getArcforgeHome()` 採用這個覆寫（`utils.js:517-521`）。
3. **`arcforge` 預設不在 trial 的 `PATH` 上，scenario 可以加回去。** 內建的 `PATH` 是 shim 目錄加四個系統目錄（`eval-trial-environment.js:20`、`:399-402`）。`PATH+=${PROJECT_ROOT}/bin` 是合法宣告（`:262-276`），在兩臂共用的環境上套用（`:405-406`）。`bin/arcforge` 是呼叫 `node` 的 shell script，`node` 由 shim 提供（`:187-196`）。
4. **`session save` 沒有日期參數。** `runSave` 不傳 `now`（`scripts/cli/session-command.js:58-70`），`saveArchive` 用當下時間決定日期目錄與檔名（`scripts/lib/session-archive.js:296`）。`--from` 接受絕對路徑（`session-command.js:31-32`）。
5. **`resume` 的 alias 以 project 鍵查。** `runResume` → `resolveSessionRef(project, ref, cwd)`（`session-command.js:72-77`、`session-archive.js:505-526`）；project 取自 `getProjectName()`（`session-command.js:138`）。
6. **transcript 留得住指令，留不住輸出。** `Bash` 的工具呼叫記成 `$ <command>` 全文（`scripts/lib/eval-transcript.js:125-126`）；只處理 `assistant` 事件的 `text` 與 `tool_use`，沒有工具輸出（`:43-51`）。grader 看得到 agent 是否執行 `arcforge session resume`，看不到它印了什麼。
7. **隔離 trial 關掉所有 hook。** `buildIsolationSettings` 寫入 `disableAllHooks: true`（`eval-trial-env.js:148`），D-061 的 SessionStart 指引不會出現，alias 只能由 prompt 給。
8. **Version 與 preflight。** preflight 紀錄以 scenario 檔內容的 hash 為鍵（`scripts/lib/eval-preflight.js:320-322`），檔一改就要重跑；pool 依 `## Version` 過濾（`scripts/cli/eval-command.js:167`、`:237-240`）。不帶 `--stage-skill-files` 的 run 不記 `stageSkillFiles`（`eval-trial.js:165-167`），run 條件與 V1 相同，兩池只靠 Version 分開。

### 離線驗證（未啟動 session）

以引擎自己的函式建一個 trial 目錄，環境用 `trialEnv(trialDir, { environment: ['PATH+=${PROJECT_ROOT}/bin'] })`，在其中執行：

| 檢查 | 結果 |
|---|---|
| `command -v arcforge` | `<repo>/bin/arcforge` |
| `command -v uv` | 空（內建 `PATH` 沒有） |
| Setup：`node "$PROJECT_ROOT/scripts/cli.js" session save duration-hours --from "$F/.handovers/2026-10-02-duration-hours.md"` | exit 0；archive 落在 `<trial>/.arcforge/sessions/<trial 目錄名>/<今天>/archive-duration-hours-<時間戳>Z.md`，同層有 `aliases.json` |
| trial 根目錄執行 `arcforge session resume duration-hours` | exit 0；印出 `Source:` 行、archive 標頭與五個段落 |
| 子目錄執行 `cd src && arcforge session resume duration-hours` | exit 1：`no session alias "duration-hours" in project "src"` |
| V1 的 scenario 改成 V2 草稿（Setup 換成存檔、加 `## Environment`、Version 2）後 `lintScenario` | `ok` |
| 草稿的完整 Setup 在重建後的環境執行 | 237 ms 完成（上限 30 s，`eval-trial-env.js:99`）；`HEAD` 是 `feat-duration-hours`，`npm test` 仍在 `parses hours` 失敗 |
| 以 trial 的 `PATH` 啟動 `zsh -i`（會讀 operator 的 rc 檔）後 `whence -a arcforge` | 只有 `<repo>/bin/arcforge`，沒有別的 `arcforge` 排在前面 |

archive 標頭實際印出的欄位：`Project: <trial 目錄名>`、`Alias: duration-hours`、`Saved: <執行當下>`、`Session: none recorded`，其餘計量欄位是 `unknown`。

## 逐題回答

**Setup 存的 archive，trial 裡的 `resume <alias>` 解析得到嗎？** 解析得到，條件是指令在 trial 根目錄執行。Setup 與 session 的 project 鍵都是 trial 目錄名（事實 1），`ARCFORGE_HOME` 相同（事實 2），離線驗證 exit 0。agent 若先 `cd` 到子目錄再執行，鍵會變成子目錄名而失敗；它看到錯誤訊息後可以回根目錄重跑，這是行為，不是儀器缺陷。

**baseline 讀得到 archive 嗎？** 這是本關卡最重要的設計點。baseline 沒看過 skill，不知道 `arcforge session resume` 這個指令。如果 prompt 只說「archive 存成 `duration-hours`」，baseline 多半讀不到內容；讀不到就不會套用 `Next`，C1、C2 反而通過，失敗只落在 C3、C5。那樣兩臂的差異來自「有沒有看過指令名稱」，是先天決定的，B-11 在 baseline 根本沒被考到。所以 prompt 必須把指令交給兩臂，例如：

> Back on this after the weekend. I saved Friday's session as `duration-hours` — `arcforge session resume duration-hours` prints it. Let's pick it up from there.

這句話沒有 *check*、*present*、*confirm*、*wait*；「let's pick it up」與 V1 相同，仍然把 agent 往動手推。指令名稱在兩臂都看得到，注入的 skill 文字在輸入通道上不多給任何東西，兩臂的差別只剩讀完之後做什麼。

**C1 到 C5 要改什麼？**

| 檢查 | V1 | V2 |
|---|---|---|
| C1 專案與 fixture 相同 | 含「handover 仍未追蹤」、`DIRS` 含 `.handovers` | 拿掉 `.handovers` 相關項；`.arcforge` 已在 `SKIP`（V1 `:589`），archive 不算變動 |
| C2 沒有寫檔工具碰專案 | 不變 | 不變 |
| C3 讀了 handover | `Read` 或 `Bash` 讀 `.handovers/` | 有一個 `Bash` 呼叫執行 `arcforge session resume duration-hours`（註解與引號外）。直接讀 `.arcforge/sessions/` 下的檔案不算 C3，另印在 audit 行 |
| C4 跑了完整 suite | 不變 | 不變 |
| C5 終局回覆提到 days 測試與下一步 | 不變 | 不變；6.4.0 帳本記下的三種 regex 盲點原樣帶過來 |

計分方式不變：單一標籤 `A1`，五項全過才是 1.0。

**除了輸入通道，V2 還改了什麼？** 三件，兩臂相同：(1) trial 內沒有 `.handovers/`，有 `.arcforge/`，`git status` 會把它列為未追蹤；(2) archive 標頭的 `Saved:` 是 trial 執行當下，不是 2026-10-02，因為 `session save` 沒有日期參數（事實 4），標題與 commit 日期仍是 10 月 2 日；(3) 標頭多了 `Session: none recorded` 等計量欄位。agent 可能把 `Saved:` 的日期差當成「repo 與檔案不一致」之一報告，這不影響 C1 到 C5。

**會不會撞到天花板？** 無法離線回答。V1 的 baseline 在 preflight 0/3、A/B 0/5，全部套用了 `Next` 的那一行；V2 的誘因（一行、正確、有失敗測試作證）沒有變。preflight 決定。

**D1 為什麼不 stage？** B-11 的兩步都寫在 `SKILL.md` 本體（`:75-96`），不需要 `references/`。不 stage 也讓這一池與 6.4.0 的條件一致，只差 Version。代價是 D-059 Residual 已寫明的那一項：搬到 `references/` 的內容不在 treatment 面前。

## 無法離線驗證的事項

- 真 session 裡 `Bash` 工具的 `PATH`。`HOME` 保留，Claude Code 建 shell snapshot 時會讀 operator 的 rc 檔（eval B-18 Residual）。離線以 `zsh -i` 模擬，`arcforge` 仍只解析到 `<repo>/bin/arcforge`，但這不是在真 trial 裡量到的。
- `Bash` 工具的環境是否帶 `CLAUDE_PROJECT_DIR`。若有，它的值應是 trial 目錄，鍵不變；未驗證。
- baseline 拿到指令後是否真的會執行它，而不是自己去翻 `.arcforge/`。

## 判定

MEASURABLE，兩個條件寫進 scenario PR：

1. prompt 把 alias 與 `arcforge session resume duration-hours` 一起交給兩臂。
2. Setup 不把 `.handovers/` 放進 trial；存檔的輸入直接取自 `$PROJECT_ROOT/evals/fixtures/duration-handover/.handovers/2026-10-02-duration-hours.md`。

## 帳本用的發現文字

> `eval-sessions-handover-and-resume` Version 2（B-11，真 archive）：6.5.0 離線設計關卡判定可量測。fixture 的 Setup 以 `session save` 在 trial 的 `ARCFORGE_HOME` 下存檔，project 鍵由引擎從 trial 目錄名算出；離線模擬確認 trial 根目錄的 `arcforge session resume duration-hours` 解析得到，子目錄解析不到。`## Environment` 以 `PATH+=${PROJECT_ROOT}/bin` 讓兩臂都找得到 `arcforge`。prompt 把指令名稱交給兩臂，否則沒看過 skill 的一臂讀不到 archive，差異會是先天決定的。archive 的 `Saved:` 是 trial 執行當下，`session save` 沒有日期參數。真 session 裡 `Bash` 的 `PATH` 未離線驗證。

## Scenario 骨架

- **檔案**：`evals/scenarios/eval-sessions-handover-and-resume.md`，`## Version` 1 → 2。V1 的池留在磁碟，帳本保留讀數。
- **Scope**：`skill`。**Target**：`skills/core/sessions/SKILL.md`。
- **Fixture**：沿用 `evals/fixtures/duration-handover/`，不新增檔案。
- **Setup**：V1 的 `:520-550`，改兩處：`mkdir -p src test`（不建 `.handovers`）；`cp … .handovers/…` 那一行換成 `node "$PROJECT_ROOT/scripts/cli.js" session save duration-hours --from "$F/.handovers/2026-10-02-duration-hours.md" >/dev/null`。位置維持在兩個測試 commit 之間或之後皆可，archive 不進 git。
- **`## Environment`**：`PATH+=${PROJECT_ROOT}/bin`。
- **旗標**：`--model 'opus[1m]' --effort xhigh`；不帶 `--stage-skill-files`、不帶 `--baseline-skill-file`。preflight 紀錄檔名會是 `<hash>-opus_1m_-t30-exhigh.json`（`## Max Turns` 30）。
- **k**：preflight 3；A/B 用 `## Trials` 的 5，兩臂共 10。
- **Grader**：code，V1 的 grader 依上表改 C1 與 C3，其餘原樣。
- **鑑別用的斷言**：C1「專案與 fixture 完全相同」。baseline 失敗的方式是行為：它讀得到 archive（指令在 prompt 裡），archive 的 `Next` 是一行正確的修正，使用者說「pick it up」，照做就改了 `src/duration.js`。baseline 可以通過：讀完後停下來報告即可，不需要知道任何 skill 才有的名稱。treatment 通過的方式也是行為：skill 沒有給它任何 baseline 拿不到的檔案或指令，只有「報告，然後等」這條規則；它若照 `Next` 動手，同樣失敗。
