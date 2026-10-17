# Подключение к React 16

Для React 16 используется отдельная сборка `0.6.2-react16.0` того же `@dzenlotus/react-konva-layout`. Основная сборка остаётся на React 19. Движок измерения, `Flex/Cell/CellText`, размещения, кеширование и выборочный LOD общие; отличаются подключение React DOM и передача контекстов.

Зафиксированная связка:

| Зависимость                     | Версия            |
| ------------------------------- | ----------------- |
| `react`                         | `16.13.1`         |
| `react-dom`                     | `16.13.1`         |
| `react-konva`                   | `16.13.0-6`       |
| `konva`                         | `8.4.3`           |
| `@dzenlotus/react-konva-layout` | `0.6.2-react16.0` |

Другие версии React 16 этой инструкцией не подтверждаются. Пакет собран с classic JSX, без зависимости от `react/jsx-runtime`. Официальный `use-sync-external-store` версии 1.7.0 устанавливается как зависимость пакета и используется через `use-sync-external-store/shim`; отдельно подключать полифилл в приложении не нужно.

## Установка

Установите готовый архив из GitHub Release, а не основную React 19 сборку репозитория:

```sh
npm install react@16.13.1 react-dom@16.13.1 react-konva@16.13.0-6 konva@8.4.3 https://github.com/dzenlotus/react-konva-layout/releases/download/v0.6.2-react16.0/dzenlotus-react-konva-layout-0.6.2-react16.0.tgz
```

Импорт остаётся обычным:

```tsx
import { Flex, Cell, CellText, Layout } from '@dzenlotus/react-konva-layout';
```

## Обязательный alias Konva

`react-konva@16.13.0-6` загружает `konva/lib/Core` через CommonJS `require` и ожидает объект Konva. При попадании на ESM namespace Konva 8 Stage может остаться пустым без явной ошибки. Оба точных импорта — `konva` и `konva/lib/Core` — должны разрешаться в один официальный UMD-файл `konva/konva.js`.

Для Vite добавьте в существующий конфиг:

```ts
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^konva(?:\/lib\/Core)?$/,
        replacement: require.resolve('konva/konva.js'),
      },
    ],
  },
});
```

Для Webpack добавьте точные aliases в `resolve.alias`:

```js
const konvaRuntime = require.resolve('konva/konva.js');

module.exports = {
  resolve: {
    alias: {
      konva$: konvaRuntime,
      'konva/lib/Core$': konvaRuntime,
    },
  },
};
```

Сохраните остальные настройки своего сборщика. Не заменяйте все `konva/*` одним файлом: alias нужен только для этих двух runtime импортов. Для другого сборщика настройте такой же точный mapping.

## Stage, данные и контексты

`Stage`, `Layer`, камера и состояние принадлежат приложению. Компонент библиотеки помещается в существующий Layer. Прозрачный HTML создаётся только для измерения и затем полностью отсоединяется от документа.

В этой версии react-konva контекст снаружи Stage автоматически не переносится в его React-дерево. Разместите нужные providers **внутри Stage**. Чтобы передать их значения дальше в отдельное HTML-дерево измерения, перечислите объекты контекстов в `Layout.contexts` или `contexts` самостоятельного корневого `Flex`. Массив можно объявить один раз вне компонента:

```tsx
import React, { createContext, useContext, useState } from 'react';
import { Layer, Stage, Text } from 'react-konva';
import { CellText, Flex, Layout } from '@dzenlotus/react-konva-layout';

const ThemeContext = createContext('#273640');
const CONTEXTS = [ThemeContext];

function NodeContent({ description }: { description: string }) {
  const color = useContext(ThemeContext);
  return (
    <Flex id="node-1" layoutRoot width={320} direction="column" padding={16} gap={12}>
      <CellText text="Image transform" fontSize={20} fontStyle="bold" color={color}>
        {(props) => <Text {...props} />}
      </CellText>
      <CellText id="description" text={description} fontSize={14} color={color}>
        {(props) => <Text {...props} />}
      </CellText>
    </Flex>
  );
}

export function CanvasExample() {
  const [description, setDescription] = useState('Описание ноды');
  return (
    <>
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      <Stage width={900} height={600} x={32} y={32}>
        <ThemeContext.Provider value="#273640">
          <Layer>
            <Layout width={320} height={500} contexts={CONTEXTS}>
              <NodeContent description={description} />
            </Layout>
          </Layer>
        </ThemeContext.Provider>
      </Stage>
    </>
  );
}
```

Bridge использует явные React Consumers и Providers: он поддерживает список контекстов без чтения внутренних Fiber-полей и без изменения порядка hooks. Если уже есть внешний provider, его значение можно прочитать в компоненте приложения и передать во внутренний provider Stage. Без контекстов `contexts` не требуется. Для самостоятельной раскладки можно передать `<Flex contexts={CONTEXTS} ...>` вместо отдельного `Layout`.

Изменение `text`, стилей или ограничений размера автоматически пересчитывает ближайшую независимую `layoutRoot`. Отдельного `editable` нет: input, store, события и сохранение реализует приложение. Для внешних изменений без обновления props доступны `LayoutHandle.invalidate(id)` и `remeasure(id)`. Подробнее: [обновление содержимого](content-updates.md).

`Layout.placements` сохраняет независимые позиции и native drag нод. Внешние pan/zoom обновляют culling и плотность кешей без HTML-релейаута. `Cell.renderWhen` и `fallback` управляют только выбранным содержимым; логические размеры сохраняются и при восстановлении камеры на 3–5%. Подробнее: [размещение нод](node-positioning.md) и [выборочный LOD](cell-lod.md).

## Разработка этой сборки

Из корня репозитория после установки его зависимостей:

```sh
npm install --prefix packages/react16
npm run build:react16
npm run dev:react16
```

`npm run build:react16-demo` собирает пример, `npm run pack:react16` создаёт устанавливаемый архив. Пример находится в [`packages/react16/example`](../packages/react16/example); `?count=1000` включает тысячу нод. Это отдельный React 16 fixture. Результаты FPS современной React 19 сцены не являются замерами этой сборки.

## Проверка совместимости

Готовый архив проверен в отдельном проекте: чистый `npm install` без `--legacy-peer-deps` и других обходов peer dependencies, затем TypeScript 4.9.5 в strict-режиме с `skipLibCheck: false`, `@types/react@16.14.70` и `@types/react-dom@16.9.25`. Версии типов не означают проверку runtime React 16.14: runtime связка остаётся указанной выше 16.13.1.

В браузере проверены одна и 1000 нод. Тысяча одинаковых корней дала 999 попаданий в шаблон; локальная правка потребовала 17 чтений геометрии и сохранила остальные 999 ветвей. Zoom до 3% не менял ревизию измерения и не читал DOM; в покое измерительного HTML в документе нет. Native drag сохранил геометрию и растровый кеш ноды, вернул её в React-родителя и во время движения рисовал interaction Layer. Также проверены обновление контекста, сохранность Text ref и unmount/remount. Исходные результаты: [react16-verification.json](react16-verification.json).

Это проверка совместимости, без замера FPS. Нода React 16 примера содержит 17 измеряемых элементов и отличается от современной стресс-ноды с 35 элементами; результаты их производительности нельзя считать взаимозаменяемыми.

Ограничение Konva 8: у `Text` нет современного свойства `direction`. Эквивалентность RTL-поведения с Konva 10 не гарантируется.
