package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.commute.CommuteImpactService;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalCommuteImpactServiceTest {
    private final RegionalAlertStore alertStore = mock(RegionalAlertStore.class);
    private final RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-07-28T14:00:00Z"), ZoneOffset.UTC);
    private final RegionalCommuteImpactService service = new RegionalCommuteImpactService(
        alertStore,
        freshness,
        new CommuteImpactService(mock(AlertDashboardService.class)),
        clock
    );
    private final RegionalCommutePathService pathService = new RegionalCommutePathService();

    @Test
    void matchesFreshSegmentAndRouteWideAlertsOnRegionalPath() {
        var path = pathService.path("bloor", "stratford");
        String segment = "segment-ki-guelph-central-kitchener";
        when(freshness.isFresh()).thenReturn(true);
        when(alertStore.findActiveAlerts()).thenReturn(List.of(
            alert("segment-delay", "delay", List.of("guelph-central", "kitchener"), List.of(segment)),
            alert("corridor-delay", "delay", List.of(), List.of()),
            new RegionalNormalizedAlert(
                "other-line", MetrolinxSourceSystem.GO_SERVICE_ALERTS, "other-line", "regional-le", "delay",
                "Other corridor", "Not relevant", null, OffsetDateTime.parse("2026-07-28T13:00:00Z"), null,
                OffsetDateTime.parse("2026-07-28T13:30:00Z"), List.of(), List.of(), ""
            )
        ));

        var impact = service.impactFor(path);

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.matchedImpacts()).extracting(match -> match.id())
            .containsExactly("corridor-delay", "segment-delay");
        assertThat(impact.matchedImpacts().get(1).matchedSegmentIds()).containsExactly(segment);
        assertThat(impact.matchedImpacts().getFirst().location()).isEqualTo("Kitchener Line");
        assertThat(impact.travelTimeEstimate().status()).isEqualTo("estimated");
    }

    @Test
    void suppressesRegionalImpactsWhenLatestSuccessfulPollIsNotFresh() {
        when(freshness.isFresh()).thenReturn(false);

        var impact = service.impactFor(pathService.path("bloor", "stratford"));

        assertThat(impact.status()).isEqualTo("unavailable");
        assertThat(impact.matchedImpacts()).isEmpty();
        assertThat(impact.detail()).contains("missing or stale");
        assertThat(impact.travelTimeEstimate().confidence()).isEqualTo("low");
    }

    @Test
    void carriesDateOnlyServiceWindowIntoTheNotificationSeam() {
        var path = pathService.path("allandale-waterfront", "union");
        when(freshness.isFresh()).thenReturn(true);
        when(alertStore.findActiveAlerts()).thenReturn(List.of(new RegionalNormalizedAlert(
            "regional-go-123-br", MetrolinxSourceSystem.GO_SERVICE_ALERTS, "M00123", "regional-br",
            "planned-closure", "Aug. 15–16 closure", "No GO train service on the Barrie line.",
            "construction", OffsetDateTime.parse("2026-08-15T00:00:00-04:00"),
            OffsetDateTime.parse("2026-08-17T00:00:00-04:00"),
            OffsetDateTime.parse("2026-08-07T12:00:00-04:00"), List.of(), List.of(),
            "text-date-range", "{}"
        )));

        var match = service.impactFor(path).matchedImpacts().getFirst();

        assertThat(match.closureDates()).isEqualTo("Aug 15–16");
        assertThat(match.notificationServiceEndAt())
            .isEqualTo(OffsetDateTime.parse("2026-08-17T00:00:00-04:00"));
    }

    private RegionalNormalizedAlert alert(String id, String kind, List<String> stationIds, List<String> segments) {
        return new RegionalNormalizedAlert(
            id, MetrolinxSourceSystem.GO_SERVICE_ALERTS, id, "regional-ki", kind,
            "Kitchener corridor delay", "A regional delay", null,
            OffsetDateTime.parse("2026-07-28T13:00:00Z"), null,
            OffsetDateTime.parse("2026-07-28T13:30:00Z"), stationIds, segments, ""
        );
    }
}
