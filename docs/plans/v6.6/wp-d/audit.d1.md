# Operator 稽核：D1 `eval-executing-dispatch-acceptance` V1 preflight（6.6.0 量測輪）

Repo `main` `61b19e46`。稽核只閱讀：沒有啟動 `claude`，沒有 live eval，沒有重新計分。run `20261022-091706` 的 3 份 transcript 全部讀完，對照各列的 `graderOutput`、preflight 紀錄，並在 transcript 留下疑問的地方讀了 `raw/`。本項沒有 A/B（D-068 第 5 點）。

| 項目 | 值 |
|---|---|
| 指令 | `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS=1800000 node scripts/cli.js eval preflight eval-executing-dispatch-acceptance --model 'opus[1m]' --effort xhigh --stage-skill-files --baseline-skill-file skills/core/executing/SKILL.md` |
| 開始 | 2026-10-22T09:17:06Z（第 1 列的 `timestamp`） |
| 紀錄 | `evals/preflight/bf1704589d7cb9cd-opus_1m_-exhigh-c1800000-b17fa36f1535cb446-s1ef6e3967679cf2b.json`，09:36:36Z，`k 3`、`pass_rate 1`、**BLOCK**：「Baseline pass rate 100% >= 80% ceiling」 |
| 前一次 | `7e87d69148242413-…json`（08:40Z）：3/3 `setup_failed`，0 個 session，是本輪 run 1，原因與修正見 `round.md` |

儀器限制：transcript format 2 只記工具呼叫、assistant 文字與失敗結果的 exit code，不記工具輸出，也不標記 subagent 的呼叫。下文的「主 agent／subagent」取自 `raw/` 每則訊息的 `parent_tool_use_id`（有值即 subagent）；工具輸出也取自 `raw/`。

## 條件

每一列：`opus[1m]`（raw 的 init 是 `claude-opus-5-5[1m]`）、`xhigh`、`maxTurns` 未設、`pluginDir false`、isolated、Version 1、scenario hash `bf1704589d7cb9cd`、Node `v24.13.1`、`repo_commit 61b19e46…`、`trialTimeoutMs 1800000`、`stageSkillFiles true`、`environment ["PATH^=${PROJECT_ROOT}/bin"]`、`transcript_format 2`。`baselineSkillHash` 與 `skillTextHash` 都是 `17fa36f1535cb446`，`baselineSkillFilesHash` 與 `skillFilesHash` 都是 `1ef6e3967679cf2b`，與 D-068 第 4 點登記的值相同。沒有一列帶 `alsoStaged`：preflight 跑 baseline 臂，不帶 `--also-stage`，符合 D-068 第 3 點。三列都沒被砍，raw 的 `result` 都是 `success`。

## 逐列

| 列 | 耗時 | output tokens | 回合 | `A1` | Agent 呼叫 | 主 agent 怎麼開 `specs/limiter.md` | 讀 staged `SKILL.md` | model tier | arcforge errors | trial 樹外（grader） |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 261.3 s | 13,581 | 26 | PASS | 1 | `[Tool: Bash]` L3：`find src specs test .claude -type f \| xargs … cat` | 沒有 | none | none | none |
| 2 | 409.9 s | 16,427 | 26 | PASS | 1 | 同上，L3 | 沒有 | none | none | none |
| 3 | 494.7 s | 15,941 | 28 | PASS | 1 | 同上，L3 | 沒有 | none | none | none |

三列主 agent 的 L3 輸出（raw）都含 spec 的 `## Acceptance criteria` 與三條全文。這個指令沒有寫出 `specs/limiter.md` 這個字串，所以 grader 的 `specs/limiter.md opened` 行找到的是別的 block：第 1、3 列第一筆是 subagent 的 `cat specs/limiter.md`，第 2 列第一筆是 subagent 的 `for f in … specs/limiter.md …`；三列的第二筆都是主 agent 的 commit 指令（commit 訊息裡有這個路徑）。「yes」是對的，但它指到的 block，不是主 agent 讀 spec 那一次。

grader 的 audit 行，照抄：

第 1 列：
```
A1:PASS
-- audit: specs/limiter.md opened: yes
-- audit: specs/limiter.md opened: <- [Tool: Bash] $ ls -la && find . -path ./.git -prune -o -type f -print | grep -v node_modules && cat specs/limiter.md package.json && cat src
-- audit: specs/limiter.md opened: <- [Tool: Bash] $ sed -i '' 's/^- \[~\] T2 — /- [x] T2 — /' TASKS.md && git add TASKS.md src/limiter.js test/limiter.test.js && git commit -q -
-- audit: dispatching/SKILL.md opened: no Read or Bash call names a staged SKILL.md
-- audit: agent calls: 1
-- audit: limiter dispatch: #1 writer [scored] | limiter in both | criteria 3/3 | spec path in prompt: yes | description: 'Implement rate limiter module'
-- audit: not top-level: cannot be determined: format 2 does not mark a subagent's calls, so a block carrying the criteria could in principle come from a subagent
-- audit: model tier: none
-- audit: arcforge errors: none
-- audit: outside the trial tree: none
```

第 2 列：
```
A1:PASS
-- audit: specs/limiter.md opened: yes
-- audit: specs/limiter.md opened: <- [Tool: Bash] $ for f in package.json specs/limiter.md src/server.js test/health.test.js TASKS.md; do echo "=== $f"; cat -n "$f"; done; echo 
-- audit: specs/limiter.md opened: <- [Tool: Bash] $ sed -i '' 's/^- \[~\] T2 — /- [x] T2 — /' TASKS.md && git diff TASKS.md | grep '^[-+]-' && git add TASKS.md src/limiter.js sr
-- audit: dispatching/SKILL.md opened: no Read or Bash call names a staged SKILL.md
-- audit: agent calls: 1
-- audit: limiter dispatch: #1 writer [scored] | limiter in both | criteria 3/3 | spec path in prompt: yes | description: 'Implement rate limiter per spec'
-- audit: not top-level: cannot be determined: format 2 does not mark a subagent's calls, so a block carrying the criteria could in principle come from a subagent
-- audit: model tier: none
-- audit: arcforge errors: none
-- audit: outside the trial tree: none
```

第 3 列：
```
A1:PASS
-- audit: specs/limiter.md opened: yes
-- audit: specs/limiter.md opened: <- [Tool: Bash] $ ls -la && cat specs/limiter.md && cat src/server.js && cat test/server.test.js && cat package.json && ls specs src test
-- audit: specs/limiter.md opened: <- [Tool: Bash] $ sed -i '' 's/^- \[~\] T2 — /- [x] T2 — /' TASKS.md && git add TASKS.md src/limiter.js test/limiter.test.js && git commit -q -
-- audit: dispatching/SKILL.md opened: no Read or Bash call names a staged SKILL.md
-- audit: agent calls: 1
-- audit: limiter dispatch: #1 writer [scored] | limiter in both | criteria 3/3 | spec path in prompt: yes | description: 'Implement rate limiter module'
-- audit: not top-level: cannot be determined: format 2 does not mark a subagent's calls, so a block carrying the criteria could in principle come from a subagent
-- audit: model tier: none
-- audit: arcforge errors: none
-- audit: outside the trial tree: none
```

`not top-level` 在 transcript 裡無法判斷，在 raw 裡可以：三列唯一的 Agent 呼叫都沒有 `parent_tool_use_id`，是主 agent 發的。

## D-068 第 7 點的四個計數（baseline 臂）

| 計數 | 數字 | 依據 |
|---|---|---|
| (a) 被評分的 block 不是 T2 的 writer | **0／3** | 每列只有一個 Agent 呼叫，description 是 `Implement rate limiter module`（第 1、3 列）或 `Implement rate limiter per spec`（第 2 列），prompt 的 `## Task` 是實作 `src/limiter.js`。每列都是 T2 的實作 card，發出者是主 agent |
| (b) staged-copy 行說不出讀的是哪一份 | **0／3** | 三列都是「no Read or Bash call names a staged SKILL.md」。對這一臂，這一行只能是空的：只 stage 了 `executing` 一份，它的全文已經注入，沒有第二份可混淆。第 1 列 L3、第 2 列 L5 的主 agent 對 staged 目錄跑了 `ls`，raw 的輸出只有 `SKILL.md`，是列目錄，不是讀檔；第 3 列沒碰 staged 目錄 |
| (c) 以 grader 看不到的方式寫 `src/limiter.js` | **列出的四種方式 2／3，加上 `python3` 3／3；在被評分的 block 之前 0** | 見下節 |
| (d) trial 裡 `arcforge worktree add` 失敗 | **0／3** | 三份 transcript 都沒有任何 `arcforge` 指令，baseline 沒有走 `dispatching` 的 Step 2；`arcforge errors: none` |

### (c) 逐條

每列唯一的 Agent 呼叫就是被評分的 block（第 1 列 L64、第 2 列 L53、第 3 列 L58），所以下列寫入都在它之後，不可能把 writer 推成 `after-write`，也不可能讓之後的 block 被評成 writer（之後沒有 block）。都是測試用的 mutation，事後還原。

- **第 1 列，subagent**：L457 `cp src/limiter.js /tmp/limiter-t1-orig.js`，接著 `mut()` 以 `node -e "… fs.writeFileSync('src/limiter.js', s.replace(a,b));"` 改寫 9 次，最後 `cp /tmp/limiter-t1-orig.js src/limiter.js && cmp … && echo restored`；L481 同一手法再一次（`node -e` 加 `cp` 還原）。
- **第 2 列，subagent**：L407 `node -e`，`fs.writeFileSync(file, src.replace(from, to))` 對 `src/limiter.js` 與 `src/server.js` 輪流寫 mutant，`finally` 寫回原文。L285 的 `cat > src/limiter.js <<'EOF'`（stub）是 `>`，grader 看得到。
- **第 2 列，主 agent**（驗收時）：L492

  ```
  try() { sed -i '' "$1" src/limiter.js; if npm test >/dev/null 2>&1; then echo "NOT CAUGHT: $2"; else echo "caught: $2"; fi; cp "$KEEP" src/limiter.js; }
  ```

  四個 mutant 之後 L501、L505 確認備份與 `src/limiter.js` 相同並刪除，L507 `grep -nF` 確認四個原句都在。這是三列中唯一由主 agent 寫 `src/limiter.js` 的地方。
- **第 3 列，subagent**：L468 `python3 - <<'EOF'`，`open(p,'w').write(s)`，`p='src/limiter.js'`，在 trial 樹裡改寫剛寫好的實作；`python3` 不在 D-068 列的四種方式裡，但屬於同一類。L526 在 `mktemp -d` 的複本裡用 `cp` 加 `python3` 跑 mutant，寫的是複本的 `src/limiter.js`，不是 trial 的，最後 `rm -rf "$W"`。

提到 `limiter.js` 的其他 Bash block 都只做讀取或執行：第 1 列 L493、L503（`node -e` 只 `require`）、L553（commit）；第 2 列 L443、L464、L470、L474、L509；第 3 列 L545、L549、L592、L621。

## baseline 做了什麼

**第 1 列。** L1 `cat TASKS.md`，L3 一次 `cat` 出 `src`、`specs`、`test`、`.claude` 下所有檔案。T1 自己做（test-first，L13–L56）。L60 說「hand it to a subagent. I'm specifying the interface and the window semantics in the brief」，L64 發出 card：「Implement a rate limiter in `src/limiter.js` per `specs/limiter.md` (read it — it is short). The acceptance criteria there are binding:」，接著三條原文、編號照 spec，再加上介面、sliding window 語意、測試清單與回報格式。subagent 回來後主 agent L493 看 `git status`／`diff`，L499 `Read` 實作，L503 自己跑 `npm test` 並用 `node -e` 逐條驗三條條件、外加真的 HTTP 429，L551「Accepted.」，L553 commit。主 agent 沒有寫 `src/limiter.js`。

**第 2 列。** L1、L3 同第 1 列。T1 自己做。L49「handing it to a subagent」，L53 的 card：「The spec's acceptance criteria, verbatim:」後接三條原文；任務範圍比另兩列大（同時把 limiter 接進 `src/server.js`）。L462「Before marking T2 done I'm checking its work myself」：L464–L470 看 diff 與程式，L472 `npm test` 加連跑 5 次，L474 對真的 server 打 11 個請求，L492 自己跑 4 個 mutant（見上節），L509 commit。L606 再重現 subagent 回報的 `GET //` 當掉問題，在結語列為建議的 T4。

**第 3 列。** L1、L3 同上。T1 自己做。L58 的 card：「Read that spec first; its three acceptance criteria are the contract:」後接三條原文，再加一節「Design decisions already made」（sliding log、拒絕不計數、`Math.ceil`、key 的取法）。L543「I'm not taking that on trust」：L545 看 diff，L547 讀測試，L549 的 `npm test` 加 probe 卡住，L584–L590 讀背景任務輸出後 `TaskStop`，L592 重跑 probe 驗三條，L621 commit。主 agent 沒有寫 `src/limiter.js`。

三份 card 的三條條件與 `specs/limiter.md` 逐字相同，不必靠正規化：

```
1. A burst of exactly 10 requests within 1000 ms is allowed; the 11th gets 429.
2. `Retry-After` is rounded up to whole seconds.
3. The counter key is `${ip}:${route}`, never `ip` alone.
```

三列都沒有問使用者任何問題（transcript 與 raw 都沒有 `AskUserQuestion`），都把三個 task 做完、標 `[x]`、各自 commit，結語裡的「Things you may want to decide」／「Decisions for you」，是做完之後才寫的說明，不是等待回覆。

## trial 樹外的存取

三列 grader 都印「none」。它的定義只比對 `/Users/`、`/home/`、`/Volumes/` 下不在 trial 目錄的路徑、專案根目錄、`skills/` 路徑、`../..` 與 `~/`；`/tmp` 與 `/var/folders` 不在其中。transcript 裡這兩處都有存取，全部是暫存：第 1 列 `/tmp/edge-*.log`、`/tmp/limiter-t1-*`（L601–L603 確認已刪）；第 2 列 `/tmp/server.orig.js`、`/tmp/limiter.keep.$$`（結語自己承認並確認刪除）；第 3 列 `/tmp/t1.log`、`/tmp/limiter-t3-out.txt`、`mktemp -d` 的複本，以及 L586 `Read` harness 的背景任務輸出檔 `/private/tmp/claude-501/…/tasks/b5nm4lyfu.output`。第 1、2 列另有對 staged 目錄的 `ls`（見 (b)）。沒有一列碰到 repository 或 `skills/core/dispatching`，baseline 仍是「本體不在」的那一臂。

## 判讀

判定是天花板的 BLOCK（3/3 PASS）。依 D-068 第 6 點，#184 以發現關閉；依第 5 點不重跑、不跑 A/B。三列顯示的是：只注入 `executing`、`dispatching` 不在可及範圍內的 baseline，每一次都把三條條件逐字貼進 writer 的 brief，同時也給了 spec 的路徑，還各自加了一句說明條件的地位（「binding」、「verbatim」、「the contract」）。交接句沒有東西可加：`dispatching:67`、`:71` 要求的行為，baseline 不靠它就做到了；三列也都自己驗收 subagent 的結果，跑 `npm test` 並逐條 probe。實際發生的，是設計關卡「天花板」一節列的第 1 條路，也是它稱為主要風險的那一條：條件短、是清單、spec 路徑寫在 task 裡、agent 剛讀過 spec，Opus 不必提醒就原文貼上。三列都走這一條，沒有一列走第 2、3 條（貼整份 spec、`cat` 嵌入），也沒有一列走關卡預期的失敗路（只給路徑或改寫）。

## 有爭議的標籤

沒有。3 個 PASS 依 A1 都正確：被評分的 block 是主 agent 發的 T2 實作 card，三條逐字都在，之前沒有任何 `src/limiter.js` 的寫入。

## 無法在本稽核確認的事

- 第 2 列 L492 的 mutation 後 `src/limiter.js` 是否與原文逐位元相同：transcript 不記輸出；依據是 L501 的 `cmp`、L507 的 `grep -nF` 指令與結語的陳述，以及之後 `npm test` 通過、commit 成功。第 1 列 L472、L485 的 `cmp … && echo restored` 同理。
- grader 的 `specs/limiter.md opened` 行在主 agent 只用 `find … | xargs cat` 讀 spec、而且沒有 subagent 時會印什麼：本輪三列都有 subagent 的 `cat`，沒有出現；依程式碼推斷會印「no」。
- treatment（多 stage `dispatching`）在這個 task 上會怎麼寫 card：沒有跑。
