import { useLayoutEffect, type ComponentType, type PropsWithChildren, type ReactNode } from 'react';
import { createMeasurementRoot } from '@layout/runtime';
import type { MeasurementDomRoot } from './runtimeTypes';
import { LayoutContext, RegistryContext } from './context';
import { measurementCss, type MeasurementEngine } from './measurement/MeasurementEngine';

function MeasurementCommit({ engine, children }: PropsWithChildren<{ engine: MeasurementEngine }>) {
  useLayoutEffect(() => engine.commit());
  return <>{children}</>;
}

/** Owns the DOM reconciler only; attachment and geometry belong to the engine. */
export class MeasurementRoot {
  private readonly root: MeasurementDomRoot;

  constructor(private readonly engine: MeasurementEngine) {
    this.root = createMeasurementRoot(engine.root);
  }

  render(Bridge: ComponentType<PropsWithChildren<{}>>, children: ReactNode): void {
    this.engine.beginRender();
    this.root.render(
      <Bridge>
        <LayoutContext.Provider value={this.engine.context}>
          <RegistryContext.Provider value={this.engine.registry}>
            <MeasurementCommit engine={this.engine}>{children}</MeasurementCommit>
            <style>{measurementCss}</style>
          </RegistryContext.Provider>
        </LayoutContext.Provider>
      </Bridge>,
    );
  }

  dispose(): void {
    this.root.unmount();
  }
}
