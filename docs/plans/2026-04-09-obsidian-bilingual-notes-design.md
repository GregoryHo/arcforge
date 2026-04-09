# Obsidian Bilingual Notes Design

## Vision

Enable seamless Chinese/English bilingual note management in Obsidian with language switching support on both the desktop app and Obsidian Publish, using native Obsidian features (callouts) as the markup format with zero dependency on third-party plugins.

## Architecture Decision

**Callout-based language blocks** — each language version is wrapped in a `[!multi-lang-{code}]` callout. This format is:

- Natively supported by Obsidian (app + Publish) without any plugin
- Selectable via `[data-callout="multi-lang-en"]` CSS/JS selector
- Gracefully degrades to showing both languages if no CSS/JS is active
- Compatible with full markdown inside callouts (wikilinks, images, code blocks)

Rejected alternatives:

- **Fenced divs (`:::lang en`)**: Not parsed by Obsidian's renderer — displays as plain text
- **Separate files per language**: Doubles file count, requires maintaining two wikilink networks
- **Folder-per-language (`/en/`, `/zh/`)**: Breaks graph view, fragile cross-folder wikilinks
- **mi18n plugin**: Too immature (2 GitHub stars), uses non-standard syntax that breaks on Publish

## System Layers

### Layer 1: Data Format (Markdown)

Callout-based bilingual note format. Language-agnostic content (title, frontmatter) sits outside callouts. Each language version is a complete callout block.

### Layer 2: Publish (publish.js + publish.css)

`publish.js` injects a language switcher button, reads/stores preference in `localStorage`, and uses `MutationObserver` to handle SPA navigation. `publish.css` strips callout chrome (borders, icons, titles) so language blocks look like normal content, and provides a CSS-only fallback default language.

### Layer 3: Obsidian App (CSS snippet)

A CSS snippet in `.obsidian/snippets/` hides one language. Manual toggle by editing the snippet. Can be upgraded to a simple plugin for one-click switching later.

## Bilingual Note Format Specification

### Rules

1. Frontmatter MUST include `langs` array listing languages present in the note
2. Note title (H1) sits outside callouts, in bilingual format: `中文 / English`
3. Each language version uses `> [!multi-lang-{code}]` callout
4. Language codes follow ISO 639-1 (`en`, `zh`)
5. Full markdown supported inside callouts — wikilinks, images, lists, code blocks
6. Single-language notes still use callout wrapper with one `langs` entry, for future translation
7. No content between callouts — shared content goes before all callouts (frontmatter or H1)

### Full Example

```markdown
---
langs: [en, zh]
tags: [topic]
---

# 主題標題 / Topic Title

> [!multi-lang-en]
> English content with [[wikilinks]] and full markdown.
>
> ## Subheading
> More content here.

> [!multi-lang-zh]
> 中文內容，包含 [[wikilinks]] 和完整 markdown。
>
> ## 子標題
> 更多內容在這裡。
```

### Single-Language Example (Translation Pending)

```markdown
---
langs: [en]
---

# Topic Title

> [!multi-lang-en]
> Content in English only for now.
```

### Agent Behavior Rules

- When creating new notes, create callouts for the specified language(s)
- When translating existing notes, add a new callout and update `langs` array
- Never insert non-language content between callouts
- Wikilink targets do not carry language suffixes — link to the same file

## Components

### publish.js (~40 lines)

Three responsibilities:

1. **`createSwitcher()`** — injects EN/中 toggle button into page. Only visible when `[data-callout^="multi-lang-"]` elements exist on the page.
2. **`applyLanguage(lang)`** — queries all `[data-callout^="multi-lang-"]` elements, sets `display: none` or `display: block` based on current language. Fallback: if all callouts end up hidden (note lacks preferred language), show all.
3. **`MutationObserver`** — watches `.publish-renderer` for DOM changes (SPA navigation), re-runs `applyLanguage()` and `createSwitcher()`.

Language preference stored in `localStorage('preferred-lang')`, default `'en'`.

### publish.css (~30 lines)

Two responsibilities:

1. **Callout chrome removal** — strip borders, background, fold arrow, title bar from `[data-callout^="multi-lang-"]` so content looks like normal paragraphs.
2. **CSS fallback** — hardcode `[data-callout="multi-lang-zh"] { display: none; }` so if JS fails, at least the default language shows (not both stacked).
3. **Switcher styling** — fixed position button, hover effects, active language indicator.

### .obsidian/snippets/multi-lang.css (~5 lines)

Hardcoded hide for one language:

```css
.callout[data-callout="multi-lang-en"] { display: none; }
```

Toggle by changing the language code. Upgradeable to plugin later.

### Note Template (Optional, for Templater)

Not a priority — the primary note creator is the AI agent via `arc-maintaining-obsidian` skill, which follows the format specification above.

## Data Flow

### Publish Page Load

```
Page opens → publish.js loads → read localStorage('preferred-lang')
  → applyLanguage(lang)
    → querySelectorAll('[data-callout^="multi-lang-"]')
    → match preferred → display: block
    → non-match → display: none
    → if all hidden (fallback) → show all
  → createSwitcher() if language callouts exist
```

### Language Switch

```
User clicks toggle → localStorage = new lang
  → applyLanguage(new lang) → DOM updates
  → button active state updates
```

### SPA Navigation

```
User clicks internal link → Publish swaps DOM content
  → MutationObserver fires → applyLanguage() with stored preference
  → createSwitcher() if needed
```

## Error Handling & Graceful Degradation

| Failure | Result | User Experience |
|---------|--------|-----------------|
| `publish.js` fails to load | CSS fallback active | Default language shown |
| Both JS and CSS fail | Raw callout rendering | Both languages visible with callout borders |
| Obsidian app snippet disabled | No hiding | Both languages visible |
| `localStorage` disabled | Switching works, no persistence | Default language on each page load |
| Publish changes DOM structure | MutationObserver may fail | Falls back to both languages visible |

**Design principle:** All failure modes fall back to "show both languages." Content never disappears.

**publish.js defenses:**

- Entire script in `try-catch`, silent failure
- `querySelectorAll` no-match is a no-op
- `MutationObserver` unsupported → skip SPA handling, first-load only
- `localStorage` access in `try-catch` (private browsing)

**publish.css defense:**

- CSS hardcodes a default hidden language, so even without JS, one clean language shows

## Testing

### Obsidian App (Local)

- Create test note with both `[!multi-lang-en]` and `[!multi-lang-zh]`
- Enable snippet, verify single language displays
- Toggle snippet language code, verify switch
- Test wikilinks, images, code blocks inside callouts
- Test single-language note displays normally

### Publish (Pre-launch)

- Publish test note + `publish.js` + `publish.css`
- Verify: switcher appears, toggle works, preference persists across refresh
- Verify: SPA navigation preserves language preference
- Verify: normal (non-bilingual) notes unaffected
- Verify: single-language note with mismatched preference triggers fallback
- Verify: JS-disabled browser shows CSS default language

### Degradation

- DevTools: disable JS → CSS fallback works
- Private browsing: localStorage limited → graceful handling
- Remove `publish.js` from published files → callouts still readable

---

<!-- REFINER_INPUT_START -->

## Requirements for Refiner

### Functional Requirements

- REQ-F001: Bilingual notes use `[!multi-lang-{code}]` callout format with `langs` frontmatter
- REQ-F002: `publish.js` provides language switcher button on Publish site
- REQ-F003: Language preference persists via `localStorage`
- REQ-F004: SPA navigation preserves language state via `MutationObserver`
- REQ-F005: Switcher only appears on pages with language callouts
- REQ-F006: Fallback shows available language when preferred language is missing
- REQ-F007: CSS snippet enables language hiding in Obsidian app
- REQ-F008: AI agents follow format specification when creating/translating notes

### Non-Functional Requirements

- REQ-N001: All failure modes degrade to showing both languages (content never disappears)
- REQ-N002: Zero external dependencies — vanilla JS and CSS only
- REQ-N003: `publish.js` under 50 lines, `publish.css` under 40 lines
- REQ-N004: No impact on non-bilingual notes

### Constraints

- Obsidian Publish does not support custom JS injection except via `publish.js`
- Obsidian's markdown renderer does not parse `:::` fenced div syntax
- Callout is the only native Obsidian markup that renders as structured, selectable HTML on both app and Publish
- `publish.js` must handle SPA navigation (Publish does not do full page reloads)
<!-- REFINER_INPUT_END -->
