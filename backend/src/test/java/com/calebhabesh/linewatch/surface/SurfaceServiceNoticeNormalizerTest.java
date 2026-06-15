package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.ingestion.TtcAlertActivePeriod;
import com.calebhabesh.linewatch.ingestion.TtcAlertRecord;
import com.calebhabesh.linewatch.ingestion.TtcFetchedRecord;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SurfaceServiceNoticeNormalizerTest {
    private final SurfaceServiceNoticeNormalizer normalizer = new SurfaceServiceNoticeNormalizer();

    private TtcFetchedRecord fetched(TtcAlertRecord record) {
        return new TtcFetchedRecord(record, "{}");
    }

    private TtcAlertRecord createRecord(
        String id, String route, String routeType, String title, String description,
        String headerText, String url, String effect, String effectDesc, List<String> stopIDList, String stopStart, String stopEnd
    ) {
        // This explicitly invokes the 31-parameter canonical constructor
        return new TtcAlertRecord(
            id, "Live", OffsetDateTime.now(), null, List.of("Current"),
            route, routeType, stopStart, stopEnd, stopIDList,
            title, description, headerText, url, effect, effectDesc,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, List.of()
        );
    }

    @Test
    void bypassFixtureWithRoute509AndStop13366NormalizesToBypass() {
        TtcAlertRecord record = createRecord(
            "69991", "509", "Streetcar", "Streetcars are not stopping at Exhibition Loop...", "", "", null,
            "BYPASS", "Bypass", List.of("13366"), "Exhibition Loop", null
        );

        Optional<SurfaceServiceNotice> noticeOpt = normalizer.normalize(fetched(record));

        assertThat(noticeOpt).isPresent();
        SurfaceServiceNotice notice = noticeOpt.get();
        assertThat(notice.category()).isEqualTo("bypass");
        assertThat(notice.routeIds()).containsExactly("509");
        assertThat(notice.stops()).hasSize(1);
        assertThat(notice.stops().get(0).stopId()).isEqualTo("13366");
    }

    @Test
    void modifiedServiceRouteChangeFixtureWithRoute88AndUrlNormalizesToServiceChange() {
        TtcAlertRecord record = createRecord(
            "69980", "88", "Bus", "Title", "", "", "http://ttc.ca/details",
            "MODIFIED_SERVICE", "Modified service", List.of(), null, null
        );

        Optional<SurfaceServiceNotice> noticeOpt = normalizer.normalize(fetched(record));

        assertThat(noticeOpt).isPresent();
        SurfaceServiceNotice notice = noticeOpt.get();
        assertThat(notice.category()).isEqualTo("service-change");
        assertThat(notice.routeIds()).containsExactly("88");
        assertThat(notice.url()).isEqualTo("http://ttc.ca/details");
    }

    @Test
    void gtfsRtEpochTimesRemainInstantValues() {
        OffsetDateTime gtfsStart = OffsetDateTime.parse("2026-03-15T04:00:00Z");
        OffsetDateTime gtfsUpdated = OffsetDateTime.parse("2026-06-09T14:40:43Z");
        TtcAlertRecord record = new TtcAlertRecord(
            "gtfsrt-100", "GTFS-RT", gtfsUpdated, new TtcAlertActivePeriod(gtfsStart, null),
            List.of("Current"), "88", "Bus", null, null, List.of(),
            "88 South Leaside - Route change", "", "88 South Leaside - Route change", "http://ttc.ca/details",
            "MODIFIED_SERVICE", "Modified Service", null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, List.of()
        );

        Optional<SurfaceServiceNotice> noticeOpt = normalizer.normalize(fetched(record));

        assertThat(noticeOpt).isPresent();
        assertThat(noticeOpt.get().activePeriodStart()).isEqualTo(gtfsStart);
        assertThat(noticeOpt.get().sourceUpdatedAt()).isEqualTo(gtfsUpdated);
    }

    @Test
    void subwayLrtRecordsAreIgnored() {
        TtcAlertRecord record = createRecord(
            "synthetic-planned-line-1", "1", "Subway", "Subway title", "", "", null,
            "NO_SERVICE", "No Service", List.of("St Clair", "Davisville"), "St Clair", "Davisville"
        );

        Optional<SurfaceServiceNotice> noticeOpt = normalizer.normalize(fetched(record));
        assertThat(noticeOpt).isEmpty();
    }

    @Test
    void accessibilityRecordsAreIgnored() {
        TtcAlertRecord record = new TtcAlertRecord(
            "69283", "Live", OffsetDateTime.now(), null, List.of("Current"),
            null, "Elevator", null, null, List.of(), "Elevator out of service", "", "",
            null, "ACCESSIBILITY_ISSUE", "Out of service", null, null, null, null, null,
            null, null, null, null, null, null, "TEST-E1", null, List.of()
        );

        Optional<SurfaceServiceNotice> noticeOpt = normalizer.normalize(fetched(record));
        assertThat(noticeOpt).isEmpty();
    }
}
