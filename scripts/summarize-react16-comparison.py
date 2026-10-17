#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate the matched React 16/19 raw matrix and regenerate JSON + Russian report."""
import argparse
import hashlib
import json
import math
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CPUS = (1, 4, 6)
RUNTIMES = ("react16", "react19")
SCENARIOS = ("mount100", "mount3", "drag3", "pan3", "zoom3")


def percentile(values, fraction):
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)] if values else None


def spread(values):
    values = [v for v in values if v is not None]
    return {"runsWithValue": len(values), "median": statistics.median(values), "min": min(values), "max": max(values)} if values else None


def validate(row):
    label = f"{row['runtime']} CPU×{row['cpu']} {row['scenario']} #{row['repetition']}"

    def check(condition, field):
        if not condition:
            raise ValueError(f"{label}: {field}")

    def close(actual, expected, field, tolerance=1e-5):
        check(math.isfinite(actual) and math.isclose(actual, expected, rel_tol=0, abs_tol=tolerance), field)

    def stats(value):
        check(value["complete"] and value["cards"] == 1000 and value["primitives"] == 35001, "full model")
        check(value["arrangement"] == "free" and value["mode"] == "optimized", "fixture")
        check(value["idleHtmlNodes"] == value["attachedMeasurementRoots"] == 0, "idle measurement HTML")
        check(value["devicePixelRatio"] == value["canvasPixelRatio"] == 2, "DPR 2")
        check((value["viewportWidth"], value["viewportHeight"]) == (1400, 760), "Stage size")
        check(value["measurement"]["measuredNodes"] == 1035, "measuredNodes")
        check(value["measurement"]["templateHits"] == 999 and value["measurement"]["templateMisses"] == 1, "template cache")
        if row["scenario"].endswith("3"):
            check(value["renderedCards"] == value["rendering"]["visibleRoots"] == 1000, "overview selection")

    mount = row["mount"]
    stats(mount)
    check(mount["operation"] == "mount", "fresh mount")
    times = [mount[k] for k in ("mountToLayoutMs", "canvasDrawMs", "mountToCompletedDrawMs", "totalToCanvasFrameMs", "validationMs")]
    check(all(math.isfinite(v) and v >= 0 for v in times), "mount times")
    check(times[0] <= times[2] + .02 and times[1] <= times[2] + .02 and times[2] <= times[3] + .02, "mount time order")
    result = row.get("result")
    if row["scenario"].startswith("mount"):
        check(result is None, "mount-only row")
        return
    check(result is not None and result["kind"] == row["scenario"][:-1], "interaction kind")
    check(result["view"] == {"x": 36, "y": 60, "scale": .03}, "shared overview camera")
    if result["kind"] == "pan":
        check(result["panAmplitude"] == {"x": 100, "y": 15}, "shared pan path")
    frames, stamps, flags = (result[k] for k in ("frameIntervalsMs", "frameTimestampsMs", "frameHadDraw"))
    draws, layers = result["drawDurationsMs"], result["drawLayerIndices"]
    check(len(frames) == len(stamps) == len(flags) == result["frameCount"] > 1, "frame array lengths")
    check(all(math.isfinite(v) and v > 0 for v in frames), "positive frame intervals")
    check(all(type(v) is bool for v in flags), "boolean frame flags")
    check(sum(flags) == result["renderedFrameCount"] <= len(draws), "draw flags sum")
    check(result["emptyFrameCount"] == len(frames) - sum(flags), "empty frames")
    check(len(draws) == len(layers) == result["drawCount"] > 0, "draw array lengths")
    check(all(math.isfinite(v) and v >= 0 for v in draws) and set(layers) <= {0, 1}, "draw durations/layers")
    check({str(k): v for k, v in Counter(layers).items()} == result["drawsByLayer"], "drawsByLayer")
    previous = result["measurementStartedAtMs"]
    for interval, stamp in zip(frames, stamps):
        close(stamp - previous, interval, "timestamp interval")
        previous = stamp
    close(previous, result["measurementEndedAtMs"], "last timestamp")
    duration = result["durationMs"]
    close(sum(frames), duration, "sum(intervals) = duration")
    close(result["measurementEndedAtMs"] - result["measurementStartedAtMs"], duration, "end - start = duration")
    for key, count in (("fps", len(frames)), ("renderedFps", sum(flags)), ("drawsPerSecond", len(draws))):
        close(result[key], count * 1000 / duration, key)
    for key, values, fraction in (("frameP50Ms", frames, .5), ("p95Ms", frames, .95), ("p99Ms", frames, .99), ("drawP95Ms", draws, .95), ("drawP99Ms", draws, .99)):
        close(result[key], percentile(values, fraction), key)
    close(result["maxFrameMs"], max(frames), "maxFrameMs")
    close(result["overBudgetPercent"], sum(v > 20 for v in frames) * 100 / len(frames), "overBudgetPercent")
    check(result["approxDropped60HzFrames"] == sum(max(0, math.floor(v / (1000 / 60) + .5) - 1) for v in frames), "approxDropped60HzFrames")
    check(result["requestedDurationMs"] == 5000 and result["warmupMs"] == 1000 and duration >= 5000, "requested window")
    check(result["actualWarmupMs"] >= 1000 and result["measurementStartRafOffsetMs"] >= 0, "warmup/start offset")
    warmup = result["warmupFrameIntervalsMs"]
    check(warmup and all(math.isfinite(v) and v > 0 for v in warmup), "warmup intervals")
    close(result["warmupMaxFrameMs"], max(warmup), "warmup maximum")
    check(sum(warmup) <= result["actualWarmupMs"] + 1e-5, "warmup interval duration")
    check(result["layoutPasses"] == result["measurementRectReads"] == result["measurementRootAttachments"] == result["maxHtmlNodes"] == 0, "measurement work during interaction")
    check(not any(result[k] for k in ("measurementRevisionChanged", "canvasPixelRatioChanged", "modeChanged")), "stable layout/DPR/mode")
    check(result["minCanvasPixelRatio"] == result["maxCanvasPixelRatio"] == 2, "interaction DPR")
    check(result["minVisibleRoots"] == result["maxVisibleRoots"] == 1000, "interaction overview")
    stats(result["startStats"])
    stats(result["endStats"])
    check(result["startStats"]["measurement"]["revision"] == result["endStats"]["measurement"]["revision"], "layout revision")
    close(row["postRunAtMs"] - result["measurementEndedAtMs"], row["postRunTailMs"], "post-run tail")
    check(row["postRunTailMs"] >= 0, "non-negative post-run tail")
    drag = result["drag"]
    check((drag is not None) == (result["kind"] == "drag"), "native drag metadata")
    if drag:
        check(drag["id"] == "free-node-0168", "shared on-screen drag target")
        check(row["persisted"]["node"]["id"] == drag["id"], "persisted target ID")
        check(drag["started"] == drag["ended"] == 1 and drag["moved"] > 0 and drag["stopped"], "native drag completion")
        error = math.hypot(drag["end"]["x"] - drag["expectedEnd"]["x"], drag["end"]["y"] - drag["expectedEnd"]["y"])
        close(drag["positionError"], error, "drag error")
        check(error <= .01, "drag position tolerance")
        for key in ("startCallMs", "firstDrawAfterStartMs", "releaseCallMs", "firstDrawAfterReleaseMs"):
            check(drag[key] is not None and math.isfinite(drag[key]) and drag[key] >= 0, key)
        check(row["persisted"]["front"] is True, "persisted front order")
        check(max(drag["releaseCallMs"], drag["firstDrawAfterReleaseMs"]) <= row["postRunTailMs"], "release diagnostics within tail")
        for axis in ("x", "y"):
            close(row["persisted"]["node"][axis], drag["end"][axis], "persisted " + axis, .01)


def validate_protocol(protocol, commit):
    expected = {"sourceCommit": commit, "counts": {"nodes": 1000, "modelElements": 35001},
                "browserViewport": {"width": 1600, "height": 1000, "devicePixelRatio": 2},
                "stageViewport": {"width": 1400, "height": 760}, "cpuFactors": [1, 4, 6],
                "repetitions": 3, "warmupMs": 1000, "durationMs": 5000,
                "overviewView": {"x": 36, "y": 60, "scale": .03},
                "mountViews": {"mount100": {"x": 0, "y": 0, "scale": 1}, "mount3": {"x": 36, "y": 60, "scale": .03}},
                "panAmplitude": {"x": 100, "y": 15}, "zoomRange": {"min": .025, "max": .035},
                "dragTargetId": "free-node-0168", "dragAmplitude": {"x": 90, "y": 50}, "batchedNativeState": True,
                "hardware": {"chip": "Apple M5", "logicalCpus": 10, "ramBytes": 25769803776},
                "stacks": {"react16": {"react": "16.14.0", "react-dom": "16.14.0", "react-konva": "16.13.0-6", "konva": "8.4.3"},
                           "react19": {"react": "19.3.1", "react-dom": "19.3.1", "react-konva": "19.3.2", "konva": "10.9.0"}}}
    for key, value in expected.items():
        if protocol.get(key) != value:
            raise ValueError("Protocol mismatch: " + key)
    if "performance.now" not in protocol["timingClock"] or "HeadlessChrome/155.0.0.0" not in protocol["userAgent"]:
        raise ValueError("Protocol clock/browser mismatch")
    for key in ("runtimeOrder", "scenarioOrder", "assets", "limitations"):
        if not isinstance(protocol.get(key), str) or not protocol[key]:
            raise ValueError("Missing protocol: " + key)


def metrics(row):
    mount = row["mount"]
    values = {k: mount[k] for k in ("mountToLayoutMs", "canvasDrawMs", "mountToCompletedDrawMs", "totalToCanvasFrameMs", "validationMs")}
    result = row.get("result")
    if result:
        values.update({k: result[k] for k in ("renderedFps", "fps", "p95Ms", "p99Ms", "maxFrameMs", "durationMs", "frameCount", "renderedFrameCount", "drawsPerSecond", "actualWarmupMs", "warmupMaxFrameMs", "measurementStartRafOffsetMs", "maxCacheBytes")})
        values["reportedMaxCacheBytes"] = values.pop("maxCacheBytes")
        values["postRunTailMs"] = row["postRunTailMs"]
        for index, name in enumerate(("sceneLayer", "interactionLayer")):
            draws = [v for v, layer in zip(result["drawDurationsMs"], result["drawLayerIndices"]) if layer == index]
            values.update({name + "DrawP50Ms": percentile(draws, .5), name + "DrawP95Ms": percentile(draws, .95), name + "DrawMaxMs": max(draws) if draws else None})
        if result["drag"]:
            values.update({k: result["drag"][k] for k in ("startCallMs", "firstDrawAfterStartMs", "releaseCallMs", "firstDrawAfterReleaseMs")})
    return values


def report(summary, rows):
    groups = {(g["runtime"], g["cpu"], g["scenario"]): g["metrics"] for g in summary["groups"]}
    def value(runtime, cpu, scenario, metric, stat="median"):
        item = groups[(runtime, cpu, scenario)][metric]
        return item[stat] if item else None
    def fmt(number):
        return "—" if number is None else f"{number:.1f}"
    def pair(cpu, scenario, metric, stat="median"):
        return " → ".join(fmt(value(r, cpu, scenario, metric, stat)) + (f" (n={groups[(r, cpu, scenario)][metric]['runsWithValue']})" if groups[(r, cpu, scenario)][metric] and groups[(r, cpu, scenario)][metric]["runsWithValue"] < 3 else "") for r in RUNTIMES)
    def fps_pair(cpu, scenario):
        return " → ".join(f"{fmt(value(r, cpu, scenario, 'renderedFps'))} [{fmt(value(r, cpu, scenario, 'renderedFps', 'min'))}–{fmt(value(r, cpu, scenario, 'renderedFps', 'max'))}]" for r in RUNTIMES)
    def delta(cpu, scenario, metric):
        a, b = [value(r, cpu, scenario, metric) for r in RUNTIMES]
        return f"{(b / a - 1) * 100:+.1f}%" if a else "—"
    outcome = f"При CPU ×6 rendered FPS drag/pan/zoom составили {pair(6, 'drag3', 'renderedFps')} / {pair(6, 'pan3', 'renderedFps')} / {pair(6, 'zoom3', 'renderedFps')}. Медианный первый draw при ×6: {pair(6, 'mount100', 'mountToCompletedDrawMs')} мс на 100% и {pair(6, 'mount3', 'mountToCompletedDrawMs')} мс на 3%. Порядок в каждой паре: React 16 → React 19; это наблюдения данной серии."
    tail_outcome = "Отпускание drag выполняется за пределами окна FPS. Медианный post-run хвост при CPU ×1/×4/×6: " + " / ".join(pair(cpu, "drag3", "postRunTailMs") for cpu in CPUS) + " мс (16 → 19 в каждой паре). Высокий FPS движения следует читать вместе с этими задержками."
    zoom_runs = sorted((r for r in rows if r["runtime"] == "react19" and r["cpu"] == 6 and r["scenario"] == "zoom3"), key=lambda r: r["repetition"])
    worst_zoom = min(zoom_runs, key=lambda r: r["result"]["renderedFps"])["result"]
    zoom_outcome = "При CPU ×6 React 19 zoom дал три результата **" + " / ".join(f"{r['result']['renderedFps']:.2f}" for r in zoom_runs) + f" FPS**. В худшем прогоне {worst_zoom['renderedFrameCount']} draw-интервалов за {worst_zoom['durationMs']:.1f} мс; пауза rAF **{worst_zoom['maxFrameMs'] / 1000:.2f} с**, один Layer.draw **{max(worst_zoom['drawDurationsMs']) / 1000:.2f} с** внутри окна. Этот прогон полностью сохранён; медиана {value('react19', 6, 'zoom3', 'renderedFps'):.1f} FPS не подтверждает стабильную скорость zoom."
    lines = ["# React 16 и React 19: свободная сцена из 1000 нод", "", "Свежая парная матрица сравнивает два полных стека на одной сцене: **React 16.14.0 / React Konva 16.13.0-6 / Konva 8.4.3** и **React 19.3.1 / React Konva 19.3.2 / Konva 10.9.0**. Разницу нельзя приписать одному React. Во всех таблицах порядок значений **React 16 → React 19**; каждое значение — медиана трёх повторов; диапазоны min–max, максимумы и меньший n для слоёв указаны явно. Изменение в процентах рассчитано как `(19 / 16 − 1) × 100`.", "", outcome, "", zoom_outcome, "", tail_outcome, "", "## Первый завершённый draw", "", "Таймер начинается перед свежим mount и заканчивается после первого завершённого `Layer.draw`, прошедшего проверку видимого содержимого. Это JavaScript/Canvas draw, не физический показ кадра. Проверка содержимого измерена отдельно; следующий rAF также сохранён в JSON.", "", "| CPU | Масштаб | Первый draw, мс: 16 → 19 | Изменение |", "| --- | --- | --- | --- |"]
    for cpu in CPUS:
        for scenario, zoom in (("mount100", "100%"), ("mount3", "3%")):
            lines.append(f"| ×{cpu} | {zoom} | {pair(cpu, scenario, 'mountToCompletedDrawMs')} | {delta(cpu, scenario, 'mountToCompletedDrawMs')} |")
    lines += ["", "## Движение при 3%", "", "`renderedFps = число rAF-интервалов с хотя бы одним завершённым Layer.draw / фактическое окно × 1000`. Несколько draw разных слоёв за один интервал не увеличивают FPS. p95 — nearest-rank внутри каждого повтора, затем медиана трёх p95. Худший интервал — максимум **всех** интервалов всех трёх повторов; первый интервал сохранён.", "", "| CPU | Жест | FPS медиана [min–max]: 16 → 19 | Изменение | rAF p95, мс: 16 → 19 | Худший rAF, мс: 16 → 19 |", "| --- | --- | --- | --- | --- | --- |"]
    for cpu in CPUS:
        for scenario in SCENARIOS[2:]:
            lines.append(f"| ×{cpu} | {scenario[:-1]} | {fps_pair(cpu, scenario)} | {delta(cpu, scenario, 'renderedFps')} | {pair(cpu, scenario, 'p95Ms')} | {pair(cpu, scenario, 'maxFrameMs', 'max')} |")
    lines += ["", "## Стоимость native Layer.draw", "", "Слои: `0 = sceneLayer`, `1 = interactionLayer`. Здесь медиана внутрипроходных p50/p95 по прогонам со draw этого слоя; n<3 указан в ячейке. Указана длительность завершённого `Layer.draw` (scene и активный hit), в мс. Пустой слой может иметь почти нулевой draw; отсутствие draw обозначено «—». Это не React commit и не GPU time.", "", "| CPU | Жест | Scene p50: 16 → 19 | Scene p95: 16 → 19 | Interaction p50: 16 → 19 | Interaction p95: 16 → 19 |", "| --- | --- | --- | --- | --- | --- |"]
    for cpu in CPUS:
        for scenario in SCENARIOS[2:]:
            cells = [pair(cpu, scenario, name + 'Draw' + p + 'Ms') for name in ('sceneLayer', 'interactionLayer') for p in ('P50', 'P95')]
            lines.append(f"| ×{cpu} | {scenario[:-1]} | " + " | ".join(cells) + " |")
    lines += ["", "## Прогрев", "", "Запрошено 1000 мс; синхронная работа, включая продвижение кешей, может продлить подготовку. Медиана фактического прогрева и его максимум показываются отдельно от устойчивого движения. Худший интервал прогрева включает и работу, и ожидание между callback; без профиля он не является изолированным временем создания кеша.", "", "| CPU | Жест | Прогрев медиана, мс: 16 → 19 | Прогрев максимум, мс: 16 → 19 | Худший интервал прогрева, мс: 16 → 19 |", "| --- | --- | --- | --- | --- |"]
    for cpu in CPUS:
        for scenario in SCENARIOS[2:]:
            lines.append(f"| ×{cpu} | {scenario[:-1]} | {pair(cpu, scenario, 'actualWarmupMs')} | {pair(cpu, scenario, 'actualWarmupMs', 'max')} | {pair(cpu, scenario, 'warmupMaxFrameMs', 'max')} |")
    lines += ["", "## Начало и завершение native drag", "", "`startCall` — синхронный `startDrag()` вместе с обработчиками приложения; `releaseCall` — синхронный dispatch mouseup и остановка drag. Первый draw после начала/отпускания относится к **любому** слою Stage и не доказывает готовность окончательного кадра. `releaseCall` не включает отложенный commit React 19. Поэтому дополнительно приведён `postRunTail`: от конца измеряемого окна до чтения сохранённых координат и порядка после возврата helper. Он включает release, два rAF и проверку состояния внутри helper; postRun timestamp снимается после чтения persisted-результата. Это proxy хвоста, а не физическая задержка ввода/показа; сохранённые координаты и передний порядок проверяются отдельно.", "", "| CPU | Start call медиана, мс: 16 → 19 | Первый draw после start, мс: 16 → 19 | Release call медиана (максимум), мс: 16 → 19 | Первый draw после release, мс: 16 → 19 | Tail медиана (максимум), мс: 16 → 19 |", "| --- | --- | --- | --- | --- | --- |"]
    for cpu in CPUS:
        dual = lambda metric: ' → '.join(f"{fmt(value(r, cpu, 'drag3', metric))} ({fmt(value(r, cpu, 'drag3', metric, 'max'))})" for r in RUNTIMES)
        lines.append(f"| ×{cpu} | {pair(cpu, 'drag3', 'startCallMs')} | {pair(cpu, 'drag3', 'firstDrawAfterStartMs')} | {dual('releaseCallMs')} | {pair(cpu, 'drag3', 'firstDrawAfterReleaseMs')} | {dual('postRunTailMs')} |")
    lines += ["", "## Методика и проверка", "", f"Исходный commit: `{summary['sourceCommit']}`. Перед заморозкой общий пример получил `unstable_batchedUpdates` вокруг native onDragStart/onDragEnd в **обоих** стеках; ядро SDK этим изменением не затронуто. Диагностика до исправления измерила синхронный native `releaseCall` React 16 в 266.1 мс; один контроль после исправления дал 152.3 мс. Эти двухсекундные n=1 наблюдения с другой целью drag (`free-node-0000`) не входят в матрицу и не являются статистическим результатом. [Диагностические записи](benchmarks/react16-vs-react19/preflight.json).", "", "- Одна полная 35-элементная конструкция ноды, 1000 свободно размещённых копий, 35 001 элемент модели. Seeds, порядок, JPEG, камера и исходники общие. На 3% выбраны все 1000 корней; Cell LOD приложения одинаковый.", "- Apple M5, 24 GiB RAM, 10 логических CPU; HeadlessChrome 155.0.0.0, окно 1600×1000 CSS px, DPR 2, Stage 1400×760. CPU ×1/×4/×6 — DevTools slowdown main thread этого компьютера. Он не эмулирует слабый GPU, память или другое устройство. UA сообщает Intel Mac OS X; чип Apple M5 проверен отдельно через sysctl. Полный UA и идентичность сборок сохранены в raw protocol/parity ниже.", "- По три повтора каждой пары CPU/runtime/scenario: 90 строк, 54 взаимодействия. Порядок runtime контрсбалансирован по CPU и повтору; внутри runtime mount100 и mount3, затем три жеста с вращением порядка. Каждый жест получает свежий mount; автоматическая исходная сцена и assets готовы до старта измерения.", "- Обзорная камера `(x=36, y=60, scale=0.03)`, pan amplitude `(100, 15)` CSS px; zoom 0.025–0.035 с якорем в центре Stage. Native drag одной цели `free-node-0168` в обоих стеках: синусоидальное движение ±90/50 CSS px через DOM mousemove/mouseup. Исходная позиция `(6277.7379773091525, 2053.0010906700045)` держит весь путь на экране при 3%; программный startDrag исключает hit-testing крошечной цели из этой метрики.", "- Запрошены 1000 мс прогрева и 5000 мс измерения. Все границы и интервалы используют единственный `performance.now()`; сохранены точные timestamp и draw-флаг каждого интервала. Ни один интервал не отрезан, не заменён и не сглажен. Длительность равна и `end − start`, и сумме интервалов.", "- Валидатор проверил nearest-rank p50/p95/p99, FPS, draw flags/counts/layers, DPR 2, геометрию Stage и полный состав модели. В движении: 0 layout passes, 0 BCR измерительного дерева, 0 прикреплений измерительного HTML; revision, mode и DPR стабильны. Во всех 18 drag: started=ended=1, moved>0, stopped=true, ошибка ≤0.01; координаты после возврата и front=true сохранены.", "- Pan/zoom приостанавливает hit-map. Восстановление после покоя/первого нажатия не входит в устойчивый FPS; native Layer.draw не равен GPU presentation. Три повтора дают медианы и диапазон наблюдений, без доверительного интервала и без вывода о других устройствах.", ("- В отдельном native parity spot-check при 3% по целочисленным размерам native canvas-кешей получено ровно 6 000 000 байт в обоих стеках, по 1000 кешированных корней. Это объём растровых данных после подготовки, не пик всей матрицы и не измерение RSS/VRAM. SDK-снимок React 19 был устаревшим (3 000 000), а React 16 считал дробные размеры обёртки (6 365 250). Поле `reportedMaxCacheBytes` в сводке сохраняет сообщённую SDK оценку; оно не используется для сравнения физической памяти." if summary.get("parity") else "- Native parity spot-check отсутствует. Поле `reportedMaxCacheBytes` — сообщённая SDK оценка, оно не подтверждает фактический объём canvas-кешей."), "- Предыдущие замеры со смешанными часами и их скорректированные окна в это сравнение не включены. Это новая матрица двух свежих сборок на одинаковом helper.", "", "## Наблюдение по коду", "", "Drop обновляет nodes/order и создаёт 1000 новых объектов placements. Это вызывает повторные render корней и обновление native event handlers; существующие native группы и кеши сохраняются. Путь подтверждён в [FreeNodesExample](../src/examples/FreeNodesExample.tsx), [PlacedRoot](../src/lib/rendering/PlacedRoot.tsx) и [SceneIsland](../src/lib/rendering/SceneIsland.tsx). Без количественного профиля нельзя назвать его доказанной причиной пауз около 4.4 с. Konva 8 рисует hit cache при Node.cache(), Konva 10 подготавливает эту часть отложенно: это качественное различие работы версий, не измеренная доля задержки.", "", "## Исходные данные", "", "[Сводный JSON](react16-vs-react19-stress-results.json) содержит медианы, min/max всех метрик, протокол каждого файла и parity. Raw JSON сохраняет все интервалы и timestamp. SHA-256 относятся к окончательным байтам файлов.", "", "| Файл | Строк | SHA-256 |", "| --- | --- | --- |"]
    for raw in summary["rawFiles"]:
        relative = Path(raw["path"]).relative_to("docs").as_posix()
        lines.append(f"| [{Path(relative).name}]({relative}) | {raw['rows']} | `{raw['sha256']}` |")
    if summary.get("parityFile"):
        raw = summary["parityFile"]
        lines += ["", f"[Parity: геометрия, native кеши и UA](benchmarks/react16-vs-react19/parity.json), SHA-256: `{raw['sha256']}`."]
    if summary.get("diagnosticsFile"):
        lines += ["", f"[Диагностика вне матрицы](benchmarks/react16-vs-react19/preflight.json), SHA-256: `{summary['diagnosticsFile']['sha256']}`."]
    lines += ["", "Замороженные production-сборки сохранены локально в `.artifacts/react16-vs-react19/{react16,react19}`; скомпилированные артефакты не включены в Git. SHA-256 `index.html`:", "", "| Стек | SHA-256 index.html |", "| --- | --- |"]
    for runtime, digest in summary["frozenBuildIndexSha256"].items():
        lines.append(f"| {runtime} | `{digest}` |")
    geometry_note = f"Геометрия без генерируемых ID: `{summary['parity']['rows'][0]['geometryHash']}`; хеши позиций и порядка совпадают и записаны в parity." if summary.get("parity") else "Parity-файл отсутствует."
    lines += ["", f"Общий JPEG SHA-256: `{summary['jpegSha256']}`. {geometry_note}", "", "Проверенные снимки сцены при DPR 2: [React 16](screenshots/react16-full-free.png), [React 19](screenshots/react19-full-free.png).", "", "## Воспроизведение", "", "Production-сборки из измеренного исходного commit; preview запускается отдельным терминалом для каждого стека:", "", "```sh", "npm ci --ignore-scripts", "npm run build", "npm run preview -- --host 127.0.0.1 --port 4183 --strictPort", "```", "", "```sh", "npm run build:react16-stress", "npx vite preview --config vite.react16-stress.config.ts --host 127.0.0.1 --port 4184 --strictPort", "```", "", "Открыть `http://127.0.0.1:4183/?nodes=1&benchmark=1` и аналогичный URL на 4184. Установить CSS viewport 1600×1000, DPR 2, активную вкладку и DevTools CPU ×1/×4/×6. Дождаться готовой исходной сцены; JPEG decode и fonts.ready также ожидаются в mount helper. В консоли каждой страницы:", "", "```js", "while (!window.freeNodes?.stats().complete)", "  await new Promise(resolve => requestAnimationFrame(resolve));", "const api = window.freeNodes;", "const view = { x: 36, y: 60, scale: 0.03 };", "const first100 = await api.benchmark.mount({", "  arrangement: 'free', view: { x: 0, y: 0, scale: 1 }", "});", "const first3 = await api.benchmark.mount({ arrangement: 'free', view });", "// Перед КАЖДЫМ drag/pan/zoom — новый mount; здесь показан drag.", "const mount = await api.benchmark.mount({ arrangement: 'free', view });", "const result = await api.benchmark.interact({", "  kind: 'drag', targetId: 'free-node-0168', view,", "  panAmplitude: { x: 100, y: 15 },", "  zoomRange: { min: 0.025, max: 0.035 },", "  warmupMs: 1000, durationMs: 5000", "});", "const persisted = {", "  node: api.nodes().find(node => node.id === 'free-node-0168'),", "  front: api.order().at(-1) === 'free-node-0168'", "};", "const postRunAtMs = performance.now();", "const postRunTailMs = postRunAtMs - result.measurementEndedAtMs;", "console.log({ first100, first3, mount, result, persisted, postRunAtMs, postRunTailMs });", "```", "", "Повторить с kind `pan` и `zoom` по три раза для каждого CPU/стека, сохраняя порядок runtime/scenario и метаданные из raw protocol. Это браузерное повторение; следующий Python шаг только проверяет и агрегирует сохранённые файлы."]
    lines += ["", "Повторная агрегация без браузера, npm, build или unit-тестов:", "", "```sh", "python3 scripts/summarize-react16-comparison.py", "```", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=ROOT / "docs/benchmarks/react16-vs-react19")
    args = parser.parse_args()
    rows, raw_files, protocols, commits = [], [], {}, set()
    for cpu in CPUS:
        path = args.input_dir / f"cpu{cpu}.json"
        data = json.loads(path.read_text())
        check_rows = data["rows"]
        if len(check_rows) != 30 or any(row["cpu"] != cpu for row in check_rows):
            raise ValueError(f"{path}: expected 30 rows for CPU×{cpu}")
        rows.extend(check_rows)
        protocols[str(cpu)] = data["protocol"]
        commit = data["sourceCommit"]
        if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit):
            raise ValueError(f"{path}: sourceCommit must be a full commit SHA")
        validate_protocol(data["protocol"], commit)
        commits.add(commit)
        raw_files.append({"path": path.relative_to(ROOT).as_posix(), "rows": len(check_rows), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    expected = Counter((runtime, cpu, scenario, repetition) for runtime in RUNTIMES for cpu in CPUS for scenario in SCENARIOS for repetition in range(1, 4))
    actual = Counter((r["runtime"], r["cpu"], r["scenario"], r["repetition"]) for r in rows)
    if actual != expected or len(commits) != 1:
        raise ValueError("Incomplete/duplicate matrix or differing source commits")
    first_runtime = min((r for r in rows if r["cpu"] == 1), key=lambda r: r["sequence"])["runtime"]
    base = [first_runtime, next(r for r in RUNTIMES if r != first_runtime)]
    for cpu_index, cpu in enumerate(CPUS):
        selected = sorted((r for r in rows if r["cpu"] == cpu), key=lambda r: r["sequence"])
        if len({r["sequence"] for r in selected}) != 30:
            raise ValueError("Duplicate sequence for CPU×" + str(cpu))
        scenario_base = [r["scenario"] for r in selected if r["repetition"] == 1 and r["runtime"] == selected[0]["runtime"]][2:]
        expected_order = []
        for rep in range(1, 4):
            offset = (cpu_index + rep - 1) % 2
            scenarios = scenario_base
            scenarios = [*SCENARIOS[:2], *scenarios[rep - 1:], *scenarios[:rep - 1]]
            expected_order.extend((runtime, scenario, rep) for runtime in base[offset:] + base[:offset] for scenario in scenarios)
        if [(r["runtime"], r["scenario"], r["repetition"]) for r in selected] != expected_order:
            raise ValueError("Counterbalanced runtime/rotated scenario order mismatch for CPU×" + str(cpu))
    for row in rows:
        validate(row)
    groups = []
    for runtime in RUNTIMES:
        for cpu in CPUS:
            for scenario in SCENARIOS:
                samples = [metrics(r) for r in rows if (r["runtime"], r["cpu"], r["scenario"]) == (runtime, cpu, scenario)]
                groups.append({"runtime": runtime, "cpu": cpu, "scenario": scenario, "runs": len(samples), "metrics": {k: spread([s[k] for s in samples]) for k in samples[0]}})
    summary = {"schemaVersion": 1, "sourceCommit": commits.pop(), "protocolByCpu": protocols, "rawFiles": raw_files, "validation": {"rows": len(rows), "interactions": 54, "nativeDrags": 18, "allPassed": True, "clock": "performance.now", "discardedIntervals": 0, "percentile": "nearest-rank", "cacheAccounting": "reportedMaxCacheBytes is SDK-reported, not actual canvas memory; native parity spot-check is separate"}, "groups": groups}
    parity_path = args.input_dir / "parity.json"
    if parity_path.exists():
        parity = json.loads(parity_path.read_text())
        if {r["runtime"] for r in parity["rows"]} != set(RUNTIMES) or len(parity["rows"]) != 2:
            raise ValueError("Parity must contain both runtimes")
        if any(r["modelNodes"] != 35001 or r["nativeCacheBytes"] != 6000000 or r["cached"] != 1000 or r["hidden"] for r in parity["rows"]):
            raise ValueError("Parity model/native cache/visibility mismatch")
        for key in ("geometryHash", "positionsHash", "orderHash", "modelNodes", "firstNode", "nativeCacheBytes", "userAgent"):
            if parity["rows"][0][key] != parity["rows"][1][key]:
                raise ValueError("Parity mismatch: " + key)
        summary.update({"parity": parity, "parityFile": {"path": parity_path.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(parity_path.read_bytes()).hexdigest()}})
    summary["frozenBuildIndexSha256"] = {"react16": "93b6957b2a6af460ec9c64e24959e59c8eedbb72ba632bb622c42f2d27f1e909", "react19": "14dfefacc5c35d6499ef2b82c1c39d7a57033590d447cb927eb469fc43ac0fa0"}
    summary["jpegSha256"] = "7ac93a8a67ee699d700dae636c4e283f1c6bab3cffce64078d7676d57d0a8b1d"
    for runtime, digest in summary["frozenBuildIndexSha256"].items():
        for filename, expected_digest in (("index.html", digest), ("node-preview.jpg", summary["jpegSha256"])):
            path = ROOT / ".artifacts/react16-vs-react19" / runtime / filename
            if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != expected_digest:
                raise ValueError("Frozen artifact digest mismatch: " + str(path))
    diagnostic_path = args.input_dir / "preflight.json"
    if diagnostic_path.exists():
        summary["diagnosticsFile"] = {"path": diagnostic_path.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(diagnostic_path.read_bytes()).hexdigest()}
    (ROOT / "docs/react16-vs-react19-stress-results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "docs/react16-vs-react19-stress.md").write_text(report(summary, rows))
    print(f"Validated {len(rows)} rows; wrote comparison summary and report.")


if __name__ == "__main__":
    main()
