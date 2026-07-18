package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class AlertDashboardServiceTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );

    private final AlertRepository alertRepository = mock(AlertRepository.class);
    private final LineSegmentRepository lineSegmentRepository = mock(LineSegmentRepository.class);
    private final IngestionFreshness ingestionFreshness = mock(IngestionFreshness.class);
    private final AlertActivePeriodRepository alertActivePeriodRepository = mock(AlertActivePeriodRepository.class);
    private final com.calebhabesh.linewatch.ingestion.TtcAlertStore ttcAlertStore = mock(com.calebhabesh.linewatch.ingestion.TtcAlertStore.class);
    private final AlertDashboardService service = new AlertDashboardService(
        alertRepository,
        lineSegmentRepository,
        new AlertSegmentMatcher(),
        new ReducedSpeedZoneProjector(new AlertSegmentMatcher(), new com.calebhabesh.linewatch.ingestion.AlertDirectionParser()),
        ingestionFreshness,
        alertActivePeriodRepository,
        ttcAlertStore,
        CLOCK
    );

    @Test
    void activeAlertsUseNormalizedActiveAlertTypeAndMatchedSegments() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity alert = alert(
            "ttc-route-100",
            "active-alert",
            "suspension",
            "No service",
            "No subway service between Kipling and Ossington.",
            "kipling",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            "shuttle-bus"
        );
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(alert));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-kipling-jane", "line-2", "kipling", "jane", 10),
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 20)
        ));

        List<AlertDashboardService.ActiveAlertDto> alerts = service.activeAlerts();

        assertThat(alerts).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("ttc-route-100");
            assertThat(dto.lineId()).isEqualTo("line-2");
            assertThat(dto.lineNumber()).isEqualTo("2");
            assertThat(dto.severity()).isEqualTo("suspension");
            assertThat(dto.location()).isEqualTo("Kipling to Ossington");
            assertThat(dto.startedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:45:00Z"));
            assertThat(dto.updatedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:50:00Z"));
            assertThat(dto.affectedSegmentIds()).containsExactly(
                "line-2-kipling-jane",
                "line-2-jane-ossington"
            );
            assertThat(dto.shuttle()).isTrue();
            assertThat(dto.source()).isEqualTo("TTC Live Alert");
        });
    }

    @Test
    void gtfsRtBackedAlertDtosUseAccurateSourceAndMappedLineTwoSegments() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity suspension = alert(
            "ttc-route-gtfsrt-70483",
            "active-alert",
            "suspension",
            "Line 2 Bloor-Danforth: No service between Jane and Islington stations",
            "at Old Mill Station.",
            "islington",
            "jane",
            OffsetDateTime.parse("2026-06-19T04:28:52Z"),
            null
        );
        AlertEntity delay = alert(
            "ttc-route-gtfsrt-delay",
            "active-alert",
            "delay",
            "Line 2 delays",
            "Delays between Old Mill and Jane.",
            "old-mill",
            "jane",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        );
        ReflectionTestUtils.setField(delay, "impactKind", "delay");
        AlertEntity reducedSpeedZone = alert(
            "ttc-route-gtfsrt-rsz",
            "active-alert",
            "delay",
            "Reduced Speed Zone",
            "Reduced speeds between Royal York and Old Mill.",
            "royal-york",
            "old-mill",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            null
        );
        ReflectionTestUtils.setField(
            reducedSpeedZone,
            "impactKind",
            "reduced-speed-zone"
        );
        AlertEntity planned = alert(
            "ttc-route-gtfsrt-planned",
            "planned-closure",
            "planned",
            "Weekend closure",
            "No service between Islington and Jane.",
            "islington",
            "jane",
            OffsetDateTime.parse("2026-06-01T11:40:00Z"),
            null
        );
        ReflectionTestUtils.setField(
            planned,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-06T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            planned,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-08T09:00:00Z")
        );
        for (AlertEntity alert : List.of(suspension, delay, reducedSpeedZone, planned)) {
            ReflectionTestUtils.setField(alert, "sourceAlertType", "GTFS-RT");
        }

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(suspension, delay, reducedSpeedZone));
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(planned));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment(
                "line-2-islington-royal-york",
                "line-2",
                "islington",
                "royal-york",
                301
            ),
            segment(
                "line-2-royal-york-old-mill",
                "line-2",
                "royal-york",
                "old-mill",
                302
            ),
            segment(
                "line-2-old-mill-jane",
                "line-2",
                "old-mill",
                "jane",
                303
            )
        ));

        assertThat(service.activeAlerts()).singleElement().satisfies(dto -> {
            assertThat(dto.source()).isEqualTo("TTC GTFS-RT");
            assertThat(dto.affectedSegmentIds()).containsExactly(
                "line-2-islington-royal-york",
                "line-2-royal-york-old-mill",
                "line-2-old-mill-jane"
            );
        });
        assertThat(service.delays()).singleElement()
            .extracting(AlertDashboardService.DelayAlertDto::source)
            .isEqualTo("TTC GTFS-RT");
        assertThat(service.reducedSpeedZones()).singleElement()
            .extracting(AlertDashboardService.ReducedSpeedZoneDto::source)
            .isEqualTo("TTC GTFS-RT");
        assertThat(service.plannedClosures()).singleElement()
            .extracting(AlertDashboardService.PlannedClosureDto::source)
            .isEqualTo("TTC GTFS-RT");
    }

    @Test
    void activeAlertsPreserveSourceActivePeriodStartWhenItIsOlderThanUpdate() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime sourceUpdatedAt = OffsetDateTime.parse("2026-06-01T22:15:00Z");
        OffsetDateTime sourceStartedAt = OffsetDateTime.parse("2026-06-01T09:11:00Z");
        AlertEntity alert = alert(
            "ttc-route-overnight-start",
            "active-alert",
            "suspension",
            "No service",
            "No subway service between Broadview and Woodbine.",
            "broadview",
            "woodbine",
            sourceUpdatedAt,
            null
        );
        ReflectionTestUtils.setField(alert, "activePeriodStart", sourceStartedAt);
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(alert));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-broadview-woodbine", "line-2", "broadview", "woodbine", 10)
        ));

        List<AlertDashboardService.ActiveAlertDto> alerts = service.activeAlerts();

        assertThat(alerts).singleElement().satisfies(dto -> {
            assertThat(dto.startedAt()).isEqualTo(sourceStartedAt);
            assertThat(dto.updatedAt()).isEqualTo(sourceUpdatedAt);
        });
    }

    @Test
    void activeAlertsPreserveSourceUpdatedTimeWhenDashboardPollTimeIsNewer() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime sourceUpdatedAt = OffsetDateTime.parse("2026-06-01T09:11:00Z");
        OffsetDateTime dashboardUpdatedAt = OffsetDateTime.parse("2026-06-01T22:15:00Z");
        AlertEntity alert = alert(
            "ttc-route-stale-source-update",
            "active-alert",
            "suspension",
            "No service",
            "No subway service between Broadview and Woodbine.",
            "broadview",
            "woodbine",
            sourceUpdatedAt,
            null
        );
        ReflectionTestUtils.setField(alert, "activePeriodStart", sourceUpdatedAt);
        ReflectionTestUtils.setField(alert, "updatedAt", dashboardUpdatedAt);
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(alert));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-broadview-woodbine", "line-2", "broadview", "woodbine", 10)
        ));

        List<AlertDashboardService.ActiveAlertDto> alerts = service.activeAlerts();

        assertThat(alerts).singleElement().satisfies(dto -> {
            assertThat(dto.startedAt()).isEqualTo(sourceUpdatedAt);
            assertThat(dto.updatedAt()).isEqualTo(sourceUpdatedAt);
        });
    }

    @Test
    void activeAlertsExcludeSlowdowns() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity delay = alert(
            "ttc-route-delay",
            "active-alert",
            "delay",
            "Reduced speed",
            "Trains are moving slower than usual.",
            "jane",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:55:00Z"),
            null
        );
        AlertEntity suspension = alert(
            "ttc-route-suspension",
            "active-alert",
            "suspension",
            "No service",
            "No service between Jane and Ossington.",
            "jane",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:56:00Z"),
            null
        );
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(delay, suspension));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 10)
        ));

        List<AlertDashboardService.ActiveAlertDto> alerts = service.activeAlerts();

        assertThat(alerts).extracting(AlertDashboardService.ActiveAlertDto::id)
            .containsExactly("ttc-route-suspension");
    }

    @Test
    void delayCardsAreSeparateFromReducedSpeedZonesAndExposePreciseMetadata() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime delayStartedAt = OffsetDateTime.parse("2026-06-01T22:15:00-04:00");
        OffsetDateTime delayUpdatedAt = OffsetDateTime.parse("2026-06-01T22:39:00-04:00");
        AlertEntity delay = withLine(alert(
            "delay-line-4",
            "active-alert",
            "delay",
            "Delay",
            "Delays between Sheppard-Yonge and Don Mills.",
            "sheppard-yonge",
            "don-mills",
            delayUpdatedAt,
            null
        ), "line-4", "4");
        ReflectionTestUtils.setField(delay, "impactKind", "delay");
        ReflectionTestUtils.setField(delay, "activePeriodStart", delayStartedAt);
        ReflectionTestUtils.setField(delay, "causeDescription", "Signal issue");

        OffsetDateTime rszStartedAt = OffsetDateTime.parse("2026-06-01T21:45:00-04:00");
        OffsetDateTime rszUpdatedAt = OffsetDateTime.parse("2026-06-01T22:20:00-04:00");
        AlertEntity rsz = withLine(alert(
            "rsz-line-1",
            "active-alert",
            "delay",
            "Reduced Speed Zone",
            "Reduced speed zone between Dupont and St Clair West.",
            "dupont",
            "st-clair-west",
            rszUpdatedAt,
            null
        ), "line-1", "1");
        ReflectionTestUtils.setField(rsz, "impactKind", "reduced-speed-zone");
        ReflectionTestUtils.setField(rsz, "activePeriodStart", rszStartedAt);
        ReflectionTestUtils.setField(rsz, "causeDescription", "Track maintenance");
        ReflectionTestUtils.setField(rsz, "targetRemoval", "June 8");
        ReflectionTestUtils.setField(rsz, "rszLength", "600 metres");
        ReflectionTestUtils.setField(rsz, "stationDistance", "900 metres");
        ReflectionTestUtils.setField(rsz, "trackPercent", "67%");
        ReflectionTestUtils.setField(rsz, "reducedSpeed", "15 km/h");
        ReflectionTestUtils.setField(rsz, "averageSpeed", "35 km/h");

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(delay, rsz));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-4-sheppard-yonge-don-mills", "line-4", "sheppard-yonge", "don-mills", 10, "eastbound"),
            segment("line-1-dupont-st-clair-west", "line-1", "dupont", "st-clair-west", 20, "northbound")
        ));

        assertThat(service.delays()).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("delay-line-4");
            assertThat(dto.lineId()).isEqualTo("line-4");
            assertThat(dto.lineNumber()).isEqualTo("4");
            assertThat(dto.location()).isEqualTo("Sheppard-Yonge to Don Mills");
            assertThat(dto.startedAt()).isEqualTo(delayStartedAt);
            assertThat(dto.updatedAt()).isEqualTo(delayUpdatedAt);
            assertThat(dto.affectedSegmentIds())
                .containsExactly("line-4-sheppard-yonge-don-mills");
            assertThat(dto.source()).isEqualTo("TTC Live Alert");
            assertThat(dto.cause()).isEqualTo("Signal issue");
        });

        assertThat(service.reducedSpeedZones()).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("reduced-speed-zone-rsz-line-1");
            assertThat(dto.lineId()).isEqualTo("line-1");
            assertThat(dto.lineNumber()).isEqualTo("1");
            assertThat(dto.startedAt()).isEqualTo(rszStartedAt);
            assertThat(dto.updatedAt()).isEqualTo(rszUpdatedAt);
            assertThat(dto.cause()).isEqualTo("Track maintenance");
            assertThat(dto.resolution()).isEqualTo("June 8");
            assertThat(dto.rszLength()).isEqualTo("600 metres");
            assertThat(dto.stationDistance()).isEqualTo("900 metres");
            assertThat(dto.trackPercent()).isEqualTo("67%");
            assertThat(dto.reducedSpeed()).isEqualTo("15 km/h");
            assertThat(dto.averageSpeed()).isEqualTo("35 km/h");
        });
    }

    @Test
    void delayCardsPreserveSourceActivePeriodStartWhenItIsOlderThanUpdate() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime sourceUpdatedAt = OffsetDateTime.parse("2026-06-01T22:15:00Z");
        OffsetDateTime sourceStartedAt = OffsetDateTime.parse("2026-06-01T09:11:00Z");
        AlertEntity delay = alert(
            "ttc-route-delay-service-window",
            "active-alert",
            "delay",
            "Delay",
            "Delays westbound at Keele station while we respond to an emergency alarm.",
            "keele",
            "keele",
            sourceUpdatedAt,
            null
        );
        ReflectionTestUtils.setField(delay, "impactKind", "delay");
        ReflectionTestUtils.setField(delay, "activePeriodStart", sourceStartedAt);
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(delay));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());

        List<AlertDashboardService.DelayAlertDto> delays = service.delays();

        assertThat(delays).singleElement().satisfies(dto -> {
            assertThat(dto.startedAt()).isEqualTo(sourceStartedAt);
            assertThat(dto.updatedAt()).isEqualTo(sourceUpdatedAt);
        });
    }

    @Test
    void reducedSpeedZonesGroupOpposingSourceAlertsAndExposeDirectionalDetails() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity northbound = withLine(alert(
            "ttc-route-north", "active-alert", "delay", "Reduced speed",
            "Northbound trains are moving slowly.", "yorkdale", "wilson",
            OffsetDateTime.parse("2026-06-01T11:55:00Z"), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(northbound, "direction", "northbound");
        ReflectionTestUtils.setField(northbound, "impactKind", "reduced-speed-zone");
        ReflectionTestUtils.setField(northbound, "activePeriodStart", OffsetDateTime.parse("2026-06-01T11:30:00Z"));
        ReflectionTestUtils.setField(northbound, "causeDescription", "Track issue");
        ReflectionTestUtils.setField(northbound, "targetRemoval", "Mid-June");
        ReflectionTestUtils.setField(northbound, "rszLength", "300 metres");
        ReflectionTestUtils.setField(northbound, "averageSpeed", "35 km/h");
        AlertEntity southbound = withLine(alert(
            "ttc-route-south", "active-alert", "delay", "Reduced speed",
            "Southbound trains are moving slowly.", "wilson", "yorkdale",
            OffsetDateTime.parse("2026-06-01T11:54:00Z"), null
        ), "line-1", "1");
        ReflectionTestUtils.setField(southbound, "direction", "southbound");
        ReflectionTestUtils.setField(southbound, "impactKind", "reduced-speed-zone");
        ReflectionTestUtils.setField(southbound, "activePeriodStart", OffsetDateTime.parse("2026-06-01T11:40:00Z"));
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(northbound, southbound));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-wilson-yorkdale", "line-1", "wilson", "yorkdale", 10, "southbound")
        ));

        assertThat(service.reducedSpeedZones()).singleElement().satisfies(zone -> {
            assertThat(zone.displayDirection()).isEqualTo("Northbound & Southbound");
            assertThat(zone.startedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:30:00Z"));
            assertThat(zone.updatedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:55:00Z"));
            assertThat(zone.affectedSegmentIds()).containsExactly("line-1-wilson-yorkdale");
            assertThat(zone.sourceAlertIds())
                .containsExactlyInAnyOrder("ttc-route-north", "ttc-route-south");
            assertThat(zone.directionalDetails()).hasSize(2);
            assertThat(zone.cause()).isEqualTo("Track issue");
            assertThat(zone.resolution()).isEqualTo("Mid-June");
            assertThat(zone.rszLength()).isEqualTo("300 metres");
            assertThat(zone.averageSpeed()).isEqualTo("35 km/h");
        });
    }

    @Test
    void plannedClosuresUseNormalizedPlannedClosureTypeAndPreviewSegments() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity alert = alert(
            "ttc-route-200",
            "planned-closure",
            "planned",
            "Weekend closure",
            "No subway service between Jane and Ossington this weekend.",
            "jane",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            null
        );
        ReflectionTestUtils.setField(
            alert,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-06T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            alert,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-08T09:00:00Z")
        );
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(alert));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 10)
        ));

        List<AlertDashboardService.PlannedClosureDto> closures = service.plannedClosures();

        assertThat(closures).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("ttc-route-200");
            assertThat(dto.lineId()).isEqualTo("line-2");
            assertThat(dto.lineNumber()).isEqualTo("2");
            assertThat(dto.location()).isEqualTo("Jane to Ossington");
            assertThat(dto.window()).isEqualTo("Sat 12:00 AM - Mon 5:00 AM");
            assertThat(dto.startedAt()).isEqualTo(OffsetDateTime.parse("2026-06-06T04:00:00Z"));
            assertThat(dto.updatedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:45:00Z"));
            assertThat(dto.previewSegmentIds()).containsExactly("line-2-jane-ossington");
            assertThat(dto.shuttle()).isFalse();
            assertThat(dto.source()).isEqualTo("TTC Service Advisory");
        });
    }

    @Test
    void plannedClosuresExcludeExpiredWindows() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity expired = alert(
            "ttc-route-expired",
            "planned-closure",
            "planned",
            "Expired closure",
            "This closure ended before the dashboard timestamp.",
            "jane",
            "ossington",
            OffsetDateTime.parse("2026-05-31T23:00:00Z"),
            null
        );
        ReflectionTestUtils.setField(
            expired,
            "activePeriodStart",
            OffsetDateTime.parse("2026-05-30T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            expired,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-05-31T23:59:00Z")
        );
        AlertEntity upcoming = alert(
            "ttc-route-upcoming",
            "planned-closure",
            "planned",
            "Upcoming closure",
            "This closure is still upcoming.",
            "jane",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"),
            null
        );
        ReflectionTestUtils.setField(
            upcoming,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-06T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            upcoming,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-08T09:00:00Z")
        );
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(expired, upcoming));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 10)
        ));

        List<AlertDashboardService.PlannedClosureDto> closures = service.plannedClosures();

        assertThat(closures).extracting(AlertDashboardService.PlannedClosureDto::id)
            .containsExactly("ttc-route-upcoming");
    }

    @Test
    void plannedClosuresExposeNightlyWindowStateBeforeDuringAndAfterChildPeriods() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity alert = alert(
            "planned-closure-nightly",
            "planned-closure",
            "planned",
            "Nightly closure, starting 11",
            "No subway service nightly between Finch and Eglinton.",
            "finch",
            "eglinton",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            null
        );
        ReflectionTestUtils.setField(
            alert,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-01T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            alert,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-05T09:00:00Z")
        );
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(alert));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-finch-eglinton", "line-1", "finch", "eglinton", 10)
        ));

        // Mock child periods:
        // 1st child period: ended
        // 2nd child period: upcoming
        AlertActivePeriodRepository.AlertPeriod period1 = new AlertActivePeriodRepository.AlertPeriod(
            "planned-closure-nightly",
            "period-1",
            OffsetDateTime.parse("2026-06-01T03:59:00Z"),
            OffsetDateTime.parse("2026-06-01T07:30:00Z"),
            0
        );
        AlertActivePeriodRepository.AlertPeriod period2 = new AlertActivePeriodRepository.AlertPeriod(
            "planned-closure-nightly",
            "period-2",
            OffsetDateTime.parse("2026-06-02T03:59:00Z"),
            OffsetDateTime.parse("2026-06-02T07:30:00Z"),
            1
        );
        when(alertActivePeriodRepository.findByAlertIds(List.of("planned-closure-nightly")))
            .thenReturn(Map.of("planned-closure-nightly", List.of(period1, period2)));

        List<AlertDashboardService.PlannedClosureDto> closures = service.plannedClosures();

        assertThat(closures).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("planned-closure-nightly");
            assertThat(dto.title()).isEqualTo("Nightly closure");
            assertThat(dto.window()).isEqualTo("Nightly closure windows");
            assertThat(dto.windowHours()).isEqualTo("11:59 PM – 3:30 AM");
            assertThat(dto.windowDates()).isEqualTo("Sun, May 31 – Mon, Jun 1");
            assertThat(dto.nightly()).isTrue();
            assertThat(dto.activeNow()).isFalse();
            assertThat(dto.timingStatus()).isEqualTo("upcoming");
            assertThat(dto.nextWindowStart()).isEqualTo(OffsetDateTime.parse("2026-06-02T03:59:00Z"));
            assertThat(dto.nextWindowEnd()).isEqualTo(OffsetDateTime.parse("2026-06-02T07:30:00Z"));
        });
    }

    @Test
    void activeNightlyClosureRemainsScheduledAndAlsoDrivesCurrentImpactViews() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity alert = withLine(alert(
            "planned-closure-nightly-active",
            "planned-closure",
            "planned",
            "Nightly closure active",
            "No subway service nightly between Finch and Eglinton.",
            "finch",
            "eglinton",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            null
        ), "line-1", "1");
        ReflectionTestUtils.setField(
            alert,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-01T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            alert,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-05T09:00:00Z")
        );
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(alert));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-finch-eglinton", "line-1", "finch", "eglinton", 10)
        ));

        // Mock child periods:
        // 1st child period is active during CLOCK which is 2026-06-01T12:00:00Z (we make it 11:00 to 13:00)
        AlertActivePeriodRepository.AlertPeriod period1 = new AlertActivePeriodRepository.AlertPeriod(
            "planned-closure-nightly-active",
            "period-1",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"),
            OffsetDateTime.parse("2026-06-01T13:00:00Z"),
            0
        );
        when(alertActivePeriodRepository.findByAlertIds(List.of("planned-closure-nightly-active")))
            .thenReturn(Map.of("planned-closure-nightly-active", List.of(period1)));

        List<AlertDashboardService.PlannedClosureDto> closures = service.plannedClosures();

        assertThat(closures).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("planned-closure-nightly-active");
            assertThat(dto.window()).isEqualTo("Nightly closure windows");
            assertThat(dto.nightly()).isTrue();
            assertThat(dto.activeNow()).isTrue();
            assertThat(dto.timingStatus()).isEqualTo("active-now");
            assertThat(dto.activeWindowStart()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:00:00Z"));
            assertThat(dto.activeWindowEnd()).isEqualTo(OffsetDateTime.parse("2026-06-01T13:00:00Z"));
        });
        assertThat(service.activeAlerts()).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("planned-closure-nightly-active");
            assertThat(dto.severity()).isEqualTo("planned");
            assertThat(dto.startedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:00:00Z"));
        });
        assertThat(service.activePlannedClosures())
            .extracting(AlertDashboardService.PlannedClosureDto::id)
            .containsExactly("planned-closure-nightly-active");
        assertThat(service.activeSegmentImpacts().get("line-1-finch-eglinton"))
            .extracting(AlertDashboardService.SegmentImpact::kind)
            .containsExactly("planned-closure");
    }

    @Test
    void activeClosureRecordsRemainInPlannedClosuresWhileAlsoAppearingAsCurrentImpacts() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity parentClosure = withLine(alert(
            "planned-closure-parent",
            "planned-closure",
            "planned",
            "Nightly closure parent",
            "There will be no subway service nightly between St George and Sheppard West.",
            "st-george",
            "sheppard-west",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            "shuttle-bus"
        ), "line-1", "1");
        ReflectionTestUtils.setField(
            parentClosure,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-01T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            parentClosure,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-05T09:00:00Z")
        );
        AlertEntity currentClosure = withLine(alert(
            "planned-closure-current-window",
            "planned-closure",
            "planned",
            "Nightly closure current window",
            "No subway service nightly between St George and Sheppard West.",
            "st-george",
            "sheppard-west",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            "shuttle-bus"
        ), "line-1", "1");
        ReflectionTestUtils.setField(
            currentClosure,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-01T11:00:00Z")
        );
        ReflectionTestUtils.setField(
            currentClosure,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-01T13:00:00Z")
        );
        AlertEntity upcomingClosure = alert(
            "planned-closure-upcoming",
            "planned-closure",
            "planned",
            "Nightly closure upcoming",
            "No subway service nightly between Jane and Ossington.",
            "jane",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            null
        );
        ReflectionTestUtils.setField(
            upcomingClosure,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-01T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            upcomingClosure,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-05T09:00:00Z")
        );
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(parentClosure, currentClosure, upcomingClosure));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-st-george-sheppard-west", "line-1", "st-george", "sheppard-west", 10),
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 20)
        ));
        AlertActivePeriodRepository.AlertPeriod parentActivePeriod = new AlertActivePeriodRepository.AlertPeriod(
            "planned-closure-parent",
            "period-active",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"),
            OffsetDateTime.parse("2026-06-01T13:00:00Z"),
            0
        );
        AlertActivePeriodRepository.AlertPeriod currentPeriod = new AlertActivePeriodRepository.AlertPeriod(
            "planned-closure-current-window",
            "parent",
            OffsetDateTime.parse("2026-06-01T11:00:00Z"),
            OffsetDateTime.parse("2026-06-01T13:00:00Z"),
            0
        );
        AlertActivePeriodRepository.AlertPeriod upcomingPeriod = new AlertActivePeriodRepository.AlertPeriod(
            "planned-closure-upcoming",
            "period-upcoming",
            OffsetDateTime.parse("2026-06-02T02:00:00Z"),
            OffsetDateTime.parse("2026-06-02T06:00:00Z"),
            0
        );
        when(alertActivePeriodRepository.findByAlertIds(List.of("planned-closure-parent", "planned-closure-current-window", "planned-closure-upcoming")))
            .thenReturn(Map.of(
                "planned-closure-parent", List.of(parentActivePeriod),
                "planned-closure-current-window", List.of(currentPeriod),
                "planned-closure-upcoming", List.of(upcomingPeriod)
            ));

        assertThat(service.plannedClosures())
            .extracting(AlertDashboardService.PlannedClosureDto::id)
            .containsExactly("planned-closure-parent", "planned-closure-current-window", "planned-closure-upcoming");
        assertThat(service.activeAlerts()).hasSize(2).allSatisfy(dto -> {
            assertThat(dto.severity()).isEqualTo("planned");
            assertThat(dto.affectedSegmentIds()).containsExactly("line-1-st-george-sheppard-west");
            assertThat(dto.shuttle()).isTrue();
            assertThat(dto.source()).isEqualTo("TTC Service Advisory");
        });
        assertThat(service.activeAlerts())
            .extracting(AlertDashboardService.ActiveAlertDto::id)
            .containsExactlyInAnyOrder("planned-closure-parent", "planned-closure-current-window");
        assertThat(service.activePlannedClosures())
            .extracting(AlertDashboardService.PlannedClosureDto::id)
            .containsExactlyInAnyOrder("planned-closure-parent", "planned-closure-current-window");
        assertThat(service.activeSegmentImpacts().get("line-1-st-george-sheppard-west"))
            .extracting(AlertDashboardService.SegmentImpact::kind)
            .containsExactly("planned-closure", "planned-closure");
        assertThat(service.dashboardVisiblePlannedClosureIds())
            .containsExactly("planned-closure-parent", "planned-closure-current-window", "planned-closure-upcoming");
    }

    @Test
    void recurringClosureDoesNotUseMultiDayParentWindowAsActiveMapImpact() {
        Clock fridayAfternoon = Clock.fixed(
            Instant.parse("2026-06-05T17:37:00Z"),
            ZoneOffset.UTC
        );
        AlertDashboardService serviceAtFridayAfternoon = new AlertDashboardService(
            alertRepository,
            lineSegmentRepository,
            new AlertSegmentMatcher(),
            new ReducedSpeedZoneProjector(new AlertSegmentMatcher(), new com.calebhabesh.linewatch.ingestion.AlertDirectionParser()),
            ingestionFreshness,
            alertActivePeriodRepository,
            ttcAlertStore,
            fridayAfternoon
        );
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity closure = withLine(alert(
            "ttc-route-synthetic-planned-line-1",
            "planned-closure",
            "planned",
            "There will be no subway service between St George and Sheppard West stations, starting 11:59 p.m., nightly Monday, June 1 to Thursday, June 4, and 12:30 a.m. Friday, June 5, due to planned track work.",
            "Shuttle buses will operate.",
            "st-george",
            "sheppard-west",
            OffsetDateTime.parse("2026-06-01T09:35:11Z"),
            "Will Operate"
        ), "line-1", "1");
        ReflectionTestUtils.setField(
            closure,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-01T09:35:11Z")
        );
        ReflectionTestUtils.setField(
            closure,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-06T04:30:00Z")
        );
        ReflectionTestUtils.setField(closure, "effectDescription", "Subway Closure - Early Access");
        ReflectionTestUtils.setField(closure, "causeDescription", "CLOSURE - Planned Track Work");

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of());
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(closure));
        AlertActivePeriodRepository.AlertPeriod parentPeriod = new AlertActivePeriodRepository.AlertPeriod(
            "ttc-route-synthetic-planned-line-1",
            "parent",
            OffsetDateTime.parse("2026-06-01T09:35:11Z"),
            OffsetDateTime.parse("2026-06-06T04:30:00Z"),
            0
        );
        when(alertActivePeriodRepository.findByAlertIds(List.of("ttc-route-synthetic-planned-line-1")))
            .thenReturn(Map.of("ttc-route-synthetic-planned-line-1", List.of(parentPeriod)));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-st-george-sheppard-west", "line-1", "st-george", "sheppard-west", 10)
        ));

        assertThat(serviceAtFridayAfternoon.activeAlerts()).isEmpty();
        assertThat(serviceAtFridayAfternoon.activePlannedClosures()).isEmpty();
        assertThat(serviceAtFridayAfternoon.activeSegmentImpacts())
            .doesNotContainKey("line-1-st-george-sheppard-west");
    }

    @Test
    void activeSegmentImpactsExposeSlowdownMapOverlayBySegmentId() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity alert = alert(
            "ttc-route-300",
            "active-alert",
            "delay",
            "Reduced speed",
            "Reduced speed between Jane and Ossington.",
            "jane",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:55:00Z"),
            null
        );
        ReflectionTestUtils.setField(alert, "direction", "eastbound");
        ReflectionTestUtils.setField(alert, "impactKind", "reduced-speed-zone");
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(alert));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 10, "eastbound")
        ));

        assertThat(service.activeSegmentImpacts())
            .hasEntrySatisfying("line-2-jane-ossington", impact -> {
                assertThat(impact).singleElement().satisfies(segmentImpact -> {
                    assertThat(segmentImpact.kind()).isEqualTo("reduced-speed-zone");
                    assertThat(segmentImpact.cardId()).isEqualTo("reduced-speed-zone-ttc-route-300");
                    assertThat(segmentImpact.travelDirection()).isEqualTo("forward");
                    assertThat(segmentImpact.sourceAlertIds()).containsExactly("ttc-route-300");
                });
            });
    }

    @Test
    void activeSegmentImpactsLayerDelayBelowSuspensionOnSameSegment() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity delay = alert(
            "delay-line-2-christie-ossington",
            "active-alert",
            "delay",
            "Delay",
            "Delays between Christie and Ossington.",
            "christie",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        );
        ReflectionTestUtils.setField(delay, "impactKind", "delay");
        AlertEntity suspension = alert(
            "suspension-line-2-christie-ossington",
            "active-alert",
            "suspension",
            "No service",
            "No service between Christie and Ossington.",
            "christie",
            "ossington",
            OffsetDateTime.parse("2026-06-01T11:55:00Z"),
            null
        );
        ReflectionTestUtils.setField(suspension, "impactKind", "suspension");
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(suspension, delay));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-christie-ossington", "line-2", "christie", "ossington", 10, "eastbound")
        ));

        assertThat(service.activeSegmentImpacts().get("line-2-christie-ossington"))
            .extracting(AlertDashboardService.SegmentImpact::kind)
            .containsExactly("delay", "suspension");
    }

    @Test
    void activeStationNodeImpactsExposeSingleStationDelayWithoutSegments() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity delay = withLine(alert(
            "delay-line-4-sheppard-yonge",
            "active-alert",
            "delay",
            "Delay at Sheppard-Yonge",
            "Delays at Sheppard-Yonge Station.",
            "sheppard-yonge",
            "sheppard-yonge",
            OffsetDateTime.parse("2026-06-01T22:39:00-04:00"),
            null
        ), "line-4", "4");
        ReflectionTestUtils.setField(delay, "impactKind", "delay");
        ReflectionTestUtils.setField(delay, "sourceAlertType", "GTFS-RT");
        delay.getStationIds().add("sheppard-yonge");
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(delay));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-4-sheppard-yonge-don-mills", "line-4", "sheppard-yonge", "don-mills", 10, "eastbound")
        ));

        assertThat(service.activeStationNodeImpacts())
            .containsExactly(new AlertDashboardService.StationNodeImpact(
                "sheppard-yonge",
                "delay",
                "delay-line-4-sheppard-yonge",
                "Delay at Sheppard-Yonge",
                "TTC GTFS-RT"
            ));
    }

    @Test
    void suppressesDashboardAlertsWhenIngestionIsStale() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(false);

        assertThat(service.activeAlerts()).isEmpty();
        assertThat(service.reducedSpeedZones()).isEmpty();
        assertThat(service.plannedClosures()).isEmpty();
        assertThat(service.activeSegmentImpacts()).isEqualTo(Map.of());
        assertThat(service.activeStationNodeImpacts()).isEmpty();
    }

    @Test
    void ordinaryDelayWithStationOnlyImpactAndWestboundDirection() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity delay = withLine(alert(
            "delay-keele",
            "active-alert",
            "delay",
            "Delay",
            "Delay at Keele.",
            "keele",
            "keele",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        ), "line-2", "2");
        ReflectionTestUtils.setField(delay, "impactKind", "delay");
        ReflectionTestUtils.setField(delay, "direction", "westbound");

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(delay));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-keele-keele", "line-2", "keele", "keele", 10)
        ));

        List<AlertDashboardService.DelayAlertDto> delays = service.delays();

        assertThat(delays).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("delay-keele");
            assertThat(dto.location()).isEqualTo("Keele");
            assertThat(dto.displayDirection()).isEqualTo("Westbound");
        });
    }

    @Test
    void ordinaryDelayWithTmuStationAndTMUCapitalization() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity delay = withLine(alert(
            "delay-tmu",
            "active-alert",
            "delay",
            "Delay",
            "Delay at TMU.",
            "tmu",
            "tmu",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        ), "line-1", "1");
        ReflectionTestUtils.setField(delay, "impactKind", "delay");
        ReflectionTestUtils.setField(delay, "direction", "northbound");

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(delay));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-tmu-tmu", "line-1", "tmu", "tmu", 10)
        ));

        List<AlertDashboardService.DelayAlertDto> delays = service.delays();

        assertThat(delays).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("delay-tmu");
            assertThat(dto.location()).isEqualTo("TMU");
            assertThat(dto.displayDirection()).isEqualTo("Northbound");
        });
    }

    @Test
    void unionStationOnlyLineOneDelayUsesTerminalQualifiedDirection() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity vaughanDelay = withLine(alert(
            "delay-union-vaughan",
            "active-alert",
            "delay",
            "Delay at Union",
            "Delays at Union Station.",
            "union",
            "union",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        ), "line-1", "1");
        ReflectionTestUtils.setField(vaughanDelay, "impactKind", "delay");
        ReflectionTestUtils.setField(vaughanDelay, "direction", "northbound");
        ReflectionTestUtils.setField(
            vaughanDelay,
            "rawPayload",
            "{\"direction\":\"Northbound To Vaughan Metropolitan Centre\"}"
        );
        AlertEntity finchDelay = withLine(alert(
            "delay-union-finch",
            "active-alert",
            "delay",
            "Delay at Union",
            "Delays on the Finch platform at Union Station.",
            "union",
            "union",
            OffsetDateTime.parse("2026-06-01T11:49:00Z"),
            null
        ), "line-1", "1");
        ReflectionTestUtils.setField(finchDelay, "impactKind", "delay");
        ReflectionTestUtils.setField(finchDelay, "direction", "southbound");

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(vaughanDelay, finchDelay));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());

        assertThat(service.delays())
            .extracting(AlertDashboardService.DelayAlertDto::displayDirection)
            .containsExactlyInAnyOrder(
                "Northbound (to Vaughan Metropolitan Centre)",
                "Northbound (to Finch)"
            );
    }

    @Test
    void bothWayDirectionReturnsBidirectionalCardsAndMapImpacts() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity delay = withLine(alert(
            "delay-both-way",
            "active-alert",
            "delay",
            "Delay",
            "Delays both ways between Jane and Runnymede.",
            "jane",
            "runnymede",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        ), "line-2", "2");
        ReflectionTestUtils.setField(delay, "impactKind", "delay");
        ReflectionTestUtils.setField(delay, "direction", "Both way");

        AlertEntity closure = withLine(alert(
            "closure-both-way",
            "planned-closure",
            "planned",
            "Closure",
            "No service both ways between St George and Spadina.",
            "st-george",
            "spadina",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            null
        ), "line-1", "1");
        ReflectionTestUtils.setField(closure, "direction", "Both ways");
        ReflectionTestUtils.setField(
            closure,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-06T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            closure,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-08T09:00:00Z")
        );

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(delay));
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(closure));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-jane-runnymede", "line-2", "jane", "runnymede", 10, "eastbound"),
            segment("line-1-st-george-spadina", "line-1", "st-george", "spadina", 20, "northbound")
        ));

        assertThat(service.delays()).singleElement().satisfies(dto -> {
            assertThat(dto.displayDirection()).isEqualTo("Eastbound & Westbound");
            assertThat(dto.location()).isEqualTo("Jane to Runnymede");
        });
        assertThat(service.plannedClosures()).singleElement().satisfies(dto -> {
            assertThat(dto.displayDirection()).isEqualTo("Northbound & Southbound");
            assertThat(dto.location()).isEqualTo("St George to Spadina");
        });
        assertThat(service.activeSegmentImpacts().get("line-2-jane-runnymede"))
            .singleElement()
            .satisfies(impact -> assertThat(impact.travelDirection()).isEqualTo("bidirectional"));
    }

    @Test
    void delayCardsUseStableLineAndSegmentOrderInsteadOfRepositoryOrder() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity line2Later = withLine(alert(
            "delay-line-2-later",
            "active-alert",
            "delay",
            "Delay",
            "Delay between Runnymede and Dufferin.",
            "runnymede",
            "dufferin",
            OffsetDateTime.parse("2026-06-01T11:58:00Z"),
            null
        ), "line-2", "2");
        AlertEntity line1First = withLine(alert(
            "delay-line-1-first",
            "active-alert",
            "delay",
            "Delay",
            "Delay between St George and Spadina.",
            "st-george",
            "spadina",
            OffsetDateTime.parse("2026-06-01T11:59:00Z"),
            null
        ), "line-1", "1");
        AlertEntity line2Earlier = withLine(alert(
            "delay-line-2-earlier",
            "active-alert",
            "delay",
            "Delay",
            "Delay between Jane and Runnymede.",
            "jane",
            "runnymede",
            OffsetDateTime.parse("2026-06-01T11:57:00Z"),
            null
        ), "line-2", "2");
        ReflectionTestUtils.setField(line2Later, "impactKind", "delay");
        ReflectionTestUtils.setField(line1First, "impactKind", "delay");
        ReflectionTestUtils.setField(line2Earlier, "impactKind", "delay");

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(line2Later, line1First, line2Earlier));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-jane-runnymede", "line-2", "jane", "runnymede", 10),
            segment("line-2-runnymede-dufferin", "line-2", "runnymede", "dufferin", 20),
            segment("line-1-st-george-spadina", "line-1", "st-george", "spadina", 30)
        ));

        assertThat(service.delays())
            .extracting(AlertDashboardService.DelayAlertDto::id)
            .containsExactly("delay-line-1-first", "delay-line-2-earlier", "delay-line-2-later");
    }

    @Test
    void noServiceAlertWithBidirectionalDirectionReturnsLineAwareCardinalCopy() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        
        // Test Line 1 (Northbound & Southbound)
        AlertEntity alert1 = withLine(alert(
            "suspension-l1",
            "active-alert",
            "suspension",
            "No service",
            "No service.",
            "union",
            "st-andrew",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        ), "line-1", "1");
        ReflectionTestUtils.setField(alert1, "direction", "bidirectional");

        // Test Line 2 (Eastbound & Westbound)
        AlertEntity alert2 = withLine(alert(
            "suspension-l2",
            "active-alert",
            "suspension",
            "No service",
            "No service.",
            "kipling",
            "jane",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        ), "line-2", "2");
        ReflectionTestUtils.setField(alert2, "direction", "bidirectional");

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(alert1, alert2));

        List<AlertDashboardService.ActiveAlertDto> activeAlerts = service.activeAlerts();

        assertThat(activeAlerts).hasSize(2);
        
        AlertDashboardService.ActiveAlertDto dto1 = activeAlerts.stream()
            .filter(d -> d.id().equals("suspension-l1")).findFirst().orElseThrow();
        assertThat(dto1.displayDirection()).isEqualTo("Northbound & Southbound");

        AlertDashboardService.ActiveAlertDto dto2 = activeAlerts.stream()
            .filter(d -> d.id().equals("suspension-l2")).findFirst().orElseThrow();
        assertThat(dto2.displayDirection()).isEqualTo("Eastbound & Westbound");
    }

    @Test
    void plannedClosureExposesDisplayDirectionWhenAvailable() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity alert = withLine(alert(
            "planned-l1",
            "planned-closure",
            "planned",
            "Closure",
            "Weekend closure.",
            "finch",
            "eglinton",
            OffsetDateTime.parse("2026-06-01T11:45:00Z"),
            null
        ), "line-1", "1");
        ReflectionTestUtils.setField(alert, "direction", "northbound");
        ReflectionTestUtils.setField(
            alert,
            "activePeriodStart",
            OffsetDateTime.parse("2026-06-06T04:00:00Z")
        );
        ReflectionTestUtils.setField(
            alert,
            "activePeriodEnd",
            OffsetDateTime.parse("2026-06-08T09:00:00Z")
        );
        when(alertRepository.findByActiveTrueAndType("planned-closure"))
            .thenReturn(List.of(alert));

        List<AlertDashboardService.PlannedClosureDto> closures = service.plannedClosures();

        assertThat(closures).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("planned-l1");
            assertThat(dto.displayDirection()).isEqualTo("Northbound");
        });
    }

    @Test
    void suspensionSegmentImpactsCarryComputedTravelDirection() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        
        // Eastbound suspension on Line 2
        AlertEntity alert = withLine(alert(
            "suspension-l2-east",
            "active-alert",
            "suspension",
            "No service",
            "No service.",
            "kipling",
            "jane",
            OffsetDateTime.parse("2026-06-01T11:50:00Z"),
            null
        ), "line-2", "2");
        ReflectionTestUtils.setField(alert, "direction", "eastbound");

        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(alert));
        
        // Forward direction segment
        LineSegmentEntity forwardSegment = segment("line-2-kipling-jane", "line-2", "kipling", "jane", 10, "eastbound");
        // Reverse direction segment (for testing reverse direction return)
        LineSegmentEntity reverseSegment = segment("line-2-jane-kipling", "line-2", "jane", "kipling", 20, "westbound");
        
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(forwardSegment, reverseSegment));

        Map<String, List<AlertDashboardService.SegmentImpact>> impacts = service.activeSegmentImpacts();

        // Kipling to Jane segment (forward direction)
        List<AlertDashboardService.SegmentImpact> forwardImpacts = impacts.get("line-2-kipling-jane");
        assertThat(forwardImpacts).singleElement().satisfies(imp -> {
            assertThat(imp.travelDirection()).isEqualTo("forward");
        });

        // Change alert direction to westbound to test reverse direction mapping
        ReflectionTestUtils.setField(alert, "direction", "westbound");
        Map<String, List<AlertDashboardService.SegmentImpact>> reverseImpacts = service.activeSegmentImpacts();
        List<AlertDashboardService.SegmentImpact> forwardImpactsRev = reverseImpacts.get("line-2-kipling-jane");
        assertThat(forwardImpactsRev).singleElement().satisfies(imp -> {
            assertThat(imp.travelDirection()).isEqualTo("reverse");
        });

        // Change alert direction to bidirectional
        ReflectionTestUtils.setField(alert, "direction", "bidirectional");
        Map<String, List<AlertDashboardService.SegmentImpact>> biImpacts = service.activeSegmentImpacts();
        List<AlertDashboardService.SegmentImpact> biImpact = biImpacts.get("line-2-kipling-jane");
        assertThat(biImpact).singleElement().satisfies(imp -> {
            assertThat(imp.travelDirection()).isEqualTo("bidirectional");
        });

        // Change alert direction to unknown/null
        ReflectionTestUtils.setField(alert, "direction", null);
        Map<String, List<AlertDashboardService.SegmentImpact>> unknownImpacts = service.activeSegmentImpacts();
        List<AlertDashboardService.SegmentImpact> unknownImpact = unknownImpacts.get("line-2-kipling-jane");
        assertThat(unknownImpact).singleElement().satisfies(imp -> {
            assertThat(imp.travelDirection()).isEqualTo("bidirectional");
        });
    }

    private AlertEntity alert(
        String id,
        String type,
        String severity,
        String title,
        String description,
        String startStationId,
        String endStationId,
        OffsetDateTime sourceUpdatedAt,
        String shuttleType
    ) {
        AlertEntity alert = new AlertEntity();
        ReflectionTestUtils.setField(alert, "id", id);
        ReflectionTestUtils.setField(alert, "sourceId", id.replace("ttc-route-", ""));
        ReflectionTestUtils.setField(alert, "line", new TransitLineEntity(
            "line-2",
            "2",
            "Bloor-Danforth",
            "#00923F",
            2
        ));
        ReflectionTestUtils.setField(alert, "type", type);
        ReflectionTestUtils.setField(alert, "severity", severity);
        ReflectionTestUtils.setField(alert, "title", title);
        ReflectionTestUtils.setField(alert, "description", description);
        ReflectionTestUtils.setField(alert, "active", true);
        ReflectionTestUtils.setField(alert, "impactKind", defaultImpactKind(severity));
        ReflectionTestUtils.setField(alert, "startStationId", startStationId);
        ReflectionTestUtils.setField(alert, "endStationId", endStationId);
        if (sourceUpdatedAt != null) {
            ReflectionTestUtils.setField(alert, "activePeriodStart", sourceUpdatedAt.minusMinutes(5));
        }
        ReflectionTestUtils.setField(alert, "sourceUpdatedAt", sourceUpdatedAt);
        ReflectionTestUtils.setField(alert, "shuttleType", shuttleType);
        return alert;
    }

    private String defaultImpactKind(String severity) {
        return switch (severity) {
            case "suspension" -> "suspension";
            case "planned" -> "planned-closure";
            case "delay" -> "reduced-speed-zone";
            default -> severity;
        };
    }

    private AlertEntity withLine(AlertEntity alert, String lineId, String lineNumber) {
        ReflectionTestUtils.setField(alert, "line", new TransitLineEntity(
            lineId,
            lineNumber,
            lineId,
            "#000",
            Integer.parseInt(lineNumber)
        ));
        return alert;
    }

    private LineSegmentEntity segment(
        String id,
        String lineId,
        String stationAId,
        String stationBId,
        int sortOrder
    ) {
        return new LineSegmentEntity(
            id,
            lineId,
            stationAId,
            stationBId,
            null,
            "M 0 0 L 1 1",
            sortOrder
        );
    }

    private LineSegmentEntity segment(
        String id,
        String lineId,
        String stationAId,
        String stationBId,
        int sortOrder,
        String forwardDirection
    ) {
        return new LineSegmentEntity(
            id,
            lineId,
            stationAId,
            stationBId,
            null,
            "M 0 0 L 1 1",
            sortOrder,
            forwardDirection,
            null,
            false,
            null,
            null
        );
    }
}
