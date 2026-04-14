# Bilingual Notes Tasks

> **Goal:** Language switching for Chinese/English notes on Obsidian Publish and desktop app
> **Architecture:** Callout-based language blocks (`[!multi-lang-{code}]`) + `publish.js` switcher + CSS
> **Tech Stack:** Vanilla JS, CSS, Obsidian callouts
> **Design:** `docs/plans/2026-04-09-obsidian-bilingual-notes-design.md`

> **For Claude:** Use arc-executing-tasks to implement.
> **Vault path:** Discover via `obsidian-cli` or ask user. All file paths below use `$VAULT` placeholder.

## Tasks

### Task 1: Create publish.css

**Files:**
- Create: `$VAULT/publish.css`

**Step 1: Create file**

```css
/* === Multi-lang callout chrome removal === */
.callout[data-callout^="multi-lang-"] {
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  box-shadow: none;
}

.callout[data-callout^="multi-lang-"] .callout-title {
  display: none;
}

.callout[data-callout^="multi-lang-"] .callout-content {
  padding: 0;
}

/* === CSS fallback: default to English when JS fails === */
.callout[data-callout="multi-lang-zh"] {
  display: none;
}

/* === Language switcher button === */
.multi-lang-switcher {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 100;
  display: flex;
  gap: 4px;
  background: var(--background-secondary);
  border-radius: 6px;
  padding: 4px;
  font-size: 13px;
}

.multi-lang-switcher button {
  border: none;
  background: none;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 13px;
}

.multi-lang-switcher button.active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
```

**Step 2: Verify**

Publish the file to Obsidian Publish. Open any existing note — CSS should load without errors. No visible change on non-bilingual notes (no matching callouts).

**Step 3: Commit**

Not in arcforge repo — vault file. Optionally track in vault's git if version-controlled.

---

### Task 2: Create publish.js

**Files:**
- Create: `$VAULT/publish.js`

**Step 1: Create file**

```js
// Multi-lang switcher for Obsidian Publish
// Design: docs/plans/2026-04-09-obsidian-bilingual-notes-design.md
(function () {
  'use strict';

  var SELECTOR = '[data-callout^="multi-lang-"]';
  var STORAGE_KEY = 'preferred-lang';
  var DEFAULT_LANG = 'en';
  var LANGS = [
    { code: 'en', label: 'EN' },
    { code: 'zh', label: '中' },
  ];

  function getLang() {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG; }
    catch (e) { return DEFAULT_LANG; }
  }

  function setLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); }
    catch (e) { /* private browsing */ }
  }

  function applyLanguage(lang) {
    var blocks = document.querySelectorAll(SELECTOR);
    if (!blocks.length) return false;

    var anyVisible = false;
    blocks.forEach(function (el) {
      var match = el.getAttribute('data-callout') === 'multi-lang-' + lang;
      el.style.display = match ? '' : 'none';
      if (match) anyVisible = true;
    });

    // Fallback: if preferred language not found, show all
    if (!anyVisible) {
      blocks.forEach(function (el) { el.style.display = ''; });
    }

    return true;
  }

  function createSwitcher() {
    var existing = document.querySelector('.multi-lang-switcher');
    if (existing) existing.remove();

    var blocks = document.querySelectorAll(SELECTOR);
    if (!blocks.length) return;

    var container = document.createElement('div');
    container.className = 'multi-lang-switcher';
    var currentLang = getLang();

    LANGS.forEach(function (item) {
      var btn = document.createElement('button');
      btn.textContent = item.label;
      if (item.code === currentLang) btn.className = 'active';
      btn.addEventListener('click', function () {
        setLang(item.code);
        applyLanguage(item.code);
        container.querySelectorAll('button').forEach(function (b) {
          b.className = '';
        });
        btn.className = 'active';
      });
      container.appendChild(btn);
    });

    document.body.appendChild(container);
  }

  function init() {
    var lang = getLang();
    var hasBlocks = applyLanguage(lang);
    if (hasBlocks) createSwitcher();
  }

  // Initial run
  init();

  // SPA navigation: re-run on DOM changes
  var target = document.querySelector('.publish-renderer');
  if (target && typeof MutationObserver !== 'undefined') {
    new MutationObserver(init).observe(target, {
      childList: true,
      subtree: true,
    });
  }
})();
```

**Step 2: Verify**

Publish the file. Open a bilingual test note (Task 3). Switcher button should appear. Click to toggle languages. Navigate to non-bilingual note — switcher should disappear.

**Step 3: Commit**

Vault file — not in arcforge repo.

---

### Task 3: Create Obsidian app CSS snippet

**Files:**
- Create: `$VAULT/.obsidian/snippets/multi-lang.css`

**Step 1: Create file**

```css
/* Hide Chinese — toggle this line to switch language */
/* Option A: show English, hide Chinese */
.callout[data-callout="multi-lang-zh"] { display: none; }

/* Option B: show Chinese, hide English (uncomment and comment Option A) */
/* .callout[data-callout="multi-lang-en"] { display: none; } */

/* Strip callout chrome so visible language looks like normal content */
.callout[data-callout^="multi-lang-"] {
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  box-shadow: none;
}

.callout[data-callout^="multi-lang-"] .callout-title {
  display: none;
}

.callout[data-callout^="multi-lang-"] .callout-content {
  padding: 0;
}
```

**Step 2: Enable snippet**

In Obsidian: Settings → Appearance → CSS Snippets → enable `multi-lang`.

**Step 3: Verify**

Open a bilingual test note (Task 4). Only one language should be visible. Content should look like normal paragraphs, not callouts.

---

### Task 4: Create test note for verification

**Files:**
- Create: `$VAULT/Test Bilingual Note.md`

**Step 1: Create file**

```markdown
---
langs: [en, zh]
tags: [test]
---

# 雙語測試 / Bilingual Test

> [!multi-lang-en]
> This is the English version.
>
> ## Features
> - Full markdown: **bold**, *italic*, `code`
> - Wikilink: [[Test Bilingual Note]]
> - List with multiple items
>
> > Nested blockquote works too.

> [!multi-lang-zh]
> 這是中文版本。
>
> ## 功能
> - 完整 markdown：**粗體**、*斜體*、`程式碼`
> - Wikilink：[[Test Bilingual Note]]
> - 多項目列表
>
> > 嵌套引用也可以。
```

**Step 2: Verification checklist**

**Obsidian app:**
- [ ] Snippet enabled → only one language visible
- [ ] Callout chrome (border, title, icon) hidden
- [ ] Wikilink inside callout resolves correctly
- [ ] Markdown formatting renders normally
- [ ] Switch snippet Option A/B → other language shows

**Publish:**
- [ ] Switcher button appears (top-right)
- [ ] Click EN → English content, Chinese hidden
- [ ] Click 中 → Chinese content, English hidden
- [ ] Refresh page → preference remembered
- [ ] Navigate to non-bilingual note → switcher disappears
- [ ] Navigate back → switcher reappears with correct language
- [ ] Disable JS in DevTools → CSS fallback shows English only

**Degradation:**
- [ ] Remove publish.js from published files → both languages show as callouts
- [ ] Remove publish.css too → both callouts with default Obsidian styling
- [ ] Private browsing → switching works, no persistence (OK)

**Step 3: Cleanup**

After verification passes, delete or archive the test note. It is not needed long-term.
