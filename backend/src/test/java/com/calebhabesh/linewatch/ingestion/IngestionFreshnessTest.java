package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class IngestionFreshnessTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );

    private final IngestionRunStore store = mock(IngestionRunStore.class);
    private final AlertIngestionProperties properties = new AlertIngestionProperties();
    private IngestionFreshness freshness;

    @BeforeEach
    void setUp() {
        properties.setMaxDashboardAge(Duration.ofMinutes(10));
        freshness = new IngestionFreshness(store, properties, CLOCK);
    }

    @Test
    void treatsRecentSuccessfulPollAsFresh() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:55:00Z");
        Optional<IngestionRunSnapshot> run = Optional.of(run("success", completedAt));

        assertThat(freshness.isFresh(run)).isTrue();
    }

    @Test
    void treatsStaleSuccessfulPollAsNotFresh() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:49:59Z");
        Optional<IngestionRunSnapshot> run = Optional.of(run("success", completedAt));

        assertThat(freshness.isFresh(run)).isFalse();
    }

    @Test
    void treatsFailedOrMissingRunsAsNotFresh() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:59:00Z");

        assertThat(freshness.isFresh(Optional.of(run("failed", completedAt)))).isFalse();
        assertThat(freshness.isFresh(Optional.empty())).isFalse();
    }

    @Test
    void readsLatestRunWhenCheckingDashboardFreshness() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:55:00Z");
        when(store.findLatest()).thenReturn(Optional.of(run("success", completedAt)));

        assertThat(freshness.isDashboardFresh()).isTrue();
    }

    private IngestionRunSnapshot run(String status, OffsetDateTime completedAt) {
        return new IngestionRunSnapshot(
            1L,
            status,
            completedAt.minusSeconds(3),
            completedAt,
            10,
            10,
            8,
            1,
            completedAt.minusMinutes(1),
            null
        );
    }
}
