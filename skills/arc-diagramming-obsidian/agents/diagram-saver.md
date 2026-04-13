# Diagram Saver

Save a validated Excalidraw diagram to the Obsidian vault using the EA plugin API, then verify the save.

## Input

You receive: **diagram path** (the validated `.excalidraw` file), **filename** (without extension), **folder** (vault folder), **embed target** (wiki note to embed in, or "none"), and `SKILL_ROOT` — absolute path to the skill directory.

## Steps

### 1. Save via EA Plugin API

Load the validated JSON elements into EA's buffer, then call `ea.create()`. This handles `.excalidraw.md` format correctly — compressed JSON, text indexing, frontmatter. Never manually construct `.excalidraw.md` format.

```javascript
(async () => {
  const ea = window.ExcalidrawAutomate;
  ea.reset();
  const json = JSON.parse(require('fs').readFileSync('<DIAGRAM_PATH>', 'utf8'));
  json.elements.forEach(el => { ea.elementsDict[el.id] = el; });
  ea.setView('new');
  await ea.create({
    filename: '<FILENAME>',
    foldername: '<FOLDER>',
    onNewPane: false,
    silent: true
  });
  return 'Saved to vault: <FOLDER>/<FILENAME>.excalidraw.md';
})()
```

Execute via `obsidian eval code="<script>"` (2>/dev/null to suppress stderr). Replace `<DIAGRAM_PATH>`, `<FILENAME>`, and `<FOLDER>` with values from the prompt.

**If the file already exists:** Delete it first via Obsidian API before calling `ea.create()`:
```javascript
await app.vault.adapter.remove('<FOLDER>/<FILENAME>.excalidraw.md');
```

### 2. Verify Save

Get the vault base path, then confirm the file exists and has content:

```bash
obsidian eval code="app.vault.adapter.basePath" 2>/dev/null
ls -la "<VAULT_PATH>/<FOLDER>/<FILENAME>.excalidraw.md"
```

Then re-render the saved file to confirm the save didn't corrupt anything:

```bash
cd <SKILL_ROOT>/references && \
  uv run python render_excalidraw.py "<VAULT_PATH>/<FOLDER>/<FILENAME>.excalidraw" \
  --output /tmp/diagram-post-save.png --scale 2
```

View `/tmp/diagram-post-save.png`. If it doesn't match the pre-save validated version, the save introduced corruption — investigate and fix.

### 3. Embed in Wiki Notes (if requested)

If embed target is specified (not "none"), add an embed to the target note:

```markdown
![[<FILENAME>]]
```

Place outside bilingual callouts (diagrams are language-neutral). Use the `obsidian` CLI or file editing tools to append the embed.

## Important

- **Never manually construct `.excalidraw.md` format.** The format includes compressed JSON, specific headers, and text element indexing that are easy to get wrong. Always use `ea.create()`.
- **`ea.elementsDict` is a documented public property** — official Excalidraw scripts read and write it directly. `ea.create()` consumes elements from this dict.

## Output

Report:
```
Saved: <vault-path>/<FILENAME>.excalidraw.md
Verified: [pass/fail]
Embedded in: <target note> (or "not embedded")
```
