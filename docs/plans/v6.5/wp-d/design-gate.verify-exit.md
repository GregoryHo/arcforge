# verify-exit 設計關卡，第二次（D-059 (iii)，obsidian B-10）

**判定：NOT MEASURABLE。** 6.4.0 關卡要求的三項引擎修改都已合併，但受測句子要 agent 做的事（在 skill 的 `references/` 裡執行 `uv`）會把 `.venv` 寫進 staged 複本，write guard 把它記成 `trial_wrote_repo` 並中止整個 run，scenario 沒有辦法把這個 `.venv` 移到別處。本項記為發現，花 0 個 session；PLAN 預留的 13 個 session 不動用。

本文件只閱讀程式，並在不啟動 session 的前提下執行引擎函式、`zsh` 與 `uv`（在 scratch 目錄的複本裡）。行號以 `main` 的 `c1d2da73` 為準。

## 受測的句子

`skills/core/diagramming-obsidian/SKILL.md:168-170`、`:173`（PR #267，`c5328ba4`）：

> Non-zero exit prints one line naming the cause; read it before acting. A missing dependency is setup, not corruption — do not regenerate. No `uv`: install `uv` first. No playwright or Chromium: run the setup command above. Then verify again.

「the setup command above」是 `:29`：`cd "$BASE/references" && uv sync && uv run playwright install chromium`。verify 指令是 `:165`，從同一個目錄執行（`:20-27`）。

baseline 的文字是 `c5328ba4~1`（`0bcd2e87`）的 `SKILL.md:168`、`:171`：「Non-zero exit means format corruption or a render mismatch. … On failure, regenerate …」。`git show` 取出後與現行版 `diff`，只差這兩處；`references/` 從 #267 之後沒有只屬於某一臂的變動，兩臂可以共用現行的 `references/`。

## 6.4.0 關卡的六項事實，對新引擎逐項回答

**事實 1（treatment 只拿到 `SKILL.md` 的文字）：已解決。** `--stage-skill-files` 讓每個被注入的臂拿到一份 skill 目錄的複本與 base-directory 行（`scripts/lib/eval.js:293-299`、`scripts/lib/eval-skill-staging.js:271-292`）。離線執行 `buildInjection`：注入文字的第一行是 `Base directory for this skill: <tmpdir>/arcforge-eval-skill-<pid>-…`，複本含 `SKILL.md` 與 `references/` 的 15 個項目。`--append-system-prompt` 把這個目錄列為唯一例外，並寫明「must not write to it」（`scripts/lib/eval-trial.js:489-495`）。

**事實 2（treatment 解析不到 `references/`）：已解決。** `SKILL.md:20-23` 要 agent 從那一行解析 `references/`，那一行現在存在。

**事實 3（script 只能靠 fixture 或逃逸進 trial）：已解決，逃逸的路仍在。** 兩文字 A/B 之下兩臂各有自己的複本（`eval.js:298-299`；baseline 的取自它那份檔案所在的目錄，`scripts/cli/eval-skill-options.js:43-61`）。trial 目錄仍在 `<projectRoot>/.eval-trials/` 底下，`../../skills/core/diagramming-obsidian/references/` 仍在磁碟上，擋住它的仍只有那句建議；讀取不會被 write guard 發現。

**事實 4（缺相依套件的出口無法由 scenario 製造）：部分解決。**

- Chromium：`PLAYWRIGHT_BROWSERS_PATH=${TRIAL_DIR}/…` 是合法宣告（`scripts/lib/eval-trial-environment.js:83-95`、`:278-290`），指到空目錄就沒有 Chromium。`references/.venv` 不會被複製（`eval-skill-staging.js:29`、`:199-208`；離線確認複本裡沒有）。
- `uv`：內建的 `PATH` 是 shim 目錄加四個系統目錄（`eval-trial-environment.js:20`、`:399-402`），shim 只有 `claude`、`node`、`npm`、`npx`、`python3`（`:190-196`）。在這台主機上以這個環境執行 `sh -c 'command -v uv'` 是空的，所以引擎交出去的 `PATH` 確實沒有 `uv`。
- 但 `uv` 在 `~/.local/bin/uv`，而以同一個 `PATH` 啟動 `zsh -i` 或 `zsh -l`，`command -v uv` 都回到 `~/.local/bin/uv`（`PATH` 被 rc 檔重建成 23、28 項）。這台主機最新的 Claude Code shell snapshot（`~/.claude/shell-snapshots/`）裡有一行含 `.local/bin` 的 `PATH`。eval B-18 的 Residual 已經寫明 Claude Code 建 snapshot 時會讀 rc 檔。
- `PATH-=` 幫不上忙：它只從引擎建好的 `PATH` 移除項目（`:361`），rc 檔之後加回來的不歸它管；值也不能寫 `~` 或 `${HOME}`（`:242-245`；離線確認 `PATH-=${HOME}/.local/bin` 被拒絕），只能把 operator 的絕對路徑寫進 scenario。

**事實 5（照句子安裝會改到 trial 之外，之後的 trial 不再獨立）：快取已解決，`.venv` 沒有，而且成了新的阻斷點。**

- `UV_CACHE_DIR`、`UV_INSTALL_DIR`、`XDG_BIN_HOME`、`PLAYWRIGHT_BROWSERS_PATH` 都能指到 `${TRIAL_DIR}` 底下（`eval-trial-environment.js:83-95`；離線確認這四行被接受），trial 目錄每個 trial 結束時移除（`eval.js:185-187`）。
- `uv` 的專案環境不在其中。在 scratch 目錄的 `references/` 複本裡執行 `uv run --offline python -c …`（uv 0.10.11）：輸出「Creating virtual environment at: .venv」，`sys.prefix` 是 `<複本>/references/.venv`，`uv.lock` 沒變，沒有別的新檔。所以 `:29` 的 `uv sync` 與 `:165` 的 `uv run` 都會在 staged 複本裡建立 `references/.venv`。
- write guard 會看到它。`eval-trial-guard.js:26` 跳過的名稱只有 `.git`、`node_modules`、`.eval-trials`；staged 目錄在每個 trial 的監看清單內（`eval.js:303`、`eval-trial.js:239`）。離線對一份 staged 複本寫入 `references/.venv/pyvenv.cfg`：`watchForWrites` 回報 1 個變動，`changedCopies` 回報 0 個（digest 跳過 `.venv`，`eval-skill-staging.js:29`）。eval B-19 的 Residual 寫的就是這個不對稱。
- 被看到的後果：該列是 `trial_wrote_repo`、`infraError: true`（`eval-trial.js:329-338`），`stopIfTrialWroteRepo` 接著丟出錯誤，run 結束（`:429-441`；A/B 在 `eval.js:210`，preflight 在 `scripts/lib/eval-preflight.js:237`）。
- scenario 無法把 `.venv` 移走：`UV_PROJECT_ENVIRONMENT` 不在可宣告的清單內，離線確認被拒絕（`eval-trial-environment.js:278-282`）。
- 就算 guard 放行，staged 複本是每個 run 建一次、同一臂的所有 trial 共用（`eval.js:291-299`，`:335` 才移除）。trial 1 建好的 `.venv` 會留給 trial 2，6.4.0 事實 5 的「trial 之間不再獨立」原樣重現。
- Setup 的 30 秒上限沒變（`scripts/lib/eval-trial-env.js:99`），Setup 也拿不到 staged 目錄的路徑。

**事實 6（trial 裡沒有 Obsidian）：不變。** fixture 放一個格式正確的 manual-fallback `.excalidraw.md` 即可，這一項本來就不是阻礙。

**對照組（no-skill baseline 很可能在天花板）：已解決。** `--baseline-skill-file` 讓 baseline 注入舊文字（`eval.js:298`）；`eval preflight` 接受同一組旗標並跑那一臂（`scripts/cli/eval-command.js:272-275`）。離線以 `c5328ba4~1` 的 `SKILL.md` 加現行 `references/` 組出 baseline 目錄：文字 hash `f7631c9db741b2c6`，目錄 digest `51b22b8e09b55916`，preflight 紀錄檔名會是 `<hash>-opus_1m_-exhigh-bf7631c9db741b2c6-s51b22b8e09b55916.json`。現行目錄是文字 `51fe7cc9f5373b7e`、digest `42ec93e5d9d42cec`。

**另外兩點沒有變。** (1) `:165` 的指令是 `uv run python verify_saved_diagram.py`；沒有 `uv` 時失敗的是 shell（exit 127），verifier 沒有執行，不會印 `VERIFY FAILED:`，它自己那句 `` `uv` not found on PATH `` 只在內層呼叫 renderer 時出現（`verify_saved_diagram.py:156-160`）。(2) transcript 沒有工具輸出（`scripts/lib/eval-transcript.js:43-51`），grader 看不到 verifier 印了哪一行，只看得到 agent 下了什麼指令與 vault 檔的雜湊。

## 逐題回答

**在這台主機的 trial 裡，`uv` 與 Chromium 解析不到嗎？** Chromium 可以由 `PLAYWRIGHT_BROWSERS_PATH` 做到解析不到，這不依賴 `PATH`。`uv` 無法在離線條件下證明解析不到，手上的離線證據指向相反：只要 trial 的 shell 讀了 rc 檔，`uv` 就回來。PLAN 與 D-062 的 Residual 都規定，證明不了缺席就判 NOT MEASURABLE；真 trial 是唯一的證明，而本關卡不得花 session。

**那就不靠 `uv` 缺席，只做 Chromium 缺席呢？** 這是唯一能穩定重現的缺相依套件分支，也是句子真正會被用到的地方：`uv` 在、`uv run` 建好 venv、renderer 找不到 Chromium，印出 `Chromium not installed for Playwright. Run: cd … && uv run playwright install chromium`（`render_excalidraw.py:219`），verifier 以 `VERIFY FAILED:` 非零退出。但走到這一行之前，`uv run` 已經在 staged 複本裡建了 `.venv`（事實 5）。兩臂在句子產生分歧之前就各自成為 `trial_wrote_repo`，run 在第一個 trial 中止，preflight 沒有可計分的列（`eval-preflight.js:247-255` 判 BLOCK）。

**`uv` 真的缺席的話呢？** treatment 照句子「install `uv` first」裝好，再照「verify again」執行 `uv run`，同樣在 staged 複本裡建 `.venv`。把句子完整做完的 treatment 會被記成儀器錯誤並中止 run；沒做完的 treatment（只回報缺 `uv`）沒有「安裝後再 verify」可以評分。

**grader 只看決策點（vault 檔的雜湊有沒有變）可以嗎？** 雜湊是可靠的訊號，但能留下計分列的只有從頭到尾沒成功執行過 `uv` 的 trial。那些列量到的是 agent 在 `command not found` 之後有沒有重畫，不是讀了 verifier 那一行之後的決定。

**baseline 與 treatment 在這裡還有沒有行為上的差異可量？** 有，句子本身沒問題：舊文字把所有非零退出都說成檔案損毀並要求重新產生，新文字要求先讀那一行。受阻的是儀器，不是主張。

## 仍然無法重現的部分

1. 在 staged 的 `references/` 裡執行 `uv`，而不寫進 staged 複本。這一項直接決定判定。
2. `uv` 在真 trial 的 shell 裡解析不到。離線證據指向它解析得到。
3. verifier 印出的那一行。transcript 不留工具輸出。

## 判定

NOT MEASURABLE。6.4.0 關卡要求的三項修改（staged skill 檔、trial 環境宣告、兩文字 A/B）都在，事實 1、2、3、6 與對照組的問題不再成立。剩下的阻斷點是事實 5 的後半：句子要求的安裝與 verify 會在 staged 複本裡建立 `.venv`，write guard 中止 run，`## Environment` 不接受 `UV_PROJECT_ENVIRONMENT`。`uv` 的缺席另外無法在不花 session 的條件下證明。

## 帳本用的發現文字

> `diagramming-obsidian` verify-exit 句子（#267，`SKILL.md:168-173`）：6.5.0 離線設計關卡再次判定無法量測，未花 session。6.4.0 關卡列出的三項引擎修改已合併並離線確認可用：`--stage-skill-files` 給每臂一份 skill 目錄與 base-directory 行，`--baseline-skill-file` 讓 baseline 注入 #267 之前的文字，`## Environment` 能把 uv 與 playwright 的快取指進 trial。阻斷點換了一個：句子要 agent 在 skill 的 `references/` 執行 `uv sync` 與 `uv run`，uv 0.10.11 會在那個目錄建立 `.venv`，那個目錄現在是 staged 複本，write guard 看得到 `.venv`（digest 看不到），該列成為 `trial_wrote_repo` 並中止 run；`UV_PROJECT_ENVIRONMENT` 不在 scenario 可宣告的變數內。staged 複本又是同一臂所有 trial 共用，就算放行，第一個 trial 裝好的環境也會留給下一個。另外，引擎建的 `PATH` 沒有 `uv`，但這台主機以同一個 `PATH` 啟動會讀 rc 檔的 zsh，`uv` 就回到 `~/.local/bin`；缺席沒有在真 trial 裡證明。這句仍以文字出貨。

## 要怎樣的引擎修改才量得到

1. **讓 venv 落在 trial 內**：把 `UV_PROJECT_ENVIRONMENT` 加進 `TRIAL_DIR_VARS`（`eval-trial-environment.js:83-95`），scenario 宣告 `UV_PROJECT_ENVIRONMENT=${TRIAL_DIR}/.venv-diagram`。這同時解決 guard 與「同臂的 trial 共用環境」兩件事。只讓 guard 在 staged 複本裡跳過 `.venv` 不夠，環境仍會從一個 trial 留到下一個。這個變數是否在 agent 的 shell 裡保持原值，要在真 trial 驗證。
2. **不依賴 `uv` 缺席**：受測分支改成 Chromium 缺席（`PLAYWRIGHT_BROWSERS_PATH` 指到 trial 內的空目錄），`uv` 反而要確定解析得到。eval B-18 要求的「在真 trial 裡示範缺席」就不再是這項量測的前提。
3. **transcript 保留工具輸出**，或至少保留 `Bash` 的 exit code，grader 才能把「讀了那一行之後安裝」與「沒看就安裝」分開。沒有這項仍可量（雜湊加指令序列），只是證據較弱。

到位之後的骨架沿用 6.4.0 關卡的方向：fixture 放格式正確的 manual-fallback `.excalidraw.md`，prompt 請 agent 確認它能在 Obsidian 打開；兩臂都 stage；grader 看 vault 檔雜湊不變，且指令序列裡有 `playwright install chromium` 之後的第二次 verify。這只是方向，不是本輪的設計。
