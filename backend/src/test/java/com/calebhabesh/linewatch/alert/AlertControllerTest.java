package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import static org.mockito.ArgumentMatchers.any;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AlertControllerTest {
    private final AlertDashboardService dashboardService = mock(AlertDashboardService.class);
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();
    private final AlertController controller = new AlertController(dashboardService, cache, cacheProperties);

    @BeforeEach
    void setUp() {
        when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
    }

    @Test
    void returnsActiveAlertsFromDashboardServiceByDefault() {
        List<AlertDashboardService.ActiveAlertDto> alerts = List.of(
            new AlertDashboardService.ActiveAlertDto(
                "ttc-route-100",
                "line-2",
                "2",
                "No service",
                "suspension",
                "Jane to Ossington",
                null,
                "No subway service between Jane and Ossington.",
                OffsetDateTime.parse("2026-06-01T11:55:00Z"),
                OffsetDateTime.parse("2026-06-01T11:58:00Z"),
                List.of("line-2-jane-ossington"),
                true,
                "TTC Live Alerts",
                null,
                null
            )
        );
        when(dashboardService.activeAlerts()).thenReturn(alerts);

        Object response = controller.getAlerts(null);

        assertThat(response).isEqualTo(alerts);
    }

    @Test
    void returnsPlannedClosuresFromDashboardServiceWhenRequested() {
        List<AlertDashboardService.PlannedClosureDto> closures = List.of(
            new AlertDashboardService.PlannedClosureDto(
                "ttc-route-200",
                "line-1",
                "1",
                "Weekend closure",
                "Sat 12:00 AM - Mon 5:00 AM",
                "Finch to Eglinton",
                null,
                "No subway service this weekend.",
                OffsetDateTime.parse("2026-06-06T04:00:00Z"),
                OffsetDateTime.parse("2026-06-01T11:00:00Z"),
                List.of("line-1-finch-eglinton"),
                true,
                "TTC Service Advisory",
                null,
                null
            )
        );
        when(dashboardService.plannedClosures()).thenReturn(closures);

        Object response = controller.getAlerts("planned");

        assertThat(response).isEqualTo(closures);
    }

    @Test
    void returnsDelaysFromDashboardServiceWhenRequested() {
        List<AlertDashboardService.DelayAlertDto> delays = List.of(
            new AlertDashboardService.DelayAlertDto(
                "delay-line-4",
                "line-4",
                "4",
                "Delay",
                "Sheppard-Yonge to Don Mills",
                null,
                "Delays between Sheppard-Yonge and Don Mills.",
                List.of("line-4-sheppard-yonge-don-mills"),
                OffsetDateTime.parse("2026-06-01T22:15:00-04:00"),
                OffsetDateTime.parse("2026-06-01T22:39:00-04:00"),
                "TTC Live Alerts",
                "Signal issue"
            )
        );
        when(dashboardService.delays()).thenReturn(delays);

        Object response = controller.getAlerts("delay");

        assertThat(response).isEqualTo(delays);
    }

    @Test
    void returnsSlowdownsFromDashboardServiceWhenRequested() {
        List<AlertDashboardService.ReducedSpeedZoneDto> slowdowns = List.of(
            new AlertDashboardService.ReducedSpeedZoneDto(
                "reduced-speed-zone-123",
                "line-2",
                "2",
                "Reduced speed",
                "Jane to Ossington",
                "Both directions",
                "Trains are moving slower than usual.",
                OffsetDateTime.parse("2026-06-01T11:55:00Z"),
                OffsetDateTime.parse("2026-06-01T11:58:00Z"),
                List.of("line-2-jane-ossington"),
                List.of("123"),
                List.of(),
                "TTC Live Alerts",
                null,
                null,
                null,
                null,
                null,
                null,
                null
            )
        );
        when(dashboardService.reducedSpeedZones()).thenReturn(slowdowns);

        Object response = controller.getAlerts("slowdown");

        assertThat(response).isEqualTo(slowdowns);
    }
}
