package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
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
        when(repository.aggregate(
            Mockito.eq("ttc"), Mockito.isNull(), Mockito.any(), Mockito.any()
        )).thenReturn(new ReliabilityRepository.ReliabilityAggregation(
            List.of(new ReliabilityRepository.AggregateRow(
                "line-1", "1", "Yonge-University", 8, 1, 24L,
                250L, 30_000L, 310L, 0.8
            )),
            List.of(
                new ReliabilityRepository.BreakdownRow("delay", 6, 120L),
                new ReliabilityRepository.BreakdownRow("reduced_speed_zone", 2, 190L)
            ),
            42_768L, 99.0, "published TTC GTFS schedules", true, 100.0,
            ReliabilityRepository.CancellationAggregation.unavailable()
        ));

        ReliabilityResponses.ReliabilityResponse response = service.lines("ttc");

        assertThat(response.observedDays()).isEqualTo(30);
        assertThat(response.confidence()).isEqualTo("high");
        assertThat(response.coverageLabel()).isEqualTo("99.0% polling · 100.0% schedule-date coverage");
        assertThat(response.metrics().getFirst().incidents()).isEqualTo(8);
        assertThat(response.metrics().getFirst().medianDurationMinutes()).isEqualTo(24);
        assertThat(response.metrics().getFirst().serviceImpactMinutes()).isEqualTo(250);
        assertThat(response.metrics().getFirst().incidentDisruptionMinutes()).isEqualTo(310);
        assertThat(response.message()).contains("an alert anywhere on it")
            .contains("100% does not mean the entire line was disrupted")
            .contains("Incident-hours add overlapping alerts");
        assertThat(response.breakdown()).hasSize(2);
        assertThat(response.breakdown().getFirst().label()).isEqualTo("Delays");
        assertThat(response.breakdown().getFirst().percentage()).isEqualTo(38.7);
    }

    @Test
    void labelsNewRegionalHistoryAsLowConfidenceAndUsesCatalogNames() {
        when(repository.aggregate(
            Mockito.eq("regional"), Mockito.isNull(), Mockito.any(), Mockito.any()
        )).thenReturn(new ReliabilityRepository.ReliabilityAggregation(
            List.of(new ReliabilityRepository.AggregateRow(
                "regional-le", "LE", "Lakeshore East", 2, 0, 18L,
                30L, 300L, 36L, 10.0
            )),
            List.of(new ReliabilityRepository.BreakdownRow("delay", 2, 36L)),
            20_000L, 46.3, "published GO/UP GTFS train schedules", true, 90.0,
            new ReliabilityRepository.CancellationAggregation(
                3, 2, 18_000L, 41.7,
                List.of(new ReliabilityRepository.CancellationRow("regional-le", 3, 2))
            )
        ));

        ReliabilityResponses.ReliabilityResponse response = service.lines("regional");

        assertThat(response.confidence()).isEqualTo("low");
        assertThat(response.metrics()).anySatisfy(metric -> {
            assertThat(metric.number()).isEqualTo("LE");
            assertThat(metric.label()).isEqualTo("Lakeshore East");
            assertThat(metric.incidents()).isEqualTo(2);
        });
        assertThat(response.metrics()).hasSize(1);
        assertThat(response.breakdown()).hasSize(1);
        assertThat(response.message()).contains("100% does not mean the entire corridor was disrupted");
        assertThat(response.trainCancellations().cancellations()).isEqualTo(3);
        assertThat(response.trainCancellations().scheduleMatchedCancellations()).isEqualTo(2);
        assertThat(response.trainCancellations().sourceLabeledCancellations()).isEqualTo(1);
        assertThat(response.trainCancellations().corridors()).singleElement().satisfies(corridor -> {
            assertThat(corridor.number()).isEqualTo("LE");
            assertThat(corridor.label()).isEqualTo("Lakeshore East");
        });
    }

    @Test
    void confidenceUsesTheWeakerOfPollingAndScheduleCoverage() {
        when(repository.aggregate(
            Mockito.eq("ttc"), Mockito.isNull(), Mockito.any(), Mockito.any()
        )).thenReturn(new ReliabilityRepository.ReliabilityAggregation(
            List.of(), List.of(), 42_768L, 99.0,
            "published TTC GTFS schedules", true, 80.0,
            ReliabilityRepository.CancellationAggregation.unavailable()
        ));

        ReliabilityResponses.ReliabilityResponse response = service.lines("ttc");

        assertThat(response.observedDays()).isEqualTo(24);
        assertThat(response.confidence()).isEqualTo("medium");
        assertThat(response.coverageLabel())
            .isEqualTo("99.0% polling · 80.0% schedule-date coverage");
    }

    @Test
    void withholdsTotalsWhenNoScheduleCoverageExists() {
        when(repository.aggregate(
            Mockito.eq("regional"), Mockito.isNull(), Mockito.any(), Mockito.any()
        )).thenReturn(new ReliabilityRepository.ReliabilityAggregation(
            List.of(), List.of(), 30_000L, 69.4,
            "published schedule coverage unavailable", false, 0.0,
            ReliabilityRepository.CancellationAggregation.unavailable()
        ));

        ReliabilityResponses.ReliabilityResponse response = service.lines("regional");

        assertThat(response.metrics()).isEmpty();
        assertThat(response.message()).contains("schedule coverage is unavailable")
            .contains("totals are withheld");
    }
}
