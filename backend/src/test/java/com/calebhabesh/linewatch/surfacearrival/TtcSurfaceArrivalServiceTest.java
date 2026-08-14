package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TtcSurfaceArrivalServiceTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-08-14T13:00:00Z");

    @Test
    void returnsOnlyFreshHorizonBoundParentLinkedPredictions() {
        StationRepository stations = mock(StationRepository.class);
        TtcSurfaceArrivalCache cache = mock(TtcSurfaceArrivalCache.class);
        SurfaceArrivalProperties properties = new SurfaceArrivalProperties();
        properties.setTtcEnabled(true);
        properties.setMaxArrivalsPerRoute(1);
        when(stations.findById("broadview")).thenReturn(Optional.of(
            new StationEntity("broadview", "Broadview", 0, 0, false, 1, null)
        ));
        SurfaceArrivalRecord first = row(NOW.plusMinutes(5), "trip-1");
        SurfaceArrivalRecord second = row(NOW.plusMinutes(10), "trip-2");
        when(cache.get("bus")).thenReturn(Optional.empty());
        when(cache.get("streetcar")).thenReturn(Optional.of(new TtcSurfaceArrivalSnapshot(
            "streetcar", NOW.minusSeconds(10), NOW.minusSeconds(9), true,
            Set.of("broadview"), List.of(first, second)
        )));
        TtcSurfaceArrivalService service = new TtcSurfaceArrivalService(
            stations, cache, properties, Clock.fixed(Instant.parse("2026-08-14T13:00:00Z"), ZoneOffset.UTC)
        );

        SurfaceArrivalResponses.SnapshotResponse response = service.arrivals("broadview");

        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.route()).isEqualTo("504");
            assertThat(arrival.minutes()).isEqualTo(5);
            assertThat(arrival.bayPlatform()).isEqualTo("Bay 7");
        });
    }

    private SurfaceArrivalRecord row(OffsetDateTime predictedAt, String tripId) {
        return new SurfaceArrivalRecord(
            "broadview", "TTC", "streetcar", "504", "King", "Dundas West Station",
            predictedAt.minusMinutes(1), predictedAt, "Bay 7", "Broadview Station at Bay 7",
            tripId, TtcSurfaceArrivalIndexer.SOURCE, "live"
        );
    }
}
