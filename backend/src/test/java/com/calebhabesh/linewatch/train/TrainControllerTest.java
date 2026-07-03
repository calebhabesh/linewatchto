package com.calebhabesh.linewatch.train;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.live.EstimatedTrainMarker;
import com.calebhabesh.linewatch.arrival.live.EstimatedTrainMarkerSnapshot;
import com.calebhabesh.linewatch.arrival.live.GtfsRtSubwayTrainMarkerService;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class TrainControllerTest {
    private final GtfsRtSubwayTrainMarkerService markerService = mock(GtfsRtSubwayTrainMarkerService.class);
    private final TrainController controller = new TrainController(markerService);

    @Test
    void returnsEstimatedTrainMarkerSnapshot() {
        OffsetDateTime generatedAt = OffsetDateTime.parse("2026-07-02T10:00:00Z");
        OffsetDateTime feedCreatedAt = generatedAt.minusSeconds(10);
        OffsetDateTime predictedAt = generatedAt.plusSeconds(80);
        when(markerService.estimatedMarkers()).thenReturn(new EstimatedTrainMarkerSnapshot(
            true,
            "TTC GTFS-RT subway trip updates",
            "Fresh TTC GTFS-RT subway trip updates are available.",
            "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
            feedCreatedAt,
            generatedAt,
            List.of(new EstimatedTrainMarker(
                "line-2:126789:232:bay",
                "line-2",
                "Eastbound",
                "forward",
                "line-2-st-george-bay",
                "st-george",
                "bay",
                "bay",
                0.333,
                120,
                predictedAt,
                "232",
                "126789",
                feedCreatedAt,
                generatedAt
            ))
        ));

        TrainController.TrainResponse response = controller.trains();

        assertThat(response.fresh()).isTrue();
        assertThat(response.source()).isEqualTo("TTC GTFS-RT subway trip updates");
        assertThat(response.disclaimer()).contains("not physical train positions");
        assertThat(response.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.id()).isEqualTo("line-2:126789:232:bay");
            assertThat(marker.lineId()).isEqualTo("line-2");
            assertThat(marker.progress()).isEqualTo(0.333);
            assertThat(marker.segmentTravelSeconds()).isEqualTo(120);
        });
    }
}
