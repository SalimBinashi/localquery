import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { sql, SQLite, type SQLNamespace } from '@codemirror/lang-sql';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', fontSize: '12.5px' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, monospace', lineHeight: '1.6', fontVariantLigatures: 'none' },
  '.cm-content': { caretColor: 'var(--accent-blue)', padding: '8px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-blue)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-gutters': { backgroundColor: 'var(--bg-panel)', color: 'var(--text-muted)', borderRight: '1px solid var(--border-color)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--bg-subtle) 55%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--bg-subtle)', outline: '1px solid var(--border-color)' },
  '.cm-tooltip': { backgroundColor: 'var(--bg-panel-header)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--selection)', color: 'var(--text-primary)' },
  '.cm-panels': { backgroundColor: 'var(--bg-panel-header)', color: 'var(--text-primary)' },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.typeName, t.standard(t.name)], color: 'var(--syn-type)' },
  { tag: [t.name, t.special(t.name), t.quote], color: 'var(--syn-ident)' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--text-secondary)' },
]);

export interface SqlEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onRun?: () => void;
  readonly ariaLabel: string;
  readonly testId: string;
  readonly completionSchema?: SQLNamespace;
}

/** CodeMirror 6 SQL editor (SQLite dialect) with line numbers, highlighting and Mod-Enter to run. */
export function SqlEditor({ value, onChange, onRun, ariaLabel, testId, completionSchema }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const callbacks = useRef({ onChange, onRun });
  callbacks.current = { onChange, onRun };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          Prec.highest(keymap.of([{ key: 'Mod-Enter', preventDefault: true, run: () => (callbacks.current.onRun?.(), true) }])),
          basicSetup,
          language.current.of(sql({ dialect: SQLite, upperCaseKeywords: true })),
          theme,
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, 'data-testid': `${testId}-input` }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; external value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(sql({ dialect: SQLite, upperCaseKeywords: true, schema: completionSchema })) });
  }, [completionSchema]);

  return <div ref={host} data-testid={testId} className="h-full min-h-0 overflow-hidden" />;
}
