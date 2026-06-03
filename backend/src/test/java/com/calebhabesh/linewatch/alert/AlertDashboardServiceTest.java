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
            assertThat(dto.location()).isEqualTo("Sheppard Yonge to Don Mills");
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
            "Nightly closure",
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
            OffsetDateTime.parse("2026-06-01T02:00:00Z"),
            OffsetDateTime.parse("2026-06-01T06:00:00Z"),
            0
        );
        AlertActivePeriodRepository.AlertPeriod period2 = new AlertActivePeriodRepository.AlertPeriod(
            "planned-closure-nightly",
            "period-2",
            OffsetDateTime.parse("2026-06-02T02:00:00Z"),
            OffsetDateTime.parse("2026-06-02T06:00:00Z"),
            1
        );
        when(alertActivePeriodRepository.findByAlertIds(List.of("planned-closure-nightly")))
            .thenReturn(Map.of("planned-closure-nightly", List.of(period1, period2)));

        List<AlertDashboardService.PlannedClosureDto> closures = service.plannedClosures();

        assertThat(closures).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo("planned-closure-nightly");
            assertThat(dto.window()).isEqualTo("Nightly closure windows");
            assertThat(dto.nightly()).isTrue();
            assertThat(dto.activeNow()).isFalse();
            assertThat(dto.timingStatus()).isEqualTo("upcoming");
            assertThat(dto.nextWindowStart()).isEqualTo(OffsetDateTime.parse("2026-06-02T02:00:00Z"));
            assertThat(dto.nextWindowEnd()).isEqualTo(OffsetDateTime.parse("2026-06-02T06:00:00Z"));
        });
    }

    @Test
    void plannedClosuresExposeNightlyWindowStateWhenActiveNow() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity alert = alert(
            "planned-closure-nightly-active",
            "planned-closure",
            "planned",
            "Nightly closure active",
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
                "Delay at Sheppard-Yonge"
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
