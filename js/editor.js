import { basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, Decoration } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { SearchCursor } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";

const addedLine = Decoration.line({ class: "cm-diff-added" });
const removedLine = Decoration.line({ class: "cm-diff-removed" });
const changedLine = Decoration.line({ class: "cm-diff-changed" });
const searchMark = Decoration.mark({ class: "cm-search-hit" });
const lineDecorations = { added: addedLine, removed: removedLine, changed: changedLine };

const lightEditor = EditorView.theme({
  "&": { backgroundColor: "#fffdfb", color: "#241c16", height: "100%" },
  ".cm-content": { caretColor: "#c45c24" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#c45c24" },
  ".cm-gutters": { backgroundColor: "#f6f1ea", color: "#8a786a", border: "none" },
  ".cm-activeLine": { backgroundColor: "rgba(196, 92, 36, 0.06)" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(196, 92, 36, 0.1)" },
  "&.cm-focused": { outline: "none" },
}, { dark: false });

const darkEditor = [
  oneDark,
  EditorView.theme({
    "&": { backgroundColor: "#161310", height: "100%" },
    ".cm-gutters": { backgroundColor: "#201b17", border: "none" },
    "&.cm-focused": { outline: "none" },
  }, { dark: true }),
];

function indentExtensions(indent) {
  if (indent === "tab") return [indentUnit.of("\t"), EditorState.tabSize.of(2)];
  const size = indent === "4" ? 4 : 2;
  return [indentUnit.of(" ".repeat(size)), EditorState.tabSize.of(size)];
}

export function createJsonEditor(parent, { doc = "", onUpdate, onFormat, onMinify, readOnly = false } = {}) {
  const themeCompartment = new Compartment();
  const indentCompartment = new Compartment();
  const searchCompartment = new Compartment();
  const diffCompartment = new Compartment();

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        lintGutter(),
        themeCompartment.of(darkEditor),
        indentCompartment.of(indentExtensions("2")),
        searchCompartment.of(EditorView.decorations.of(Decoration.none)),
        diffCompartment.of(EditorView.decorations.of(Decoration.none)),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (onUpdate && (update.docChanged || update.selectionSet)) onUpdate(update);
        }),
        keymap.of([
          { key: "Mod-Enter", run: () => (onFormat ? onFormat() : false) },
          { key: "Mod-Shift-m", run: () => (onMinify ? onMinify() : false) },
        ]),
      ],
    }),
  });

  function setText(text) {
    const current = view.state.doc.toString();
    if (current === text) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
  }

  function setTheme(theme) {
    view.dispatch({ effects: themeCompartment.reconfigure(theme === "light" ? lightEditor : darkEditor) });
  }

  function setIndent(indent) {
    view.dispatch({ effects: indentCompartment.reconfigure(indentExtensions(indent)) });
  }

  function setSearchQuery(query) {
    const needle = query.trim();
    if (!needle) {
      view.dispatch({ effects: searchCompartment.reconfigure(EditorView.decorations.of(Decoration.none)) });
      return 0;
    }
    const ranges = [];
    const cursor = new SearchCursor(
      view.state.doc,
      needle,
      0,
      view.state.doc.length,
      (value) => value.toLowerCase(),
    );
    while (!cursor.next().done && ranges.length < 500) {
      ranges.push(searchMark.range(cursor.value.from, cursor.value.to));
    }
    view.dispatch({
      effects: searchCompartment.reconfigure(EditorView.decorations.of(Decoration.set(ranges, true))),
    });
    return ranges.length;
  }

  function setDiffLines(lineClasses) {
    if (!lineClasses || lineClasses.size === 0) {
      view.dispatch({ effects: diffCompartment.reconfigure(EditorView.decorations.of(Decoration.none)) });
      return;
    }
    const ranges = [];
    lineClasses.forEach((kind, line) => {
      if (line < 1 || line > view.state.doc.lines) return;
      ranges.push(lineDecorations[kind].range(view.state.doc.line(line).from));
    });
    ranges.sort((a, b) => a.from - b.from);
    view.dispatch({
      effects: diffCompartment.reconfigure(EditorView.decorations.of(Decoration.set(ranges, true))),
    });
  }

  function goto(line, column = 1, focus = true) {
    if (!line) return;
    const safeLine = Math.min(Math.max(line, 1), view.state.doc.lines);
    const lineInfo = view.state.doc.line(safeLine);
    const columnIndex = Math.min(Math.max(column, 1), lineInfo.length + 1);
    const anchor = lineInfo.from + columnIndex - 1;
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    if (focus) view.focus();
  }

  function gotoIndex(index) {
    if (index == null) return;
    const anchor = Math.min(Math.max(index, 0), view.state.doc.length);
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    view.focus();
  }

  return {
    view,
    setText,
    getText: () => view.state.doc.toString(),
    setTheme,
    setIndent,
    setSearchQuery,
    setDiffLines,
    goto,
    gotoIndex,
    focus: () => view.focus(),
  };
}

