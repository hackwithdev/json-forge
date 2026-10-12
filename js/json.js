export const SAMPLE = `{
  "workshop": "JSON Forge",
  "local": true,
  "heat": 1240,
  "operator": null,
  "metals": ["copper", "iron", "tin"],
  "batch": {
    "id": "HF-2026-014",
    "notes": "This document never leaves the browser.",
    "items": [
      { "sku": "anvil", "qty": 1, "ok": true },
      { "sku": "tongs", "qty": 4, "ok": false }
    ]
  }
}`;

export const SAMPLE_LEFT = `{
  "service": "forge",
  "version": 1,
  "public": true,
  "features": ["format", "tree"],
  "limits": { "bytes": 1000000, "offline": true },
  "owner": "ada"
}`;

export const SAMPLE_RIGHT = `{
  "owner": "ada",
  "service": "forge",
  "version": 2,
  "features": ["format", "tree", "diff"],
  "limits": { "offline": true, "bytes": 2000000 },
  "license": "MIT"
}`;

export function indentArg(indent) {
  if (indent === "tab") return "\t";
  return indent === "4" ? 4 : 2;
}

export function parseJson(text) {
  if (text.trim() === "") {
    return { empty: true, value: undefined, error: null, warnings: [] };
  }
  const warnings = findUnsafeNumbers(text);
  try {
    return { empty: false, value: JSON.parse(text), error: null, warnings };
  } catch (error) {
    return {
      empty: false,
      value: undefined,
      error: { message: error.message, ...locateError(text, error) },
      warnings,
    };
  }
}

export function formatValue(value, indent) {
  return JSON.stringify(value, null, indentArg(indent));
}

export function minifyValue(value) {
  return JSON.stringify(value);
}

export function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((sorted, key) => {
        sorted[key] = sortValue(value[key]);
        return sorted;
      }, {});
  }
  return value;
}

export function locateError(text, error) {
  const position = /position\s+(\d+)/i.exec(error.message);
  if (position) {
    const index = Number(position[1]);
    let line = 1;
    let column = 1;
    const end = Math.min(index, text.length);
    for (let i = 0; i < end; i += 1) {
      if (text[i] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    return { line, column, index };
  }
  const lineColumn = /line\s+(\d+)\s+column\s+(\d+)/i.exec(error.message);
  if (lineColumn) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]), index: null };
  }
  return { line: null, column: null, index: null };
}

export function collectStats(value, text) {
  const stats = {
    bytes: new TextEncoder().encode(text).length,
    characters: text.length,
    lines: text === "" ? 0 : text.split(/\n/).length,
    depth: 0,
    objects: 0,
    arrays: 0,
    strings: 0,
    numbers: 0,
    booleans: 0,
    nulls: 0,
    keys: 0,
  };
  if (value !== undefined) walkStats(value, 0, stats);
  return stats;
}

function walkStats(node, depth, stats) {
  if (node !== null && typeof node === "object") {
    const next = depth + 1;
    stats.depth = Math.max(stats.depth, next);
    if (Array.isArray(node)) {
      stats.arrays += 1;
      node.forEach((item) => walkStats(item, next, stats));
    } else {
      stats.objects += 1;
      Object.keys(node).forEach((key) => {
        stats.keys += 1;
        walkStats(node[key], next, stats);
      });
    }
    return;
  }
  if (node === null) stats.nulls += 1;
  else if (typeof node === "string") stats.strings += 1;
  else if (typeof node === "number") stats.numbers += 1;
  else if (typeof node === "boolean") stats.booleans += 1;
}

export function childPath(parent, key) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `${parent}.${key}`;
  return `${parent}[${JSON.stringify(key)}]`;
}

export function searchDocument(value, query) {
  const needle = query.trim().toLowerCase();
  const hits = [];
  if (!needle || value === undefined) return hits;
  walkSearch(value, "$", needle, hits);
  return hits;
}

function walkSearch(node, path, needle, hits) {
  if (hits.length >= 200) return;
  if (node !== null && typeof node === "object") {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walkSearch(item, `${path}[${index}]`, needle, hits));
      return;
    }
    Object.keys(node).forEach((key) => {
      const next = childPath(path, key);
      if (key.toLowerCase().includes(needle)) {
        hits.push({ path: next, kind: "key", preview: key });
      }
      walkSearch(node[key], next, needle, hits);
    });
    return;
  }
  const preview = JSON.stringify(node);
  if (preview.toLowerCase().includes(needle)) {
    hits.push({ path, kind: "value", preview });
  }
}

export function diffValues(left, right) {
  const changes = [];
  walkDiff(left, right, "$", changes);
  return changes;
}

function walkDiff(left, right, path, changes) {
  if (sameJson(left, right)) return;
  const leftComplex = left !== null && typeof left === "object";
  const rightComplex = right !== null && typeof right === "object";
  if (!leftComplex || !rightComplex || Array.isArray(left) !== Array.isArray(right)) {
    changes.push({ type: "changed", path, left, right });
    return;
  }
  if (Array.isArray(left)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const next = `${path}[${index}]`;
      if (index >= left.length) changes.push({ type: "added", path: next, right: right[index] });
      else if (index >= right.length) changes.push({ type: "removed", path: next, left: left[index] });
      else walkDiff(left[index], right[index], next, changes);
    }
    return;
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  keys.forEach((key) => {
    const next = childPath(path, key);
    const inLeft = Object.prototype.hasOwnProperty.call(left, key);
    const inRight = Object.prototype.hasOwnProperty.call(right, key);
    if (!inLeft) changes.push({ type: "added", path: next, right: right[key] });
    else if (!inRight) changes.push({ type: "removed", path: next, left: left[key] });
    else walkDiff(left[key], right[key], next, changes);
  });
}

function sameJson(left, right) {
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

export function previewJson(value) {
  if (value === undefined) return "";
  const text = JSON.stringify(value);
  return text.length > 88 ? `${text.slice(0, 85)}...` : text;
}

export function formatWithPaths(value, indent) {
  const unit = indent === "tab" ? "\t" : " ".repeat(indent === "4" ? 4 : 2);
  const chunks = [];
  const spans = [];
  let pos = 0;

  function push(text) {
    chunks.push(text);
    pos += text.length;
  }

  function write(node, path, depth) {
    const span = { path, start: pos, end: pos };
    spans.push(span);
    if (node === null || typeof node !== "object") {
      push(JSON.stringify(node));
      span.end = pos;
      return;
    }
    const isArray = Array.isArray(node);
    const entries = isArray
      ? node.map((item, index) => ({ key: index, value: item, index: true }))
      : Object.keys(node).map((key) => ({ key, value: node[key], index: false }));
    if (entries.length === 0) {
      push(isArray ? "[]" : "{}");
      span.end = pos;
      return;
    }
    push(isArray ? "[\n" : "{\n");
    entries.forEach((entry, index) => {
      push(unit.repeat(depth + 1));
      if (!entry.index) push(`${JSON.stringify(entry.key)}: `);
      const next = entry.index ? `${path}[${entry.key}]` : childPath(path, entry.key);
      write(entry.value, next, depth + 1);
      push(index < entries.length - 1 ? ",\n" : "\n");
    });
    push(`${unit.repeat(depth)}${isArray ? "]" : "}"}`);
    span.end = pos;
  }

  write(value, "$", 0);
  const text = chunks.join("");
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") lineStarts.push(index + 1);
  }
  function lineOf(offset) {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  }
  const map = new Map();
  spans.forEach((span) => {
    map.set(span.path, {
      startLine: lineOf(span.start),
      endLine: lineOf(Math.max(span.start, span.end - 1)),
    });
  });
  return { text, map };
}

function findUnsafeNumbers(text) {
  const warnings = [];
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < text.length) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      index += 1;
      continue;
    }
    if (char === "-" || isDigit(char)) {
      const start = index;
      if (char === "-") index += 1;
      while (isDigit(text[index])) index += 1;
      let exactInteger = true;
      if (text[index] === ".") {
        exactInteger = false;
        index += 1;
        while (isDigit(text[index])) index += 1;
      }
      if (text[index] === "e" || text[index] === "E") {
        exactInteger = false;
        index += 1;
        if (text[index] === "+" || text[index] === "-") index += 1;
        while (isDigit(text[index])) index += 1;
      }
      const literal = text.slice(start, index);
      if (exactInteger && literal !== "-" && !Number.isSafeInteger(Number(literal))) warnings.push(literal);
      continue;
    }
    index += 1;
  }
  return warnings;
}

function isDigit(char) {
  return char >= "0" && char <= "9";
}
