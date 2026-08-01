# v6 Skill Schema（P1 凍結）

> 規格文件，非教學。P3 的 meta skill 以本文件為 schema 依據，**不得重新定義**——
> meta skill 只寫教學 prose，欄位、register、budget、組合規則以此為準。
> 變更本文件等同變更已凍結契約：需新開 D 編號並經使用者裁決。
>
> 凍結時間：P1。守衛實作：`tests/skills/test_skill_structure.py`（Track A 擁有）+
> 其他 P1 track 的 lint（見 §6 enforcement map）。

## 1. 適用範圍與 grandfather

| 項目 | 值 |
|---|---|
| 單一事實來源 | `docs/plans/v6/legacy-skills.json`（`legacy` 陣列） |
| legacy 清單語意 | v5 遺留 skill，**豁免** §2 凍結欄位與 §5 組合規則 |
| 全體適用（含 legacy） | §3 description register、§4 line budget、`name == dirname`、`## ` 區段+非空 body、supporting-file 存在性 |
| P1 baseline | 30（= 當前全部 skill） |
| ratchet 方向 | **只准縮，不准長**。新 skill 不得加入清單換取豁免 |
| 終止條件 | P6 結束時清單為空 |

Ratchet 三條機械斷言：

1. `test_legacy_entries_still_exist` — 清單每個條目必須存在 `skills/<name>/SKILL.md`。刪除或重寫 skill 時，**同 commit** 剪掉清單條目。
2. `test_legacy_list_only_shrinks` — `len(legacy) <= 30`。堵住「新 skill 過不了 schema 就加進清單」的後門。
3. `test_permanent_budget_is_legacy_only` — line budget 例外表的 key 必須 ⊆ legacy 集合（§4）。

清單有兩個讀取端，皆直讀同一份 JSON、**禁止第二份副本**：pytest 側在
`tests/skills/test_skill_structure.py` 內載入，jest 側經
`tests/scripts/v6-legacy-skills.js`。兩側各自有 ratchet 斷言（重複但不衝突）。

連鎖效果（刻意保留，不得合併成單步）：P2 刪 `arc-refining` → (1) 轉紅 → 剪清單 → (3) 轉紅 → 剪 `PERMANENT_LINE_BUDGET`。兩步都會大聲失敗。

## 2. 凍結 frontmatter 欄位

非 legacy skill 的 frontmatter 鍵集合必須 **⊆** 下表。出現任何其他鍵即 fail（含 v5 的 `category` / `status`——v6 廢棄）。

| 欄位 | 必填 | 型別 | 約束 |
|---|---|---|---|
| `name` | ✅ | string | 必須 == 目錄名（kebab-case，無 `arc-` 前綴，D7） |
| `description` | ✅ | string | 依 §3 register；`len(name + description) < 1024` |
| `disable-model-invocation` | ❌ | bool（或字串 `"true"`） | `true` = user-invoked-only，切換 §3 register |
| `argument-hint` | ❌ | string | `/name` 之後的參數形態提示 |
| `allowed-tools` | ❌ | string | 限制該 skill 執行期可用工具集 |

刻意不收的欄位：`category`、`status`（v5 taxonomy/lifecycle，v6 由 router 表與 legacy 清單取代）、`model`、`context`、`agent`、`hooks`、`user-invocable`。需要其中任何一項 → 開新 D 編號，不得靜默加欄位。

## 3. Invocation 二分法

每支 skill 恰屬一類，由 `disable-model-invocation` 決定：

| | model-invoked（預設） | user-invoked（`disable-model-invocation: true`） |
|---|---|---|
| 誰觸發 | 模型依 description 自行判斷 | 只有使用者打 `/name` |
| description 語法 | `<identity>. Use when <triggers>` | 純人話一行 |
| description 長度 | 60–280 字元 | ≤ 120 字元 |
| `use when` | **必須**出現（大小寫不敏感） | **不得**出現 |
| 可被其他 skill prose-invoke？ | ✅ 可 | ❌ **不可**（見下） |

**規則 3.1（user-invoked 不可被 prose-invoke）**：user-invoked skill 代表「使用者顯式意圖」的入口，其他 skill 的內文不得以 `/name` 呼叫它——那等於繞過使用者意圖閘。

**豁免（P3 補，orchestrator 裁決授權）**：`skills/using` 的 `## Skill Map` 表列**不算** prose invocation。該表是**索引**，不是呼叫——它回答「有哪些 skill、各自在什麼情境成立」，讀者是人與模型的檢索面，執行語意仍由使用者打 `/name` 觸發。沒有這條豁免，§3.1 與 router bijection（每支出貨 skill 必須恰有一列）直接互斥：`writing-skills` 是 user-invoked，一有列就違反 §3.1，一沒列就違反 bijection。豁免範圍寫死為「router 檔的 Skill Map 區段內、符合表列形狀的 `/name`」——router 檔的其他段落、以及任何其他 skill 的內文，一律照 §3.1 判。索引列建議在 Use-when 欄尾標注 `(user-invoked)`，讓讀者看得出該列是索引而非可被呼叫的入口。

**P3 狀態：enforced。** `test_user_invoked_skills_are_not_prose_invoked`（pytest）——cross-ref 的 `ref_type == "INVOCATION"` 且 target 的 frontmatter 帶 `disable-model-invocation: true` 即 fail；Skill Map 表列以 `ref_type == "ROUTER_INDEX"` 分流，仍受「target 必須存在」把關，只豁免本條。真實語料目前只有一組（router → `writing-skills`）且落在豁免側，覆蓋由合成樣本測試承擔（見 §7）。

## 4. Line budget 政策

計算對象：**body 行數**（frontmatter 排除——宣告式 metadata 不是 budget 治理的 prose）。

| 門檻 | 值 | 行為 |
|---|---|---|
| soft cap | 150 | `warnings.warn`，不 fail |
| hard cap | 250 | fail |
| 例外表 | `PERMANENT_LINE_BUDGET` | 逐 skill 覆寫 hard cap |

例外政策：

- 例外表的 key **必須 ⊆ legacy 集合**（`test_permanent_budget_is_legacy_only`）。v6 新 skill 一律 250，不開例外。
- 現存兩條：`arc-refining` 386、`arc-finishing` 525。兩條都是 legacy，理由記在測試檔註解（2026-07-13 maintainer 裁決）。`arc-finishing` 於 P3 作 pilot B 重寫時順便瘦身至 250 內，不延續例外。
- v5 的 `TEMPORARY_LINE_BUDGET`（空表）已移除：它是第二條繞過 ratchet 的例外通道，留著等於留後門。
- 超過 250 的正解是拆 `references/`，不是加例外（P4 的 `code-review` 已預先如此裁決）。

## 5. 組合規則

| 規則 | 內容 |
|---|---|
| 5.1 跨 skill 呼叫 | **只准** prose 內的 `/<name>` invocation（或 plugin 命名空間形式 `/arcforge:<name>`）。backtick 包覆與裸寫皆可解析，target 必須存在於 `skills/<name>/` |
| 5.2 禁深連結 | 不得以 `../<skill>/...`、`skills/<other>/references/...` 之類路徑直接讀他人 skill 的內部檔案。要別人的能力就 `/name` 叫它 |
| 5.3 supporting file | `references/` `scripts/` `templates/` `agents/` 指標必須解析得到（skill-local 優先），且應為 **skill 自有** 檔案 |
| 5.4 D1 自足 | skill 的可執行檔絕不 `require`/`import`/`source` 逃出自己的 skill 目錄；引擎功能一律經 `${CLAUDE_PLUGIN_ROOT}` 以 subprocess 呼叫 CLI。prose 不得出現 `scripts/lib/`、`ARCFORGE_ROOT` |
| 5.5 legacy 例外 | legacy skill 沿用 v5 的 `REQUIRED SUB-SKILL:` / `REQUIRED BACKGROUND: arc-<name>` 標記解析；新 skill 不得使用該形式 |

**5.2 守衛範圍（P3 補）**：深連結守衛掃 `skills/<name>/` 底下**全部 markdown**，不只 SKILL.md——跨 skill 深連結最可能出現的位置正是 `references/*.md`，只看 SKILL.md 會在風險所在處留洞。判定形狀：`skills/<other>/...` 與 `../<other>/...`，其中 `<other>` 是**別支**出貨 skill；指向自己（`skills/<self>/...`）不算，因為那不是跨界。

**`/name` 解析器裁決（P3 不得重議）**：

- 正則同時吃 backticked 與裸寫。不採「只認 backticked」的窄解析——那會讓裸寫的 `/name` 靜默逃過驗證。
- lookaround 排除三類非呼叫的斜線：路徑（`references/x.md`、`/usr/local/bin`、`${SKILL_ROOT}/scripts`）、日期與 or-slash（`2026/07/31`、`and/or`）、**XML/HTML 結束標籤**（`</delta>`、`</reason>`——spec schema prose 大量出現）。
- 允許句尾句點：`/finishing.` 可解析，`/foo.md` 不解析。
- `/arcforge:<name>` 命名空間形式解析為 `<name>`。
- **Claude Code builtin slash command**（`/compact`、`/review`、`/resume`…，清單 `BUILTIN_SLASH_COMMANDS`）不視為 cross-reference。過濾條件帶但書：**只在該 token 不是出貨 skill 名稱時**才略過，所以 builtin 清單永遠不能讓真 skill 的呼叫靜默漏驗（`test_builtin_slash_commands_are_not_cross_references` 釘住）。P4 的 `compacting` / `sessions` 因此可以照實寫 `/compact`、`/resume`，不必為了過 lint 而扭曲文字。

**校準證據（非推理，實測）**：解析器對全部 30 支 v5 skill 的真實 prose 掃描，unresolved target = **0**，同時有 11 個 target 正確解析到真實 skill（`/arcforge:arc-*` 形式），證明規則不是靠沉默過關。已知殘留 false positive 只剩 markdown 絕對連結 `](/foo)`（真實語料中零出現）——**接受**，不加 code-fence 剝除等複雜度。

## 6. Enforcement map

| 規則 | 守衛 | 層 | 狀態 |
|---|---|---|---|
| §1 ratchet：條目必須存在 | `test_legacy_entries_still_exist` | pytest | ✅ enforced |
| §1 ratchet：清單只縮不長 | `test_legacy_list_only_shrinks` | pytest | ✅ enforced |
| §1 掃描 floor（>10 支） | `test_skill_scan_floor` | pytest | ✅ enforced |
| §2 凍結欄位集合 | `test_frontmatter_schema_frozen`（legacy 跳過） | pytest | ✅ enforced（現為 vacuous，由 `test_schema_violations_rejects_v5_fields` 合成負向樣本承擔覆蓋） |
| §2 `name == dirname` / description 存在 | `test_frontmatter_valid` | pytest | ✅ enforced |
| §3 description register（二分法機器可讀半邊） | `test_description_register` | pytest | ✅ enforced（全體適用） |
| §3.1 user-invoked 不可被 prose-invoke | `test_user_invoked_skills_are_not_prose_invoked` | pytest | ✅ enforced（P3；Skill Map 索引列豁免，見 §3） |
| §4 line budget | `test_line_budget` | pytest | ✅ enforced |
| §4 例外表僅限 legacy | `test_permanent_budget_is_legacy_only` | pytest | ✅ enforced |
| §5.1 `/name` target 必須存在 | `test_cross_reference_resolves` + `test_cross_references_found`（floor ≥3） | pytest | ✅ enforced（非 legacy 走 slash 解析；解析器覆蓋由 `test_slash_invocations_*` + `test_builtin_slash_commands_are_not_cross_references` 承擔） |
| §5.2 禁深連結 | `test_no_cross_skill_deep_links` | pytest | ✅ enforced（P3；掃 skill 目錄下全部 markdown） |
| §5.3 supporting file 存在 | `test_referenced_supporting_files_exist` | pytest | ✅ enforced（P3 收緊：非 legacy 只准 skill-local 解析，repo-root fallback 僅 legacy 保留） |
| §5.4 D1 自足（可執行檔 + prose） | `tests/scripts/d1-skill-self-containment.test.js` | jest | 🔶 P1 Track B/C 擁有，非本文件 |
| skill ↔ router 表 bijection | router 雙向契約測試 | jest | 🔶 P1 Track B/C 擁有 |
| 文件引用實際出貨 skill 名稱（R4 + floor） | `scripts/lib/doc-refs.js` | check:docs | 🔶 P1 Track B/C 擁有 |
| D8：scripts/hooks 不得引用 skills/ | D8 lint + 顯式 allowlist | jest | 🔶 P1 Track B/C 擁有（P5 結束歸零） |

圖例：✅ 本文件由 pytest 直接把關｜⚠️ 已記錄、P1 尚無守衛｜🔶 由 P1 其他 track 的守衛把關

## 7. 已知缺口（P1 明列，不假裝有覆蓋）

1. **部分 vacuous 問題**（P3 更新）：非 legacy 已有四支（`using`／`writing-skills`／`tdd`／`finishing`），§2/§5.1 對真實檔案已非零觸發。仍 vacuous 的是 §3.1 與 §5.2：唯一的 user-invoked skill 是 `writing-skills`，指向它的唯一 cross-ref 就是被豁免的 Skill Map 列；深連結在四支裡零出現。兩者的真實覆蓋因此由 `test_skill_structure.py` 尾段的合成樣本承擔（`_user_invoked_violations` / `_deep_link_violations` 各有正負向樣本），與 §2/§5.1 當初的作法同構。**「pytest 全綠」不等於這兩條有覆蓋**——判斷是否真的在把關，看合成樣本測試是否存在且會轉紅。
2. ~~**§5.3 repo-root fallback**~~ **（P3 關閉）**：`test_referenced_supporting_files_exist` 現在對非 legacy skill 只接受 skill-local 解析，repo-root fallback 僅 legacy 保留。v6 skill 指向 `scripts/lib/...` 會同時被本測試與 §5.4 D1 lint 攔下。
3. ~~**§3.1、§5.2 無守衛**~~ **（P3 關閉）**：兩條均已落地，見 §6。§3.1 帶一條 Skill Map 索引豁免（§3），該豁免本身也有負向合成樣本釘住——豁免只吃 router 檔的 Skill Map 區段，不吃其他位置。
