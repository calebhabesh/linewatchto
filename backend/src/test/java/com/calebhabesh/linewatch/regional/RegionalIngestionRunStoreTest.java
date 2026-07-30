package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class RegionalIngestionRunStoreTest {
    @Test
    void recordsCompletenessCountsAndSourceTimestampsForEveryKnownCollection() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        RegionalIngestionRunStore store = new RegionalIngestionRunStore(jdbc);
        OffsetDateTime updatedAt = OffsetDateTime.parse("2026-07-30T15:59:00Z");
        MetrolinxFeed feed = new MetrolinxFeed(
            updatedAt,
            List.of(
                new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, "EX-1", "{}"),
                new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, "EX-2", "{}")
            ),
            Map.of(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, true),
            Map.of(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, updatedAt)
        );

        store.replaceSourceStatuses(42, feed);

        ArgumentCaptor<SqlParameterSource[]> rows = ArgumentCaptor.forClass(SqlParameterSource[].class);
        verify(jdbc).batchUpdate(contains("insert into metrolinx_ingestion_source_runs"), rows.capture());
        assertThat(rows.getValue()).hasSize(MetrolinxSourceSystem.descriptors().size());
        SqlParameterSource exceptions = List.of(rows.getValue()).stream()
            .filter(row -> MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS.equals(row.getValue("sourceSystem")))
            .findFirst()
            .orElseThrow();
        assertThat(exceptions.getValue("complete")).isEqualTo(true);
        assertThat(exceptions.getValue("required")).isEqualTo(false);
        assertThat(exceptions.getValue("recordsFetched")).isEqualTo(2L);
        assertThat(exceptions.getValue("sourceUpdatedAt")).isEqualTo(updatedAt);
    }
}
