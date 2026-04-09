# Page Templates

## Universal Frontmatter

All page types include:

```yaml
---
type: source | entity | synthesis | moc | decision | log
created: YYYY-MM-DD
langs: [en, zh]
tags: []
aliases: []
---
```

## Bilingual Format

All wiki-layer notes are created in both English and Chinese. The format uses Obsidian callouts to separate language versions, enabling language switching on Publish via `publish.js` and locally via CSS snippet.

### Rules

1. Frontmatter includes `langs: [en, zh]` — always both languages
2. H1 title is bilingual outside callouts: `# 中文標題 / English Title`
3. Each language version wraps in `> [!multi-lang-{code}]` callout
4. Full markdown works inside callouts — wikilinks, images, lists, code blocks, Mermaid
5. No content between callouts — shared content (frontmatter, H1) goes before all callouts
6. Wikilinks point to the same file (no language suffix)
7. H2+ subheadings go inside callouts, translated to match the language

### What is NOT bilingual

- **Raw Source Ingest** frontmatter and body — immutable originals, not wiki layer
- **Log entries** — appended to daily notes, timestamped, write in whichever language the user used
- **Audit Reports** — internal tooling, English only
- **Frontmatter values** — tags, aliases, type stay in English (searchable across languages)

### Pattern

Every wiki-layer template below follows this structure. The Source template shows the full bilingual example. Other templates follow the same callout wrapping pattern — only the Source is shown fully expanded to avoid duplication.

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

## Source — Paper Variant

When the source is an academic paper (detected by: PDF with Abstract/References sections, or user explicitly says "paper"/"論文"), use this extended frontmatter and extraction template instead of the generic Source template.

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
cites: []                  # papers this one references (wikilinks if in vault, plain text if not)
cited_by: []               # papers in vault that cite this one (updated by Propagation)
tags: []
aliases: []
---
```

### Extraction Depth by Reading Status

Not every paper needs full extraction immediately. Match depth to status:

| Status | What to extract | Typical effort |
|--------|----------------|----------------|
| `queued` | Frontmatter only (title, authors, venue, year) — no body sections | 30 seconds |
| `skimmed` | + Problem, + Method (from abstract and intro) | 2 minutes |
| `deep-read` | + Claims with evidence, + Results, + Limitations | Full extraction |
| `extracted` | + Related Work parsed into `cites:`, Propagation complete | Full + graph |

When a user says "queue this paper" or shares a paper without asking for details, default to `queued`. When they say "read this" or share with discussion, default to `deep-read`.

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
- **Claim:** [statement]
  - Evidence: [strong | moderate | weak]
  - Basis: [what supports this]
  - Status: supported

## Results
[Key numbers, benchmarks, comparisons — the quantitative evidence]

## Limitations
[Authors' stated limitations + your assessment of unstated ones]

## Related Work (Graph Seeds)
[Papers cited that are worth ingesting — these become GROW suggestions.
Format as a list with brief reason:]
- Paper Title (Author, Year) — [why it matters to this paper's argument]
- Paper Title (Author, Year) — [relationship]
```

### Claim Status Values

Claims track contestation across papers:

| Status | Meaning |
|--------|---------|
| `supported` | Default — no contradicting evidence in vault |
| `contested` | Another paper in vault presents conflicting evidence |
| `superseded` | A newer paper with stronger evidence replaces this claim |
| `conditional` | Holds in some contexts but not others (note the condition) |

When Propagation finds a conflict, update the claim's status and add a cross-reference: `Contested by: [[Paper B]] — [brief reason]`.

## Entity

```yaml
---
type: entity
created: YYYY-MM-DD
langs: [en, zh]
entity_type: person | tool | concept | company | framework
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
> [Supporting points from sources]
>
> ## Open Questions
> - [What remains unresolved or worth exploring]

> [!multi-lang-zh]
> ## 論點
> [核心論點或建立的連結]
>
> ## 證據
> [來源支持的要點]
>
> ## 開放問題
> - [尚未解決或值得探索的問題]
```

Note: Mermaid diagrams and wikilink lists are language-neutral — place them outside callouts if shared, or inside each callout if labels need translation.

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

## Decision

```yaml
---
type: decision
created: YYYY-MM-DD
langs: [en, zh]
status: proposed | decided | superseded
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
> ### Option B: [Name]
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
> ### 選項 B：[名稱]
> **優點：** ...
> **缺點：** ...
>
> ## 決策
> [選擇了什麼]
>
> ## 理由
> [為什麼 — 決定性的推理]
```

## Log

Logs do not create a new file. Append to daily note via obsidian-cli:

```
## HH:MM — [Title]
[Content — brief, timestamped, factual]
```

## Raw Source Ingest

### Raw Source Frontmatter

Raw Sources are immutable originals, but they need minimal metadata for traceability. When saving a new Raw Source to the vault, include this frontmatter:

```yaml
---
source_url: ""
source_author: ""
fetched: YYYY-MM-DD
---
```

- `source_url` — Original URL or "local" for files already in the vault
- `source_author` — Author or organization name
- `fetched` — Date the content was captured (not the content's publication date)

The body is the raw content exactly as extracted — no summarization, no restructuring. The Wiki-layer Source note handles interpretation.

### What is a Raw Source?

In Karpathy's model, anything that isn't a typed wiki-layer Markdown note is a Raw Source — immutable originals that should be ingested into the wiki layer as text. Common types:

| Raw Source | Where It Lives | Example |
|-----------|---------------|---------|
| Excalidraw drawings | `Excalidraw/` | Architecture diagrams, concept maps |
| Web articles | Clipped to vault or URL | Blog posts, documentation |
| PDFs | Vault root or subfolders | Papers, reports, exported slides |
| Screenshots | Various folders | Whiteboard photos, UI captures |
| HTML exports | Vault root or subfolders | Analytics reports, dashboards |

### Extraction Methods

| File Type | Extraction Method |
|-----------|------------------|
| `.excalidraw.md` | Read `## Text Elements` section (ignore `## Drawing` compressed data) |
| `.html` | Use `defuddle` skill or read raw HTML |
| `.pdf` | Read with Claude's PDF reader (requires `poppler` — see fallback chain below) |
| `.png` / `.jpg` | Describe with Claude's vision |
| URL | **Defuddle first** (`defuddle parse <url> --md`). Only fall back to WebFetch for APIs or raw text endpoints. |
| `.md` (in Raw/) | Read full content — already markdown, no extraction needed |

### Paper URL Extraction Chain

When the source is a URL pointing to a paper (arXiv, ACL Anthology, Semantic Scholar, conference proceedings), use this priority chain — try each step in order, stop at the first success:

| Priority | Method | When it works | Why prefer it |
|----------|--------|--------------|---------------|
| **1a. Native HTML + defuddle** | `defuddle parse <html-url> --md` | arXiv (`/html/` variant, papers ~2023+), ACL Anthology, any site with native HTML rendering | Best structure: tables, math (LaTeX), no column issues. Zero dependencies. |
| **1b. ar5iv HTML + defuddle** | `defuddle parse ar5iv.labs.arxiv.org/html/<id> --md` | arXiv papers that predate native HTML rendering (~pre-2023). ar5iv is a third-party service that retroactively renders arXiv papers as HTML. | Same quality as 1a. Covers older papers that return 404 on `arxiv.org/html/`. |
| **2. PDF download + Read tool** | Download to `Raw/Papers/`, read with `Read` tool | When PDF reader works (requires `poppler`: `brew install poppler`) | Faithful to original layout. Good for text-heavy papers. |
| **3. Abstract page + defuddle** | `defuddle parse <abstract-url> --md` | Always available for arXiv, most repositories | Gets metadata + abstract. Enough for `queued` status, not for `deep-read`. |

**Common URL patterns for HTML versions:**
- arXiv (native): `arxiv.org/pdf/XXXX.XXXXX` → try `arxiv.org/html/XXXX.XXXXXvN` first
- arXiv (retroactive): if native HTML returns 404, try `ar5iv.labs.arxiv.org/html/XXXX.XXXXX`
- ACL Anthology: most papers have HTML rendering at the same URL
- Semantic Scholar: has HTML reader for many papers

**Why HTML over PDF:** PDFs lose structure when rendered — multi-column layouts cause paragraph interleaving, tables lose alignment, math formulas become garbled Unicode. HTML versions preserve the DOM structure, and defuddle extracts it cleanly as markdown. The result is more token-efficient and more accurate for LLM extraction.

**Raw Source handling:** Always download the PDF to `Raw/Papers/` regardless of which extraction method succeeds — the PDF is the canonical immutable original. The extraction method only affects how you read it for the wiki Source note.

**Why Defuddle over WebFetch for URLs:** WebFetch fetches raw HTML and runs it through an AI summarization layer — the output is AI-interpreted, not the original content. For SPA/client-rendered sites (React, Obsidian docs, etc.) it often gets only the JavaScript shell. Defuddle renders the page in a real browser and extracts the DOM as clean markdown, preserving tables, code blocks, and structure without AI interpretation. Raw Sources must be faithful to the original — AI-processed content defeats the purpose of an immutable source layer.

### Ingest Output

The result is always a **Source** note with `source_url` pointing to the original file (relative vault path or URL). Never modify the original file.

**Example:**
```
Raw Source: Excalidraw/AI/autonomous-agent-core-concepts.excalidraw.md
     ↓ Ingest
Source note: autonomous-agent-core-concepts.md
     source_url: "Excalidraw/AI/autonomous-agent-core-concepts.excalidraw.md"
```

### Detecting Un-ingested Raw Sources (used by audit GROW)

During audit, detect files that have meaningful content but no corresponding Source note:

| File Type | Meaningful content signal | Has Source note? |
|-----------|-------------------------|-----------------|
| `.excalidraw.md` | Has `## Text Elements` with text content | Check for `.md` with `source_url` pointing to it |
| `.html` | File size > 1KB | Check for `.md` with `source_url` pointing to it |
| `.pdf` | Exists in vault | Check for `.md` with `source_url` pointing to it |
| `.png` / `.jpg` | Not inside a plugin-managed folder | Check for `.md` with `source_url` pointing to it |

If no Source note exists, GROW suggests: "These files have content that hasn't been ingested — consider running ingest to create Source notes from them."

## Audit Report

```yaml
---
type: audit-report
created: YYYY-MM-DD
scope: "50 most recent" | "full vault"
tags: [audit]
---
## LINK Results
- Resolved N relationships across M notes
- [list of changes made]

## LINT Results
### Schema Issues
- [list]

### Orphan Notes
- [list]

### Stale Sources
- [list]

### Tag Issues
- [list]

### Schema Evolution
- [field usage and type fit observations]

## GROW Suggestions
### Internal (create these artifacts)
1. [highest impact suggestion]

### External (investigate these topics)
1. [search terms + reasoning]

### Open Questions (from existing notes)
1. [question + source note]
```
