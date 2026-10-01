package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.surface.GtfsRtServiceAlertTextParser;
import com.calebhabesh.linewatch.station.StationRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.web.client.RestClient;

class TtcAlertScenarioCatalogTest {
    private final StationRepository stationRepository = mock(StationRepository.class);
    private final TtcAlertNormalizer normalizer;
    private final TtcAlertClient client;

    TtcAlertScenarioCatalogTest() {
        when(stationRepository.existsById(anyString())).thenReturn(true);
        normalizer = new TtcAlertNormalizer(
            new StationAliasResolver(stationRepository),
            new AlertDirectionParser(),
            mock(GtfsRtRapidTransitStationResolver.class)
        );
        client = new TtcAlertClient(
            RestClient.create(),
            new ObjectMapper().findAndRegisterModules(),
            new AlertIngestionProperties(),
            new GtfsRtServiceAlertTextParser()
        );
    }

    static Stream<Arguments> scenarios() {
        return Stream.of(
            Arguments.of("all-alert-types.json", 24, 2, EnumSet.of(
                AlertImpactKind.SUSPENSION,
                AlertImpactKind.DELAY,
                AlertImpactKind.REDUCED_SPEED_ZONE,
                AlertImpactKind.PLANNED_CLOSURE
            )),
            Arguments.of("nonlinear-union-curve.json", 3, 0, EnumSet.of(
                AlertImpactKind.SUSPENSION,
                AlertImpactKind.REDUCED_SPEED_ZONE
            )),
            Arguments.of("nonlinear-st-george-spadina.json", 2, 0, EnumSet.of(
                AlertImpactKind.DELAY,
                AlertImpactKind.REDUCED_SPEED_ZONE
            )),
            Arguments.of("long-mixed-line-1-rsz.json", 2, 0, EnumSet.of(
                AlertImpactKind.REDUCED_SPEED_ZONE
            )),
            Arguments.of("line-5-suspension.json", 1, 0, EnumSet.of(
                AlertImpactKind.SUSPENSION
            )),
            Arguments.of("nightly-closure-active-window.json", 1, 0, EnumSet.of(
                AlertImpactKind.PLANNED_CLOSURE
            )),
            Arguments.of("limited-service-active-window.json", 2, 0, EnumSet.of(AlertImpactKind.LIMITED_SERVICE)),
            Arguments.of("station-node-impact.json", 1, 0, EnumSet.of(
                AlertImpactKind.DELAY
            ))
        );
    }

    @ParameterizedTest
    @MethodSource("scenarios")
    void scenarioFeedsParseAndNormalizeWithoutUnmatchedRapidTransitRecords(
        String fileName,
        int routeCount,
        int accessibilityCount,
        Set<AlertImpactKind> expectedImpactKinds
    ) throws Exception {
        TtcAlertFeed feed = parseScenario(fileName);

        assertThat(feed.routes()).hasSize(routeCount);
        assertThat(feed.accessibility()).hasSize(accessibilityCount);

        List<NormalizedRouteAlert> routeAlerts = feed.routes().stream()
            .map(normalizer::normalizeRoute)
            .peek(result -> assertThat(result.status())
                .describedAs("%s route normalization status", fileName)
                .isEqualTo(NormalizationStatus.MATCHED))
            .map(result -> result.projection().orElseThrow())
            .toList();

        assertThat(routeAlerts)
            .extracting(NormalizedRouteAlert::impactKind)
            .containsAll(expectedImpactKinds);

        for (TtcFetchedRecord accessibility : feed.accessibility()) {
            assertThat(normalizer.normalizeAccessibility(accessibility).status())
                .describedAs("%s accessibility normalization status", fileName)
                .isEqualTo(NormalizationStatus.MATCHED);
        }
    }

    @Test
    void allAlertTypesDeclaresSyntheticTemplateAndModeledCoverageMatrix() throws Exception {
        JsonNode allAlertTypes = scenarioIndexEntry(parseScenarioIndex(), "all-alert-types");

        assertThat(allAlertTypes).isNotNull();
        assertThat(textValues(allAlertTypes.get("sourceKinds")))
            .containsExactly("modeled-gap-fill", "synthetic-template");

        JsonNode coverageMatrix = allAlertTypes.get("coverageMatrix");
        assertThat(fieldNames(coverageMatrix))
            .contains(
                "suspension-bidirectional-segment",
                "suspension-directional-segment",
                "delay-bidirectional-segment",
                "delay-directional-segment",
                "delay-directional-station",
                "delay-bidirectional-station",
                "suspension-four-way-junction-station-line-1",
                "suspension-four-way-junction-station-line-2",
                "reduced-speed-zone-directional",
                "reduced-speed-zone-bidirectional",
                "reduced-speed-zone-directionless",
                "planned-closure-bidirectional-static",
                "planned-closure-directional-moving",
                "planned-closure-long-upcoming",
                "accessibility-elevator",
                "accessibility-escalator"
            );
        assertThat(coverageMatrix.get("planned-closure-bidirectional-static").get("sourceKind").asText())
            .isEqualTo("synthetic-template");
        assertThat(coverageMatrix.get("reduced-speed-zone-directional").get("sourceKind").asText())
            .isEqualTo("synthetic-template");
        assertThat(coverageMatrix.get("accessibility-elevator").get("sourceKind").asText())
            .isEqualTo("synthetic-template");
        assertThat(coverageMatrix.get("accessibility-escalator").get("sourceKind").asText())
            .isEqualTo("synthetic-template");
        assertThat(coverageMatrix.get("delay-bidirectional-station").get("sourceKind").asText())
            .isEqualTo("modeled-gap-fill");
        assertThat(coverageMatrix.get("delay-directional-station").get("sourceKind").asText())
            .isEqualTo("modeled-gap-fill");
        assertThat(coverageMatrix.get("suspension-four-way-junction-station-line-1").get("sourceKind").asText())
            .isEqualTo("modeled-gap-fill");
        assertThat(coverageMatrix.get("suspension-four-way-junction-station-line-2").get("sourceKind").asText())
            .isEqualTo("modeled-gap-fill");
        assertThat(coverageMatrix.get("reduced-speed-zone-directionless").get("sourceKind").asText())
            .isEqualTo("modeled-gap-fill");
    }

    @Test
    void allAlertTypesCoversSupportedDirectionMatrixAndStationAlertAssets() throws Exception {
        TtcAlertFeed feed = parseScenario("all-alert-types.json");
        List<NormalizedRouteAlert> routeAlerts = normalizeRouteAlerts(feed);
        List<NormalizedAccessibilityOutage> accessibilityOutages = feed.accessibility().stream()
            .map(normalizer::normalizeAccessibility)
            .peek(result -> assertThat(result.status()).isEqualTo(NormalizationStatus.MATCHED))
            .map(result -> result.projection().orElseThrow())
            .toList();

        assertThat(routeAlerts)
            .filteredOn(alert -> alert.impactKind() == AlertImpactKind.SUSPENSION)
            .extracting(NormalizedRouteAlert::direction)
            .contains(AlertDirection.BIDIRECTIONAL, AlertDirection.NORTHBOUND);
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-active-line-2"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("broadview");
                assertThat(alert.endStationId()).isEqualTo("kennedy");
                assertThat(alert.stationIds()).containsExactly(
                    "broadview",
                    "chester",
                    "pape",
                    "donlands",
                    "greenwoood",
                    "coxwell",
                    "woodbine",
                    "main-street",
                    "victoria-park",
                    "warden",
                    "kennedy"
                );
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.SUSPENSION);
                assertThat(alert.direction()).isEqualTo(AlertDirection.BIDIRECTIONAL);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.impactKind() == AlertImpactKind.DELAY)
            .extracting(NormalizedRouteAlert::direction)
            .contains(AlertDirection.BIDIRECTIONAL, AlertDirection.SOUTHBOUND);
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-delay-line-2-main-street-kennedy"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("main-street");
                assertThat(alert.endStationId()).isEqualTo("kennedy");
                assertThat(alert.stationIds()).containsExactly("main-street", "victoria-park", "warden", "kennedy");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.DELAY);
                assertThat(alert.direction()).isEqualTo(AlertDirection.BIDIRECTIONAL);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-active-line-1-dupont-cedarvale"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("dupont");
                assertThat(alert.endStationId()).isEqualTo("cedarvale");
                assertThat(alert.stationIds()).containsExactly("dupont", "st-clair-west", "cedarvale");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.SUSPENSION);
                assertThat(alert.direction()).isEqualTo(AlertDirection.BIDIRECTIONAL);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-active-line-1-king-union"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("king");
                assertThat(alert.endStationId()).isEqualTo("union");
                assertThat(alert.stationIds()).containsExactly("king", "union");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.SUSPENSION);
                assertThat(alert.direction()).isEqualTo(AlertDirection.SOUTHBOUND);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-station-node-bloor-yonge-line-1"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("bloor-yonge");
                assertThat(alert.endStationId()).isEqualTo("bloor-yonge");
                assertThat(alert.stationIds()).containsExactly("bloor-yonge");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.SUSPENSION);
                assertThat(alert.direction()).isEqualTo(AlertDirection.BIDIRECTIONAL);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-station-node-bloor-yonge-line-2"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("bloor-yonge");
                assertThat(alert.endStationId()).isEqualTo("bloor-yonge");
                assertThat(alert.stationIds()).containsExactly("bloor-yonge");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.SUSPENSION);
                assertThat(alert.direction()).isEqualTo(AlertDirection.BIDIRECTIONAL);
            });
        assertThat(routeAlerts)
            .noneMatch(alert -> alert.sourceId().equals("scenario-active-line-1-st-andrew-union"));
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-delay-line-1-union-st-andrew"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("union");
                assertThat(alert.endStationId()).isEqualTo("st-andrew");
                assertThat(alert.stationIds()).containsExactly("union", "st-andrew");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.DELAY);
                assertThat(alert.direction()).isEqualTo(AlertDirection.NORTHBOUND);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-station-node-jane-overlap"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("jane");
                assertThat(alert.endStationId()).isEqualTo("jane");
                assertThat(alert.stationIds()).containsExactly("jane");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.DELAY);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-station-node-dundas-west-bidirectional"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("dundas-west");
                assertThat(alert.endStationId()).isEqualTo("dundas-west");
                assertThat(alert.stationIds()).containsExactly("dundas-west");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.DELAY);
                assertThat(alert.direction()).isEqualTo(AlertDirection.BIDIRECTIONAL);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-station-node-union-vaughan"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("union");
                assertThat(alert.endStationId()).isEqualTo("union");
                assertThat(alert.stationIds()).containsExactly("union");
                assertThat(alert.direction()).isEqualTo(AlertDirection.NORTHBOUND);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-station-node-spadina"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("spadina");
                assertThat(alert.endStationId()).isEqualTo("spadina");
                assertThat(alert.stationIds()).containsExactly("spadina");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.DELAY);
                assertThat(alert.direction()).isEqualTo(AlertDirection.BIDIRECTIONAL);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.sourceId().equals("scenario-planned-line-2-long-upcoming"))
            .singleElement()
            .satisfies(alert -> {
                assertThat(alert.startStationId()).isEqualTo("broadview");
                assertThat(alert.endStationId()).isEqualTo("kennedy");
                assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.PLANNED_CLOSURE);
                assertThat(alert.direction()).isEqualTo(AlertDirection.BIDIRECTIONAL);
            });
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.impactKind() == AlertImpactKind.REDUCED_SPEED_ZONE)
            .extracting(NormalizedRouteAlert::direction)
            .contains(AlertDirection.BIDIRECTIONAL, AlertDirection.SOUTHBOUND, AlertDirection.UNKNOWN);
        assertThat(routeAlerts)
            .filteredOn(alert -> alert.impactKind() == AlertImpactKind.PLANNED_CLOSURE)
            .extracting(NormalizedRouteAlert::direction)
            .contains(AlertDirection.BIDIRECTIONAL, AlertDirection.NORTHBOUND);
        assertThat(accessibilityOutages)
            .extracting(NormalizedAccessibilityOutage::assetType)
            .containsExactlyInAnyOrder("elevator", "escalator");
    }

    private TtcAlertFeed parseScenario(String fileName) throws Exception {
        String body = new String(
            getClass().getResourceAsStream("/fixtures/ttc-alert-scenarios/" + fileName).readAllBytes(),
            StandardCharsets.UTF_8
        );
        return client.parse(body);
    }

    private JsonNode parseScenarioIndex() throws Exception {
        String body = new String(
            getClass().getResourceAsStream("/fixtures/ttc-alert-scenarios/scenario-index.json").readAllBytes(),
            StandardCharsets.UTF_8
        );
        return new ObjectMapper().readTree(body);
    }

    private JsonNode scenarioIndexEntry(JsonNode root, String name) {
        for (JsonNode scenario : root.get("scenarios")) {
            if (name.equals(scenario.get("name").asText())) {
                return scenario;
            }
        }
        return null;
    }

    private List<String> textValues(JsonNode array) {
        List<String> values = new ArrayList<>();
        array.forEach(value -> values.add(value.asText()));
        return values;
    }

    private List<String> fieldNames(JsonNode object) {
        List<String> values = new ArrayList<>();
        object.fieldNames().forEachRemaining(values::add);
        return values;
    }

    private List<NormalizedRouteAlert> normalizeRouteAlerts(TtcAlertFeed feed) {
        return feed.routes().stream()
            .map(normalizer::normalizeRoute)
            .peek(result -> assertThat(result.status()).isEqualTo(NormalizationStatus.MATCHED))
            .map(result -> result.projection().orElseThrow())
            .toList();
    }
}
