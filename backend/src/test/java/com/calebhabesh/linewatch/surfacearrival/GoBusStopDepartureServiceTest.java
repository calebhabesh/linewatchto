package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.regional.MetrolinxArrivalClient;
import com.calebhabesh.linewatch.regional.MetrolinxClientException;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class GoBusStopDepartureServiceTest {
    private static final Instant NOW = Instant.parse("2026-11-03T14:00:00Z");
    private static final OffsetDateTime T = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC);

    private final MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
    private final SurfaceArrivalProperties properties = new SurfaceArrivalProperties();
    private final MutableClock clock = new MutableClock(NOW);
    private final GoBusStopCatalog catalog = new GoBusStopCatalog(new ByteArrayInputStream("""
        stop_code,name,routes
        00008,Yonge St. @ Sheppard Ave.,19 27 67 96
        02314,"Hwy 407 @ Jane, Bus Terminal",30 47
        """.getBytes(StandardCharsets.UTF_8)));
    private final GoBusStopDepartureService service = new GoBusStopDepartureService(catalog, client, properties, clock);

    private static SurfaceArrivalRecord row(String route, String destination, OffsetDateTime scheduled, OffsetDateTime computed) {
        return new SurfaceArrivalRecord("00008", "GO Transit", "bus", route, "Mississauga / North York", destination,
            scheduled, computed == null ? scheduled : computed, "", "00008", route + "001",
            "Metrolinx GO Next Service", computed == null ? "scheduled" : "live");
    }

    @Test
    void onlyStopsInTheCatalogAreFetched() {
        properties.setRegionalEnabled(true);
        assertThat(service.departures("99999")).isEmpty();
        assertThat(service.departures("../UN")).isEmpty();
        assertThat(service.departures("UN")).isEmpty();
        verify(client, never()).fetchGoBusNextService(anyString(), anyList());
        assertThat(catalog.find("02314")).hasValueSatisfying(stop -> {
            assertThat(stop.name()).isEqualTo("Hwy 407 @ Jane, Bus Terminal");
            assertThat(stop.routes()).containsExactly("30", "47");
        });
    }

    @Test
    void disabledSourceSaysSoWithoutCallingMetrolinx() {
        var response = service.departures("00008").orElseThrow();
        assertThat(response.availability()).isEqualTo("disabled");
        assertThat(response.departures()).isEmpty();
        assertThat(response.routes()).containsExactly("19", "27", "67", "96");
        verify(client, never()).fetchGoBusNextService(anyString(), anyList());
    }

    @Test
    void liveOnlyWhenTheComputedTimeDiffersFromTheSchedule() {
        properties.setRegionalEnabled(true);
        when(client.fetchGoBusNextService(eq("00008"), eq(List.of("00008")))).thenReturn(new RegionalSurfaceArrivalFeed(
            T.minusSeconds(20),
            List.of(
                row("19", "Square One", T.plusMinutes(10), T.plusMinutes(12).plusSeconds(30)),
                row("27", "Milton GO", T.plusMinutes(20), T.plusMinutes(20)),
                row("96", "Oshawa", T.plusMinutes(30), null),
                new SurfaceArrivalRecord("00008", "GO Transit", "bus", "67", "Keswick", "Keswick",
                    null, T.plusMinutes(5), "", "00008", "67001", "Metrolinx GO Next Service", "live")
            )));

        var response = service.departures("00008").orElseThrow();

        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.networkId()).isEqualTo("regional");
        assertThat(response.departures()).extracting(GoBusStopResponses.DepartureResponse::route)
            .containsExactly("19", "27", "96");
        var live = response.departures().get(0);
        assertThat(live.status()).isEqualTo("live");
        assertThat(live.at()).isEqualTo(T.plusMinutes(12).plusSeconds(30));
        assertThat(live.minutes()).isEqualTo(13);
        assertThat(response.departures().get(1).status()).isEqualTo("scheduled");
        assertThat(response.departures().get(1).predictedAt()).isNull();
        assertThat(response.departures().get(2).status()).isEqualTo("scheduled");
    }

    @Test
    void staleSourceShowsNoTimes() {
        properties.setRegionalEnabled(true);
        when(client.fetchGoBusNextService(anyString(), anyList())).thenReturn(new RegionalSurfaceArrivalFeed(
            T.minusMinutes(10), List.of(row("19", "Square One", T.plusMinutes(10), T.plusMinutes(11)))));

        var response = service.departures("00008").orElseThrow();

        assertThat(response.availability()).isEqualTo("unavailable");
        assertThat(response.message()).contains("stale");
        assertThat(response.departures()).isEmpty();
    }

    @Test
    void failedSourceIsUnavailableAndCachedForTheWindow() {
        properties.setRegionalEnabled(true);
        when(client.fetchGoBusNextService(anyString(), anyList())).thenThrow(new MetrolinxClientException("down"));

        assertThat(service.departures("00008").orElseThrow().availability()).isEqualTo("unavailable");
        assertThat(service.departures("00008").orElseThrow().availability()).isEqualTo("unavailable");
        verify(client, times(1)).fetchGoBusNextService(anyString(), anyList());
    }

    @Test
    void cachedRowsAreReusedAndMinutesCountDown() {
        properties.setRegionalEnabled(true);
        when(client.fetchGoBusNextService(anyString(), anyList())).thenReturn(new RegionalSurfaceArrivalFeed(
            T, List.of(row("19", "Square One", T.plusMinutes(10), null))));

        assertThat(service.departures("00008").orElseThrow().departures().getFirst().minutes()).isEqualTo(10);
        clock.advance(Duration.ofSeconds(20));
        assertThat(service.departures("00008").orElseThrow().departures().getFirst().minutes()).isEqualTo(10);
        clock.advance(Duration.ofSeconds(50));
        service.departures("00008");
        verify(client, times(2)).fetchGoBusNextService(anyString(), anyList());
    }

    @Test
    void upstreamReadsStayWithinThePerMinuteBudget() {
        properties.setRegionalEnabled(true);
        properties.setRegionalStopFetchesPerMinute(1);
        when(client.fetchGoBusNextService(anyString(), anyList())).thenReturn(new RegionalSurfaceArrivalFeed(T, List.of()));

        assertThat(service.departures("00008").orElseThrow().availability()).isEqualTo("no-departures");
        var busy = service.departures("02314").orElseThrow();
        assertThat(busy.availability()).isEqualTo("unavailable");
        assertThat(busy.message()).contains("busy");
        verify(client, times(1)).fetchGoBusNextService(anyString(), anyList());
        clock.advance(Duration.ofSeconds(61));
        assertThat(service.departures("02314").orElseThrow().availability()).isEqualTo("no-departures");
    }

    @Test
    void bundledCatalogHasTheGeneratedStops() {
        GoBusStopCatalog bundled = new GoBusStopCatalog();
        assertThat(bundled.size()).isGreaterThan(500);
        assertThat(bundled.find("UN")).isEmpty();
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
