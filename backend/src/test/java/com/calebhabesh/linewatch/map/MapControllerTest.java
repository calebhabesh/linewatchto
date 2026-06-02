package com.calebhabesh.linewatch.map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MapControllerTest {
    private final StationRepository stationRepository = mock(StationRepository.class);
    private final LineSegmentRepository lineSegmentRepository = mock(LineSegmentRepository.class);
    private final AlertDashboardService dashboardService = mock(AlertDashboardService.class);
    private final MapController controller = new MapController(
        stationRepository,
        lineSegmentRepository,
        dashboardService
    );

    @Test
    void appliesActiveAlertImpactToMatchingNetworkSegment() {
        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of());
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            new LineSegmentEntity(
                "line-2-jane-ossington",
                "line-2",
                "jane",
                "ossington",
                null,
                "M 0 0 L 1 1",
                10,
                "eastbound",
                null,
                false,
                "station-jane",
                "station-ossington"
            )
        ));
        when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of(
            "line-2-jane-ossington",
            new AlertDashboardService.SegmentImpact(
                "line-2-jane-ossington",
                "delay",
                "forward",
                List.of("ttc-route-300"),
                List.of("reduced-speed-zone-ttc-route-300"),
                null
            )
        ));

        MapController.MapResponse response = controller.getMap();

        assertThat(response.segments()).singleElement().satisfies(segment -> {
            assertThat(segment.stationAId()).isEqualTo("jane");
            assertThat(segment.stationBId()).isEqualTo("ossington");
            assertThat(segment.stationAAnchorId()).isEqualTo("station-jane");
            assertThat(segment.stationBAnchorId()).isEqualTo("station-ossington");
            assertThat(segment.overlay()).isEqualTo("delay");
            assertThat(segment.travelDirection()).isEqualTo("forward");
            assertThat(segment.sourceAlertIds()).containsExactly("ttc-route-300");
            assertThat(segment.reducedSpeedZoneIds())
                .containsExactly("reduced-speed-zone-ttc-route-300");
            assertThat(segment.alertId()).isNull();
        });
    }
}
