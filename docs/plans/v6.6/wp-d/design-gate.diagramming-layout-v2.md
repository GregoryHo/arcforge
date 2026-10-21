# `diagramming-obsidian` 版面 reference 設計關卡 Version 2（D-066 D2，#185）

**判定：MEASURABLE。** task 改成六個對等、各帶兩行說明的服務排成一列，不給 hub、不給箭頭、不點名寬度；計分斷言仍只有一個 `A1`：相鄰方塊間距 ≥40，加一個前提條件，每個 worker 的 `text` 要是名稱加兩行說明的三行。預算照 PLAN：preflight 3 + A/B 10，共 13 個 session，D1 結束後才跑。preflight 天花板 BLOCK 是可能的結果，依 D-066 就是 #185 的最後答案；本文件判斷它不是最可能的結果，理由在「天花板」一節。

本文件只閱讀檔案，並在不啟動 session 的前提下執行 `git archive`、`git show` 與引擎的 `digestSkillDir`。行號以 `main` 的 `d06656e2` 為準。Version 1 的關卡是 `docs/plans/v6.5/wp-d/design-gate.diagramming-layout.md`，本文件只寫 Version 2 改了什麼、為什麼；沒改的部分（只交座標計畫、絕對路徑、寫進 staged 複本的列不計分）照那份關卡的理由沿用。

## Version 1 量到什麼

preflight 紀錄本身只有通過率：`docs/plans/v6.5/wp-d/preflight.eval-diagramming-obsidian-layout-grid-2.json` 寫 `pass_rate: 1`、`verdict: "BLOCK"`、`baseline_skill_files_hash: "0f3c574c1e448946"`，沒有逐列內容。逐列內容在 operator 稽核 `docs/plans/v6.5/wp-d/audit.d4.md`（不是 `audit.d1.md`，那份是 resume scenario 的稽核，沒提到本 scenario）。稽核的「逐列」表與「逃逸」一節：

- 五個計分列都打開了 staged 的舊 `layout-heuristics.md`，都是第 2 個工具呼叫，也都讀了 `painters-toolkit.md`。
- 五列都把 pipeline 餵給 `plan_layout.py`，六個 worker 的 `size` 都寫 `secondary`；router 與 event-log 被當成較大的 hub。
- 六個 worker 寬度都是 `140 ×6`、相鄰間距 `60 ×5`、欄距 `200 ×5`。
- 有終局回覆的四列都引用了 200 px 格線，例如「Boxes sit on a grid of 200px columns and 150px rows」「columns every 200px from x=50」。間距 60 是結果的陳述（「with 60px gaps」），不是理由。
- 沒有一列提到舊文字的矛盾，沒有一列改用 220，也沒有一列引用間距表的 40 px。

兩件事因此確立。第一，**欄距照抄舊格線**，五列都是 200。第二，**寬度取自 `plan_layout.py` 的預設尺寸表**：`references/plan_layout.py:44-47` 是 `SIZES = {"hero": (280, 100), "primary": (180, 70), "secondary": (140, 55), …}`，140 正是 `secondary` 那一格。舊文字只在 Primary 寬 180 時出錯，而 Version 1 的 task 讓 agent 把 worker 叫成 Secondary。D-064 的 Residual 因此寫：Version 2 要一個「baseline 不經 prompt 點名寬度就走到 Primary 寬」的 task。

## 受測的變更（與 Version 1 相同）

#182（`1fed56d0`）對 `references/layout-heuristics.md` 的修改，舊版取 `1fed56d0~1`。兩版行號相同，差異只在內容：

| 行 | 舊 | 現行 |
|---|---|---|
| `:16` | `Columns: x = 50, 250, 450, 650, 850, ...  (200px increments)` | `x = 50, 270, 490, 710, 930, ...  (220px increments)` |
| `:20` | 「This ensures minimum 40px gap between Primary-sized elements (180px wide, 200px column spacing = 20px gap on each side).」 | 「220px columns leave a 40px gap between Primary-sized elements (180px wide) — the same-level minimum in the spacing table below.」 |
| `:167-168` | 「x increments of 200px」、分隔線留 200px | 「220px」、分隔線至少 30px |

兩版都有：`:162`「Minimum 40px gap between shapes at the same hierarchy level」、`:231` 間距表「Same-level shapes | 40px」。舊 `:20` 自己點名 Primary 寬 180、欄距 200，算出來是 20，同一句卻說「minimum 40px」；「20px gap on each side」還可以讀成「兩邊各 20、合起來 40」，正是會讓 agent 相信舊格線沒問題的讀法。

`skills/core/diagramming-obsidian/` 在 `853ea820`（Version 1 的量測 commit）之後沒有任何 commit（`git log 853ea820..HEAD -- skills/core/diagramming-obsidian` 為空）；`d06656e2`（#256）只改 `maintaining-obsidian`。

## Version 2 的 task

### prompt（提議全文）

> I want an Excalidraw diagram of our platform's six core services for the team vault, but before you build anything, give me the coordinate plan to review: write it to `layout.json` at the top of this project folder — use the full absolute path, not a relative one — as a JSON array of elements, each `{"id", "type", "x", "y", "width", "height", "text"}` with `type` either `"box"` or `"label"`. Each service gets exactly one `"box"`: its `id` is the service's name as written below, and its `text` is three lines separated by `\n`: the service's name, then its two description lines exactly as given. Don't build, render or save a diagram yet. The six services are peers of equal weight: none of them calls another, there is no gateway or hub in front of them, and the diagram has no arrows. Put them side by side in one row:
>
> - `auth` — check tokens / new sessions
> - `billing` — meter usage / send bills
> - `search` — index docs / run queries
> - `notify` — queue alerts / email, push
> - `export` — make reports / write CSV
> - `audit` — log actions / keep history

與 Version 1 的差別：沒有 router、沒有 event-log、沒有分區與分隔線、沒有 connector；每個方塊多一個 `text` 欄位，內容是名稱加兩行說明；服務名稱沿用 Version 1 的六個，grader 的 `WORKERS` 不必改。`text` 的寫法明說「three lines separated by `\n`: the service's name, then its two description lines exactly as given」：第一版草稿只寫「name on the first line followed by the two description lines」，兩行說明可以被併成一行，或用 ` / ` 連起來，`text` 是否三行就成了 grader 要猜的事；這個欄位現在是計分的前提條件（見「grader 要改什麼」第 3 項），寫法不能留歧義。沒變的：只交座標計畫、不建置不 render 不存檔、`layout.json` 以絕對路徑寫在專案目錄（理由見 Version 1 關卡的「殘餘風險」前兩項）、每個服務恰一個 `"type": "box"` 且 `id` 是服務名稱。prompt 沒有提到寬度、間距、格線、40、180、200 或 220。

### 為什麼這個 task 會讓 baseline 走到 Primary

Version 1 的 worker 成為 Secondary，是因為 task 有兩個 hub：router 扇出、event-log 匯入，agent 把 hub 畫大、把六個 worker 當成旁邊的支撐元素。Version 2 拿掉的就是這個理由：

1. **沒有可以支撐的 Primary。** `painters-toolkit.md:208` Primary 是「Major components of roughly equal weight」，`:209` Secondary 是「Supporting elements beside primaries」。圖上只有六個對等的主要元件，沒有別的元素，Secondary 的定義找不到它旁邊的 Primary。
2. **對稱的概念畫等大的同儕，不發明 hero。** `SKILL.md:89-93`：「a symmetric concept gets equal-sized peers; do not invent a hero the concept never claimed」；`painters-toolkit.md:216` 把「parallel branches」列為不該用 hero 的對稱概念。prompt 說的「peers of equal weight」「no gateway or hub」對到這兩句。
3. **三行字放不進 Secondary 的高度。** skill 的 text-in-shape 範本是 `fontSize = 16`、`boxPadding: 20`（`element-templates.md:27`、`:32`），字型是等寬的 Cascadia（`:16`）。三行文字 16 × 1.25 × 3 = 60 px，加上下 padding 是 100，落在 Primary 的 70–100，超出 Secondary 的 50–70（`painters-toolkit.md:208-209`）。說明行最長 12 個字元，依 `element-templates.md:378` 的 `character_count × fontSize × 0.6` 是 115 px，加 padding 20 是 155、加預設 padding 30（`:32` 的註解）是 175，兩種都放得進 180。行長刻意壓在 12：寬度的拉力仍來自 Primary 這個尺寸類別，而不是逼 agent 超過 180。

`plan_layout.py` 的 flow 元素沒寫 `size` 時預設就是 `primary`（`:185`），也就是 180 × 70。

**與 PLAN 不一致的一處。** PLAN 的 D2 列引用 `visual-patterns.md:91`，說 side-by-side 的元素都是 Primary。那一節（`:87-91`）是「Side-by-Side (Comparison)」：before/after、選項、取捨，「Two parallel structures」，兩邊都 Primary 是為了「fair comparison」。六個互不相干的服務不是比較，這一行撐不起論證；本關卡的理由只取上面三條。prompt 用了「side by side」這個詞，agent 可能因此讀到那一節，兩臂相同。

## 天花板：baseline 不靠現行文字通過的路

baseline 失敗的走法只有一條：**照抄 200 的欄距，寬度取 161 以上**。寬 180 間距 20、寬 175 間距 25、寬 170 間距 30，都小於 40。舊文字點名的 Primary 寬是 180（舊 `:20`），`plan_layout.py` 的 `primary` 也是 180（`:46`）；Version 1 五列的欄距都是 200、寬度都是預設尺寸表的數字。照這兩件事外推，baseline 的預期值是 180 寬配 200 欄距，FAIL。

通過的路，PLAN 點名兩條，本關卡再找到四條：

1. **寬 160 排在 200 的格線上，間距正好 40**，斷言是 `≥ 40` 所以通過（PLAN 點名）。160 是 Primary 範圍的下限（`painters-toolkit.md:208`）。字寬估計 155 只在 padding 取 20 時放得進 160；取預設 30 的 175 會被裁切。
2. **`painters-toolkit.md:214`「Primaries get 60-100px buffer between peers」**，兩臂都有（PLAN 點名）。這是 Version 2 最大的天花板風險：Version 1 的 worker 是 Secondary，這一句不適用；Version 2 的 worker 是 Primary，這一句直接適用。照它排，180 寬的欄距是 240–280，baseline 通過。對抗的證據是 Version 1：五列都讀了 `painters-toolkit.md`，五列的欄距都是 200，60 px 是寬 140 的結果，沒有一列把 toolkit 的 buffer 當理由。
3. **間距表的 40 px**（舊 `:162`、`:231`），以及舊 `:20` 同一句的「minimum 40px」。發現矛盾就會改用 40 以上。Version 1 沒有一列提到矛盾，但 Version 1 也從來沒碰到它。
4. **再次選 Secondary**（寬 110–140，200 欄距下間距 60 以上）。上面三條理由都在反方向；寬 140 配高 100 的方塊也可能出現，寬度才是斷言看的數字。
5. **文字推高寬度超過 200。** 若 agent 用比 16 大的字級（skill 的自由文字範本是 `fontSize = 20`，`element-templates.md:81`），12 個字元加 padding 30 是 204，200 的格線排不下，agent 只能自己決定間距，多半 ≥40。行長壓在 12 就是為了讓這條路只在字級 20 時打開。
6. **不打開 `layout-heuristics.md`**。`SKILL.md:108-109` 要求 Phase 1 前打開它；Version 1 五列都在第 2 個工具呼叫打開。

`plan_layout.py` 會把 flow 元素排成單欄直排（`:196-199`，列距 `ROW_GAP = 30`，`:57`），grader 以「不在同一列」判 FAIL。Version 1 四列看出這點後改手排；這條路兩臂相同，不是逃生路也不是鑑別。`check_overlaps.py` 只回報 0 到 30 之間的間距並建議加到 30（`:475`、`:489`、`:497`），照修之後仍小於 40，也不是逃生路；而且 task 不建置，agent 沒有 `.excalidraw` 可以給它檢查。

**判斷。** preflight 是 k=3、門檻 `CEILING_THRESHOLD = 0.8`（`scripts/lib/eval-preflight.js:34`），2/3 是 0.67 判 PASS，所以 BLOCK 要三列全部走上述某條通過的路。Version 1 的證據指向 agent 照抄格線、寬度取預設尺寸表；Version 2 移動的是尺寸類別，若 agent 叫它們 `primary`，兩個預設來源都給 180，照抄 200 欄距就失敗。主要的反向力量是第 2 條，它在 Version 2 才變得適用，Version 1 沒有提供它會不會被用到的證據。本文件的判斷是 BLOCK 有實際可能，但不是最可能的結果；這個判斷只建立在一個 task 的五列上，不給機率。BLOCK 發生時照 D-066 記為發現、關閉 #185，不重新設計。

**跳過文字要求的列不能把 baseline 推到天花板。** Version 2 靠三行文字把 worker 推到 Primary；如果 `text` 不計分，一列可以省掉 `text`、給非字串、或把兩行說明併成一行，留著 Secondary 大小的方塊，照 200 欄距排出 60 的間距，仍以 PASS 計入 3/3 的 BLOCK，而 BLOCK 會關閉 #185。所以 `text` 是 `A1` 的前提條件（「grader 要改什麼」第 3 項）：這樣的列判 FAIL，不計入天花板。天花板只能由交出三行文字、仍然排出 ≥40 間距的列達到，也就是上面六條路之一，不能靠跳過 task 的操縱達到。

## 地板：treatment 會不會也失敗

preflight 只跑 baseline 臂（`scripts/cli/eval-command.js` 的 preflight 路徑，Version 1 關卡已列），treatment 的地板要到 A/B 才看得到。treatment 失敗的路：

- **寬度超過 180 排在 220 的格線上。** 寬 190 間距 30、寬 200 間距 20。行長壓在 12 讓 16 號字在兩種 padding 下都放得進 180，沒有理由加寬；字級 20 會打開這條路（見上第 5 條），兩臂同時。
- **直排。** 同上，兩臂相同。
- **不照格式寫 `text`。** 缺漏、非字串、行數不是三、第一行不是服務名稱，都讓 `A1` 判 FAIL（「grader 要改什麼」第 3 項）。兩臂讀同一個 prompt 與同一份 `SKILL.md`，這種 FAIL 對兩臂機率相同，是雜訊，不是偏差；它拉低兩臂的通過率、縮小可見的 delta，列在殘餘風險。
- **寫進 staged 複本、或 `uv run` 建 `.venv`。** 列不計分（`trial_wrote_skill_files`），由補跑補上；Version 1 五列沒有一列發生（`audit.d4.md`「逐項稽核」）。

treatment 照現行 `:16`、`:20` 排 180 寬，間距正好 40，通過。它不是先天通過：寬度選錯一樣失敗。

## grader 要改什麼（屬於之後的 scenario PR）

計分邏輯 `A1` 不必改：Version 1 本來就只讀六個 worker 的 box，`WORKERS = ("auth", "billing", "search", "notify", "export", "audit")` 名稱沿用，「一列」與「相鄰間距 ≥40」對六個元素照舊成立（`evals/scenarios/eval-diagramming-obsidian-layout-grid.md:227`、`:374-395`）。prompt 不再有 `connector` 與 `separator`，`text` 是新欄位。scenario PR 要做的：

1. `## Scenario` 換成上面的 prompt；`## Version` 1 → 2。scenario 文字改了，hash 跟著改，preflight 的鍵與 pool 都換新；Version 1 只有 preflight 紀錄，沒有 A/B 列，帳本裡的 BLOCK 照留。
2. 拿掉 `C2`（分隔線淨空）與 `MIN_SEPARATOR_CLEARANCE`：沒有分區，每列都只會印「no separators in the plan」。Design Notes 的 C2 一條同時刪。
3. **`A1` 加一個前提條件：三行文字。** 六個 worker 的 box 各自要有字串型別的 `text`，以 `\n` 分成恰好三行（去掉結尾的一個換行、每行去掉前後空白後皆非空），第一行等於 prompt 寫的服務名稱（即該 box 的 `id`）。任何一個 worker 不符，`A1` 判 FAIL，原因寫明是哪個 worker、哪一項：`text` 缺漏、不是字串、行數（印出實際行數）、第一行（印出實際內容）。兩行說明只檢查非空，不比對逐字內容：操縱靠的是三行的高度與行長，逐字比對只會把「email, push」寫成「email & push」這類與版面無關的差異判成 FAIL。

   **放在 `A1` 裡，不另立 `A2`。** scenario 的計分斷言維持一個，row 的 pass 就是 `A1` 的 pass，引擎讀這個 scenario 的方式與 Version 1 相同；`A1` 本來就把「不符合指定 schema」判為 FAIL（現行 scenario `:97-99`、`:111-118`），`text` 是 schema 的新欄位，同一條規則延伸過去即可。另立 `A2` 會讓同一個 row 有兩個計分標籤，「格式錯」與「間距錯」在 pool 裡看起來是同一種 FAIL，卻要多一套讀法。預先登記的 decision 記下這個選擇。

   **不計分的 audit 保留**：每個 worker 的寬度落在哪個尺寸類別（≤140 Secondary、160–200 Primary、其他）。稽核要回答的第一個問題是「baseline 有沒有走到 Primary」；寬度已由 `-- audit: widths:` 印出，這一行讓答案不必人工換算。
4. `## Assertions` 的 A1 句子加上第 3 項的前提條件：六個 worker 的 box 各有三行的字串 `text`、第一行是服務名稱。Design Notes 改寫成 Version 2：權威文件指向本關卡，「What is measured」加 Version 1 的結果與 Version 2 的理由，baseline 的逃生路換成本關卡的六條，預算出處換成 `docs/plans/v6.6/PLAN.md`。

## 執行計畫

- **兩文字 A/B，兩臂同一份 `SKILL.md`**，與 D-063 第 3 條相同：baseline 目錄是現行 skill 目錄、只把 `references/layout-heuristics.md` 換成 `1fed56d0~1` 的版本，在 repository 之外組出。組法照現行 scenario 的「Running it」（`:131-144`）：

  ```bash
  BASE="${TMPDIR:-/tmp}/arcforge-d2-baseline/diagramming-obsidian"
  rm -rf "$BASE" && mkdir -p "$BASE"
  git archive HEAD:skills/core/diagramming-obsidian | tar -x -C "$BASE"
  git show 1fed56d0~1:skills/core/diagramming-obsidian/references/layout-heuristics.md \
    > "$BASE/references/layout-heuristics.md"
  ```

- **預期的 digest。** 在 `d06656e2` 離線實際組過一次並以 `digestSkillDir` 計算：baseline 目錄 `0f3c574c1e448946`，現行目錄 `42ec93e5d9d42cec`（以 `git archive` 解開的複本與工作目錄本身都是這個值），與 D-063 登記的兩個值相同。主 checkout 的 `references/` 下有 `.venv` 與 `__pycache__`，`diff -rq` 會多列這兩項；digest 跳過它們（`scripts/lib/eval-skill-staging.js:33` 的 `SKIP_NAMES`），所以不影響。量測前在量測 commit 重算，任何一個不同就停下、重新登記，不花 session。
- **旗標**，preflight 與 A/B 相同：`ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000`、`--model 'opus[1m]' --effort xhigh`、`--stage-skill-files --baseline-skill-file "$BASE/SKILL.md"`；A/B 另加 `--skill-file skills/core/diagramming-obsidian/SKILL.md`。隔離、不帶 `--plugin-dir`、不帶 `--also-stage`。`## Max Turns` 與 `## Environment` 照 Version 1 不宣告。
- **k 與 session**：preflight k=3；PASS 才跑 A/B，k 取 `## Trials` 的 5，兩臂共 10。合計 3 + 10。補跑（`eval ab --k 1`，至多 2 次）與 preflight 出錯重跑（整輪至多 2 次，與 D1 共用）照 PLAN 的額度表。
- **順序**：D1 結束後才開始；一個 checkout 一次一個 live eval。
- **時間**：Version 1 的五個 trial 是 395.5 到 472.7 s（`audit.d4.md`「花費」）；Version 2 少了 hub 與 connector，預期不會更長，沒有量過，不給數字。

## 殘餘風險

- **#309（M-A，`--also-stage`）在本關卡寫成時仍未合併。** PLAN 的順序是關卡在 M-A 合併後寫；D2 不用 `--also-stage`，但 M-A 改了 staging 與注入。PLAN 的 M-A 要求單一目錄時注入句逐字不變（golden test），所以預期不影響 D2；量測前以量測 commit 重算兩個 digest，並確認 row 沒有 `alsoStaged`。
- **Version 1 的其他殘餘照舊**：寫進 staged 複本的列不計分；`uv` 在 trial 裡解析不到的跡象（`audit.d4.md`「`uv` 與 staged 複本」）不是證明；baseline 讀 repository 裡的現行檔案就不再是舊 reference 那一臂，稽核逐列檢查 `-- audit: outside the trial tree`；沒打開 reference 的列分開報告。
- **格式不符的 FAIL 是兩臂對稱的雜訊。** `text` 不照格式寫的列判 FAIL；兩臂同一個 prompt、同一份 `SKILL.md`，這種 FAIL 不偏向任何一臂，但會拉低兩臂的通過率、縮小可見的 delta。稽核逐列寫出 FAIL 是格式還是間距，兩臂各有幾列格式 FAIL 寫進結果的 decision，不解讀成鑑別。
- **不能讀成格線之外的事。** 斷言量的是 Primary 寬度的元素在兩種格線下的間距，不是完整的建置、render 與存檔，也不是 router 這類 hub 存在時的版面。

## 判定與 #185

**MEASURABLE**，條件四項：(1) prompt 用上面的全文，不點名寬度，說明行不超過 12 個字元；(2) 唯一計分斷言 `A1` 是六個 worker 同一列、相鄰間距 ≥40，且每個 worker 的 box 帶三行的字串 `text`、第一行是服務名稱（「grader 要改什麼」第 3 項），不符者判 FAIL；(3) 兩文字 A/B，baseline 目錄 digest `0f3c574c1e448946`、treatment `42ec93e5d9d42cec`，在量測 commit 重算相符；(4) Version 1 關卡的條件 (1)、(3)、(4) 照舊：只交座標計畫、絕對路徑、寫進 staged 複本的列不計分且由補跑補上。

各結果對 #185：

| 結果 | 處置 |
|---|---|
| preflight 天花板 BLOCK（baseline 3/3） | D-066：Version 2 是最後一次設計，關閉 #185，記為發現。現行 reference 從未與舊版量過（D-066 Residual）。不重跑、不跑 A/B |
| preflight PASS → A/B 的引擎判定 | PLAN「#184、#185 的處置」：量到結果就關閉，留言附帳本連結 |
| preflight 沒量到（有 `infraError` 列，`pass_rate: null`） | 動用整輪 2 次的重跑額度；用完仍沒有可用的 preflight，記為沒量到 |
| A/B 補跑兩次後仍 `INSUFFICIENT_DATA`，或 preflight 額度用完仍沒量到 | PLAN 與 D-066 都沒寫 #185 此時要關還是留；由預先登記的 decision 決定，本關卡不代選 |
