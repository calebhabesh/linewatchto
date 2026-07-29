package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalScheduledArrivalProviderTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-29T16:00:00Z"), ZoneOffset.UTC);

    @Test
    void scansLaterServiceDaysForTheNextDepartureInAnotherDirection() {
        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setScheduleEnabled(true);
        properties.setScheduleLookaheadDays(1);
        properties.setMaxArrivalsPerLine(4);
        LocalDate today = LocalDate.of(2026, 7, 29);
        LocalDate tomorrow = today.plusDays(1);
        when(repository.upcoming("milton", List.of("regional-mi"), today, 43_200, 172_799))
            .thenReturn(List.of(
                departure("Milton GO", 60_000, "MI201"),
                departure("Milton GO", 63_600, "MI203"),
                departure("Milton GO", 67_200, "MI205"),
                departure("Milton GO", 70_800, "MI207")
            ));
        when(repository.upcoming("milton", List.of("regional-mi"), tomorrow, 0, 172_799))
            .thenReturn(List.of(departure("Union Station", 25_200, "MI100")));

        RegionalScheduledArrivalProvider provider =
            new RegionalScheduledArrivalProvider(repository, properties, CLOCK);

        List<RegionalArrivalRecord> arrivals = provider.arrivals("milton", List.of("regional-mi"));

        assertThat(arrivals).extracting(RegionalArrivalRecord::direction)
            .containsExactly("Milton GO", "Milton GO", "Milton GO", "Milton GO", "Union Station");
        assertThat(arrivals.getLast().predictedAt().toLocalDate()).isEqualTo(tomorrow);
    }

    private RegionalGtfsScheduleRepository.ScheduledDeparture departure(
        String direction,
        int departureSeconds,
        String tripId
    ) {
        return new RegionalGtfsScheduleRepository.ScheduledDeparture(
            "regional-mi", direction, departureSeconds, "", tripId,
            LocalDate.of(2026, 7, 29), OffsetDateTime.parse("2026-07-29T10:00:00-04:00")
        );
    }
}
