#!/usr/bin/env bash
# router-matrix-probe.sh — P6 觸發矩陣 probe（預登門檻 1 的量測儀器）。
#
# 兩個表面，逐列 k=3：
#   A 面（gate 依據）：把 skills/using/SKILL.md 全文注入 system prompt，
#       量「給定 Skill Map，情境會被選到正確的列嗎」。
#   B 面（診斷，不 gate）：只注入各 skill 的 name+description（model-invoked
#       的實際發現面），量 description register 的觸發品質。
#
# 列命中 = 3 trials 中 ≥2 次回應含正確 /name token。
# gate：A 面總命中率 ≥ 80%（docs/plans/v6/progress.md P6 預登門檻，開跑前寫死）。
#
# headless claude 無 Skill tool（P3 記錄於 eval-d1-bare-cli-invocation.md），
# 因此以文字指名量測；--disable-slash-commands 對齊 eval harness 模態。
#
# USAGE: bash tests/e2e/router-matrix-probe.sh [work-dir]
# 證據落在 <work-dir>/：per-trial 原始輸出、matrix-results.tsv、summary.txt。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="${1:-$(mktemp -d "${TMPDIR:-/tmp}/arcforge-router-matrix-XXXXXX")}"
MATRIX="${REPO_ROOT}/tests/e2e/router-matrix.tsv"
K=3
THRESHOLD_PCT=80
mkdir -p "${WORK_DIR}"

ROUTER_BODY="$(cat "${REPO_ROOT}/skills/using/SKILL.md")"

# B 面：從每支 skill 的 frontmatter 萃取 name + description（真實發現面）。
DESCRIPTIONS="$(node -e '
const fs=require("fs"),path=require("path");
const dir=path.join(process.argv[1],"skills");
for(const d of fs.readdirSync(dir).sort()){
  const f=path.join(dir,d,"SKILL.md");
  if(!fs.existsSync(f))continue;
  const s=fs.readFileSync(f,"utf8");
  const m=s.match(/^---\n([\s\S]*?)\n---/);
  if(!m)continue;
  const name=(m[1].match(/^name:\s*(.+)$/m)||[])[1];
  let desc=(m[1].match(/^description:\s*([\s\S]*?)(?=\n[a-z-]+:|$)/m)||[])[1]||"";
  desc=desc.replace(/\s+/g," ").replace(/^["'\''"]|["'\''"]$/g,"").trim();
  if(name)console.log("- /"+name.trim()+": "+desc);
}' "${REPO_ROOT}")"

INSTR='你是在一個安裝了 arcforge skill toolkit 的 session 裡。根據下面的情境，回答哪一個 arcforge skill 適用。只回答一個 skill 名稱 token（例如 /tdd）；若沒有任何 skill 適用，回答 none。不要解釋。'

run_trial() { # $1=system-prompt $2=situation → stdout
  claude -p --disable-slash-commands \
    --append-system-prompt "$1" \
    --model sonnet --max-turns 1 \
    "${INSTR}

情境：$2" 2>/dev/null
}

RESULTS="${WORK_DIR}/matrix-results.tsv"
printf 'surface\texpected\thits\tk\trow_pass\n' > "${RESULTS}"

declare -i a_pass=0 b_pass=0 rows=0
row_idx=0
while IFS=$'\t' read -r expected situation; do
  [ -z "${expected}" ] && continue
  rows+=1; row_idx=$((row_idx+1))
  for surface in A B; do
    if [ "${surface}" = A ]; then
      sys="以下是本 toolkit 的 router skill 內容：

${ROUTER_BODY}"
    else
      sys="以下是本 toolkit 可用的 skills（名稱與描述）：

${DESCRIPTIONS}"
    fi
    hits=0
    for t in $(seq 1 ${K}); do
      out="$(run_trial "${sys}" "${situation}")"
      printf '%s\n' "${out}" > "${WORK_DIR}/row${row_idx}-${surface}-t${t}.txt"
      # 命中 = 輸出含正確 token 且不含其他 /skill token 的誤指（寬鬆：只驗正確 token 在場）
      if printf '%s' "${out}" | grep -qF -- "${expected}"; then hits=$((hits+1)); fi
    done
    pass=false; [ "${hits}" -ge 2 ] && pass=true
    printf '%s\t%s\t%d\t%d\t%s\n' "${surface}" "${expected}" "${hits}" "${K}" "${pass}" >> "${RESULTS}"
    if [ "${pass}" = true ]; then
      [ "${surface}" = A ] && a_pass+=1 || b_pass+=1
    fi
    printf '  row %2d %-22s [%s] hits=%d/%d %s\n' "${row_idx}" "${expected}" "${surface}" "${hits}" "${K}" "${pass}"
  done
done < "${MATRIX}"

a_pct=$(( a_pass * 100 / rows )); b_pct=$(( b_pass * 100 / rows ))
{
  echo "rows=${rows} k=${K}"
  echo "surface A (router map, gate): ${a_pass}/${rows} = ${a_pct}% (threshold ${THRESHOLD_PCT}%)"
  echo "surface B (descriptions, diagnostic): ${b_pass}/${rows} = ${b_pct}%"
} | tee "${WORK_DIR}/summary.txt"

[ "${a_pct}" -ge "${THRESHOLD_PCT}" ] && { echo "MATRIX: PASS"; exit 0; } || { echo "MATRIX: FAIL"; exit 1; }
