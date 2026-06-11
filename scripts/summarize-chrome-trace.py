#!/usr/bin/env python3
"""Summarize Chrome DevTools trace-event JSON files.

This intentionally streams the traceEvents array so large traces stay on disk.
It reports aggregate timing evidence useful for diagnosing map rendering jank.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import heapq
import json
import math
import os
import re
from dataclasses import dataclass
from typing import Any, DefaultDict, Iterable


MICROS_PER_MS = 1000.0
FRAME_60HZ_US = 16_667.0
FRAME_30HZ_US = 33_333.0

GROUPS = [
    (
        "paint",
        "Paint / Raster / Composite",
        re.compile(
            r"paint|raster|composite|layer|tile|picture|drawframe|"
            r"submitcompositorframe|activate|commit|viz",
            re.IGNORECASE,
        ),
    ),
    (
        "animation",
        "Animation",
        re.compile(
            r"animation|animate|requestanimationframe|fireanimationframe|"
            r"beginframe|compositoranimation|raf",
            re.IGNORECASE,
        ),
    ),
    (
        "layout_style",
        "Layout / Recalculate Style",
        re.compile(
            r"layout|recalculatestyle|recalculate style|updatelayouttree|"
            r"schedule style|styleinvalidator|style recalc",
            re.IGNORECASE,
        ),
    ),
    (
        "scripting",
        "Scripting / Function / Event Handler",
        re.compile(
            r"functioncall|eventdispatch|evaluatescript|runscript|runtask|"
            r"timerfire|fireanimationframe|requestanimationframe|compile|"
            r"parsehtml|microtask|v8|javascript|jsframe|gc",
            re.IGNORECASE,
        ),
    ),
]

FRAME_NAME_RE = re.compile(
    r"frame|pipeline|dropped|missed|swapbuffers|present", re.IGNORECASE
)
MAIN_THREAD_RE = re.compile(r"crrenderermain|renderermain|mainthread", re.IGNORECASE)
BROWSER_MAIN_RE = re.compile(r"browsermain", re.IGNORECASE)


@dataclass(frozen=True)
class ThreadKey:
    pid: int | str
    tid: int | str


@dataclass
class EventSummary:
    dur_us: float
    ts_us: float | None
    name: str
    cat: str
    thread: ThreadKey
    detail: str


def open_text(path: str):
    if path.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "rt", encoding="utf-8", errors="replace")


def iter_trace_events(path: str, chunk_size: int = 1024 * 1024) -> Iterable[dict[str, Any]]:
    """Yield objects from a traceEvents array without loading the file at once."""
    decoder = json.JSONDecoder()

    with open_text(path) as trace:
        buffer = ""
        pos = 0

        def read_more() -> bool:
            nonlocal buffer
            chunk = trace.read(chunk_size)
            if not chunk:
                return False
            buffer += chunk
            return True

        while True:
            if pos >= len(buffer) and not read_more():
                return
            while pos < len(buffer) and buffer[pos].isspace():
                pos += 1
            if pos < len(buffer):
                break

        if buffer[pos] == "[":
            pos += 1
        else:
            target = '"traceEvents"'
            search_from = pos
            while True:
                found = buffer.find(target, search_from)
                if found != -1:
                    bracket = buffer.find("[", found + len(target))
                    while bracket == -1:
                        if not read_more():
                            raise ValueError("Found traceEvents but not its array start")
                        bracket = buffer.find("[", found + len(target))
                    pos = bracket + 1
                    break

                if not read_more():
                    raise ValueError("Could not find a traceEvents array")

                if len(buffer) > chunk_size * 3:
                    buffer = buffer[-(len(target) + 4096) :]
                    search_from = 0
                else:
                    search_from = max(0, len(buffer) - chunk_size - len(target))

        while True:
            while True:
                if pos >= len(buffer):
                    buffer = ""
                    pos = 0
                    if not read_more():
                        return
                while pos < len(buffer) and (buffer[pos].isspace() or buffer[pos] == ","):
                    pos += 1
                if pos < len(buffer):
                    break

            if buffer[pos] == "]":
                return

            while True:
                try:
                    event, end = decoder.raw_decode(buffer, pos)
                    if isinstance(event, dict):
                        yield event
                    buffer = buffer[end:]
                    pos = 0
                    break
                except json.JSONDecodeError:
                    if pos:
                        buffer = buffer[pos:]
                        pos = 0
                    if not read_more():
                        raise


def as_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def thread_key(event: dict[str, Any]) -> ThreadKey | None:
    pid = event.get("pid")
    tid = event.get("tid")
    if pid is None or tid is None:
        return None
    return ThreadKey(pid=pid, tid=tid)


def event_text(event: dict[str, Any]) -> str:
    return f"{event.get('name', '')} {event.get('cat', '')}"


def matched_groups(event: dict[str, Any]) -> list[str]:
    text = event_text(event)
    return [key for key, _label, pattern in GROUPS if pattern.search(text)]


def ms(us: float | int | None) -> float:
    if us is None:
        return 0.0
    return float(us) / MICROS_PER_MS


def fmt_ms(us: float | int | None) -> str:
    return f"{ms(us):,.1f}"


def pct(numerator: int | float, denominator: int | float) -> str:
    if not denominator:
        return "0.0%"
    return f"{(float(numerator) / float(denominator)) * 100:.1f}%"


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = math.ceil((p / 100.0) * len(ordered)) - 1
    idx = max(0, min(idx, len(ordered) - 1))
    return ordered[idx]


def nested_get(value: Any, path: tuple[str, ...]) -> Any:
    current = value
    for part in path:
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def summarize_args(args: Any) -> str:
    if not isinstance(args, dict):
        return ""

    fields = [
        ("data.type", ("data", "type")),
        ("data.name", ("data", "name")),
        ("data.url", ("data", "url")),
        ("data.scriptName", ("data", "scriptName")),
        ("data.functionName", ("data", "functionName")),
        ("data.lineNumber", ("data", "lineNumber")),
        ("beginData.frame", ("beginData", "frame")),
        ("chrome_frame_reporter.state", ("chrome_frame_reporter", "state")),
    ]

    parts: list[str] = []
    for label, path in fields:
        value = nested_get(args, path)
        if value is None:
            continue
        text = str(value).replace("\n", " ")
        if len(text) > 96:
            text = text[:93] + "..."
        parts.append(f"{label}={text}")

    return "; ".join(parts[:4])


def frame_state(args: Any) -> str | None:
    if not isinstance(args, dict):
        return None
    direct = nested_get(args, ("chrome_frame_reporter", "state"))
    if direct is not None:
        return str(direct)
    data = args.get("data")
    if isinstance(data, dict):
        for key in ("state", "status", "frame_state"):
            if key in data:
                return str(data[key])
    return None


def short_thread_label(
    key: ThreadKey,
    thread_names: dict[ThreadKey, str],
    process_names: dict[int | str, str],
) -> str:
    process = process_names.get(key.pid, f"pid {key.pid}")
    thread = thread_names.get(key, f"tid {key.tid}")
    return f"{process} / {thread} ({key.pid}:{key.tid})"


def push_top(heap: list[tuple[float, int, EventSummary]], event: EventSummary, limit: int) -> None:
    item = (event.dur_us, id(event), event)
    if len(heap) < limit:
        heapq.heappush(heap, item)
    elif event.dur_us > heap[0][0]:
        heapq.heapreplace(heap, item)


def first_pass(path: str) -> dict[str, Any]:
    total_events = 0
    complete_events = 0
    min_ts: float | None = None
    max_ts: float | None = None
    thread_names: dict[ThreadKey, str] = {}
    process_names: dict[int | str, str] = {}
    thread_dur: DefaultDict[ThreadKey, float] = collections.defaultdict(float)

    for event in iter_trace_events(path):
        total_events += 1
        name = str(event.get("name", ""))
        key = thread_key(event)
        phase = event.get("ph")
        args = event.get("args") or {}

        if phase == "M" and key is not None and isinstance(args, dict):
            if name == "thread_name" and "name" in args:
                thread_names[key] = str(args["name"])
            elif name == "process_name" and "name" in args:
                process_names[key.pid] = str(args["name"])

        ts = as_float(event.get("ts"))
        dur = as_float(event.get("dur"))
        if ts is not None and phase != "M":
            min_ts = ts if min_ts is None else min(min_ts, ts)
            max_ts = ts if max_ts is None else max(max_ts, ts + (dur or 0.0))

        if phase == "X" and dur is not None and key is not None:
            complete_events += 1
            thread_dur[key] += dur

    return {
        "total_events": total_events,
        "complete_events": complete_events,
        "min_ts": min_ts,
        "max_ts": max_ts,
        "thread_names": thread_names,
        "process_names": process_names,
        "thread_dur": thread_dur,
    }


def choose_main_threads(
    thread_names: dict[ThreadKey, str],
    thread_dur: dict[ThreadKey, float],
) -> list[ThreadKey]:
    named_renderer = [
        key
        for key, name in thread_names.items()
        if MAIN_THREAD_RE.search(name) and not BROWSER_MAIN_RE.search(name)
    ]
    if named_renderer:
        return sorted(named_renderer, key=lambda key: thread_dur.get(key, 0.0), reverse=True)

    named_any_main = [key for key, name in thread_names.items() if MAIN_THREAD_RE.search(name)]
    if named_any_main:
        return sorted(named_any_main, key=lambda key: thread_dur.get(key, 0.0), reverse=True)

    if thread_dur:
        return [max(thread_dur, key=thread_dur.get)]
    return []


def add_event_self_time(
    events: list[tuple[float, float, str, str, list[str]]],
    self_by_name: collections.Counter[str],
    self_by_group: collections.Counter[str],
) -> None:
    # Parent events usually start at the same timestamp as children but have a
    # longer duration. Sorting longest first for equal starts preserves nesting.
    events.sort(key=lambda item: (item[0], -item[1]))
    stack: list[dict[str, Any]] = []

    def close_until(start: float) -> None:
        while stack and start >= stack[-1]["end"]:
            close_one()

    def close_one() -> None:
        item = stack.pop()
        self_us = max(0.0, item["dur"] - item["child"])
        self_by_name[item["name"]] += self_us
        for group in item["groups"]:
            self_by_group[group] += self_us
        if stack:
            stack[-1]["child"] += item["dur"]

    for start, dur, name, _cat, groups in events:
        end = start + dur
        close_until(start)
        stack.append(
            {
                "start": start,
                "end": end,
                "dur": dur,
                "child": 0.0,
                "name": name,
                "groups": groups,
            }
        )

    while stack:
        close_one()


def analyze(path: str, top_n: int) -> dict[str, Any]:
    first = first_pass(path)
    thread_names = first["thread_names"]
    process_names = first["process_names"]
    main_threads = choose_main_threads(thread_names, first["thread_dur"])
    main_thread_set = set(main_threads)

    total_by_name: collections.Counter[str] = collections.Counter()
    count_by_name: collections.Counter[str] = collections.Counter()
    max_by_name: collections.Counter[str] = collections.Counter()
    group_totals: dict[str, collections.Counter[str]] = {
        key: collections.Counter() for key, _label, _pattern in GROUPS
    }
    group_counts: dict[str, collections.Counter[str]] = {
        key: collections.Counter() for key, _label, _pattern in GROUPS
    }
    main_group_totals: collections.Counter[str] = collections.Counter()
    main_self_by_name: collections.Counter[str] = collections.Counter()
    main_self_by_group: collections.Counter[str] = collections.Counter()
    main_events_by_thread: DefaultDict[
        ThreadKey, list[tuple[float, float, str, str, list[str]]]
    ] = collections.defaultdict(list)
    longest_main: list[tuple[float, int, EventSummary]] = []
    longest_group_events: dict[str, list[tuple[float, int, EventSummary]]] = {
        key: [] for key, _label, _pattern in GROUPS
    }

    frame_counts: collections.Counter[str] = collections.Counter()
    frame_dur_by_name: collections.Counter[str] = collections.Counter()
    frame_timestamps: DefaultDict[str, list[float]] = collections.defaultdict(list)
    pipeline_durations: list[float] = []
    pipeline_states: collections.Counter[str] = collections.Counter()
    dropped_named: collections.Counter[str] = collections.Counter()

    for event in iter_trace_events(path):
        phase = event.get("ph")
        name = str(event.get("name", ""))
        cat = str(event.get("cat", ""))
        key = thread_key(event)
        dur = as_float(event.get("dur"))
        ts = as_float(event.get("ts"))
        groups = matched_groups(event)

        if FRAME_NAME_RE.search(name):
            frame_counts[name] += 1
            if dur is not None:
                frame_dur_by_name[name] += dur
            if ts is not None and len(frame_timestamps[name]) < 20_000:
                frame_timestamps[name].append(ts)
            if re.search(r"dropped|missed", name, re.IGNORECASE):
                dropped_named[name] += 1

        if name == "PipelineReporter":
            state = frame_state(event.get("args"))
            if state:
                pipeline_states[state] += 1
                if re.search(r"drop|miss|partial|no damage", state, re.IGNORECASE):
                    dropped_named[f"PipelineReporter:{state}"] += 1
            if dur is not None:
                pipeline_durations.append(dur)

        if phase != "X" or dur is None:
            continue

        count_by_name[name] += 1
        total_by_name[name] += dur
        max_by_name[name] = max(max_by_name[name], dur)

        event_summary = EventSummary(
            dur_us=dur,
            ts_us=ts,
            name=name,
            cat=cat,
            thread=key or ThreadKey("?", "?"),
            detail=summarize_args(event.get("args")),
        )

        for group in groups:
            group_totals[group][name] += dur
            group_counts[group][name] += 1
            push_top(longest_group_events[group], event_summary, top_n)

        if key in main_thread_set:
            push_top(longest_main, event_summary, top_n)
            for group in groups:
                main_group_totals[group] += dur
            if ts is not None:
                main_events_by_thread[key].append((ts, dur, name, cat, groups))

    for events in main_events_by_thread.values():
        add_event_self_time(events, main_self_by_name, main_self_by_group)

    return {
        **first,
        "main_threads": main_threads,
        "total_by_name": total_by_name,
        "count_by_name": count_by_name,
        "max_by_name": max_by_name,
        "group_totals": group_totals,
        "group_counts": group_counts,
        "main_group_totals": main_group_totals,
        "main_self_by_name": main_self_by_name,
        "main_self_by_group": main_self_by_group,
        "longest_main": sorted(
            (item[2] for item in longest_main), key=lambda item: item.dur_us, reverse=True
        ),
        "longest_group_events": {
            key: sorted(
                (item[2] for item in heap), key=lambda item: item.dur_us, reverse=True
            )
            for key, heap in longest_group_events.items()
        },
        "frame_counts": frame_counts,
        "frame_dur_by_name": frame_dur_by_name,
        "frame_timestamps": frame_timestamps,
        "pipeline_durations": pipeline_durations,
        "pipeline_states": pipeline_states,
        "dropped_named": dropped_named,
    }


def interval_stats(timestamps: list[float]) -> dict[str, Any]:
    if len(timestamps) < 2:
        return {}
    ordered = sorted(timestamps)
    intervals = [
        ordered[index] - ordered[index - 1]
        for index in range(1, len(ordered))
        if ordered[index] > ordered[index - 1]
    ]
    if not intervals:
        return {}
    return {
        "count": len(intervals),
        "median": percentile(intervals, 50),
        "p95": percentile(intervals, 95),
        "max": max(intervals),
        "slow_60hz": sum(1 for value in intervals if value > FRAME_60HZ_US),
        "slow_30hz": sum(1 for value in intervals if value > FRAME_30HZ_US),
    }


def top_rows(counter: collections.Counter[str], counts: collections.Counter[str], limit: int):
    for name, total in counter.most_common(limit):
        yield name, total, counts.get(name, 0)


def render_markdown(path: str, result: dict[str, Any], top_n: int) -> str:
    trace_span = None
    if result["min_ts"] is not None and result["max_ts"] is not None:
        trace_span = result["max_ts"] - result["min_ts"]

    lines: list[str] = []
    lines.append(f"# Chrome Trace Summary: {os.path.basename(path)}")
    lines.append("")
    lines.append("## Scope")
    lines.append("")
    lines.append(f"- Trace file: `{path}`")
    lines.append(f"- File size: {os.path.getsize(path):,} bytes")
    lines.append(f"- Events parsed: {result['total_events']:,}")
    lines.append(f"- Complete-duration events: {result['complete_events']:,}")
    if trace_span is not None:
        lines.append(f"- Active trace time span, excluding metadata: {fmt_ms(trace_span)} ms")
    lines.append("")

    lines.append("## Renderer Main Threads")
    lines.append("")
    if result["main_threads"]:
        for key in result["main_threads"][:8]:
            total = result["thread_dur"].get(key, 0.0)
            lines.append(
                f"- {short_thread_label(key, result['thread_names'], result['process_names'])}: "
                f"{fmt_ms(total)} ms complete-event duration"
            )
    else:
        lines.append("- No renderer main thread metadata found.")
    lines.append("")

    lines.append("## Top Event Names By Total Duration")
    lines.append("")
    lines.append("| Event | Total ms | Count | Max single ms |")
    lines.append("|---|---:|---:|---:|")
    for name, total, count in top_rows(result["total_by_name"], result["count_by_name"], top_n):
        lines.append(f"| `{name}` | {fmt_ms(total)} | {count:,} | {fmt_ms(result['max_by_name'][name])} |")
    lines.append("")

    lines.append("## Longest Individual Renderer Main-Thread Events")
    lines.append("")
    lines.append("| Event | Duration ms | Thread | Detail |")
    lines.append("|---|---:|---|---|")
    for event in result["longest_main"][:top_n]:
        detail = event.detail or ""
        lines.append(
            f"| `{event.name}` | {fmt_ms(event.dur_us)} | "
            f"{short_thread_label(event.thread, result['thread_names'], result['process_names'])} | "
            f"{detail} |"
        )
    lines.append("")

    lines.append("## Focus Areas")
    lines.append("")
    lines.append("| Area | Inclusive total ms | Main-thread inclusive ms | Main-thread self ms | Top names |")
    lines.append("|---|---:|---:|---:|---|")
    for key, label, _pattern in GROUPS:
        inclusive = sum(result["group_totals"][key].values())
        main_inclusive = result["main_group_totals"][key]
        main_self = result["main_self_by_group"][key]
        names = ", ".join(f"`{name}`" for name, _total in result["group_totals"][key].most_common(5))
        lines.append(
            f"| {label} | {fmt_ms(inclusive)} | {fmt_ms(main_inclusive)} | "
            f"{fmt_ms(main_self)} | {names} |"
        )
    lines.append("")

    for key, label, _pattern in GROUPS:
        lines.append(f"### {label}")
        lines.append("")
        lines.append("| Event | Total ms | Count |")
        lines.append("|---|---:|---:|")
        for name, total, count in top_rows(result["group_totals"][key], result["group_counts"][key], 10):
            lines.append(f"| `{name}` | {fmt_ms(total)} | {count:,} |")
        lines.append("")

        if result["longest_group_events"][key]:
            lines.append("Longest matching events:")
            lines.append("")
            lines.append("| Event | Duration ms | Thread | Detail |")
            lines.append("|---|---:|---|---|")
            for event in result["longest_group_events"][key][:5]:
                lines.append(
                    f"| `{event.name}` | {fmt_ms(event.dur_us)} | "
                    f"{short_thread_label(event.thread, result['thread_names'], result['process_names'])} | "
                    f"{event.detail or ''} |"
                )
            lines.append("")

    lines.append("## Frame Timing / Slow Frames")
    lines.append("")
    pipeline_durations = result["pipeline_durations"]
    if pipeline_durations:
        slow_60 = sum(1 for value in pipeline_durations if value > FRAME_60HZ_US)
        slow_30 = sum(1 for value in pipeline_durations if value > FRAME_30HZ_US)
        lines.append(
            f"- `PipelineReporter` events: {len(pipeline_durations):,}; "
            f"median {fmt_ms(percentile(pipeline_durations, 50))} ms; "
            f"p95 {fmt_ms(percentile(pipeline_durations, 95))} ms; "
            f"max {fmt_ms(max(pipeline_durations))} ms."
        )
        lines.append(
            f"- Pipeline durations over 16.7 ms: {slow_60:,} "
            f"({pct(slow_60, len(pipeline_durations))}); over 33.3 ms: {slow_30:,} "
            f"({pct(slow_30, len(pipeline_durations))})."
        )
    else:
        lines.append("- No `PipelineReporter` duration events were found.")

    if result["pipeline_states"]:
        states = ", ".join(
            f"`{state}` {count:,}" for state, count in result["pipeline_states"].most_common(8)
        )
        lines.append(f"- Pipeline states: {states}.")

    if result["dropped_named"]:
        drops = ", ".join(
            f"`{name}` {count:,}" for name, count in result["dropped_named"].most_common(10)
        )
        lines.append(f"- Dropped/missed-frame indicators: {drops}.")
    else:
        lines.append("- No explicit dropped/missed-frame event names or pipeline states were found.")

    frame_source = None
    for candidate in ("PipelineReporter", "DrawFrame", "BeginFrame", "RequestMainThreadFrame"):
        if candidate in result["frame_timestamps"] and len(result["frame_timestamps"][candidate]) > 1:
            frame_source = candidate
            break
    if frame_source is None and result["frame_timestamps"]:
        frame_source = max(result["frame_timestamps"], key=lambda name: len(result["frame_timestamps"][name]))
    if frame_source is not None:
        stats = interval_stats(result["frame_timestamps"][frame_source])
        if stats:
            lines.append(
                f"- `{frame_source}` timestamp intervals: {stats['count']:,}; "
                f"median {fmt_ms(stats['median'])} ms; p95 {fmt_ms(stats['p95'])} ms; "
                f"max {fmt_ms(stats['max'])} ms; intervals over 16.7 ms "
                f"{stats['slow_60hz']:,}; over 33.3 ms {stats['slow_30hz']:,}."
            )

    lines.append("")
    lines.append("Top frame-related names:")
    lines.append("")
    lines.append("| Event | Count | Total ms |")
    lines.append("|---|---:|---:|")
    for name, count in result["frame_counts"].most_common(15):
        lines.append(f"| `{name}` | {count:,} | {fmt_ms(result['frame_dur_by_name'][name])} |")
    lines.append("")

    paint_total = sum(result["group_totals"]["paint"].values())
    animation_total = sum(result["group_totals"]["animation"].values())
    layout_self = result["main_self_by_group"]["layout_style"]
    script_self = result["main_self_by_group"]["scripting"]
    paint_main_self = result["main_self_by_group"]["paint"]
    animation_main_self = result["main_self_by_group"]["animation"]

    lines.append("## Interpretation")
    lines.append("")
    lines.append(
        "- Group totals are inclusive and can overlap. Main-thread self time removes nested child "
        "events and is better for judging whether JavaScript/layout is occupying the renderer main thread."
    )
    if paint_total > max(script_self * 3, layout_self * 3, 1.0):
        lines.append(
            "- The trace leans toward paint/raster/compositing pressure: paint/raster/composite "
            f"inclusive time is {fmt_ms(paint_total)} ms, while renderer main-thread scripting self "
            f"time is {fmt_ms(script_self)} ms and layout/style self time is {fmt_ms(layout_self)} ms."
        )
    elif script_self > max(paint_main_self, layout_self) * 1.5:
        lines.append(
            "- The trace leans toward JavaScript/event-handler pressure on the renderer main thread: "
            f"scripting self time is {fmt_ms(script_self)} ms, versus paint self "
            f"{fmt_ms(paint_main_self)} ms and layout/style self {fmt_ms(layout_self)} ms."
        )
    elif layout_self > max(script_self, paint_main_self) * 1.5:
        lines.append(
            "- The trace leans toward layout/style pressure on the renderer main thread: "
            f"layout/style self time is {fmt_ms(layout_self)} ms, versus scripting self "
            f"{fmt_ms(script_self)} ms and paint self {fmt_ms(paint_main_self)} ms."
        )
    else:
        lines.append(
            "- The trace is mixed rather than dominated by one renderer-main-thread category: "
            f"scripting self {fmt_ms(script_self)} ms, layout/style self {fmt_ms(layout_self)} ms, "
            f"paint self {fmt_ms(paint_main_self)} ms, animation self {fmt_ms(animation_main_self)} ms."
        )

    if animation_total > 0:
        lines.append(
            "- Animation-related activity is present and should be read alongside paint/raster/composite "
            f"work, because animation ticks commonly drive layer updates and frame production. "
            f"Animation inclusive time: {fmt_ms(animation_total)} ms."
        )

    if pipeline_durations:
        slow_60 = sum(1 for value in pipeline_durations if value > FRAME_60HZ_US)
        if slow_60:
            lines.append(
                f"- Slow frame evidence is present: {slow_60:,} of {len(pipeline_durations):,} "
                "`PipelineReporter` durations exceed 16.7 ms."
            )
        else:
            lines.append("- `PipelineReporter` durations do not show frames exceeding 16.7 ms.")

    lines.append("")
    lines.append("## Recommendation")
    lines.append("")
    significant_paint = paint_total > 1_000_000.0 or paint_main_self > 1_000_000.0
    if paint_total > max(script_self * 2, layout_self * 2, 1.0):
        lines.append(
            "Proceed with the mobile raster-base-map architecture. This trace points more toward "
            "SVG paint/raster/compositing and animation-driven frame production than toward a "
            "JavaScript or layout bottleneck. Keep the interactive alert overlays as lightweight SVG "
            "or HTML layers above the raster base, and avoid animating the full detailed SVG during "
            "pinch/drag on mobile."
        )
    elif significant_paint and animation_total > 0:
        lines.append(
            "Proceed with a mobile-only raster-base-map architecture, but treat it as a targeted "
            "paint/raster reduction rather than the complete fix. This trace still shows meaningful "
            "renderer main-thread scripting and layout/style work, so pair the raster base with "
            "lighter map overlay animation during mobile pan/scroll gestures and re-trace the same "
            "Pixel gesture after the change."
        )
    else:
        lines.append(
            "Do not treat rasterization as the only fix yet. This trace does not clearly isolate "
            "paint/raster/compositing above renderer-main-thread scripting or layout. First reduce "
            "the dominant main-thread category identified above, then re-trace the same mobile gesture."
        )

    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trace", help="Path to a Chrome DevTools trace JSON or JSON.GZ file")
    parser.add_argument("--top", type=int, default=15, help="Rows to include in top tables")
    parser.add_argument("--output", help="Write markdown report to this path")
    args = parser.parse_args()

    result = analyze(args.trace, args.top)
    markdown = render_markdown(args.trace, result, args.top)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as report:
            report.write(markdown)
    else:
        print(markdown)


if __name__ == "__main__":
    main()
