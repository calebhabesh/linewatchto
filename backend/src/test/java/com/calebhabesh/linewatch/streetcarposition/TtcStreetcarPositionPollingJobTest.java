package com.calebhabesh.linewatch.streetcarposition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.surfacearrival.TtcSurfaceScheduleCatalog;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** One feed read serves streetcars (S4) and buses (S8); each flag fills only its own positions. */
class TtcStreetcarPositionPollingJobTest {
    private static final String FEED = """
        header {
          timestamp: 1793714400
        }
        entity {
          id: "1"
          vehicle {
            trip {
              trip_id: "t-504"
            }
            position {
              latitude: 43.6445
              longitude: -79.399
            }
            timestamp: 1793714380
            vehicle {
              id: "4508"
            }
          }
        }
        entity {
          id: "2"
          vehicle {
            trip {
              trip_id: "t-29"
            }
            position {
              latitude: 43.66
              longitude: -79.435
            }
            timestamp: 1793714380
            vehicle {
              id: "8100"
            }
          }
        }
        """;

    private final StreetcarPositionProperties streetcarProperties = new StreetcarPositionProperties();
    private final BusPositionProperties busProperties = new BusPositionProperties();
    private final TtcVehiclePositionClient client = mock(TtcVehiclePositionClient.class);
    private final TtcSurfaceScheduleCatalog schedule = mock(TtcSurfaceScheduleCatalog.class);
    private final TtcStreetcarPositionCache streetcarCache = new TtcStreetcarPositionCache();
    private final TtcBusPositionCache busCache = new TtcBusPositionCache();
    private final TtcStreetcarPositionPollingJob job = new TtcStreetcarPositionPollingJob(
        streetcarProperties, client, new TtcVehiclePositionParser(), new TtcStreetcarPositionIndexer(schedule),
        streetcarCache, busProperties, new TtcBusPositionIndexer(schedule), busCache,
        Clock.fixed(Instant.ofEpochSecond(1793714401), ZoneOffset.UTC));

    @BeforeEach
    void setUp() {
        when(schedule.active()).thenReturn(new TtcSurfaceScheduleCatalog.Catalog(
            42,
            Map.of(
                "504", new TtcSurfaceScheduleCatalog.Route("504", "504", "King", "streetcar"),
                "29", new TtcSurfaceScheduleCatalog.Route("29", "29", "Dufferin", "bus")),
            Map.of(),
            Map.of(
                "t-504", new TtcSurfaceScheduleCatalog.Trip("t-504", "504", "East - 504 King towards Broadview Station"),
                "t-29", new TtcSurfaceScheduleCatalog.Trip("t-29", "29", "North - 29 Dufferin towards Wilson Station")),
            Map.of(),
            Set.of()));
        when(client.fetch(any())).thenReturn(FEED);
    }

    @Test
    void bothOnReadTheFeedOnceForStreetcarsAndBuses() {
        streetcarProperties.setEnabled(true);
        busProperties.setEnabled(true);

        job.refresh();

        verify(client, times(1)).fetch(any());
        assertThat(streetcarCache.get()).hasValueSatisfying(s ->
            assertThat(s.vehicles()).extracting(TtcStreetcarPositionSnapshot.StreetcarPosition::vehicleId).containsExactly("4508"));
        assertThat(busCache.get()).hasValueSatisfying(s ->
            assertThat(s.vehicles()).extracting(TtcBusPositionSnapshot.BusPosition::vehicleId).containsExactly("8100"));
    }

    @Test
    void busesAloneStillReadTheFeedButLeaveStreetcarsEmpty() {
        busProperties.setEnabled(true);

        job.refresh();

        verify(client, times(1)).fetch(any());
        assertThat(streetcarCache.get()).isEmpty();
        assertThat(busCache.get()).isPresent();
    }

    @Test
    void streetcarsAloneLeaveBusesEmpty() {
        streetcarProperties.setEnabled(true);

        job.refresh();

        assertThat(streetcarCache.get()).isPresent();
        assertThat(busCache.get()).isEmpty();
    }

    @Test
    void bothOffReadNothing() {
        job.refresh();

        verify(client, never()).fetch(any());
    }

    @Test
    void aFailedReadKeepsTheLastGoodPositions() {
        streetcarProperties.setEnabled(true);
        busProperties.setEnabled(true);
        job.refresh();
        var streetcars = streetcarCache.get().orElseThrow();
        var buses = busCache.get().orElseThrow();

        when(client.fetch(any())).thenThrow(new IllegalStateException("timeout"));
        job.refresh();

        assertThat(streetcarCache.get()).containsSame(streetcars);
        assertThat(busCache.get()).containsSame(buses);
    }
}
