package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class ReliabilityServiceTest {
    private static final Instant NOW = Instant.parse("2026-07-28T16:00:00Z");
    private static final LocalDate EXPECTED_FROM = LocalDate.parse("2026-06-29");
    private static final LocalDate EXPECTED_TO = LocalDate.parse("2026-07-28");
    private final ReliabilityRepository repository = Mockito.mock(ReliabilityRepository.class);
    private final ReliabilityService service =
        new ReliabilityService(repository, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void returnsCoverageLabeledTtcLineHistoryWithoutInventingAScore() {
        when(repository.aggregateServiceDates(
            Mockito.eq("ttc"), Mockito.isNull(), Mockito.eq(EXPECTED_FROM), Mockito.eq(EXPECTED_TO), Mockito.any()
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

        assertThat(response.since().toInstant()).isEqualTo(Instant.parse("2026-06-29T04:00:00Z"));
        assertThat(response.until().toInstant()).isEqualTo(NOW);
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
        when(repository.aggregateServiceDates(
            Mockito.eq("regional"), Mockito.isNull(), Mockito.eq(EXPECTED_FROM), Mockito.eq(EXPECTED_TO), Mockito.any()
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
        when(repository.aggregateServiceDates(
            Mockito.eq("ttc"), Mockito.isNull(), Mockito.eq(EXPECTED_FROM), Mockito.eq(EXPECTED_TO), Mockito.any()
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
        when(repository.aggregateServiceDates(
            Mockito.eq("regional"), Mockito.isNull(), Mockito.eq(EXPECTED_FROM), Mockito.eq(EXPECTED_TO), Mockito.any()
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

    @Test
    void servesMethodologyV2ClassesAndStationWeightedPreamble() {
        when(repository.aggregateServiceDates(
            Mockito.eq("ttc"), Mockito.isNull(), Mockito.eq(EXPECTED_FROM), Mockito.eq(EXPECTED_TO), Mockito.any()
        )).thenReturn(new ReliabilityRepository.ReliabilityAggregation(
            List.of(new ReliabilityRepository.AggregateRow(
                "line-1", "1", "Yonge-University", 10, 2, 18L,
                30_000L, 30_000L, 45_000L, 100.0,
                2_400.0, 8.0,
                List.of(
                    new ReliabilityRepository.ClassAggregateRow("service-stopped", 3, 0, 180L, 60.0, 0.2, 200L),
                    new ReliabilityRepository.ClassAggregateRow("delay", 5, 0, 420L, 90.0, 0.3, 450L),
                    new ReliabilityRepository.ClassAggregateRow("slow-zone", 2, 2, 30_000L, 2_250.0, 7.5, 44_350L)
                )
            )),
            List.of(
                new ReliabilityRepository.BreakdownRow("reduced-speed-zone", 2, 44_350L),
                new ReliabilityRepository.BreakdownRow("delay", 5, 450L),
                new ReliabilityRepository.BreakdownRow("suspension", 3, 200L)
            ),
            42_768L, 99.0, "published TTC GTFS daily line service spans", true, 100.0,
            ReliabilityRepository.CancellationAggregation.unavailable(),
            2
        ));

        ReliabilityResponses.ReliabilityResponse response = service.lines("ttc");

        assertThat(response.methodologyVersion()).isEqualTo(2);
        assertThat(response.message())
            .contains("Class shares weight each disruption by the share of scheduled stations affected")
            .contains("Time With Any Alert");
        assertThat(response.metrics()).singleElement().satisfies(metric -> {
            assertThat(metric.serviceImpactPercentage()).isEqualTo(100.0);
            assertThat(metric.weightedImpactPercentage()).isEqualTo(8.0);
            assertThat(metric.classes()).hasSize(3);
            assertThat(metric.classes().get(0).label()).isEqualTo("Service Stopped");
            assertThat(metric.classes().get(0).uniqueMinutes()).isEqualTo(180L);
            assertThat(metric.classes().get(0).weightedSharePercentage()).isEqualTo(0.2);
            assertThat(metric.classes().get(1).label()).isEqualTo("Delays");
            assertThat(metric.classes().get(2).label()).isEqualTo("Slow Zones");
            assertThat(metric.classes().get(2).weightedSharePercentage()).isEqualTo(7.5);
        });
    }
}
