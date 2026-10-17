import { useContext, useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ParentContext, RegistryContext } from './context';
import { layoutKeys } from './measurement/comparison';
import type { PrimitiveProps } from './model';
import type {
  BoxProps,
  CellProps,
  CellTextProps,
  FlexProps,
  LayoutNodeType,
  LayoutProps,
  LayoutTextProps,
} from './types';

function primitiveStyle(type: LayoutNodeType, props: PrimitiveProps): CSSProperties {
  const style: CSSProperties = { boxSizing: 'border-box', position: 'relative' };
  if (type === 'flex' || type === 'row' || type === 'col') {
    style.display = 'flex';
    style.flexDirection = props.direction ?? (type === 'col' ? 'column' : 'row');
  } else if (type === 'grid') {
    style.display = 'grid';
  }
  for (const name of layoutKeys) {
    if (props[name] !== undefined) Object.assign(style, { [name]: props[name] });
  }
  if (type === 'text' || type === 'cell-text') {
    const nativeDefaults = type === 'cell-text';
    Object.assign(style, {
      fontSize: props.fontSize ?? (nativeDefaults ? 12 : 16),
      fontFamily: props.fontFamily ?? (nativeDefaults ? 'Arial' : 'Arial, sans-serif'),
      fontStyle: props.fontStyle?.includes('italic') ? 'italic' : 'normal',
      fontWeight: props.fontStyle?.includes('bold') ? 'bold' : 'normal',
      lineHeight: props.lineHeight ?? (nativeDefaults ? 1 : 1.2),
      color: props.color ?? (nativeDefaults ? '#000000' : '#17202a'),
      textAlign: props.align ?? 'left',
      whiteSpace: props.wrap === 'none' ? 'pre' : 'pre-wrap',
      overflowWrap: props.wrap === 'char' ? 'anywhere' : 'break-word',
    });
  }
  return { ...style, ...props.style, pointerEvents: 'none' };
}

function Primitive({ type, props }: { type: LayoutNodeType; props: PrimitiveProps }) {
  const registry = useContext(RegistryContext);
  const parent = useContext(ParentContext);
  const key = useId();
  const element = useRef<HTMLDivElement>(null);
  if (!registry) throw new Error(`${type} must be rendered inside Layout`);

  useLayoutEffect(() => {
    if (element.current) registry.update({ key, parent, element: element.current, type, props });
  });
  useLayoutEffect(() => () => registry.remove(key), [registry, key]);

  return (
    <ParentContext.Provider value={key}>
      <div
        ref={element}
        id={props.id}
        data-testid={props['data-testid']}
        className={
          type === 'cell-text' ? 'konva-layout-node konva-layout-text' : 'konva-layout-node'
        }
        data-layout-key={key}
        data-layout-root={props.layoutRoot ? 'true' : undefined}
        data-layout-label={`${type}${props.id ? ` · ${props.id}` : ''}`}
        style={primitiveStyle(type, props)}
      >
        {type === 'text' || type === 'cell-text' ? props.text : props.children}
      </div>
    </ParentContext.Provider>
  );
}

export function Flex(props: FlexProps) {
  return <Primitive type="flex" props={props} />;
}
export function Row(props: LayoutProps) {
  return <Primitive type="row" props={props} />;
}
export function Col(props: LayoutProps) {
  return <Primitive type="col" props={props} />;
}
export function Grid(props: LayoutProps) {
  return <Primitive type="grid" props={props} />;
}
export function Box(props: BoxProps) {
  return <Primitive type="box" props={props} />;
}
export function LayoutText(props: LayoutTextProps) {
  return <Primitive type="text" props={props} />;
}
export function Cell({ children, ...props }: CellProps) {
  return (
    <Primitive
      type="cell"
      props={
        typeof children === 'function' ? { ...props, render: children } : { ...props, children }
      }
    />
  );
}
export function CellText({ children, ...props }: CellTextProps) {
  return <Primitive type="cell-text" props={{ ...props, renderText: children }} />;
}
