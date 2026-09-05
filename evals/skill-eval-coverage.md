# Skill Eval Coverage

當前狀態的權威來源是 `evals/benchmarks/latest.json`（由 `arcforge eval report` 生成）；
本檔是人讀的帳本：每支 core skill 的現行證據、P7 全量 benchmark 結果、與歷史池的
出處。量測協定與門檻見 `docs/plans/v6/progress.md` P7 預登記；逐步執行紀錄見
`docs/plans/v6/p7-benchmark-evidence.md`。

## 覆蓋規則（v6）

- 每支 `skills/core/<name>/` 必須有 ≥1 支現役 scenario 以 `## Target` 指向它——由
  `tests/scripts/eval-corpus-coverage.test.js` 機械強制（含 >10 sanity floor 與
  scenarios/ 子目錄盲區斷言）。
- Scenario 檔案全文 hash 定 preflight cache；任何編輯即失效重測。`## Version` 只管
  結果池的分池；rubric 改動未 bump Version 由 `scripts/check-eval-version-bump.js`
  發 warning。
- Trial pass bar = score ≥ 0.8；error trial（infra/grade）不入分母。

## P7 全量 benchmark（2026-08-15，窗起點 02:09:09Z）

19 支現役 scenario 全數新鮮池。treatment 池來源：ab treatment 臂（正規 skill 注入）
或 `eval run` 池（僅當其已達標——run 模態無注入，方向保守；機理與修正案見
p7-benchmark-evidence.md「協定修正案」）。

| scenario | 池來源 | treatment pass | 本窗 delta |
|---|---|---|---|
| brainstorming-alternatives-before-build | ab | 40%（avg 0.85） | **+0.35 CI[0.11, 0.59] IMPROVED** |
| code-review-answering-feedback | ab | 80% | +0.05（non-reg 分數面過；成本旗標見帳） |
| code-review-range-fidelity | ab | 100% | +0.27 CI[−0.08, 0.61]（non-reg PASS） |
| code-review-two-axis | ab | 100% | **+0.40 IMPROVED** |
| compacting-persist-before-compact | run | 100%（avg 0.96） | non-reg SHIP |
| d1-bare-cli-invocation | run | 80%（avg 0.93） | non-reg（D1/D9 路徑實證） |
| debugging-root-cause-first | run | 100% | —（ceiling ×2，unmet-but-covered，P4 +0.16 歷史） |
| diagramming-obsidian-unverified-save-claim | ab 合池 | 0%（avg 0.56） | **+0.23 CI[0.09, 0.38] IMPROVED**（首個有效量測） |
| dispatching-report-not-evidence | run | 100%（4 有效） | —（ceiling ×3，unmet-but-covered） |
| evaluating-cross-condition-validity | run | 100% | —（preflight 67% 已恢復鑑別力，delta 未列 P7 範圍） |
| executing-verify-decides-done | ab k=10 | 100% | **+0.40 CI[0.03, 0.77] IMPROVED**（脫離 unmet-but-covered） |
| finishing-verify-before-options | ab | 100% | **+0.54 CI[0.46, 0.62] IMPROVED**（description 修復自帶 baseline） |
| learning-marker-preservation | run | 80% | —（P5 +0.25 標記保留為現行 delta 證據） |
| looping-stale-state-relaunch | run | 100%（avg 0.90） | —（P6 +0.19 為現行 delta 證據） |
| maintaining-obsidian-vault-only-answer | ab | 100% | **+0.28 CI[0.14, 0.42] IMPROVED**（A1 重寫後，取代 P5 +0.08） |
| router-skill-selection | ab | 100%（avg 0.96） | **+0.36 CI[0.25, 0.47] IMPROVED** |
| sessions-handover-completeness | ab | 100% | **+0.29 IMPROVED**（A5 結構守衛入列後） |
| tdd-test-first-gate | ab | 40%（avg 0.80） | **+0.63 CI[0.41, 0.86] IMPROVED** |
| writing-skills-recipe-over-prohibition | run | 100% | —（ceiling ×2，unmet-but-covered） |

**預登記門檻對照**：平均 pass_rate 16.2/19 = **0.853 ≥ 0.70 ✓**；個別 ≥0.60 者 16/19 =
**84.2% ≥ 80% ✓**（線下：brainstorming 0.40、diagramming 0.00、tdd 0.40——三支 delta
皆 IMPROVED；低 pass 反映 0.8 trial bar 的嚴格性，非技能無效）。

## 每支 skill 的現行 delta 證據（P7 收官）

| skill | 現行證據 | 出處 |
|---|---|---|
| speccing | spec-before-code **+0.67 CI[0.67, 0.67] IMPROVED**；supersede-not-overwrite unmet-but-covered（baseline ceiling） | 6.1.0 ab k=10 |
| tdd | +0.63 CI[0.41, 0.86] | P7 ab |
| finishing | +0.54 CI[0.46, 0.62] | P7 ab（P4 +0.58 同量級） |
| code-review | two-axis +0.40；range-fidelity +0.27 non-reg PASS；answering-feedback +0.05 分數面過 | P7 ab ×3 |
| executing | +0.40 CI[0.03, 0.77] | P7 ab k=10 |
| using（router） | +0.36 CI[0.25, 0.47]；另 e2e 矩陣 16/16（P6） | P7 ab（v6.1.0 有較新的 non-regression 覆蓋，見下節） |
| brainstorming | +0.35 CI[0.11, 0.59] | P7 ab（P6 +0.50 同向） |
| sessions | +0.29（吸收 compacting：non-reg 1.00） | P7 ab |
| maintaining-obsidian | +0.28 CI[0.14, 0.42] | P7 ab |
| diagramming-obsidian | +0.23 CI[0.09, 0.38] | P7 ab 合池 |
| learning | +0.25（標記保留；e2e 全鏈路 PASS） | P5，P7 run 池 0.80 佐證 |
| looping | +0.19 CI[0.07, 0.31]；loop e2e PASS | P6 |
| debugging | unmet-but-covered（P7 ceiling ×2；P4 +0.16 歷史） | 存廢建議書 |
| dispatching | unmet-but-covered（ceiling ×3） | 存廢建議書 |
| writing-skills | unmet-but-covered（P7 ceiling ×2，新支無 delta 史） | 存廢建議書 |
| evaluating | unmet-but-covered（P5）；P7 preflight 67% 恢復鑑別力 | 存廢建議書（傾向保留） |

## v6.1.0 — Codex packaging: the router's per-host note (non-regression, instrument-capped)

`skills/core/using/SKILL.md` gained a per-host invocation note during Codex
packaging: the Skill Map's `/<name>` rows are Claude Code's spelling, the same
skill is `arcforge:<name>` on Codex, and — added in this round — that mapping
also covers the handoffs skills write to each other mid-workflow. That is a
**behavioral** edit under `.claude/rules/skills.md` (it changes how the agent is
told to reach a skill), so it needs harness evidence, not a spike note.

**Run.** `eval ab eval-router-skill-selection --k 10`, run id **`20260903-213804`**,
default model, isolated, preflight hash `87dd77d26e724fb5` (PASS, baseline 0/3).

**The threshold, pre-registered before the run, quoted here in full.** It is
reproduced rather than cited because nothing else in the repo can back it: the
pre-registration was written into a git-excluded handoff file and `evals/results/*`
is gitignored, so a reader with only the tree in hand could not otherwise check
what was promised against what shipped. (P7's, by contrast, is tracked in
`docs/plans/v6/progress.md`.)

> **Threshold, fixed before seeing numbers.** This is a **non-regression** claim,
> not an improvement claim. The standing evidence for this row is P7's
> **+0.36 CI[0.25, 0.47]** (`evals/skill-eval-coverage.md`, P7 benchmark table).
> PASS requires both:
>
> 1. the new delta's CI lower bound is **> 0** (the router still beats baseline), and
> 2. the new CI **overlaps** P7's [0.25, 0.47] (the note did not move the row).
>
> A delta lower than +0.36 whose interval still satisfies both is a PASS, and is
> to be read as one — the run is 10 trials against a noisy grader, not a
> re-measurement of the row's effect size. FAIL on either half means the note's
> wording is the suspect: fix the wording and rerun once.

| | trials | avg | pass |
|---|---|---|---|
| baseline | 10 | 0.60 [0.6, 0.6] | 0% |
| treatment | 10 | 0.78 [0.73, 0.83] | 90% |
| **delta** | | **+0.18 CI[0.13, 0.23]** | verdict IMPROVED |

**Verdict: non-regression carried by A5; the pre-registered half-2 test was not
evaluable under this instrument.** Half 1 passes — +0.18 with a CI lower bound of
0.13 > 0. Half 2 does not fail: it was **not reachable by any router behavior in
this run**, so it is recorded as **not evaluable**, neither met nor waived. (The
`IMPROVED` in the table is the harness's label for the delta it computed; it is
not a verdict on the pre-registered gate.) The escalation clause was not taken
either, because the run falsifies the suspect that clause names: the assertion
that died, died in **both** arms, so the note's wording cannot be its cause — and
a reworded rerun would be judged against a criterion this instrument still could
not reach.

**A2 (`[tool_before] Edit:re:test/ < Edit:re:src/`) scored 0 in 20 of 20 trials,
both arms — because a contributor-local output style leaked into every trial.**
A tool tally over this run's transcripts returns `Bash` 38× (treatment) / 32×
(baseline) and **nothing else**: no `Edit`, `Write` or `Read` in either arm. P7's
retained run (`20260815-054518`) tallies `Edit` 10× and `Read` 12–14× in *both*
of its arms. The tools were available in both campaigns; what differed is an
instruction.

**Why that makes half 2 unattainable rather than missed — the arithmetic, off
this run's own pool.** Baseline scored **0.60 in 10 of 10 trials, zero variance**;
treatment scored **0.80 in 9 trials and 0.60 in 1**. With A2 structurally 0 in 20
of 20, a trial's ceiling is 4 of 5 = **0.80**, and baseline was flat at 0.60 in
all ten trials — an observation from this run, not a structural property the way
A2's death is. The largest point estimate any router behavior could have produced
here is therefore exactly **+0.20**; at that ceiling — both arms at zero
variance — the interval is the degenerate **[0.20, 0.20]**. The observed +0.18
CI[0.13, 0.23] is **90% of that maximum attainable delta**.

Half 2 is an *overlap* test, though, so the cap has to hold on the interval's
**upper** bound and not only on the point estimate. It does. The attainable
configurations are exactly *k* trials at the 0.80 ceiling and 10−*k* at 0.60 with
baseline fixed; replaying all eleven through the harness's own `ciForDelta`
(Welch, `scripts/lib/eval-stats.js`) reproduces this run's `[0.13, 0.23]` at
*k*=9 and puts the **maximum upper bound over the whole sweep at 0.23** — at
*k*=9, the configuration that in fact occurred. No arrangement of trials under
this instrument reaches half 2's 0.25 floor, so no interval it could have
produced overlaps [0.25, 0.47]. Half 2 was not a test this run could pass or
fail; it was not identifiable under the instrument that ran.

**Cause established, not inferred.** `runTrial` preserves the real `HOME` (so the
trial can resolve `~/.claude` auth), and the trial-local settings it writes
disable plugins and exclude `CLAUDE.md`/`rules/` — but nothing excludes the
user-global `outputStyle` in `~/.claude/settings.json`. A probe run reproducing
the harness's isolation settings and prompted to quote its own tool-selection
instructions returned, verbatim: *"Do your work through the Bash tool wherever it
can accomplish the job: read files with cat, head, or sed -n … rather than using
the dedicated Read, Edit, or Write tools"* — and stated that this is why it used
`cat` rather than `Read`. The same probe showed a user-level SessionStart hook
reaching the trial as well. So the operator's personal output style is a live
input to every eval trial, in both arms, on any machine that sets one.

That is also the whole of the +0.36 → +0.18 gap. P7's treatment earned the A2
point (4 of 5 trials scored a full 1.0); this run's treatment could not, because
its agents were told to prefer heredocs. The two numbers are two instruments, not
two readings of one, and **P7's interval is not a valid comparison target for
this run's**. The half-2 test is unattainable here, not retired by choice: the
arithmetic above fixes its maximum at +0.20 before any router behavior is
observed.

**What carries the non-regression claim: A5.** A5 is the model-graded read of the
same behavior A2 chases mechanically, and is unaffected by tool choice. It
reproduces P7 exactly:

| | A5 baseline | A5 treatment |
|---|---|---|
| P7 (`20260815-054518`, k=5) | 0/5 | 5/5 |
| this run (`20260903-213804`, k=10) | 0/10 | 10/10 |

Full separation in both campaigns. A4 (the routing judgment itself) is 10/10 in
both arms, read off the same per-arm vector as the A5 row (below) — at ceiling in
this run, so what this scenario measures is the test-first discipline the routing
selects rather than the routing statement in isolation. **The one adverse movement between arms is A1**, the `npm test`
matcher: baseline 10/10, treatment 9/10, lost by treatment trial 3 alone (0.6),
which still passed A5. One trial in ten against a matcher orthogonal to routing
is not a regression signal, but it is not "nothing moved" either.

**How this run's A4 and A5 rows are established — read, not derived.** Both arms
retain a per-trial `assertionScores` vector in the run's own `baseline.jsonl` /
`treatment.jsonl`, alongside the grader's per-assertion `evidence`. The vectors
are `[A1…A5]` in the scenario's declared assertion order: baseline is
`[1, 0, 1, 1, 0]` in all ten trials; treatment is `[1, 0, 1, 1, 1]` in nine and
`[0, 0, 1, 1, 1]` in trial 3. Baseline A5 = 0/10 and baseline A4 = 10/10 are
therefore **readings**, not inferences off the 0.60 average. The narrative files
under `grading/` are treatment-only in this pool, but what they carry is the
grader's discovered claims rather than the vector, so their absence costs the
baseline arm a narrative and not a score. The retained baseline A4 evidence reads
*"no merge, push, PR, or branch deletion … not a menu of completion options"*,
and an independent scan of all ten baseline transcripts for those same signals
returns zero hits.

On the four live assertions the arms read 0.75 vs 0.975 (**+0.225**). That is a
descriptive statistic on a 4-assertion scale with no interval computed for it; it
is **not comparable to P7's +0.36 CI[0.25, 0.47]**, computed on the 5-assertion
scale, and is not offered as an overlap argument.

**Findings for the maintainer, neither fixed here.**
1. **The isolation gap is the important one.** `buildIsolationSettings()` covers
   plugins and `CLAUDE.md`, not `outputStyle` or user-level hooks, while `HOME`
   stays real by design. Any contributor with a personal output style silently
   changes what every trial does, in both arms — so tool-keyed assertions can die
   and cross-campaign benchmark comparisons can read instrument change as
   behavior change. This run is the existence proof.
2. A2 is dead under that condition. Repairing it (matching file creation through
   `Bash` heredocs, or leaning on A5, which read the ordering correctly in all 20
   trials) changes the scenario hash, voids the preflight record and needs a
   `## Version` bump — a scenario-design decision outside a packaging PR's scope.
   Every `[tool_before]`/`[tool_called]` assertion keyed to `Edit`, `Write` or
   `Read` across the corpus is exposed to the same cause. Until (1) is closed,
   read this row's raw delta as instrument-capped.

### Codex-side coverage: pre-registered as UNMEASURED

Whether a Codex agent follows a `/<name>` handoff after reading that mapping is
**not measured, and no number above speaks to it.** The harness spawns `claude`
and has no Codex runner; that is the `harness-neutral-model-runner` Backlog wish,
and `product/specs/codex-harness.md` B-6 carries the same statement as a
residual. The evidence on record for the note is Claude-side non-regression
only. This gap closes when a harness can reach that host, not before.

以下為歷史量測紀錄（P5/P6 逐 campaign 原帳，保留不改；其中引用的部分 scenario
名與路徑為當時現狀）。

## v6.1.0 — `speccing`

兩支 scenario，兩個不同結局；兩者都留在語料庫（覆蓋規則要求每支 core skill ≥1 支
現役 scenario）。

| scenario | Version | preflight | A/B (k=10) | 結論 |
|---|---|---|---|---|
| `eval-speccing-spec-before-code` | 2 | PASS（baseline 0%） | baseline avg 0.33 / pass 0%；treatment avg 1.00 / pass 100% | **+0.67 CI[0.67, 0.67] IMPROVED** |
| `eval-speccing-supersede-not-overwrite` | 7 | **BLOCK（baseline 100%, k=3；以 Version 3 文本量測）** | 未執行 | **unmet-but-covered（baseline ceiling）** |

預登記門檻：delta > 0 且 CI 下界 ≥ 0，k=10。前者達標，後者依其 Design Notes 內
預登記的 fallback 出貨。

`supersede-not-overwrite` 的 BLOCK 來自
`evals/preflight/f759c2828746652f-default.json`，而 `computeScenarioHash`
（`scripts/lib/eval-preflight.js:43`）雜湊的是整份 scenario 檔，該 hash 對應的是
Version 3 的文本。現行（Version 7）文本則沒有任何一筆對應的 preflight 記錄——查證
方式是對 scenario 檔重算 `computeScenarioHash`，再看 `evals/preflight/` 有沒有同名
檔案。此處刻意不寫下那個雜湊值：任何寫進本檔的「現行文本雜湊」，都會被下一次對
scenario 檔的編輯作廢（同一個 commit 內的編輯也算），因此 literal hash 只留在指向
歷史文本的位置。該 scenario 的 `## Preflight` 為 `run`，因此再跑 `eval ab` 會重新
量測 preflight，不會沿用這筆 BLOCK。Version 4–7 的 grader 從未評過任何 trial——詳見
下方 Version 7 段落末的殘留未檢項。

### `spec-before-code`：+0.67，兩臂皆為確定性

Prompt 明說「別花時間在 product docs，發版後我再補」。baseline 10/10 全部照辦：
A5（CSV 功能落地）與 A6（roadmap 位置標記完好）過，A1–A4（spec 行為項、roadmap
row、decision entry、backlog wish 移除）全滅，10 trial 分數全為 0.33，變異數為 0。
treatment 10/10 全為 1.00，同樣零變異——技能把「帳本與程式碼同一次變更」變成不可
談判項，且 trial 自己會說明為何逆使用者指示：

> "Spec went first, against your instruction, because the repo's speccing rule
> says spec and code merge in the same PR. It took three small edits and is easy
> to drop: `git checkout product/`."

成本旗標：output tokens 4438 → 9362（COST REGRESSION）。這是四個帳本檔案的實際
編輯成本，非空轉；記錄在案，不視為阻斷。

**本池的來歷——哪一次 k=10。** Version 2 的文本跑過兩次 k=10 A/B，上面發表的是
第二次：2026-09-03T00:37Z 那一次，其 preflight 記錄即
`evals/preflight/afb5f3da7d729aca-default.json`（時間戳 00:37:00.971Z）。第一次
是 2026-09-02T17:10Z，scenario 文本相同（preflight hash 同為
`afb5f3da7d729aca`），但 treatment 臂自第 4 筆起被 session limit 打斷：4–10 這
7 筆 A1–A5 全滅、只有 fixture 自帶的 A6 過（0.17 分），該臂 output token 平均
3238，對照發表那次的 9362。這與下方 `supersede-not-overwrite` 的 Version-2 池是
同一起 session limit——兩次執行相隔兩分鐘、汙染特徵相同（refusal、零產出、只有
fixture 自身檔案讓部分 assertion 過）；「同一起」是由時間相鄰與特徵推得，不是另
有記錄。處理方式與那邊不同：那邊逐筆剔除，這邊**整次作廢**，兩臂一起丟——排除因此
是對稱的，且依據是原因（基礎設施）而非分數。這件事記在這裡，是因為作廢那次的
verdict 是 INCONCLUSIVE（+0.10）、重跑後是 IMPROVED，而「看到分數再決定丟不丟」
正是本檔評分規則要防的事；該次的作廢理由在分數之外可獨立查核（7 筆零產出）。兩次
之間 git 沒有任何 commit 動過 `skills/core/speccing/SKILL.md`（30ec80e 作者時間
2026-09-02T16:42:45Z，下一筆 fce82ac 在 2026-09-03T06:03:28Z），所以兩次跑的是同
一份技能文本，差別在那 7 筆空轉。兩次的 run 目錄都已不存在（`evals/results/*` 在
.gitignore 內）。

review round 1 把 A3 的 id 判準從「不屬於 fixture 寫下的四個 id」改為
`int(i) > 4`，以符合該 assertion 自己的措辭「an id beyond D-004」。對 `000`–`999`
逐一比對，兩個判準的差集恰為 `{"000"}`——唯一會改判的 id。收緊對本池的影響，與
A2 的各處收緊合併在下面一次處理。未重評任何 trial，未動用 trial 額度。

同一輪 review 也把 A2 的版本判準從「不屬於 fixture 那三列」改為與 `0.3.0` 數值
比較（`any(... > (0, 3, 0))`），理由同樣是該 assertion 自己的後半句「不讓 roadmap
落後程式一個版本」——一個 `0.0.1` 的過期列在舊判準下可拿滿分（以出貨中的 grader
實測，A1–A6 全 PASS、exit 0）。與 A3 不同，這裡的差集不是單一元素而是無界的
（所有低於 `0.3.0` 且非既有三列的版本）。

同一輪 review 的第三處收緊把 A2 的推進列綁到 CSV 這件事本身。數值比較看不出那一
列記的是哪件事，只加一列 `| 0.4.0 | — | run diff | next | ... |`、把 CSV 的
decision 與 behavior item 寫在別處、程式也確實出貨，在只有數值比較的 grader 下即
可拿到 A1–A6 全 PASS、exit 0（已實測），而那份 roadmap 上 CSV 根本沒有里程碑——
這正是該 assertion 後半句要擋的情況。收緊後改以整列比對，Milestone 與 What & why
兩格都算；以十份合成 roadmap 實測，恰有兩例由 PASS 轉 FAIL——一是上述的 `run diff`
列，二是代價：一列寫成 `spreadsheet export`、整列不含 `csv` 字樣者也會 FAIL，此為
已接受的 false negative，記在該 scenario 的 Design Notes。其餘八例判定不變。未重評
任何 trial，未動用 trial 額度。

review round 2 的第四處收緊把 A2 的「列」綁到 version 表格本身。前三處收緊都跑在
整份 ROADMAP.md 的文字上：`row_re` 會吃下檔案裡任何以 `|` 開頭的行，因此只要在
`## Decision Log` 之後補一行 `| 0.4.0 | CSV |`（兩格、不屬於任何表格、roadmap 上
CSV 沒有任何里程碑），在出貨中的 grader 下即可拿到 A1–A6 全 PASS、exit 0（已實測）。
收緊後改由 `version_table()` 把掃描範圍縮到「自 `| Version |` 表頭起算、連續的
pipe 行」——錨在表頭而非 `## Roadmap` 標題，因為 fixture 根本沒有那個標題（表格直接
接在 H1 底下，錨在標題會一列都對不到、把每筆 trial 都判 FAIL）；也不設格數下限，
五格（省略 Spec）或七格（多一欄）的正常列仍算數，因為 treatment 臂的 false negative
會壓低量測到的 delta，比不合理的 false positive 更貴。以十四份合成 roadmap 實測：
原本那十份判定全不變，新增四例全部由 PASS 轉 FAIL（Decision Log 之後的兩格行、同一
行改寫在 log 之前、三格的 `| 0.4.0 | CSV export | shipped |`、寫在 decision 內文裡
的 `| Version | Change |` 迷你表）。已接受的 false negative 有三個，都已實測並記在
該 scenario 的 Design Notes：改掉 `Version` 表頭名稱者 FAIL、把新列另起一張
`| Version |` 表格者 FAIL（第一個表頭優先）、新列與表格之間空一行者 FAIL（這第三個
與「擋掉 log 之前那行」是同一條連續性規則的兩面，且空行隔開本來就會 render 成另一
張表）。未重評任何 trial，未動用 trial 額度。

第五處收緊把 A3 的 decision entry 綁到 `## Decision Log` 本身。A3 的 block loop
與前四處一樣跑在整份 ROADMAP.md 的文字上：在檔尾另起一個 `## Appendix`、底下寫一個
提到 CSV 的 `### D-005` 區塊——或把同一個區塊寫在 `## Decision Log` 標題之前——在
出貨中的 grader 下即可拿到 A1–A6 全 PASS、exit 0（已實測），而 log 本身一字未增，
該 assertion 要查的 append-only 歷史是被繞過而非被追加。收緊後改由 `decision_log()`
把掃描範圍縮到「自 `## Decision Log` 標題起算、到下一個 `#` 或 `##` 標題為止」的
區段——與 `version_table()` 同一形狀、同一理由；`###` 是三級標題，不會提前關閉區段。
以五份合成 roadmap 實測（放置位置的案例；id 的判準案例是上面那六份）：追加在 log
內的那份仍 PASS，另四份全部由 PASS 轉 FAIL（寫在 `## Appendix` 底下、寫在 log 標題
之前、寫在檔尾另一個 `## Decision Log` 底下、log 標題被改名為 `## Decisions`）。
已接受的 false negative 有兩個，都已實測並記在該 scenario 的 Design Notes：改掉標題
名稱者 FAIL、把新項另起第二個 `## Decision Log` 者 FAIL（第一個標題優先，且 fixture
的 log 一路到檔尾，要碰到這個案例得刻意在 D-004 內文後面另寫一個重複標題）。上面
那六份 id 案例在錨定之下判定全不變。未重評任何 trial，未動用 trial 額度。

本輪 review 檢視 A3 的**極性**後決定**不收緊**，並把它記為 A3 的第二項不檢事項。
A3 只問 entry 內文有沒有 `csv`，不問那筆 decision 記的是採納還是不採納：在
Decision Log 內追加一個 `### D-005`、`Status: Rejected`、
`Decision: CSV export was not picked up and remains unsupported`，而 roadmap 的
version 表格已有 CSV 推進列，在出貨中的 Version-2 grader 下即可拿到 A1–A6 全
PASS、exit 0（已實測）。不收緊的理由如下，都可獨立查核。其一，這筆否認換不到
任何東西：assertion 那句「recording the CSV export being picked up」是由六條的
連言承擔，不是 A3 一條；A3 在連言裡的職責是破折號之後那句——log 是被追加而非被
繞過。與 `supersede-not-overwrite` 的 A3 是該關係的唯一證人不同，這裡 A1、
A2、A4、A5 各自獨立見證同一件事——要走到那個全 PASS，trial 得先寫出指名 CSV 的
推進列、劃掉 backlog wish、補上 behavior item 並出貨 CSV 分支，得到的是一份自相
矛盾的 roadmap；baseline 臂 A1–A4 全滅，根本走不到這個案例。其二，「肯定的採納」
在真實 trial 的語言裡沒有錨點：留存且有寫 decision entry 的三筆單條件 trial
（`evals/results/eval-speccing-spec-before-code/20260902-164317/transcripts/`，
非本池的臂）寫的都是**格式**決策（`### D-005 — CSV is RFC 4180, rows only`），
無一出現採納動詞，因此要求肯定動詞會三筆全 FAIL；其 `Status` 分別為 `Proposed`
（trial-1）與 `Accepted`（trial-2、3），改鎖 `Status: Accepted` 則會 FAIL 一筆。
上述兩種判準都是 treatment 臂的 false negative，而本節既有的取捨是：treatment 臂的
false negative 會壓低量測到的 delta，比不合理的 false positive 更貴。三筆共有的
`- Version: 0.4.0` 也分不開兩者——上面那個實測的全 PASS 同樣帶著它。

其三，還有一個比上述兩者都窄的候選，而且正是上面那個實測案例自己招來的：不是要求
肯定動詞，而是**排除** `Status:` 記著否決的 entry（`Rejected`、`Declined`）。它確實
關得掉上面那個案例，而且與前兩者不同，對三筆留存 trial 毫無代價（`Proposed`、
`Accepted`、`Accepted` 都通過），並不是 treatment 臂的 false negative——因此不能用
「太貴」打發，得說清楚為什麼仍然不收。不收的理由是：黑名單關掉的是**寫法**，不是
漏洞。A3 根本不讀 `Status` 欄：同一筆只把 `Status:` 改成 `Accepted`、`Decision:` 維持
`CSV export was not picked up and remains unsupported`，同樣拿到
`A1:PASS A2:PASS A3:PASS A4:PASS A5:PASS A6:PASS`、exit 0（與上面那個案例在同一份
trial 樹上實測，只變動 D-005 那兩行），任何寫在 `Decision:`／`Why:` 散文裡的否決都
照樣穿過。token 清單也只能
用猜的：`Rejected` 與 `Declined` 在 `product/` 與 `skills/core/speccing/` 底下都不
存在，C3 對被翻轉 entry 的封閉 status 詞彙（`product/AGENTS.md:194-196`）是
`Accepted` / `Proposed` / `Superseded-by: D-NNN` / `partially superseded by D-NNN`，
根本沒有否定側可擋，fixture 四筆也全是 `Status: Accepted`——上面那個實測案例是自己
造了一個 `Rejected`，黑名單才有東西可比對。而「這筆否認換不到任何東西」那條理由對
它同樣成立。

grader 未動，`## Version` 維持 2，未重評任何 trial，未動用 trial 額度。

歷次收緊之後 `## Version` 仍維持 2，依據是**本池的逐條紀錄**（即本節開頭那兩行），
不是任何 transcript：

- **baseline 臂已定。** 10 筆全為 0.33、A1–A4 全滅；A2 與 A3 都在 A1–A4 之內，
  因此在舊判準下已是 10/10 全滅，而收緊只會讓過的變不過，不可能把不過的拉成過。
  兩種讀法下 baseline 臂都是 0.33 / 0%。
- **treatment 臂有界，非已觀察。** 10 筆全為 1.00，代表舊判準下 A2、A3 皆過。各處
  收緊只動到這兩條（列綁定與表格錨定落在 A2 之內、log 錨定落在 A3 之內，可掉的
  assertion 仍是 {A2, A3}），其餘 assertion 不受影響，因此若以出貨判準重評這個池——實際上重評不了，見下——
  一筆 treatment trial 只會是 1.00、掉一項的 0.83、或兩項都掉的 0.67。差值因而落在
  **+0.33** 與已量測的 +0.67 之間；baseline 臂變異數為 0、treatment 值全部落在
  [0.67, 1.00]，該區間內的任何信賴區間都碰不到 0。

整個區間內判定都是 IMPROVED：本 scenario 的 `## Verdict Policy` 是 `delta`，只讀
分數差的信賴區間（`verdictFromDeltaCI`，`scripts/lib/eval-stats.js:382`）。真正會
被重評動到的是**通過率**——`Grader: code` 要六條 assertion 全為 1.0 才算 pass，因此
掉了 A2 或 A3 的 treatment trial 分數仍有 0.83、但不再 pass——而通過率不是判定所讀
的數字。兩種讀法因此不會把這個池切成兩次實驗，沒有需要分離的池。已量測的結果不因此
改寫，仍以量測值陳述：**+0.67 CI[0.67, 0.67]，k=10，treatment pass 100%**。

**不宣稱的部分。** 不宣稱出貨判準能原樣重現 +0.67——那要看 treatment 臂寫下的版本
列與 decision id，而這個池已無法重讀：`evals/results/` 在 .gitignore 內，該次 run
目錄已不存在。`evals/results/eval-speccing-spec-before-code/` 底下留存的
transcript **不是這個池的臂**：`20260902-164317/` 與 `20260902-170634/` 兩個目錄
裡都是 `trial-N.txt`，而 `saveTranscript` 只在單條件執行時寫這個檔名
（`condition === 'results'`，`scripts/lib/eval.js:314`）；A/B 的臂寫成
`baseline-trial-N.txt` / `treatment-trial-N.txt`，全樹搜尋不存在任何一份。這兩個
目錄名對得上兩次 k=3 preflight 的起始時間，但那是時間相鄰，不是檔名本身的保證。
未重評任何 trial，未動用 trial 額度。

### `supersede-not-overwrite`：baseline 天花板，儀器修正後確認

Version 1（無結構壓力）與 Version 2（加入「精簡日誌、丟掉過期條目、重新編號補齊
缺口」的陷阱）都測不出 delta。關鍵在於 **Version 2 的 REGRESSED 判定是假的**：

- treatment 臂 10/10 trial 回傳 "You've hit your session limit"、0 token，被 runner
  當成真 trial 計分（fixture 自身檔案就足以讓部分 assertion 過）。該臂已刪除。
- baseline 臂另有 2 筆（trial 9、10）被同一道汙染閘門攔下，已連同 transcript 刪除。
  本檔是這個池的 provenance 唯一記載處：那 2 筆已不存在，本 PR 的任何文件都不對
  它們作行為陳述；run log 印出的臂層數字（avg 0.85 / pass 50%）分母含那 2 筆，依
  本檔評分規則「error trial（infra/grade）不入分母」不予採用。**留存池** =
  `20260902-171249/baseline.jsonl` 的 8 筆有效 trial，**avg 0.906 / pass 62.5%**。
- 留存池的失敗全部是 grader 的字面比對，不是行為：trial 1／4 把
  `supersedes D-005` 寫在 `Decision:`／`Status:` 句中而非 `Supersedes:` 欄位；
  trial 7 把回指寫進標題 `### D-005 — Upload storage backend (superseded by D-008)`。
  8 筆全部明確拒絕重新編號，並說明理由：

> "Renumbering would break the spec's D-references and make 'D-005' mean
> different things in old commits versus the log, which is the exact confusion
> you want to avoid."

Version 3 只修 grader（A2 由標題全等改為包含；A3 接受任何把 supersede 與 id 並置的
寫法——欄位、`Decision:` 句中、標題註記——而非單一字面 token），claim／prompt／
fixture／四條 assertion 不動——是儀器修正，不是第三次改版（改版預算 1/1 已在
Version 2 用完）。該次修正以 8 個合成案例離線驗證：三種正確寫法皆 4/4；就地改寫
D-005、丟 D-005 後重編號、以及「丟 D-003 後重編號使七個 id 各出現一次」皆在該當的
assertion 上 FAIL；只提 id 而無 supersede 字樣不算過。

以 Version 3 grader 對留存池的 **8/8 全過**是**預登記的預測，不是執行過的重評**
——trial 1／4 的 A3 與 trial 7 的 A2 會各自翻正，其餘 5 筆本就滿分。該 scenario 的
Design Notes 也是這樣寫的（"What that predicts, pre-registered"），兩處一致。引擎
並沒有 regrade／rescore 子命令（`arcforge eval` 只有 run／preflight／lint／ab／
compare／report／history／audit／dashboard），這個數字是依 baseline.jsonl 當時記錄
的逐筆失敗原因推出來的，沒有真的重跑過 grader；如今池目錄已不存在，也無從補做。

實際執行過的只有一次取樣：Version 3 全新 preflight，**BLOCK, baseline pass 100%
(k=3)**。因此**不能**把預測與這次取樣合計成「11/11 兩次獨立取樣」——預測不是樣本，
本檔不再作此宣稱。

**Version 4（第二次儀器修正，review round 發現）**：Version 3 的 A3 接受兩個方向的
supersede 字樣，那不是寬鬆而是假過關路徑——附加 D-008 寫 `Status: Superseded by
D-005`、並在 D-005 註記 `This entry supersedes D-008`（關係完全顛倒、D-005 仍治理
中）在 Version 3 下得 A1–A4 全 PASS。Version 4 保留拼寫寬鬆度，但鎖定方向：新條目
必須說自己 *supersedes* D-005（`by` 讀法移除），D-005 的回指必須指出新條目是取代它
的那一筆（被動的 `Superseded by D-008`、標題註記、`Superseded — see D-008` 皆可），
而不是被 D-005 取代的那一筆。以 **11 個**合成 roadmap 離線對照舊／新 grader：四種
正確寫法（含 trial 7 的標題註記與最寬鬆的 `Superseded — see D-008`）新舊皆 4/4；
完全顛倒、僅回指顛倒、僅新條目顛倒三例由 4/4 翻為 A3 FAIL；上述 A1／A2／A3 負例
不動。對照表列在該 scenario 的 Design Notes。

留存池**無法重評，也不只是「不重評」**：`evals/results/` 在 .gitignore 內，而 k=10 的
池目錄 `20260902-171249/` 本身已不存在。A/B 臂的 transcript 命名為
`baseline-trial-N.txt`（`scripts/lib/eval.js:314`），全樹搜尋不存在任何一份，因此那
8 筆的 transcript 一份都調不出來。**現存的六份不是留存池的子集**，而是兩次 k=3
單條件 preflight 的 transcript：`20260902-164317/transcripts/trial-1..3.txt`（Version 1
文本，hash `e5062598f5e496e7` 與首版 commit 相符，preflight 記錄 16:47:30Z、pass 0%）
與 `20260902-170634/transcripts/trial-1..3.txt`（preflight 記錄
`475a8b46b6060f86`，17:12:49Z、pass 33%；該文本未曾以此形態 commit，歸屬 Version 2
的依據是時間戳緊接 `20260902-171249` 這次 A/B，且三份 transcript 都出現重新編號的
語句——前三份則一次都沒有）。以下凡稱「六份 preflight transcript」者，指的都是這六
份，與留存池的 8 筆是不同母體。

「preflight」這個歸屬本身是推論，不是檔名保證：`saveTranscript` 對**任何**單條件
執行都寫成 `trial-N.txt`（`scripts/lib/eval.js` 的 `condition === 'results'`
分支），一次普通的 `arcforge eval run` 產出的檔案與 preflight 的無從分辨。歸屬依據
是時間戳相鄰，加上第一組的文本比對——而 `e5062598f5e496e7` 只證明那次跑的是哪一份
文本，不證明那次執行是 preflight。這不影響下面任何一項以這六份為證的陳述：它們談的
是 transcript 的內容，不是它的來源。

可據這六份支持的較窄陳述是：新條目的正向句一律主動語態（`Supersedes: D-005`、
`supersedes D-005 (Blobstash)`），六份皆有，且無一份出現反向的 `superseded by
D-005`；D-005 的回指一律是被動的 `Status: Superseded by D-008` 行，**無一使用本次移
除的過關路徑**。（Version 2 留存池裡 trial 7 的標題註記
`### D-005 — Upload storage backend (superseded by D-008)` 是**當時**的紀錄，不在這六
份之內——六份沒有任何一份把回指寫進標題。）因此 unmet-but-covered 結論是**沿用**
（Version 2 留存池 + Version 3 preflight），不是重新量測；未花任何 trial 額度。

**Version 5（第三次儀器修正，再一次 review round 發現）**：Version 4 鎖定了方向，
但沒有鎖定極性——一筆在兩側都**否認**該關係的紀錄（附加條目的 `Decision:` 寫
`D-008 does not supersede D-005`、D-005 註記 `This entry was not superseded by
D-008`），在原始條目完好、spec 已改為 Vaultbox 的情況下仍得 A1–A4 全 PASS。
Version 5 保留拼寫寬鬆度與方向約束，另加極性守衛：直接支配 supersede 動詞的否定詞
即視為否認該主張，正向句與回指兩處同時檢查——兩個呼叫點都不可省，僅回指否認只有
`points_back` 攔得到，僅附加條目否認只有正向 comprehension 攔得到。以 **14 個**
合成 roadmap 離線對照舊／新 grader：四種正確寫法與四個既有負例皆不動，三個方向顛倒
的案例維持 A3 FAIL，只有三個否認案例由 4/4 翻為 A3 FAIL。守衛刻意窄化為同一行內
與動詞相鄰的否定詞，不是通用的極性剖析器：`Status: No longer current — superseded
by D-008` 與 `this does not change D-006, but supersedes D-005` 兩種合法寫法皆經
驗證仍為 4/4。留存池同樣**無法重評**（收緊只會移除過關路徑，而六份 preflight
transcript 無一使用被移除的路徑），**未花任何 trial 額度**，unmet-but-covered 結論
沿用。

**Version 6（第四次儀器修正，第三個 review round 發現）**：A1 的摘要比對掃的是整份
檔案的相鄰行對，問的是「原文還在不在這個檔案裡」，不是「還在不在 D-005 裡」。一筆
把 D-005 的 `Decision:`／`Why:` 就地改寫成 Vaultbox、再把原文抄到別處的紀錄——日誌
後的附錄、附加條目內的「previously D-005 recorded」段落、或一個標題為 `Upload
storage backend (historical)` 的誘餌條目——在附帶合法 D-008 supersession、spec 已改
為 Vaultbox 的情況下仍得 A1–A4 全 PASS：本 scenario 存在的理由（就地覆寫）被判滿分。
Version 6 把摘要綁到 D-005 自己的條目上，並以**標題**、且**只在原始 id 範圍內**定位
該條目——以標題而非 id 定位正是原本全檔掃描要保住的性質：丟掉別的條目並重編號時，
D-005 的原文會落在新 id 底下，該案仍 A1 PASS／A2 FAIL，重編號由 A2 判。限制在
fixture 寫過的七個 id 內，則是同一版初稿（取檔案順序第一個標題相符者）漏掉的另一半：
六份 preflight transcript 的新條目標題全是 `Upload storage backend moves to
Vaultbox`（4 份）／`... is Vaultbox`（2 份），都含 D-005 的原標題，因此
檔案順序第一個相符者在真實 trial 裡不等於 D-005——誘餌條目放在 D-005 之上
就能頂替（覆寫仍得 4/4），而把新條目插在日誌最前面的 **正確** trial 反而
A1 FAIL。忽略 fixture 沒寫過的 id 同時修掉兩邊，並保住標題錨點本來要的重編號
容忍度——丟掉別的條目、其餘條目重編號時，D-005 的原文會落在 001–007 內較
小的 id 上。以 **21 個**合成 roadmap 離線對照：原有 14 列全部不動，三個抄存案例由
4/4 翻為 A1 FAIL，「丟條目、重編號但原文完好」案例新舊皆 A1 PASS／A2 FAIL；這次修正
移動三列——誘餌置頂、正確但新條目置頂，以及「丟條目」的鏡像（在 D-005 之前插入三筆條
目），最後這列的 A1 在修正前是靠 fixture 沒寫過的 id 底下的 D-005 原文而 PASS。守衛
的讓步（比照 Version 4、5）：摘要綁到條目而非條目內的位置，把原文與改寫後的行並存於
D-005 的寫法不被區分；錨點排除的是非原始 id，不是不相符的標題——沿用 `D-005` 本身 id
的誘餌、或把另一個原始條目改標題成含該詞的誘餌，都仍能過 A1，由 A2（重複 id／id 不再
領原條目）擋下，兩者都拿不到滿分；重編號容忍度也只保住單向——在 D-005 之前**插入**條
目會把它的原文推到 D-007 之後、原始 id 範圍之外，該案 A1 直接 FAIL 而非交給 A2 判，
同樣不影響任何滿分（A2、A3 新舊皆 FAIL），六份 preflight transcript 也無一筆這樣做。

**未花任何 trial 額度**，但要說清楚這句話能保證什麼。已登記的 8 筆分數**無從重評**
（池目錄已不存在），所以「無一筆分數改變」不是一句能成立的陳述，本檔不再作此宣稱。
能查證的是六份 preflight transcript：每一份對 D-005 的編輯都是逐字 old→new 取代，
且 D-005 條目內的 `Decision:`／`Why:` 兩行取代前後**逐位元不變**——三份
的變動區段只到 `Status:` 行，另三份把 `Decision:` 行一併納入區段，但新
舊兩側該行完全相同；六份都沒有出現任何改寫過的 `Why:` 行。新條目一律接
在 D-007 之後（四份以 D-007 的 `Why:` 行為錨點，一份直接 append 到檔尾，一份先
assert 檔案結尾正是 D-007 的 `Why:` 行再接上）。也就是說，六份都沒有走 Version 6
移除的那條路徑。

**Version 7（第五次儀器修正，第四個 review round 發現）**：餵給 A1 與 A3 的條目切
塊掃的是整份 `ROADMAP.md`，問的是「這個 `### D-NNN` 條目在不在檔案裡」，不是「在不
在 Decision Log 裡」。由此產生四條過關路徑，Version 6 下全部量到 4/4：新條目被停在
附加的 `## Appendix` 下、放在 `## Decision Log` 標題之上、停在檔尾第二個
`## Decision Log` 下——以及最貼近真實行為的一種，**把 D-005 自己的條目搬出日誌**移進
附錄，同時正常附加 D-008。最後這種正是 prompt 施壓的方向：「drop the entries that no
longer describe the product」讓「歸檔而非刪除」成為看起來合規的動作，而它被搬出的那
份日誌，正是本方法賴以只增不改的產物。Version 7 把掃描範圍收到「從
`## Decision Log` 標題起、到下一個 `#` 或 `##` 止」的段落——`###` 條目標題是第三層、
不會終止該段——因此 A1 與 A3 判的是日誌的內容，而非檔案的內容。

收斂是有範圍的，這條界線值得寫下來：**A1、A2、A3 判日誌，重複 id 掃描與 `ids` 維持
全檔**。`ids` 維持全檔是因為它負擔得起：附錄裡的 `D-008` 會進 `new_ids`，但切塊是空
的，永遠到不了 `supersedes`。重複 id 掃描維持全檔，是因為 Version 6 正是靠這一半擋
下「沿用 `D-005` 本身 id 的誘餌」——誘餌停在哪裡都必須算重複。兩半可以拆開，而這正是
本版初稿沒有量過的事：只把**標題對照表**收到日誌內，該誘餌在附錄與在日誌內一樣照舊
A2 FAIL；一併把重複掃描也收進日誌，才會把 Version 6 關掉的洞重新打開。初稿把兩者當
成一體，代價見下方 `V7 pre/post (log scope)`。

讓步比孿生 scenario（`eval-speccing-spec-before-code`，其 A3 早一個 commit 做了同樣
的收斂）更大，且明講而非藏起來：因為 `blocks` **同時**餵 A1 與 A3，日誌被改名成
`## Decisions`、或整份沒有 `## Decision Log` 標題時，現在會**同時**損失 A1 與 A3，
孿生 scenario 只賠上 A3。兩列都在對照表裡。理由是：prompt 從未要求改名；fixture 的
標題正是 trial 正在編輯的對象；六份留存 transcript 無一改名——唯一碰到該標題的
（`20260902-170634/trial-1.txt`）是把它當作取代錨點**重用**，反而是保留的證據。沒有
`## Decision Log` 標題的 roadmap 會照常吐四個 FAIL 標籤而非拋例外，這一點是量到的、
不是假設的。

同一輪還修掉 A3 的第二條路徑：`new_ids` 原本是「不在 fixture 那七個 id 裡」的集合差，
因此任何 001–007 以外的三位數 id 都算「附加」，包括 `D-000`。把 D-005 翻成
`Superseded by D-000`、再附加一筆其餘完全合規的 `### D-000`，Version 6 下得 A1–A4 全
PASS——一份被打成非單調的日誌拿到滿分，而技能的規則是以**下一個未用的 id** 附加。
`D-000` 就是全部的可達面：`heading_re` 只抓 `D-(\d{3})`，`D-0`、`D-005a`、`D-0000`
根本不會被登錄為條目，001–007 又都是原始 id。修正後要求新 id 必須超過日誌最後一個原
始 id，比照孿生 scenario A3 早兩個 commit 採用的 `LAST_FIXTURE_ID`——那份 scenario 的
文本明說「下一個未用 id 的衛生由本 scenario 負責」，因此分支原本是一邊把規則轉介過
來、一邊對違反它的紀錄發滿分。刻意不做的是更強的版本：守衛買到的是「超過 D-007」而
非「下一個未用的 id」；技能第 4 步本來就可能在 supersede 之前先記一筆決策，所以
D-009、甚至 D-020 都可能是對的，A3 不量測 id 是否無缺口。

同一輪的第三項修正落在 A4：原本是 `"vaultbox" in spec_text.lower()`，而 assertion 承
諾的是「spec 不再承諾產品已不再使用的後端」。子字串買不到那道底線。Version 6 下量到：
roadmap supersede 完全正確、spec 卻只在 `## Decisions` 清單加一行
`- **D-008** — the storage backend is Vaultbox.`、`- **B-4 Uploads are stored in
Blobstash.**` 原封不動，仍得 4/4；把 `Vaultbox is not the backend yet.` 加在檔案任何
位置也一樣（reviewer 自己舉的例）。修正後 A4 只讀 `## Behavior` 段，每個項目取一條
**claim line**——從 `B-n` token 到 `**`、`. `、空行三者最早者；必須有一條未被否定地
指名 Vaultbox，且不得有任何一條仍說 uploads 存在 Blobstash。以 `B-n` token 而非粗體
區段切分是關鍵且經量測：id 就在粗體引言**之內**，改抓 token 之後的 `**...**` 會抓到
項目本文，並把「在 B-4 本文補一句 Blobstash 已退役」的那份留存 transcript 誤判為
FAIL。

**A4 的兩道視窗在評分前又修了一次（`V7 pre/post`，Version 不動）**：初稿量的是「鄰
近」而非「立場」——`STORES_BLOBSTASH` 只要 `stor` 詞幹與 blobstash 在 40 個非句點字元
內同時出現（任一順序）即命中，`NEG_VAULTBOX` 的後置臂只要 20 字元內出現被否定的動詞
即命中。兩者都不帶極性，也不看子句邊界，因此會把**正確答案**判為 FAIL；而 prompt 本
身寫的是 spec「should not still be promising Blobstash」，正是在邀請作答者點名被淘汰
的廠商。在 roadmap 固定於正確 supersede 的條件下，四種寫法在初稿下實測皆為 A4 FAIL：
`- **B-4 Uploads are stored in Vaultbox, not Blobstash.**`、
`... in Vaultbox (Blobstash retired).`、`- **B-4 Blobstash is replaced by Vaultbox
for upload storage.**`、`... in Vaultbox; the API does not hold a Blobstash
client.`——前三種掉在 Blobstash 那一半，第四種掉在 Vaultbox 那一半（對 *hold* 的否定
跨過分號回頭抵銷了肯定）。修正後兩道視窗都改綁文法關係：`STORES_BLOBSTASH` 要求廠商
是儲存動詞的受詞（`stored … in Blobstash`，中間至多兩個詞）或主詞（`Blobstash
stores`、`Blobstash is the storage backend`，至多三個詞）；`NEG_VAULTBOX` 的後置視窗
連 `,`、`;` 一併關閉，因為已實測的 false pass（"Vaultbox is not the backend yet"）中
間沒有標點，而會被誤傷的正確寫法有。

`## Version` 維持 7：Version 7 grader 從未評過任何 trial，沒有需要隔開的池，且這是修
Version 7 自己這次改動的瑕疵，與 `V6 pre/post` 同型——當時亦未動版號，理由相同。這次
是**放寬**而非收緊，因此「只會移除過關路徑」不能拿來當論據：初稿驗證用的 13 列全部在
修正後的 grader 下逐列重跑、無一移動（四列原本 A4 FAIL 者仍 FAIL，含未動過的 fixture
spec），另補五種 40 字元視窗原本抓得到的「真・Blobstash 承諾」寫法確認收緊臂沒有放
掉，再補三列 `## Behavior` 標題相依的成本列。

四項讓步照例明講：claim line 是引言而非整段本文（引言宣告 Vaultbox、本文自相矛盾者仍
過，與 A1 摘要綁條目而非條目內位置同型）；`STORES_BLOBSTASH` 仍以 `stor` 詞幹為鍵，
寫成「uploads are *kept* in Blobstash」可以繞過那一半，改綁文法關係後再多一種同類漏
網——介系詞落在集合外的「stored *using* Blobstash」（但 Vaultbox 那一半仍須過關，因此
沒有 trial 能只靠 Blobstash 承諾拿到 A4，而 assertion 的用字正是「stored」，述詞與文
字對齊在同一個較窄的主張上）；刪掉 B-4、只在 `## Decisions` 提 Vaultbox 者 A4
FAIL——六份留存 transcript 無一如此；`BEHAVIOR_SEC` 綁的是字面的 `## Behavior` 標題，
改名、加後綴或整段拿掉都會取不到 claim line 而 A4 FAIL——與 A1／A3 對 `## Decision
Log` 的標題相依同型，辯護也相同：prompt 從未要求改名，fixture 的標題正是 trial 要編
輯的對象，六份留存 transcript 全部以字面 old→new 取代就地改 B-4、無一動到任何標題。
四項讓步全部有實測列，包含 `using` 那一種漏網——它是這次放寬**唯一開出**的過關路徑，
列出來才算把清單講完。以 **26 個** spec 變體離線對照（roadmap 固定在正確的 supersede，
因此只有 A4 會動）：初稿驗證的 13 列為九列不動、四列由 4/4 翻為 A4 FAIL，且這 13 列
已在修正後的 grader 下重跑一次、逐列不動，其 `new` 欄即今日出貨 heredoc 的輸出；
`V7 pre/post` 新增 13 列——四列由 A4 FAIL 翻為 4/4（上述四種正確寫法）、一列由 A4 FAIL
翻為 4/4（`stored using Blobstash`，放寬開出的那條路徑）、另八列前後皆 FAIL（五種真承
諾寫法、三種標題形狀）。六份留存 transcript 全數把 B-4 的 claim line 改寫成
`- **B-4 Uploads are stored in Vaultbox.**`，在收緊後與修正後的底線下皆通過。

**未花任何 trial 額度**，也不欠一次。三項收斂都只會移除過關路徑；已登記的池無從重評
（k=10 執行目錄已不存在）；六份留存 transcript 全部重讀過——無一在 `ROADMAP.md` 內寫
入新的 `##` 層級段落，且 `grep -rn "D-000"` 掃過 `evals/results/` 與 `evals/preflight/`
無任何命中，因此無一走被移除的路徑。以 **28 個**合成 roadmap 離線對照：原有 21 列在
本次的新舊 grader 下逐列重跑、無一移動，新增的七列（六個放置位置、一個編號）全部由
4/4 翻為 FAIL；spec 側另有 26 列變體對照，見上。

**`V7 pre/post (log scope)`（Version 7 的收斂，兩端一併補齊；第七個 review round 發
現）**：初稿有兩處邊界寫錯，由同一個探針打出來。其一，A2 的 `title_by_id` 掃的是
`road.split("\n")`，而 `blocks` 掃的是 `decision_log(road)`，於是 A2 問的是「這個 id
在**整份檔案**任一處還領著它被記下的標題嗎」，不是「在日誌裡嗎」。把 D-006 從日誌切
掉、原封不動搬到附加的 `## Appendix` 底下，同時正常附加 D-008 並翻 D-005 的狀態，量到
A1–A4 全 PASS——一份只增不改的歷史掉了一筆已記錄的決策，卻被評為滿分。放在
`## Decision Log` 標題之上、放在檔尾第二個 `## Decision Log` 底下，結果相同。這正是
Version 7 已經替**新條目**關掉的三個放置位置，對每一個原有 id（D-005 除外）卻仍然開
著；而 `product/AGENTS.md` 講得很明白：出現在引言、附錄或檔案其他段落的 `### D-NNN`
標題是散文或舉例，不是條目，也不會被當條目檢查。

其二是段落的收尾邊界。`decision_log()` 以 `^#{1,2}\s`（僅第 1 欄）收尾，而
`product/AGENTS.md` 明訂、`scripts/lib/product-markdown.js` 以 `SECTION_END_RE` 實作
的邊界是縮排一到三格皆算收尾標題——正因為只認第 1 欄會 fail open。把附錄標題縮排兩
格，日誌就一路吃進附錄，停在底下的條目等於沒搬走；連 Version 7 自己的招牌案例（把
D-005 條目搬進 `  ## Appendix`）在修正前也量到 4/4。因此對齊這個邊界是把 Version 7 的
改動做完，不是順手清理。四格是縮排程式碼區塊、不收尾任何段落，該案例維持 4/4——依規
格如此。

本次修正只動收尾邊界。起始標題當時維持 `^\s*##\s+`，理由是跟著引擎收到第 1 欄，會讓
「一份正確作答但 `## Decision Log` 標題恰好縮排」的 roadmap 從 4/4 掉成 FAIL——這個理由
在下方 `V7 pre/post (log open)` 被撤回：依引擎自己的讀法，那種檔案根本沒有日誌，也就沒
有「正確作答」可付出。「只移除過關路徑」對這一組新舊 grader 成立。

`## Version` 維持 **7**，依 `V6 pre/post` 的先例與撐住它的條件：迄今沒有任何 trial 在
Version 4–7 grader 下被評過分，沒有需要隔開的池，而且這個瑕疵就在 Version 7 自己做的
那次改動裡。**未花任何 trial 額度**：以合成 roadmap 在修正前後的 grader 對跑，恰好上
表新增的七列移動、全部朝 FAIL，本次判為正確的四種形狀（含日誌標題縮排兩格者，下方
`V7 pre/post (log open)` 會把它重新歸類）維持 4/4；本輪一併重跑的舊列亦無一移動——
Version 6 的三個誘餌（原文對複製到附錄、`... (historical)` 改名、日誌內第二個
`### D-005`）、兩種重編號形狀、停在附錄的
`### D-008`，以及 A3 的寫法、方向、極性與編號各列。六份留存 transcript 再次全部重讀：無一寫入縮排標
題，也無一寫入任何 `## Appendix` 或 `## Archive` 段落，因此無一走被移除的路徑。

讓步照例明講而非藏起來：四格縮排的 `## Appendix` 維持 4/4，且依規格本應如此（四格
是縮排程式碼區塊，不收尾段落，其 `### D-NNN` 標題在引擎自己的讀法下確實仍在日誌
內）；對 `## Decision Log` 標題的依賴現在連 A2 一起賠上，辯護與 A1、A3 既有的同一套
（prompt 從未要求改名、fixture 的標題正是 trial 在編輯的對象、六份留存 transcript 無
一改名），且不涉及任何滿分，因為改名的日誌本來就已經 A1、A3 FAIL；本 grader 沒有任何
一處辨識程式碼圍欄，而這件事現在賠上兩個掃描而非一個。重複 id 掃描本來就不辨識：寫進
`ROADMAP.md` 的圍欄內 `### D-005` 範例會被算成重複，這是既有性質，本次未動。收尾邊界
本來也不辨識，而本次修正把它**放大**了——一個內容行寫著 `  ## Example section` 的圍
欄區塊，現在會就地終止日誌，寫在它下面的正確作答由 4/4 掉成 `A2、A3 FAIL`；修正前只
有第 1 欄的圍欄內 `##` 有這個效果，而那一個在新舊 grader 兩側都是 `A2、A3 FAIL`。兩者
皆已實測。就邊界本身而言，這也是本 grader 不再貼合它所抄規格的一處：
`scripts/lib/product-markdown.js` 的 `section()` 用的是同一個 ` {0,3}` 邊界，但每一行
都先過 `hiddenTracker`，因此圍欄內的 `##` 在那裡不收尾任何段落。grader 只抄了縮排這一半、沒抄圍欄那一半，是刻意
的——把那個狀態機搬進來，對四條 assertion 而言是過大的儀器，而這個落差永遠只會讓
trial FAIL，不會讓它 PASS。prompt 未要求任何圍欄，六份留存 transcript 也無一在
`ROADMAP.md` 寫入任何圍欄。另外，在下方 `V7 pre/post (log open)` 補上縮排這一維之後，
起始標題仍在「寫法」這一維比引擎鬆：`Decision Log\b` 加 `re.I` 會認
`## Decision Log (historical)` 與 `## decision log`，而
`scripts/lib/product-decisions.js` 的 `DECISION_LOG_HEADING_RE` 是
`/^##\s+Decision Log\s*$/`——大小寫敏感且錨到行尾——因此這兩種寫法在引擎那裡是 C6 會退
掉的空日誌，在 grader 這裡卻讀成完整日誌（加後綴那一種，修正後量到 4/4）。此處只點名、
不收緊：這份寫法容忍度正是上面標題相依那套辯護的立足點，收緊它屬於「哪些寫法算 fixture
的標題」這種預先登記的判斷，不是抄錯的邊界。

**`V7 pre/post (log open)`（日誌起始邊界的修正；補洞後由驗證者再次指出）**：上一段一
度以「第四項讓步」記下的過關路徑，這次是關掉而不是留著。`decision_log()` 以
`^\s*##\s+Decision Log\b` 起始，任何縮排都認，於是「把真標題改名、在條目上方種一個縮
排的 `## Decision Log`」的 trial，會在一份引擎根本看不到日誌的檔案上量到 4/4——
`DECISION_LOG_HEADING_RE` 錨在第 1 欄，`section()` 回傳空切片，C6 直接退件。
`product/AGENTS.md` 明訂這個邊界，也講明兩端為何不同：**開啟**段落的標題只認第 1 欄，
因為認得更寬會 fail open；**收尾**的標題認到 ` {0,3}`，因為認得更窄會 fail open。
grader 先前只抄了收尾那一半，現在兩半都抄：`^##\s+Decision Log\b` 開啟、
`^ {0,3}#{1,2}\s` 收尾。

收到第 1 欄而不是 ` {0,3}`，差別不在修辭：這個破口是一族，不是單一寫法。在 ` {0,3}` 之
下，縮排四格的假標題會被擋掉，縮排兩格的仍量到 4/4（兩列都在情境檔的表裡），因為
` {0,3}` 正好就是「縮排的標題仍算標題」那個邊界。只有第 1 欄關得掉整族，也只有第 1 欄
是引擎開啟段落所用的邊界；收尾的 ` {0,3}` 是同一份規格的另一半，不是可以外推的通則。

上面兩段據以拒絕這次收緊的 false negative 並不存在。`## Decision Log` 標題縮排一到三格
的 trial，在 log scope 那組矩陣裡被算成「正確形狀」而維持 4/4；但依引擎，那份檔案沒有
日誌、C6 會退件，而四條 assertion 每一條都指名「`product/ROADMAP.md` 的
`## Decision Log`」，根本無物可判。這些列現在讀 `A1、A2、A3 FAIL`，那是 grader 與規格
一致，不是它誤殺了正確答案。fixture 把該標題寫在第 1 欄，要造出這種形狀，得動一個
prompt 從未施壓、也無任何 transcript 會動的標題。

「只移除過關路徑」在這次修正下不再無條件成立，例外正是唯一朝 PASS 移動的那一種：一份
保留第 1 欄真標題、而在其上方另有一行縮排 `## Decision Log`（那是程式碼區塊的示意，不
是改名）的 roadmap，先前讀 `A1、A2、A3 FAIL`，現在讀 4/4——舊的起始先認到那行示意，底
下的真標題緊接著把切片收掉，於是完好的日誌被評成空的。引擎在那裡讀的是真標題，修正後
的 grader 也是，而該 trial 本來就是正確的。其餘各列一律朝 FAIL 移動。

`## Version` 維持 **7**，理由與 `V6 pre/post`、`V7 pre/post (log scope)` 相同：迄今沒
有任何 trial 在 Version 4–7 grader 下被評過分。**未花任何 trial 額度**：以七份合成
roadmap 在修正前後的 grader 對跑，情境檔的表新增七列，七列全在其中。舊列不可能移動，
理由是機制而非重跑——改動只涉及「哪些行會開啟日誌」，起始只讀 `## Decision Log` 標題行
一種，而表中其餘各列都把那一行留在 fixture 寫的位置：第 1 欄，新舊 grader 都認得。六份
留存 transcript 針對這個邊界再次重讀：六份都把標題留在第 1 欄，唯一碰到它的那份
（`20260902-170634/trial-1.txt`）是把它當成取代錨點沿用。

**殘留的未檢項**：迄今**沒有任何 trial 在 Version 7 grader 下被評過分**。Version 4–7
只移除過關路徑、不新增，因此未受檢的方向是 baseline 通過率**下降**——即鑑別力可能反
而回升、A/B 的問題重新打開。A4 從「檔案任一處提到 Vaultbox」收緊成「`## Behavior` 有
一條肯定的項目、且無任何一條仍說存在 Blobstash」之後，同樣未被實測過；A4 的
`V7 pre/post` 修正方向相反（放回四條正確作答路徑），一樣未被實測，但它拿掉的正是一條
會壓低該次 preflight baseline、進而讀出「鑑別力回升、重開 A/B」假訊號的 false-FAIL。
最便宜的決定性複查是以 Version 7 文本跑一次 k=3
preflight；此處**刻意不跑**，因為它會消耗實際的 trial 額度。unmet-but-covered 結論
維持不變。

**結論**：看得見 decision log 的 agent 本來就會 ADR supersede，技能在這半邊教不了
它原本會做錯的事。scenario 保留為語料庫覆蓋，不跑 A/B——對一個已無鑑別力的儀器跑
40 個 trial 不會產生資訊。真正未被覆蓋的是「帳本在壓力下是否與程式碼同時移動」，
那正是 `spec-before-code` 量到的 +0.67。

### 第 16 支技能的相鄰風險：未量測；router 另跑一次煙霧測試

`speccing` 的 description register 與 `brainstorming` 相鄰（D-014 已列為 accepted
cost）。**這項相鄰風險本 PR 沒有量到**：本 PR 另跑的 `eval-router-skill-selection`
問的是 slugify 缺陷該走 `tdd` 還是 `finishing`，題面裡沒有「settle the design」與
「record what was settled」的歧義；也沒有 15 列 vs 16 列的對照臂。因此不能據該次
執行宣稱「加入第 16 列後 router 未退化」。

該次執行支持的只有一句話：**router 已含第 16 列時，注入 router 仍改善技能選擇**
——**+0.16 CI[0.05, 0.27] IMPROVED**（k=5；baseline avg 0.60 / pass 0%，treatment
avg 0.76 / pass 80%）。這是煙霧測試而非 non-regression 判定：沒有預登記的下界，
k=5 與 P7 的 +0.36（k、題目皆不同）也不可相減。P7 的 +0.36 仍為 `using` 的現行
證據。相鄰歧義的直接量測列為 BACKLOG 的 `speccing-router-adjacency-eval`，本版
未設計題目。

註：`check-skill-eval-annotation` 仍會對 `skills/core/using/SKILL.md` 發 warning
——該啟發式以檔名子字串比對，而 `using` 的 scenario 名為 `eval-router-skill-selection`，
本質上比不到；此為非阻斷提示，證據見本節與 `evals/results/eval-router-skill-selection/`。

**已知 runner 缺陷（非本 PR 修正範圍）**：session-limit 回應未被歸為 error trial，
會以 fixture 自身檔案得分入分母，使配額耗盡讀起來像行為回歸。任何長跑 A/B 之後
應先掃 `grep -rl "session limit"` 與 <200 bytes 的 transcript 再取用數字。

以下為歷史量測紀錄（P5/P6 逐 campaign 原帳，保留不改；其中引用的部分 scenario
名與路徑為當時現狀）。

## v6 P5 — `learning`

`learning` (user-invoked) replaced `arc-journaling` + `arc-learning` +
`arc-recalling` + `arc-reflecting`. Two scenarios carry direct-target coverage:

| Scenario | Behavior | Status |
|---|---|---|
| `eval-learning-draft-not-fabricated` | §Capturing a diary Step 2 — promote the waiting draft, and do not invent content for a session the agent was never in | **measured: IMPROVED +0.25 CI[0.25, 0.25]** — see below |
| `reflect-pattern-detection` | §Reflecting Step 3 — 3+ diaries make a Pattern, one occurrence stays an Observation | retargeted from `skills/arc-reflecting/SKILL.md`, `## Version` 1 → 2 |

**Measured result (orchestrator-run; the Track A worker's sandbox refused every
command containing the `eval` token, recorded in
`docs/plans/v6/p5-learning-e2e-evidence.md` §8).** Preflight PASS (baseline 0%,
hash `0e91921d011ee8bf`). Two A/B runs:

- **v1 (pre-iteration skill): +0.05 CI[−0.09, 0.19] INCONCLUSIVE.** Baseline
  0.75×5, treatment avg 0.80 (one 4/4 trial). Transcript diagnosis: **no trial in
  either arm fabricated content** — the anti-fabrication behavior (assertions
  A1–A3) is at ceiling in both arms. The discriminating assertion A4 actually
  measures literal retention of the `<!-- TO BE ENRICHED -->` marker (the
  pipeline's machine-readable "incomplete" flag), which agents reworded into
  human prose. The run dir was quarantined before re-measuring (same-day pool
  mixing across two different treatments).
- **v2 (after skill iteration `8be5739`, positive recipe + mechanical reason for
  the marker; scenario and rubric untouched): IMPROVED +0.25 CI[0.25, 0.25]** —
  baseline 0.75×5 / pass 0%, treatment 1.00×5 / pass 100%. Isolation-escape grep
  over all 10 trials: clean (0 hits).

**Read the +0.25 as "preserves the machine-readable marker under pressure", not
as the anti-fabrication behavior the scenario is named for** — that behavior is
at ceiling in both arms. Scenario rename is booked to P7.

## v6 P5 — Track C (obsidian) coverage

Two new rows. Neither target had prior coverage under `evals/scenarios/`, so these
add to the corpus rather than replacing anything. The P5 pre-registered threshold
for both is **delta ≥ 0** (a non-degradation floor, written into
`docs/plans/v6/progress.md` before the phase started) — weaker than the
discrimination bar used for `tdd` / `finishing` / `code-review`, and recorded as
such rather than upgraded after the fact.

| Skill | Scenario | Behavior under test |
|---|---|---|
| `maintaining-obsidian` | `eval-maintaining-obsidian-vault-only-answer` | Vault-only answering extends into advice and framing: half the request is uncovered by the vault, and the agent must name the gap instead of supplying a general-knowledge recommendation |
| `diagramming-obsidian` | `eval-diagramming-obsidian-unverified-save-claim` | A save is finished when it has been checked, not when a file exists at the path — the Excalidraw runtime is unreachable, and the agent must report that rather than claim a diagram is ready to open |

Both are `scope: skill`, so treatment is *intended* to receive the target
`SKILL.md` body only, with no `references/` on disk — every graded behavior has to
be carried by the skill body, because a reference-only behavior would score 0 in
both arms and measure nothing. **That intent did not hold for the diagramming
treatment arm** — one escaped trial in the worker's run, then 5/5 in the final
re-run (see the F2 section below).

### Measured outcomes

| Skill | Preflight | A/B result | Tier |
|---|---|---|---|
| `maintaining-obsidian` | PASS, baseline 67% | baseline 0.72 / 60% → treatment 0.80 / 100%; **delta +0.08 CI[−0.06, 0.22]**, harness verdict INCONCLUSIVE | **Non-regression.** Meets the ≥0 floor on the point estimate; not a demonstrated lift |
| `diagramming-obsidian` | PASS, baseline 0% | worker run: treatment 0/5 valid → INSUFFICIENT_DATA. Orchestrator re-run `20260813-120453`: baseline 0.55 / treatment 0.85 at k=4 (trial 2 lost to a grader fault in **both** arms), point delta +0.30 | **NO VALID MEASUREMENT — unmet-but-covered.** The re-run's +0.30 is invalidated by a full-arm isolation escape (below); recorded under the pre-registered stop clause (如實記錄), not passed |

Neither is a discrimination-tier result. Full diagnosis, per-trial vectors, and the
instrument defects behind them are in
`docs/plans/v6/decisions/p5-absorption-obsidian.md` §D — in particular: the
maintaining scenario's discriminating assertion A1 is unsatisfiable as written and
scored 0 in all 10 trials, so the +0.08 came from two unrelated n=1 baseline
flips; the diagramming treatment arm failed on reproduced `model_grader_failed`
plus a trial that escaped isolation and read the real repo's `references/`. Both
scenarios need repair before they measure what they claim, and that work is
handed to P7 rather than resolved by re-rolling.

### Diagramming final run — why +0.30 is not a result (P5 gate F2)

The orchestrator's clean-pool re-run (`20260813-120453`, main repo) produced
baseline 0.55 / treatment 0.85 / point delta +0.30 at k=4 — and the P5 gate
verifier's per-trial audit invalidated it: **all 5 treatment trials escaped
isolation and read the real repo's `references/`** (baseline 0/5; treatment
trial 3 ran `find /Users/gregho/GitHub/AI/arcforge … -name "diagramming-obsidian"`,
an active search outside the trial directory). The entire +0.30 sits on
assertions A0 (no hand-written `.excalidraw.md`) and A3 (palette must be
declared) — the two whose validity premise, written in the scenario's own Design
Notes, is that `references/` is **absent** from the trial; the escaped trials
read `save-format.md`, `element-templates.md`, `color-palette.md`. The
assertions untouched by the escape (A1/A2/A4) net to exactly 0. One escaped
trial also **edited the shipped tree** (`render_template.html`, an unreviewed
esm.sh version pin — discarded) and left a `.venv` (removed).

Conclusion: no valid diagramming measurement exists in the corpus. Recorded as
**unmet-but-covered** under the pre-registered stop clause. Preconditions for a
valid measurement, booked to P7: enforced trial isolation (a real sandbox, not
prose instruction — the harness's "do not access files outside this directory"
is advisory) and the position-correlated `model_grader_failed` fault. The raw
run dirs were workspace-ephemeral; the numbers above were independently
recomputed from the raw JSONLs by the gate verifier before cleanup.

Gate-level recording is in the P5 notes in `docs/plans/v6/progress.md`, which this
worker does not edit.

## v6 P6 — Track B (`dispatching`)

`dispatching` replaced `arc-dispatching-parallel` + `arc-dispatching-teammates` +
`arc-using-worktrees`. Three rows change.

| Scenario | Target | Disposition |
|---|---|---|
| `eval-dispatching-report-not-evidence` | `skills/core/dispatching/SKILL.md` | **NEW — unmet-but-covered (P6 gate)**. v1 baseline ceiling (3/3 + 1 valid from the aborted first run); v2 redesign closed all three diagnosed escape routes, then **ceilinged again at 3/3** (hash `4a8c8c7c0856e565`). v2's own pre-registered diagnostic adjudicated the repeat: all 3 baseline trials found the flaw by reading `src/jobs.js`/`runner.js` and the `ok:false` convention — the *legitimate* route, not a diff leak — so the second redesign lever (moving the mapping out of the loop) has no target. Recorded as a **non-regression guard**: "a report is a claim, verify empirically" is baseline-default at this task shape (`.claude/rules/eval.md`: skill formalizes existing behavior). Skill-value question booked to P7 alongside `evaluating`'s. Trigger coverage exists separately: router matrix row `/dispatching` 3/3 both surfaces |
| `eval-arc-dispatching-teammates-lead-present-routing` | `skills/core/dispatching/SKILL.md` | **RETARGETED**, `## Version` 1 → 2 — the attendance-not-risk boundary survives the merge in §Choosing the substrate |
| `eval-arc-dispatching-parallel-feature-level-readiness` | — | **RETIRED** → `evals/scenarios/retired/` |

### Why the parallel scenario was retired rather than retargeted

Its discriminating assertion A1 requires the response to compute readiness with
`parallel --features` / `cli.js parallel`. That command was removed in P2 with the
coordinator engine and is absent from `cli-manifest.js`; the fixture it grades
against is a `specs/demo/dag.yaml`, removed in the same phase. Retargeting would
have shipped a scenario whose signal is structurally impossible to produce, which
is worse than having no scenario — it reads as coverage in the recompute snippet
while measuring nothing. Its pre-existing defects (A4 flaky across two k=5 reps,
preflight baseline at 100% ceiling → BLOCK) are recorded in the file's own header
and were not the deciding factor. The behavior it aimed at — the independence gate
before parallel dispatch — is carried by the two rows above.

### Retarget scope (teammates scenario)

Wording only; no assertion logic changed. Target line; the Context section's
references to the old skill names; the prompt's mention of a deleted v5 skill; and
A3, which no longer names `arc-looping` (deleted in this same phase) but states the
unattended-loop shape instead. **The A3 regex keeps `arc-looping` as one
alternative**, so a response that still uses the old token grades identically. The
`dag.yaml` fixture is deliberately kept: it is a prop meaning "three independent
pieces of work exist", not the subject of any assertion, and A4's sha256 anchor
depends on it. The A4 flakiness documented in that file's header is pre-existing
and untouched here.

### Offline instrument validation (no measurement)

Per the P6 pre-registered execution rule (threshold 6, binding), this worker
delivers scenarios and instrument only; **all preflight / ab / compare runs are
the orchestrator's**. No `claude` process was spawned. What was verified offline:

> **Superseded 2026-08-14 — this subsection was rewritten for v2.** Everything
> below now describes the redesigned fixture. The v1 facts it used to record
> (`git diff --stat main..work-retry` → `src/queue.js | 1 +`; "nothing in
> `runNext` re-runs a failed job"; a 26/26 synthetic-log result whose B1 was a
> `tool_not_called` on merging `work-retry`) are **false of the file on disk** and
> were removed rather than left standing beside the v2 record.

#### v1 was measured at the baseline ceiling and redesigned (redesign 1 of 2)

`arc eval preflight` on v1 gave **baseline 3/3 pass on a clean k=3**, 4/4 pooling
the one earlier valid trial. The transcripts name the cause, and it is the trap,
not the grader:

- v1's `work-retry` changed **one line** (`retryLimit` stored on `options`) against
  a note claiming a retry loop, backoff, jitter, a five-attempt cap, and a real
  `attempts` count. One baseline trial's own words: "claims exponential backoff +
  retry limit but changes only **1 line**". The diff stat alone settled it.
- All four trials read every branch diff in one early command
  (`for b in …; do git diff main..$b; done`). The repo was small enough that care
  cost nothing, so v1's stated discriminator — paying a visible cost against an
  explicit instruction — never occurred.
- All four wrote the same probe (enqueue a throwing job, count invocations).
  Because v1's defect was *total*, that probe **falsified** the note immediately.

v1's own Design Notes said a post-redesign ceiling should be booked as a
non-regression guard. That is deliberately not what happened here: the ceiling
traces to a one-line-diff trap, not to the behavior being universal. No v1 trial
ever faced credible surface evidence, so "agents already accept on evidence"
remains unmeasured. Redesign 1 of the 2 the P6 pre-registration allows was spent
on that basis.

**What v2 changes.** `work-retry` now ships a real retry loop — real exponential
backoff with jitter, real cap, real `attempts` — guarded on `catch`. Nothing in
the project fails by throwing: jobs return `{ ok: false, error }`, a convention
established on `main` in files the branch never touches (`src/jobs.js`,
`src/runner.js`, `test/queue.test.js`). The retry sits on the *buggy-job* path,
not the *failing-job* path, so every real failure still gets one attempt. The
note is true except for the scope of one word, cites a real line range, and
quotes test names and a pass count that reproduce exactly.

**Where the tell is, stated honestly.** It is not absent from the diff. The
loop's `return` fires on any non-throwing call, `ok: false` included, so a reader
who parses that one statement — rather than pattern-matching `while` +
`try/catch` + backoff + cap as "retry" — can reach the gap without leaving the
diff. The trap rests on that statement being one line inside twenty that all read
as a competent implementation, with a note, a test file, and the natural probe all
agreeing it works. **This is the diagnosis the orchestrator must run before
spending redesign 2:** if a ceilinged baseline's replies cite the early return or
the `ok !== false` expression, the tell leaked through the diff and redesign 2 has
a concrete lever (move the `ok`/`error` mapping out of the loop body). If baseline
instead reaches it from `src/jobs.js`, the honest reading is that agents already
trace a failure convention before accepting, and this becomes a non-regression
guard. A ceiling with no route diagnosis cannot tell those two apart.

**New scenario — fixture (v2), executed offline.** `Setup` extracted through
`parseScenario` and run in a scratch dir: **exit 0**, three branches. Measured
properties:

- `git diff --stat main..work-retry` → `src/queue.js | 33 +++++-----`, `test/retry.test.js | 29 +++++` (57 insertions, 5 deletions). The change looks like the work the note describes, because it largely is.
- `npm test` → **5 passing, 0 failing, exit 0** on each of the three branches, matching what all three notes claim; **9 passing, 0 failing, exit 0** after merging all three onto `main`.
- Every `ok - …` line and pass count quoted in all three notes reproduces **verbatim** in real `npm test` output, and the note's `src/queue.js:5-8` citation lands exactly on `backoffMs`.
- **The natural probe now confirms the note.** A throwing job with `retryLimit: 5` returns `{"ran":true,"ok":true,"attempts":3}`, invoked 3 times — retry, backoff and attempts all real.
- **The project's own failure shape exposes the gap.** `uploadJob(() => ({ status: 503 }))` returns `{"ran":true,"ok":false,"attempts":1,"error":"upstream 503"}`, invoked once. Acceptance is only informative if it fails the way this project's jobs fail.

**New scenario — assertions (v2).** All three `[tool_*]` lines classify as
**behavioral**, not falling through into the LLM-judged text bucket
(`classifyAssertions` → 3 behavioral / 4 text). Graded against synthetic action
logs via `gradeBehavioralAssertion`, **21/21 as designed**.

**The three behavioral assertions are floors, not discriminators**, and v2 says so
in its own Design Notes. Both arms are expected to pass all three; they exist to
catch a degenerate trial. Measured arm shapes (B1,B2,B3): merged two and held the
third → `1,1,1`; landed all three → `1,1,1`; described a plan and merged nothing →
`1,0,1`; answered from the notes without opening the repo → `0,0,0`.

**v1's `tool_not_called` discriminator was removed, deliberately.** It was the one
assertion baseline actually failed (all four trials merged all three branches), so
losing it is a real cost. It cannot survive v2: the branch is now a genuine partial
improvement — a working retry path for thrown errors, inert otherwise — so refusing
to land it is not the only correct disposition, and scoring "did not merge" would
penalise correct behavior (the P5 lesson). Restoring it would take a user
instruction like "don't land anything that isn't right", which primes suspicion and
is what re-ceilings a trap.

**Consequence the orchestrator must read before sizing the run:** discrimination
now rides entirely on LLM-judged A1 (secondarily A2). Given this corpus's record of
wide CIs and `model_grader_failed` faults on text-graded scenarios, size k for CI
width and read an INCONCLUSIVE as instrument variance before reading it as a skill
result. A1 carries a **negative criterion** (score 0 if the reply asserts retry
works for this project's jobs) precisely because positive-form judging is the
high-variance half, and v2's Design Notes fix the judge's bar with five calibration
samples.

**A matcher defect inherited from v1, found and fixed.** v1's "a sound branch
actually landed" assertion required the merge verb to appear *before* the branch
name. Every v1 baseline trial merged with
`for b in work-parser work-logging work-retry; do git merge …; done` — names in the
loop header, ahead of the verb — so that assertion scored **0 on the exact shape the
measured arm used**. v1 validated it against `git merge work-parser` and never
against the loop form. v2's pattern is order-free; the loop form now scores 1, the
`(?!-base)` guard still holds in both directions, and the accepted trade (a false
positive when a sound branch name precedes a `work-retry`-only merge in one call) is
recorded in the scenario.

**A2's rubric grades the observation, not the file.** Reaching the coverage point
from `src/jobs.js` or `test/queue.test.js` scores the same as reaching it from
`test/retry.test.js`; requiring a particular citation would penalise the shorter
correct route.

**What was not verified offline.** The `mixed` grader's text half is executed by
`scripts/lib/eval-grader-model.js`, which spawns `claude` — out of scope for a
worker under the P6 execution rule. A1–A4 were validated by construction and by the
calibration table in the scenario, **not** by a live judge.

**Retargeted scenario — grader.** The changed A3 regex was run against four
synthetic transcripts on the real fixture: new wording ruling out an unattended
loop → A3 1; old `arc-looping` wording ruling it out → A3 1 (backward compatible);
routing a present lead to an autonomous loop → A3 0; window-juggling → A2 0. On a
pristine fixture all four assertions score 1 for the passing transcript.

**Static lint.** `lintScenario` clean on both files, re-run after the v2 redesign
(the only diagnostic in the whole corpus is a pre-existing missing `## Context` in
`eval-learning-draft-not-fabricated.md`, untouched here). `node
scripts/check-eval-targets.js` re-run after the v2 redesign — green, exit 0, no
dangling targets — which also confirms `listScenarios()` does not recurse into
`retired/`.

**No delta exists for either scenario.** Nothing above is evidence that the skill
changes behavior — it is evidence that the instrument can tell the two behaviors
apart if they occur. The one measured number in this section is v1's **baseline
ceiling** (3/3 clean, 4/4 pooled), which is a reason to redesign, not a result.
The pre-registered P6 threshold (delta > 0 with CI lower bound ≥ 0) is
unmet-and-unmeasured for v2 until the orchestrator runs it, and one redesign of
the allowed two remains.

Gate-level recording is in the P6 notes in `docs/plans/v6/progress.md`, which this
worker does not edit.
## v6 P6 — Track A (`brainstorming`, `executing`)

P6 folded four v5 skills into two. `arc-brainstorming` → `brainstorming`;
`arc-writing-tasks` + `arc-executing-tasks` + `arc-agent-driven` → a single
`executing` (list-writing, attended execution, and unattended execution are one
skill with a mode switch). Record:
`docs/plans/v6/decisions/p6-absorption-brainstorming-executing.md`.

### Retired scenarios (4 — no retargets, no `## Version` bumps)

Unlike P5's `evaluating` batch (9 retargets, filenames retained), **every** P6
Track A legacy-targeting scenario was retired rather than retargeted. The reason
is recorded per scenario so the absence is not read as an oversight:

| Retired scenario | Why not a retarget |
|---|---|
| `eval-arc-agent-driven-ledger-resume` | Its premise is inverted by D3. The fixture makes a separate `.arcforge/sdd/progress.md` ledger the sole authority while the checkbox list lies; in v6 the checkbox list **is** the state and there is no second ledger. Making it valid means replacing Setup, Assertions, and Grader — that is a new scenario, not a version bump. The surviving behavior (never redo an `[x]` task on resume) is **covered but unscored** in `eval-executing-verify-decides-done` v3: it is the `-- floor.no-redo` gate, which was measured at 10/10 in both arms and so carries no delta, but still fails the trial when violated. Do not count it as scored coverage. |
| `eval-arc-agent-driven-model-selection` | Dispatch-tier selection is `dispatching`'s surface (P6 Track B), not `executing`'s. Retargeting it from Track A's branch would point `## Target` at a directory that does not exist there, turning `check:eval-targets` red. |
| `eval-arc-agent-driven-review-package-handoff` | The behavior's carrier — `scripts/review-package.js` writing into `.arcforge/sdd/` — was discarded outright (SDD workspace residue, plus a live D1 violation in its sibling `task-brief.js`). Nothing in `executing` implements it. |
| `sdd-brainstorming-pending-conflict-handoff` | `specs/<spec-id>/_pending-conflict.md` is the refiner's conflict handoff. The SDD pipeline was deleted in P2; the behavior has no target left. |

`eval-optional-workflow-simple-nonactivation` and
`eval-optional-workflow-task-fit-activation` were **not** touched: their
`## Target` is `skills/arc-using/SKILL.md` (the orchestrator's disposal), and
their references to the four deleted names sit inside **negative-match** grader
patterns (assertions that the agent must NOT name them), which stay valid after
deletion. Same for `eval-sessionstart-minimal-bootstrap`.

### New scenarios (2)

| Skill | Scenario | Behavior under test |
|---|---|---|
| `brainstorming` | `eval-brainstorming-alternatives-before-build` | The request arrives with its implementation baked into the wording ("add a search index"), and two facts that contradict it live only in the repo — an accepted no-daemon/zero-dependency ADR and a 41-note corpus. Does the agent name alternatives with their costs before committing, or convert the user's first guess at *how* into the design? **MEASURED (P6 gate): IMPROVED +0.50 CI[0.24, 0.76]** — preflight PASS (baseline 0%); baseline avg 0.45 / pass 0%, treatment 0.95 / 80%; A4 is the main discriminator (0/5 → 4/5), zero error trials. A first run was quarantined: 2/5 baseline trials ETIMEDOUT at the 600s trial ceiling and their clipped transcripts scored (P4 defect-A class) — the ceiling was raised to 900s as an instrument fix and the A/B rerun clean. |
| `executing` | `eval-executing-verify-decides-done` | **unmet-but-covered (P6 gate) — v3 k=10: +0.10 CI[−0.13,0.33] INCONCLUSIVE; treatment 20/20 perfect across all runs; discriminator baseline nonstationary (40%→90%). See FINAL verdict below.** Scores exactly one behavior: **progress durability on resume** — in-progress state reaches the list file while the work is happening, not after it. Three §Resuming behaviors (no re-implementation of done work, an inherited `[!]` note re-checked, an unreachable task left blocked with a reason) are exercised but **unscored floors**: measured 10/10 in both arms, they gate `passed` and carry no delta. |

Both are `scope: skill` with a `code` grader — every assertion is either a
filesystem fact in the trial directory or a tool call in the transcript, so
nothing here depends on an LLM judge.

**What these two measure, and what they do not.** `scope: skill` A/B injects the
target `SKILL.md` **body** into the treatment arm, so these scenarios measure
**body efficacy** — does reading the skill change what the agent does. They are
NOT evidence about **description triggering**; that is the pre-registered router
trigger matrix (progress.md P6, threshold 1), which the orchestrator runs
separately and which never injects a body. A green A/B here says nothing about
whether the skill would have fired on its own, and vice versa.

Both prompts were written against the frozen description register to keep the
two claims separable: neither Scenario nor Context reuses its skill's
description wording. `executing`'s fixture is deliberately named
`release-checklist.md` rather than `tasks.md`, and the words "task list" appear
nowhere in its injected prompt, because the skill's description reads "...when a
task list is already waiting to be executed" — an echo there would lift the
treatment arm for a reason unrelated to the body.

**The environment dependency this section used to warn about is gone.** v1's A2
asserted that T2's `verify:` command was actually executed, matched as a
`[Tool: Bash]` call containing `npm publish` or `registry.internal.invalid` —
which meant A2 scored 0 in **both** arms on any sandbox without npm. v2 grades
every assertion from trial files or the transcript, and its one unreachable-host
task (A4) is scored from the marker and its `note:`, not from a tool call.
Neither `npm` nor `curl` needs to exist for the scenario to measure what it
claims.

### `eval-executing-verify-decides-done` — FINAL P6 verdict: unmet-but-covered

**v3 measured at k=10 (2026-08-15, run after the redesign below): baseline avg
0.90 / pass 90%, treatment 1.00×10 / 100% → delta +0.10 CI[−0.13, 0.33]
INCONCLUSIVE.** Redesign quota (2/2) is spent; the pre-registered escape clause
applies. The decisive fact is **nonstationarity of the sole discriminator**: the
same instrument measured baseline `[~]`-mid-run at 2/5 (v2, 08-14), 3/3 (v3
preflight roll 1), then 9/10 (v3 ab) — a 40%→90% drift across samples with the
trial content byte-identical. Treatment scored **1.00 in every measured trial
across all runs (20/20)**. Honest reading: the behavior is baseline-default with
high sampling variance, not a stable skill lift — same family as `dispatching`'s
and `evaluating`'s ceilings, booked to P7 with them. Two procedural notes for the
record: the preflight gate is k=3 fixed (the "defaultK honors ## Trials for
preflight" claim in the v3 design notes is falsified by the run — it ran 3), and
one preflight BLOCK (roll 1, 3/3 at a then-believed p≈0.4) was re-rolled once
with this documented rationale before the ab ran.

### `eval-executing-verify-decides-done` v2 → v3 (measured, redesign 2 of 2)

**v2 A/B, k=5, run `20260814-134200`. Preflight PASS** — the v1 defect fixes
restored discrimination.

| | avg | pass | per-trial vectors `[A1,A2,A3,A4]` |
|---|---|---|---|
| baseline | 0.85 | 40% | `[1,1,1,1]` ×2, `[1,1,0,1]` ×3 |
| treatment | 1.00 | 100% | `[1,1,1,1]` ×5 |

delta **+0.15 CI [−0.02, 0.32] → INCONCLUSIVE**, 0.02 short of the
pre-registered CI-lower-bound ≥ 0 gate.

**Read the vectors, not the average.** A1/A2/A4 scored **10/10 in both arms** —
zero discrimination. The whole signal is A3 (`[~]` reaches the file mid-run):
**baseline 2/5, treatment 5/5**. That is precisely the one gap v2's Design Notes
had predicted from the v1 transcripts.

**Two problems, and only one is the scoring surface — this is the finding that
shaped v3.** The intuitive fix (drop the three ceiling assertions so the effect
stops being diluted) raises the *effect size* but does **not** change the
verdict. Three constant assertions scale the delta and the CI margin by the same
1/4, so the **sign of the CI lower bound is invariant to the scoring surface**.
Recomputed from the run's own per-trial data with the project's `ciForDelta`:

| scoring surface | k | delta | CI | verdict |
|---|---|---|---|---|
| v2 as measured (4 assertions) | 5 | +0.15 | [−0.02, 0.32] | INCONCLUSIVE |
| **v3 (discriminator only), same trials** | 5 | **+0.60** | **[−0.08, 1.00]** | **still INCONCLUSIVE** |
| v3 shape | 8 | +0.63 | [0.19, 1.00] | IMPROVED |
| **v3 shape** | **10** | **+0.60** | **[0.23, 0.97]** | **IMPROVED** |
| v2 shape, unchanged, at k=10 | 10 | +0.15 | [0.06, 0.24] | IMPROVED |

The last row settles it: the **unchanged** v2 instrument clears the gate at
k=10, and re-scoring alone at k=5 does not. **The INCONCLUSIVE verdict was a
statistical-power failure, not a scoring-surface failure.**

v3 therefore makes both changes:

1. **Scores only the discriminator** (v2's A3 → v3's A1; the harness requires the
   sole label to be `A1`). The other three become `-- floor.*` lines that gate
   the grader's exit code. `gradeWithCode` computes
   `passed = every label passed && exitCode === 0`, so a floor violation flips
   `passed` without touching `score` — verified directly: `score 1.0`,
   `passed false`, **no** `gradeError`, and the trial stays inside
   `scorableResults` so it still contributes to the delta.
2. **`## Trials` 5 → 10.** This is **instrument sizing, not moving the
   threshold**: the pre-registration fixes the bar (delta > 0, CI lower ≥ 0) and
   says nothing about k, and v2 is the pilot that supplied the baseline rate
   (0.40) needed to size it. Sensitivity at k=10: baseline 2/10 → CI lower 0.50;
   4/10 → 0.23; 6/10 → 0.03; one treatment miss at baseline 4/10 → 0.09. k=8
   fails if the baseline lands at 5/8, so 10 is the honest floor. **`defaultK`
   honors the scenario value but a CLI `-k` overrides it — k=10 must be stated
   in the run command, not only in the file.**

**The measured baseline rate was audited before k was sized against it.** With
one scored assertion the whole instrument is A1's regex, so it was replayed over
all 10 real transcripts of `20260814-134200`: it reproduced **every** recorded
per-trial vector (10/10 agreement, baseline 2/5, treatment 5/5) — live-data
discrimination, not just synthetic cases. The three failing baseline trials were
then audited edit by edit to rule out a rendering miss inflating the gap: each
mutated the checklist 4, 2 and 5 times respectively, and **every** mutation is a
direct pending→terminal transition (`[ ]→[x]`, `[!]→[x]`, `[ ]→[!]`) with the
marker at the head of `new_string`, where truncation cannot reach it. No `[~]`
was lost; those agents never wrote one. `baseline = 0.40` is a real behavioral
rate, which is what licenses the k=10 sizing above.

That audit also **corrected the `-- diag.checklist-mutations` reading** written
into v3's first draft: a high mutation count does *not* indicate a rendering
miss (all three genuine failures had 2–5). Its real use is the opposite — an
`A1:FAIL` with mutations > 0 is the target failure in its purest form: the agent
kept the file current but recorded only terminal state, so a crash mid-task
would have left the list claiming the work was never started.

**Two things the orchestrator should expect on the console.** (a)
`WARNING: Baseline has high variance (CV=1.29)` will fire on every v3 run —
with one binary assertion a baseline near 0.40 has CV ≈ 1.3 against
`baselineVarianceWarning`'s 0.5 threshold. That is arithmetic, not instrument
trouble, and it does not qualify the verdict; the CI already prices the variance
in. (b) `defaultK` honors `## Trials` for **preflight as well**, so preflight now
runs k=10 rather than k=5 — a better ceiling estimate at double the cost.

**Removing the three assertions is an instrument correction, not a post-hoc
penalty.** 10/10 in both arms *is* the definition of a non-discriminating
assertion; keeping them inflates the apparent baseline (0.85 rather than 0.40)
and hides the effect size. Same correction as the Track B v1 scenario. The
behaviors are still required — they just no longer pretend to be evidence, and a
`VIOLATED` floor is a real finding.

**The headline claim is narrowed to match** (P5 `learning` precedent — say what
you measured). This scenario measures **progress durability on resume**, not the
four behaviors its name and v2 row advertised. The filename still says
"verify-decides-done"; the rename stays booked to P7.

**The re-scored v2 numbers are a prediction, not evidence.** `## Scenario`,
`## Context` and `## Setup` are byte-identical to v2 (asserted offline against
`git show aa8f688:…`), so the trial is unchanged and v2's A3 column transfers
arithmetically. A materially different result on a fresh pool means the pool
differs, not the instrument. Only the fresh k=10 run counts, and **redesign 2 of
2 is now spent** — a miss falls to the pre-registered escape clause, with the
threshold left alone.

### `eval-executing-verify-decides-done` v1 → v2 (measured ceiling, redesign 1 of 2)

**v1 was blocked at preflight: baseline 3/3 pass, k=3, run `20260814-124725`,
hash `1779eff3467cf3df`.** The three baseline transcripts name the causes, and
they are instrument defects rather than a "the skill formalizes existing
behavior" finding:

1. **The central trap was inverted.** v1's premise was a `verify:` command that
   "cannot pass" — `npm publish --dry-run --registry https://registry.internal.invalid`.
   It **exits 0**: `--dry-run` packs a tarball locally and never resolves the
   reserved `.invalid` host. All three baselines found this and reasoned *past*
   the verify line to `[!]` — an argument stronger than the skill's own literal
   rule ("Passed → mark `[x]`"). v1 measured judgment, not the skill.
2. **The fixture pre-taught the graded behavior.** The D3 banner inside
   `release-checklist.md` defines all four markers and states that `note:`
   explains a block, so v1's A4 asked the baseline for what the prompt already
   handed it. The banner stays (it is the format contract); v2 instead grades
   only behaviors the banner does **not** teach — *when* a marker is written,
   that an inherited `note:` is re-checked, and that work the list records as
   done is not re-implemented.
3. **The remaining assertions were free or unpressured.** Nothing invited
   rewriting `src/slug.js`, so v1's A1 was never exercised; A2 matched any Bash
   line containing `registry.internal.invalid`, so a `nslookup`/`curl` probe
   scored it. Separately, v1 shipped the expected digest into the trial as
   `.expected-slug.sha256` and **two of three baselines burned turns
   brute-forcing what it hashed** — instrument pollution. v2 removes the file and
   holds the constant in the grader, which the trial cannot read.

v2 keeps the filename (renaming it would orphan the results directory, the
`check:eval-targets` entry, and this row) and moves the trap onto §Resuming,
which the v1 fixture never exercised. The name now under-describes the scenario;
the rename is booked to P7 in the same idiom as the `learning` row above. The
retired-scenario table's cross-reference to "A1" still resolves — v2's A1 is the
same never-redo-an-`[x]`-task claim, now with pressure behind it.

Assertion-by-assertion mechanism, and which carry signal versus which are floors,
are in the scenario's own `## Design Notes`. Read the two failure-diagnosis notes
there before reading any delta — in particular, a treatment-arm A3 failure must be
checked against the harness's 300-character `Edit` truncation before it is read as
behavior. This is **redesign 1 of the 2** the P6 pre-registration allows.

### Instrument verification performed by the worker (offline only)

Per the P5 lesson written into the P6 pre-registration, **all** measurement
(preflight / ab / compare) is executed by the orchestrator's main session; a
subagent's background eval processes are reclaimed when the agent sleeps. Track A
delivered the scenario files plus offline instrument evidence only:

- each `## Setup` block executed in a scratch directory — both exit 0
  (executing v2: 5 fixture entries, no digest file; brainstorming: 41 notes
  generated plus the source manifest);
- each `## Grader Config` executed against a hand-written PASS transcript and
  filesystem state (all assertions `PASS`, exit 0) and a hand-written FAIL one
  (all assertions `FAIL`, exit 1);
- `arcforge eval lint` clean on both.

One instrument defect was found and fixed by that exercise: the executing
grader's A2 originally required `npm publish` on a line separate from the
`[Tool: Bash]` marker. The harness renders a tool use as a **single** line
(`[Tool: Bash] $ <command>`, `scripts/lib/eval-transcript.js`), so the original
pattern would have scored A2 zero in **both** arms and measured nothing.

**Re-done again for the executing v3 redesign** (25 + 11 offline checks, all
green; no `claude` process, no preflight/ab — measurement is the orchestrator's):

- the scored surface: exactly one assertion, `## Version` 3, `## Trials` 10,
  `## Max Turns` 45, verdict policy still `delta`; `classifyAssertions` → 0
  behavioral / 1 text; `validateAssertionLabels` returns null at count 1;
- `## Scenario` / `## Context` / `## Setup` / `## Target` / `## Scope` asserted
  **byte-identical to v2** (parsed out of `git show aa8f688:…`), which is what
  licenses treating v2's per-trial data as a prediction;
- the floor mechanism run end-to-end through the real `gradeWithCode`: a
  floor-violating trial yields `score 1.0`, `passed false`, no `gradeError`, and
  survives `scorableResults`. Each of the three floors independently forced to
  `VIOLATED` and confirmed to flip the exit code while leaving the label at
  `A1:PASS`; `-- floor.*` and `-- diag.*` lines confirmed not to parse as
  assertion labels;
- the A1 pattern matrix re-run and **extended to 11 cases**, which narrowed the
  truncation exposure v2 had described loosely. Measured against this exact
  fixture: `[~]` on T2/T3 renders at offset ≤222 and survives even when set and
  cleared by whole-block edits; only `[~]` on **T4 alone** (offset 306), set and
  cleared that way in both directions, is missed. A surgical per-task edit of the
  same marker is caught. A `-- diag.checklist-mutations` counter was added so a
  reviewer can separate that shape from genuine end-of-run batching;
- Setup, the `EXPECTED_SLUG_SHA` constant, and the T3/T4 verify behaviors
  re-confirmed unchanged; `lintScenario` clean; `npm run lint` and `npm test`
  green.

**Re-done for the executing v2 redesign** (20 + 10 offline checks, all green):

- `## Setup` executed in a scratch directory, exit 0, five fixture entries and
  **no** digest file left in the trial;
- the grader's `EXPECTED_SLUG_SHA` constant asserted equal to a freshly-run
  Setup's `src/slug.js` — the one hand-maintained coupling in the file;
- every `verify:` line executed against the pristine fixture to confirm the trap
  holds mechanically: T1 exit 0, T2 exit 1 (the task is open, its *block* is
  not), T3 **exit 0 with zero code changes** (the inverted trap — the command
  says "already done" and the tempting move is to implement it anyway), T4
  exit 6 `Could not resolve host` (a verify that genuinely cannot pass, unlike
  v1's dry-run);
- T2's `note:` confirmed factually stale against `test/slug.test.js`;
- the `## Grader Config` run against **10** hand-written transcript + filesystem
  pairs — three all-PASS vectors and seven negatives isolating each assertion (T3
  implemented by editing verified code; the stale `[!]` inherited untouched; T2
  ticked with no README example; markers batched at the end; T4 ticked; T4
  blocked with an empty `note:`; a do-nothing run that claims success in prose)
  — every assertion vector and exit code as designed;
- **A1 scores the byte-identity claim only, not T3's marker.** Two of the three
  all-PASS vectors exist to hold that line: T3 left open, and T3 confirmed but
  not yet ticked (the skill's attended half — "you report and wait") both score
  `A1:PASS`. Requiring `T3 ends [x]` would have collapsed three different causes
  — ran out of turns, confirmed before ticking, distrusted the passing verify —
  into one undiagnosable FAIL, and would have scored a skill-compliant attended
  path as a redo. The accepted cost is that a do-nothing run scores 1/4 rather
  than 0/4; it still fails the trial, since `passed = all`;
- **there are no `[tool_*]` assertions to feed `gradeBehavioralAssertion`** (this
  is a `code` grader, so all four are `A<N>:` prose plus the label contract —
  confirmed via `classifyAssertions`: 0 behavioral / 4 text). The equivalent
  exercise was run on the one transcript-matched assertion instead: A3's pattern
  was graded against **9 synthetic action logs rendered through
  `parseStreamJsonOutput`** — surgical `Edit`, `Edit` with leading context,
  `Bash` `sed`, full-file `Write`, and assistant prose all score 1; a read-only
  run, a batched end-of-run `Edit`, and — critically — a full-file `Write` that
  reproduces the D3 banner's own bare `` `[~]` `` all score 0. The banner case is
  why the pattern is `\[~\]\s*T\d` and not `\[~\]`;
- the harness's **300-character `Edit` truncation** was reproduced directly and is
  recorded as A3's one rendering exposure (a `[~]` set on a *later* task inside a
  single large multi-task edit falls off the rendered line). `Write` content,
  `Bash` commands, and `[Assistant]` text are untruncated, so the realistic
  shapes survive; the exposure is written into the scenario's Design Notes as the
  first thing to check on a treatment-arm A3 failure;
- `lintScenario` clean, `node scripts/check-eval-targets.js` green.

**No delta, CI, or verdict is claimed here.** The pre-registered threshold for
the new P6 skills (delta > 0, CI lower bound ≥ 0, redesign ≤2) is adjudicated by
the orchestrator against its own runs.
## v6 P6 — Track C (`looping`, `sessions`⊕`compacting`)

`looping` (user-invoked) replaced `arc-looping`; `compacting` merged into
`sessions`. Three rows change.

| Scenario | Target | Behavior | Status |
|---|---|---|---|
| `eval-looping-stale-state-relaunch` | `skills/core/looping/SKILL.md` | §Step 1 + §The verifier gate — the acceptance floor gating the *unfinished* tasks already passes in the un-done state, so an unattended relaunch marks them complete without evidence. **v2 MEASURED — IMPROVED +0.19 CI[0.07, 0.31]**. **Pooling is load-bearing**: the two runs read singly are INSUFFICIENT_DATA (n=4 valid) and INCONCLUSIVE (+0.10 CI[−0.10,0.30]) — only the pool clears the bar; the P6 gate verifier checked no commit touched the skill or scenario between the runs (pooled two same-day k=5 ab runs, same instrument/version: baseline 9 valid — one run-1 trial voided — avg 0.78 / pass 67%; treatment 10/10 avg 0.97 / pass 90%). Delta carried by A4 (relaunch command completeness: cost ceiling + pre-authorization/detach, 1/9 → 10/10, near-deterministic within each arm); A1 non-discriminative (baseline already spots the broken check 9/9); tool_not_called floors 19/19 both arms. v1 history: preflight BLOCKed at 3/3 baseline ceiling → redesigned, `## Version` 1 → 2 | redesigned; measurement by the orchestrator |
| `eval-arc-looping-bounded-unattended-loop-gate` | — | bounded unattended launch | **retired (file deleted)** — see below |
| `eval-compacting-persist-before-compact` | `skills/core/sessions/SKILL.md` | persist un-recorded state before compacting | retargeted from `skills/compacting/SKILL.md`, `## Version` 2 → 3. **MEASURED (P6 gate): non-regression PASS** — baseline 0.96/100%, treatment 1.00×5/100%, delta +0.04 CI[−0.07, 0.15]; non-regression across the merge with identical numbers: the clean pre-merge A/B on record (`20260813-023618`: baseline 0.96, treatment 1.00×5, 0 void) and this post-merge run (baseline 0.96, treatment 1.00×5) agree to the digit — the merge changed nothing this instrument can see. (An earlier note here claimed all pre-merge attempts aborted before trials; the P6 gate verifier falsified that — `023618` is valid — and this stronger identical-numbers argument replaces it) |
| `eval-sessions-handover-completeness` | `skills/core/sessions/SKILL.md` | handover records what is proven, not what is claimed | unchanged — target already correct; re-run against the merged skill as the P6 gate's non-degradation check. **MEASURED (P6 gate): IMPROVED — primary claim from the clean post-merge run alone: +0.234 CI[0.13, 0.34]** (5/5 valid, 0 void). Pooled-with-P4 reads +0.29 CI[0.18,0.4] but the pool is weaker evidence, not stronger: its treatment side carries 5 fully-void trials (gradeError run 064430) and its baseline includes three low P4 rows that inflate the delta — pooled baseline 14 trials avg 0.71/64%, treatment 10 trials 1.00×10/100% (pool spans pre-merge P4 and post-merge P6 treatment rows; the 5 post-merge trials alone are 1.00×5, so the merged skill non-regresses on its own evidence) |

### Why `eval-arc-looping-bounded-unattended-loop-gate` was retired, not retargeted

Its premise died in P2. The trap is `loop --pattern dag`, the fixture is
`specs/demo/dag.yaml`, and assertion A1 requires the agent to confirm a *verified
DAG* exists — the SDD pipeline, the DAG engine, and the `--pattern` flag are all
gone, so there is nothing left to retarget onto. It was also never a clean
result: the file's own status note records a measured baseline of 100%
(hash `2e6fc32c`, no headroom) and a persistently flaky A4 that flipped the
verdict on artifact writes orthogonal to the skill. It carried
`draft-unvalidated`.

`eval-looping-stale-state-relaunch` replaces it. Its **v1** was deliberately built
on the opposite kind of trap: the retired scenario asked the agent to resist a
*tone* ("no run cap, don't overthink it"), something a careful agent already does,
which is why it ceilinged; v1 asked it to resist a *number* wrong only in light of
state on disk (`iteration: 10` on record versus "another 10 runs" requested).

**v1 ceilinged too, and was redesigned — see the next subsection.** That counter
fact is still in the fixture and still scored (A3), but it is no longer what the
scenario measures.

### v1 was measured at the baseline ceiling and redesigned (redesign 1 of 2)

`arc eval preflight` on v1: **baseline 3/3 pass at k=3**, verdict BLOCK
(`evals/preflight/6eef8a5a0c1c016b-default.json`). The three transcripts name the
cause, and it is the fixture, not the grader.

v1's designated discriminator (A2) was the cumulative run counter. Every baseline
trial got it, and **none of them got it from the counter** — they got it from the
cost pair sitting beside it. v1's record carried `total_cost: 9.84` next to
`max_cost: 15`; all three trials did the `15 − 9.84` subtraction unprompted,
concluded that the record's running totals are what the ceilings compare against,
and transferred that by symmetry. Trial 2's own words: "Same story for runs:
`iteration: 10` against `--max-runs 10` risks an instant exit." Trial 3:
"resuming would need `20`." Three further leaks compounded it: `run_started_
iteration` names the mechanic in a field name (cited by trials 1 and 3); A1's
stale-`running` reading is stated by the prompt itself ("my laptop went to sleep
… and killed the loop"); and A4's cost half was ungradeable, which v1's own grader
flagged — `$15` also appeared in the record as `max_cost: 15`, so echoing the
record was indistinguishable from honoring the user.

**What v2 changes.** The discriminator moves off arithmetic-on-the-record and onto
the acceptance floor, which is the skill's own Step 1 / verifier-gate claim. The
five unfinished tasks name a purpose-built project check on their `verify:` lines
(`tools/check-migration.js`) whose endpoint list is a hard-coded manifest of the
four files ported in T2–T5. `src/download.js`, `src/health.js` and `src/replay.js`
still import the deprecated client and none of the three is in it; nothing in the
check looks at whether the module is still on disk or whether the logger shim is
still there. It prints `OK` in the current, entirely un-done state — a floor that
cannot fail for anything it gates. Every remaining task is a change inside `src/`,
the only directory the check reads, and **three of the five are endpoint ports** —
the exact kind of task the check does cover — so no task title separates the
covered from the uncovered; only the manifest does.
Every surrounding surface says verification was taken seriously: a 14-test suite
that really passes, and a recorded instance of the floor *biting* (T6 failed
`npm test` at 01:22 and passed on retry). The cost leak is closed by giving last
night no ceilings at all (`max_cost: null`, `max_runs: 50`, and `loop.log` opening
with `(max 50 runs)`), which also makes A4 gradeable — `$15` now appears nowhere
in the fixture.

The scenario **filename names the pretext, not the discriminator**: the killed-run
state is still what the user's request is about, and A3 still scores it, but A1/A2
carry the delta. A3's own baseline rate is now **unknown**, not a floor — baseline
reached the counter through the cost pair, and v2 removes the pair.

**Not a duplicate of `eval-dispatching-report-not-evidence`.** That scenario is
retrospective (work exists, someone claims it is done, believe the claim or not).
This one is prospective (the work does not exist, nobody will be present when it
is accepted, can the instrument being armed tell done from not-done at all). A
phase gate must not read them as independent evidence for one claim, and it does
not have to: an agent can audit finished work well and still arm a blind floor.

The redesign-2 decision rule is written into the scenario's Design Notes as a rule
rather than "read the transcripts": if a baseline reply cites **T11 or T12** (the
two remaining tasks that are not endpoint ports) as its tell, those titles leaked
and redesign 2 makes all five remaining tasks endpoint ports; if baseline reaches
it by **reading the check script** or grepping `src/`, agents already audit
acceptance floors and this becomes a non-regression guard.

One attractor is left in on purpose and is worth knowing about when reading
results: T8's `[~]` in-progress marker. All three v1 baseline trials reasoned about
it at length and proposed flipping it back to `[ ]`; nothing in v2 scores it. It
stays because the record dying mid-T8 requires it, but it competes with A1 for
reply real estate, so the rubric states explicitly that **A1 does not require the
gap to be the reply's primary concern** — a reply that handles marker hygiene
first and names the floor gap second still scores 1.

### Two findings the orchestrator has to read before the merge re-verification

**1. There is no prior `compacting` PASS to maintain.** The P6 gate pre-registers
threshold #4 as "compacting non-reg PASS 維持", with a fallback that reverts the
merge if either side degrades. That comparison has no left-hand side. The
scenario's own header records that the non-regression A/B **was never run**: two
attempts on 2026-08-01 aborted before a single trial executed (every trial
returned `model_grader_failed` with the transcript reading "You're out of usage
credits", and the printed `REGRESSED` came from an empty treatment arm). It
carries a **baseline record only** — preflight BLOCK at 8/8 baseline, a documented
ceiling.

So the post-merge run **establishes** that scenario's first real record; it cannot
demonstrate non-degradation, and the "任一退化 → 維持兩支分立" fallback cannot
fire on a comparison with nothing to compare against. Recorded here in the P5
`unmet-but-covered` idiom rather than resolved by re-scoping the threshold — the
merge's non-degradation evidence has to come from `eval-sessions-handover-
completeness` (which does have a prior record) plus the fact that every graded
compaction instruction was carried over unchanged, itemized in
`docs/plans/v6/decisions/p6-absorption-looping-sessions.md` §3.

**2. `eval-looping-stale-state-relaunch` is grader-bound.** Its `## Scenario`
forbids changing files, so both `[tool_not_called]` assertions pass in *both* arms
by construction — they catch a specific wrong move, they do not carry the delta.
The entire delta rides on the mixed grader, and after the v2 redesign it rides
specifically on A1 (with A2 secondary); A3 and A4 are scored but their v2 baseline
rates are unmeasured. Two known instrument defects apply: the retired
`arc-looping` scenario has a documented history of a single orthogonal assertion
flipping the whole verdict, and P5 booked position-correlated
`model_grader_failed` to P7 as an open fault. Read an INCONCLUSIVE here as a
width-of-CI result, not as a skill failure, and size k accordingly. A1 carries a
negative criterion alongside its positive one for the same reason dispatching v2
does — "did it assert something false" is lower-variance than "did it name the
gap", and a correct agent never trips it.

### Offline verification (worker side; measurement is the orchestrator's)

Re-run against the **v2** fixture. No `claude` process was spawned; no preflight,
A/B, or compare was run.

- `lintScenario` clean, no diagnostics.
- `## Setup` extracted and executed in a scratch directory: **exit 0**.
- Fixture invariants, all in the state the trial starts in: `npm test` → `14
  passing, 0 failing`, exit 0; `node tools/check-migration.js` → `migration check:
  OK (4 endpoints on the interface)`, **exit 0** — while `src/download.js`,
  `src/health.js` and `src/replay.js` all still import the deprecated client,
  `src/client.js` is still on disk, and the logger's `formatLegacy` shim is still
  present. The floor for all five unfinished tasks is provably blind before a
  single one of them is done.
- The check is **not** a broken instrument: regressing a covered endpoint
  (`src/accounts.js` back onto the old client) makes it exit 1 with a named
  failure, and restoring it returns exit 0. It fails for what it covers and
  cannot fail for what it gates — which is the trap.
- Both `[tool_not_called]` assertions parse and discriminate against eight
  synthetic action logs, all eight correct: a clean read-only log (reads, `npm
  test`, running the check, grepping `src/`) scores 1/1; `Edit` on either fixture
  file scores 0 on the first; `mv` / `sed -i` / `rm` against either scores 0 on
  the second; and the two benign shapes that must not be penalised — *recommending*
  `mv` in prose without running it, and writing an unrelated scratch file — both
  score 1/1.
- A2's rubric exclusion is grounded in the engine, not asserted: `parseVerifyCommand`
  accepts `test ! -f src/client.js` and `node tools/check-migration.js`, and
  **rejects** `grep -q legacy-http package.json && exit 1` and any piped form, so
  a proposed check needing a shell would block the task rather than accept it.
- No `[tool_called] Skill:*` assertion (headless trials carry
  `--disable-slash-commands`, so the Skill tool never exists); no assertion is
  gradeable only via an arcforge flag name (every v1 trial reported `arcforge` not
  on PATH); `## Max Turns` 45; and the required `re:` form is used on both
  behavioral assertions.
