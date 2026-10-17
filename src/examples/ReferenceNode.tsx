import { forwardRef, memo } from 'react';
import { Line, Rect, Text } from 'react-konva';
import { Cell, CellText, Flex } from '../lib';
import type { CellTextProps, LayoutHandle, LayoutMetrics } from '../lib';

const GRAY = '#808080';

function TextBlock({
  schematic,
  id,
  ...props
}: Omit<CellTextProps, 'children'> & { schematic: boolean; id: string }) {
  return (
    <Cell id={id} width="100%">
      <Cell width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
        {(bounds) => <Rect {...bounds} fill={GRAY} />}
      </Cell>
      <CellText {...props} id={`${id}-text`} width="100%" padding={8} color="#111">
        {(textProps) => <Text {...textProps} opacity={schematic ? 0 : 1} />}
      </CellText>
    </Cell>
  );
}

function Ports({ side, prefix }: { side: 'input' | 'output'; prefix: string }) {
  return (
    <Cell width={32} flexShrink={0}>
      <Flex id={`${prefix}-${side}-ports`} direction="column" gap={16} width="100%">
        {[0, 1, 2].map((index) => (
          <Cell key={index} id={`${prefix}-${side}-${index}`} width={32} height={32}>
            {(bounds) => <Rect {...bounds} fill="#000" />}
          </Cell>
        ))}
      </Flex>
    </Cell>
  );
}

export interface ReferenceNodeProps {
  id?: string;
  width?: number;
  schematic?: boolean;
  debug?: boolean;
  description: string;
  onDescriptionChange(value: string): void;
  onMeasure?(metrics: LayoutMetrics): void;
  onAction?(action: 'run' | 'settings'): void;
}

/** The supplied node schematic, composed entirely through Flex/Cell/CellText. */
export const ReferenceNode = memo(
  forwardRef<LayoutHandle, ReferenceNodeProps>(function ReferenceNode(
    {
      id = 'reference-node',
      width = 300,
      schematic = true,
      debug = false,
      description,
      onDescriptionChange,
      onMeasure,
      onAction,
    },
    ref,
  ) {
    return (
      <Flex
        ref={ref}
        id={id}
        data-testid={id}
        direction="column"
        layoutRoot
        width={width}
        gap={16}
        debug={debug}
        onMeasure={onMeasure}
        lodLabel="Image transform"
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <TextBlock
          id={`${id}-label`}
          text="IMAGE PROCESSING"
          minHeight={37}
          fontSize={12}
          lineHeight={1.4}
          schematic={schematic}
        />
        <TextBlock
          id={`${id}-title`}
          text="Image transform"
          minHeight={74}
          fontSize={26}
          fontStyle="bold"
          lineHeight={1.4}
          schematic={schematic}
        />
        <TextBlock
          id={`${id}-subtitle`}
          text="Нормализация изображения"
          minHeight={37}
          fontSize={13}
          lineHeight={1.4}
          schematic={schematic}
        />
        <Cell id={`${id}-media`} width="100%" height={200} flexShrink={0}>
          <Flex width="100%" height="100%" gap={16} alignItems="center">
            <Ports side="input" prefix={id} />
            <Cell id={`${id}-preview`} flexGrow={1} minWidth={0} height="100%">
              {(bounds) => <Rect {...bounds} fill="#000" />}
            </Cell>
            <Ports side="output" prefix={id} />
          </Flex>
        </Cell>
        <TextBlock
          id={`${id}-description`}
          text={description}
          minHeight={148}
          fontSize={14}
          lineHeight={1.5}
          schematic={schematic}
          editable
          onTextChange={onDescriptionChange}
        />
        <Cell id={`${id}-actions`} width="100%" height={80} flexShrink={0}>
          <Cell width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
            {(bounds) => <Rect {...bounds} fill={GRAY} />}
          </Cell>
          <Flex width="100%" height="100%" padding="10px 16px" gap={16} alignItems="center">
            <Cell
              id={`${id}-run`}
              width={60}
              height={60}
              flexShrink={0}
              onClick={() => onAction?.('run')}
            >
              {(bounds) => (
                <>
                  <Rect {...bounds} fill="#000" />
                  {!schematic && (
                    <Line points={[24, 18, 42, 30, 24, 42]} closed fill="#fff" listening={false} />
                  )}
                </>
              )}
            </Cell>
            <Cell
              id={`${id}-settings`}
              width={60}
              height={60}
              flexShrink={0}
              onClick={() => onAction?.('settings')}
            >
              {(bounds) => (
                <>
                  <Rect {...bounds} fill="#000" />
                  {!schematic && (
                    <>
                      <Line
                        points={[17, 23, 43, 23]}
                        stroke="#fff"
                        strokeWidth={3}
                        listening={false}
                      />
                      <Line
                        points={[17, 37, 43, 37]}
                        stroke="#fff"
                        strokeWidth={3}
                        listening={false}
                      />
                    </>
                  )}
                </>
              )}
            </Cell>
          </Flex>
        </Cell>
      </Flex>
    );
  }),
);
