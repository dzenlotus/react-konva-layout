import type { ComponentType, Context, PropsWithChildren, ReactElement, ReactNode } from 'react';

export interface MeasurementDomRoot {
  render(content: ReactElement): void;
  unmount(): void;
}

export interface ContextCaptureProps {
  contexts: readonly Context<any>[];
  children(Bridge: ComponentType<PropsWithChildren<{}>>): ReactNode;
}
