# react-konva-layout · React 16

Сборка `0.6.2-react16.1` для React/ReactDOM **16.14.0**, react-konva **16.13.0-6** и Konva **8.4.3**. Основная React 19 сборка остаётся отдельной. API `Flex`, `Cell`, `CellText`, `Layout`, размещения и выборочный LOD используют общий движок.

Сначала добавьте в корневой `package.json` **своего приложения**, сохранив остальные зависимости:

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

Peer metadata старого react-konva ограничены `16.13.x`; его reconciler допускает 16.14.0. Этот адресный override использует ваши прямые React-зависимости. npm учитывает `overrides` только в корне приложения; настройки внутри устанавливаемого пакета не применяются. См. [npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides). Fork и `--legacy-peer-deps` не требуются.

Затем установите:

```sh
npm install --save-exact react@16.14.0 react-dom@16.14.0 react-konva@16.13.0-6 konva@8.4.3 https://github.com/dzenlotus/react-konva-layout/releases/download/v0.6.2-react16.1/dzenlotus-react-konva-layout-0.6.2-react16.1.tgz
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

Текущие исходники включают `usePanZoom` и `useLayoutDrag` для управления камерой существующего `Stage`, `Layer` или `Group` с общими ограничениями zoom и перемещения. [Параметры и пример подключения](https://github.com/dzenlotus/react-konva-layout/blob/main/docs/camera-controls.md). Для этих hooks соберите актуальный архив командой `npm run pack:react16` из корня репозитория; опубликованный выше релиз `0.6.2-react16.1` появился до их добавления.

Для React context разместите providers **внутри Stage** и передайте список контекстов через `<Layout contexts={[ThemeContext]}>` или самостоятельный корневой `<Flex contexts={[ThemeContext]}>`. Лучше сохранить массив вне компонента. Bridge переносит значения в HTML-дерево через явные Consumers/Providers. Полный пример и настройка: [инструкция React 16](https://github.com/dzenlotus/react-konva-layout/blob/main/docs/react16.md).

На React/ReactDOM 16.14.0 подтверждены чистый `npm install`, `npm ls` и повторный `npm ci` с указанным override без peer-флагов. В браузере проверены одна и 1000 карточек: 999 попаданий в шаблон, кеши всех 1000 корней, локальное измерение 17 элементов с сохранением остальных 999 ветвей и кешей, zoom 5% → 3% без измерений, native drag только на interaction Layer с возвратом родителя. Также проверены обновление контекста, Text ref и unmount/remount; измерительного HTML в покое нет, оба слоя сохраняют DPR 2, ошибок и предупреждений нет. [Проверка React 16.14.0](https://github.com/dzenlotus/react-konva-layout/blob/main/docs/react16-16.14-verification.json).

TypeScript 4.9.5 (`strict`, `skipLibCheck: false`) ранее проверен на [сборке .0 с React 16.13.1](https://github.com/dzenlotus/react-konva-layout/blob/main/docs/react16-verification.json). Эти исторические данные сохранены отдельно. Результаты FPS здесь не заявляются: отдельная карточка React 16 примера содержит 17 измеряемых элементов и отличается от современной стресс-карточки с 35 элементами.

Konva 8 не поддерживает современное `Text.direction`; эквивалентность RTL с Konva 10 не гарантируется. Совместимость с другими версиями React 16 и результаты FPS для этой сборки здесь не заявляются.

MIT.
