# JSON Forge

Format, validate, explore, and compare JSON in the browser. Documents stay on your machine. There is no backend.

## Features

- **Editor.** Syntax highlighting, line numbers, folding, and indentation with 2 spaces, 4 spaces, or a tab.
- **Format and minify.** Pretty-print JSON or compress it to one line. Sort object keys when you want a stable order.
- **Validator.** Live valid or invalid status, the parser message, and line and column when the engine reports them. Select **Jump to error** to land on the problem.
- **Tree.** Collapsible objects and arrays, with copy-path on each node. If a draft breaks, the tree keeps the last valid document.
- **Diff.** Structural comparison of two documents. Additions, removals, and value changes are listed and highlighted. Key order alone is not a change.
- **Utilities.** Copy, upload, download, drag and drop a file, and load sample data.
- **Extras.** Search keys and values, document statistics, and a dark or light theme saved in the browser.

## Run it locally

The app is static HTML, CSS, and JavaScript modules. Open it through a local server so the modules can load. Opening `index.html` directly from disk will not work.

```bash
python -m http.server 4173
```

Then visit `http://127.0.0.1:4173/`.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+Enter | Format |
| Ctrl+Shift+M | Minify |
| Ctrl+F | Find in the editor |

On macOS, use Cmd instead of Ctrl.

## Project layout

```
index.html          App shell
css/app.css         Layout and themes
js/main.js          Workspace, actions, and diff view
js/editor.js        CodeMirror setup
js/json.js          Parse, format, stats, search, and diff
js/tree.js          Collapsible tree
```

## Stack

- HTML, CSS, and JavaScript
- [CodeMirror 6](https://codemirror.net/) for editing, highlighting, and line numbers
- `JSON.parse()` and `JSON.stringify()` for validation, formatting, and minification

## Notes

Integers outside JavaScript's safe range can be rounded by `JSON.parse()`. The status bar warns when that happens. Keep those values as strings if the exact digits matter.
