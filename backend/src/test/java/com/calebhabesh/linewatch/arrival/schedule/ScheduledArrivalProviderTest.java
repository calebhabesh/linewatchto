package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalPrediction;
import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ScheduledArrivalProviderTest {
    private GtfsScheduleReadRepository repository;
    private ArrivalProperties properties;
    private ScheduledArrivalProvider provider;

    private final StationResponses.StationLineResponse line1 =
        new StationResponses.StationLineResponse("line-1", "1", "Yonge-University", "#F8C300", "Northbound / Southbound", true, true);

    @BeforeEach
    void setUp() {
        repository = mock(GtfsScheduleReadRepository.class);
        properties = new ArrivalProperties();
        provider = new ScheduledArrivalProvider(
            repository,
            properties,
            Clock.fixed(Instant.parse("2026-06-04T13:00:00Z"), ZoneId.of("America/Toronto"))
        );
    }

    @Test
    void returnsScheduledRowsFromImportCoveringToday() {
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-04"))).thenReturn(Optional.of(7L));
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-03"))).thenReturn(Optional.empty());
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-04"))).thenReturn(List.of("WKD"));
        when(repository.findUpcomingDepartures(
            7L,
            "union",
            List.of("line-1"),
            List.of("WKD"),
            32400,
            37800,
            properties.getMaxArrivalsPerLine()
        )).thenReturn(List.of(
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Northbound to Finch", 32700, LocalDate.parse("2026-06-04"))
        ));

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().lineId()).isEqualTo("line-1");
        assertThat(arrivals.getFirst().direction()).isEqualTo("Northbound to Finch");
        assertThat(arrivals.getFirst().minutes()).isEqualTo(5);
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service");
        assertThat(arrivals.getFirst().status()).isEqualTo("scheduled");
        assertThat(arrivals.getFirst().predictedAt()).isEqualTo(OffsetDateTime.parse("2026-06-04T09:05:00-04:00"));
    }

    @Test
    void fillsArrivalQueueForEachDirectionWhenScheduleHasEnoughTrips() {
        properties.setMaxArrivalsPerLine(3);
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-04"))).thenReturn(Optional.of(7L));
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-03"))).thenReturn(Optional.empty());
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-04"))).thenReturn(List.of("WKD"));
        when(repository.findUpcomingDepartures(
            7L,
            "union",
            List.of("line-1"),
            List.of("WKD"),
            32400,
            37800,
            properties.getMaxArrivalsPerLine()
        )).thenReturn(List.of(
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Northbound to Finch", 32700, LocalDate.parse("2026-06-04")),
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Southbound to Vaughan Metropolitan Centre", 32820, LocalDate.parse("2026-06-04")),
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Northbound to Finch", 33000, LocalDate.parse("2026-06-04")),
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Southbound to Vaughan Metropolitan Centre", 33120, LocalDate.parse("2026-06-04")),
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Northbound to Finch", 33300, LocalDate.parse("2026-06-04")),
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Southbound to Vaughan Metropolitan Centre", 33420, LocalDate.parse("2026-06-04"))
        ));

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(6);
        assertThat(arrivals)
            .filteredOn(arrival -> arrival.direction().equals("Northbound to Finch"))
            .extracting(ArrivalPrediction::label)
            .containsExactly("5 min", "10 min", "15 min");
        assertThat(arrivals)
            .filteredOn(arrival -> arrival.direction().equals("Southbound to Vaughan Metropolitan Centre"))
            .extracting(ArrivalPrediction::label)
            .containsExactly("7 min", "12 min", "17 min");
    }

    @Test
    void returnsUnavailableRowsWhenNoImportCoversCurrentServiceDates() {
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-04"))).thenReturn(Optional.empty());
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-03"))).thenReturn(Optional.empty());

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().status()).isEqualTo("unavailable");
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service unavailable");
        assertThat(arrivals.getFirst().label()).isEqualTo("Unavailable");
    }

    @Test
    void returnsUnavailableRowsWhenCoveringImportsHaveNoActiveServiceIds() {
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-04"))).thenReturn(Optional.of(7L));
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-03"))).thenReturn(Optional.of(6L));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-04"))).thenReturn(List.of());
        when(repository.findActiveServiceIds(6L, LocalDate.parse("2026-06-03"))).thenReturn(List.of());

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().status()).isEqualTo("unavailable");
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service unavailable");
        assertThat(arrivals.getFirst().label()).isEqualTo("Unavailable");
    }

    @Test
    void returnsNoScheduledServiceRowWhenNoTripsExistInHorizon() {
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-04"))).thenReturn(Optional.of(7L));
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-03"))).thenReturn(Optional.empty());
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-04"))).thenReturn(List.of("WKD"));

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().status()).isEqualTo("scheduled");
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service");
        assertThat(arrivals.getFirst().label()).isEqualTo("No scheduled service");
    }

    @Test
    void usesSeparateImportsForTodayAndYesterdayAcrossScheduleBoundary() {
        provider = new ScheduledArrivalProvider(
            repository,
            properties,
            Clock.fixed(Instant.parse("2026-06-21T04:30:00Z"), ZoneId.of("America/Toronto"))
        );

        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-21"))).thenReturn(Optional.of(22L));
        when(repository.findImportIdForServiceDate(LocalDate.parse("2026-06-20"))).thenReturn(Optional.of(21L));
        when(repository.findActiveServiceIds(22L, LocalDate.parse("2026-06-21"))).thenReturn(List.of("SUN"));
        when(repository.findActiveServiceIds(21L, LocalDate.parse("2026-06-20"))).thenReturn(List.of("SAT"));
        when(repository.findUpcomingDepartures(
            eq(22L),
            eq("union"),
            eq(List.of("line-1")),
            eq(List.of("SUN")),
            eq(1800),
            eq(7200),
            eq(properties.getMaxArrivalsPerLine())
        )).thenReturn(List.of(
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Northbound to Finch", 2100, null)
        ));
        when(repository.findUpcomingDepartures(
            eq(21L),
            eq("union"),
            eq(List.of("line-1")),
            eq(List.of("SAT")),
            eq(88200),
            eq(93600),
            eq(properties.getMaxArrivalsPerLine())
        )).thenReturn(List.of(
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Southbound to Vaughan Metropolitan Centre", 88260, null)
        ));

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(2);
        assertThat(arrivals)
            .extracting(ArrivalPrediction::direction)
            .containsExactly(
                "Southbound to Vaughan Metropolitan Centre",
                "Northbound to Finch"
            );
        assertThat(arrivals)
            .extracting(ArrivalPrediction::label)
            .containsExactly("1 min", "5 min");
    }
}
