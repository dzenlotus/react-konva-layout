# Подключение к React 16

Для React 16.14.0 используется отдельная сборка `0.6.2-react16.1` того же `@dzenlotus/react-konva-layout`. Основная сборка остаётся на React 19. Движок измерения, `Flex/Cell/CellText`, размещения, кеширование и выборочный LOD общие; отличаются подключение React DOM и передача контекстов.

Зафиксированная связка:

| Зависимость                     | Версия            |
| ------------------------------- | ----------------- |
| `react`                         | `16.14.0`         |
| `react-dom`                     | `16.14.0`         |
| `react-konva`                   | `16.13.0-6`       |
| `konva`                         | `8.4.3`           |
| `@dzenlotus/react-konva-layout` | `0.6.2-react16.1` |

Другие версии React 16 этой инструкцией не подтверждаются. Пакет собран с classic JSX, без зависимости от `react/jsx-runtime`. Официальный `use-sync-external-store` версии 1.7.0 устанавливается как зависимость пакета и используется через `use-sync-external-store/shim`; отдельно подключать полифилл в приложении не нужно.

## Установка

Сначала добавьте в **корневой `package.json` своего приложения** эти прямые зависимости и адресный override, сохранив остальные поля:

```json
{
  "dependencies": {
    "react": "16.14.0",
    "react-dom": "16.14.0"
  },
  "overrides": {
    "react-konva": {
      "react": "$react",
      "react-dom": "$react-dom"
    }
  }
}
```

У `react-konva@16.13.0-6` peer metadata ограничены React `16.13.x`, хотя его `react-reconciler@0.25.1` допускает `^16.13.1`, включая 16.14.0. Override привязывает только зависимости react-konva к вашим прямым версиям React и ReactDOM. Он должен находиться именно в корне приложения: npm не применяет `overrides` из установленных пакетов. `$react` и `$react-dom` ссылаются на объявления в корневом `dependencies`. Это стандартный механизм [npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides); fork, `--legacy-peer-deps` или глобальное отключение peer-проверок не нужны.

Затем установите готовый архив из GitHub Release и остальные версии:

```sh
npm install --save-exact react@16.14.0 react-dom@16.14.0 react-konva@16.13.0-6 konva@8.4.3 https://github.com/dzenlotus/react-konva-layout/releases/download/v0.6.2-react16.1/dzenlotus-react-konva-layout-0.6.2-react16.1.tgz
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

function CardContent({ description }: { description: string }) {
  const color = useContext(ThemeContext);
  return (
    <Flex id="element-1" layoutRoot width={320} direction="column" padding={16} gap={12}>
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
  const [description, setDescription] = useState('Описание карточки');
  return (
    <>
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      <Stage width={900} height={600} x={32} y={32}>
        <ThemeContext.Provider value="#273640">
          <Layer>
            <Layout width={320} height={500} contexts={CONTEXTS}>
              <CardContent description={description} />
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

`Layout.placements` сохраняет независимые позиции и native drag карточек. Внешние pan/zoom обновляют culling и плотность кешей без HTML-релейаута. `Cell.renderWhen` и `fallback` управляют только выбранным содержимым; логические размеры сохраняются и при восстановлении камеры на 3–5%. Подробнее: [размещение карточек](element-positioning.md) и [выборочный LOD](cell-lod.md).

Текущие исходники также экспортируют `usePanZoom` и `useLayoutDrag` для камеры существующего `Stage/Layer/Group`: [контроллер, ограничения и пример подключения](camera-controls.md). Они используют общий API в React 16 и React 19. Архив релиза `0.6.2-react16.1`, указанный выше, выпущен до добавления этих hooks; для них соберите текущую React 16 версию из репозитория через `npm run pack:react16`. Настройки override и aliases остаются теми же.

## Разработка этой сборки

Из корня репозитория после установки его зависимостей:

```sh
npm install --prefix packages/react16
npm run build:react16
npm run dev:react16
```

`npm run build:react16-demo` собирает пример, `npm run pack:react16` создаёт устанавливаемый архив. Пример находится в [`packages/react16/example`](../packages/react16/example); `?count=1000` включает тысячу карточек. Это отдельный React 16 fixture. Результаты FPS современной React 19 сцены не являются замерами этой сборки.

Для сравнения производительности используется другой entrypoint: [`packages/react16/stress`](../packages/react16/stress) импортирует ту же свободную сцену с 35 элементами на карточку, что и React 19:

```sh
npm run build:react16-stress
npx vite preview --config vite.react16-stress.config.ts --host 127.0.0.1 --port 4184
```

Откройте `http://127.0.0.1:4184/?scene=1&benchmark=1`. Это production-сборка с общим API `window.freeScene.benchmark`, фиксированным Stage 1400 × 760 и приложенческим редактором текста. Native drag-обработчики примера явно группируют связанные изменения state через `unstable_batchedUpdates` в обоих стеках. [Протокол, 90 прогонов и сравнение](react16-vs-react19-stress.md).

## Проверка совместимости

Для React/ReactDOM 16.14.0 подтверждены чистый `npm install`, `npm ls` и повторный `npm ci` с корневым override выше, без peer-флагов. Результаты проверки этой связки записываются отдельно: [react16-16.14-verification.json](react16-16.14-verification.json).

В браузере с React 16.14.0 проверены одна и 1000 карточек без ошибок и предупреждений. При первом измерении тысячи карточек выполнено 1016 чтений геометрии: 999 попаданий в шаблон и одно вычисление; все 1000 корней получили кеши. Zoom с 5% до 3% сохранил ревизию и ссылки модели, без чтений геометрии и подключения HTML. Локальная правка карточки потребовала 17 чтений, обновила Text ref и сохранила модель, native группы и кеши остальных 999 карточек.

Native drag дал один `dragstart` и один `dragend`, сохранил геометрию и кеш, вернул группу в исходного React-родителя. Во время движения основной Layer не перерисовывался, interaction Layer выполнил восемь draw; оба слоя использовали DPR 2. Обновление контекста изменило размер заголовка с 18 до 20 с сохранением registry IDs и ref. После unmount измерительного HTML, измерительных корней и native размещений осталось ноль; remount восстановил сцену и ref. Эти проверки описывают корректность и изоляцию отрисовки, без замера FPS.

Свежий архив `0.6.2-react16.1` также установлен в отдельный consumer с React/ReactDOM 16.14.0 и указанным корневым override: `npm install`, `npm ci` и `npm ls` прошли без ошибок. TypeScript 4.9.5 прошёл в strict-режиме с `skipLibCheck: false`, `@types/react@16.14.70` и `@types/react-dom@16.9.25`. [Скриншот React 16.14.0](screenshots/react16-16.14-example.png).

Предыдущая сборка `0.6.2-react16.0` отдельно проверялась с runtime React/ReactDOM 16.13.1: TypeScript 4.9.5 в strict-режиме с `skipLibCheck: false`, `@types/react@16.14.70`, `@types/react-dom@16.9.25`, одна и 1000 карточек, локальный relayout, zoom 3%, native drag с сохранением кеша, контексты, refs и unmount/remount. Это исторические результаты другой runtime-связки: [react16-verification.json](react16-verification.json). Они сохранены без изменений и не подменяют новую проверку 16.14.0.

Эти проверки совместимости не измеряют FPS. Карточка простого React 16 примера содержит 17 измеряемых элементов и отличается от общей стресс-карточки с 35 элементами. Свежие парные замеры общей сцены представлены в [отдельном отчёте](react16-vs-react19-stress.md).

Ограничение Konva 8: у `Text` нет современного свойства `direction`. Эквивалентность RTL-поведения с Konva 10 не гарантируется.
