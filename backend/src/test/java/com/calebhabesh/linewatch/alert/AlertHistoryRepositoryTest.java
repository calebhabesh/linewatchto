package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class AlertHistoryRepositoryTest {
    @Test
    void ttcWindowSelectsIncidentsBeforeLoadingTheirCompleteLifecycle() {
        String sql = captureSql(repository -> repository.findLifecycleRows(
            OffsetDateTime.parse("2026-08-25T00:00:00-04:00"),
            OffsetDateTime.parse("2026-08-25T12:00:00-04:00"),
            5_000
        ));

        assertCompleteLifecycleQuery(sql, "from snapshots s");
    }

    @Test
    void regionalWindowSelectsIncidentsBeforeLoadingTheirCompleteLifecycle() {
        String sql = captureSql(repository -> repository.findRegionalLifecycleRows(
            OffsetDateTime.parse("2026-08-25T00:00:00-04:00"),
            OffsetDateTime.parse("2026-08-25T12:00:00-04:00"),
            5_000
        ));

        assertCompleteLifecycleQuery(sql, "from regional_alert_snapshots s");
    }

    private String captureSql(java.util.function.Consumer<AlertHistoryRepository> query) {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        AtomicReference<String> capturedSql = new AtomicReference<>();
        when(jdbc.query(
            anyString(),
            any(SqlParameterSource.class),
            org.mockito.ArgumentMatchers.<RowMapper<AlertHistoryRepository.AlertHistoryRow>>any()
        )).thenAnswer(invocation -> {
            capturedSql.set(invocation.getArgument(0));
            return List.of();
        });

        query.accept(new AlertHistoryRepository(jdbc));
        return capturedSql.get();
    }

    private void assertCompleteLifecycleQuery(String sql, String sourceTable) {
        assertThat(sql)
            .contains(sourceTable)
            .contains("window_rows as")
            .containsOnlyOnce("snapshot_time >= :since")
            .contains("matching_alerts as")
            .contains("join matching_alerts m on m.alert_id = c.alert_id")
            .contains("where c.snapshot_time < :until")
            .doesNotContain("where c.snapshot_time >= :since");
    }
}
