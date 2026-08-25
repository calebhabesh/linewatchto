package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class TtcScheduledServiceOpeningRepositoryTest {
    @Test
    void scopesTheFirstDepartureToTheServiceDateLineAndAffectedStations() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        AtomicReference<String> capturedSql = new AtomicReference<>();
        AtomicReference<SqlParameterSource> capturedParams = new AtomicReference<>();
        when(jdbc.query(
            anyString(),
            any(SqlParameterSource.class),
            org.mockito.ArgumentMatchers.<RowMapper<Integer>>any()
        )).thenAnswer(invocation -> {
            capturedSql.set(invocation.getArgument(0));
            capturedParams.set(invocation.getArgument(1));
            return List.of(8 * 3600 + 7 * 60);
        });
        TtcScheduledServiceOpeningRepository repository =
            new TtcScheduledServiceOpeningRepository(jdbc);

        Optional<Integer> result = repository.firstDepartureSeconds(
            "line-2",
            LocalDate.parse("2026-08-23"),
            List.of("st-george", "chester", "st-george")
        );

        assertThat(result).contains(8 * 3600 + 7 * 60);
        assertThat(capturedSql.get())
            .contains("schedule_import.service_start <= :serviceDate")
            .contains("schedule_import.service_end >= :serviceDate")
            .contains("service.start_date <= :serviceDate")
            .contains("service.end_date >= :serviceDate")
            .contains("exception_type = 2")
            .contains("exception_type = 1")
            .contains("route.line_id = :lineId")
            .contains("mapping.station_id in (:stationIds)")
            .contains("min(stop_time.departure_seconds)");
        assertThat(capturedParams.get().getValue("lineId")).isEqualTo("line-2");
        assertThat(capturedParams.get().getValue("serviceDate"))
            .isEqualTo(LocalDate.parse("2026-08-23"));
        assertThat(capturedParams.get().getValue("stationIds"))
            .isEqualTo(List.of("st-george", "chester"));
    }
}
