package com.calebhabesh.linewatch.maintenance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class MaintenanceCleanupStoreTest {
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final MaintenanceCleanupStore store = new MaintenanceCleanupStore(jdbc);

    @Test
    void deletesInactiveGtfsImportsExceptConfiguredBackups() {
        when(jdbc.update(anyString(), any(SqlParameterSource.class))).thenReturn(3);

        int deleted = store.deleteOldInactiveGtfsImports(1);

        CapturedUpdate update = captureUpdate();
        assertThat(deleted).isEqualTo(3);
        assertThat(update.sql())
            .contains("delete from gtfs_schedule_imports")
            .contains("active = false")
            .contains("service_end desc nulls last")
            .contains("limit :retainInactiveImports");
        assertThat(update.params().getValue("retainInactiveImports")).isEqualTo(1);
    }

    @Test
    void deletesOldIngestionRunsButKeepsLatestRunPerType() {
        when(jdbc.update(anyString(), any(SqlParameterSource.class))).thenReturn(8);
        OffsetDateTime cutoff = OffsetDateTime.parse("2026-04-09T12:00:00Z");

        int deleted = store.deleteOldIngestionRuns(cutoff);

        CapturedUpdate update = captureUpdate();
        assertThat(deleted).isEqualTo(8);
        assertThat(update.sql())
            .contains("delete from ingestion_runs")
            .contains("started_at < :cutoff")
            .contains("latest_runs");
        assertThat(update.params().getValue("cutoff")).isEqualTo(cutoff);
    }

    @Test
    void deletesInactiveAlertSourceRecordsOlderThanCutoff() {
        when(jdbc.update(anyString(), any(SqlParameterSource.class))).thenReturn(5);
        OffsetDateTime cutoff = OffsetDateTime.parse("2026-04-09T12:00:00Z");

        int deleted = store.deleteOldInactiveAlertSourceRecords(cutoff);

        CapturedUpdate update = captureUpdate();
        assertThat(deleted).isEqualTo(5);
        assertThat(update.sql())
            .contains("delete from ttc_alert_source_records")
            .contains("active = false")
            .contains("last_seen_at < :cutoff");
        assertThat(update.params().getValue("cutoff")).isEqualTo(cutoff);
    }

    private CapturedUpdate captureUpdate() {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<SqlParameterSource> params =
            ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc).update(sql.capture(), params.capture());
        return new CapturedUpdate(sql.getValue(), (MapSqlParameterSource) params.getValue());
    }

    private record CapturedUpdate(String sql, MapSqlParameterSource params) {}
}
