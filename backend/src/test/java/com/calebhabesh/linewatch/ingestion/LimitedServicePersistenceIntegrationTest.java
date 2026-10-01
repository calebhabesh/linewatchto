package com.calebhabesh.linewatch.ingestion;

import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertActivePeriodRepository;
import com.calebhabesh.linewatch.alert.AlertEntity;
import com.calebhabesh.linewatch.alert.TtcClosureProjector;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.surface.GtfsRtServiceAlertTextParser;
import tools.jackson.databind.ObjectMapper;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

class LimitedServicePersistenceIntegrationTest {
    @Test
    void unchangedSourceCanCorrectItsStoredEffectAndProjectOneLinkedDelayAfterReadback() throws Exception {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", 5434), 1000);
        } catch (Exception exception) {
            Assumptions.abort("PostgreSQL test database is unavailable");
        }
        DriverManagerDataSource ds = new DriverManagerDataSource(
            System.getProperty("spring.datasource.url", System.getenv().getOrDefault("SPRING_DATASOURCE_URL", "jdbc:postgresql://127.0.0.1:5434/linewatch_test")),
            System.getProperty("spring.datasource.username", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "linewatch")),
            System.getProperty("spring.datasource.password", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password"))
        );
        Flyway.configure().dataSource(ds).load().migrate();
        var jdbc = new NamedParameterJdbcTemplate(ds);
        var store = new TtcAlertStore(jdbc);
        ObjectMapper mapper = JsonMapper.builder().findAndAddModules().build();
        StationRepository stations = mock(StationRepository.class);
        when(stations.existsById(anyString())).thenReturn(true);
        var normalizer = new TtcAlertNormalizer(new StationAliasResolver(stations), new AlertDirectionParser(),
            mock(GtfsRtRapidTransitStationResolver.class));
        String body = new String(getClass().getResourceAsStream("/fixtures/ttc-alert-scenarios/limited-service-active-window.json")
            .readAllBytes(), StandardCharsets.UTF_8).replace("scenario-limited", "integration-limited");
        TtcAlertFeed feed = new TtcAlertClient(RestClient.create(), mapper, new AlertIngestionProperties(),
            new GtfsRtServiceAlertTextParser()).parse(body);
        List<NormalizedRouteAlert> normalized = feed.routes().stream()
            .map(normalizer::normalizeRoute).map(result -> result.projection().orElseThrow()).toList();
        NormalizedRouteAlert parent = normalized.getFirst();
        NormalizedRouteAlert child = normalized.getLast();
        OffsetDateTime now = parent.periods().getFirst().startsAt().plusMinutes(30);
        new TransactionTemplate(new DataSourceTransactionManager(ds)).executeWithoutResult(transaction -> {
            transaction.setRollbackOnly();
            store.upsertRouteAlert(legacy(parent), now.minusMinutes(1));
            store.upsertRouteAlert(parent, now);
            store.upsertRouteAlert(parent, now.plusSeconds(1));
            store.upsertRouteAlert(child, now);
            assertThat(jdbc.queryForObject("select count(*) from alerts where source_id = :id", Map.of("id", parent.sourceId()), Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from snapshots where alert_id = :id", Map.of("id", parent.id()), Integer.class)).isEqualTo(2);
            assertThat(jdbc.queryForObject("select raw_payload::text from alerts where id = :id", Map.of("id", parent.id()), String.class)).contains("limited nightly");
            List<?> lifecycle = ReflectionTestUtils.invokeMethod(
                new com.calebhabesh.linewatch.reliability.ReliabilityRepository(jdbc), "rawTtcEpisodes", now.plusSeconds(2));
            assertThat(lifecycle.stream().filter(episode -> parent.id().equals(ReflectionTestUtils.getField(episode, "alertId"))))
                .singleElement().satisfies(episode -> assertThat(ReflectionTestUtils.getField(episode, "impactKind"))
                    .isEqualTo("limited-service"));
            List<AlertEntity> readback = normalized.stream().map(alert -> {
                AlertEntity entity = org.springframework.beans.BeanUtils.instantiateClass(AlertEntity.class);
                ReflectionTestUtils.setField(entity, "id", alert.id());
                ReflectionTestUtils.setField(entity, "sourceId", alert.sourceId());
                ReflectionTestUtils.setField(entity, "type", alert.type());
                ReflectionTestUtils.setField(entity, "severity", alert.severity());
                ReflectionTestUtils.setField(entity, "active", true);
                ReflectionTestUtils.setField(entity, "impactKind", jdbc.queryForObject(
                    "select impact_kind from alerts where id = :id", Map.of("id", alert.id()), String.class));
                ReflectionTestUtils.setField(entity, "title", alert.title());
                ReflectionTestUtils.setField(entity, "description", alert.description());
                ReflectionTestUtils.setField(entity, "startStationId", alert.startStationId());
                ReflectionTestUtils.setField(entity, "endStationId", alert.endStationId());
                ReflectionTestUtils.setField(entity, "line", new TransitLineEntity("line-1", "1", "Yonge-University", "#F8C300", 1));
                return entity;
            }).toList();
            var periods = new AlertActivePeriodRepository(jdbc).findByAlertIds(normalized.stream().map(NormalizedRouteAlert::id).toList());
            var projections = new TtcClosureProjector().project(readback, periods, List.of(new LineSegmentEntity(
                "affected", "line-1", parent.startStationId(), parent.endStationId(), null, "M 0 0 L 1 1", 1)), now);
            assertThat(projections).hasSize(1);
            assertThat(projections.getFirst().canonicalClosure().serviceEffect()).isEqualTo("limited-service");
            assertThat(projections.getFirst().activeSegmentImpacts()).singleElement().satisfies(entry -> {
                assertThat(entry.getValue().kind()).isEqualTo("delay");
                assertThat(entry.getValue().cardId()).isEqualTo(child.id());
            });
            try {
                assertThat(mapper.writeValueAsString(projections.getFirst().canonicalClosure()))
                    .contains("\"serviceEffect\":\"limited-service\"").doesNotContain("rawPayload", "notificationTitle");
            } catch (Exception exception) {
                throw new AssertionError(exception);
            }
        });
    }

    private NormalizedRouteAlert legacy(NormalizedRouteAlert a) {
        return new NormalizedRouteAlert(a.id(), a.sourceId(), a.lineId(), a.type(), a.severity(), a.title(), a.description(),
            a.sourceAlertType(), a.effect(), a.effectDescription(), a.direction(), a.cause(), a.causeDescription(),
            a.targetRemoval(), AlertImpactKind.PLANNED_CLOSURE, a.rszLength(), a.stationDistance(), a.trackPercent(),
            a.reducedSpeed(), a.averageSpeed(), a.startStationId(), a.endStationId(), a.activePeriodStart(),
            a.activePeriodEnd(), a.sourceUpdatedAt(), a.shuttleType(), a.shuttleStart(), a.shuttleEnd(), a.rawPayload(),
            a.stationIds(), a.periods(), "legacy-classification-fingerprint");
    }
}
