package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class SurfaceServiceNoticeMergerTest {
    private static final OffsetDateTime STARTED = OffsetDateTime.parse("2026-11-13T14:16:21Z");
    private static final OffsetDateTime POLLED = OffsetDateTime.parse("2026-11-13T17:56:34Z");

    // Nov 13, 2026: TTC alert 80209 arrived in both feeds and showed as two cards.
    private static SurfaceServiceNotice gtfsRt(String id, String route, String title, String stopId) {
        return new SurfaceServiceNotice(
            "ttc-surface-gtfsrt-" + id, "gtfsrt-" + id, "detour", "Bus", title, "", "", "",
            "DETOUR", "Detour", null, "CONSTRUCTION", "Construction", STARTED, null, POLLED, true, "entity {}",
            List.of(route), List.of(new SurfaceServiceNotice.StopDetail(stopId, stopId)),
            SurfaceServiceNotice.SERVICE_ALERT
        );
    }

    private static SurfaceServiceNotice live(String id, String route, String title, String direction) {
        String stop = "Runnymede Rd at St Clair Ave West South Side";
        return new SurfaceServiceNotice(
            "ttc-surface-" + id, id, "detour", "Bus", title, "", title, "https://www.ttc.ca/detours",
            "DETOUR", "Detour", direction, "CONSTRUCTION", "Construction", STARTED, null, STARTED, true, "{}",
            List.of(route), List.of(new SurfaceServiceNotice.StopDetail(stop, stop)),
            SurfaceServiceNotice.SERVICE_ADVISORY
        );
    }

    @Test
    void keepsOneNoticePerAlertPublishedInBothFeeds() {
        var feedGtfs = gtfsRt("80209", "71",
            "71 Runnymede: Detour southbound via Castleton Ave and Liverpool St due to construction.", "7069");
        var feedLive = live("80209", "71",
            "Detour southbound via Castleton Ave and Liverpool St due to construction.", "Southbound");
        var otherRoute = gtfsRt("80205", "79",
            "79 Scarlett Rd: Detour southbound via Castleton Ave and Liverpool St due to construction.", "7069");

        List<SurfaceServiceNotice> merged = SurfaceServiceNoticeMerger.merge(List.of(feedGtfs, feedLive, otherRoute));

        assertThat(merged).extracting(SurfaceServiceNotice::sourceId).containsExactly("gtfsrt-80209", "gtfsrt-80205");
        SurfaceServiceNotice kept = merged.getFirst();
        assertThat(kept.title()).startsWith("71 Runnymede: ");
        assertThat(kept.stops()).extracting(SurfaceServiceNotice.StopDetail::stopId).containsExactly("7069");
        assertThat(kept.direction()).isEqualTo("Southbound");
        assertThat(kept.url()).isEqualTo("https://www.ttc.ca/detours");
        assertThat(kept.alertClass()).isEqualTo(SurfaceServiceNotice.SERVICE_ALERT);
    }

    @Test
    void leavesSameIdOnDifferentRoutesAndUnpairedNoticesAlone() {
        var feedGtfs = gtfsRt("1", "71", "71 Runnymede: Detour", "7069");
        var unrelatedLive = live("1", "505", "Detour", null);
        var liveOnly = live("2", "29", "29 Dufferin: Detour", null);

        assertThat(SurfaceServiceNoticeMerger.merge(List.of(feedGtfs, unrelatedLive, liveOnly)))
            .extracting(SurfaceServiceNotice::sourceId)
            .containsExactly("gtfsrt-1", "1", "2");
    }
}
