import type { CSSProperties } from 'react';

export type Scene = 'card' | 'flex' | 'grid';
export interface PlaygroundSettings {
  width: number;
  gap: number;
  maxWidth: number;
  direction: 'row' | 'column';
  align: CSSProperties['alignItems'];
  justify: CSSProperties['justifyContent'];
  columns: number;
  count: number;
  debug: boolean;
}

function initialCanvasWidth() {
  return Math.min(
    720,
    Math.max(320, Math.floor((window.innerWidth - (window.innerWidth > 760 ? 360 : 56)) / 10) * 10),
  );
}

export function initialSettings(): PlaygroundSettings {
  return {
    width: initialCanvasWidth(),
    gap: 12,
    maxWidth: 340,
    direction: 'row',
    align: 'center',
    justify: 'center',
    columns: 3,
    count: 6,
    debug: false,
  };
}

export function exampleCode(scene: Scene, settings: PlaygroundSettings, height: number): string {
  const { width, gap, maxWidth, direction, align, justify, columns, debug } = settings;
  return scene === 'card'
    ? `<Stage width={${width}} height={${height}}>
<Layer>
<Layout width={${width}} height={${height}} debug={${debug}}>
  <Flex width="100%" height="100%"
    alignItems="center" justifyContent="center">
    <Col maxWidth={${maxWidth}} width="100%" gap={${gap}}>
      <Row><Col>{/* label, title, subtitle */}
        <Row gap={${gap}} alignItems="center">
          <Col>{/* input ports */}</Col>
          <Box flexGrow={1} height={116}
            render={({ width, height }) => <ImagePreview {...{width, height}} />} />
          <Col>{/* output ports */}</Col>
        </Row>
        <LayoutText text="Описание модуля" />
      </Col></Row>
      <Row height={40}>{/* action buttons */}</Row>
    </Col>
  </Flex>
</Layout>
</Layer>
</Stage>`
    : scene === 'flex'
      ? `<Stage width={${width}} height={${height}}>
<Layer>
<Layout width={${width}} height={${height}} debug={${debug}}>
  <Flex width="100%" height="100%" padding={32}
    direction="${direction}" gap={${gap}} flexWrap="wrap"
    alignItems="${align}" justifyContent="${justify}">
    {items.map(item => <Tile key={item.id} {...item} />)}
  </Flex>
</Layout>
</Layer>
</Stage>`
      : `<Stage width={${width}} height={${height}}>
<Layer>
<Layout width={${width}} height={${height}} debug={${debug}}>
  <Grid width="100%" padding={32} gap={${gap}}
    gridTemplateColumns="repeat(${columns}, minmax(0, 1fr))">
    {items.map(item => <Tile key={item.id} {...item} />)}
  </Grid>
</Layout>
</Layer>
</Stage>`;
}
