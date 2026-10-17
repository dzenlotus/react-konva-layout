import { memo, useState } from 'react';
import { Circle, Line, Rect, Text } from 'react-konva';
import { Box, Col, Flex, Grid, LayoutText, Row } from '../lib';
import type { PlaygroundSettings, Scene } from './settings';

const font = 'Arial';
const swatches = ['#c9e7c4', '#e7dfc4', '#d5dfee', '#e9d3c9', '#d9d1e6', '#c6e2dd'];

function Port({ index, side }: { index: number; side: string }) {
  return (
    <Box
      id={`${side}-port-${index}`}
      data-testid={`${side}-port-${index}`}
      width={16}
      height={16}
      render={() => (
        <>
          <Rect width={16} height={16} cornerRadius={5} fill="#e3e8dd" />
          <Circle x={8} y={8} radius={3} fill="#63715b" />
        </>
      )}
    />
  );
}

function ImagePreview({ width, height }: { width: number; height: number }) {
  return (
    <>
      <Rect width={width} height={height} fill="#e0e9da" cornerRadius={9} />
      <Circle x={width * 0.74} y={height * 0.27} radius={13} fill="#f9faf1" />
      <Line
        points={[
          0,
          height,
          0,
          height * 0.8,
          width * 0.32,
          height * 0.28,
          width * 0.69,
          height,
          width,
          height,
        ]}
        fill="#a6b99a"
        closed
      />
      <Line
        points={[0, height, width * 0.64, height * 0.4, width, height * 0.8, width, height]}
        fill="#748d69"
        closed
      />
      <Text
        text="PREVIEW / 01"
        x={12}
        y={height - 20}
        fontSize={9}
        letterSpacing={1}
        fill="#fff"
        fontFamily={font}
      />
    </>
  );
}

const NodeExample = memo(function NodeExample({
  gap,
  maxWidth,
  onSelect,
}: {
  gap: number;
  maxWidth: number;
  onSelect: (id: string) => void;
}) {
  const [description, setDescription] = useState(
    'Этот модуль создан для того, чтобы помогать людям. Размеры и переносы рассчитывает браузер.',
  );
  return (
    <Flex
      id="scene-root"
      data-testid="scene-root"
      width="100%"
      height="100%"
      padding={28}
      alignItems="center"
      justifyContent="center"
    >
      <Col
        id="node"
        data-testid="node"
        layoutRoot
        lodLabel="Image transform"
        width="100%"
        maxWidth={maxWidth}
        flexShrink={0}
        gap={gap}
        padding={24}
        fill="#ffffff"
        stroke="#d8ddd2"
        cornerRadius={16}
      >
        <Row id="main" width="100%" gap={8} alignItems="center">
          <Col id="content" data-testid="node-content" width="100%" gap={gap}>
            <Row id="label-row" alignItems="center" gap={7}>
              <Box
                id="status-dot"
                width={6}
                height={6}
                render={() => <Circle x={3} y={3} radius={3} fill="#688c4d" />}
              />
              <LayoutText
                id="label"
                text="IMAGE PROCESSING"
                fontSize={10}
                fontFamily={font}
                fontStyle="bold"
                color="#6d7e60"
              />
            </Row>
            <Col id="heading" gap={6}>
              <LayoutText
                id="title"
                data-testid="node-title"
                text="Image transform"
                fontSize={24}
                fontFamily={font}
                fontStyle="bold"
                color="#20281c"
              />
              <LayoutText
                id="subtitle"
                text="Нормализация входящего изображения"
                fontSize={12}
                fontFamily={font}
                color="#848a7e"
              />
            </Col>
            <Row id="figure" data-testid="node-figure" width="100%" gap={gap} alignItems="center">
              <Col id="inPorts" data-testid="input-ports" gap={12}>
                {[0, 1, 2].map((i) => (
                  <Port key={i} index={i} side="in" />
                ))}
              </Col>
              <Box
                id="image"
                data-testid="node-image"
                flexGrow={1}
                minWidth={0}
                height={116}
                render={ImagePreview}
                onClick={() => onSelect('image')}
              />
              <Col id="outPorts" data-testid="output-ports" gap={12}>
                {[0, 1, 2].map((i) => (
                  <Port key={i} index={i} side="out" />
                ))}
              </Col>
            </Row>
            <LayoutText
              id="description"
              data-testid="node-description"
              text={description}
              editable
              onTextChange={setDescription}
              width="100%"
              fontSize={12}
              lineHeight={1.5}
              fontFamily={font}
              color="#737b6c"
            />
          </Col>
        </Row>
        <Row
          id="actionPanel"
          data-testid="action-panel"
          height={40}
          width="100%"
          padding={5}
          gap={8}
          alignItems="center"
          fill="#f1f3ed"
          cornerRadius={8}
        >
          {['run', 'settings'].map((action, i) => (
            <Box
              key={action}
              id={action}
              data-testid={`node-${action}`}
              width={30}
              height={30}
              fill={i === 0 ? '#d1e5ba' : '#e1e6da'}
              cornerRadius={5}
              onClick={() => onSelect(action)}
              render={() =>
                i === 0 ? (
                  <Line points={[12, 9, 21, 15, 12, 21]} closed fill="#496239" />
                ) : (
                  <>
                    <Line
                      points={[8, 11, 22, 11, 8, 19, 22, 19]}
                      stroke="#64715b"
                      strokeWidth={1.5}
                    />
                    <Circle x={13} y={11} radius={3} fill="#64715b" />
                    <Circle x={18} y={19} radius={3} fill="#64715b" />
                  </>
                )
              }
            />
          ))}
          <Box id="action-spacer" flexGrow={1} />
          <LayoutText
            id="node-id"
            text="node_01"
            fontSize={10}
            fontFamily="monospace"
            color="#969e8d"
          />
          <Box id="action-end-space" width={5} />
        </Row>
      </Col>
    </Flex>
  );
});

function Tile({
  index,
  onSelect,
  grow = false,
}: {
  index: number;
  onSelect: (id: string) => void;
  grow?: boolean;
}) {
  return (
    <Col
      id={`item-${index}`}
      data-testid={`item-${index}`}
      width={grow ? undefined : 144}
      minWidth={grow ? 0 : 90}
      height={grow ? undefined : 96}
      minHeight={96}
      flexGrow={grow ? 1 : 0}
      padding={grow ? 12 : 16}
      gap={10}
      fill={swatches[index % swatches.length]}
      cornerRadius={10}
      onClick={() => onSelect(`item-${index}`)}
    >
      <LayoutText
        id={`number-${index}`}
        text={`0${index + 1}`}
        fontFamily="monospace"
        fontSize={11}
        color="#62715b"
      />
      <LayoutText
        id={`name-${index}`}
        text={['Источник', 'Обработка', 'Результат', 'Маска', 'Метаданные', 'Экспорт'][index % 6]}
        fontFamily={font}
        fontSize={14}
        fontStyle="bold"
        color="#34422d"
      />
    </Col>
  );
}

export function PlaygroundScene({
  scene,
  settings,
  onSelect,
}: {
  scene: Scene;
  settings: PlaygroundSettings;
  onSelect: (id: string) => void;
}) {
  const { gap, maxWidth, direction, align, justify, count, columns } = settings;
  if (scene === 'node') return <NodeExample gap={gap} maxWidth={maxWidth} onSelect={onSelect} />;
  else if (scene === 'flex')
    return (
      <Flex
        id="flex-root"
        data-testid="flex-root"
        direction={direction}
        width="100%"
        height="100%"
        padding={32}
        gap={gap}
        flexWrap="wrap"
        alignItems={align}
        justifyContent={justify}
      >
        {Array.from({ length: count }, (_, i) => (
          <Tile key={i} index={i} onSelect={onSelect} />
        ))}
      </Flex>
    );
  else
    return (
      <Grid
        id="grid-root"
        data-testid="grid-root"
        width="100%"
        padding={32}
        gap={gap}
        gridTemplateColumns={`repeat(${columns}, minmax(0, 1fr))`}
      >
        {Array.from({ length: count }, (_, i) => (
          <Tile key={i} index={i} onSelect={onSelect} grow />
        ))}
      </Grid>
    );
}
