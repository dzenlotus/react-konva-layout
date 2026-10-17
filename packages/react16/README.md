# react-konva-layout · React 16

Сборка `0.6.2-react16.0` для React/ReactDOM **16.13.1**, react-konva **16.13.0-6** и Konva **8.4.3**. Основная React 19 сборка остаётся отдельной. API `Flex`, `Cell`, `CellText`, `Layout`, размещения и выборочный LOD используют общий движок.

```sh
npm install react@16.13.1 react-dom@16.13.1 react-konva@16.13.0-6 konva@8.4.3 https://github.com/dzenlotus/react-konva-layout/releases/download/v0.6.2-react16.0/dzenlotus-react-konva-layout-0.6.2-react16.0.tgz
```

Пакет содержит ESM и TypeScript declarations. JSX собран в classic runtime, `react/jsx-runtime` не требуется. Официальный `use-sync-external-store` 1.7.0 входит в зависимости и используется через `/shim`.

## Настройка Konva

Оба точных импорта `konva` и `konva/lib/Core` должны указывать на один `konva/konva.js`: старый react-konva ожидает CommonJS-объект, а ESM namespace может приводить к пустому Stage.

Vite:

```ts
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: [{ find: /^konva(?:\/lib\/Core)?$/, replacement: require.resolve('konva/konva.js') }],
  },
});
```

Webpack: добавьте в `resolve.alias` `'konva$': require.resolve('konva/konva.js')` и `'konva/lib/Core$': require.resolve('konva/konva.js')`. Сохраните остальные настройки сборщика.

## Использование

```tsx
import React from 'react';
import { Layer, Stage, Text } from 'react-konva';
import { CellText, Flex } from '@dzenlotus/react-konva-layout';

<Stage width={900} height={600}>
  <Layer>
    <Flex width={320} direction="column" padding={16}>
      <CellText text="Image transform" fontSize={20} fontStyle="bold">
        {(props) => <Text {...props} />}
      </CellText>
    </Flex>
  </Layer>
</Stage>;
```

Stage, Layer, камера и редактирование принадлежат приложению. HTML полностью отсоединяется после измерения; изменение текста/стилей автоматически пересчитывает ближайший `layoutRoot`. Внешние pan/zoom сохраняют логические размеры. `Cell.renderWhen` и `fallback` меняют выбранное canvas-содержимое без HTML-релейаута.

Для React context разместите providers **внутри Stage** и передайте список контекстов через `<Layout contexts={[ThemeContext]}>` или самостоятельный корневой `<Flex contexts={[ThemeContext]}>`. Лучше сохранить массив вне компонента. Bridge переносит значения в HTML-дерево через явные Consumers/Providers. Полный пример и настройка: [инструкция React 16](https://github.com/dzenlotus/react-konva-layout/blob/main/docs/react16.md).

Архив проверен чистой установкой без обхода peer dependencies и TypeScript 4.9.5 (`strict`, `skipLibCheck: false`, `@types/react@16.14.70`, `@types/react-dom@16.9.25`). В браузере проверены одна и 1000 нод, локальный relayout, zoom 3%, native drag с сохранением кеша, контексты, refs и unmount/remount. [Результаты проверки](https://github.com/dzenlotus/react-konva-layout/blob/main/docs/react16-verification.json). Это проверка совместимости отдельного примера без замера FPS.

Konva 8 не поддерживает современное `Text.direction`; эквивалентность RTL с Konva 10 не гарантируется. Совместимость с другими версиями React 16 и результаты FPS для этой сборки здесь не заявляются.

MIT.
