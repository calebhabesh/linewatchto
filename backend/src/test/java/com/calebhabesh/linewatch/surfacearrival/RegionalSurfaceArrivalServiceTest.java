package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.regional.MetrolinxArrivalClient;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalSurfaceArrivalServiceTest {
    @Test
    void exposesGoBusRowsWithoutInventingABay() {
        OffsetDateTime now = OffsetDateTime.parse("2026-08-14T13:00:00Z");
        MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
        SurfaceArrivalProperties properties = new SurfaceArrivalProperties();
        properties.setRegionalEnabled(true);
        when(client.fetchGoBusNextService("bramalea", "BE")).thenReturn(new RegionalSurfaceArrivalFeed(
            now.minusSeconds(10),
            List.of(new SurfaceArrivalRecord(
                "bramalea", "GO Transit", "bus", "31", "Georgetown", "Guelph",
                now.plusMinutes(8), now.plusMinutes(8), "", "BE", "31-1",
                "Metrolinx GO Next Service", "scheduled"
            ))
        ));
        RegionalSurfaceArrivalService service = new RegionalSurfaceArrivalService(
            client, properties, Clock.fixed(Instant.parse("2026-08-14T13:00:00Z"), ZoneOffset.UTC)
        );

        SurfaceArrivalResponses.SnapshotResponse response = service.arrivals("bramalea");

        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.route()).isEqualTo("31");
            assertThat(arrival.status()).isEqualTo("scheduled");
            assertThat(arrival.bayPlatform()).isEmpty();
        });
    }
}
