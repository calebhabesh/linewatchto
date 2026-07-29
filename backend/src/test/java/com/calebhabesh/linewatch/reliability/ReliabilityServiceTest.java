package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class ReliabilityServiceTest {
    private static final Instant NOW = Instant.parse("2026-07-28T16:00:00Z");
    private final ReliabilityRepository repository = Mockito.mock(ReliabilityRepository.class);
    private final ReliabilityService service =
        new ReliabilityService(repository, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void returnsCoverageLabeledTtcLineHistoryWithoutInventingAScore() {
        when(repository.firstSnapshot("ttc"))
            .thenReturn(OffsetDateTime.parse("2026-07-01T16:00:00Z"));
        when(repository.aggregateLines(
            Mockito.eq("ttc"), Mockito.any(OffsetDateTime.class), Mockito.any(OffsetDateTime.class)
        )).thenReturn(List.of(new ReliabilityRepository.AggregateRow(
            "line-1", "1", "Yonge-University", 8, 1, 24L, 310L
        )));

        ReliabilityResponses.ReliabilityResponse response = service.lines("ttc");

        assertThat(response.observedDays()).isEqualTo(28);
        assertThat(response.confidence()).isEqualTo("high");
        assertThat(response.metrics().getFirst().incidents()).isEqualTo(8);
        assertThat(response.metrics().getFirst().medianDurationMinutes()).isEqualTo(24);
    }

    @Test
    void labelsNewRegionalHistoryAsLowConfidenceAndUsesCatalogNames() {
        when(repository.firstSnapshot("regional"))
            .thenReturn(OffsetDateTime.parse("2026-07-27T16:00:00Z"));
        when(repository.aggregateLines(
            Mockito.eq("regional"), Mockito.any(OffsetDateTime.class), Mockito.any(OffsetDateTime.class)
        )).thenReturn(List.of(new ReliabilityRepository.AggregateRow(
            "regional-le", "", "", 2, 0, 18L, 36L
        )));

        ReliabilityResponses.ReliabilityResponse response = service.lines("regional");

        assertThat(response.confidence()).isEqualTo("low");
        assertThat(response.metrics()).anySatisfy(metric -> {
            assertThat(metric.number()).isEqualTo("LE");
            assertThat(metric.label()).isEqualTo("Lakeshore East");
            assertThat(metric.incidents()).isEqualTo(2);
        });
        assertThat(response.metrics()).hasSize(8);
    }
}
