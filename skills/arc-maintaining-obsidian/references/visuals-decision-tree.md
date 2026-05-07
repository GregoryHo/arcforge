# Visuals Decision Tree (mechanism)

After Create writes the typed note, decide whether it benefits from
visual elements. The vault's SCHEMA.md may declare per-type Visual
Guidance — follow that first. Use this generic tree only when the vault
is silent on the type.

## Decision tree

```
Q1: Does the raw source contain an image or diagram?
    → Yes → Embed: ![[filename]]. Deterministic — no judgment needed.
    → No  → Continue.
Q2: Does the note content have 3+ named entities with directional relationships?
    → No  → Skip visuals. Text is sufficient.
    → Yes → Continue.
Q3: Is the insight ABOUT how entities relate (hierarchies, flows, cycles, dependencies)?
    Test: if you removed the relationship description, would the insight collapse?
    → Yes → Mermaid by default. Continue to Q4 only if Excalidraw seems warranted.
    → No  → Explanatory content; skip visuals.
Q4: Is the spatial/architectural layout complex enough to warrant manual positioning?
    → No  → Stay with Mermaid (text-based, diffable, LLM-generatable).
    → Yes → Suggest Excalidraw delegation: "This has complex spatial layout — want me to create an Excalidraw diagram?" Do not auto-create.
```

## Tier outputs

| Tier | Output | When | LLM judgment? |
|---|---|---|---|
| **Embed** (Markdown) | `![[image.png]]` in note body | Raw source has image/diagram | No — deterministic |
| **Mermaid** | Fenced `mermaid` block | 3+ entities with relationships | Yes — conservative |
| **Canvas** | Separate `.canvas` file | MOC with 8+ notes in scope | Yes — suggest to user |
| **Excalidraw** | Delegate to `arc-diagramming-obsidian` | Complex spatial/architectural content | Yes — suggest to user |

## Conservative defaults

If you reach Q3 = yes, generate Mermaid. Do not second-guess with "but
text could also work" — the question is whether the shape communicates
faster. Mermaid is cheap; Canvas and Excalidraw are expensive tiers
that wait for user approval.

When in doubt, skip visuals. Noise diagrams are worse than none.
