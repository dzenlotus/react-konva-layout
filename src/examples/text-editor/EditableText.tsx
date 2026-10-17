import { useLayoutEffect, useRef } from 'react';
import type Konva from 'konva';
import { Text } from 'react-konva';
import { useLayout } from '../../lib';
import type { CellTextRenderProps } from '../../lib';
import { openTextEditor, type TextEditorHandle } from '.';

interface EditableTextProps {
  cellId: string;
  bounds: CellTextRenderProps;
  onChange(value: string): void;
  onEditingChange(editing: boolean): void;
}

/** Application behavior: CellText itself only measures this Text's content. */
export function EditableText({ cellId, bounds, onChange, onEditingChange }: EditableTextProps) {
  const layout = useLayout();
  const text = useRef<Konva.Text | null>(null);
  const editor = useRef<TextEditorHandle | null>(null);
  const callbacks = useRef({ onChange, onEditingChange });
  callbacks.current = { onChange, onEditingChange };

  useLayoutEffect(() => {
    // A newly loaded webfont can change line measurement without changing the
    // fontFamily string. CellText rerenders us after its browser measurement.
    text.current?.fire('fontFamilyChange');
    const node = layout.getLayout(cellId);
    if (node) editor.current?.update(node, bounds);
    else editor.current?.();
  });
  useLayoutEffect(
    () => () => {
      editor.current?.();
    },
    [],
  );

  const begin = () => {
    const target = text.current;
    const node = layout.getLayout(cellId);
    if (!target?.getStage() || !node || editor.current) return;
    callbacks.current.onEditingChange(true);
    // Remove stale bitmaps synchronously before hiding the native Text. The
    // application also disables its node cache for the duration of this edit.
    target.getAncestors().forEach((ancestor) => {
      if (ancestor.isCached()) ancestor.clearCache();
    });
    editor.current = openTextEditor({
      target,
      node,
      bounds,
      onCommit: (value) => callbacks.current.onChange(value),
      onClose: () => {
        editor.current = null;
        callbacks.current.onEditingChange(false);
      },
    });
  };

  return <Text ref={text} name="text" {...bounds} onDblClick={begin} onDblTap={begin} />;
}
