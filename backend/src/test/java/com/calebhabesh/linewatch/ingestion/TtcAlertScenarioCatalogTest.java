package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.surface.GtfsRtServiceAlertTextParser;
import com.calebhabesh.linewatch.station.StationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
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
            new AlertDirectionParser()
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
            Arguments.of("all-alert-types.json", 13, 2, EnumSet.of(
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
            .filteredOn(alert -> alert.impactKind() == AlertImpactKind.DELAY)
            .extracting(NormalizedRouteAlert::direction)
            .contains(AlertDirection.BIDIRECTIONAL, AlertDirection.SOUTHBOUND);
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

    private List<NormalizedRouteAlert> normalizeRouteAlerts(TtcAlertFeed feed) {
        return feed.routes().stream()
            .map(normalizer::normalizeRoute)
            .peek(result -> assertThat(result.status()).isEqualTo(NormalizationStatus.MATCHED))
            .map(result -> result.projection().orElseThrow())
            .toList();
    }
}
