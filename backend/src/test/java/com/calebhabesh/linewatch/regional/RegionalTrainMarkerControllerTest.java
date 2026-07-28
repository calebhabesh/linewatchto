package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalTrainMarkerControllerTest {
    @Test
    void returnsPurposeBuiltRegionalMarkerSnapshot() {
        RegionalTrainMarkerService service = mock(RegionalTrainMarkerService.class);
        OffsetDateTime timestamp = OffsetDateTime.parse("2026-07-28T19:48:00Z");
        when(service.markers()).thenReturn(new RegionalTrainMarkerService.Snapshot(
            true, "available", MetrolinxVehiclePositionClient.GO_SOURCE,
            "Fresh schematic regional train markers.", RegionalTrainMarkerService.DISCLAIMER,
            timestamp.minusSeconds(20), timestamp, List.of(new RegionalTrainMarkerRecord(
                "go-3775", "regional-ki", "Outbound", "forward", "segment-ki-bloor-weston",
                "bloor", "weston", "weston", 0.5, "cab-3775", "3775", timestamp.minusSeconds(20),
                MetrolinxVehiclePositionClient.GO_SOURCE
            ))
        ));

        RegionalTrainMarkerController.Response response = new RegionalTrainMarkerController(service).trains();

        assertThat(response.fresh()).isTrue();
        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.lineId()).isEqualTo("regional-ki");
            assertThat(marker.segmentId()).isEqualTo("segment-ki-bloor-weston");
            assertThat(marker.progress()).isEqualTo(0.5);
        });
        assertThat(response.disclaimer()).contains("not exact physical train locations");
    }
}
