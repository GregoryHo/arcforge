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
**P1 狀態：recorded, unenforced。** 目前 30 支全 legacy、cross-ref 全走 legacy 分支，寫斷言等於零覆蓋。等 P3/P4 出現第一支非 legacy 的 user-invoked skill 時，在 `test_cross_reference_resolves` 旁補「target 的 frontmatter 不得 `disable-model-invocation: true`」。

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
| §3.1 user-invoked 不可被 prose-invoke | — | — | ⚠️ **P1: recorded, unenforced**（見 §3） |
| §4 line budget | `test_line_budget` | pytest | ✅ enforced |
| §4 例外表僅限 legacy | `test_permanent_budget_is_legacy_only` | pytest | ✅ enforced |
| §5.1 `/name` target 必須存在 | `test_cross_reference_resolves` + `test_cross_references_found`（floor ≥3） | pytest | ✅ enforced（非 legacy 走 slash 解析；解析器覆蓋由 `test_slash_invocations_*` + `test_builtin_slash_commands_are_not_cross_references` 承擔） |
| §5.2 禁深連結 | — | — | ⚠️ **P1: recorded, unenforced**（P3 首支非 legacy skill 落地時補） |
| §5.3 supporting file 存在 | `test_referenced_supporting_files_exist` | pytest | ✅ enforced（**gap**：目前允許 repo-root fallback，非 legacy 的 skill-local-only 收緊未寫，見 §7） |
| §5.4 D1 自足（可執行檔 + prose） | `tests/scripts/d1-skill-self-containment.test.js` | jest | 🔶 P1 Track B/C 擁有，非本文件 |
| skill ↔ router 表 bijection | router 雙向契約測試 | jest | 🔶 P1 Track B/C 擁有 |
| 文件引用實際出貨 skill 名稱（R4 + floor） | `scripts/lib/doc-refs.js` | check:docs | 🔶 P1 Track B/C 擁有 |
| D8：scripts/hooks 不得引用 skills/ | D8 lint + 顯式 allowlist | jest | 🔶 P1 Track B/C 擁有（P5 結束歸零） |

圖例：✅ 本文件由 pytest 直接把關｜⚠️ 已記錄、P1 尚無守衛｜🔶 由 P1 其他 track 的守衛把關

## 7. 已知缺口（P1 明列，不假裝有覆蓋）

1. **全 vacuous 問題**：30 支 skill 全在 legacy，§2/§5.1 在正常 run 下對真實檔案零觸發。真實覆蓋來自兩處：(a) `test_skill_structure.py` 尾段的合成樣本測試（`_schema_violations` / `_slash_invocations` / `_is_legacy` / builtin 過濾）；(b) P1 期間的 de-grandfather mutation 實測——把 `arc-tdd`／`arc-journaling`／`arc-refining` 暫時移出 legacy 後，`test_frontmatter_schema_frozen` 對 `category`/`status` 轉紅、`test_permanent_budget_is_legacy_only` 對 `arc-refining` 轉紅、slash cross-ref 全部解析成功。P3 第一支非 legacy skill 落地時重跑同樣的 mutation 確認一次。
2. **§5.3 repo-root fallback**：`test_referenced_supporting_files_exist` 允許指標解析到 repo 根目錄（legacy skill 需要），因此 v6 skill 指向 `scripts/lib/...` 仍會通過該測試。實際攔截依賴 §5.4 的 D1 lint（prose 不得出現 `scripts/lib/`）。若 Track B 的 D1 lint 未覆蓋此形狀，P3 前需在 pytest 補「非 legacy → 僅 skill-local 解析」。
3. **§3.1、§5.2 無守衛**：兩者都需要至少一支非 legacy skill 才有意義，P1 只凍規格。
