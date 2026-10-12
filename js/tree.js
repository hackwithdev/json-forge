import { childPath } from "./json.js";

const EXPAND_BUDGET = 2500;

export function renderTree(container, value, { query = "", expandDepth = 1, onCopy } = {}) {
  container.replaceChildren();
  if (value === undefined) {
    container.append(note("Nothing to explore yet. Paste JSON or load the sample."));
    return { limited: false };
  }
  const budget = { left: EXPAND_BUDGET, limited: false };
  const node = buildNode({
    key: null,
    value,
    path: "$",
    depth: 0,
    query: query.trim().toLowerCase(),
    expandDepth,
    onCopy,
    budget,
  });
  container.append(node || note("No keys or values match that search."));
  return { limited: budget.limited };
}

function note(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty";
  paragraph.textContent = text;
  return paragraph;
}

function buildNode({ key, value, path, depth, query, expandDepth, onCopy, budget }) {
  const complex = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const keys = complex ? (isArray ? value.map((_, index) => index) : Object.keys(value)) : [];
  const keyMatch = Boolean(query && key != null && String(key).toLowerCase().includes(query));
  const valueMatch = Boolean(query && !complex && JSON.stringify(value).toLowerCase().includes(query));
  const descendantMatch = Boolean(query && keys.some((childKey) => {
    const childValue = isArray ? value[childKey] : value[childKey];
    return branchMatches(childValue, childKey, query);
  }));
  if (query && path !== "$" && !keyMatch && !valueMatch && !descendantMatch) return null;

  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.path = path;
  if (keyMatch || valueMatch) row.classList.add("is-match");

  const twisty = document.createElement("span");
  twisty.className = "twisty";
  twisty.setAttribute("aria-hidden", "true");
  twisty.textContent = complex ? "▸" : "·";

  const label = document.createElement("span");
  label.className = "tree-key";
  label.append(key == null ? document.createTextNode("root") : highlight(String(key), query));

  const typeEl = document.createElement("span");
  typeEl.className = "tree-type";
  typeEl.textContent = typeLabel(value);

  row.append(twisty, label, typeEl);

  if (!complex) {
    const preview = document.createElement("span");
    preview.className = `tree-preview ${typeName(value)}`;
    const text = JSON.stringify(value);
    preview.append(highlight(text.length > 72 ? `${text.slice(0, 69)}...` : text, query));
    row.append(preview);
  }

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy-path";
  copy.textContent = "Copy path";
  copy.addEventListener("click", (event) => {
    event.stopPropagation();
    onCopy(path);
  });
  row.append(copy);

  const node = document.createElement("div");
  node.className = "tree-node";
  node.append(row);
  if (!complex) return node;

  const children = document.createElement("div");
  children.className = "tree-children";
  children.hidden = true;
  node.append(children);

  function fillChildren() {
    if (children.dataset.ready === "true") return;
    children.dataset.ready = "true";
    keys.forEach((childKey) => {
      if (budget.left <= 0) {
        budget.limited = true;
        return;
      }
      budget.left -= 1;
      const childValue = value[childKey];
      const child = buildNode({
        key: childKey,
        value: childValue,
        path: isArray ? `${path}[${childKey}]` : childPath(path, childKey),
        depth: depth + 1,
        query,
        expandDepth,
        onCopy,
        budget,
      });
      if (child) children.append(child);
    });
    if (!children.childElementCount) children.append(note("Empty."));
  }

  function setOpen(open) {
    if (open) fillChildren();
    children.hidden = !open;
    twisty.textContent = open ? "▾" : "▸";
    row.setAttribute("aria-expanded", open ? "true" : "false");
  }

  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-expanded", "false");
  row.addEventListener("click", () => setOpen(children.hidden));
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(children.hidden);
    }
  });

  if (query ? descendantMatch || keyMatch : depth <= expandDepth) setOpen(true);
  return node;
}

function branchMatches(value, label, query) {
  if (String(label).toLowerCase().includes(query)) return true;
  if (value === null || typeof value !== "object") return JSON.stringify(value).toLowerCase().includes(query);
  if (Array.isArray(value)) return value.some((item, index) => branchMatches(item, index, query));
  return Object.keys(value).some((key) => branchMatches(value[key], key, query));
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function typeLabel(value) {
  if (Array.isArray(value)) return `array ${value.length}`;
  if (value !== null && typeof value === "object") return `object ${Object.keys(value).length}`;
  return typeName(value);
}

function highlight(text, query) {
  const fragment = document.createDocumentFragment();
  if (!query) {
    fragment.append(document.createTextNode(text));
    return fragment;
  }
  const lower = text.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const at = lower.indexOf(query, cursor);
    if (at < 0) {
      fragment.append(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (at > cursor) fragment.append(document.createTextNode(text.slice(cursor, at)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(at, at + query.length);
    fragment.append(mark);
    cursor = at + query.length;
  }
  return fragment;
}
