# Manual Canonical Save Format

Use this only when `ea.create()` is unavailable. The Obsidian Excalidraw plugin checks
format heuristics to decide whether a `.md` file is an Excalidraw canvas. Deviations
cause **silent corruption**: the canvas renders but markdown text bleeds through, and
the Playwright renderer cannot detect this. Copy the structure byte-for-byte.

## Template

    ---

    excalidraw-plugin: parsed
    tags: [excalidraw]

    ---
    ==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'

    # Excalidraw Data

    ## Text Elements
    <text content> ^<elementId>

    <text content> ^<elementId>

    %%
    ## Drawing
    ```json
    {...complete JSON from .excalidraw file...}
    ```
    %%

## Format Rules (silent failure if violated)

| Rule | Why |
|------|-----|
| Blank lines INSIDE frontmatter block (`---\n\n...\n\n---`) | Plugin parser expects this exact spacing |
| `tags: [excalidraw]` **inline array** — NOT a YAML list | `  - excalidraw` (list form) breaks plugin recognition |
| Warning line `==⚠  Switch to EXCALIDRAW VIEW...==` present verbatim | Plugin uses this as a recognition marker |
| `# Excalidraw Data` single-hash parent heading | Sub-sections must nest under it |
| Blank line between each `text ^id` entry | Plugin's text indexer requires separation |
| `%%` wraps ONLY the `## Drawing` section | Wrapping Text Elements hides them from search |

## Text Elements Section

For each text element in your diagram, emit one line: `<text content> ^<elementId>`.
The `^<elementId>` anchor must match the `id` field of the corresponding JSON element —
this is what lets Obsidian search find text inside the canvas.
