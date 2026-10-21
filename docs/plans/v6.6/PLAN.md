# arcforge roadmap：6.5.1 → 6.6.0

## Context

- main 停在 `17345e9a`：v6.5.0（tag 在 `0ca06913`，2026-10-13）之後只合併了 post-release 查核 #297。工作樹乾淨、0 個開著的 PR、`check-benchmark-freshness` 綠。開著的 issue 三張：#184、#185、#256。
- 6.5.0 的結果 decision D-064 留下一串**儀器殘債**，全在引擎與測試裡：provider 限額落在 tool call 之後的 trial 仍被計分（eval B-10 的 Residual）、preflight 重跑覆蓋前一份紀錄、A/B 的 `grading/` 兩臂同名互蓋、transcript 只留 Agent 呼叫前 200 字且不記任何 tool 結果或 exit code。另有五個本輪看到但沒開 issue 的 flaky test，與兩個老 wish（#172 `bound-transcript-parse`、`cli-human-output`）。
- 兩項量測因為引擎缺口被 D-063 判為「0 session 的發現」：#184（executing → dispatching 交接）要 treatment 有第二個 staged skill 目錄、transcript 留完整 Agent prompt；#185 的 V1 在 preflight 天花板 BLOCK（baseline 把六個 worker 讀成 Secondary、140 寬），要一個不點名寬度就讓 baseline 走到 Primary 尺寸的 V2 task。
- `scripts/check-benchmark-freshness.js:31` 只把 `skills/`、`evals/scenarios/`、`evals/fixtures/` 當成 eval 表面，所以引擎與測試的修補版可以 0 session 出貨（6.2.1 的形狀）；新 eval 旗標照 6.5.0 的先例是 minor。
- 產品狀態的正本在 `product/`；本文件是排程與執行方式，兩者不一致時以 decision 為準。

## 已定案（維護者 2026-10-20）

1. **兩個版本依序**：6.5.1 patch（儀器修補＋flake＋#172＋cli-human-output，0 session，不碰 `skills/`、`evals/scenarios/`、`evals/fixtures/`，不加旗標）先出貨；再 6.6.0 minor（第二個 staged skill 目錄、#184 與 #185 V2 的 scenario、#256 搭車、一輪量測）。
2. **量測兩項**：#184 executing → dispatching 交接、#185 Version 2 版面 reference。verify-exit 句子（obsidian B-10）**不在這版**：已兩次判不可量，第三次要兩件引擎工作加每個 trial 自己 `uv sync` 與下載 Chromium。
3. **上限約 45 個 trial session**，預先登記用。
4. **五個 flake 修在 6.5.1**：四個修根因，jest SIGSEGV 設 `maxWorkers` 緩解並記為殘留。

## 我的假設（沒有另外問；不同意就說）

- **transcript 格式改變不進 pool key**：新資料以獨立區塊或附加行寫入，既有 `[Tool: …]` 區塊的文字一字不變，所以舊 grader 的 regex、`isProviderRefusal`、`isOutputComplete` 全部照舊；row 多一個只記錄不分組的欄位讓讀的人分得出新舊 transcript（與 `node_version` 同類）。
- **#256 搭 6.6.0 的車**：它是 skill-local script（`skills/core/maintaining-obsidian/references/vault_frontmatter.py`）的修補，照 D-049 的先例以 `tests/skills/` 的 contract test 為證據、不跑 A/B；但它在 `skills/` 底下會重新武裝 freshness gate，所以只能搭有量測輪的版本，不能進 6.5.1。
- **#185 V2 是第二次也是最後一次設計**（`.claude/rules/eval.md`：兩次重設計後 delta 仍為 0 就當 skill 在形式化既有行為）：再 BLOCK 就關 #185、記為發現，`eval-layout-grid-v2` 墓碑。
- **#184 的兩臂文字相同、只差 dispatching 可及**：baseline 用 `--baseline-skill-file` 注入同一份 executing 文字，treatment 多 `--also-stage skills/core/dispatching`；量的是「交接句子加上可及的 body」這一步，不是兩支 skill 合起來對無 skill。「無 model tier 欄位」兩臂皆天花板，不作斷言。這樣 B-20 的 A/B 半邊在 D1 過 preflight 時第一次真的跑到。
- **Agent 呼叫以單行 JSON 寫進 `[Tool: Agent]` 區塊**（不是 fenced 多行）：action parser 以空行切區塊，多段 prompt 才不會被切斷。**`[Result:]` 區塊只在 `is_error` 時寫**，成功的 tool result 不寫：transcript 不膨脹、既有區塊的相鄰關係不變；Bash 失敗時附 `(exit N)`。subagent 的 tool call（stream-json 有 `parent_tool_use_id`）**這版不標記**：#184 只看最上層的 Agent 呼叫，標記會改既有區塊文字。
- **限額偵測照真 JSONL 看到的形狀寫**：session 最後一則 assistant 訊息 `model` 為 `<synthetic>`、只有 text 區塊、`usage.output_tokens` 為 0。stream-json 事件是否同形尚未親眼見過（runner 不存原始 stdout），所以 P-2 同時把每個 trial 的原始 stream-json 存進 run 目錄（untracked），下一次真的限額就是證據；偵測不中也只是回到今天的行為，沒有回歸。
- **jest SIGSEGV 先重現再改設定**：PR 跑 10 次 `--runInBand` 對 10 次預設 worker；只在預設會重現、`--runInBand` 或 `maxWorkers: '50%'` 不會時才改 `jest.config.js`，否則不改、記殘留。這比我在問題裡寫的「直接設 maxWorkers」嚴一點，照專案的 debugging 紀律。
- **D1 scenario 的 `aliases.json` 誤報不改**：那個旗標只印給 operator、不計分，改 regex 要 bump Version、清掉 +1.00 的 pool。寫進 6.6.0 的 Residual 即可。
- **`cli-human-output` 走文件路線**：在 `docs/guide/cli-invocation.md` 寫明哪些指令預設印 JSON、`--json` 對它們是 no-op；不新增 human 格式（那是新行為，不是 patch）。
- **`UV_PROJECT_ENVIRONMENT` 可宣告**不做：只有 verify-exit 需要，它不在這版。
- **eli5 頁面**：6.5.1 之後第 5 版（時間軸一列、一句話）；6.6.0 之後第 6 版。
- **`eval-router-skill-selection` 不重跑**：任何 PR 都不得改 `evals/scenarios/eval-router-skill-selection.md`（D-055 (ii) 要多 13 個 session）。

## 要記的 decision（product PR，`pm` 寫，編號取下一個空號，目前到 D-064）

| 暫稱 | 版本 | 內容 | 關係 |
|---|---|---|---|
| D-6.5.1 | 6.5.1 | patch 的範圍與理由：四項儀器殘債的修法、五個 flake、#172、cli-human-output 文件；為什麼是 patch 不是 minor（一句：沒有新旗標或指令，多的是 transcript 內容、兩個 row 欄位與 untracked 的 `raw/` 目錄；6.5.0 的 minor 理由是「hook 行為與 eval 旗標」）；為什麼不碰 eval 表面、為什麼 0 session；B-10 Residual 改寫、B-16 補紀錄保留、B-? 補 grading 檔名 | — |
| D-6.6.0 | 6.6.0 | minor 的範圍：第二個 staged 目錄（新旗標）、#184 新 scenario、#185 V2、#256 搭車、一輪量測上限約 45；round 的預先登記骨架（照 D-059） | — |
| D-第二目錄 | 6.6.0 | 引擎設計：`--also-stage <skill-dir>`，只給 treatment、要求 `--stage-skill-files`、preflight 拒收；注入在 skill 文字後附一行「Skill `<name>`（description）is available; its base directory is `<copy>`」；row 記 `alsoStagedFilesHash`（不分組）與 `alsoStaged: true`（進 `ranWith()` 與 `CONDITION_FIELDS`，同 `stageSkillFiles` 的樣式）；`skillTextHash`、`skillFilesHash`、preflight key 不變；`--append-system-prompt` 的例外句改成列出每個 staged 目錄（單目錄時與今天逐字相同，golden test 釘住） | `Refines: D-062` |
| D-預登記 | 6.6.0 | 兩項量測的設計關卡結果、k、順序、補跑規則、B-20 A/B 半邊的條件 | `Refines: D-6.6.0` |
| D-結果 | 6.6.0 | 量測輪結果（照 D-064） | — |

Spec 的 B-item：eval.md 在 6.5.1 改 B-10（Residual 換成「依最後一則 assistant 訊息的形狀認出、不比對字句」）、B-16（舊紀錄移到 `evals/preflight/history/`，沒有 reader 從那裡拿）、B-17（`transcript_format` 記錄不分組）、run 產物一句（grading 檔名帶臂）；hooks.md B-7（parse 有界、超過 8 MiB 只取尾端）；在 6.6.0 改 B-19（「names each staged directory」）、B-20（preflight key 不看 `--also-stage`）、新 B-22（`--also-stage` 的規則）；obsidian.md（#256 的區塊模型）；skill-system.md 只在 #184 量到結果時加一句。BACKLOG 墓碑：`eval-provider-limit-mid-trial`、`eval-transcript-full-tool-input`、`bound-transcript-parse`、`cli-human-output`（6.5.1）；`eval-layout-grid-v2`（6.6.0，量到或關掉都是墓碑）。

## 6.5.1 工作包

| 工作包 | 事項 | spec |
|---|---|---|
| P-P product | D-6.5.1、roadmap 列 `next`、B-item 句子、墓碑、`docs/plans/v6.5.1/PLAN.md`（可與 v6.6 合一個目錄：`docs/plans/v6.6/`，README 兩版都列） | eval |
| P-1 transcript 保真 | Agent 呼叫留完整 `prompt`／`description`；tool result 的 `is_error` 與 Bash exit code；row 多一個記錄欄位 | eval |
| P-2 limit-mid-trial | `isProviderRefusal` 的第二個條件：tool call 之後才來的限額文字記為 error row | eval |
| P-3 preflight 紀錄保留 | 重跑不覆蓋，gate 的尋找鍵不變 | eval |
| P-4 grading 檔名帶臂 | `${condition}-trial-N.json` 與 raw dump；`eval-audit.js` reader 同步 | eval |
| P-5 flake ×5 | 見下 | — |
| P-6 #172 | `scripts/lib/transcript.js` 讀取加界 | hooks／learning |
| P-7 cli-human-output | 文件 | cli |
| P-E 發版 | `releasing` skill；vault ingest 在 bump 之前（Obsidian app 要開著）；patch，不重產 benchmark；post-release 查核較短的一份 | — |

細節（檔案與行號以 `17345e9a` 為準）：

- **P-1**：`scripts/lib/eval-transcript.js:43-59` `parseStreamJsonOutput` 只處理 `assistant` 與 `result` 事件；`summarizeToolInput` :110-132 對 Write／Edit／Read／Bash／Glob／Grep 保留內容，其餘 `JSON.stringify(input).slice(0, 200)`。做法：`summarizeToolInput` 加 `case 'Agent': case 'Task':` 回 `JSON.stringify(input)` **不截斷、單行**——`parseActionsFromTranscript` :81 以 `\n\n` 切區塊，dispatch card 有多段空行，用 fenced 區塊會在第一段就被切斷（Write 的多段 `content` 今天就有這個問題，shipped grader 都是從磁碟讀檔避開；#184 的 prompt 只存在 transcript 裡，沒有檔可讀），JSON 把換行寫成 `\n`，grader 用 `json.loads` 整個拿回來；六個特例工具一字不動（evals/scenarios 與 scripts/lib 沒有任何 grader 比對 `[Tool: Agent]`）；`parseStreamJsonOutput` 用一個 `toolNames` Map 記 tool_use id → name，新增 `user` 事件分支，只在 `tool_result.is_error === true` 時寫 `[Result: <name>] error`，Bash 的 content 開頭符合 `/^Exit code (\d+)/` 就附 `(exit N)`（真 JSONL 看到的形狀；沒有結構化的 exit code 欄位），**絕不複製 result 內容**（複製了會讓 grader 的 regex 比對到檔案或指令輸出）；`parseActionsFromTranscript` :80-99 不改——`[Result:` 既不符 `^\[Tool: ` 也不符 `^\[Assistant\]`，照結構被忽略，action 索引、`isOutputComplete`、`isProviderRefusal` 全部不變，加一句註解說明；`eval-trial.js:295-312` 的 `base` 多 `transcript_format: 2`（匯出 `TRANSCRIPT_FORMAT`），缺欄位視為 1，不進 `CONDITION_FIELDS`；:83-87 的「not directly comparable」註解延伸到這次改動。測試：新檔 `tests/scripts/eval-transcript-fidelity.test.js`（六個工具的 golden 字串、2 KB 的 Agent prompt 完整保留、Bash 錯誤給 `(exit 1)` 而非 Bash 錯誤沒有 exit、成功 result 不寫、`[Result:` 不是 action、有無 result 事件時 refusal 與 completeness 判定相同）；row 欄位進 `eval-row-stamp.test.js`。文件：`docs/guide/eval-system.md:89-96` 後加一段、spec B-17 加一句。
- **P-2**：`scripts/lib/eval-trial-outcome.js:70-74` 要 `output_tokens === 0` 且無 tool action；`result` 事件的 `output_tokens` 是整個 session 的（`eval-transcript.js:52-56`），所以 tool call 之後的限額永遠不會被認出。既有 fixture：`tests/scripts/eval.test.js:1026`、`tests/scripts/eval-trial-outcome.test.js:72` 用的字串是 `You've hit your session limit · resets 3pm`。真實案例：`evals/results/eval-tdd-test-first-gate/20260731-163958` treatment trial 5 先做了 5 個 tool call，最後一個區塊是限額文字，row 的 `output_tokens` 4430、errorType `model_grader_failed`——今天抓不到。做法：parser 在最後一則 `assistant` 事件 `message.model === '<synthetic>'`、只有 text 區塊、`message.usage.output_tokens === 0` 時回 `endedSynthetic: true`（usage 缺就不標；之後再有 tool_use 就重置）；`isProviderRefusal` 變成「既有的零成本無 tool 規則 OR `endedSynthetic`」；errorType 沿用 `provider_refusal`（eval-stats、dashboard、B-13 已排除它）；row 多 `refusalAfterActions: <tool 數>`，錯誤訊息寫「after N tool calls」。不用 `result.is_error`／`subtype`：那會連 `error_max_turns` 一起抓，而它是計分結果。`<synthetic>` 也涵蓋 API error 與「Prompt is too long」，排除它們是對的，都不是 agent。同一個 PR 把每個 trial 的原始 stream-json 存到 `evals/results/<scenario>/<runId>/raw/<condition>-trial-N.jsonl`（untracked），作為下一次真實限額的證據與 transcript 重新產生的來源。測試進 `eval-trial-outcome.test.js`（未在 allowlist）：tool 之後 synthetic → refusal；tool 之後真文字 → 不是；synthetic 之後又有 tool_use → 不是。B-10 的 Residual 換成：依 session 最後一則 assistant 訊息的形狀（host 寫的、沒有 model、沒有 token、只有文字）認出、不比對字句，記為 `provider_refusal` 帶 `infraError`；新 Residual：host 若不再這樣標記，這類 refusal 又會計分。`docs/guide/eval-system.md:143-147` 對齊、BACKLOG :120-123 墓碑。
- **P-3**：`scripts/lib/eval-preflight.js:65-68` 檔名 `${hash}-${modelKey}${conditionsSuffix}.json`，:221-223 直接 `writeFileSync`；reader `checkPreflightGate` :312-324、`missingPreflightMessage` :390-407 會解析目錄裡每個檔。做法：`writeRecord` 寫之前若 `cacheFile` 已存在，`renameSync` 到 `evals/preflight/history/<base>.<舊 timestamp，: 與 . 換成 ->.json`（沒有 timestamp 就用 mtime），再寫新的；rename 是原子的，鍵、路徑、`checkPreflightGate` 都不變；`missingPreflightMessage` 改用 `readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile())`，明確跳過 `history/`。測試進 `eval-preflight.test.js`：一份現行加一份 history，gate 讀現行、訊息不列 history。B-16 在「stays what the eval ab gate reads」後加一句；`eval-system.md:96` 加一行。
- **P-4**：`scripts/lib/eval-grader-io.js:254-272` `getGradingPath` 先剝掉臂字尾（`CONDITION_SUFFIX`，`eval-scenario.js:87`）才組路徑；writer :310-336、:347-355；reader `scripts/lib/eval-audit.js:76-81`。`saveTranscript`（`eval-trial.js:516-526`）已用 `${condition}-trial-N.txt`，照抄：`getGradingPath` 從 `CONDITION_SUFFIX` 的 match 取臂，沒有字尾就 `trial-N.json`，有就 `${condition}-trial-N.json`；`writeGraderRawDump` 跟著變（如 `baseline-trial-3-unparseable.txt`）；`eval-audit.js:78-80` 改用匯出的 `GRADING_FILE_RE = /^(?:(?:baseline|treatment|preflight)-)?trial-\d+\.json$/`，舊檔名仍讀得到、不遷移；`'grading'` 只出現在這兩個檔。測試：`eval-audit.test.js` 一個 run 兩臂互不覆蓋、新舊檔名都收到；`getGradingPath` 一個小單元測試。CHANGELOG 引 `docs/plans/v6.5/wp-d/audit.d5.md:114`。
- **P-5 flake**：
  | test | 位置 | 原因 | 修法 |
  |---|---|---|---|
  | diary marker | `tests/scripts/diary-capture.test.js:362-398` | stub `printf '%s' … > "$marker"`：shell 先建空檔再寫，`waitForMarker` 見檔即讀，讀到空字串 | stub 寫 `marker.tmp` 再 `mv`；或 poll 到內容非空 |
  | alias lock EAGAIN | `tests/node/test-cli-session-alias-lock.js:52-64,104-117`；`scripts/lib/locking.js:56-106` | 9 個 CLI child 同時 spawn、`runCli` 無 `child.on('error')`；更可能的根因是 :96-100 的 busy-wait：九個 process 空轉把持鎖者餓死，直到 `LOCK_WAIT_MS = 2000` 到期 | `runCli` 加 `child.on('error')`；busy-wait 改 `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitTime)` 真睡（呼叫者只有 `session-aliases.js:37` 與 `obsidian-registry.js:76/111/138`，都是一次性 CLI 寫入，沒有熱路徑）；保留非 `EEXIST` 的 rethrow；順手修掉過時的「DAG lock」字句 |
  | ZB-T1 | `tests/observer-daemon/run-tests.sh:1495-1537` | 固定 `sleep 0.5` 後就假設 pid 檔存在且 child 已是 zombie | poll 到 pid 檔存在且 `ps -o stat=` 為 Z |
  | run_id 同秒 | `tests/scripts/learning-curator-proposal-ingestor.test.js:895-911`；`scripts/lib/learning-curator/proposal-ingestor.js:623-627` | `compactUtc(now)` 只到秒，跨秒就不同 | 測試用 `jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })` 釘住時鐘，`finally` 裡 `useRealTimers`（`recordRunFailure` 是同步的） |
  | ZB-T1 補充 | `run-tests.sh:1513` | 同上 | poll 最多 5 秒，直到 `${lock}/pid` 非空且 `ps -o stat=` 以 Z 開頭 |
  | jest SIGSEGV | `jest.config.js` | 無 `maxWorkers`、`collectCoverage: true`、35 個測試檔會 spawn；根因未明、沒有重現 | 先重現（見假設）；重現不了就不改設定，PR 記下嘗試與嫌疑（coverage instrumentation、worker 數），decision 記殘留 |
- **P-6**：`scripts/lib/transcript.js:23-27` 整檔 `readFileSafe` + `split('\n')`；輸出上限（10 則訊息、20 個 tool、30 個檔）在 :4-7、:73-77，全在 parse 之後才套；呼叫者 `scripts/lib/diary-capture.js:204-208` ← `hooks/session-tracker/end.js:139`（Stop，超過 diary 門檻才跑）與 `hooks/pre-compact/main.js:104`。做法：`readFileSafe` 換成 open + fstat；不超過 `MAX_TRANSCRIPT_BYTES = 8 MiB` 就整檔讀、輸出一模一樣；超過就 `readSync` 最後 8 MiB、丟掉第一個 `\n` 之前的半行，全包 try/catch 回 null；超過時 `toolsUsed`、`filesModified` 變成「視窗內首見」、`totalMessages` 只數視窗（`rg` 顯示它沒有任何消費者，只有定義），回傳多 `truncated: true`（只在用了尾端時）。測試進 `transcript.test.js`：界內輸出相同；用 `opts.maxBytes` 壓低界限後沒有半行、`truncated` 有設。hooks B-7 的句子同 PR 改。
- **P-7**：`scripts/cli/shared.js:6-16` `output(data, asJson)` 對非字串一律 `JSON.stringify(data, null, 2)`；約 15 個呼叫點（`learn status`、candidates、inbox、obsidian register／remove／default 等）；`docs/guide/cli-invocation.md:179` 說「每個指令都收 `--json`」、:297-308 沒說預設就是 JSON。改文件：:297-307 寫明「印資料的指令（`worktree list`、`learn status`、`obsidian list-vaults`、`session list`、`session alias list`……）不論有無 `--json` 都印 JSON；對它們 `--json` 接受但不改變任何東西」，清單由逐一跑指令建立；加一個 `tests/node` case 跑其中兩個指令有無 `--json` 斷言 stdout 相同（docs are the contract）；不加 human 格式——那會改 script 已在解析的 stdout，patch 不能做。BACKLOG :127-130 墓碑。

## 6.6.0 工作包

| 工作包 | 事項 | spec |
|---|---|---|
| M-P product | D-6.6.0、D-第二目錄、roadmap 列 `next`、B-19／B-20 句子、墓碑、`docs/plans/v6.6/PLAN.md` + `README.md` | eval |
| M-A 第二個 staged 目錄 | 新旗標、`eval-command.js` 先抽 helper 再加（673／700 行） | eval |
| M-B #256 | `vault_frontmatter.py` 四個 case，`tests/skills/test_vault_links.py` 先紅再綠 | obsidian |
| M-D 量測 | 兩個設計關卡 → 預登記 decision → 一輪 → 稽核 → 結果 decision | skill-system、obsidian |
| M-E 發版 | `releasing` skill；benchmark 由量測輪重產 | — |

- **M-A**：trial 以 `--disable-slash-commands` 跑（`eval-trial.js:482`），第二支 skill 不能靠名字載入；staging（`scripts/lib/eval-skill-staging.js`）目前只複製 `dirname(skillFile)`。選 `--also-stage <skill-dir>`（不選 `--skill-file` 可重複：那會注入 dispatching 的 body，而出貨的 plugin 是按需載入它；也不選 scenario 的 `## Skills` 段：引擎設定不該進 scenario 散文；`cli.js:38-75` 每個 option 只收一個值，「可重複」要改共用 parser）。規則：要求 `--stage-skill-files` 與 skill scope；`eval preflight` 拒收；目錄必須含 `SKILL.md`，每個 trial 與主目錄一樣各自複製一份。引擎改動：解析與拒收進 `scripts/lib/eval-skill-options.js` 的 `resolveSkillOptions`（151 行），`eval-command.js` 只加兩行（:399 `alsoStage: args.options['also-stage']`、約 :450 傳給 `runSkillEval`），669 → 671 行，不必抽 helper；staging 在 `eval-skill-staging.js:275-350` 的 `buildInjection`／`trialArm` 多呼叫一次 `stageSkillDir(path.join(alsoStage, 'SKILL.md'))`，`stagedCopies` 回兩個目錄（`eval-trial.js:240` 的 guard 本來就收陣列），drift 檢查比兩個 digest；注入在 skill 文字後附一行「Skill `<name>` (<frontmatter description>) is available; its base directory is `<copy>` — read `<copy>/SKILL.md` to use it.」（模擬 host 的 skill 清單，不是載入 body）；`buildClaudeArgs`（`eval-trial.js:470-500`）改收 `skillBaseDirs[]`，一個目錄時句子逐字同今天（golden test），兩個時是一句「The exceptions are X, the base directory of the skill you were given, and Y, the base directory of the `<name>` skill: …」；`cli-manifest.js:107-109` 加 `--also-stage`，`cli-invocation.md` 約 :139 的 eval 旗標表與 `eval-system.md` 的 staging 段各加條目。測試：新檔 `tests/scripts/eval-also-stage.test.js`。
- **M-B**：issue #256 四個 case 的程式位置：`_walk_fences` :264、quoted-fence 分支 :292-296、`_list_content` :245、`INLINE_CODE_RE` :40；縮排 code block 沒有模型。既有測試 `tests/skills/test_lint_vault.py`（27）、`test_vault_links.py`（21，含 #186、#210 case），四個 #256 形狀都沒有測試。證據形式照 D-049：contract test，不跑 A/B。
- **M-D**：

  **設計關卡先於 session**：`docs/plans/v6.6/wp-d/design-gate.<項目>.md`（照 v6.5 格式），在 M-A 與 P-1 合併後寫；判 NOT MEASURABLE 就記為發現、0 session。

  | 項目 | scenario | 設計要點 | 預計 session |
  |---|---|---|---|
  | D1 #184 | 新 scenario（Target: executing） | fixture：`TASKS.md` 三項，第二項寫「implement the limiter in `src/limiter.js` per `specs/limiter.md` — hand this one to a subagent」（路徑寫在 task 項目裡，兩臂都讀得到，否則 baseline 會因為沒開 spec 而敗、不是因為沒逐字貼）；acceptance criteria 放在另一個檔 `specs/limiter.md`，三條具體到難以改寫（例：「A burst of exactly 10 requests within 1000 ms is allowed; the 11th gets 429」、「`Retry-After` is rounded up to whole seconds」、「The counter key is `${ip}:${route}`, never `ip` alone」）；prompt 寫「run it unattended, don't ask me which mode」（executing:84-86 會先問模式，trial 只有一則訊息）；code grader 對每個 `[Tool: Agent]` 區塊 `json.loads` 取 `prompt`，空白正規化後斷言逐字含三條（P-1 之後才讀得到；關卡要寫明 grader 靠的是這個單行 JSON，不是 `raw/`），沒有 Agent 呼叫就 FAIL；稽核行（不計分）：每列有沒有開 `specs/limiter.md`、treatment 有沒有開 `dispatching/SKILL.md`；兩臂同文字的先例是 D-063 第 3 條的 D4（兩臂同一份 `SKILL.md`、只差 staged 檔案），關卡要確認 `resolveSkillOptions` 沒有「baseline 等於 treatment 就拒收」的檢查；兩臂：baseline `--baseline-skill-file skills/core/executing/SKILL.md`，treatment 同文字加 `--also-stage skills/core/dispatching`，兩臂皆 `--stage-skill-files`，文字 hash 相同、只差 `alsoStaged`；baseline 預期：會派 subagent（prompt 說了），但很可能貼路徑或摘要——`dispatching/SKILL.md:71` 正好禁止這個；天花板風險：Opus 不用提醒就會把短條件逐字貼上，所以條件放在另一個檔；地板風險：treatment 從未開 `dispatching/SKILL.md`，印稽核行、不計分；「無 model tier」兩臂天花板、不斷言 | 3 + 10 |
  | D2 #185 V2 | `eval-diagramming-obsidian-layout-grid` V1 → V2，pool 清空（V1 的 BLOCK 留在帳本） | task 改成六個對等的主要服務、一排、無 hub、無箭頭、每個方塊帶名稱加兩行說明、不點名寬度（對到 `painters-toolkit.md:208` Primary＝「roughly equal weight 的主要元件」、`visual-patterns.md:91` side-by-side 皆 Primary）；唯一計分斷言仍是相鄰 Primary 間距 ≥40；baseline 的逃生路：160 寬在 200 格上剛好 40、toolkit 的 60–100 px buffer（:214）兩臂皆有——關卡要寫明這兩條，BLOCK 就是最後答案；兩文字 A/B（舊 `layout-heuristics.md` vs 現行），`--stage-skill-files --baseline-skill-file`，`ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000` | 3 + 10 |

  **額度**（上限約 45）：

  | 項目 | preflight | A/B | 合計 |
  |---|---|---|---|
  | 兩項全量一次通過 | 6 | 20 | 26 |
  | `INSUFFICIENT_DATA` 補跑（`--k 1`，每支至多 2 次） | 0 | 8 | 8 |
  | preflight 出錯重跑（整輪至多 2 次） | 6 | 0 | 6 |
  | 最壞情況 | | | 40 |

  **規則**（沿用 v6.5 PLAN）：preflight 一律 k=3；BLOCK 是發現、不重跑、不跑 A/B；會超上限的 A/B 不開跑、不改小 k；補跑 `eval ab --k 1`，判定用 `eval compare` 的合併池；一個 checkout 一次一個 live eval（run lock 會擋）；順序 D1 → D2，長的放後面；每次 run 的摘要、preflight 紀錄複本、逐列稽核放 `docs/plans/v6.6/wp-d/`；量測結束 `arcforge eval report`，確認 `git diff --stat <量測 commit>..HEAD -- skills evals/scenarios evals/fixtures` 為空；結果記成一條 decision（照 D-064）。

  **量測條件**：`--model 'opus[1m]' --effort xhigh`、隔離、不帶 `--plugin-dir`、`--skill-file`；D1 加 `--stage-skill-files --baseline-skill-file skills/core/executing/SKILL.md --also-stage skills/core/dispatching`（preflight 不帶 `--also-stage`，跑的就是 baseline 臂）；D2 加 `--stage-skill-files --baseline-skill-file <materialised>/SKILL.md`（照 D-063 第 3 條的做法重建舊 `layout-heuristics.md` 的目錄，digest 寫進預登記）；k 依各 scenario 的 `## Trials`。

  **#184、#185 的處置**：量到結果就關閉，留言附帳本連結；D1 關卡判不可量就維持開啟、留言寫缺的能力；D2 BLOCK 就關 #185、記為發現（第二次設計已用完）。

## 順序限制

1. 6.5.1：P-P 先合併；P-1 到 P-7 平行、各自獨立 PR；P-E。
2. 6.6.0：M-P 先合併；M-A、M-B 平行；兩個設計關卡在 M-A 合併後寫（D1 另需 6.5.1 的 P-1 已在 main）；關卡過才寫 scenario／fixture PR；全部 `skills/`、`evals/scenarios/`、`evals/fixtures/` 變更在量測輪前合併；量測輪依序；M-E。

## 執行規則（沿用 v6.5，照抄並補上後到的三條）

- **Worker 模型**：只有主 session 用 Fable。每個 worker、`pm`、`qa`、Explore、Plan 派工時一律帶 `model: "opus"`；機械複查用 `model: "sonnet"`。
- **並行上限 ≤3 個 agent**；一個 worker 可接連做幾個小任務；worker 只回報一次（完成或卡住），不中途碎報；主 session 少醒。
- **停用 advisor**：每份 worker brief 寫明不得呼叫 advisor 工具；主 session 只在里程碑呼叫。
- **對外動作**：push、開 PR、squash merge、建立或關閉 issue 由主 session 執行（worker 可在 brief 授權下 push 與開 PR）。
- **合併條件**：CI 全綠、Codex 自動審查完成且每則意見都已修正或回覆、`qa` 審查無未處理的發現。檢查與合併**不串在同一行**（6.5.0 #286 的教訓）。
- **打 tag**：主 session 推送，條件是 release PR 已合併、CI 全綠、發版前查核通過。
- **live eval**：一律由主 session 啟動，一次一個，不超過上限。
- **spec 與程式的順序**：Codex 回報「spec 在另一個 PR」是順序問題，先合併 spec。
- **B-item 的措辭**：程式 PR 改變了某個 B-item 的敘述時，spec 的句子放在同一個 PR。
- **天花板 BLOCK**：記為發現，不重跑到通過為止。
- **每個 commit 前**：`npm run lint:fix`、`npm test`（5 個 runner）、7 個 static check。
- 操作備忘同 v6.5 PLAN：worktree 用 `node scripts/cli.js worktree add`；`package-lock.json` 差異不 commit；Codex 重審要在 thread 內回覆；停止的 agent 要另派新的；worker 的 worktree 保留到 Codex 重審完；`evals/results/`、`evals/preflight/` 只在主 checkout。
- **主 session 的額度**：worker 撞到 5 小時限額就等重置再派，不換模型頂上。

## 驗證

- 每個 PR：5 個 runner、7 個 static check 綠；`check:file-size` 綠（`eval-command.js` 不過 700、allowlist 的測試檔不長，新測試進新檔或 `eval-command.test.js`／`eval-preflight.test.js`／`eval-trial-isolation.test.js`／`tests/node/test-eval-cli-flags.js`）。
- P-1：一個真 trial 的 transcript 看得到 Agent 呼叫的完整 prompt 與 Bash 的 exit code；舊 scenario 的 grader 對同一份 transcript 跑出相同結果（regress test 用既有 fixture）。
- P-2：造一個「先兩個 tool call、最後一則 assistant 事件 `model: '<synthetic>'`、`output_tokens: 0`、只有文字」的 stream-json，row 帶 `infraError` 與 `refusalAfterActions: 2`；`raw/` 底下有該 trial 的原始 stream-json。
- P-3：同鍵 preflight 跑兩次，兩份都在、gate 仍找得到最新一份。
- P-4：`eval ab --k 1` 後 `grading/` 有 `baseline-trial-1.json` 與 `treatment-trial-1.json`，`eval audit` 兩列都讀到。
- P-5：每個 flake 的 test 連跑 20 次不失敗（`for i in $(seq 20)`）。
- P-6：一份 50 MB 的假 transcript，Stop hook 的 parse 時間與記憶體有界；輸出與整檔 parse 相同。
- 6.5.1 整版：`check-benchmark-freshness` 仍綠（eval 表面不變）。
- M-A：treatment 的注入有 base-directory 行加一行 `Skill \`dispatching\` … is available`，兩個路徑都在 `os.tmpdir()`，baseline 只有 base-directory 行；row 有 `alsoStaged: true` 與 `alsoStagedFilesHash`，`skillFilesHash` 不變；`--append-system-prompt` 的例外句列出兩個目錄；`eval preflight --also-stage` 被拒。
- M-D：兩個關卡文件、預登記 decision、每列稽核、帳本「6.6.0 量測輪」一節、結果 decision；`eval report` 之後 freshness check 綠。
- M-E：post-release 查核表全部有結果（6.5.1 的也要一份，較短）。

## 不在範圍（維持開啟、留在 backlog）

verify-exit 句子與 `UV_PROJECT_ENVIRONMENT`（第三次嘗試留待有理由時）；Harness 四項 wish（要重開 D-013，是設計版）；`skill-body-trim` 其餘六支（每支非回歸 A/B 約 13 session，`learning` 190 行離硬上限 250 還有 60 行）；`product-cli`；兩支 `speccing` eval；`plugin-eval-corpus-migration`；`executing-discriminating-claim`；`diagramming-headless-fallback`；`secrets-guard-staged-scan`；`project-keyspace-collision`；`eval-trial-sandbox`（per-trial HOME 會失去 `~/.claude.json`，是它的範圍）；D1 scenario 的 `aliases.json` 誤報；QMD 索引（維護者說先不管）。

**交接給 dev-context 的觀察**（一行，不開工）：Claude Code 2.1.296 從 GitHub 來源安裝 plugin 時會在快取 payload 放一個 `node_modules`（208 項），repo 與 marketplace clone 都沒有；arcforge 執行不需要相依套件。

## 時間

- 6.5.1：P-P 到 P-7 約 1 天（七個小 PR，Codex 各一輪）；P-E 約 2 小時。
- 6.6.0：M-P、M-A、M-B 約 1 天；兩個關卡 + scenario PR 約半天；量測輪依序約 3 到 4 小時（D2 的 trial 各 400 到 500 秒）；M-E 約 2 小時。
- 合計 3 到 4 天。
