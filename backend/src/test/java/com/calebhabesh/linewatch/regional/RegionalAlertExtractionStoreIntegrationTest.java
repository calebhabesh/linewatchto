package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

class RegionalAlertExtractionStoreIntegrationTest {
    private static final String MODEL = "test-model";
    private static final String PROMPT = "test-prompt";

    @Test
    void queuesNewNoticeTextOnceAndServesDueAndSucceededReadings() {
        DriverManagerDataSource ds = dataSource();
        Flyway.configure().dataSource(ds).load().migrate();
        var jdbc = new NamedParameterJdbcTemplate(ds);
        var store = new RegionalAlertExtractionStore(jdbc);
        new TransactionTemplate(new DataSourceTransactionManager(ds)).executeWithoutResult(transaction -> {
            transaction.setRollbackOnly();
            OffsetDateTime now = OffsetDateTime.parse("2026-10-31T05:00:00Z");
            String hash = "a".repeat(64);
            String expiredHash = "b".repeat(64);

            var first = store.observe(hash, MODEL, PROMPT, "up-1", "{\"title\":\"t\"}", "{\"effect\":\"no-service\"}",
                now.plusDays(1), now);
            var again = store.observe(hash, MODEL, PROMPT, "up-1-renamed", "{\"title\":\"t\"}",
                "{\"effect\":\"delay\"}", now.plusDays(1), now.plusMinutes(2));
            store.observe(expiredHash, MODEL, PROMPT, "up-2", "{}", "{}", now.minusMinutes(1), now);
            assertThat(again.id()).isEqualTo(first.id());
            assertThat(again.status()).isEqualTo("pending");

            // A notice whose window has ended, or that left the feed, is not read.
            assertThat(store.findDue(MODEL, PROMPT, now.plusMinutes(3), now.minusMinutes(30), 10))
                .singleElement().satisfies(due -> {
                    assertThat(due.id()).isEqualTo(first.id());
                    assertThat(due.deterministicJson()).contains("delay");
                });
            assertThat(store.findDue(MODEL, PROMPT, now.plusMinutes(3), now.plusMinutes(5), 10)).isEmpty();
            assertThat(store.findDue("other-model", PROMPT, now.plusMinutes(3), now.minusMinutes(30), 10)).isEmpty();

            assertThat(store.findDueByHashes(List.of(hash), MODEL, PROMPT, now.plusMinutes(3), 5))
                .extracting(RegionalAlertExtractionStore.Due::id).containsExactly(first.id());
            // Only one caller can claim a due reading.
            assertThat(store.claim(first.id(), now.plusMinutes(3), now.plusMinutes(5))).isTrue();
            assertThat(store.claim(first.id(), now.plusMinutes(3), now.plusMinutes(5))).isFalse();
            assertThat(store.findDueByHashes(List.of(hash), MODEL, PROMPT, now.plusMinutes(4), 5)).isEmpty();

            store.retryLater(first.id(), "http-503", now.plusHours(1), true);
            assertThat(store.findDue(MODEL, PROMPT, now.plusMinutes(3), now.minusMinutes(30), 10)).isEmpty();

            store.succeed(first.id(), "{\"effect\":\"no-service\"}", "[\"scope: segment-span vs corridor\"]", now);
            assertThat(store.findSucceeded(List.of(hash, expiredHash), MODEL, PROMPT))
                .containsOnlyKeys(hash);
            assertThat(store.observe(hash, MODEL, PROMPT, "up-1", "{}", "{}", now.plusDays(1), now.plusMinutes(4)))
                .satisfies(observed -> {
                    assertThat(observed.status()).isEqualTo("succeeded");
                    assertThat(observed.differencesJson()).contains("scope: segment-span vs corridor");
                });
            assertThat(jdbc.queryForObject("select attempts from regional_alert_extractions where id = :id",
                Map.of("id", first.id()), Integer.class)).isEqualTo(2);

            LocalDate day = LocalDate.parse("2026-10-30");
            assertThat(store.requestsOn(day, MODEL)).isZero();
            store.recordRequest(day, MODEL);
            store.recordRequest(day, MODEL);
            assertThat(store.requestsOn(day, MODEL)).isEqualTo(2);
        });
    }

    private static DriverManagerDataSource dataSource() {
        boolean available;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", 5434), 1000);
            available = true;
        } catch (Exception exception) {
            available = false;
        }
        Assumptions.assumeTrue(available, "PostgreSQL test database is unavailable");
        return new DriverManagerDataSource(
            System.getProperty("spring.datasource.url", System.getenv().getOrDefault("SPRING_DATASOURCE_URL", "jdbc:postgresql://127.0.0.1:5434/linewatch_test")),
            System.getProperty("spring.datasource.username", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "linewatch")),
            System.getProperty("spring.datasource.password", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password"))
        );
    }
}
