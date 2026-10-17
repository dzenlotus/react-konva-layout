import {
  createElement,
  useRef,
  useState,
  type ComponentType,
  type Context,
  type PropsWithChildren,
  type ReactElement,
  type Ref,
} from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { useSyncExternalStore } from 'use-sync-external-store/shim';
import type { ContextCaptureProps, MeasurementDomRoot } from '../lib/runtimeTypes';

export { useSyncExternalStore };

let nextId = 0;
export function useMeasurementId(): string {
  return useState(() => `layout16-${++nextId}`)[0];
}

export function createMeasurementRoot(container: HTMLElement): MeasurementDomRoot {
  return {
    render: (content) => {
      render(content, container);
    },
    unmount: () => {
      unmountComponentAtNode(container);
    },
  };
}

function CapturedValues({
  contexts,
  values,
  children,
}: ContextCaptureProps & { values: unknown[] }) {
  const currentValues = useRef(values);
  currentValues.current = values;
  const bridge = useRef<{
    contexts: readonly Context<any>[];
    component: ComponentType<PropsWithChildren<{}>>;
  }>();
  if (
    !bridge.current ||
    contexts.length !== bridge.current.contexts.length ||
    contexts.some((context, index) => context !== bridge.current!.contexts[index])
  ) {
    bridge.current = {
      contexts: [...contexts],
      component: ({ children: content }) => (
        <>
          {contexts.reduceRight(
            (child, context, index) =>
              createElement(context.Provider, { value: currentValues.current[index] }, child),
            content,
          )}
        </>
      ),
    };
  }
  return <>{children(bridge.current.component)}</>;
}

/** Consumers capture arbitrary context lists without changing hook order or reading Fiber internals. */
export function CaptureContexts({ contexts, children }: ContextCaptureProps) {
  const collect = (index: number, values: unknown[]): ReactElement =>
    index === contexts.length ? (
      <CapturedValues contexts={contexts} values={values}>
        {children}
      </CapturedValues>
    ) : (
      createElement(contexts[index].Consumer, {
        children: (value: unknown) => collect(index + 1, [...values, value]),
      })
    );
  return collect(0, []);
}

export function getElementRef<T>(element: ReactElement<{ ref?: Ref<T> }>): Ref<T> | undefined {
  return (element as unknown as { ref?: Ref<T> }).ref;
}
