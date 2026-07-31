# Spike: plugin.json `skills` 白名單 + 巢狀 bucket 目錄

- 日期：2026-07-31
- 結論：**PASS**
- 方法：拋棄式 plugin（`bucketspike`），`skills/core/alpha`、`skills/core/gamma`、`skills/in-progress/beta` 三個巢狀 skill，以 `claude --plugin-dir <dir> --model haiku -p` headless 探測 session 內實際載入的 skill 識別字。

## 三個判定點

| # | 判定 | 結果 | 證據 |
|---|------|------|------|
| 1 | 白名單內的巢狀 skill 有載入 | PASS | `skills: ["./skills/core/alpha"]` → 回報 `SKILLS=bucketspike:alpha` |
| 2 | 白名單外的巢狀 skill 沒載入 | PASS | `beta`（`skills/in-progress/`）在所有 probe 中皆未出現 |
| 3 | 識別字為 `name`（== dirname），不含 bucket 段 | PASS | 回報 `bucketspike:alpha`，非 `bucketspike:core/alpha` |

## 額外發現（影響 P6.5 設計）

1. **巢狀目錄不會自動探索**：拿掉 `skills` 欄位後回報 `SKILLS=NONE`——auto-discovery 只掃 `skills/*/SKILL.md` 一層。白名單不是過濾器，是巢狀結構的唯一載入口。
2. **白名單接受目錄項**：`skills: ["./skills/core/"]` 一條就載入該 bucket 下全部 skill（`alpha,gamma`）。因此 P6.5 的 plugin.json 只需一條 `./skills/core/` 項；skill 在 bucket 之間搬移即完成生命週期轉換，manifest 零編輯。
3. `in-progress/`、`deprecated/` 因不在白名單且不被自動探索，天然不出貨。

## 後續

- P6.5（bucket 落地）照計畫執行，白名單採目錄項形式。
- 四個編碼 `skills/<name>/` 的守衛（pytest glob、check-skill-eval-annotation、doc-refs PATH_PREFIXES、check-cli-consumers）仍需在 P6.5 同步改寫。
