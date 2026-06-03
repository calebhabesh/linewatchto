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
            List.of(new AlertDashboardService.SegmentImpact(
                "delay",
                "delay-line-2-jane-ossington",
                "forward",
                List.of("delay-line-2-jane-ossington")
            ))
        ));
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of(
            new AlertDashboardService.StationNodeImpact(
                "sheppard-yonge",
                "delay",
                "delay-line-4-sheppard-yonge",
                "Delay at Sheppard-Yonge"
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
            assertThat(segment.sourceAlertIds()).containsExactly("delay-line-2-jane-ossington");
            assertThat(segment.reducedSpeedZoneIds()).isEmpty();
            assertThat(segment.alertId()).isEqualTo("delay-line-2-jane-ossington");
            assertThat(segment.impacts()).singleElement().satisfies(impact -> {
                assertThat(impact.kind()).isEqualTo("delay");
                assertThat(impact.cardId()).isEqualTo("delay-line-2-jane-ossington");
                assertThat(impact.travelDirection()).isEqualTo("forward");
                assertThat(impact.sourceAlertIds()).containsExactly("delay-line-2-jane-ossington");
            });
        });
        assertThat(response.stationNodeImpacts()).singleElement().satisfies(impact -> {
            assertThat(impact.stationId()).isEqualTo("sheppard-yonge");
            assertThat(impact.kind()).isEqualTo("delay");
            assertThat(impact.cardId()).isEqualTo("delay-line-4-sheppard-yonge");
            assertThat(impact.title()).isEqualTo("Delay at Sheppard-Yonge");
        });
    }

    @Test
    void exposesNonlinearGuideMetadataWithActiveImpacts() {
        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of());
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            new LineSegmentEntity(
                "line-1-king-union",
                "line-1",
                "king",
                "union",
                null,
                null,
                216,
                "southbound",
                "seg-line-1-union-king",
                false,
                null,
                null
            ),
            new LineSegmentEntity(
                "line-1-spadina-st-george",
                "line-1",
                "spadina",
                "st-george",
                null,
                null,
                115,
                "southbound",
                "seg-line-1-spadina-st-george",
                true,
                "station-spadina-1",
                null
            )
        ));
        when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of(
            "line-1-king-union",
            List.of(new AlertDashboardService.SegmentImpact(
                "reduced-speed-zone",
                "reduced-speed-zone-ttc-route-scenario-rsz-union-king-south",
                "bidirectional",
                List.of(
                    "ttc-route-scenario-rsz-union-king-north",
                    "ttc-route-scenario-rsz-union-king-south"
                )
            )),
            "line-1-spadina-st-george",
            List.of(new AlertDashboardService.SegmentImpact(
                "delay",
                "ttc-route-scenario-delay-spadina-st-george",
                "forward",
                List.of("ttc-route-scenario-delay-spadina-st-george")
            ))
        ));
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        MapController.MapResponse response = controller.getMap();

        assertThat(response.segments()).hasSize(2);
        assertThat(response.segments().get(0)).satisfies(segment -> {
            assertThat(segment.id()).isEqualTo("line-1-king-union");
            assertThat(segment.guidePathId()).isEqualTo("seg-line-1-union-king");
            assertThat(segment.guidePathReversed()).isFalse();
            assertThat(segment.overlay()).isEqualTo("delay");
            assertThat(segment.reducedSpeedZoneIds())
                .containsExactly("reduced-speed-zone-ttc-route-scenario-rsz-union-king-south");
        });
        assertThat(response.segments().get(1)).satisfies(segment -> {
            assertThat(segment.id()).isEqualTo("line-1-spadina-st-george");
            assertThat(segment.guidePathId()).isEqualTo("seg-line-1-spadina-st-george");
            assertThat(segment.guidePathReversed()).isTrue();
            assertThat(segment.impacts()).singleElement().satisfies(impact -> {
                assertThat(impact.kind()).isEqualTo("delay");
                assertThat(impact.travelDirection()).isEqualTo("forward");
            });
        });
    }
}

