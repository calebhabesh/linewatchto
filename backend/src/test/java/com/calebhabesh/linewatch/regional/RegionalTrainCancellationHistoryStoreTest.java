package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class RegionalTrainCancellationHistoryStoreTest {
    @Test
    void recordsObservationCoverageAndDeduplicatedCancellationIdentity() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        RegionalTrainCancellationHistoryStore store = new RegionalTrainCancellationHistoryStore(
            jdbc,
            JsonMapper.builder().findAndAddModules().build()
        );
        OffsetDateTime observedAt = OffsetDateTime.parse("2026-07-31T16:00:00Z");
        RegionalTripChangeResponses.TripChange cancellation =
            new RegionalTripChangeResponses.TripChange(
                "regional-trip-change-2026-07-31-MI100-cancellation",
                "cancellation", "MI100", "681", "regional-mi", "MI", "Milton", "Union",
                LocalDate.parse("2026-07-31"), OffsetDateTime.parse("2026-07-31T15:00:00-04:00"),
                observedAt, true, "Train cancelled", "", "",
                List.of(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES),
                List.of(new RegionalTripChangeResponses.AffectedStop(
                    "milton", "Milton GO", "cancellation",
                    OffsetDateTime.parse("2026-07-31T15:00:00-04:00"), "1"
                ))
            );

        store.record(List.of(cancellation), observedAt);

        verify(jdbc).update(
            contains("insert into regional_train_cancellation_tracking"),
            org.mockito.ArgumentMatchers.any(SqlParameterSource.class)
        );
        ArgumentCaptor<SqlParameterSource[]> rows = ArgumentCaptor.forClass(SqlParameterSource[].class);
        verify(jdbc).batchUpdate(contains("on conflict (service_date, line_id, trip_number)"), rows.capture());
        assertThat(rows.getValue()).singleElement().satisfies(row -> {
            assertThat(row.getValue("tripNumber")).isEqualTo("681");
            assertThat(row.getValue("lineId")).isEqualTo("regional-mi");
            assertThat(row.getValue("scheduleMatched")).isEqualTo(true);
            assertThat(row.getValue("stationIds")).isEqualTo("[\"milton\"]");
        });
    }
}
