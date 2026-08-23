package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.StationNotFoundException;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class RegionalArrivalControllerTest {
    private final RegionalArrivalService service = mock(RegionalArrivalService.class);
    private final RegionalArrivalController controller = new RegionalArrivalController(service);

    @Test
    void returnsPurposeBuiltStationArrivalSnapshot() {
        RegionalArrivalResponses.SnapshotResponse snapshot = new RegionalArrivalResponses.SnapshotResponse(
            "union", "Union", "available", OffsetDateTime.parse("2026-07-28T19:48:00Z"),
            OffsetDateTime.parse("2026-07-28T19:47:43Z"), "Metrolinx GO Next Service",
            "Fresh Metrolinx regional train estimates.", List.of()
        );
        when(service.arrivals("union")).thenReturn(snapshot);

        var response = controller.arrivals("union");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getBody()).isSameAs(snapshot);
    }

    @Test
    void returnsNotFoundForUnknownRegionalStation() {
        when(service.arrivals("missing")).thenThrow(new StationNotFoundException("missing"));

        var response = controller.arrivals("missing");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
    }
}
