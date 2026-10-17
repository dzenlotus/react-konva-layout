# react-konva-layout

Flex/Grid раскладка для существующей сцены React Konva. Браузер измеряет временное HTML-дерево, затем библиотека переносит границы в Konva-группы. Фигуры рисует ваш код.

```tsx
import { Stage, Layer, Rect, Text } from 'react-konva';
import { Flex, Cell, CellText } from '@dzenlotus/react-konva-layout';

<Stage width={900} height={600} {...yourCamera}>
  <Layer>
    <YourExistingShapes />
    <Flex width={600} padding={20} gap={16} alignItems="center">
      <Cell width={120} height={100}>
        {(bounds) => <Rect {...bounds} fill="#dce8cf" cornerRadius={12} />}
      </Cell>
      <Cell flexGrow={1} minWidth={0}>
        <Flex direction="column" gap={8}>
          <CellText text="Image transform" fontSize={20} fontStyle="bold">
            {(textProps) => <Text {...textProps} />}
          </CellText>
          <CellText text={description} fontSize={14} lineHeight={1.5}>
            {(textProps) => <Text {...textProps} />}
          </CellText>
        </Flex>
      </Cell>
    </Flex>
  </Layer>
</Stage>;
```

`Flex` и `Cell` становятся группами с сохранением вложенности. `Cell` принимает вложенную раскладку либо функцию `{ x, y, width, height } => ReactNode`. Координаты функции локальны относительно группы ячейки: `x = 0`, `y = 0`. Поэтому смещение группы не применяется к фигуре дважды.

`CellText` измеряет прозрачный HTML-текст с заданными стилями и переносами. Функция получает размеры содержимого и готовые свойства Konva `Text`: `text`, `fontSize`, `fontFamily`, `fontStyle`, `lineHeight`, `fill`, `align`, `wrap` и другие измеренные параметры. Передавайте их через `<Text {...textProps} />`, чтобы HTML и canvas использовали один источник текста и стилей. С `padding` координаты смещаются внутрь ячейки, а размеры уменьшаются на отступы.

`CellText` отвечает только за измерение и передачу свойств. Изменение `text`, стилей или ограничений размера автоматически планирует новый layout; источник изменения может быть любым — ваш input, store, API или другой компонент. Обработчики событий и интерфейс редактирования принадлежат приложению.

HTML полностью отсоединяется от документа после измерения. React-состояние сохраняется в отсоединённом DOM-дереве. При обновлении размеров/текста HTML временно возвращается для нового измерения. `debug` включает видимую HTML-разметку с `data-testid` поверх canvas; выключение снова удаляет её из документа.

## Подключение

Публичный репозиторий: [dzenlotus/react-konva-layout](https://github.com/dzenlotus/react-konva-layout). Пакет пока не опубликован в npm.

```sh
npm install github:dzenlotus/react-konva-layout
```

Нужны peer dependencies React/ReactDOM 19, react-konva 19 и Konva 10. Точные диапазоны указаны в `package.json`. GitHub-установка запускает `prepare` и собирает ESM + TypeScript declarations в `dist-lib/`.

Для разработки:

```sh
npm install
npm run dev
npm run build
npm run format:check
```

Основной пример показывает встраивание в существующий `Stage/Layer`. `?stress=1` — 1000 нод `ReferenceNode` с фотографией, текстом, портами и кнопками; доступны замеры монтажа, pan/zoom FPS и LOD. `?playground=1` — дополнительные примеры Flex/Grid. Камера и создание canvas находятся исключительно в приложении демо, за пределами библиотечного entry point.

[Карта исходников и инварианты рефакторинга](docs/source-structure.md).

## Готовая нода

[ReferenceNode.tsx](src/examples/ReferenceNode.tsx) — оформленная нода обработки изображения через Flex/Cell/CellText: заголовки, фотография в превью, три входных и три выходных порта, редактируемое описание, кнопки запуска и настроек. Иерархия взята из примера CodeSandbox; размеры текстовых блоков определяет их содержимое.

Компонент размещается внутри существующего Group/Layer и не создаёт Stage или камеру:

```tsx
<Group x={300} y={84}>
  <ReferenceNode
    id="node-1"
    width={360}
    previewImage={loadedImage}
    description={description}
    onDescriptionChange={setDescription}
    onAction={(action) => console.log(action)}
    onPortSelect={(side, index) => console.log(side, index)}
  />
</Group>
```

`previewImage` — загруженный `HTMLImageElement`; компонент вписывает его в область превью с обрезкой по центру. Загрузка изображения находится в приложении: пример использует локальный JPEG. Изменение изображения обновляет отрисовку и растровый кеш. Демо добавляет редактирование описания двойным кликом собственным редактором из `src/examples/text-editor/`; библиотека не создаёт textarea и не назначает действие на двойной клик. Сохранённый текст передаётся в `CellText` через `text`, после чего пересчитывается эта нода.

[Скриншот ноды](docs/screenshots/designed-node.png) · [Редактирование описания](docs/screenshots/designed-node-editor.png)

## API

В версии 0.4.0 из библиотечного API удалены `editable`, `onTextChange`, `onEditStart` и `onEditEnd`. `CellText` только измеряет переданные данные; редакторы и их события находятся в коде приложения.

| Компонент                                 | Назначение                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Flex`                                    | Корневая или вложенная Flex-раскладка. `direction="row"` по умолчанию, либо `"column"`.                                                                            |
| `Cell`                                    | Ячейка-группа с вложенной раскладкой либо функцией от измеренных границ.                                                                                           |
| `CellText`                                | Ячейка-группа с измерением текста и функцией от готовых свойств `Text`.                                                                                            |
| `Layout`                                  | Явный общий корень для нескольких раскладок. Принимает логические `width/height`, `x/y`, `debug`, `performance` и события. Можно поместить в существующий `Group`. |
| `Grid`, `Row`, `Col`, `Box`, `LayoutText` | Дополнительные примитивы из первого прототипа. Основной API — `Flex/Cell/CellText`.                                                                                |

Параметры раскладки: `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `padding`, `gap`, `columnGap`, `rowGap`, `alignItems`, `justifyContent`, `alignSelf`, `flexGrow`, `flexShrink`, `flexBasis`, `flexWrap`. Дополнительные CSS-ограничения можно передать через `style`. Числа — логические CSS-пиксели; допускаются проценты. Для CSS Grid доступны `gridTemplateColumns/gridTemplateRows`.

У `CellText` есть `text`, `fontSize`, `fontFamily`, `fontStyle`, `lineHeight`, `color`, `align`, `wrap`. `lineHeight` — множитель размера шрифта. Шрифт и переносы участвуют в измерении; итоговые свойства передаются вашей функции.

Корневой `Flex` или `Layout` предоставляет `ref: LayoutHandle`:

- `getGroup()` / `getStage()` — доступ к существующим Konva-объектам;
- `getLayout(id)` / `getMetrics()` — сохранённая геометрия и метрики;
- `invalidate(id?)` — запланировать измерение ближайшей `layoutRoot`, используя доступные шаблоны геометрии; без `id` — сбросить кеши измерения и пересчитать всё дерево;
- `remeasure(id?)` — сбросить кеши шаблонов и вычисленных стилей, затем запланировать измерение ближайшей `layoutRoot`; без `id` — всего дерева.

`useLayout()` внутри раскладки предоставляет `invalidate/getLayout/getMetrics`. Запросы объединяются через RAF; методы не возвращают новые границы синхронно. `onLayout` получает обновлённое дерево координат, `onMeasure` — область и стоимость измерения, `onRenderStats` — количество видимых корней, фигур и объём кешей.

## Внешние pan/zoom и обновления содержимого

Сценой, слоями и камерой владеет приложение. Библиотека наблюдает трансформации существующих `Stage`, `Layer` и родительских `Group`, включая поворот, skew и неодинаковый scale. Pan/zoom обновляет culling и LOD без повторного HTML-измерения. Библиотека не добавляет обработчики управления камерой и не меняет pixel ratio вашего Layer.

Передавайте актуальные данные в свойства раскладки. Обычное изменение `text`, `fontSize`, `fontFamily`, `lineHeight`, `wrap`, `width` или `style` не требует ручного вызова `invalidate`.

Пометьте независимую ноду `layoutRoot`, чтобы её текст пересчитывал только эту ноду:

```tsx
<Flex
  id="node-1"
  layoutRoot
  width={260}
  direction="column"
  gap={12}
  style={{ position: 'absolute', left: 40, top: 60 }}
>
  <CellText id="description" text={description} fontSize={14}>
    {(textProps) => <Text {...textProps} />}
  </CellText>
</Flex>
```

После `setDescription(nextText)` или обновления вашего store ближайшая независимая `layoutRoot` измеряется автоматически. Абсолютная нода с заданной шириной может менять высоту независимо. Если изменение размеров ноды в обычном потоке сдвигает соседей, движок пересчитывает общий layout. Изменение ограничений самой `layoutRoot`, структурные CSS-селекторы и недоступные внешние таблицы стилей также могут требовать полного измерения.

Для внешнего изменения, которое не отражается в свойствах, можно явно запросить `layoutRef.current?.remeasure('description')` или `useLayout().invalidate('description')`. Изменение `Konva.Text` напрямую не меняет HTML-модель: обновите также `text`/стили у `CellText`. У произвольных фигур размеры задаются через `Cell`; библиотека не определяет их по содержимому render-функции.

[Обновление содержимого, локальный relayout и ручная инвалидация](docs/content-updates.md).

[Позиции нод, выделение, drag и локальные координаты](docs/node-positioning.md). Свободное перемещение внешнего Konva `Group` не запускает HTML-измерение; ограничения общего Layout для множества таких групп описаны отдельно.

## Оптимизации

```tsx
<Flex
  performance={{
    cull: true,
    overscan: 144,
    cache: true,
    cacheBudgetMB: 32,
    cachePixelRatio: 'auto', // плотность существующего Layer × масштаб
    lodScale: 0.3,
  }}
>
  {children}
</Flex>
```

По умолчанию `cachePixelRatio="auto"`: плотность растрового кеша учитывает фактический pixel ratio существующего Layer и масштаб всех родительских трансформаций. При переходе между уровнями плотности обновляются только видимые кеши; pan не пересоздаёт их и не запускает HTML layout. Если нужный кеш превышает бюджет, нода рисуется напрямую. Числовое значение фиксирует плотность для явно выбранного режима качества, например benchmark с DPR1.

Playground и `?stress=1` наследуют разрешение устройства и используют автоматическую плотность кеша. Дополнительный параметр `retina=1` больше не нужен. [Замеры 1000 оформленных нод при DPR2 и замедлении CPU](docs/designed-stress.md) · [Диагностика чёткости и снимки до/после](docs/embedded-layout.md#чёткость-на-retina-и-при-zoom).

Сохранены coalescing через RAF, стабильные ссылки неизменённых ветвей, локальные измерения, кеши видимых нод с ограничением памяти, culling и LOD. `layoutTemplate="card-v1"` явно включает повторное использование геометрии одинаковых карточек; подпись учитывает структуру, текст, ограничения, шрифты и CSS-контекст. `cache={false}` отключает растровый кеш конкретной ноды. `performance={{ enabled: false }}` оставляет полный вариант для сравнения.

`Flex/Cell/CellText` сохраняют группы в полном режиме. Компактная отрисовка может убирать вспомогательные группы старых примитивов. При LOD детали заменяются упрощённым представлением; `onFocusRequest(node)` сообщает приложению о двойном клике по упрощённой ноде. Как менять камеру, решает приложение.

Полная модель остаётся доступна через `getLayout`, даже если canvas-объекты вне viewport не смонтированы. Для произвольных фигур, выходящих далеко за границы ячейки, задайте достаточный `overscan` или отключите culling.

Замеры оформленных нод: [первоначальный отчёт](docs/designed-stress.md), [сравнение после рефакторинга](docs/designed-stress-comparison.md). Исторические замеры первого прототипа с карточками шириной 230 px и DPR1: [docs/performance-optimized.md](docs/performance-optimized.md); их нельзя напрямую сравнивать с новой сценой. Изменения архитектуры и проверка встраивания: [docs/embedded-layout.md](docs/embedded-layout.md).

MIT. Прототип для дальнейшей интеграции.
