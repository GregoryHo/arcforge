---
type: schema
created: <YYYY-MM-DD>
scope: type definitions for <Vault Name>
preset: llm-wiki
---

# <Vault Name> — Domain Schema

This vault uses the Karpathy LLM Wiki pattern: 6 typed notes in the
Wiki layer, immutable Raw Sources separately. AGENTS.md governs runtime
behavior; this file declares the data shapes.

## Universal Frontmatter

Every typed wiki-layer note has at least:

```yaml
---
type: source | entity | synthesis | moc | decision | log
created: YYYY-MM-DD
langs: [en, zh]
tags: []
aliases: []
---
```

This vault is **bilingual** by default (per AGENTS.md `## Language Policy`).
See `## Bilingual Format` below for callout structure. Raw Sources are NOT
bilingual.

## Bilingual Format

### Rules

1. Frontmatter includes `langs: [en, zh]`.
2. H1 is bilingual outside callouts: `# 中文標題 / English Title`.
3. Each language version wraps in `> [!multi-lang-{code}]` callout.
4. Full markdown works inside callouts — wikilinks, images, lists, code blocks, Mermaid.
5. No content between callouts — shared content (frontmatter, H1) goes before all callouts.
6. Wikilinks point to the same file (no language suffix).
7. H2+ subheadings go inside callouts, translated to match.

### What is NOT bilingual

- **Raw Source Ingest** frontmatter and body — immutable originals.
- **Log entries** — appended to daily notes; whichever language the user used.
- **Audit Reports** — internal tooling, English only.
- **Frontmatter values** — tags, aliases, type stay canonical (English).

## Source

```yaml
---
type: source
created: YYYY-MM-DD
langs: [en, zh]
source_url: ""
source_author: ""
tags: []
aliases: []
---
```

```markdown
# 來源標題 / Source Title

> [!multi-lang-en]
> ## Summary
> [2-3 sentence overview of the source material]
>
> ## Key Takeaways
> - [Most important points, not exhaustive]
>
> ## Raw Notes
> [Detailed extraction — quotes, data, arguments worth preserving]

> [!multi-lang-zh]
> ## 摘要
> [2-3 句概述來源材料]
>
> ## 重點
> - [最重要的要點，非詳盡列表]
>
> ## 原始筆記
> [詳細摘錄 — 值得保留的引用、數據、論點]
```

### Visual Guidance — Source

- **Embed (always):** If the raw source is an image (`.png`, `.jpg`) or
  Excalidraw diagram, add `![[filename]]` inside the Raw Notes / 原始筆記
  section of the matching language callout.
- **Mermaid (rare):** Only if the source describes a system with 3+
  components and directional data flow. Place outside callouts.
- **Excalidraw:** Never auto-generate. If the source itself is an
  Excalidraw file, embed it; don't recreate it.

## Source — Paper Variant

When the source is an academic paper (PDF with Abstract/References, or
user explicitly says "paper"/"論文"), use this extended frontmatter and
extraction template instead of the generic Source.

```yaml
---
type: source
created: YYYY-MM-DD
langs: [en, zh]
source_url: ""
source_author: []          # list — papers have multiple authors
venue: ""                  # conference or journal name
year: null                 # publication year
methodology: ""            # empirical | theoretical | survey | meta-analysis
reading_status: queued     # queued | skimmed | deep-read | extracted
cites: []                  # papers this one references
cited_by: []               # papers in vault that cite this one (LINK updates)
tags: []
aliases: []
---
```

### Extraction Depth by Reading Status

| Status | What to extract | Typical effort |
|---|---|---|
| `queued` | Frontmatter only | 30 seconds |
| `skimmed` | + Problem, + Method (from abstract and intro) | 2 minutes |
| `deep-read` | + Claims with evidence, + Results, + Limitations | Full extraction |
| `extracted` | + Related Work parsed into `cites:`, Propagation complete | Full + graph |

When the user says "queue this paper" or shares a paper without asking
for details, default to `queued`. When they say "read this" or share
with discussion, default to `deep-read`.

### Paper Body Template (deep-read and above)

```markdown
## Problem
[What gap or question does this paper address?]

## Method
[Approach, technique, dataset, experimental setup]

## Claims
- **Claim:** [statement]
  - Evidence: [strong | moderate | weak]
  - Basis: [what supports this — sample size, benchmarks, proofs]
  - Status: supported

## Results
[Key numbers, benchmarks, comparisons]

## Limitations
[Authors' stated limitations + your assessment of unstated ones]

## Related Work (Graph Seeds)
- Paper Title (Author, Year) — [why it matters to this paper's argument]
```

### Claim Status Values

| Status | Meaning |
|---|---|
| `supported` | Default — no contradicting evidence in vault |
| `contested` | Another vault paper presents conflicting evidence |
| `superseded` | A newer paper with stronger evidence replaces this claim |
| `conditional` | Holds in some contexts but not others (note the condition) |

### Visual Guidance — Paper

- **Embed (always):** If the PDF was downloaded to `Raw/Papers/`, embed
  the first key figure: `![[paper-figure1.png]]`.
- **Mermaid (when 3+ papers in `cites:`):** Generate a citation
  relationship graph. Place outside callouts. Use `graph LR`.
- **Excalidraw (suggest for deep-read):** When a paper has complex
  multi-stage methodology, suggest delegation. Do not auto-create.

## Entity

```yaml
---
type: entity
created: YYYY-MM-DD
langs: [en, zh]
entity_type: person | tool | concept | framework | company
tags: []
aliases: []
---
```

```markdown
# 實體名稱 / Entity Name

> [!multi-lang-en]
> ## What It Is
> [Concise definition — what would someone need to know in 30 seconds]
>
> ## Properties
> [Key attributes — depends on entity_type]
>
> ## Relationships
> [Plain text descriptions — auditor resolves into wikilinks later]

> [!multi-lang-zh]
> ## 定義
> [簡潔定義 — 30 秒內需要知道的內容]
>
> ## 屬性
> [關鍵特徵 — 取決於 entity_type]
>
> ## 關係
> [純文字描述 — 審計模式稍後將其轉為 wikilinks]
```

### Visual Guidance — Entity

- **Embed:** Logo, screenshot, or photo at top of each language callout.
- **Mermaid (only for tool/framework entities):** When `entity_type` is
  `tool` or `framework` and the entity has 3+ components, add a
  component diagram. Place outside callouts. Concepts, people, and
  companies rarely benefit.
- **Canvas (suggest for hub entities):** If an entity has relationships
  to 8+ other vault notes, suggest a Canvas.

## Synthesis

```yaml
---
type: synthesis
created: YYYY-MM-DD
langs: [en, zh]
sources: []
tags: []
aliases: []
---
```

```markdown
# 綜合標題 / Synthesis Title

> [!multi-lang-en]
> ## Thesis
> [The core argument or connection being made]
>
> ## Evidence
> [Supporting points from sources — for syntheses with 3+ sources, end
> key factual paragraphs with [[Source-Note]] wikilink markers per
> AGENTS.md Synthesis Citation Rules.]
>
> ## Open Questions
> - [What remains unresolved or worth exploring]

> [!multi-lang-zh]
> ## 論點
> [核心論點或建立的連結]
>
> ## 證據
> [來源支持的要點 — 當 sources >= 3 時，關鍵段落需以 [[Source-Note]] inline cite]
>
> ## 開放問題
> - [尚未解決或值得探索的問題]
```

### Visual Guidance — Synthesis

Synthesis is the most visual-friendly type — it connects ideas, which
means relationships are its core content. Generate Mermaid by default;
only skip when the synthesis is purely explanatory.

- **Mermaid (default when 3+ entities OR 3+ sources):** Two scenarios:
  - **Query-as-Ingest syntheses** (user insights, no cited sources): use
    entities named in the thesis. `sources: []` is normal — don't let it
    block Mermaid generation.
  - **Vault-distilled syntheses** (`sources:` populated): use cited
    source titles as nodes; show how they support / contradict / extend
    the thesis.
  Place outside callouts. Use `graph TD` for hierarchies, `graph LR` for
  flow, subgraphs to group related entities.
- **Excalidraw (suggest for complex syntheses):** 5+ concepts across
  domains with spatial layout Mermaid can't capture.
- **Embed:** Re-embed source images relevant to the argument.

**Anti-pattern:** Skipping Mermaid because "the layered architecture is
simple enough for prose." If the synthesis IS about relationships, the
shape makes the insight instantly graspable.

## MOC (Map of Content)

```yaml
---
type: moc
created: YYYY-MM-DD
langs: [en, zh]
scope: ""
tags: []
aliases: []
---
```

```markdown
# 主題地圖 / Topic MOC

> [!multi-lang-en]
> ## Overview
> [What this map covers and why it exists]
>
> ## Core Notes
> [Organized list — audit mode populates wikilinks]
>
> ## Frontier
> [Areas not yet explored — gaps worth filling]

> [!multi-lang-zh]
> ## 概述
> [此地圖涵蓋的內容及其存在的原因]
>
> ## 核心筆記
> [分類列表 — 審計模式填入 wikilinks]
>
> ## 前沿
> [尚未探索的領域 — 值得填補的缺口]
```

### Visual Guidance — MOC

- **Mermaid (default when 4+ core notes):** Topic map showing how core
  notes cluster and relate. Place outside callouts.
- **Canvas (suggest when 8+ notes):** "This MOC covers N notes — want a
  Canvas for spatial exploration?"
- **Embed:** Rarely applicable — MOCs are about connections.

## Decision

```yaml
---
type: decision
created: YYYY-MM-DD
langs: [en, zh]
status: proposed | accepted | superseded
tags: []
aliases: []
---
```

```markdown
# 決策標題 / Decision Title

> [!multi-lang-en]
> ## Context
> [Why this decision is needed — what prompted it]
>
> ## Options
>
> ### Option A: [Name]
> **Pros:** ...
> **Cons:** ...
>
> ## Decision
> [What was chosen]
>
> ## Rationale
> [Why — the reasoning that tipped the scale]

> [!multi-lang-zh]
> ## 背景
> [為什麼需要這個決策 — 觸發因素]
>
> ## 選項
>
> ### 選項 A：[名稱]
> **優點：** ...
> **缺點：** ...
>
> ## 決策
> [選擇了什麼]
>
> ## 理由
> [為什麼 — 決定性的推理]
```

### Visual Guidance — Decision

- **Mermaid (when 3+ options):** Comparison flowchart. For 2 options, a
  text table is clearer.
- **Embed:** Screenshots, mockups, or benchmark charts.
- **Excalidraw:** Rarely needed; only for architectural decisions.

## Log

Logs do not create a new file. Append to daily note via obsidian-cli (or
`log.md` if no Daily Notes plugin):

```
## HH:MM — [Title]
[Content — brief, timestamped, factual]
```

### Visual Guidance — Log

No visuals. Logs are timestamped text appended to daily notes. Diagrams
break chronological flow.

## Raw Source

This vault adopts the Raw Source pattern (per AGENTS.md). Raw Sources
are immutable originals (PDFs, screenshots, Excalidraw, HTML, articles)
under `Raw/<topic>/` or `Excalidraw/<topic>/`. The skill's
`references/page-templates.md` defines the generic Raw Source frontmatter
(including `sha256` for drift detection):

```yaml
---
source_url: ""
source_author: ""
fetched: YYYY-MM-DD
ingested: YYYY-MM-DD
sha256: ""
---
```

Body is hashed AFTER frontmatter (UTF-8, line endings normalized to
`\n`). On re-ingest, skill compares new sha256 to stored value: skip
(unchanged) or flag drift (changed) per
`references/page-templates.md`. Audit's Source Drift Check re-applies
this rule across the vault.

## Audit Report

Saved as `_audits/audit-YYYY-MM-DD-<scope>.md`:

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---
```

Standard sections: LINK Results, LINT Results (Schema, Source Drift,
Orphans, Tag, Schema Evolution), GROW Suggestions (Internal, External,
Open Questions). The skill `references/audit-checks.md` documents the
generic shell.
