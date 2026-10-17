import { forwardRef, useContext } from 'react';
import { RegistryContext } from './context';
import { Layout } from './Layout';
import { Flex as MeasuredFlex } from './primitives';
import type { FlexProps, LayoutComponentProps, LayoutHandle } from './types';

export interface FlexComponentProps extends FlexProps {
  debug?: LayoutComponentProps['debug'];
  performance?: LayoutComponentProps['performance'];
  contexts?: LayoutComponentProps['contexts'];
  onLayout?: LayoutComponentProps['onLayout'];
  onMeasure?: LayoutComponentProps['onMeasure'];
  onRenderStats?: LayoutComponentProps['onRenderStats'];
}

/** A root Flex starts a layout; nested Flex participates in the same browser pass. */
export const Flex = forwardRef<LayoutHandle, FlexComponentProps>(function Flex(
  { debug, performance, contexts, onLayout, onMeasure, onRenderStats, ...props },
  ref,
) {
  const registry = useContext(RegistryContext);
  if (registry) return <MeasuredFlex {...props} />;
  return (
    <Layout
      ref={ref}
      width={typeof props.width === 'number' ? props.width : undefined}
      height={typeof props.height === 'number' ? props.height : undefined}
      debug={debug}
      performance={performance}
      contexts={contexts}
      onLayout={onLayout}
      onMeasure={onMeasure}
      onRenderStats={onRenderStats}
    >
      <MeasuredFlex {...props} />
    </Layout>
  );
});
