package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleRepository;
import com.calebhabesh.linewatch.regional.RegionalArrivalProperties;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class RegionalScheduleHealthControllerTest {
    @Test
    void reportsCompleteCoverageForActiveGoAndUpImports() {
        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        when(repository.activeCoverage()).thenReturn(RegionalNetworkCatalog.routes().stream()
            .flatMap(route -> route.stationIds().stream().map(stationId ->
                new RegionalGtfsScheduleRepository.Coverage(route.id(), stationId, 1)
            )).toList());
        OffsetDateTime importedAt = OffsetDateTime.parse("2026-07-29T10:00:00-04:00");
        for (String source : List.of("go", "up")) {
            when(repository.activeImport(source)).thenReturn(Optional.of(
                new RegionalGtfsScheduleRepository.ActiveImport(
                    1, source, "https://example.test/" + source, importedAt,
                    LocalDate.parse("2026-07-01"), LocalDate.parse("2026-09-01")
                )
            ));
        }
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setScheduleLookaheadDays(7);
        RegionalScheduleHealthController controller = new RegionalScheduleHealthController(
            repository, properties, Clock.fixed(Instant.parse("2026-07-29T14:00:00Z"), ZoneOffset.UTC)
        );

        RegionalScheduleHealthController.Response response = controller.health();

        assertThat(response.status()).isEqualTo("active");
        assertThat(response.scheduleActive()).isTrue();
        assertThat(response.lookaheadCovered()).isTrue();
        assertThat(response.requiredThrough()).isEqualTo(LocalDate.parse("2026-08-05"));
        assertThat(response.missingStationLines()).isEmpty();
    }

    @Test
    void distinguishesCurrentCoverageFromConfiguredFutureLookahead() {
        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        when(repository.activeCoverage()).thenReturn(RegionalNetworkCatalog.routes().stream()
            .flatMap(route -> route.stationIds().stream().map(stationId ->
                new RegionalGtfsScheduleRepository.Coverage(route.id(), stationId, 1)
            )).toList());
        for (String source : List.of("go", "up")) {
            when(repository.activeImport(source)).thenReturn(Optional.of(
                new RegionalGtfsScheduleRepository.ActiveImport(
                    1, source, "https://example.test/" + source,
                    OffsetDateTime.parse("2026-07-29T10:00:00-04:00"),
                    LocalDate.parse("2026-07-01"), LocalDate.parse("2026-08-01")
                )
            ));
        }
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setScheduleLookaheadDays(7);
        RegionalScheduleHealthController controller = new RegionalScheduleHealthController(
            repository, properties, Clock.fixed(Instant.parse("2026-07-29T14:00:00Z"), ZoneOffset.UTC)
        );

        RegionalScheduleHealthController.Response response = controller.health();

        assertThat(response.scheduleActive()).isTrue();
        assertThat(response.lookaheadCovered()).isFalse();
        assertThat(response.message()).contains("ends before requiredThrough");
    }
}
