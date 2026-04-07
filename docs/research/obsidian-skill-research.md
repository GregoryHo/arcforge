# Obsidian Skill Research

## Landscape

### Official Obsidian Skills (kepano/obsidian-skills)
- **obsidian-markdown**: OFM syntax (wikilinks, embeds, callouts, properties, tags)
- **obsidian-cli**: Vault operations via official CLI (v1.12+, requires running Obsidian)
- **obsidian-bases**: Database-like views (.base files) with filters, formulas, summaries
- **json-canvas**: Visual mind maps/flowcharts (.canvas files, JSON Canvas Spec 1.0)
- **defuddle**: Clean markdown extraction from web pages

These skills teach agents *how to write* Obsidian file formats correctly. They do NOT orchestrate *what* to create or *how* to connect knowledge.

### coleam00/excalidraw-diagram-skill
- Generates professional Excalidraw diagrams from natural language
- Design-first workflow: concept mapping → visual pattern selection → section-by-section generation → mandatory render-validate loop
- Uses Playwright + headless Chromium for rendering to PNG
- Key patterns: isomorphism test ("would structure alone communicate the concept?"), semantic color palette, descriptive IDs, evidence artifacts
- Builds large diagrams section-by-section with namespaced seeds

### Obsidian CLI (Official, v1.12.4+)
- 80+ commands across files, properties, search, tags, links, daily notes, plugins, developer tools
- Killer feature: file moves auto-update wikilinks (vs. raw filesystem ops)
- Commands: `obsidian search`, `obsidian daily:append`, `obsidian files sort=modified`, `obsidian eval`
- Desktop only, auto-launches Obsidian on first command

### MCP Servers
- **mcp-obsidian**: REST API via Local REST API plugin
- **obsidian-cli-mcp**: Wraps official CLI (zero network deps, fully local)
- **obsidian-mcp**: Direct vault access

## Philosophy

### kepano's "File Over App"
Files > tools. Plain text in accessible formats ensures longevity. AI agents can read/write plain text directly.

### "Neurons" Concept
Not a specific plugin — the Zettelkasten metaphor where notes = neurons, links = synapses, graph view = neural network.
- **Neural Composer** plugin: Graph RAG integration for relationship discovery
- **InfraNodus**: Network science metrics for vault graphs

## Community Best Practices

1. **CLAUDE.md as bootstrap** — vault structure, conventions, note formats at root
2. **Three-layer architecture**: Context (vault) → Skills (reusable workflows) → Automation (hooks/triggers)
3. **Metadata discipline**: Consistent frontmatter, clear folders, wikilinks over bare refs
4. **Common workflows**: Research synthesis, inbox triage, task extraction, daily note augmentation

## Karpathy's LLM Wiki (Key Influence)

Source: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

**Core thesis**: Replace stateless RAG with a persistent, compounding wiki maintained by LLMs.

### Three-Layer Architecture
1. **Raw Sources** (immutable): Original documents, articles, papers
2. **The Wiki** (LLM-maintained): Markdown summaries, entity pages, concept pages, synthesis
3. **The Schema** (configuration): CLAUDE.md documenting wiki structure and workflows

### Key Operations
- **Ingest**: New source → LLM reads, writes summary, updates 10-15 related wiki pages, logs entry
- **Query**: Search wiki → synthesize answer → file valuable outputs back as new pages
- **Lint**: Periodic health checks — contradictions, orphan pages, gaps, stale claims

### Why It Matters
- "The maintenance burden grows faster than the value. LLMs don't get bored."
- Humans abandoned wikis due to maintenance cost. LLMs eliminate that friction.
- Knowledge compounds rather than scattering.
- Historical reference: Vannevar Bush's Memex (1945) — private, curated, associative trails

### Mapping to Obsidian
- Obsidian vault = the wiki
- Skill = the LLM maintenance layer (ingest, query, lint, cross-reference)
- Neurons concept = the compounding cross-references
- Graph view = visualization of the neural network
- Frontmatter/properties = the schema layer

### Known Risks
- Error accumulation (incorrect info compounds)
- Information loss via summarization
- False authority (wiki feels authoritative but is derived)
- Hallucinated merges (LLMs smooth contradictions)

## Gap Analysis

| Capability | Official Skills | Excalidraw Skill | Gap |
|-----------|----------------|-----------------|-----|
| Write Obsidian formats | Yes | No | — |
| Create professional diagrams | No | Yes (Excalidraw) | Canvas/Mermaid |
| Knowledge graph awareness | No | No | Yes |
| Artifact orchestration | No | No | Yes |
| Design-first workflow | No | Yes | Generalize |
| Vault context integration | Partial (CLI) | No | Yes |
