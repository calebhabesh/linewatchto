package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.announcement.TtcAnnouncementNormalizer;
import com.calebhabesh.linewatch.announcement.TtcAnnouncementStore;
import com.calebhabesh.linewatch.station.StationRepository;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeNormalizer;
import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeStore;
import java.lang.reflect.RecordComponent;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Provider records must never reach a database constraint. TTC owns the feed shape and may
 * omit, blank or bloat any field (GTFS-RT makes header and description text optional; TTC
 * published an alert with neither on Nov 13, 2026, and a 2,000-character title on Oct 19).
 * Each case runs one realistic record per section through the real normalizers and stores, with
 * one provider field replaced by null, blank or oversized text, and fails if any record would be
 * quarantined. Quarantine keeps the dashboard up; this test keeps riders from losing the notice.
 */
class TtcProviderRecordContractIntegrationTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-13T15:00:00Z"), ZoneOffset.UTC);
    private static final OffsetDateTime UPDATED = OffsetDateTime.parse("2026-11-13T14:50:00Z");
    private static final String LONG = "Provider text ".repeat(150);

    private DataSource dataSource;
    private TtcAlertFeedApplicationService service;

    @BeforeEach
    void setUp() {
        String url = System.getProperty("spring.datasource.url", System.getenv().getOrDefault(
            "SPRING_DATASOURCE_URL", "jdbc:postgresql://127.0.0.1:5434/linewatch_test"));
        var address = java.net.URI.create(url.substring("jdbc:".length()));
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(address.getHost(), address.getPort()), 1000);
        } catch (Exception exception) {
            Assumptions.abort("PostgreSQL test database is unavailable");
        }
        dataSource = new DriverManagerDataSource(
            url,
            System.getProperty("spring.datasource.username", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "linewatch")),
            System.getProperty("spring.datasource.password", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password"))
        );
        Flyway.configure().dataSource(dataSource).load().migrate();
        var jdbc = new NamedParameterJdbcTemplate(dataSource);
        // Only real station IDs resolve, as in production; arbitrary provider text never becomes one.
        StationRepository stations = mock(StationRepository.class);
        java.util.Set<String> knownStations = java.util.Set.of("eglinton", "davisville", "warden");
        when(stations.existsById(anyString())).thenAnswer(call -> knownStations.contains(call.<String>getArgument(0)));
        service = new TtcAlertFeedApplicationService(
            new TtcAlertStore(jdbc),
            new TtcAlertNormalizer(
                new StationAliasResolver(stations),
                new AlertDirectionParser(),
                mock(GtfsRtRapidTransitStationResolver.class)
            ),
            new RapidTransitAlertDuplicateMatcher(),
            new SurfaceServiceNoticeNormalizer(),
            new SurfaceServiceNoticeStore(jdbc),
            new TtcAnnouncementNormalizer(),
            new TtcAnnouncementStore(jdbc),
            CLOCK,
            new JdbcIngestionSavepoints(dataSource)
        );
    }

    @Test
    void eachBaseRecordPersistsItsRow() {
        var jdbc = new NamedParameterJdbcTemplate(dataSource);
        for (Base base : bases()) {
            inRolledBackTransaction(() -> {
                FeedApplicationCounts counts = service.apply(base.feed().apply(new TtcFetchedRecord(base.record(), "{}")));
                assertThat(counts.quarantined()).as(base.name()).isEmpty();
                Integer rows = jdbc.queryForObject(
                    "select count(*) from " + base.table() + " where source_id like :sourceId and active",
                    java.util.Map.of("sourceId", "%" + base.record().id()), Integer.class);
                assertThat(rows).as(base.name() + " row in " + base.table()).isEqualTo(1);
            });
        }
    }

    @Test
    void noProviderFieldValueReachesADatabaseConstraint() {
        List<String> failures = new ArrayList<>();
        for (Base base : bases()) {
            for (RecordComponent component : TtcAlertRecord.class.getRecordComponents()) {
                for (Object value : variants(component)) {
                    TtcAlertRecord record = with(base.record(), component, value);
                    String label = base.name() + " " + component.getName() + "=" + describe(value);
                    inRolledBackTransaction(() -> {
                        try {
                            FeedApplicationCounts counts = service.apply(base.feed().apply(
                                new TtcFetchedRecord(record, "{\"case\":\"" + label.replace("\"", "'") + "\"}")));
                            if (component.getName().equals("id")) {
                                failures.add(label + " -> applied, but a record without a usable id must be set aside");
                            }
                            counts.quarantined().forEach(quarantined ->
                                failures.add(label + " -> " + quarantined.label() + ": " + quarantined.message()));
                        } catch (RuntimeException failure) {
                            // A record with no usable id is rejected on purpose before any write
                            // (and, as the feed's only record, fails this one-record run).
                            boolean deliberateIdRejection = component.getName().equals("id")
                                && failure.getMessage() != null
                                && failure.getMessage().matches("(?s).*: provider record (has no id|id is \\d+ characters).*");
                            if (!deliberateIdRejection) {
                                failures.add(label + " -> run failed: " + failure.getMessage());
                            }
                        }
                    });
                }
            }
        }
        assertThat(failures).as("provider values that would be quarantined").isEmpty();
    }

    private record Base(
        String name,
        TtcAlertRecord record,
        String table,
        Function<TtcFetchedRecord, TtcAlertFeed> feed
    ) {}

    private static List<Base> bases() {
        Function<TtcFetchedRecord, TtcAlertFeed> routes =
            fetched -> new TtcAlertFeed(UPDATED, List.of(fetched), List.of());
        return List.of(
            new Base("subway", TestAlertRecords.route("contract-subway"), "alerts", routes),
            new Base("bus", record("contract-bus", "Live", "29", "Bus", List.of("1234"),
                "29 Dufferin: Detour northbound via Lansdowne Ave", "DETOUR", "Detour"), "surface_service_notices", routes),
            new Base("streetcar-gtfsrt", record("gtfsrt-contract-streetcar", "GTFS-RT", "504", "Streetcar",
                List.of("5678"), "504 King: Bypassing Dufferin Gate Loop", "DETOUR", "Detour"), "surface_service_notices", routes),
            new Base("elevator", TestAlertRecords.accessibility("contract-elevator"), "accessibility_outages",
                fetched -> new TtcAlertFeed(UPDATED, List.of(), List.of(fetched))),
            new Base("announcement", record("contract-announcement", "Live", null, null, List.of(),
                "website_banner", null, null), "ttc_announcements",
                fetched -> new TtcAlertFeed(UPDATED, List.of(), List.of(), List.of(), List.of(fetched)))
        );
    }

    private static TtcAlertRecord record(
        String id, String alertType, String route, String routeType, List<String> stops,
        String title, String effect, String effectDesc
    ) {
        return new TtcAlertRecord(
            id, alertType, UPDATED, new TtcAlertActivePeriod(UPDATED, null), List.of("Current"), route, routeType,
            null, null, stops, title, "Customers should allow extra travel time.", title, null, effect,
            effectDesc, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            List.of()
        );
    }

    private static List<Object> variants(RecordComponent component) {
        Class<?> type = component.getType();
        if (type == String.class) {
            return Arrays.asList(null, "", "   ", LONG);
        }
        if (type == List.class) {
            boolean children = component.getName().equals("childAlerts");
            return children
                ? Arrays.asList(null, List.of())
                : Arrays.asList(null, List.of(""), List.of(LONG), Arrays.asList("1234", null));
        }
        if (type == OffsetDateTime.class) {
            return Arrays.asList(null, OffsetDateTime.parse("0001-01-01T00:00:00Z"));
        }
        if (type == TtcAlertActivePeriod.class) {
            return Arrays.asList(null, new TtcAlertActivePeriod(null, null));
        }
        return Arrays.asList((Object) null);
    }

    private static TtcAlertRecord with(TtcAlertRecord base, RecordComponent target, Object value) {
        try {
            RecordComponent[] components = TtcAlertRecord.class.getRecordComponents();
            Object[] args = new Object[components.length];
            Class<?>[] types = new Class<?>[components.length];
            for (int index = 0; index < components.length; index++) {
                types[index] = components[index].getType();
                args[index] = components[index].getName().equals(target.getName()) ? value : components[index].getAccessor().invoke(base);
            }
            return TtcAlertRecord.class.getDeclaredConstructor(types).newInstance(args);
        } catch (ReflectiveOperationException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String describe(Object value) {
        if (value == null) {
            return "null";
        }
        String text = value.toString();
        return text.length() > 24 ? text.substring(0, 12) + "…(" + text.length() + ")" : "'" + text + "'";
    }

    private void inRolledBackTransaction(Runnable work) {
        new TransactionTemplate(new DataSourceTransactionManager(dataSource)).executeWithoutResult(transaction -> {
            transaction.setRollbackOnly();
            work.run();
        });
    }
}
