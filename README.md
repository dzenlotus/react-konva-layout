# react-konva-layout

Рабочий прототип раскладки для React Konva: браузер рассчитывает Flex и Grid в HTML, библиотека измеряет элементы через `getBoundingClientRect()` и переносит геометрию в Konva. Разметка описывается одним JSX-деревом; камера, отрисовка видимой области и редактирование текста работают поверх сохранённой модели.

## Запуск

```sh
npm install
npm run dev
```

Откройте адрес, который напечатает Vite. Для сборки:

```sh
npm run build
npm run preview
```

`build` проверяет TypeScript и создаёт:

- `dist/` — статическое демо;
- `dist-lib/react-konva-layout.js` — ESM-библиотеку;
- `dist-lib/*.d.ts` — объявления типов.

Имя пакета — `@dzenlotus/react-konva-layout`, но он пока не опубликован в npm. Внутри этого репозитория импортируйте компоненты из `./lib`. Для другого проекта можно подключить локальный каталог через `npm install /путь/к/react-konva-layout` или репозиторий через `npm install github:dzenlotus/react-konva-layout`. Скрипт `prepare` запускает сборку при установке; входная точка пакета находится в `dist-lib/`. После подключения импортируйте компоненты из `@dzenlotus/react-konva-layout`.

## Пример

```tsx
import { useRef, useState } from 'react';
import { Circle, Rect } from 'react-konva';
import { Box, Col, LayoutCanvas, LayoutText, Row } from './lib';
import type { LayoutCanvasHandle, LayoutNode } from './lib';

export function Example() {
  const canvas = useRef<LayoutCanvasHandle>(null);
  const [tree, setTree] = useState<LayoutNode[]>([]);
  const [description, setDescription] = useState(
    'Координаты и размеры поступают в Konva из HTML.',
  );

  return <>
    <button onClick={() => canvas.current?.remeasure()}>
      Пересчитать layout
    </button>
    <LayoutCanvas ref={canvas} width={600} height={300} panZoom onLayout={setTree}>
      <Row id="root" width="100%" height="100%" padding={24}
        gap={16} alignItems="center">
        <Box id="preview" data-testid="preview" width={120} height={100}
          render={({ width, height }) => <>
            <Rect width={width} height={height} fill="#dce8cf" cornerRadius={12} />
            <Circle x={width / 2} y={height / 2} radius={24} fill="#78985a" />
          </>} />
        <Col id="content" flexGrow={1} minWidth={0} gap={8}>
          <LayoutText id="title" text="Браузер считает размеры"
            fontFamily="Arial" fontSize={20} fontStyle="bold" />
          <LayoutText id="description" width="100%"
            text={description} editable onTextChange={setDescription}
            fontFamily="Arial" fontSize={14} lineHeight={1.5} />
        </Col>
      </Row>
    </LayoutCanvas>
    <pre>{JSON.stringify(tree, null, 2)}</pre>
  </>;
}
```

`LayoutCanvas` уже создаёт `Stage` и `Layer`. Компоненты layout нужно размещать внутри него. `Box.render` получает измеренные `width` и `height`; внутри можно рисовать любые компоненты Konva с локальными координатами относительно этого `Box`.

## Компоненты и свойства

| Компонент | Назначение |
| --- | --- |
| `LayoutCanvas` | Размеры `width`, `height`; `debug`, `panZoom`, `performance`; события `onLayout`, `onMeasure`, `onRenderStats`, `onViewChange`; также `ref`, `style`, `className`. |
| `Flex` | CSS Flexbox; направление задаётся через `direction`. |
| `Row` | Flexbox с направлением `row`. |
| `Col` | Flexbox с направлением `column`. |
| `Grid` | CSS Grid, например `gridTemplateColumns="repeat(3, minmax(0, 1fr))"`. |
| `Box` | Контейнер или место для собственного рисунка через `render`. |
| `LayoutText` | Измеряемый HTML-текст, который затем рисуется через Konva Text. |

Общие свойства: `id`, `data-testid`, `children`, `style`, размеры (`width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`), `padding`, `gap`, `rowGap`, `columnGap`, `alignItems`, `justifyContent`, `alignSelf`, `flexGrow`, `flexShrink`, `flexBasis`, `flexWrap`, `gridTemplateColumns`, `gridTemplateRows`. Числовые размеры задаются в CSS-пикселях; допустимы и CSS-значения вроде `"100%"`.

Для оформления Konva-контейнера используются `fill`, `stroke`, `strokeWidth`, `cornerRadius`. События: `onClick`, `onDblClick`, `onDblTap`; `listening={false}` отключает взаимодействие. Дополнительные CSS-свойства раскладки можно передавать через `style`.

У `LayoutText` есть обязательный `text` и свойства `fontSize`, `fontFamily`, `fontStyle` (`"bold"`, `"italic"`, `"bold italic"`), `lineHeight`, `color`, `align`, `wrap` (`"word"`, `"char"`, `"none"`). `lineHeight` — множитель размера шрифта, например `1.5`.

## Камера и редактирование

При `panZoom` колесо масштабирует сцену относительно курсора. Перетаскивание фона, средней кнопкой или с зажатым пробелом двигает камеру; на сенсорном экране доступны pan и pinch. Камера меняет трансформацию Konva без нового HTML-измерения.

`LayoutText editable onTextChange={setText}` открывает нативный `textarea` двойным кликом или двойным тапом. Поле получает фокус, выделяет текст и сохраняет положение при pan/zoom. Enter добавляет строку; Cmd/Ctrl+Enter и потеря фокуса сохраняют, Escape отменяет. После закрытия поле удаляется из DOM. Значение остаётся управляемым через `text`; доступны `onEditStart` и `onEditEnd(saved)`.

Методы `LayoutCanvasHandle` через `ref`:

| Метод | Назначение |
| --- | --- |
| `getStage()` | Текущий `Konva.Stage` или `null`. |
| `getView()` / `setView({ x?, y?, scale? })` | Чтение и изменение камеры; `setView` сохраняет согласованность отрисовки и culling. |
| `getLayout(id)` / `getMetrics()` | Последняя геометрия элемента и метрики измерения. |
| `invalidate(id?)` / `remeasure(id?)` | Запросить измерение ближайшего `layoutRoot`; без `id` — полный пересчёт с обновлением CSS-контекста. |

Хук `useLayout()` внутри `LayoutCanvas` предоставляет `invalidate`, `getLayout` и `getMetrics`, в том числе компонентам в отсоединённом HTML-дереве. `onMeasure` сообщает `scope` (`full`, `local`, `visual`), `measuredNodes`, `measuredRoots`, `durationMs`, `templateHits`, `templateMisses`, `revision`. `onRenderStats` сообщает видимые и общие корни, число групп и фигур, активные кеши и их `cacheBytes`, состояние `lod`.

`lodLevel` различает `full`, `labels` и `minimal`. Ниже масштаба `.12` силуэты одинакового стиля рисуются пакетно; двойной клик/тап возвращает детальную ноду. Для прозрачных или пересекающихся силуэтов сохраняется порядок отдельных заливок.

## Локальные измерения и производительность

`layoutRoot` отмечает независимую карточку. Для узлов графа удобно задавать внешнюю позицию явно, сохраняя Flex/Grid внутри:

```tsx
<Col id="card-1" layoutRoot layoutTemplate="card-v1" lodLabel="Node 1"
  width={240} minHeight={180} padding={12} gap={8}
  style={{ position: 'absolute', left: 20, top: 20 }}>
  <LayoutText text={description} editable onTextChange={setDescription} />
</Col>
```

Изменение описания может пересчитать только эту карточку и изменить её высоту. В обычном потоке Flex/Grid изменение внешних размеров влияет на соседей, поэтому движок переходит к полному измерению. Полный пересчёт также используется при недостаточном контексте, структурных CSS-селекторах (`:nth-child`, соседние элементы, `:has`), ограничениях позиционирования и недоступных для проверки внешних таблицах стилей.

`layoutTemplate` — явное включение повторного использования геометрии для одинаковых карточек одного шаблона. Подпись учитывает структуру, свойства, содержимое, шрифты и CSS-контекст. Используйте общий namespace только для карточек с одинаковыми правилами раскладки; собственный CSS по `id` или позиции среди соседей может требовать разных шаблонов. Без `layoutTemplate` вычисленные стили разных элементов не объединяются.

Оптимизации включены по умолчанию. Их можно настроить через `performance`:

```tsx
<LayoutCanvas width={800} height={600} performance={{
  enabled: true,
  compact: true,       // убирает промежуточные группы без собственного поведения
  cull: true,          // монтирует видимые корни с запасом overscan
  overscan: 144,       // CSS-пиксели viewport
  cache: true,
  cacheBudgetMB: 32,   // общий бюджет кешей сложных карточек
  cachePixelRatio: 1,
  lodScale: 0.3,       // ниже этого масштаба показываются простые карточки с lodLabel
  pixelRatio: 1,       // плотность canvas; для более чёткой картинки можно увеличить
}}>{children}</LayoutCanvas>
```

На корне карточки `cache={false}` запрещает кеш, а `cache={true}` включает его и для простой карточки в пределах бюджета. `performance={{ enabled: false }}` отключает эти оптимизации для сравнения. В модели сохраняются все элементы, включая находящиеся за viewport. Для полной геометрии используйте `getLayout(id)`: вне viewport canvas-объект может отсутствовать, а в минимальном LOD группы служат пустыми metadata-контейнерами.

## Дерево измерений

`onLayout(tree)` вызывается, когда меняются измеренные координаты, размеры или структура дерева. Каждый `LayoutNode` содержит:

```ts
{
  id: string;
  type: 'flex' | 'row' | 'col' | 'grid' | 'box' | 'text';
  x: number;          // относительно родительского layout-элемента
  y: number;
  width: number;
  height: number;
  absoluteX: number;  // относительно LayoutCanvas
  absoluteY: number;
  testId?: string;
  children: LayoutNode[];
}
```

Задавайте явные `id`, если результат нужен для поиска элементов или внешних связей. Без `id` используется идентификатор React.

## Жизненный цикл HTML-слоя

Первое измерение выполняется после монтирования. На время расчёта HTML-дерево добавляется в документ с `opacity: 0`. После измерения весь контейнер раскладки удаляется из документа; Konva продолжает рисовать по сохранённому дереву координат.

В состоянии `idle` HTML-узлов раскладки и их `data-testid` в документе нет. Компоненты React сохраняют состояние: их DOM-поддерево хранится в отсоединённом контейнере portal. Это дерево и состояние продолжают занимать память. При изменении JSX и свойств, размера окна или загрузке шрифтов контейнер либо отдельная карточка временно добавляется для измерения и снова удаляется. Актуальные размеры доступны через `onLayout` и `getLayout`; после внешних изменений CSS можно вызвать `ref.current?.remeasure()`.

`debug={true}` оставляет HTML-дерево в документе и показывает его границы и подписи поверх canvas. В этом режиме элементы доступны через `data-testid`. Состояние можно посмотреть на контейнере canvas в DevTools по атрибуту `data-layout-state`: `measuring`, `idle` или `debug`.

## Что посмотреть в демо

Скриншоты: [редактор description](docs/screenshots/optimized-editor.png), [оптимизированная сцена](docs/screenshots/optimized-1000.png), [LOD](docs/screenshots/optimized-lod.png). Исходные примеры: [нода](docs/screenshots/node.png), [layout-слой](docs/screenshots/layout-overlay.png), [Grid](docs/screenshots/grid.png).

![Пример ноды на canvas](docs/screenshots/node.png)

1. В примере «Нода» измените ширину canvas, расстояние `gap` и максимальную ширину ноды: изображение и описание перестраиваются вместе с портами.
2. В «Flex» переключите направление, выравнивание и число элементов. В «Grid» измените число колонок.
3. Включите «Показать layout», чтобы сопоставить HTML-границы с рисунком Konva. После выключения проверьте в DevTools, что `document.querySelector('.konva-layout-measure')` возвращает `null`.
4. Выберите элемент в дереве или нажмите на изображение, кнопку либо плитку на canvas. Справа появятся его координаты, размеры и `testid`.
5. Скопируйте JSON дерева или JSX примера через кнопку над результатом.

Структура ноды взята из [исходного примера CodeSandbox](https://codesandbox.io/p/sandbox/reverent-darwin-sdgd8h?file=/src/App.js): `label`, `title`, `subTitle`, входные порты, изображение, выходные порты, `description` и `actionPanel`. Графика и интерфейс демо реализованы здесь отдельно.

## Стресс-сцена

Откройте `/?stress=1`, чтобы запустить 1000 независимо расположенных карточек с Flex внутри. Режимы Baseline и Optimized используют одну сцену, viewport и плотность canvas. Доступны монтаж, resize, повторное измерение, редактирование description, pan/zoom и обзор всех карточек с LOD. Модель содержит все 1000 карточек; число смонтированных Konva-объектов зависит от режима и камеры.

Для замеров используйте `npm run build` и `npm run preview`: режим разработки добавляет собственные накладные расходы. [Методика и результаты текущего сравнения](docs/performance-optimized.md). [Исторические замеры](docs/performance.md) относятся к прежней Grid-сцене с другим составом объектов.

## Ограничения прототипа

- Нужен браузер с DOM, `ResizeObserver` и CSS Font Loading API; серверный расчёт layout не поддерживается.
- CSS определяет раскладку, но произвольное CSS-оформление не переводится в canvas. Тени, фоновые изображения, псевдоэлементы и другие визуальные эффекты нужно рисовать в Konva самостоятельно.
- Текст измеряют HTML и Konva разными механизмами: для сложной типографики проверяйте переносы визуально.
- Произвольные HTML-дети не становятся рисунком Konva автоматически. Используйте layout-компоненты и `Box.render`.
- Это прототип для проверки подхода, без автоматических тестов.

Лицензия: MIT.
