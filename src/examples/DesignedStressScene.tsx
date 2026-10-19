import { memo, useState } from 'react';
import { Flex } from '../lib';
import { ReferenceCard } from './ReferenceCard';
import type { ReferenceCardDetail } from './referenceCardDetail';

export const COUNT = 1000;
export const COLUMNS = 25;
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 430;
export const GAP = 24;
export const WORLD_WIDTH = COLUMNS * CARD_WIDTH + (COLUMNS - 1) * GAP + 40;
export const WORLD_HEIGHT =
  Math.ceil(COUNT / COLUMNS) * CARD_HEIGHT + (Math.ceil(COUNT / COLUMNS) - 1) * GAP + 40;
export const EXPECTED_PRIMITIVES = COUNT * 35 + 1;
export const DESCRIPTION =
  'Этот модуль обрабатывает изображение: приводит цвета и размеры к единому формату и передаёт результат дальше по графу.';

const DesignedStressCard = memo(function DesignedStressCard({
  index,
  width,
  previewImage,
  showPreview,
  showDescription,
  showActions,
}: {
  index: number;
  width: number;
  previewImage: HTMLImageElement;
} & ReferenceCardDetail) {
  const [description, setDescription] = useState(DESCRIPTION);
  return (
    <ReferenceCard
      id={`stress-item-${String(index).padStart(4, '0')}-card`}
      width={width}
      x={20 + (index % COLUMNS) * (width + GAP)}
      y={20 + Math.floor(index / COLUMNS) * (CARD_HEIGHT + GAP)}
      layoutTemplate="designed-card-v1"
      footerLabel={`item_${String(index + 1).padStart(4, '0')}`}
      previewImage={previewImage}
      description={description}
      onDescriptionChange={setDescription}
      showPreview={showPreview}
      showDescription={showDescription}
      showActions={showActions}
    />
  );
});

export const DesignedStressScene = memo(function DesignedStressScene({
  worldWidth,
  previewImage,
  showPreview,
  showDescription,
  showActions,
}: {
  worldWidth: number;
  previewImage: HTMLImageElement;
} & ReferenceCardDetail) {
  const width = (worldWidth - 40 - (COLUMNS - 1) * GAP) / COLUMNS;
  return (
    <Flex id="stress-world" data-testid="stress-world" width={worldWidth} height={WORLD_HEIGHT}>
      {Array.from({ length: COUNT }, (_, index) => (
        <DesignedStressCard
          key={index}
          index={index}
          width={width}
          previewImage={previewImage}
          showPreview={showPreview}
          showDescription={showDescription}
          showActions={showActions}
        />
      ))}
    </Flex>
  );
});
