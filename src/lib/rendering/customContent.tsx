import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefCallback,
  type MutableRefObject,
} from 'react';
import { getElementRef } from '@layout/runtime';
import type Konva from 'konva';
import { Text } from 'react-konva';
import type { SceneElement } from '../model';
import { textAttributes } from './text';
import { isReplacedCell } from './scene';

const eventHandlerName = /^on[A-Z]/;

interface CustomTextProps {
  ref?: Ref<Konva.Text>;
}

function bindTextRef(
  textRef: MutableRefObject<Konva.Text | null>,
  consumerRef?: Ref<Konva.Text>,
): RefCallback<Konva.Text> {
  return (node) => {
    textRef.current = node;
    if (typeof consumerRef === 'function') {
      const cleanup = (consumerRef as (node: Konva.Text | null) => void | (() => void))(node);
      if (cleanup) {
        return () => {
          textRef.current = null;
          cleanup();
        };
      }
    } else if (consumerRef) {
      (consumerRef as MutableRefObject<Konva.Text | null>).current = node;
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
  item: SceneElement;
  textRef: MutableRefObject<Konva.Text | null>;
  optimized: boolean;
  bubbling: boolean;
  ownVisible: boolean;
}

/** Keep consumer render functions and Text refs stable between scene updates. */
export function useCustomContent({
  item,
  textRef,
  optimized,
  bubbling,
  ownVisible,
}: CustomContentOptions): ReactNode {
  const { layout, props, textStyle } = item;
  const { width, height } = layout;
  return useMemo(() => {
    if (!ownVisible) return null;
    const replaced = isReplacedCell(item);
    const bounds = { x: 0, y: 0, width, height };
    const textProps = textStyle && {
      x: textStyle.paddingLeft,
      y: textStyle.paddingTop,
      width: Math.max(0, width - textStyle.paddingLeft - textStyle.paddingRight),
      height: Math.max(0, height - textStyle.paddingTop - textStyle.paddingBottom),
      ...textAttributes(props.text ?? '', textStyle),
    };
    const renderText = replaced ? props.renderTextFallback : props.renderText;
    const render = replaced ? props.renderFallback : props.render;
    const content =
      renderText && textProps
        ? renderText(textProps)
        : render
          ? render(bounds)
          : replaced
            ? props.fallback
            : undefined;
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
          return cloneElement(textElement, {
            ref: bindTextRef(textRef, getElementRef(textElement)),
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
    props.renderWhen,
    props.fallback,
    props.renderFallback,
    props.renderTextFallback,
    props.text,
    props.wrap,
    width,
    height,
    textStyle,
    optimized,
    bubbling,
    ownVisible,
    layout.type,
    textRef,
  ]);
}
