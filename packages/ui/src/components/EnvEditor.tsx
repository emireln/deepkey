import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

const envLang = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.sol() && stream.match("export ")) return "keyword";
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_.]*/)) return "atom";
    if (stream.match("=")) return "operator";
    if (stream.match(/^".*?"/) || stream.match(/^'.*?'/)) return "string";
    stream.next();
    return "string";
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.atom, color: "#E8EAED" },
  { tag: tags.string, color: "#A5A7AC" },
  { tag: tags.comment, color: "#7F8288" },
  { tag: tags.keyword, color: "#1688F8" },
  { tag: tags.operator, color: "#7F8288" },
]);

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "#353638", color: "#F4F4F5", fontSize: "13px", minHeight: "320px" },
    ".cm-content": { fontFamily: "Geist Mono, ui-monospace, monospace", caretColor: "#F4F4F5" },
    ".cm-gutters": { backgroundColor: "#353638", color: "#7F8288", border: "none" },
    "&.cm-focused": { outline: "none" },
    ".cm-activeLine": { backgroundColor: "#3B3C3E" },
  },
  { dark: true },
);

export function EnvEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
  duplicates?: string[];
}) {
  const parent = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!parent.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        envLang,
        syntaxHighlighting(highlight),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: parent.current });
    viewRef.current = view;
    return () => view.destroy();
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div className="editor" ref={parent} />;
}
