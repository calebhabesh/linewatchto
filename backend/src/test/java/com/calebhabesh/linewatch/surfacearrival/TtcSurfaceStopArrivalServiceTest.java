package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TtcSurfaceStopArrivalServiceTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-11-02T18:00:00Z");
    private static final String WEST = "West - 504A King towards Dundas West Station";
    private static final String EAST = "East - 504A King towards Distillery";

    private final TtcSurfaceStopRepository stops = mock(TtcSurfaceStopRepository.class);
    private final TtcSurfaceScheduledArrivalRepository scheduled = mock(TtcSurfaceScheduledArrivalRepository.class);
    private final TtcSurfaceArrivalCache cache = new TtcSurfaceArrivalCache();
    private final SurfaceArrivalProperties properties = new SurfaceArrivalProperties();
    private TtcSurfaceStopArrivalService service;

    @BeforeEach
    void setUp() {
        properties.setTtcEnabled(true);
        service = new TtcSurfaceStopArrivalService(stops, cache, scheduled, properties,
            Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));
        when(stops.activeCatalog()).thenReturn(Optional.of(new TtcSurfaceStopRepository.ActiveCatalog(
            7, true, LocalDate.parse("2026-11-01"), LocalDate.parse("2026-12-19"))));
        when(stops.findStop(7, "2120")).thenReturn(Optional.of(new TtcSurfaceStopRepository.Stop(
            "2120", "2120", "King St West at Spadina Ave", null, 43.6, -79.39)));
        when(stops.routes(7, "2120")).thenReturn(List.of(
            new TtcSurfaceStopRepository.StopRoute("504", "504", "King", "streetcar", EAST),
            new TtcSurfaceStopRepository.StopRoute("504", "504", "King", "streetcar", WEST),
            new TtcSurfaceStopRepository.StopRoute("510", "510", "Spadina", "streetcar", "")));
        when(scheduled.stopArrivals(any(), any(), any())).thenReturn(List.of(
            scheduledRow("trip-9", WEST, 2),     // before the last prediction, no prediction of its own
            scheduledRow("trip-1", WEST, 3),     // the predicted trip itself
            scheduledRow("trip-20", EAST, 6),
            scheduledRow("trip-10", WEST, 20)));
    }

    @Test
    void freshPredictionsLeadAndScheduledTimesFillTheRestLabelledPerTime() {
        cache.replace(snapshot(NOW.minusSeconds(20), liveRow("trip-1", WEST, 4)));

        var response = service.arrivals("2120").orElseThrow();

        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.live().state()).isEqualTo("live");
        assertThat(response.schedule().serviceEnd()).isEqualTo(LocalDate.parse("2026-12-19"));
        assertThat(response.routes()).extracting(TtcSurfaceStopResponses.RouteDepartures::destination)
            .containsExactly(WEST, EAST, "Spadina");
        assertThat(response.routes().get(0).departures())
            .extracting(TtcSurfaceStopResponses.Departure::status, TtcSurfaceStopResponses.Departure::minutes)
            .containsExactly(tuple("live", 4), tuple("scheduled", 20));
        assertThat(response.routes().get(1).departures())
            .extracting(TtcSurfaceStopResponses.Departure::status, TtcSurfaceStopResponses.Departure::minutes)
            .containsExactly(tuple("scheduled", 6));
        // A route that serves the stop but has nothing scheduled in the next day is still listed.
        assertThat(response.routes().get(2).departures()).isEmpty();
    }

    @Test
    void aRouteWithNothingInTheWindowShowsItsNextScheduledDepartures() {
        when(scheduled.stopArrivals(any(), any(), any())).thenReturn(List.of(
            scheduledRow("trip-20", EAST, 6),
            scheduledRow("trip-21", EAST, 200),   // after the horizon; EAST already has a time in it
            new TtcSurfaceStopArrival("2120", "510", "510", "Spadina", "streetcar", "",
                NOW.plusMinutes(450), null, "night-1", "scheduled"),
            new TtcSurfaceStopArrival("2120", "510", "510", "Spadina", "streetcar", "",
                NOW.plusMinutes(480), null, "night-2", "scheduled")));
        cache.replace(snapshot(NOW.minusSeconds(20), liveRow("trip-1", WEST, 4)));

        var response = service.arrivals("2120").orElseThrow();

        assertThat(response.routes()).filteredOn(route -> route.route().equals("510")).singleElement()
            .satisfies(route -> assertThat(route.departures())
                .extracting(TtcSurfaceStopResponses.Departure::status, TtcSurfaceStopResponses.Departure::minutes)
                .containsExactly(tuple("scheduled", 450), tuple("scheduled", 480)));
        assertThat(response.routes()).filteredOn(route -> route.destination().equals(EAST)).singleElement()
            .satisfies(route -> assertThat(route.departures())
                .extracting(TtcSurfaceStopResponses.Departure::minutes).containsExactly(6));
    }

    @Test
    void staleSourceIsReportedAndItsPredictionsAreNeverShown() {
        cache.replace(snapshot(NOW.minusMinutes(5), liveRow("trip-1", WEST, 4)));

        var response = service.arrivals("2120").orElseThrow();

        assertThat(response.live().state()).isEqualTo("stale");
        assertThat(response.live().sourceUpdatedAt()).isEqualTo(NOW.minusMinutes(5));
        assertThat(response.routes()).flatExtracting(TtcSurfaceStopResponses.RouteDepartures::departures)
            .extracting(TtcSurfaceStopResponses.Departure::status)
            .containsOnly("scheduled");
        assertThat(response.routes().getFirst().departures())
            .extracting(TtcSurfaceStopResponses.Departure::minutes).containsExactly(2, 3, 20);
    }

    @Test
    void missingLiveSourceSaysSoAndKeepsScheduledTimes() {
        var response = service.arrivals("2120").orElseThrow();

        assertThat(response.live().state()).isEqualTo("unavailable");
        assertThat(response.availability()).isEqualTo("available");
    }

    @Test
    void disabledSourceShowsTheStopAndItsRoutesWithoutTimes() {
        properties.setTtcEnabled(false);
        cache.replace(snapshot(NOW, liveRow("trip-1", WEST, 4)));

        var response = service.arrivals("2120").orElseThrow();

        assertThat(response.availability()).isEqualTo("disabled");
        assertThat(response.live().state()).isEqualTo("disabled");
        assertThat(response.stopName()).isEqualTo("King St West at Spadina Ave");
        assertThat(response.routes()).hasSize(3).allSatisfy(route -> assertThat(route.departures()).isEmpty());
    }

    @Test
    void noDeparturesInTheWindowIsAnExplicitState() {
        when(scheduled.stopArrivals(any(), any(), any())).thenReturn(List.of());

        var response = service.arrivals("2120").orElseThrow();

        assertThat(response.availability()).isEqualTo("no-departures");
        assertThat(response.message()).isEqualTo("No departures in the next 2 hours.");
    }

    @Test
    void unknownAndMalformedStopCodesAreNotFound() {
        when(stops.findStop(7, "1")).thenReturn(Optional.empty());
        when(stops.findStopInOtherImport(7, "1")).thenReturn(Optional.empty());

        assertThat(service.arrivals("1")).isEmpty();
        TtcSurfaceStopArrivalService isolated = new TtcSurfaceStopArrivalService(
            mock(TtcSurfaceStopRepository.class), cache, scheduled, properties, Clock.systemUTC());
        assertThat(isolated.arrivals("../2120")).isEmpty();
        assertThat(isolated.arrivals("1234567890123")).isEmpty();
    }

    @Test
    void stopOnlyInAnOlderScheduleSaysItIsNotInTheCurrentSchedule() {
        when(stops.findStop(7, "15100")).thenReturn(Optional.empty());
        when(stops.findStopInOtherImport(7, "15100")).thenReturn(Optional.of(new TtcSurfaceStopRepository.Stop(
            "15100", "15100", "Queen St East at Broadview Ave", null, 43.65, -79.35)));

        var response = service.arrivals("15100").orElseThrow();

        assertThat(response.availability()).isEqualTo("not-in-schedule");
        assertThat(response.stopName()).isEqualTo("Queen St East at Broadview Ave");
        assertThat(response.routes()).isEmpty();
    }

    @Test
    void scheduleWithoutAStopCatalogIsUnavailableNotEmpty() {
        TtcSurfaceStopRepository noCatalog = mock(TtcSurfaceStopRepository.class);
        when(noCatalog.activeCatalog()).thenReturn(Optional.of(new TtcSurfaceStopRepository.ActiveCatalog(
            6, false, LocalDate.parse("2026-11-01"), LocalDate.parse("2026-12-19"))));
        var response = new TtcSurfaceStopArrivalService(noCatalog, cache, scheduled, properties,
            Clock.fixed(NOW.toInstant(), ZoneOffset.UTC)).arrivals("2120").orElseThrow();

        assertThat(response.availability()).isEqualTo("unavailable");
        verifyNoInteractions(scheduled);
    }

    @Test
    void realtimeTripWithoutAStaticHeadsignJoinsTheRoutesOnlyDirection() {
        when(stops.routes(7, "2120")).thenReturn(List.of(
            new TtcSurfaceStopRepository.StopRoute("510", "510", "Spadina", "streetcar", "North - 510 Spadina")));
        when(scheduled.stopArrivals(any(), any(), any())).thenReturn(List.of());
        cache.replace(snapshot(NOW, new TtcSurfaceStopArrival("2120", "510", "510", "Spadina", "streetcar", "",
            null, NOW.plusMinutes(3), "-20678", "live")));

        var response = service.arrivals("2120").orElseThrow();

        assertThat(response.routes()).singleElement().satisfies(route -> {
            assertThat(route.destination()).isEqualTo("North - 510 Spadina");
            assertThat(route.departures()).extracting(TtcSurfaceStopResponses.Departure::status).containsExactly("live");
        });
    }

    private static TtcSurfaceArrivalSnapshot snapshot(OffsetDateTime updatedAt, TtcSurfaceStopArrival row) {
        return new TtcSurfaceArrivalSnapshot("streetcar", updatedAt, updatedAt, true, Set.of(), List.of(),
            Map.of("2120", List.of(row)));
    }

    private static TtcSurfaceStopArrival liveRow(String trip, String destination, int minutes) {
        return new TtcSurfaceStopArrival("2120", "504", "504", "King", "streetcar", destination,
            NOW.plusMinutes(minutes - 1), NOW.plusMinutes(minutes), trip, "live");
    }

    private static TtcSurfaceStopArrival scheduledRow(String trip, String destination, int minutes) {
        return new TtcSurfaceStopArrival("2120", "504", "504", "King", "streetcar", destination,
            NOW.plusMinutes(minutes), null, trip, "scheduled");
    }
}
