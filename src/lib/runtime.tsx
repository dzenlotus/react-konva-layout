import { useId, useSyncExternalStore, type ReactElement, type Ref } from 'react';
import { createRoot } from 'react-dom/client';
import { useContextBridge } from 'react-konva';
import type { ContextCaptureProps, MeasurementDomRoot } from './runtimeTypes';

export { useId as useMeasurementId, useSyncExternalStore };

export function createMeasurementRoot(container: HTMLElement): MeasurementDomRoot {
  return createRoot(container);
}

export function CaptureContexts({ children }: ContextCaptureProps) {
  const Bridge = useContextBridge();
  return <>{children(Bridge)}</>;
}

export function getElementRef<T>(element: ReactElement<{ ref?: Ref<T> }>): Ref<T> | undefined {
  return element.props.ref;
}
