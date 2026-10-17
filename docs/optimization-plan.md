# Performance and local text editing

Requested: optimize initial mount, redraw, pan/zoom and updates on weaker machines; double-click/tap description to edit through temporary native HTML; relayout only affected independent node. No unit-test files.

Implementation contracts live in `src/lib/types.ts`.

- Measurement engine: stable SceneNode revisions, typed comparison instead of JSON, nearest `layoutRoot` invalidation, standalone subtree measurement, correct fallback for flow-dependent size changes, bounded template reuse, measurement diagnostics, detached idle portal, `useLayout` context and imperative API.
- Canvas renderer: compact drawing tree, viewport culling, scale/position-aware camera, LOD, bounded visible-card raster cache, decorative hit-testing disabled, editable text interaction. Disabled performance mode keeps the complete baseline drawing tree.
- Native text overlay: correct Stage transform, autofocus, multiline input, Ctrl/Cmd+Enter or blur save, Escape cancel, IME and cleanup.
- Demo/benchmark: editable description, 1000 independently positioned cards with native flex inside, matched baseline/optimized modes, pan/zoom/overview, actual draw timings, model and mounted object counts, local measurement count, CPU slowdown runs.
- Verification: TypeScript/build; manual real-browser mouse/touch editing and keyboard save/cancel; zero idle layout HTML; local read count; dependent flow fallback; pan/zoom without layout; current production A/B and CPU 4x; screenshots; independent review; integrate and push.

An independent node may change its own height locally when absolutely positioned. A size change inside normal Flex/Grid flow must update dependent parent/sibling geometry. Camera updates must never invoke HTML measurement. Cache keys include geometry-affecting structure/styles/content/fonts/constraints; fixed-size no-wrap text can vary without changing geometry. Cache memory is bounded and invisible-node raster caches are released.
