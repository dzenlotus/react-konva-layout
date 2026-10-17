import { forwardRef, memo, useState } from 'react';
import type Konva from 'konva';
import { Circle, Image as CanvasImage, Line, Rect, Text } from 'react-konva';
import { Cell, CellText, Flex } from '../lib';
import type { CellBounds, LayoutHandle, LayoutMetrics } from '../lib';
import type { ReferenceNodeDetail } from './referenceNodeDetail';
import { EditableText } from './text-editor/EditableText';

const FONT = 'Helvetica Neue, Arial, sans-serif';

export interface ReferenceNodeAction {
  id: string;
  kind: 'run' | 'settings';
}

export const DEFAULT_NODE_ACTIONS: readonly ReferenceNodeAction[] = [
  { id: 'run', kind: 'run' },
  { id: 'settings', kind: 'settings' },
];

function cursor(event: Konva.KonvaEventObject<MouseEvent>, value: string) {
  const stage = event.target.getStage();
  if (stage) stage.container().style.cursor = value;
}

function Ports({
  side,
  prefix,
  onSelect,
}: {
  side: 'input' | 'output';
  prefix: string;
  onSelect?: (side: 'input' | 'output', index: number) => void;
}) {
  const color = side === 'input' ? '#829b68' : '#7d9cab';
  return (
    <Cell width={16} flexShrink={0}>
      <Flex id={`${prefix}-${side}-ports`} direction="column" gap={14} width="100%">
        {[0, 1, 2].map((index) => (
          <Cell
            key={index}
            id={`${prefix}-${side}-${index}`}
            width={16}
            height={16}
            onClick={() => onSelect?.(side, index)}
          >
            {(bounds) => (
              <>
                <Rect
                  {...bounds}
                  fill={side === 'input' ? '#edf2e7' : '#eaf0f2'}
                  cornerRadius={5}
                  onMouseEnter={(event) => cursor(event, 'crosshair')}
                  onMouseLeave={(event) => cursor(event, '')}
                />
                <Circle x={8} y={8} radius={3.3} fill={color} listening={false} />
              </>
            )}
          </Cell>
        ))}
      </Flex>
    </Cell>
  );
}

function PreviewPhoto({
  width,
  height,
  image,
}: {
  width: number;
  height: number;
  image?: HTMLImageElement;
}) {
  const scale = image ? Math.max(width / image.naturalWidth, height / image.naturalHeight) : 1;
  const crop = image
    ? {
        x: (image.naturalWidth - width / scale) / 2,
        y: (image.naturalHeight - height / scale) / 2,
        width: width / scale,
        height: height / scale,
      }
    : undefined;
  return (
    <>
      <Rect width={width} height={height} fill="#e2eadb" cornerRadius={9} listening={false} />
      {image && (
        <CanvasImage
          image={image}
          width={width}
          height={height}
          crop={crop}
          cornerRadius={9}
          listening={false}
        />
      )}
    </>
  );
}

function PreviewPlaceholder(bounds: CellBounds) {
  return (
    <Rect
      {...bounds}
      name="preview-placeholder"
      fill="#e2eadb"
      cornerRadius={9}
      listening={false}
    />
  );
}

export interface ReferenceNodeProps extends Partial<ReferenceNodeDetail> {
  id?: string;
  width?: number;
  x?: number;
  y?: number;
  layoutTemplate?: string;
  footerLabel?: string;
  debug?: boolean;
  title?: string;
  subtitle?: string;
  previewImage?: HTMLImageElement;
  description: string;
  onDescriptionChange(value: string): void;
  onMeasure?(metrics: LayoutMetrics): void;
  actions?: readonly ReferenceNodeAction[];
  onAction?(action: 'run' | 'settings'): void;
  onPortSelect?(side: 'input' | 'output', index: number): void;
}

/** A designed node using the CodeSandbox hierarchy and measured Flex/Cell/CellText. */
export const ReferenceNode = memo(
  forwardRef<LayoutHandle, ReferenceNodeProps>(function ReferenceNode(
    {
      id = 'reference-node',
      width = 360,
      x = 0,
      y = 0,
      layoutTemplate,
      footerLabel = 'node_01',
      debug = false,
      title = 'Image transform',
      subtitle = 'Нормализация входящего изображения',
      previewImage,
      description,
      onDescriptionChange,
      onMeasure,
      actions = DEFAULT_NODE_ACTIONS,
      onAction,
      onPortSelect,
      showPreview = true,
      showDescription = true,
      showActions = true,
    },
    ref,
  ) {
    const [editing, setEditing] = useState(false);
    return (
      <Flex
        ref={ref}
        id={id}
        data-testid={id}
        direction="column"
        layoutRoot
        cache={editing ? false : undefined}
        layoutTemplate={layoutTemplate}
        width={width}
        padding={24}
        gap={18}
        debug={debug}
        onMeasure={onMeasure}
        style={{ position: 'absolute', left: x, top: y }}
      >
        <Cell width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
          {(bounds) => (
            <Rect
              {...bounds}
              fill="#fff"
              stroke="#d9e0d2"
              strokeWidth={1}
              cornerRadius={16}
              shadowColor="#27381a"
              shadowBlur={24}
              shadowOffsetY={8}
              shadowOpacity={0.09}
              shadowForStrokeEnabled={false}
              listening={false}
            />
          )}
        </Cell>
        <Cell id={`${id}-main`} width="100%">
          <Flex width="100%" gap={8} alignItems="center">
            <Cell width="100%" minWidth={0}>
              <Flex id={`${id}-content`} direction="column" gap={12} width="100%">
                <Cell id={`${id}-label`}>
                  <Flex gap={6} alignItems="center">
                    <Cell width={6} height={6}>
                      {() => <Circle x={3} y={3} radius={3} fill="#91ac74" listening={false} />}
                    </Cell>
                    <CellText
                      text="IMAGE PROCESSING"
                      fontSize={9}
                      fontFamily={FONT}
                      fontStyle="bold"
                      lineHeight={1.3}
                      color="#81916f"
                      style={{ letterSpacing: '1.1px' }}
                    >
                      {(textProps) => <Text {...textProps} />}
                    </CellText>
                  </Flex>
                </Cell>
                <CellText
                  id={`${id}-title`}
                  text={title}
                  fontSize={24}
                  fontFamily={FONT}
                  fontStyle="bold"
                  lineHeight={1.2}
                  color="#27321f"
                  width="100%"
                  style={{ letterSpacing: '-0.4px' }}
                >
                  {(textProps) => <Text {...textProps} />}
                </CellText>
                <CellText
                  id={`${id}-subtitle`}
                  text={subtitle}
                  fontSize={12}
                  fontFamily={FONT}
                  lineHeight={1.4}
                  color="#929a89"
                  width="100%"
                >
                  {(textProps) => <Text {...textProps} />}
                </CellText>
                <Cell id={`${id}-media`} width="100%" height={156} flexShrink={0}>
                  <Flex width="100%" height="100%" gap={12} alignItems="center">
                    <Ports side="input" prefix={id} onSelect={onPortSelect} />
                    <Cell
                      id={`${id}-preview`}
                      flexGrow={1}
                      minWidth={0}
                      height="100%"
                      renderWhen={showPreview}
                      fallback={PreviewPlaceholder}
                    >
                      <Cell width="100%" height="100%">
                        {(bounds) => <PreviewPhoto {...bounds} image={previewImage} />}
                      </Cell>
                      <CellText
                        text="PREVIEW / 01"
                        width="calc(100% - 16px)"
                        height={12}
                        fontSize={8}
                        fontFamily={FONT}
                        fontStyle="bold"
                        color="#fff"
                        wrap="none"
                        style={{ position: 'absolute', left: 8, bottom: 8 }}
                      >
                        {(textProps) => <Text {...textProps} />}
                      </CellText>
                    </Cell>
                    <Ports side="output" prefix={id} onSelect={onPortSelect} />
                  </Flex>
                </Cell>
                <CellText
                  id={`${id}-description-text`}
                  renderWhen={showDescription || editing}
                  text={description}
                  width="100%"
                  fontSize={13}
                  lineHeight={1.5}
                  fontFamily={FONT}
                  color="#78816f"
                >
                  {(textProps) => (
                    <EditableText
                      cellId={`${id}-description-text`}
                      bounds={textProps}
                      onChange={onDescriptionChange}
                      onEditingChange={setEditing}
                    />
                  )}
                </CellText>
              </Flex>
            </Cell>
          </Flex>
        </Cell>
        <Cell
          id={`${id}-actions`}
          layoutRoot
          width="100%"
          minWidth={0}
          minHeight={44}
          flexShrink={0}
          renderWhen={showActions}
        >
          <Cell width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
            {(bounds) => <Rect {...bounds} fill="#f1f5ec" cornerRadius={8} listening={false} />}
          </Cell>
          <Flex width="100%" minHeight={44} padding={5} gap={7} flexWrap="wrap" alignItems="center">
            {actions.map((action) => (
              <Cell
                key={action.id}
                id={`${id}-${action.id === 'run' || action.id === 'settings' ? action.id : `action-${action.id}`}`}
                width={34}
                height={34}
                flexShrink={0}
                onClick={() => onAction?.(action.kind)}
              >
                {(bounds) => (
                  <>
                    <Rect
                      {...bounds}
                      fill={action.kind === 'run' ? '#d6e8c1' : '#e3eadd'}
                      cornerRadius={5}
                      onMouseEnter={(event) => cursor(event, 'pointer')}
                      onMouseLeave={(event) => cursor(event, '')}
                    />
                    {action.kind === 'run' ? (
                      <Line
                        points={[13, 10, 23, 17, 13, 24]}
                        closed
                        fill="#5e7b43"
                        listening={false}
                      />
                    ) : (
                      <>
                        <Line
                          points={[9, 12, 25, 12]}
                          stroke="#7c8b6d"
                          strokeWidth={1.5}
                          listening={false}
                        />
                        <Line
                          points={[9, 22, 25, 22]}
                          stroke="#7c8b6d"
                          strokeWidth={1.5}
                          listening={false}
                        />
                        <Circle x={14} y={12} radius={2.7} fill="#7c8b6d" listening={false} />
                        <Circle x={21} y={22} radius={2.7} fill="#7c8b6d" listening={false} />
                      </>
                    )}
                  </>
                )}
              </Cell>
            ))}
            <Cell flexGrow={1} />
            <CellText
              text={footerLabel}
              width={64}
              height={9}
              wrap="none"
              align="right"
              fontSize={9}
              fontFamily="monospace"
              color="#98a48c"
              padding="0 7px 0 0"
            >
              {(textProps) => <Text {...textProps} />}
            </CellText>
          </Flex>
        </Cell>
      </Flex>
    );
  }),
);
