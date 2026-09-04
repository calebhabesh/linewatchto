package com.calebhabesh.linewatch.ingestion;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class IngestionRunStoreTest {
    @Test
    void lastGoodLookupSkipsRunningAndFailedAttempts() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        when(jdbc.query(any(String.class), any(RowMapper.class))).thenReturn(List.of());

        new IngestionRunStore(jdbc).findLatestSuccessful();

        verify(jdbc).query(
            contains("status = 'success' and completed_at is not null"),
            any(RowMapper.class)
        );
    }

    @Test
    void availabilityLookupUsesOnlyClassifiedTtcSourceFetches() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        when(jdbc.query(any(String.class), any(org.springframework.jdbc.core.namedparam.SqlParameterSource.class), any(RowMapper.class)))
            .thenReturn(List.of());

        OffsetDateTime from = OffsetDateTime.parse("2026-05-01T04:00:00Z");
        OffsetDateTime to = OffsetDateTime.parse("2026-06-01T12:00:00Z");
        new IngestionRunStore(jdbc).sourceFetchDailyCounts(from, to);

        verify(jdbc).query(
            contains("source_fetch_status is not null"),
            any(org.springframework.jdbc.core.namedparam.SqlParameterSource.class),
            any(RowMapper.class)
        );
    }
}
