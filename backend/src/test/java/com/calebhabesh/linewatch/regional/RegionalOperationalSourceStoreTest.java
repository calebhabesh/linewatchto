package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class RegionalOperationalSourceStoreTest {
    @Test
    void batchStagesIdentifiedOperationalRecordsWithoutChangingTheirPayloads() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        RegionalOperationalSourceStore store = new RegionalOperationalSourceStore(jdbc);
        OffsetDateTime now = OffsetDateTime.parse("2026-07-30T16:00:00Z");
        List<MetrolinxFetchedRecord> records = List.of(
            new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, "EX-1", "{\"TripNumber\":\"EX-1\"}"),
            new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, "TU-1", "{\"id\":\"TU-1\"}")
        );

        store.upsertAll(records, now);

        ArgumentCaptor<SqlParameterSource[]> rows = ArgumentCaptor.forClass(SqlParameterSource[].class);
        verify(jdbc).batchUpdate(contains("insert into metrolinx_operational_source_records"), rows.capture());
        assertThat(rows.getValue()).hasSize(2);
        assertThat(rows.getValue()[0].getValue("sourceSystem")).isEqualTo(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS);
        assertThat(rows.getValue()[0].getValue("payload")).isEqualTo("{\"TripNumber\":\"EX-1\"}");
        assertThat(rows.getValue()[1].getValue("sourceSystem")).isEqualTo(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES);
    }
}
