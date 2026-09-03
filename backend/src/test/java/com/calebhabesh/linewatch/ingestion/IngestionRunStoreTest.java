package com.calebhabesh.linewatch.ingestion;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
}
