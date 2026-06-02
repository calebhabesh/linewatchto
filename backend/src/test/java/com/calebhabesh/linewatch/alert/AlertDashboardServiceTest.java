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
    private final AlertDashboardService service = new AlertDashboardService(
        alertRepository,
        lineSegmentRepository,
        new AlertSegmentMatcher(),
        new ReducedSpeedZoneProjector(new AlertSegmentMatcher(), new com.calebhabesh.linewatch.ingestion.AlertDirectionParser()),
        ingestionFreshness,
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
            assertThat(dto.updatedAgo()).isEqualTo("Updated 10 min ago");
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
    void reducedSpeedZonesGroupOpposingSourceAlertsAndExposeDirectionalDetails() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        AlertEntity northbound = alert(
            "ttc-route-north", "active-alert", "delay", "Reduced speed",
            "Northbound trains are moving slowly.", "yorkdale", "wilson",
            OffsetDateTime.parse("2026-06-01T11:55:00Z"), null
        );
        ReflectionTestUtils.setField(northbound, "direction", "northbound");
        ReflectionTestUtils.setField(northbound, "causeDescription", "Track issue");
        ReflectionTestUtils.setField(northbound, "targetRemoval", "Mid-June");
        AlertEntity southbound = alert(
            "ttc-route-south", "active-alert", "delay", "Reduced speed",
            "Southbound trains are moving slowly.", "wilson", "yorkdale",
            OffsetDateTime.parse("2026-06-01T11:54:00Z"), null
        );
        ReflectionTestUtils.setField(southbound, "direction", "southbound");
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(northbound, southbound));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-wilson-yorkdale", "line-2", "wilson", "yorkdale", 10, "southbound")
        ));

        assertThat(service.reducedSpeedZones()).singleElement().satisfies(zone -> {
            assertThat(zone.displayDirection()).isEqualTo("Both directions");
            assertThat(zone.affectedSegmentIds()).containsExactly("line-2-wilson-yorkdale");
            assertThat(zone.sourceAlertIds())
                .containsExactlyInAnyOrder("ttc-route-north", "ttc-route-south");
            assertThat(zone.directionalDetails()).hasSize(2);
            assertThat(zone.reason()).isEqualTo("Track issue");
            assertThat(zone.targetRemoval()).isEqualTo("Mid-June");
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
        when(alertRepository.findByActiveTrueAndType("active-alert"))
            .thenReturn(List.of(alert));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 10, "eastbound")
        ));

        assertThat(service.activeSegmentImpacts())
            .hasEntrySatisfying("line-2-jane-ossington", impact -> {
                assertThat(impact.overlay()).isEqualTo("delay");
                assertThat(impact.travelDirection()).isEqualTo("forward");
                assertThat(impact.sourceAlertIds()).containsExactly("ttc-route-300");
                assertThat(impact.reducedSpeedZoneIds()).containsExactly("reduced-speed-zone-ttc-route-300");
                assertThat(impact.alertId()).isNull();
            });
    }

    @Test
    void suppressesDashboardAlertsWhenIngestionIsStale() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(false);

        assertThat(service.activeAlerts()).isEmpty();
        assertThat(service.reducedSpeedZones()).isEmpty();
        assertThat(service.plannedClosures()).isEmpty();
        assertThat(service.activeSegmentImpacts()).isEqualTo(Map.of());
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
            "#14a44d",
            2
        ));
        ReflectionTestUtils.setField(alert, "type", type);
        ReflectionTestUtils.setField(alert, "severity", severity);
        ReflectionTestUtils.setField(alert, "title", title);
        ReflectionTestUtils.setField(alert, "description", description);
        ReflectionTestUtils.setField(alert, "active", true);
        ReflectionTestUtils.setField(alert, "startStationId", startStationId);
        ReflectionTestUtils.setField(alert, "endStationId", endStationId);
        ReflectionTestUtils.setField(alert, "sourceUpdatedAt", sourceUpdatedAt);
        ReflectionTestUtils.setField(alert, "shuttleType", shuttleType);
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
