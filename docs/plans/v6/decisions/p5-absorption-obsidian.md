# P5 Track C — obsidian 兩支落點對照表

> P4 gate 的教訓（progress.md「首次 verifier FAIL→補救→再驗」）：落點對照表必須
> 落在 repo 內的耐久載體，**不得只寫「已合併」**。本檔逐條記錄兩支舊 skill 的每
> 一節、每一個 reference / agent / preset 的落點——保留於何處，或捨棄並附理由。
>
> 來源 commit：`dcb61fa`（C1 maintaining）、`7606303`（C2 diagramming）。
> 舊內容可由 `git show 7e7cb84:skills/arc-maintaining-obsidian/...` 取回覆核。

## A. `arc-maintaining-obsidian` → `maintaining-obsidian`

SKILL.md 170 行 → 130 行（body）。frontmatter 由 5 鍵（含 v6 廢棄的
`category` / `status`）收為 3 鍵（`name` / `description` / `argument-hint`）。

### A1. SKILL.md 逐節

| 舊節 | 落點 | 說明 |
|---|---|---|
| 前言（vault interface 定位、skill 擁有什麼 vs 契約擁有什麼） | **保留**，SKILL.md 開頭 6 行 | 「vault 契約在重疊處勝出」是本支唯一的權威裁決規則，壓縮但語意不動 |
| `## Mode Selection` 三模式表 | **保留**，`## Modes`（+ init-vault 第四列） | 舊表把 init-vault 藏在 Help 區塊裡，新表把四個入口攤在同一處 |
| Bare invocation 段 | **保留**，`## Modes` 表下方 3 行 | 「不要盲問 which mode」是行為規則，保留 |
| `### Help`（24 行 usage 區塊） | **捨棄** | 純 usage 轉印。`argument-hint` frontmatter 已承擔 slash palette 的發現面，body 內再抄一份是第二份事實來源，且 24 行佔 body 預算 18% |
| `## Path Convention` | **捨棄（改寫吸收）** | 舊文只講 references 相對路徑；新的等價機制在 C2 才是載重點（見 B3）。本支所有 references 都由 Read 直接解析，不需要專節 |
| `## Mode Entry Gate` 跳表 | **拆解吸收** | 逐 mode 的「先讀什麼」併入各 `## Mode:` 節的第一段——跳表與各節重複陳述同一件事，是舊檔最明顯的重複 |
| `### Vault Resolution` | **內聯**，`## Step 1 — Resolve the vault` | 每次呼叫都必讀 → 不該是 reference（見 A2 `vault-resolution.md`） |
| `### Domain Contract Orientation` | **內聯**（要旨）+ 保留 reference | 讀什麼、sticky、缺檔擋寫入 → 內聯；讀序與缺檔決策表 → reference |
| `### Registry Maintenance` | **保留並強化**，`## Registry operations go through the CLI` | 四個 CLI 子指令改為完整可執行形式（含旗標），並移除舊文「registry 位於 `~/.arcforge/obsidian-vaults.json`」的路徑指認 |
| `### init-vault Bootstrap` | **保留**（指標）→ `references/bootstrap-workflow.md` | 11 步工作流留在 reference，body 只留 Modes 表那一列 |
| `### Vault Structure — Two Layers` | **吸收** | Raw → Wiki 的兩層敘述併入 ingest 節的 Raw Source 不變式；細節本來就在 raw-sources.md |
| `### Session Log` | **保留**，`## Close every operation` | 加上「report 要指名 artifact 路徑」的完成判準 |
| `### Delegation` | **內聯要旨** + 保留 reference | 「filesystem 是契約基線、其餘皆為加速」是判斷規則 → 內聯；完整路由表 → `references/delegation.md` |
| `## Mode: Ingest` + key invariants | **保留** | 四條不變式逐條保留，理由句補上（「為什麼」原本只有一半） |
| `## Mode: Query` + key invariants | **保留** | vault-only 條加寫「夾帶在 framing 裡的通識句正是本模式要防的失敗」 |
| `## Mode: Audit` + key invariants | **保留** | 五條全數保留 |
| `## Output` | **內聯**（壓縮） | 見 A2 `output-formats.md` |

### A2. references 逐檔（14 → 9）

| 舊檔 | 落點 | 理由 |
|---|---|---|
| `bootstrap-workflow.md` | **保留（精煉）** | init-vault 的 11 步 + worked example。工作流方法論，且只在 init-vault 時才需要——標準的按需 reference。改動：step 1 的 registry 存在性檢查改走 `arcforge obsidian list-vaults --json`；step 9 移除 registry 檔路徑指認；CLAUDE.md shim 文字改指新 skill 名 |
| `domain-contract-orientation.md` | **保留** | 讀序、sticky 規則、缺檔決策矩陣。矩陣是查表面（三種缺檔 × 兩類 mode），不是每次必讀的 prose |
| `mode-ingest.md` | **保留** | 逐步操作細節 + Special Modes（batch / link / query-as-ingest）。SKILL.md 只留管線名與不變式，細節在此 |
| `obsidian-cli-quirks.md` | **保留** | `file=` vs `path=`、SIGPIPE 掛死、Daily Notes 偵測。全部是實測踩過的陷阱，無可推導性 |
| `raw-sources.md`（原 `page-templates.md`） | **保留（更名）** | sha256 規則、re-ingest 行為、逐檔型抽取法、Paper URL 鏈。舊名承諾「page templates」但內容早已是 Raw Source 機制，名實不符 |
| `search-strategies.md` | **保留（大幅精煉，269 → 208 行）** | 路由選擇與輸出適配是真查表面。刪除的是三個路由各自重複一份的 Query Mode / Propagate / LINK Resolution 三聯表——同一件事寫三遍，改為「按任務分節、路由分欄」 |
| `visuals-decision-tree.md` | **保留** | Q1–Q4 決策樹 + 四層輸出表。這是委派 `/diagramming-obsidian` 的閘門，載重 |
| `delegation.md` | **保留** | 工具路由表 + 「filesystem 為契約基線」的理由 |
| `audit.md`（**新**，= `mode-audit.md` + `audit-checks.md`） | **合併保留** | 兩檔本來就互指：mode-audit 每節都寫「詳見 audit-checks」，audit-checks 又重述一次管線。合併後單一事實來源，且讀者不必在兩檔間跳 |
| ~~`mode-audit.md`~~ | **捨棄（併入 `audit.md`）** | 見上 |
| ~~`audit-checks.md`~~ | **捨棄（併入 `audit.md`）** | 見上 |
| ~~`registry-maintenance.md`~~ | **捨棄** | 三個理由：(1) 四個子指令的完整形式已內聯進 SKILL.md，reference 只是第二份副本；(2) 它敘述 registry 的 JSON schema——那是引擎擁有的磁碟格式，skill 不該複述（複述必然漂移）；(3) 它的「為什麼不能手改」段落點名 `scripts/lib/locking.js`，是 **D1-B prose 違規**，留著就得改寫，改寫後只剩一句話 |
| ~~`mode-query.md`~~ | **捨棄** | 33 行中有 25 行與 SKILL.md 的 Query 節或 `search-strategies.md` 逐句重複（Orient / Search / Read 三節各 1–2 句，vault-only 段整段重出，File Back 段整段重出）。唯一獨有的「無 index 時建議跑 audit lint」已吸收進 `audit.md` 的 LINT 節 |
| ~~`output-formats.md`~~ | **捨棄（要旨內聯）** | 六個 emoji 完成模板是儀式，不是行為：模板本身不改變 agent 做什麼，只規定它怎麼排版，而排版偏好由使用者的專案決定。載重的是「回報要指名 artifact、擋住時要說是哪個 mode 被什麼擋住 + 具體解法」——這兩句已內聯進 `## Close every operation`（P4 `sessions` 對僵化格式的同類裁決） |
| ~~`vault-resolution.md`~~ | **捨棄（內聯）** | 32 行，且**每一次 vault-level 呼叫都必讀**。一個必然被開啟的 reference 只是多一次 Read 往返；5 步 cascade 內聯成 5 行後語意完整 |

### A3. presets 逐檔（4 組 + README，全數保留）

| 檔 | 落點 | 理由 |
|---|---|---|
| `presets/README.md` | **保留** | 四 preset 對照表 + placeholder / TODO 標記語意 + Schema Authority baseline 說明 |
| `presets/minimal/{AGENTS,SCHEMA}.md` | **保留** | 資料檔（authoring guidance），非 prose |
| `presets/llm-wiki/{AGENTS,SCHEMA}.md` | **保留** | 同上 |
| `presets/news/{AGENTS,SCHEMA}.md` | **保留** | 同上 |
| `presets/project-tracker/{AGENTS,SCHEMA}.md` | **保留** | 同上 |

全部 9 檔僅作機械 retarget：舊 skill 名 → `/maintaining-obsidian`、
`references/page-templates.md` → `references/raw-sources.md`、
`references/audit-checks.md` → `references/audit.md`、Excalidraw 委派 →
`/diagramming-obsidian`。內容零改動。

**查證紀錄**：`presets/README.md` 自稱 Schema Authority 六條「locked by test」。
`grep -rn presets tests/ scripts/` **零命中**——沒有這個測試存在。該敘述是舊
文件的不實承諾，已於本表登記；是否補測試留給 P7（eval 語料庫重建）或 P8 裁決，
本 track 不代為新增守衛。

### A4. 其他

| 項 | 落點 |
|---|---|
| `evals/evals.json`（skill-local） | **隨目錄刪除**。守衛查證：`check:eval-targets` 只掃 `evals/scenarios/`；`check-skill-eval-annotation.js` 的 `hasEvidence` 只看 `evals/results/` 與 `evals/benchmarks/`，不讀 skill-local `evals/`。無引用 |

## B. `arc-diagramming-obsidian` → `diagramming-obsidian`

SKILL.md 246 行 → 178 行（body）。frontmatter 5 鍵 → 2 鍵。

### B1. SKILL.md 逐節

| 舊節 | 落點 | 說明 |
|---|---|---|
| 前言（diagram 要 ARGUE 不是 DISPLAY） | **保留** | 全支的判準句 |
| `## Pipeline` + HARD/SOFT 分層說明 | **保留**（壓縮進前言） | 四階段 + 兩層語意保留，刪掉舊文對「委派或自己做」的兩段條件敘述（委派已移除，見 B2） |
| `### Process Invariants` ×3 | **保留** | theme 偵測、每輪 render+view PNG、save 必驗——三條都是「工具不會回報、違反則靜默壞掉」，逐條保留含理由 |
| `### Mechanical Invariants` ×5 | **保留** | `ea.reset()` / 不改 id / addText 回傳 box id / viewBackgroundColor / 手動存檔 byte-exact |
| `### Layout Trap Audit` ×4 | **保留** | 四個 arrow 路徑碰撞。改寫為「build 前先追箭頭」的祈使形，語意不動 |
| `## SOFT: The Design Space` | **保留（精煉）** | Think first / every element serves / scale / isomorphism / brushes 五段保留；「Scale reflects real importance」併入 every-element 段（兩段都在講同一件事：不要造概念沒宣稱的 hero） |
| `## Phase 1` 前言 + reference 指標 | **保留** | 改為「動 EA code 前必開兩個 reference」 |
| `## Phase 1` EA Core Pattern 程式碼塊（35 行） | **捨棄（指標取代）** | 與 `references/element-templates.md` 的 Setup / Text-in-Shape / connectObjects / export 四節逐段重複（該檔 line 11 起即 `ea.reset()`，line 114 即同一個 `writeFileSync` export）。同一份骨架維護兩處必然漂移；element-templates.md 是宣稱的「full EA API reference」，骨架屬於它 |
| Phase 1 的三條額外規則 | **保留** | style before element / stagger anchors / diamond ≤12 chars |
| Mermaid shortcut | **保留** | |
| `## Phase 2 Validate` 四步迴圈 | **保留** | 改為編號步驟 + 完成判準；`${CLAUDE_PLUGIN_ROOT}` 路徑移除（見 B3） |
| First-time setup 區塊 | **保留**（上移至 `## Running the helpers`） | 兩個 Phase 都會撞到，放在單一處 |
| `## Phase 3 Save` 兩條路徑 | **保留** | `ea.create()` 程式碼塊保留（**未**與任何 reference 重複，查證：element-templates.md 無 `ea.create`）；手動 fallback 指向 save-format.md |
| Post-Save Verification | **保留** | 含「失敗時從 canonical template 重生，不是從剛寫壞的檔重生」 |
| Embed in Wiki Notes | **保留**（併入 Phase 3 尾） | |
| `## Delegation (Optional)` | **捨棄** | 見 B2 |
| `### Reference Files (Read on Demand)` 九項清單 | **捨棄（分散內聯）** | 清單與各 Phase 內的指標重複；且清單形式的 reference 索引沒有開啟條件，`writing-skills` 明言「無條件的指標會被永遠開啟或永遠不開」。九個檔改為在各自該開的位置以條件句指名 |
| `## Completion Format` / `## Blocked Format` | **捨棄（要旨內聯）** | 同 A2 `output-formats.md` 的理由。載重的是「未經驗證的 save 不算交付」，已內聯進 `## Report` |

### B2. agents/ 三檔（全數捨棄）

| 檔 | 落點 | 理由 |
|---|---|---|
| `agents/diagram-builder.md`（78 行） | **捨棄** | Input / Steps / EA Build Pattern / Key Rules 四節全部是 Phase 1 的重述（EA skeleton 與 SKILL.md 舊版逐行同源；Key Rules 四條與 Phase 1 三條 + 機械不變式重疊）。**零獨有內容** |
| `agents/diagram-validator.md`（62 行） | **捨棄** | CHECK / RENDER / JUDGE / FIX 四步與 Phase 2 逐步同構，含相同的「view PNG 每輪不可議」「絕不改 id」。**零獨有內容** |
| `agents/diagram-saver.md`（79 行） | **捨棄（一行內聯）** | 與 Phase 3 同構。唯一獨有：**「目標檔已存在要先 `app.vault.adapter.remove()` 再 create」**——已內聯進 Phase 3。次要獨有的「取 vault basePath 再 ls 確認」被 `verify_saved_diagram.py` 涵蓋（它本來就吃絕對路徑並自行檢查） |

**捨棄的行為後果，如實記錄**：三檔的存在意義不是內容，而是**讓 lead 在複雜圖上
保持 context 乾淨**（把 build/validate/save 的大量 JSON 與 PNG 往返推給子代理）。
移除後這個 context 衛生機制喪失，複雜圖會在主 session 內累積往返。這**不是**純
冗餘移除。

移除的直接原因是機制層而非內容層：三檔的呼叫協定要求 lead 把 `SKILL_ROOT` 傳給
子代理，而 `SKILL_ROOT` / `CLAUDE_PLUGIN_ROOT` 在 skill 觸發的 Bash 中不存在
（D9 spike 實證），因此該協定在 runtime 已經是壞的。要保留委派就得先發明一個
「lead 把自己的 base directory 轉傳給子代理」的新機制——那是新設計，不是重寫，
超出 P5 Track C 範圍。**掛帳**：若 P6/P7 判定 context 衛生值得，應以新 D 編號
處理，不得靜默恢復 `SKILL_ROOT`。

### B3. Python 工具鏈（全數保留，逐檔自足查證）

D1-A 要求：`skills/<name>/` 下的可執行檔不得 require / import / source 逃出自己
的目錄。逐檔查證結果：

| 檔 | 保留 | 逃逸檢查 |
|---|---|---|
| `check_overlaps.py`（453 行） | ✅ | import 僅 stdlib（`argparse` / `json` / `sys` / `pathlib`）。無 `..` 相對字面、無 `sys.path` 操作 |
| `render_excalidraw.py`（189 行） | ✅ | stdlib + `playwright`（宣告於自己的 `pyproject.toml`）。唯一路徑構造 `Path(__file__).parent / "render_template.html"` —— **指向自己目錄內** |
| `plan_layout.py`（226 行） | ✅ | 僅 stdlib |
| `verify_saved_diagram.py`（97 行） | ✅ | stdlib + `subprocess` 呼叫 **同目錄** 的 `render_excalidraw.py`，`cwd=Path(__file__).parent` —— 不逃逸 |
| `render_template.html`（57 行） | ✅ | 由 `render_excalidraw.py` 以 `__file__` 相對讀取 |
| `pyproject.toml` / `uv.lock` | ✅ | skill-local 依賴宣告；`playwright` 是 skill 自己的虛擬環境依賴，不是 arcforge runtime 依賴（不違反「零外部 runtime 依賴」——它不在 `package.json`） |
| `references/.gitignore` | ✅ | 隨目錄搬遷，在新路徑生效（驗證見下） |

**舊路徑修正**：四支 `.py` 的 docstring 與 `render_excalidraw.py:84` 的錯誤訊息
原本寫 `cd skills/arc-diagramming-obsidian/references`，已改為相對指稱（skill 被
安裝後那個路徑不存在，是過期敘述）。`references/depth-enhancements.md:91` 的
`cd ${CLAUDE_PLUGIN_ROOT}/skills/arc-diagramming-obsidian/references` 是 **D1-B
prose 違規**，已改為 `cd "$BASE/references"`。

### B4. base directory 機制（P5 實測發現，取代 `SKILL_ROOT`）

舊兩支都靠 `${CLAUDE_PLUGIN_ROOT}` 或由 lead 傳入的 `SKILL_ROOT` 定位自己的
skill-local 檔案；D9 已裁定兩者在 skill Bash 中不可用。progress.md 的 D9 條目把
這 12 個殘留標記為「隨各自重寫 phase 以 base-dir 機制處理」，但**未指定那個機制
是什麼**，且 v5 `arc-maintaining-obsidian` 的「harness 注入 base directory」敘述
與同檔已證壞掉的 `${CLAUDE_PLUGIN_ROOT}` 同源，不足採信。

**本 track 以實測取得 ground truth**，不沿用敘述：以
`claude --plugin-dir <本 worktree> --allowed-tools Skill -p '<載入該 skill 並回報
是否有絕對路徑行>'` 探測，回傳：

```
Base directory for this skill: <abs-path>/skills/arc-diagramming-obsidian
```

即 Claude Code 在 skill 載入時**確實**注入一行 `Base directory for this skill:`。
新 SKILL.md 因此寫成「以 skill 載入處宣告的 base directory 解析 `references/`」，
並用 `BASE=<...>` / `cd "$BASE/references"` 的 shell 形式表達——不含任何被禁 token，
且不是推測。

**旁記（解析器互動）**：`<base-directory>/references` 這種寫法會被 pytest 的
`_SLASH_INVOCATION_PATTERN` 誤判為 `/references` 呼叫（lookbehind 排除
`[\w./$<-]`，而前一字元是 `>`）。改為 `"$BASE/references"` 後前一字元是 `E`
（word char）即排除。這是解析器的既有邊界，非本支問題，但值得後續 skill 作者知道。

### B5. `.venv` 不進 `npm pack` — 驗證與 **AC 缺陷**

P5 預登記機械 AC 寫的是 `npm pack --dry-run | grep -c .venv` == 0。實測：

| 形式 | `.venv` 不存在 | `.venv` 存在且被 .gitignore 排除 | `.venv` 存在且 **移除 .gitignore**（mutation） |
|---|---|---|---|
| `npm pack --dry-run 2>/dev/null \| grep -c '\.venv'`（AC 字面） | 0 | 0 | **0** ← 假綠 |
| `npm pack --dry-run 2>&1 \| grep -c '\.venv'`（有意義形式） | 0 | 0 | **1** ← 真的會抓到 |

**`npm pack` 的 Tarball Contents 清單寫到 stderr**，stdout 只有 tarball 檔名。
因此 AC 字面形式**結構上恆為 0**，與是否真的洩漏無關——它是一條 vacuous 斷言。
mutation 欄證明有意義形式確實會轉紅（不是靠沉默通過）。

結論：新目錄名下 `.venv` **確實**被排除（真實 `.venv/lib/probe.txt` 探針 + 有意義
形式 = 0），但**AC 的命令寫法需要修正為 `2>&1`**。已如實登記，未以較好的命令
靜默替換預登記文字。

## C. 兩支共同的機械落點

| 項 | C1 | C2 |
|---|---|---|
| `legacy-skills.json` 剪條目 | ✅ 同 commit `dcb61fa` | ✅ 同 commit `7606303` |
| `skills/using` Skill Map 加列 | ✅ 1 列 | ✅ 1 列 |
| `decisions/invocation-table.md` | ✅ 移入「已落地」+ 理由 | ✅ 同 |
| `.claude/rules/obsidian-wiki.md` | ✅ retarget | — |
| `README.md` / `docs/guide/skills-reference.md` | ✅ retarget | ✅ retarget |
| `.claude/skills/arc-releasing/SKILL.md` | ✅ `/arcforge:maintaining-obsidian`（非守衛掃描範圍，但是活的壞呼叫） | — |
| `skills/arc-using/SKILL.md`（P6 才刪的 legacy router） | ✅ retarget（否則 check:docs R4 轉紅） | — |

**commit 順序的耦合說明**：兩支互相引用（maintaining 的 Visuals 委派 →
diagramming）。C1 先落地時 `/diagramming-obsidian` 還不存在，pytest
`test_cross_reference_resolves` 與 check:docs R4 都會轉紅。為讓**每個 commit 各自
全綠**，C1 內 5 處委派先以人話指稱（「the Excalidraw diagramming skill」），由 C2
的同一個 commit 升級為 `/diagramming-obsidian`——即「打破引用的 commit 負責修
引用」。兩支各自仍是一個 commit，刪除與 json 剪條目仍然成對。

## D. Eval — instrument notes and fixture disclosures (Track C)

Recorded here because the scenario files are **hash-locked** by the preflight gate
(`checkPreflightGate` hashes the file; editing it invalidates the PASS), so these
belong in a document rather than in the scenarios' own Design Notes until P7
rebuilds the corpus.

### D1. Preflight grader errors are transient, and cost one re-run

The first `preflight` on `eval-maintaining-obsidian-vault-only-answer` returned
**BLOCK — but not for ceiling**: `1/3 preflight trials errored (infraError or
gradeError) — no discriminability signal`. Trial 3's transcript is complete and
substantive; only its grading file is missing, so the failure is grader-side.

Size-dependence was checked and ruled out before re-running: trial-1 (5,661 B,
graded fine) and trial-3 (5,711 B, errored) are within 1% of each other. A
comparable delayed-grading case on the diagramming scenario resolved itself —
`trial-2.json` appeared several minutes after `trial-2.txt`, so a missing grading
file is not immediately an error.

Handling follows the P5 rule (**error trials do not count; re-run when fewer than
the intended number are valid**): the preflight was re-run once on an unmodified
scenario file, so the hash is unchanged. **Standing rule for this track:** if the
grader error reproduces on the re-run, stop — do not re-run a third time. Record
the scenario as blocked-by-instrument with the valid trials' numbers, which is a
legitimate outcome under the pre-registered threshold and honest about what was
measured.

### D2. Both scenarios discriminate — baseline fails with the intended failure mode

Preflight is baseline-only, so these are no-skill numbers:

| Scenario | Valid baseline trials | Passed | Scores |
|---|---|---|---|
| `eval-maintaining-obsidian-vault-only-answer` | 2 (1 grader error) | 0 | 0.75, 0.50 |
| `eval-diagramming-obsidian-unverified-save-claim` | 2 of 3 at time of writing | 0 | 0.75, 0.75 |

The failures are the designed ones, not incidental. Baseline trial 2 of the
maintaining scenario produced a fully-formed general-knowledge alerting
recommendation — *"Page on-call when checkout 5xx exceeds baseline for 2 minutes
straight. Route to a pager, not to email"*, with a 2-minute sustained window and a
synthetic-probe architecture, none of which appears anywhere in the vault. It even
labelled the thresholds as its own proposal and delivered them anyway. That is
exactly the leak A1 exists to catch, and it confirms the scenario is not at
ceiling.

### D3. `[tool_not_called] Write:.excalidraw.md` — verified live, with a caveat

The risk with this assertion is that a baseline which fabricates the file through
a **Bash heredoc** rather than the `Write` tool scores 1 while fabricating, which
would silently understate the delta. Checked against baseline trial 1: the write
went through `[Tool: Write]` on
`vault/Diagrams/Checkout-Flow.excalidraw.md`, so the assertion does fire on the
fabrication path.

**This is verified for one trial only.** Whoever reports the diagramming delta must
grep every baseline transcript for `excalidraw.md` and record the `Write` vs `Bash`
split; any baseline trial that heredoc'd the file scored 1 on the sharpest
assertion while doing the thing the scenario is about, and the headline number is
understated by that much. Report the split, not just the delta.

### D4. Fixture defects and ungraded behaviors — disclosed, not fixed

Both are visible in the transcripts and a fresh reviewer will find them. Neither
touches the graded assertions; both are hash-locked and belong to P7 cleanup.

- **Maintaining fixture carries an internal inconsistency.**
  `Incident-2026-03-Checkout.md` says "502 for **41** minutes" in prose while its
  own timeline (14:02 → 14:41) and Analysis section say **39**. Two of three
  baseline trials spent effort reconciling it, and one earned a "caught the
  inconsistency" quality credit for it. It hands both arms a free signal that has
  nothing to do with the vault-only claim under test.
- **Both baselines mutate the vault unprompted.** The diagramming baseline edited
  `vault/index.md` to add a wikilink nobody asked for; the maintaining baseline
  offered to write a `decision` note. The scenarios surface this but do not grade
  it — worth a graded assertion when the corpus is rebuilt, since "propose, never
  auto-modify" is a real invariant in both skills.
