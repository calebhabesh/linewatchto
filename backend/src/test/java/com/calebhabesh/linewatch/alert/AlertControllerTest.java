package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;

class AlertControllerTest {
    private final AlertDashboardService dashboardService = mock(AlertDashboardService.class);
    private final AlertController controller = new AlertController(dashboardService);

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
                "No subway service between Jane and Ossington.",
                "Updated 2 min ago",
                List.of("line-2-jane-ossington"),
                true,
                "TTC Live Alert"
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
                "No subway service this weekend.",
                List.of("line-1-finch-eglinton"),
                true,
                "TTC Service Advisory"
            )
        );
        when(dashboardService.plannedClosures()).thenReturn(closures);

        Object response = controller.getAlerts("planned");

        assertThat(response).isEqualTo(closures);
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
                "Updated 2 min ago",
                List.of("line-2-jane-ossington"),
                List.of("123"),
                List.of(),
                "TTC Live Alert"
            )
        );
        when(dashboardService.reducedSpeedZones()).thenReturn(slowdowns);

        Object response = controller.getAlerts("slowdown");

        assertThat(response).isEqualTo(slowdowns);
    }
}
