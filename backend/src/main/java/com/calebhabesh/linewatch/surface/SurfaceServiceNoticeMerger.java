package com.calebhabesh.linewatch.surface;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * TTC publishes some surface alerts in both its Live Alerts JSON (source ID {@code 80209}) and
 * its GTFS-RT alert feeds (source ID {@code gtfsrt-80209}) under the same alert ID. Each copy
 * normalized to its own notice, so a stop panel listed every such detour twice (Nov 13, 2026:
 * six cards for three detours at Runnymede Rd and St Clair Ave West).
 *
 * <p>When both copies of one alert ID are in the same poll and share a route, one notice is kept:
 * the GTFS-RT copy, whose title names the route and whose stops are GTFS stop IDs the map can
 * target, filled in from the Live copy where it is blank (direction, description, URL, end time,
 * stops). The Live copy is dropped from the poll, so its stored row deactivates like any notice
 * that left the feed.
 */
public final class SurfaceServiceNoticeMerger {
    private static final String GTFS_RT_PREFIX = "gtfsrt-";

    private SurfaceServiceNoticeMerger() {}

    public static List<SurfaceServiceNotice> merge(List<SurfaceServiceNotice> notices) {
        Map<String, SurfaceServiceNotice> liveBySourceId = new HashMap<>();
        for (SurfaceServiceNotice notice : notices) {
            if (notice.sourceId() != null && !notice.sourceId().startsWith(GTFS_RT_PREFIX)) {
                liveBySourceId.putIfAbsent(notice.sourceId(), notice);
            }
        }
        Set<String> mergedLiveSourceIds = new LinkedHashSet<>();
        Map<String, SurfaceServiceNotice> mergedGtfsRt = new HashMap<>();
        for (SurfaceServiceNotice notice : notices) {
            if (notice.sourceId() == null || !notice.sourceId().startsWith(GTFS_RT_PREFIX)) continue;
            SurfaceServiceNotice live = liveBySourceId.get(notice.sourceId().substring(GTFS_RT_PREFIX.length()));
            if (live == null || !shareRoute(live, notice)) continue;
            mergedLiveSourceIds.add(live.sourceId());
            mergedGtfsRt.put(notice.sourceId(), fill(notice, live));
        }
        if (mergedLiveSourceIds.isEmpty()) return notices;

        List<SurfaceServiceNotice> result = new ArrayList<>(notices.size() - mergedLiveSourceIds.size());
        for (SurfaceServiceNotice notice : notices) {
            if (mergedLiveSourceIds.contains(notice.sourceId())) continue;
            result.add(mergedGtfsRt.getOrDefault(notice.sourceId(), notice));
        }
        return result;
    }

    private static boolean shareRoute(SurfaceServiceNotice first, SurfaceServiceNotice second) {
        if (first.routeIds() == null || second.routeIds() == null) return false;
        return first.routeIds().stream().anyMatch(second.routeIds()::contains);
    }

    private static SurfaceServiceNotice fill(SurfaceServiceNotice gtfsRt, SurfaceServiceNotice live) {
        Set<String> routeIds = new LinkedHashSet<>(gtfsRt.routeIds());
        routeIds.addAll(live.routeIds());
        return new SurfaceServiceNotice(
            gtfsRt.id(),
            gtfsRt.sourceId(),
            gtfsRt.category(),
            firstNonBlank(gtfsRt.routeType(), live.routeType()),
            gtfsRt.title(),
            longer(gtfsRt.description(), live.description()),
            firstNonBlank(gtfsRt.headerText(), live.headerText()),
            firstNonBlank(gtfsRt.url(), live.url()),
            gtfsRt.effect(),
            gtfsRt.effectDescription(),
            firstNonBlank(gtfsRt.direction(), live.direction()),
            firstNonBlank(gtfsRt.cause(), live.cause()),
            firstNonBlank(gtfsRt.causeDescription(), live.causeDescription()),
            gtfsRt.activePeriodStart() != null ? gtfsRt.activePeriodStart() : live.activePeriodStart(),
            gtfsRt.activePeriodEnd() != null ? gtfsRt.activePeriodEnd() : live.activePeriodEnd(),
            gtfsRt.sourceUpdatedAt(),
            gtfsRt.active(),
            gtfsRt.rawPayload(),
            List.copyOf(routeIds),
            gtfsRt.stops() == null || gtfsRt.stops().isEmpty() ? live.stops() : gtfsRt.stops(),
            SurfaceServiceNotice.SERVICE_ALERT.equals(gtfsRt.alertClass()) || SurfaceServiceNotice.SERVICE_ALERT.equals(live.alertClass())
                ? SurfaceServiceNotice.SERVICE_ALERT
                : gtfsRt.alertClass()
        );
    }

    private static String firstNonBlank(String first, String second) {
        return first != null && !first.isBlank() ? first : second;
    }

    private static String longer(String first, String second) {
        String a = first == null ? "" : first;
        String b = second == null ? "" : second;
        return b.length() > a.length() ? b : a;
    }
}
