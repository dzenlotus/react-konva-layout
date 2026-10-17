#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate and summarize the recorded free-node benchmark; no browser work."""

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CPUS = (1, 4, 6)
ARRANGEMENTS = ("free", "grid")
EXPECTED = {
    "mount1": 3,
    "mount3": 3,
    "drag3": 3,
    "pan3": 3,
    "zoom3": 3,
    "drag1": 1,
    "pan1": 1,
    "zoom1": 1,
}


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)] if ordered else None


def spread(values):
    values = [v for v in values if v is not None]
    return {
        "runsWithValue": len(values),
        "median": statistics.median(values) if values else None,
        "min": min(values) if values else None,
        "max": max(values) if values else None,
    }


def validate(row):
    label = (row["phase"], row["cpu"], row["arrangement"], row["scenario"], row["repetition"])
    mount = row["mount"]
    assert mount["complete"] and mount["cards"] == 1000, label
    assert mount["primitives"] == 35001, label
    assert mount["measurement"]["measuredNodes"] == 1035, label
    assert mount["measurement"]["templateHits"] == 999, label
    assert mount["idleHtmlNodes"] == mount["attachedMeasurementRoots"] == 0, label
    assert mount["devicePixelRatio"] == mount["canvasPixelRatio"] == 2, label
    assert (mount["viewportWidth"], mount["viewportHeight"]) == (1400, 760), label
    result = row.get("result")
    if not result:
        return
    frames = result["frameIntervalsMs"]
    draws = result["drawDurationsMs"]
    layers = result["drawLayerIndices"]
    assert len(frames) == result["frameCount"], label
    assert len(frames) > 1 and all(interval > 0 for interval in frames), label
    assert 0 <= result["renderedFrameCount"] <= len(frames), label
    assert result["emptyFrameCount"] == len(frames) - result["renderedFrameCount"], label
    assert len(draws) == len(layers) == result["drawCount"], label
    assert math.isclose(sum(frames), result["durationMs"], abs_tol=0.01), label
    assert math.isclose(len(frames) * 1000 / result["durationMs"], result["fps"], abs_tol=1e-6), label
    assert math.isclose(result["renderedFrameCount"] * 1000 / result["durationMs"], result["renderedFps"], abs_tol=1e-6), label
    assert math.isclose(percentile(frames, 0.95), result["p95Ms"], abs_tol=0.01), label
    assert math.isclose(percentile(frames, 0.99), result["p99Ms"], abs_tol=0.01), label
    assert result["requestedDurationMs"] == 5000 and result["warmupMs"] == 1000, label
    assert result["layoutPasses"] == result["measurementRectReads"] == result["measurementRootAttachments"] == result["maxHtmlNodes"] == 0, label
    assert not result["measurementRevisionChanged"] and not result["canvasPixelRatioChanged"] and not result["modeChanged"], label
    assert result["minCanvasPixelRatio"] == result["maxCanvasPixelRatio"] == 2, label
    if row["scenario"].endswith("3"):
        assert result["minVisibleRoots"] == result["maxVisibleRoots"] == 1000, label
    drag = result.get("drag")
    if drag:
        assert drag["started"] == drag["ended"] == 1 and drag["moved"] > 0, label
        assert drag["stopped"] and drag["positionError"] < 0.01, label


def analyzed_interaction(result):
    # The frozen harness starts with performance.now(), but its first interval
    # starts at an earlier rAF timestamp. Drop that entire interval in both phases.
    # Per-frame draw flags were not saved, so partial rendered counts need bounds.
    intervals = result["frameIntervalsMs"][1:]
    frames = len(intervals)
    duration = sum(intervals)
    rendered_min = max(0, result["renderedFrameCount"] - 1)
    rendered_max = min(result["renderedFrameCount"], frames)
    return {
        "discardedFirstIntervalMs": result["frameIntervalsMs"][0],
        "analyzedDurationMs": duration,
        "analyzedFrameCount": frames,
        "analyzedRafFps": frames * 1000 / duration,
        "analyzedRenderedFrameCountLowerBound": rendered_min,
        "analyzedRenderedFrameCountUpperBound": rendered_max,
        "analyzedRenderedFpsLowerBound": rendered_min * 1000 / duration,
        "analyzedRenderedFpsUpperBound": rendered_max * 1000 / duration,
        "analyzedFrameP95Ms": percentile(intervals, 0.95),
        "analyzedFrameP99Ms": percentile(intervals, 0.99),
        "analyzedMaxFrameMs": max(intervals),
        "rawClockRafFps": result["fps"],
        "rawClockRenderedFps": result["renderedFps"],
        "rawClockFrameCount": result["frameCount"],
        "rawClockRenderedFrameCount": result["renderedFrameCount"],
        "rawClockDurationMs": result["durationMs"],
        "rawClockFrameP95Ms": result["p95Ms"],
        "rawClockFrameP99Ms": result["p99Ms"],
        "rawClockMaxFrameMs": result["maxFrameMs"],
    }


def metrics(row):
    mount = row["mount"]
    values = {
        "firstCompletedDrawMs": mount.get("mountToCompletedDrawMs"),
        "nextAnimationFrameMs": mount["totalToCanvasFrameMs"],
        "validationMs": mount.get("validationMs"),
        "mountMeasurementMs": mount["measurement"]["durationMs"],
        "mountMeasuredNodes": mount["measurement"]["measuredNodes"],
    }
    result = row.get("result")
    if not result:
        return values
    values.update(analyzed_interaction(result))
    values.update({
        "cacheMiB": result["maxCacheBytes"] / 1024**2,
        "cachedRootsAtStart": result["startStats"]["rendering"]["cachedRoots"],
        "cachedRootsAtEnd": result["endStats"]["rendering"]["cachedRoots"],
        "visibleRootsMin": result["minVisibleRoots"],
        "visibleRootsMax": result["maxVisibleRoots"],
        "actualWarmupMs": result.get("actualWarmupMs"),
        "warmupMaxFrameMs": result.get("warmupMaxFrameMs"),
        "measurementRectReadsDuringGesture": result["measurementRectReads"],
        "measurementRootAttachmentsDuringGesture": result["measurementRootAttachments"],
        "layoutPassesDuringGesture": result["layoutPasses"],
    })
    for layer in (0, 1):
        durations = [duration for duration, index in zip(result["drawDurationsMs"], result["drawLayerIndices"]) if index == layer]
        values[f"layer{layer}DrawP95MsUntrimmed"] = percentile(durations, 0.95)
        values[f"layer{layer}DrawCountUntrimmed"] = len(durations)
    drag = result.get("drag")
    values["dragStartCallMs"] = drag["startCallMs"] if drag else None
    values["dragFirstDrawMs"] = drag["firstDrawAfterStartMs"] if drag else None
    return values


def load(phases):
    groups = defaultdict(list)
    sources = []
    for phase in phases:
        for cpu in CPUS:
            path = ROOT / f"docs/benchmarks/free-{phase}-cpu{cpu}.json"
            content = path.read_bytes()
            data = json.loads(content)
            rows = data["rows"]
            expected = Counter({(arrangement, scenario): count for arrangement in ARRANGEMENTS for scenario, count in EXPECTED.items()})
            assert Counter((r["arrangement"], r["scenario"]) for r in rows) == expected, str(path)
            assert len({(r["arrangement"], r["scenario"], r["repetition"]) for r in rows}) == len(rows), str(path)
            sources.append({"path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(content).hexdigest(), "rows": len(rows)})
            for row in rows:
                assert row["phase"] == phase and row["cpu"] == cpu, str(path)
                validate(row)
                groups[(phase, cpu, row["arrangement"], row["scenario"])].append(row)
    summaries = []
    for (phase, cpu, arrangement, scenario), rows in sorted(groups.items()):
        runs = [metrics(row) for row in rows]
        summaries.append({
            "phase": phase,
            "cpuSlowdown": cpu,
            "arrangement": arrangement,
            "scenario": scenario,
            "repetitions": len(rows),
            "metrics": {key: spread(run[key] for run in runs) for key in runs[0]},
        })
    return summaries, sources


def load_legacy():
    summaries = []
    path = ROOT / "docs/benchmarks/legacy-before.json"
    if not path.exists():
        return [], []
    content = path.read_bytes()
    rows = json.loads(content)["rows"]
    expected = Counter({(cpu, scenario): 1 for cpu in CPUS for scenario in ("mount1", "mount0.03", "pan3", "zoom3")})
    assert Counter((r["cpu"], r["scenario"]) for r in rows) == expected, str(path)
    for row in rows:
        assert row["phase"] == "before" and row["arrangement"] == "legacy-grid", str(path)
        validate(row)
        summaries.append({"phase": "before", "cpuSlowdown": row["cpu"], "scenario": row["scenario"], "metrics": metrics(row)})
    return summaries, [{"path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(content).hexdigest(), "rows": len(rows)}]


def load_clock_verification():
    path = ROOT / "docs/benchmarks/clock-verification.json"
    if not path.exists():
        return [], []
    content = path.read_bytes()
    rows = json.loads(content)["rows"]
    expected = Counter({(phase, cpu, scenario): 1 for phase in ("before", "after") for cpu in (1, 6) for scenario in ("pan3", "zoom3")})
    assert Counter((r["phase"], r["cpu"], r["scenario"]) for r in rows) == expected, str(path)
    summaries = []
    for row in rows:
        validate(row)
        result = row["result"]
        intervals = result["frameIntervalsMs"]
        timestamps = result["frameTimestampsMs"]
        assert len(timestamps) == len(result["frameHadDraw"]) == len(intervals), str(path)
        assert sum(result["frameHadDraw"]) == result["renderedFrameCount"], str(path)
        assert result["actualWarmupMs"] >= result["warmupMs"], str(path)
        assert math.isclose(max(result["warmupFrameIntervalsMs"]), result["warmupMaxFrameMs"], abs_tol=0.01), str(path)
        previous = result["measurementStartedAtMs"]
        for timestamp, interval in zip(timestamps, intervals):
            assert math.isclose(timestamp - previous, interval, abs_tol=0.01), str(path)
            previous = timestamp
        assert math.isclose(previous, result["measurementEndedAtMs"], abs_tol=0.01), str(path)
        assert math.isclose(previous - result["measurementStartedAtMs"], result["durationMs"], abs_tol=0.01), str(path)
        summaries.append({
            "phase": row["phase"],
            "cpuSlowdown": row["cpu"],
            "scenario": row["scenario"],
            "renderedFps": result["renderedFps"],
            "rafFps": result["fps"],
            "durationMs": result["durationMs"],
            "frameCount": result["frameCount"],
            "renderedFrameCount": result["renderedFrameCount"],
            "p95Ms": result["p95Ms"],
            "p99Ms": result["p99Ms"],
            "maxFrameMs": result["maxFrameMs"],
            "actualWarmupMs": result["actualWarmupMs"],
            "warmupMaxFrameMs": result["warmupMaxFrameMs"],
            "measurementStartRafOffsetMs": result["measurementStartRafOffsetMs"],
        })
    source = {"path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(content).hexdigest(), "rows": len(rows)}
    return summaries, [source]


def load_functional():
    path = ROOT / "docs/benchmarks/free-functional.json"
    if not path.exists():
        return [], []
    content = path.read_bytes()
    data = json.loads(content)
    rows = data["rows"]
    expected = Counter({("pointer", 0.03): 1, ("drag", 0.03): 1, ("drag", 0.1): 1, ("drag", 1): 1, ("camera", 0.03): 1, ("native-camera", 0.03): 1, ("resize", 0.03): 1, ("content", 0.03): 1})
    assert data["cpu"] == 6 and Counter((r["action"], r["scale"]) for r in rows) == expected, str(path)
    for row in rows:
        for key in ("correctHit", "stopped", "parentRestored", "groupPreserved", "geometryPreserved", "cachePreserved"):
            assert row[key], (str(path), row["action"], key)
        assert row["idleHtmlNodes"] == row["attachedMeasurementRoots"] == 0, str(path)
        assert row["savedPositionError"] < 0.01, str(path)
        assert row["finalView"] == row["nativeView"], str(path)
        if row["action"] == "pointer":
            assert row["pausedBeforePointer"] and row["listeningAfterPointer"], str(path)
        else:
            assert row["started"] == row["ended"] == 1 and row["moved"] > 0, str(path)
            assert row["parentDuring"] == "free-node-interaction", str(path)
            assert row["frontOrderPersisted"] and row["positionError"] < 0.01, str(path)
    source = {"path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(content).hexdigest(), "rows": len(rows), "kind": "functional"}
    return rows, [source]


def report(summaries, sources, legacy, clock, functional):
    index = {(r["phase"], r["cpuSlowdown"], r["arrangement"], r["scenario"]): r["metrics"] for r in summaries}

    def value(phase, cpu, arrangement, scenario, metric):
        return index[phase, cpu, arrangement, scenario][metric]["median"]

    def number(v):
        return "—" if v is None else f"{v:.1f}"

    def pair(cpu, arrangement, scenario, metric):
        return " → ".join(number(value(phase, cpu, arrangement, scenario, metric)) for phase in ("before", "after"))

    def pair_worst(cpu, arrangement, scenario, metric):
        return " → ".join(number(index[phase, cpu, arrangement, scenario][metric]["max"]) for phase in ("before", "after"))

    def fps_bounds(lower, upper):
        return number(lower) if number(lower) == number(upper) else f"{number(lower)}–{number(upper)}"

    def pair_fps(cpu, arrangement, scenario):
        return " → ".join(fps_bounds(
            value(phase, cpu, arrangement, scenario, "analyzedRenderedFpsLowerBound"),
            value(phase, cpu, arrangement, scenario, "analyzedRenderedFpsUpperBound"),
        ) for phase in ("before", "after"))

    def table(headers, rows):
        return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |", *("| " + " | ".join(map(str, row)) + " |" for row in rows)])

    low_rows = []
    first_rows = []
    normal_rows = []
    tail_rows = []
    cache_rows = []
    preparation_rows = []
    for cpu in CPUS:
        for arrangement in ARRANGEMENTS:
            label = "Свободная" if arrangement == "free" else "Сетка"
            low_rows.append([f"×{cpu}", label, *(pair_fps(cpu, arrangement, f"{kind}3") for kind in ("drag", "pan", "zoom"))])
            first_rows.append([f"×{cpu}", label, pair(cpu, arrangement, "mount1", "firstCompletedDrawMs"), pair(cpu, arrangement, "mount3", "firstCompletedDrawMs")])
            normal_rows.append([f"×{cpu}", label, *(pair_fps(cpu, arrangement, f"{kind}1") for kind in ("drag", "pan", "zoom"))])
            cache_rows.append([f"×{cpu}", label, pair(cpu, arrangement, "pan3", "cachedRootsAtStart"), pair(cpu, arrangement, "pan3", "cacheMiB")])
            warmup = index["after", cpu, arrangement, "zoom3"]["actualWarmupMs"]
            first = index["after", cpu, arrangement, "zoom3"]["discardedFirstIntervalMs"]
            preparation_rows.append([f"×{cpu}", label, number(warmup["median"]), f"{number(warmup['min'])}–{number(warmup['max'])}", number(first["max"])])
            for kind in ("drag", "pan", "zoom"):
                scenario = f"{kind}3"
                tail_rows.append([f"×{cpu}", label, kind, pair(cpu, arrangement, scenario, "analyzedFrameP95Ms"), pair_worst(cpu, arrangement, scenario, "analyzedMaxFrameMs"), pair(cpu, arrangement, scenario, "layer0DrawP95MsUntrimmed"), pair(cpu, arrangement, scenario, "layer1DrawP95MsUntrimmed")])

    source_links = "\n".join(f"- [{entry['path'].split('/')[-1]}](benchmarks/{entry['path'].split('/')[-1]}) — {entry['rows']} {'проверок' if entry.get('kind') == 'functional' else 'прогонов'}." for entry in sources)
    source_links += (
        "\n- [free-local-relayout.json](benchmarks/free-local-relayout.json) — дополнительная проверка обновления содержимого, вне матрицы FPS."
        "\n- [free-saved-camera.json](benchmarks/free-saved-camera.json) — дополнительные загрузки с сохранённой камерой, вне матрицы FPS."
    )
    warmups = [r["metrics"]["actualWarmupMs"] for r in summaries if r["phase"] == "after" and r["scenario"].endswith("3") and not r["scenario"].startswith("mount")]
    warmup_min = min(v["min"] for v in warmups if v["min"] is not None)
    warmup_max = max(v["max"] for v in warmups if v["max"] is not None)
    window_rows = []
    for cpu in CPUS:
        cells = []
        for metric in ("analyzedDurationMs", "analyzedFrameCount"):
            for phase in ("before", "after"):
                values = [r["metrics"][metric] for r in summaries if r["phase"] == phase and r["cpuSlowdown"] == cpu and r["scenario"] in ("drag3", "pan3", "zoom3")]
                low, high = min(v["min"] for v in values), max(v["max"] for v in values)
                cells.append(f"{int(low)}–{int(high)}" if metric == "analyzedFrameCount" else f"{number(low)}–{number(high)}")
        window_rows.append([f"×{cpu}", *cells])
    legacy_section = (
        "\n## Историческая статическая сетка\n\n"
        "[Исходные замеры `?stress=1`](benchmarks/legacy-before.json) оставлены как справочный "
        "контроль версии `579e7f8`: по одному запуску, drag отсутствует. После исправления "
        "эта сцена повторно не измерялась. Её старый `totalToCanvasFrameMs` заканчивается на "
        "следующем rAF и не совпадает с таймером completed draw новой интерактивной сцены. "
        "Основное сравнение с сеткой выше использует одинаковый интерактивный компонент "
        "и отличается только координатами нод.\n"
    ) if legacy else ""
    clock_section = ""
    clock_lead = ""
    if clock:
        clock_index = {(r["phase"], r["cpuSlowdown"], r["scenario"]): r for r in clock}
        clock_rows = []
        for cpu in (1, 6):
            for kind in ("pan", "zoom"):
                cells = []
                for metric in ("renderedFps", "durationMs", "maxFrameMs", "actualWarmupMs", "warmupMaxFrameMs"):
                    cells.append(" → ".join(number(clock_index[phase, cpu, kind + "3"][metric]) for phase in ("before", "after")))
                clock_rows.append([f"×{cpu}", kind, *cells])
        control_pan = clock_index["after", 6, "pan3"]["renderedFps"]
        control_zoom = clock_index["after", 6, "zoom3"]["renderedFps"]
        control_warmup = clock_index["after", 6, "zoom3"]["actualWarmupMs"]
        control_warmup_max = clock_index["after", 6, "zoom3"]["warmupMaxFrameMs"]
        matrix_pan = value("after", 6, "free", "pan3", "analyzedRenderedFpsLowerBound")
        matrix_zoom = value("after", 6, "free", "zoom3", "analyzedRenderedFpsLowerBound")
        clock_lead = (
            f"Отдельный контроль с исправленными часами показал {number(control_pan)}/{number(control_zoom)} FPS, "
            f"а перед первым zoom — интервал прогрева {number(control_warmup_max / 1000)} с. "
            "Устойчивые 40+ FPS на слабом CPU обещать нельзя. "
        )
        clock_section = (
            "## Контроль с исправленными часами\n\n"
            "После завершения основной матрицы измеритель переведён на единый `performance.now()`. "
            "Он сохраняет начало и конец окна, timestamp и признак законченного draw каждого интервала. "
            "Этим новым helper повторены pan/zoom свободной сцены при CPU ×1/×6 на обеих замороженных "
            "production-сборках. По одному новому запуску, без отрезания первого интервала:\n\n"
            + table(["CPU", "Жест", "FPS", "Окно, мс", "Худший интервал, мс", "Подготовка до окна, мс", "Худший интервал прогрева, мс"], clock_rows)
            + "\n\nКонтроль проверяет часы и повторяет часть сценариев. Его числа не объединены "
            "с медианами основной матрицы и не заменяют три повтора. "
            f"При ×6 свободная сцена в этом контроле дала {number(control_pan)} FPS pan и {number(control_zoom)} FPS zoom, "
            f"против медианных {number(matrix_pan)}/{number(matrix_zoom)} в основной матрице: результат существенно варьируется, "
            "стабильные 40+ FPS на слабом CPU не подтверждены. Перед zoom зафиксирован "
            f"интервал прогрева {number(control_warmup_max)} мс при общей подготовке {number(control_warmup)} мс. Это реальная задержка "
            "между callback нового измерителя, а не ошибка смешения часов; она включает работу "
            "и ожидание внутри этого интервала, без изолированного профиля стоимости кеширования. "
            "[Исходная запись](benchmarks/clock-verification.json).\n\n"
        )
    functional_section = ""
    if functional:
        pointer = next(row for row in functional if row["action"] == "pointer")
        functional_section = (
            "## Попадание и завершение drag\n\n"
            "Дополнительно выполнены восемь отдельных функциональных проверок при CPU ×6, "
            "по одной на случай; это не замеры FPS. Целевая нода заранее выбрана и поднята "
            "на передний план, затем используется настоящий hit-tested mousedown/move/up.\n\n"
            f"- Первое нажатие сразу после движения камеры при 3% восстановило listening и "
            f"hit-map до поиска цели, выбрало нужную ноду; синхронный mousedown занял {number(pointer['pointerCallMs'])} мс. "
            "Это стоимость одного полного обработчика нажатия, включая восстановление hit-map, "
            "не изолированное время drawHit и не задержка физического ввода.\n"
            "- Drag при 3%, 10% и 100% сохранил координаты и передний порядок; группа перемещалась "
            "в interaction Layer и возвращалась в исходного родителя перед сохранением состояния. "
            "Native группа и геометрия сохранились, существовавшие кеши не пересоздались. "
            "При 10% целевая нода изначально была без кеша, поэтому сохранение её кеша этим случаем не проверяется.\n"
            "- Изменения камеры через API и native Stage, resize и изменение содержимого во время drag "
            "завершили жест, вернули группу и сохранили позицию. Во всех восьми случаях "
            "idle измерительный HTML отсутствовал, native камера совпала с состоянием приложения.\n\n"
            "[Исходные проверки](benchmarks/free-functional.json). Эти восемь случаев не являются "
            "полной проверкой всех комбинаций взаимодействий.\n\n"
            "Отдельно при CPU ×1 изменение description ноды `free-node-0000` через API приложения "
            "вызвало локальное измерение только этого корня: 35 BCR, 2,5 мс именно HTML-измерения. "
            "Ссылки геометрии остальных 999 корней сохранились; у остальных смонтированных видимых "
            "корней сохранились native группы и кеши, idle HTML отсутствовал. "
            "[Запись проверки](benchmarks/free-local-relayout.json).\n\n"
            "При свежих загрузках страницы с сохранёнными камерами `(36, 60, 0.03)` и "
            "`(36, 60, 0.05)` native Stage совпал с состоянием приложения, логический размер "
            "ноды в обоих случаях был 360 × 429,78125; измерительный HTML после готовности отсутствовал. "
            "Это отдельные проверки начальной камеры, без benchmark remount и без нового замера FPS. "
            "[Исходные данные](benchmarks/free-saved-camera.json).\n\n"
        )
    return f"""# 1000 свободно размещённых нод: drag, pan и zoom

Замеры от 17 октября 2026 года. Сравнение библиотечного рендерера `579e7f8` с добавленной измерительной обвязкой и исправленного варианта 0.6.1. Числа ниже — **до → после**; FPS означает частоту интервалов rAF с хотя бы одним завершённым `Layer.draw`, а не число отдельных draw или физическое предъявление кадров GPU.

Drag свободной сцены на 3% даёт медианные {"/".join(number(value("after", cpu, "free", "drag3", "analyzedRenderedFpsLowerBound")) for cpu in CPUS)} FPS при CPU ×1/×4/×6. При ×6 основная матрица даёт {number(value("after", 6, "free", "pan3", "analyzedRenderedFpsLowerBound"))}/{number(value("after", 6, "free", "zoom3", "analyzedRenderedFpsLowerBound"))} FPS pan/zoom, у сетки — {number(value("after", 6, "grid", "pan3", "analyzedRenderedFpsLowerBound"))}/{number(value("after", 6, "grid", "zoom3", "analyzedRenderedFpsLowerBound"))} FPS. {clock_lead}Первый кадр всей свободной сцены на 3% стал медленнее при ×1 и ×6: {pair(1, "free", "mount3", "firstCompletedDrawMs")} мс и {pair(6, "free", "mount3", "firstCompletedDrawMs")} мс. Взаимодействие ускорено, но первый кадр и смена плотности кешей остаются заметными ограничениями.

[Сцена из 1000 нод на 3%](screenshots/free-scene-1000-overview.png) · [Выбранная нода на 100%](screenshots/free-scene-detail.png).

## Сцена на 3%

Медианы трёх независимых прогонов; drag и pan при 3%, zoom в пределах 2,5–3,5%. Из обеих фаз исключён первый записанный интервал из-за обнаруженной ошибки часов harness; остальные интервалы сохранены без изменений. Где точное число завершённых draw после исключения неизвестно, показаны нижняя и верхняя границы FPS, а не выдуманная точная оценка. Это границы отсутствующего флага первого кадра, не доверительные интервалы. Подробности — ниже.

В каждом прогоне рендерер сохранял 1000 выбранных корней. Это не означает, что каждый пиксель всех нод попадал внутрь viewport: часть граничных нод могла обрезаться.

{table(["CPU", "Размещение", "Drag FPS", "Pan FPS", "Zoom FPS"], low_rows)}

Свободная сцена и интерактивная сетка используют один компонент, одинаковые ноды и обработчики. Меняются только координаты размещения. Это прямой контроль для нового drag-сценария; историческая статическая `?stress=1` рассматривается отдельно и drag не поддерживает.

## Подготовка перед измеряемым zoom

FPS в основной таблице относится к движению после прогрева. При первом переходе на другую плотность кешей остаётся существенная подготовка: фактическое время от начала прогрева до измеряемого окна в исправленной сцене приведено отдельно. Запрошенный прогрев — 1000 мс.

{table(["CPU", "Размещение", "До начала FPS-окна, медиана мс", "Диапазон, мс", "Максимум исключённого первого интервала, мс"], preparation_rows)}

Это не измерение одной непрерывной паузы кеширования. `actualWarmupMs` — прошедшее время подготовки до старта измерения; последний синхронный callback мог продлить его. Исключённый первый rAF-интервал содержит смешение часов и служит только индикатором переноса работы через границу окна. Ни из него, ни из `warmupFrameIntervalsMs` нельзя восстановить точную стоимость последней подготовки кешей. Таким образом, хороший устойчивый FPS не устраняет заметную задержку при первом изменении плотности.

## Первый законченный canvas draw

Миллисекунды; медианы трёх новых монтирований `Layout` на уже существующем `Stage`. В таймер включены HTML-измерение, создание Konva-узлов, кешей и первый законченный scene+hit draw. Проверка геометрии начинается после остановки этого таймера; её время и следующий rAF сохранены отдельно в JSON.

{table(["CPU", "Размещение", "100%, мс", "3%, мс"], first_rows)}

Это **не** время навигации или холодного декодирования: production-код уже загружен, шрифты готовы, JPEG превью декодирован, каждый предыдущий `Layout` размонтирован. При 100% действует culling, поэтому одновременно отрисовывается лишь часть из 1000 нод; 3% — более тяжёлый первый canvas кадр со всеми корнями.

## Кадры и стоимость draw на 3%

Медианы p95 каждого прогона, мс, методом nearest rank без объединения разных запусков. rAF p95 вычислен после исключения первого интервала. Интервал rAF может содержать пустой callback; FPS выше учитывает границы числа интервалов с законченным draw.

**Draw p95 оставлен по полному исходному массиву, без исключения:** harness не сохранил соответствие отдельного draw отдельному интервалу rAF, поэтому корректно отрезать draw первого интервала невозможно. Эти значения характеризуют записанные вызовы draw, а не точно то же очищенное окно FPS. Layer 0 — основная сцена; Layer 1 — слой перетаскиваемой ноды после исправления. «—» означает отсутствие draw этого слоя. Прогоны без draw данного слоя исключены только из его медианы; число учтённых прогонов сохранено в JSON. В очень медленных исходных CPU ×4/×6 прогонах кадров мало: p95/p99 часто равны максимуму и не дают точной оценки хвоста распределения.

{table(["CPU", "Размещение", "Жест", "rAF p95 после исключения", "Худший rAF за все повторы", "Layer 0 draw p95, полный массив", "Layer 1 draw p95, полный массив"], tail_rows)}

Колонка худшего rAF показывает максимум среди всех оставшихся интервалов всех повторов, поэтому единичная длинная пауза сохраняется в отчёте даже при хорошем медианном FPS и p95. Это максимум анализируемого окна, без исключённого первого интервала.

Разделение слоёв существенно: после исправления drag перерисовывает слой одной движущейся ноды. Суммарное число `Layer.draw` не используется как FPS, поскольку один rAF может завершить несколько draw.

## Контроль при 100%

По одному прогону, поэтому это контроль, а не устойчивая сравнительная статистика. Для zoom диапазон 65–160%; pan линейный −240/−120 CSS px/с. Разное число попавших в viewport нод свободной сцены и сетки влияет на стоимость; из этого контроля нельзя выводить чистую стоимость свободного размещения.

{table(["CPU", "Размещение", "Drag FPS", "Pan FPS", "Zoom FPS"], normal_rows)}

## Кеш и HTML

Кеши в начале прогретого pan и максимальная фактическая память canvas-кешей за этот жест. Данные по каждой операции и диапазоны повторов находятся в [сводном JSON](free-scene-stress-results.json).

{table(["CPU", "Размещение", "Кешированные корни", "Кеши, MiB"], cache_rows)}

Во всех измеряемых жестах обеих версий: 0 `getBoundingClientRect` измерительного дерева, 0 прикреплений измерительного HTML, 0 layout passes, 0 оставшихся измерительных HTML-узлов. Конечная позиция каждого drag проверена по реально доставленным браузером координатам; drag завершился. DPR canvas оставался 2.

{legacy_section}

## Что исправлено

- Минимальная плотность кеша больше не заставляет обзорную сцену на 3% использовать избыточные растровые поверхности; scene и hit кеши учитывают текущую плотность. Фильтровая поверхность резервируется только для групп с фильтром, при неизменном бюджете 32 MiB.
- Группа размещения объединена с группой корня ноды. Полная область попадания остаётся в hit canvas, без лишнего scene-прямоугольника.
- Приложение переносит активную ноду на отдельный drag Layer и возвращает её перед сохранением координат и порядка. Библиотека по-прежнему не создаёт `Stage`, `Layer` или камеру.
- Во время движения камеры приложение приостанавливает перерисовку hit-map. Она восстанавливается после 120 мс покоя либо синхронно при следующем pointer/mouse/touch down перед поиском цели.
- Камера обновляется через Konva и refs; React реагирует на изменения выборочного Cell LOD, а статистика публикуется при изменении самих метрик. Pan/zoom не пересчитывает HTML-геометрию.

Полный первый кадр может подорожать из-за подготовки большего числа пригодных кешей. Таблица первого draw отдельно показывает эту цену; высокий FPS после прогрева не доказывает ускорение загрузки.

{clock_section}

{functional_section}

## Методика и пределы

Фактические диапазоны длительности и числа оставшихся rAF-интервалов обзорных прогонов, обе расстановки и все три жеста:

{table(["CPU", "До: окно, мс", "После: окно, мс", "До: интервалов", "После: интервалов"], window_rows)}

- В замороженном harness `startedAt` задавался через `performance.now()`, а начало первого интервала — более ранним timestamp rAF. Если перед callback выполнялась синхронная подготовка кешей, первый интервал захватывал её часть. Стартовый timestamp не сохранён, поэтому точное исходное 5-секундное окно восстановить невозможно. В основной матрице обе фазы используют `frameIntervalsMs.slice(1)`: анализируемая длительность — сумма оставшихся интервалов, число rAF — `N−1`. Первый интервал не заменяется искусственными 16,7 мс.
- Если исходно `R=N`, каждый оставшийся интервал содержал draw и FPS точен: `(N−1) / duration × 1000`. Если были пустые rAF, неизвестно, был ли первый интервал пустым; число оставшихся draw-интервалов лежит в `[max(0,R−1), min(R,N−1)]`. Таблицы показывают медианы обеих границ отдельно. `analyzed*` и `rawClock*` в сводном JSON различают пересчитанное окно и исходный full-window throughput. Исходные файлы и значения сохранены полностью.
- Apple M5, 10 логических CPU, 24 GiB RAM. HeadlessChrome 155.0.0.0, окно 1600×1000 CSS px, DPR 2; реальный `Stage` 1400×760. UA сообщает `MacIntel`, однако чип Apple M5 проверен через `sysctl`. Замедление CPU ×1/×4/×6 задаётся DevTools. Это модель более медленного main thread на данном компьютере; слабые GPU, пропускная способность памяти и другие устройства не эмулируются.
- Замороженный baseline использует библиотечный код `579e7f8` с добавленной benchmark-обвязкой: одинаковыми free/grid fixtures, таймерами mount, drag/camera harness и проверками. Это не чистый checkout `579e7f8` по API демо. Production-сборки сохранены локально в `.artifacts/free-scene-benchmark-2026-10-17`; эти скомпилированные артефакты не включены в публичный Git. После фиксации основной матрицы отдельно исправлены часы harness для контрольных запусков.
- 1000 одинаковых сложных нод: 35 001 элемент модели, один общий движок измерения, 999 попаданий в шаблонный кеш, 1035 измерительных BCR при полном layout. Условия Cell LOD одинаковые; автоматической замены целой ноды нет.
- Каждый жест стартует после нового монтирования. Запрошены 1000 мс прогрева и 5000 мс измерения, rAF в активной вкладке. Синхронная подготовка может продлить прогрев; после исправления фактический прогрев обзорных прогонов основной матрицы составил {number(warmup_min)}–{number(warmup_max)} мс. Его массивы и максимумы сохранены в raw JSON. Исходная запись не содержит отдельных массивов прогрева.
- На 3% камера начинается с `(36, 60)`, pan ограничен амплитудой `(100, 15)` CSS px, zoom привязан к центру viewport. Drag идёт по синусоидальному пути с амплитудой 90/50 CSS px через нативный Konva drag и DOM mousemove/mouseup. `startDrag()` вызывается программно: поиск крошечной цели на 3% не входит в FPS этого сценария.
- Во время pan/zoom hit-map приостановлена; стоимость её восстановления после остановки или первого нажатия не входит в устойчивый FPS движения. Её нужно оценивать отдельно от прогретого движения камеры.
- FPS основной матрицы рассчитан по границам количества интервалов rAF с завершённым `Layer.draw` после описанного исключения. Анализируемая длительность, число кадров и границы сохранены в сводном JSON. Это оценка main-thread pacing с явно указанной потерей одного интервала, не измерение задержки физического ввода или GPU presentation.
- Три повтора дают небольшой набор наблюдений, не доверительный интервал. Разброс CPU ×4/×6 и первого кадра может быть немонотонным. Скрипт не округляет raw JSON; таблицы округлены до одного знака.

## Исходные данные и повторение

{source_links}

Сводка: [free-scene-stress-results.json](free-scene-stress-results.json). Генерация и проверка матрицы без запуска браузера:

```sh
python3 scripts/summarize-free-benchmark.py
```

Браузерные измерения доступны в `?nodes=1&benchmark=1` через `window.freeNodes.benchmark.mount()` и `window.freeNodes.benchmark.interact()`. Код таймеров: [freeMount.ts](../src/benchmarks/freeMount.ts), [freeScene.ts](../src/benchmarks/freeScene.ts). Сначала задайте viewport, DPR и CPU throttle, затем загрузите страницу: Konva захватывает pixel ratio при инициализации.
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--phase", choices=("before", "after"), help="Validate one phase while the other is still running.")
    args = parser.parse_args()
    if args.phase and not args.validate_only:
        parser.error("--phase requires --validate-only")
    summaries, sources = load((args.phase,) if args.phase else ("before", "after"))
    if not args.validate_only:
        legacy, legacy_sources = load_legacy()
        clock, clock_sources = load_clock_verification()
        functional, functional_sources = load_functional()
        sources.extend(legacy_sources)
        sources.extend(clock_sources)
        sources.extend(functional_sources)
        output = {
            "baselineSource": "579e7f8",
            "candidateVersion": "0.6.1",
            "date": "2026-10-17",
            "hardware": {"chip": "Apple M5", "logicalCpus": 10, "memoryGiB": 24},
            "browser": {
                "name": "HeadlessChrome",
                "version": "155.0.0.0",
                "platform": "MacIntel",
                "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36",
            },
            "browserViewportCss": {"width": 1600, "height": 1000},
            "stageViewportCss": {"width": 1400, "height": 760},
            "devicePixelRatio": 2,
            "mountRepetitions": 3,
            "overviewInteractionRepetitions": 3,
            "normalInteractionRepetitions": 1,
            "requestedWarmupMs": 1000,
            "requestedInteractionMs": 5000,
            "overviewCamera": {"x": 36, "y": 60, "scale": 0.03},
            "overviewZoomRange": {"min": 0.025, "max": 0.035},
            "overviewPanAmplitudeCss": {"x": 100, "y": 15},
            "normalCamera": {"x": 0, "y": 0, "scale": 1},
            "normalZoomRange": {"min": 0.65, "max": 1.6},
            "normalPanCssPixelsPerSecond": {"x": -240, "y": -120},
            "aggregate": "Median of run metrics; each percentile is nearest rank within its own run. Median bounds are aggregated independently.",
            "fpsMeaning": "Bounds of rAF intervals with completed Konva Layer.draw after dropping the first recorded interval; not GPU presentation",
            "clockCorrection": {
                "reason": "Frozen harness started performance.now timing after the rAF timestamp used for the first interval; cache work could contaminate that interval.",
                "analysisIntervals": "frameIntervalsMs.slice(1), unchanged",
                "analysisDuration": "sum(remaining intervals)",
                "completedDrawIntervalBounds": "[max(0,R-1),min(R,N-1)] where R=raw renderedFrameCount and N=raw frameCount",
                "drawPercentiles": "Whole untrimmed raw draw arrays; per-frame draw alignment was not recorded",
                "rawPreserved": True,
            },
            "sources": sources,
            "summaries": summaries,
            "legacyReference": legacy,
            "correctedClockVerification": clock,
            "functionalChecks": functional,
        }
        (ROOT / "docs/free-scene-stress-results.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
        (ROOT / "docs/free-scene-stress.md").write_text(report(summaries, sources, legacy, clock, functional))
    print(f"Validated {sum(s['rows'] for s in sources)} records in {len(sources)} files; {len(summaries)} scenario summaries.")


if __name__ == "__main__":
    main()
