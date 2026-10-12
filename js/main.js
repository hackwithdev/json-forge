import { createJsonEditor } from "./editor.js";
import {
  SAMPLE,
  SAMPLE_LEFT,
  SAMPLE_RIGHT,
  collectStats,
  diffValues,
  formatValue,
  formatWithPaths,
  minifyValue,
  parseJson,
  previewJson,
  searchDocument,
  sortValue,
} from "./json.js";
import { renderTree } from "./tree.js";

const $ = (id) => document.getElementById(id);

const editorHost = $("editor-host");
const treeRoot = $("tree-root");
const treeBanner = $("tree-banner");
const searchInput = $("search-input");
const searchMeta = $("search-meta");
const searchResults = $("search-results");
const statsList = $("stats-list");
const editorStatus = $("editor-status");
const toastEl = $("toast");

let theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
let indent = localStorage.getItem("json-forge-indent") || "2";
let treeDepth = 2;
let refreshTimer = 0;
let toastTimer = 0;
let silent = 0;
let lastValid;
let diffView = { changes: [], leftMap: new Map(), rightMap: new Map(), filter: "all" };

const editor = createJsonEditor(editorHost, {
  doc: SAMPLE,
  onUpdate: (update) => {
    if (update.docChanged) scheduleRefresh();
    else updateCursor();
  },
  onFormat: () => formatDocument(),
  onMinify: () => minifyDocument(),
});

const leftEditor = createJsonEditor($("diff-left-host"), {
  doc: SAMPLE_LEFT,
  onUpdate: (update) => {
    if (silent || !update.docChanged) return;
    leftEditor.setDiffLines(new Map());
    paintStatus($("diff-left-status"), parseJson(leftEditor.getText()));
  },
});

const rightEditor = createJsonEditor($("diff-right-host"), {
  doc: SAMPLE_RIGHT,
  onUpdate: (update) => {
    if (silent || !update.docChanged) return;
    rightEditor.setDiffLines(new Map());
    paintStatus($("diff-right-status"), parseJson(rightEditor.getText()));
  },
});

$("indent-select").value = indent;
applyIndent(indent);
applyTheme(theme);
refreshEditorPanels();
paintStatus($("diff-left-status"), parseJson(leftEditor.getText()));
paintStatus($("diff-right-status"), parseJson(rightEditor.getText()));

$("tab-editor").addEventListener("click", () => showMode("editor"));
$("tab-diff").addEventListener("click", () => showMode("diff"));
$("theme-toggle").addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem("json-forge-theme", theme);
  applyTheme(theme);
});

$("format-btn").addEventListener("click", formatDocument);
$("minify-btn").addEventListener("click", minifyDocument);
$("sort-btn").addEventListener("click", sortDocument);
$("indent-select").addEventListener("change", (event) => {
  indent = event.target.value;
  localStorage.setItem("json-forge-indent", indent);
  applyIndent(indent);
});
$("copy-btn").addEventListener("click", () => copyText(editor.getText()));
$("upload-btn").addEventListener("click", () => $("upload-input").click());
$("upload-input").addEventListener("change", (event) => readFile(event.target.files[0], (text) => editor.setText(text)));
$("download-btn").addEventListener("click", () => download(editor.getText(), "forge.json"));
$("sample-btn").addEventListener("click", () => editor.setText(SAMPLE));
$("clear-btn").addEventListener("click", () => editor.setText(""));
$("expand-all").addEventListener("click", () => {
  treeDepth = 100;
  refreshEditorPanels();
});
$("collapse-all").addEventListener("click", () => {
  treeDepth = -1;
  refreshEditorPanels();
});

$("side-tree").addEventListener("click", () => showSide("tree"));
$("side-search").addEventListener("click", () => showSide("search"));
$("side-stats").addEventListener("click", () => showSide("stats"));
searchInput.addEventListener("input", () => {
  treeDepth = 2;
  refreshEditorPanels();
});

$("diff-compare").addEventListener("click", compareDocuments);
$("diff-sample").addEventListener("click", () => {
  runSilent(() => {
    leftEditor.setText(SAMPLE_LEFT);
    rightEditor.setText(SAMPLE_RIGHT);
  });
  compareDocuments();
});
$("diff-swap").addEventListener("click", () => {
  const left = leftEditor.getText();
  const right = rightEditor.getText();
  runSilent(() => {
    leftEditor.setText(right);
    rightEditor.setText(left);
  });
  compareDocuments();
});
bindUpload($("diff-left-upload"), $("diff-left-file"), (text) => leftEditor.setText(text));
bindUpload($("diff-right-upload"), $("diff-right-file"), (text) => rightEditor.setText(text));
$("diff-left-copy").addEventListener("click", () => copyText(leftEditor.getText()));
$("diff-right-copy").addEventListener("click", () => copyText(rightEditor.getText()));
$("diff-left-download").addEventListener("click", () => download(leftEditor.getText(), "left.json"));
$("diff-right-download").addEventListener("click", () => download(rightEditor.getText(), "right.json"));

bindDrop(editorHost, (text) => editor.setText(text));
bindDrop($("diff-left-host"), (text) => leftEditor.setText(text));
bindDrop($("diff-right-host"), (text) => rightEditor.setText(text));

function showMode(mode) {
  const editorMode = mode === "editor";
  $("view-editor").hidden = !editorMode;
  $("view-diff").hidden = editorMode;
  $("tab-editor").setAttribute("aria-selected", String(editorMode));
  $("tab-diff").setAttribute("aria-selected", String(!editorMode));
  if (!editorMode) {
    paintStatus($("diff-left-status"), parseJson(leftEditor.getText()));
    paintStatus($("diff-right-status"), parseJson(rightEditor.getText()));
  }
}

function showSide(name) {
  ["tree", "search", "stats"].forEach((panel) => {
    $(`panel-${panel}`).hidden = panel !== name;
    $(`side-${panel}`).setAttribute("aria-selected", String(panel === name));
  });
  if (name === "search") searchInput.focus();
}

function applyTheme(next) {
  document.documentElement.dataset.theme = next;
  editor.setTheme(next);
  leftEditor.setTheme(next);
  rightEditor.setTheme(next);
  const toggle = $("theme-toggle");
  const dark = next === "dark";
  toggle.textContent = dark ? "Light theme" : "Dark theme";
  toggle.setAttribute("aria-pressed", String(dark));
}

function applyIndent(next) {
  editor.setIndent(next);
  leftEditor.setIndent(next);
  rightEditor.setIndent(next);
}

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshEditorPanels, 120);
}

function refreshEditorPanels() {
  const text = editor.getText();
  const parsed = parseJson(text);
  if (parsed.empty) lastValid = undefined;
  else if (!parsed.error) lastValid = parsed.value;

  paintStatus(editorStatus, parsed, cursorText(editor), () => {
    if (parsed.error?.index != null) editor.gotoIndex(parsed.error.index);
    else editor.goto(parsed.error?.line, parsed.error?.column);
  });

  const query = searchInput.value;
  const treeValue = parsed.error ? lastValid : parsed.value;
  treeBanner.hidden = !(parsed.error && lastValid);
  treeBanner.textContent = "Showing the last valid document while this draft has a syntax error.";
  const tree = renderTree(treeRoot, treeValue, {
    query,
    expandDepth: treeDepth,
    onCopy: (path) => copyText(path),
  });
  if (tree.limited) toast("Tree stopped at 2,500 nodes. Collapse a branch or search to narrow it.");

  const searchable = parsed.error ? lastValid : parsed.value;
  const hits = searchDocument(searchable, query);
  const editorHits = editor.setSearchQuery(query);
  paintSearch(hits, editorHits, parsed.error && lastValid);
  paintStats(collectStats(parsed.error ? undefined : parsed.value, text), parsed);
}

function updateCursor() {
  const parsed = parseJson(editor.getText());
  if (parsed.error || parsed.empty) return;
  const cursor = editorStatus.querySelector(".cursor");
  if (cursor) cursor.textContent = cursorText(editor);
}

function cursorText(target) {
  const pos = target.view.state.selection.main.head;
  const line = target.view.state.doc.lineAt(pos);
  return `Cursor ${line.number}:${pos - line.from + 1}`;
}

function paintStatus(container, parsed, cursor = "", jump) {
  container.replaceChildren();
  const pill = document.createElement("span");
  pill.className = "pill";
  if (parsed.empty) {
    pill.classList.add("idle");
    pill.textContent = "Empty";
    container.append(pill, span("Paste JSON, drop a file, or load the sample."));
    return;
  }
  if (parsed.error) {
    pill.classList.add("invalid");
    pill.textContent = "Invalid";
    container.append(pill, span(parsed.error.message));
    if (parsed.error.line) {
      container.append(span(`Line ${parsed.error.line}, column ${parsed.error.column}`));
      if (jump) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "linkish";
        button.textContent = "Jump to error";
        button.addEventListener("click", jump);
        container.append(button);
      }
    }
  } else {
    pill.classList.add("valid");
    pill.textContent = "Valid";
    const cursorEl = span(cursor || "JSON parsed");
    cursorEl.classList.add("cursor");
    container.append(pill, cursorEl);
  }
  if (parsed.warnings.length) {
    const warn = span(`${parsed.warnings.length} integer${parsed.warnings.length === 1 ? "" : "s"} may lose precision. JSON.parse only keeps 15–16 significant digits.`);
    warn.classList.add("warn");
    container.append(warn);
  }
}

function paintSearch(hits, editorHits, usingLastValid) {
  searchResults.replaceChildren();
  if (!searchInput.value.trim()) {
    searchMeta.textContent = "Type to find keys and values in the current document.";
    return;
  }
  const suffix = usingLastValid ? " Results are from the last valid document." : "";
  searchMeta.textContent = `${hits.length} structural match${hits.length === 1 ? "" : "es"} · ${editorHits} in the editor.${suffix}`;
  if (!hits.length) {
    searchResults.append(itemNote("No keys or values matched."));
    return;
  }
  hits.forEach((hit) => {
    const button = document.createElement("button");
    button.type = "button";
    const tag = document.createElement("span");
    tag.className = `tag ${hit.kind}`;
    tag.textContent = hit.kind;
    const path = document.createElement("code");
    path.textContent = hit.path;
    const preview = span(hit.preview);
    button.append(tag, path, preview);
    button.addEventListener("click", () => {
      showSide("tree");
      const row = treeRoot.querySelector(`[data-path="${CSS.escape(hit.path)}"]`);
      if (row) {
        row.scrollIntoView({ block: "center" });
        row.classList.add("is-match");
      }
    });
    const li = document.createElement("li");
    li.append(button);
    searchResults.append(li);
  });
}

function paintStats(stats, parsed) {
  const structural = parsed.error || parsed.empty;
  const rows = [
    ["Bytes", stats.bytes],
    ["Characters", stats.characters],
    ["Lines", stats.lines],
    ["Depth", structural ? "—" : stats.depth],
    ["Objects", structural ? "—" : stats.objects],
    ["Arrays", structural ? "—" : stats.arrays],
    ["Keys", structural ? "—" : stats.keys],
    ["Strings", structural ? "—" : stats.strings],
    ["Numbers", structural ? "—" : stats.numbers],
    ["Booleans", structural ? "—" : stats.booleans],
    ["Nulls", structural ? "—" : stats.nulls],
  ];
  statsList.replaceChildren();
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = String(value);
    statsList.append(term, detail);
  });
  if (structural) {
    const note = document.createElement("p");
    note.className = "span";
    note.textContent = parsed.empty ? "Structure stats appear once the editor has JSON." : "Structure stats appear once the JSON is valid.";
    statsList.append(note);
  }
}

function formatDocument() {
  const parsed = parseJson(editor.getText());
  if (!ready(parsed, "format")) return true;
  treeDepth = 2;
  editor.setText(formatValue(parsed.value, indent));
  toast("Formatted");
  return true;
}

function minifyDocument() {
  const parsed = parseJson(editor.getText());
  if (!ready(parsed, "minify")) return true;
  treeDepth = 2;
  editor.setText(minifyValue(parsed.value));
  toast("Minified");
  return true;
}

function sortDocument() {
  const parsed = parseJson(editor.getText());
  if (!ready(parsed, "sort")) return true;
  treeDepth = 2;
  editor.setText(formatValue(sortValue(parsed.value), indent));
  toast("Keys sorted");
  return true;
}

function ready(parsed, action) {
  if (parsed.empty) {
    toast(`Nothing to ${action}`);
    return false;
  }
  if (parsed.error) {
    if (parsed.error.index != null) editor.gotoIndex(parsed.error.index);
    else editor.goto(parsed.error.line, parsed.error.column);
    toast("Fix the syntax error first");
    return false;
  }
  return true;
}

function compareDocuments() {
  const leftParsed = parseJson(leftEditor.getText());
  const rightParsed = parseJson(rightEditor.getText());
  paintStatus($("diff-left-status"), leftParsed, "", () => {
    if (leftParsed.error?.index != null) leftEditor.gotoIndex(leftParsed.error.index);
    else leftEditor.goto(leftParsed.error?.line, leftParsed.error?.column);
  });
  paintStatus($("diff-right-status"), rightParsed, "", () => {
    if (rightParsed.error?.index != null) rightEditor.gotoIndex(rightParsed.error.index);
    else rightEditor.goto(rightParsed.error?.line, rightParsed.error?.column);
  });

  if (leftParsed.empty || rightParsed.empty || leftParsed.error || rightParsed.error) {
    leftEditor.setDiffLines(new Map());
    rightEditor.setDiffLines(new Map());
    diffView = { changes: [], leftMap: new Map(), rightMap: new Map(), filter: "all" };
    $("diff-summary").textContent = "Both sides need valid JSON before they can be compared.";
    $("diff-filters").hidden = true;
    $("diff-list").replaceChildren();
    return;
  }

  const shouldSort = $("diff-sort").checked;
  const leftValue = shouldSort ? sortValue(leftParsed.value) : leftParsed.value;
  const rightValue = shouldSort ? sortValue(rightParsed.value) : rightParsed.value;
  const leftPrinted = formatWithPaths(leftValue, indent);
  const rightPrinted = formatWithPaths(rightValue, indent);
  runSilent(() => {
    leftEditor.setText(leftPrinted.text);
    rightEditor.setText(rightPrinted.text);
  });
  const changes = diffValues(leftValue, rightValue);
  diffView = { changes, leftMap: leftPrinted.map, rightMap: rightPrinted.map, filter: diffView.filter || "all" };
  paintDiffLines(changes, leftPrinted.map, rightPrinted.map);
  paintDiffList();
}

function paintDiffLines(changes, leftMap, rightMap) {
  const leftLines = new Map();
  const rightLines = new Map();
  changes.forEach((change) => {
    if (change.type !== "added") stampLines(leftLines, leftMap, change.path, change.type === "removed" ? "removed" : "changed");
    if (change.type !== "removed") stampLines(rightLines, rightMap, change.path, change.type === "added" ? "added" : "changed");
  });
  leftEditor.setDiffLines(leftLines);
  rightEditor.setDiffLines(rightLines);
}

function stampLines(lines, pathMap, path, kind) {
  const span = pathMap.get(path);
  if (!span) return;
  for (let line = span.startLine; line <= span.endLine; line += 1) {
    const current = lines.get(line);
    if (current === "changed") continue;
    if (kind === "changed" || !current) lines.set(line, kind);
  }
}

function paintDiffList() {
  const { changes, filter, leftMap, rightMap } = diffView;
  const counts = {
    all: changes.length,
    added: changes.filter((change) => change.type === "added").length,
    removed: changes.filter((change) => change.type === "removed").length,
    changed: changes.filter((change) => change.type === "changed").length,
  };
  const summary = $("diff-summary");
  summary.replaceChildren();
  if (!counts.all) {
    summary.textContent = "No differences. These documents match.";
  } else {
    summary.append(
      span(`${counts.added} added`),
      span(`${counts.removed} removed`),
      span(`${counts.changed} changed`),
    );
  }
  const filters = $("diff-filters");
  filters.hidden = counts.all === 0;
  filters.replaceChildren();
  ["all", "added", "removed", "changed"].forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${name} ${counts[name]}`;
    button.setAttribute("aria-pressed", String(filter === name));
    button.addEventListener("click", () => {
      diffView.filter = name;
      paintDiffList();
    });
    filters.append(button);
  });
  const list = $("diff-list");
  list.replaceChildren();
  const visible = changes.filter((change) => filter === "all" || change.type === filter);
  if (counts.all && !visible.length) {
    list.append(itemNote("Nothing in this filter."));
    return;
  }
  visible.forEach((change) => {
    const button = document.createElement("button");
    button.type = "button";
    const tag = document.createElement("span");
    tag.className = `tag ${change.type}`;
    tag.textContent = change.type;
    const path = document.createElement("code");
    path.textContent = change.path;
    button.append(tag, path, span(changeText(change)));
    button.addEventListener("click", () => revealChange(change, leftMap, rightMap));
    const li = document.createElement("li");
    li.append(button);
    list.append(li);
  });
}

function changeText(change) {
  if (change.type === "added") return previewJson(change.right);
  if (change.type === "removed") return previewJson(change.left);
  return `${previewJson(change.left)} → ${previewJson(change.right)}`;
}

function revealChange(change, leftMap, rightMap) {
  const left = leftMap.get(change.path);
  const right = rightMap.get(change.path);
  if (change.type !== "added" && left) leftEditor.goto(left.startLine, 1, change.type === "removed");
  if (change.type !== "removed" && right) rightEditor.goto(right.startLine, 1, true);
}

function runSilent(fn) {
  silent += 1;
  try { fn(); } finally { silent -= 1; }
}

function bindUpload(button, input, apply) {
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", (event) => readFile(event.target.files[0], apply));
}

function bindDrop(host, apply) {
  host.addEventListener("dragover", (event) => {
    event.preventDefault();
    host.classList.add("is-dropping");
  });
  host.addEventListener("dragleave", () => host.classList.remove("is-dropping"));
  host.addEventListener("drop", (event) => {
    event.preventDefault();
    host.classList.remove("is-dropping");
    const file = event.dataTransfer?.files?.[0];
    if (file) readFile(file, apply);
  });
}

function readFile(file, apply) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    apply(String(reader.result));
    toast(`Loaded ${file.name}`);
  };
  reader.onerror = () => toast("Could not read that file");
  reader.readAsText(file);
}

function download(text, filename) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast("Copied");
}

function toast(message) {
  toastEl.hidden = false;
  toastEl.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 2200);
}

function span(text) {
  const node = document.createElement("span");
  node.textContent = text;
  return node;
}

function itemNote(text) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  return li;
}
