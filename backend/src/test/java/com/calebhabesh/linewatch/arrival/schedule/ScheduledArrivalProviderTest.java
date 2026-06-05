package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;
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
    void returnsScheduledRowsFromActiveImport() {
        when(repository.findActiveImportId()).thenReturn(Optional.of(7L));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-04"))).thenReturn(List.of("WKD"));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-03"))).thenReturn(List.of());
        when(repository.findUpcomingDepartures(
            7L,
            "union",
            List.of("line-1"),
            List.of("WKD"),
            32400,
            37800,
            properties.getMaxArrivalsPerLine() * 2
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
    void returnsUnavailableRowsWhenNoImportIsActive() {
        when(repository.findActiveImportId()).thenReturn(Optional.empty());

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().status()).isEqualTo("unavailable");
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service unavailable");
        assertThat(arrivals.getFirst().label()).isEqualTo("Unavailable");
    }

    @Test
    void returnsNoScheduledServiceRowWhenNoTripsExistInHorizon() {
        when(repository.findActiveImportId()).thenReturn(Optional.of(7L));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-04"))).thenReturn(List.of("WKD"));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-03"))).thenReturn(List.of());

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().status()).isEqualTo("scheduled");
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service");
        assertThat(arrivals.getFirst().label()).isEqualTo("No scheduled service");
    }
}
