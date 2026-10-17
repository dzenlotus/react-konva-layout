import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefCallback,
  type RefObject,
} from 'react';
import type Konva from 'konva';
import { Text } from 'react-konva';
import type { SceneNode } from '../model';
import { textAttributes } from './text';
import type { BeginEdit } from './scene';

const eventHandlerName = /^on[A-Z]/;

interface CustomTextProps {
  ref?: Ref<Konva.Text>;
  listening?: boolean;
  onDblClick?: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onDblTap?: (event: Konva.KonvaEventObject<TouchEvent>) => void;
}

function bindTextRef(
  textRef: RefObject<Konva.Text | null>,
  consumerRef?: Ref<Konva.Text>,
): RefCallback<Konva.Text> {
  return (node) => {
    textRef.current = node;
    if (typeof consumerRef === 'function') {
      const cleanup = consumerRef(node);
      if (cleanup) {
        return () => {
          textRef.current = null;
          cleanup();
        };
      }
    } else if (consumerRef) {
      consumerRef.current = node;
    }
  };
}

/** Host shapes without handlers do not need a hit graph. Opaque custom components retain their behavior. */
function decorateCustomContent(content: ReactNode, interactive = false): ReactNode {
  return Children.map(content, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<Record<string, unknown>>;
    const props = element.props;
    const hasHandler = Object.keys(props).some(
      (key) => eventHandlerName.test(key) && typeof props[key] === 'function',
    );
    const active = interactive || hasHandler;
    // Fragments are transparent; function components can contain their own handlers and stay untouched.
    if (typeof element.type === 'function' || typeof element.type === 'object') return child;
    const additions: Record<string, unknown> = {};
    if (
      typeof element.type === 'string' &&
      element.type !== 'Group' &&
      props.listening === undefined &&
      !active
    ) {
      additions.listening = false;
    }
    if (props.children !== undefined)
      additions.children = decorateCustomContent(props.children as ReactNode, active);
    return cloneElement(element, additions);
  });
}

interface CustomContentOptions {
  item: SceneNode;
  textRef: RefObject<Konva.Text | null>;
  optimized: boolean;
  bubbling: boolean;
  active: boolean;
  ownVisible: boolean;
  beginEdit: BeginEdit;
  islandKey: string;
}

/** Keep consumer render functions and editable Text refs stable between scene updates. */
export function useCustomContent({
  item,
  textRef,
  optimized,
  bubbling,
  active,
  ownVisible,
  beginEdit,
  islandKey,
}: CustomContentOptions): ReactNode {
  const { layout, props, textStyle } = item;
  const { width, height } = layout;
  return useMemo(() => {
    if (!ownVisible) return null;
    const content =
      props.renderText && textStyle
        ? props.renderText({
            x: textStyle.paddingLeft,
            y: textStyle.paddingTop,
            width: Math.max(0, width - textStyle.paddingLeft - textStyle.paddingRight),
            height: Math.max(0, height - textStyle.paddingTop - textStyle.paddingBottom),
            ...textAttributes(props.text ?? '', textStyle),
          })
        : props.render?.({ x: 0, y: 0, width, height });
    const decorative = optimized ? decorateCustomContent(content, bubbling) : content;
    if (layout.type !== 'cell-text') return decorative;
    let bound = false;
    const bindText = (nodes: ReactNode): ReactNode =>
      Children.map(nodes, (child) => {
        if (!isValidElement(child)) return child;
        const element = child as ReactElement<Record<string, unknown>>;
        if (element.type === Text && !bound) {
          bound = true;
          const textElement = element as ReactElement<CustomTextProps>;
          const edit = () => {
            if (active && props.editable && textRef.current)
              beginEdit(item, textRef.current, islandKey);
          };
          return cloneElement(textElement, {
            ref: bindTextRef(textRef, textElement.props.ref),
            ...(props.editable
              ? {
                  listening: textElement.props.listening ?? active,
                  onDblClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
                    textElement.props.onDblClick?.(event);
                    edit();
                  },
                  onDblTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
                    textElement.props.onDblTap?.(event);
                    edit();
                  },
                }
              : {}),
          });
        }
        if (typeof element.type === 'function' || typeof element.type === 'object') return child;
        return element.props.children === undefined
          ? child
          : cloneElement(element, {
              children: bindText(element.props.children as ReactNode),
            });
      });
    return bindText(decorative);
  }, [
    props.render,
    props.renderText,
    props.editable,
    props.text,
    props.wrap,
    width,
    height,
    textStyle,
    optimized,
    bubbling,
    ownVisible,
    layout.type,
    active,
    beginEdit,
    item,
    islandKey,
    textRef,
  ]);
}
