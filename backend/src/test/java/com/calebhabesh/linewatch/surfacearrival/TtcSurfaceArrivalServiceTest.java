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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TtcSurfaceArrivalServiceTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-08-14T13:00:00Z");

    @Test
    void fillsMissingBaysWithSchedulesButFreshPredictionsWin() {
        StationRepository stations = mock(StationRepository.class);
        when(stations.findById("broadview")).thenReturn(Optional.of(
            new StationEntity("broadview", "Broadview", 0, 0, false, 1, null)));
        TtcSurfaceArrivalCache cache = new TtcSurfaceArrivalCache();
        TtcSurfaceScheduleCatalog catalog = mock(TtcSurfaceScheduleCatalog.class);
        when(catalog.active()).thenReturn(new TtcSurfaceScheduleCatalog.Catalog(
            1, Map.of(), Map.of(), Map.of(), Map.of(), Set.of("broadview")));
        var scheduled = mock(TtcSurfaceScheduledArrivalRepository.class);
        SurfaceArrivalProperties properties = new SurfaceArrivalProperties();
        properties.setTtcEnabled(true);
        var live = row(NOW.plusMinutes(5), "new-realtime-id");
        var sameBay = new SurfaceArrivalRecord("broadview", "TTC", live.mode(), live.route(), live.routeName(),
            "Different static headsign", NOW.plusMinutes(4), null, live.bayPlatform(), live.stopName(),
            "static-id", TtcSurfaceScheduledArrivalRepository.SOURCE, "scheduled");
        var otherBay = new SurfaceArrivalRecord("broadview", "TTC", live.mode(), live.route(), live.routeName(),
            "Other direction", NOW.plusMinutes(8), null, "Bay 9", "Broadview at Bay 9",
            "other-id", TtcSurfaceScheduledArrivalRepository.SOURCE, "scheduled");
        when(scheduled.arrivals("broadview", NOW, properties.getHorizon())).thenReturn(List.of(sameBay, otherBay));
        cache.replace(new TtcSurfaceArrivalSnapshot("streetcar", NOW, NOW, true, Set.of("broadview"), List.of(live)));
        var service = new TtcSurfaceArrivalService(stations, cache, catalog, properties,
            Clock.fixed(NOW.toInstant(), ZoneOffset.UTC), scheduled);
        assertThat(service.arrivals("broadview").arrivals()).hasSize(2).anySatisfy(arrival -> {
            assertThat(arrival.status()).isEqualTo("scheduled");
            assertThat(arrival.predictedAt()).isNull();
            assertThat(arrival.scheduledAt()).isEqualTo(NOW.plusMinutes(8));
            assertThat(arrival.minutes()).isEqualTo(8);
        });
        cache.replace(new TtcSurfaceArrivalSnapshot("streetcar", NOW.minusHours(1), NOW, true,
            Set.of("broadview"), List.of(live)));
        assertThat(service.arrivals("broadview").arrivals()).hasSize(2)
            .allSatisfy(arrival -> assertThat(arrival.status()).isEqualTo("scheduled"));
    }

    @Test
    void returnsOnlyFreshHorizonBoundParentLinkedPredictions() {
        StationRepository stations = mock(StationRepository.class);
        TtcSurfaceArrivalCache cache = mock(TtcSurfaceArrivalCache.class);
        TtcSurfaceScheduleCatalog catalog = mock(TtcSurfaceScheduleCatalog.class);
        when(catalog.active()).thenReturn(new TtcSurfaceScheduleCatalog.Catalog(
            1L, Map.of(), Map.of(), Map.of(), Map.of(), Set.of("broadview")
        ));
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
            stations, cache, catalog, properties, Clock.fixed(Instant.parse("2026-08-14T13:00:00Z"), ZoneOffset.UTC), mock(TtcSurfaceScheduledArrivalRepository.class)
        );

        SurfaceArrivalResponses.SnapshotResponse response = service.arrivals("broadview");

        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.route()).isEqualTo("504");
            assertThat(arrival.minutes()).isEqualTo(5);
            assertThat(arrival.bayPlatform()).isEqualTo("Bay 7");
        });
    }

    @Test
    void mergesCatalogConnectionsWhenNoLiveArrivalsInWindow() {
        StationRepository stations = mock(StationRepository.class);
        TtcSurfaceArrivalCache cache = mock(TtcSurfaceArrivalCache.class);
        TtcSurfaceScheduleCatalog catalog = mock(TtcSurfaceScheduleCatalog.class);
        when(catalog.active()).thenReturn(new TtcSurfaceScheduleCatalog.Catalog(
            1L,
            Map.of(),
            Map.of(),
            Map.of(),
            Map.of("keele", List.of(
                new TtcSurfaceScheduleCatalog.Connection(
                    "keele", "8901", "89", "bus", "89", "Weston", "To Albion Rd", "Bay 1", "Keele Station at Bay 1"
                ),
                new TtcSurfaceScheduleCatalog.Connection(
                    "keele", "98901", "989", "bus", "989", "Weston Express", "To Steeles Ave", "Bay 2", "Keele Station at Bay 2"
                )
            )),
            Set.of("keele")
        ));
        SurfaceArrivalProperties properties = new SurfaceArrivalProperties();
        properties.setTtcEnabled(true);
        when(stations.findById("keele")).thenReturn(Optional.of(
            new StationEntity("keele", "Keele", 0, 0, false, 2, null)
        ));
        when(cache.get("bus")).thenReturn(Optional.of(new TtcSurfaceArrivalSnapshot(
            "bus", NOW.minusSeconds(10), NOW.minusSeconds(9), true,
            Set.of("keele"), List.of()
        )));
        when(cache.get("streetcar")).thenReturn(Optional.empty());
        TtcSurfaceArrivalService service = new TtcSurfaceArrivalService(
            stations, cache, catalog, properties, Clock.fixed(Instant.parse("2026-08-14T13:00:00Z"), ZoneOffset.UTC), mock(TtcSurfaceScheduledArrivalRepository.class)
        );

        SurfaceArrivalResponses.SnapshotResponse response = service.arrivals("keele");

        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.arrivals()).hasSize(2);
        assertThat(response.arrivals().get(0).route()).isEqualTo("89");
        assertThat(response.arrivals().get(0).status()).isEqualTo("scheduled");
        assertThat(response.arrivals().get(1).route()).isEqualTo("989");
        assertThat(response.arrivals().get(1).status()).isEqualTo("scheduled");
    }

    @Test
    void returnsNoServiceMessageWhenStationHasNoMappedConnections() {
        StationRepository stations = mock(StationRepository.class);
        TtcSurfaceArrivalCache cache = mock(TtcSurfaceArrivalCache.class);
        TtcSurfaceScheduleCatalog catalog = mock(TtcSurfaceScheduleCatalog.class);
        when(catalog.active()).thenReturn(TtcSurfaceScheduleCatalog.Catalog.empty());
        SurfaceArrivalProperties properties = new SurfaceArrivalProperties();
        properties.setTtcEnabled(true);
        when(stations.findById("bay")).thenReturn(Optional.of(
            new StationEntity("bay", "Bay", 0, 0, false, 2, null)
        ));
        when(cache.get("bus")).thenReturn(Optional.of(new TtcSurfaceArrivalSnapshot(
            "bus", NOW.minusSeconds(10), NOW.minusSeconds(9), true,
            Set.of("broadview"), List.of()
        )));
        when(cache.get("streetcar")).thenReturn(Optional.empty());
        TtcSurfaceArrivalService service = new TtcSurfaceArrivalService(
            stations, cache, catalog, properties, Clock.fixed(Instant.parse("2026-08-14T13:00:00Z"), ZoneOffset.UTC), mock(TtcSurfaceScheduledArrivalRepository.class)
        );

        SurfaceArrivalResponses.SnapshotResponse response = service.arrivals("bay");

        assertThat(response.availability()).isEqualTo("no-service");
        assertThat(response.message()).isEqualTo("No surface connections originating at this station.");
        assertThat(response.arrivals()).isEmpty();
    }

    private SurfaceArrivalRecord row(OffsetDateTime predictedAt, String tripId) {
        return new SurfaceArrivalRecord(
            "broadview", "TTC", "streetcar", "504", "King", "Dundas West Station",
            predictedAt.minusMinutes(1), predictedAt, "Bay 7", "Broadview Station at Bay 7",
            tripId, TtcSurfaceArrivalIndexer.SOURCE, "live"
        );
    }
}
