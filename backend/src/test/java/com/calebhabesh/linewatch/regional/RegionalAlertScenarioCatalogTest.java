package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.dashboard.DashboardResponses;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class RegionalAlertScenarioCatalogTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-07-29T18:00:00Z"),
        ZoneOffset.UTC
    );
    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();
    private final MetrolinxAlertNormalizer alertNormalizer = new MetrolinxAlertNormalizer(objectMapper, CLOCK);
    private final RegionalAccessibilityOutageNormalizer outageNormalizer =
        new RegionalAccessibilityOutageNormalizer(objectMapper);

    static Stream<Arguments> scenarios() {
        return Stream.of(
            Arguments.of("all-alert-types.json", 11, 3),
            Arguments.of("go-corridor-overlap.json", 3, 0),
            Arguments.of("go-station-and-accessibility.json", 1, 3),
            Arguments.of("up-service-alerts.json", 2, 0)
        );
    }

    @ParameterizedTest
    @MethodSource("scenarios")
    void parsesAndNormalizesEveryGeneratedSourceShapedScenario(
        String fileName,
        int expectedAlerts,
        int expectedOutages
    ) throws Exception {
        Scenario scenario = parse(fileName);

        List<RegionalNormalizedAlert> alerts = alertNormalizer.normalize(scenario.feed());
        List<RegionalAccessibilityOutage> outages = outageNormalizer.normalize(scenario.sourceRecords());

        assertThat(alerts).hasSize(expectedAlerts);
        assertThat(outages).hasSize(expectedOutages);
        assertThat(alerts).allSatisfy(alert -> {
            assertThat(alert.id()).startsWith("regional-");
            assertThat(alert.rawPayload()).isNotBlank();
            assertThat(alert.sourceUpdatedAt()).isNotNull();
        });
    }

    @Test
    void allAlertTypesCoversEveryCorridorKindAndTopologyScope() throws Exception {
        List<RegionalNormalizedAlert> alerts = alertNormalizer.normalize(parse("all-alert-types.json").feed());

        assertThat(alerts).extracting(RegionalNormalizedAlert::lineId).contains(
            "regional-br", "regional-ki", "regional-le", "regional-lw",
            "regional-mi", "regional-rh", "regional-st", "regional-up"
        );
        assertThat(alerts).extracting(RegionalNormalizedAlert::impactKind)
            .contains("advisory", "delay", "planned-closure")
            .doesNotContain("suspension");
        assertThat(alerts).filteredOn(alert -> "advisory".equals(alert.impactKind()))
            .allSatisfy(alert -> assertThat(alert.affectedSegmentIds()).isEmpty());
        assertThat(alerts).anySatisfy(alert -> {
            assertThat(alert.stationIds()).hasSize(1);
            assertThat(alert.affectedSegmentIds()).isEmpty();
        });
        assertThat(alerts).anySatisfy(alert -> {
            assertThat(alert.stationIds()).hasSizeGreaterThan(1);
            assertThat(alert.affectedSegmentIds()).isNotEmpty();
        });
        assertThat(alerts).filteredOn(alert -> alert.lineId().equals("regional-le"))
            .extracting(RegionalNormalizedAlert::impactKind)
            .contains("advisory");
    }

    @Test
    void allAlertTypesReachesEveryRegionalDashboardAlertMenu() throws Exception {
        Scenario scenario = parse("all-alert-types.json");
        List<RegionalNormalizedAlert> alerts = alertNormalizer.normalize(scenario.feed());
        RegionalAlertStore alertStore = mock(RegionalAlertStore.class);
        RegionalIngestionRunStore runStore = mock(RegionalIngestionRunStore.class);
        RegionalIngestionFreshness freshness = mock(RegionalIngestionFreshness.class);
        MetrolinxProperties properties = new MetrolinxProperties();
        properties.setEnabled(true);
        properties.setApiKey("scenario-key");
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-07-29T18:00:00Z");
        when(alertStore.findActiveAlerts()).thenReturn(alerts.stream()
            .map(alert -> RegionalAlertProjection.at(alert, CLOCK.instant()))
            .filter(java.util.Objects::nonNull).toList());
        when(runStore.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            1L, "success", completedAt.minusSeconds(1), completedAt,
            12, 12, 12, 0, completedAt.minusMinutes(2), null
        )));
        when(freshness.remainingFreshness(any())).thenReturn(Optional.of(Duration.ofMinutes(10)));

        DashboardResponses.DashboardResponse dashboard = new RegionalDashboardService(
            alertStore, runStore, freshness, properties, CLOCK
        ).dashboard();

        assertThat(dashboard.activeAlerts()).hasSize(1);
        assertThat(dashboard.delays()).hasSize(1);
        assertThat(dashboard.plannedClosures()).isEmpty();
        assertThat(dashboard.map().stationNodeImpacts()).hasSize(1);
        assertThat(dashboard.map().segments())
            .anySatisfy(segment -> assertThat(segment.impacts())
                .extracting(impact -> impact.kind())
                .contains("suspension"));
        assertThat(dashboard.status().lines()).anySatisfy(line ->
            assertThat(line.statusLabel()).contains("Advisory"));
    }

    @Test
    void publicScenariosUseSyntheticRecordsOnly() throws Exception {
        JsonNode root = fixture("all-alert-types.json");
        List<JsonNode> records = new ArrayList<>();
        root.path("go").path("Messages").path("Message").forEach(records::add);
        root.path("up").path("entity").forEach(records::add);

        assertThat(records).isNotEmpty().allSatisfy(record -> {
            assertThat(record.path("_linewatchScenarioOrigin").asText()).isEqualTo("synthetic");
            String id = record.has("Code") ? record.path("Code").asText() : record.path("id").asText();
            assertThat(id).startsWith(record.has("Code") ? "LW-SCENARIO-" : "linewatch-up-");
        });
    }

    private Scenario parse(String fileName) throws Exception {
        JsonNode root = fixture(fileName);
        OffsetDateTime sourceUpdatedAt = OffsetDateTime.parse(root.path("generatedAt").asText()).minusMinutes(2);
        List<MetrolinxFetchedRecord> fetched = new ArrayList<>();
        List<RegionalAccessibilityOutageReadRepository.SourceRecord> sourceRecords = new ArrayList<>();
        Map<String, Boolean> completeSources = new LinkedHashMap<>();
        completeSources.put(MetrolinxSourceSystem.GO_SERVICE_ALERTS, true);
        completeSources.put(MetrolinxSourceSystem.UP_GTFS_ALERTS, true);

        for (JsonNode message : iterable(root.path("go").path("Messages").path("Message"))) {
            String payload = objectMapper.writeValueAsString(message);
            String sourceId = message.path("Code").asText();
            fetched.add(new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_SERVICE_ALERTS, sourceId, payload));
            sourceRecords.add(new RegionalAccessibilityOutageReadRepository.SourceRecord(
                sourceId, payload, sourceUpdatedAt
            ));
        }
        for (JsonNode entity : iterable(root.path("up").path("entity"))) {
            fetched.add(new MetrolinxFetchedRecord(
                MetrolinxSourceSystem.UP_GTFS_ALERTS,
                entity.path("id").asText(),
                objectMapper.writeValueAsString(entity)
            ));
        }
        return new Scenario(
            new MetrolinxFeed(sourceUpdatedAt, List.copyOf(fetched), Map.copyOf(completeSources)),
            List.copyOf(sourceRecords)
        );
    }

    private JsonNode fixture(String fileName) throws Exception {
        return objectMapper.readTree(getClass().getResourceAsStream(
            "/fixtures/metrolinx-alert-scenarios/" + fileName
        ));
    }

    private Iterable<JsonNode> iterable(JsonNode array) {
        return array;
    }

    private record Scenario(
        MetrolinxFeed feed,
        List<RegionalAccessibilityOutageReadRepository.SourceRecord> sourceRecords
    ) {}
}
