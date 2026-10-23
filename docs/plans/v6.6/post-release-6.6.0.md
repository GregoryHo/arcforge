# 6.6.0 發版後查核（2026-10-23）

Claude Code 2.1.309。方法同 [`post-release-6.5.1.md`](post-release-6.5.1.md)，每個出貨的改動只做一個探測。每一項都只查 GitHub release 與暫時安裝的複本，不讀開發 checkout 的原始程式碼；下表的「安裝版」指 `plugins/cache/arcforge-dev/arcforge/6.6.0/`。「探測專案」是一個暫時 git 專案，裡面只有一個 `## Grader` 為 `code` 的 skill-scope scenario `probe660`、一個主 skill 目錄 `skills/primary/`，以及一個第二 skill 目錄 `second-skill/`（frontmatter `description` 為一行），`PATH` 最前面放一個假 `claude`：記錄每次呼叫的參數與 stdin，再把一份 stream-json fixture 印到 stdout。D-066 到 D-069、計畫紀錄與 #320 的貢獻者規則都是文字，沒有可探測的行為，所以不列。

| 查核 | 方式 | 結果 |
|---|---|---|
| Release | `gh run view 39918644125`、`gh release view v6.6.0`、`git ls-remote origin refs/tags/v6.6.0` | run `success`（07:34:18Z 到 07:39:05Z），tag `v6.6.0`（annotated，5b7bcc9c）指向 0ac54d5b；Release 已發布（非 draft、非 prerelease，`publishedAt` 2026-10-23T07:39:02Z），body 與 CHANGELOG `[6.6.0]` 段 `diff -wB` 無差異 |
| 網站 | curl `arcforge.greghojob.workers.dev` 的 `page/hero.js`、`page/sections.js`（09:20:00Z）；`gh api repos/GregoryHo/arcforge/commits/0ac54d5b/check-runs` | 兩個 bundle 都是 `v6.6.0`（`hero.js` `cf-cache-status: MISS`，`sections.js` `HIT`）。0ac54d5b 本身有 `Workers Builds: arcforge`，`success`，07:26:36Z 完成：這次正式站在合併 commit 上就建置了，不像 6.5.1 要等下一次推上 main |
| GitHub 來源安裝 | 全新 `CLAUDE_CONFIG_DIR`、`claude plugin marketplace add GregoryHo/arcforge`、`claude plugin install arcforge@arcforge-dev` | payload 在 `plugins/cache/arcforge-dev/arcforge/6.6.0/`，是複本（無 `.git`）；`installed_plugins.json` 的 `installPath` 指向該路徑，`version` 6.6.0，`gitCommitSha` 為 0ac54d5b。`node_modules` 又出現了（208 個項目），marketplace 的 clone 裡沒有；這是 host 的行為，見 `.claude/rules/dev-context.md`，沒有往下追 |
| SessionStart hook 從快取執行 | 在 repo 外的空目錄跑一個 `claude -p "reply with the word ok" --model opus --debug`，`ARCFORGE_HOME` 指向暫時目錄 | hook 已執行，見下方說明。該 turn 以 `Not logged in · Please run /login` 結束（exit 1），與 6.5.1 相同，未重跑 |
| `lint_vault` 區塊模型（#310、#256） | 暫時 vault：四個目標筆記 `example-a`、`real-b`、`real-c`、`real-d`（再加 `real-d2`），每種形狀各一份探測筆記：(a) 空行後縮排 4 格的 `[[example-a]]`；(b) `> text ``` q`、`>```` 之後，引言結束的下一行 `[[real-b]]`；(c) 清單項目 `- item` 的 lazy 行 `z ``` w`，接著 `  ````、`Text ```lit [[real-c]]`、`````；(d) `` a `x [[real-d]] `` 之後接標題 `` # h ` [[real-d2]] ``。跑安裝版 `python3 skills/core/maintaining-obsidian/references/lint_vault.py <vault> --scope all --json`，讀 `links`；對照組是從 GitHub 取 `v6.5.1` tag 的同三個檔案（`gh api …/contents/…?ref=v6.5.1`），對同一個 vault 跑一次 | 安裝版：`orphans` 為 `example-a.md`、`probe-a.md`；inbound 為 `example-a` 0、`real-b` 1、`real-c` 1、`real-d` 1、`real-d2` 1；outbound 為 `probe-a` 0、`probe-b` 1、`probe-c` 1、`probe-d` 2。即 `[[example-a]]` 被當成範例，`real-b`、`real-c`、`real-d` 都算連結。v6.5.1 對照組四項全反：`example-a` inbound 1，`real-b`、`real-c`、`real-d` inbound 0，`probe-d` outbound 1（只剩 `real-d2`）。注意 `lint_vault.py` 要從自己的目錄 import `vault_frontmatter`，所以照 `audit.md` 用 `python3`，不能加 `-I` |
| `--also-stage`（#309、#316、D-067） | 探測專案，先跑安裝版 `eval preflight probe660 --stage-skill-files --baseline-skill-file skills/primary/SKILL.md`（grader 判 FAIL，`Verdict: PASS`），再跑 `eval ab probe660 --k 1 --skill-file skills/primary/SKILL.md --stage-skill-files --baseline-skill-file skills/primary/SKILL.md --also-stage second-skill`，對照組是同一行去掉 `--also-stage` | (i) treatment 的 stdin 在 `Base directory for this skill: <copy>` 之後多一行 ``Skill `second-skill` (Second probe skill for the listing line.) is available; its base directory is `<copy2>` — read `<copy2>/SKILL.md` to use it.``；baseline 沒有這一行；第二 skill 的內文（標記字串 `ZZ-SECOND-BODY`）兩臂都沒有注入。(ii) treatment 的 `--append-system-prompt` 寫 `The exceptions are <copy>, the base directory of the skill you were given, and <copy2>, the base directory of the `second-skill` skill: …`，與 stdin 的兩個路徑相同；baseline 是 `The one exception is <copy>, …`，與不帶旗標那次逐字同型。(iii) 三個複本都是 `/var/folders/…/T/arcforge-eval-skill-<pid>-<rand>`，即 `os.tmpdir()`，trial 結束後都已移除（之後 0 個）。(iv) 帶旗標那次兩臂的列都是 `alsoStaged: true`、`alsoStagedFilesHash` `3b4d8aea62dde001`；`skillTextHash` `61939d79d4b1fc6c`、`skillFilesHash` `da1ebc324ccd99e5`，與不帶旗標那次（run `20261023-092320`，沒有 `alsoStaged` 欄位）完全相同 |
| `--also-stage` 的拒絕 | 同一探測專案，每個指令前後量假 `claude` 的呼叫紀錄與 `evals/results/probe660/` 的 run 數 | 每個都 exit 1，紀錄 0 行，run 數 5 不變：`eval preflight … --also-stage second-skill` 回 `Error: eval preflight refuses --also-stage: the second skill reaches the treatment only, and a preflight runs the baseline. Drop the flag; the A/B with it is gated by the same preflight (B-22).`；沒有 `SKILL.md` 的目錄回 `Error: --also-stage no-skill-md has no SKILL.md: name a skill directory.`；只寫 `--also-stage`（放在最後或放在別的旗標前都一樣）回 `Error: --also-stage requires a skill directory: --also-stage <skill-dir>.`；frontmatter 沒有 `description` 回 `Error: --also-stage no-desc: its SKILL.md has no frontmatter description, which the line naming the skill carries.`；另外不帶 `--stage-skill-files` 回 `Error: --also-stage requires --stage-skill-files: the second skill is reached through its staged copy, and without staging there is none (B-22).` |
| 新 scenario 與 fixture 修正（#314、#315、#317） | 安裝版的 `evals/scenarios/`；在安裝版目錄跑 `eval lint` 與 `eval list` | `eval-executing-dispatch-acceptance.md` 是 Version 1、`## Trials` 5，`## Setup` 在 `git init` 與身分設定之後有 `git config commit.gpgsign false`；`eval-diagramming-obsidian-layout-grid.md` 是 Version 2、`## Trials` 5。兩個 `eval lint` 都回 `ok`（exit 0）；`eval list` 列為 `(skill, code, discriminative-lift) — NO RUNS`，因為 `evals/results/` 沒有進版控，複本裡沒有任何列 |
| Benchmark snapshot（#318） | 安裝版 `evals/benchmarks/` | `2026-10-22.json` 與 `raw/2026-10-22.json` 都在；這兩個與 `latest.json`、`raw/latest.json` 的 `generated` 都是 2026-10-22T09:48:04.283Z |
| 版本 | 安裝版 `scripts/check-version-sync.js` | 九個位置都是 6.6.0，exit 0 |

探測專案裡，假 `claude` 被呼叫幾次，這次要分開說：`eval preflight` 每個 trial 呼叫兩次（一次 `plugin list --json`，一次 `-p --output-format stream-json …`），`eval ab` 則是整個 run 只呼叫一次 `plugin list --json`，每個 trial 再一次 `-p`。兩種都印同一份 fixture，所以 `plugin list` 拿到的不是它預期的輸出，這對上面的結果沒有影響。prompt 走 stdin，不在參數裡，所以假 `claude` 這次也記下 stdin；listing 那一行是在 stdin 裡找到的。

另外兩點與 6.6.0 的改動無關，順手記下。第一，code grader 的標籤要寫成 `A1:FAIL`，冒號後不能有空格：第一次試跑時 grader 印 `A1: FAIL`，engine 解析不到任何標籤，而 grader exit 0，該列就記成 `passed: true`、`score: 1`，preflight 因此 BLOCK。改成 `A1:` 之後才是預期的 FAIL。指南寫的是「``A<N>:`` labels」，沒有說不能有空格。第二，兩次 `eval ab` 在同一秒內開始時共用一個 run 目錄（`runId` 只到秒）：帶旗標與不帶旗標的兩次 run 都寫進 `20261023-092252`，四列都在 `baseline.jsonl` 與 `treatment.jsonl` 裡，但 `transcripts/` 與 `raw/` 只剩後一次的檔案，前一次的兩列指向的 transcript 已被覆寫。上表 (iv) 的對照組因此另跑一次，落在 `20261023-092320`。真實 trial 每個要幾分鐘，兩次 run 很難落在同一秒，但這兩點都沒有往下追。

## hook 的證據

登入失敗發生在 hook 之後，所以證據取自 session 留下的檔案，不取自模型回覆：

- session-tracker 寫出 `$ARCFORGE_HOME/sessions/empty/2026-10-23/session-a170cf93-2a98-4bf9-85f0-959a4ed43040.json`，`started` 為 `2026-10-23T09:20:21.299Z`。`ARCFORGE_HOME` 是暫時目錄，真正的 `~/.arcforge/sessions/` 沒有出現 `empty`。
- debug log：
  - `Read manifest hooks for plugin arcforge (enabled=true): ./hooks/claude-code.json`
  - `Hook SessionStart:startup (SessionStart) success: … Session tracker initialized (background tasks)`
  - `Hook UserPromptSubmit (UserPromptSubmit) success`
- debug log 沒有 `unknown keys`（0 行）。

快取路徑在 debug log 出現 7 次，與 6.5.1 相同：4 行是載入 skill（從 `…/6.6.0/skills/core` 載入 16 個 skill），3 行是 hook 指令本身，`session-tracker/start.js`、`session-tracker/inject-context.js`、`user-message-counter/main.js` 都以 `…/6.6.0/hooks/` 下的絕對路徑執行。

## 清理

暫時 config 目錄（含安裝版複本，以及 `lint_vault.py` 在複本裡留下的 `__pycache__/`）、空目錄、探測專案（含 `evals/preflight/`、`evals/results/` 與 `.eval-trials/`）、暫時 `ARCFORGE_HOME`（內含那份 session 紀錄）、暫時 vault、從 `v6.5.1` 取來的對照腳本、fixture、假 `claude` 與它的呼叫紀錄都已移除。真正的 `~/.arcforge`、`~/.claude` 與執行中的 observer daemon 沒有動。

## 還欠

- `qmd` 索引更新。
- vault `index.md` 的 Decisions 計數落後 2，ingest 時已記下，尚未補。
- eli5 頁面的下一版（PLAN：6.6.0 之後一版）。

6.6.0 的三個 issue（#184、#185、#256）都已關閉。
